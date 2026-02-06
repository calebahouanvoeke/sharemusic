// server/src/core/ElectionService.js
const EventEmitter = require('events');
const logger = require('../utils/logger');
const config = require('../utils/config');
const os = require('os');
const crypto = require('crypto');

class ElectionService extends EventEmitter {
  constructor() {
    super();
    this.deviceId = this.generateDeviceId();
    this.credentials = null;
    this.participants = new Map();
    this.isHost = false;
    this.electionRound = 0;
    this.joinTimestamp = Date.now();
    this.lastPingTime = null;
    this.heartbeatInterval = null;
    this.broadcastInterval = null;
  }

  /**
   * Générer un identifiant unique pour cet appareil
   */
  generateDeviceId() {
    return 'device_' + crypto.randomUUID();
  }

  /**
   * Récupérer le niveau de batterie
   * Utilise systeminformation sur les systèmes qui le supportent
   * Sinon retourne une valeur par défaut
   */
  async getBatteryLevel() {
    try {
      const si = require('systeminformation');
      const battery = await si.battery();
      return battery.percent || 75; // Valeur par défaut si non disponible
    } catch (err) {
      logger.warn('ELECTION', 'Impossible de récupérer le niveau de batterie', err);
      return 75; // Valeur par défaut
    }
  }

  /**
   * Vérifier si l'appareil est branché sur secteur
   */
  async isPlugged() {
    try {
      const si = require('systeminformation');
      const battery = await si.battery();
      return battery.isCharging || false;
    } catch (err) {
      logger.warn('ELECTION', 'Impossible de vérifier si branché', err);
      return false;
    }
  }

  /**
   * Récupérer la RAM totale en GB
   */
  getRamGB() {
    try {
      const totalRam = os.totalmem() / (1024 ** 3); // Convertir en GB
      return parseFloat(totalRam.toFixed(2));
    } catch (err) {
      logger.warn('ELECTION', 'Impossible de récupérer la RAM', err);
      return 4; // Valeur par défaut
    }
  }

  /**
   * Construire les credentials pour l'élection
   */
  async buildCredentials() {
    const batteryLevel = await this.getBatteryLevel();
    const plugged = await this.isPlugged();
    const ramGB = this.getRamGB();

    this.credentials = {
      deviceId: this.deviceId,
      batteryLevel: batteryLevel,
      isPlugged: plugged,
      joinTimestamp: this.joinTimestamp,
      ramGB: ramGB,
      electionRound: this.electionRound
    };

    logger.debug('ELECTION', 'Credentials construits', this.credentials);
    return this.credentials;
  }

  /**
   * Calculer le hash normalisé d'un deviceId
   * Retourne un nombre entre 0 et 1
   */
  hashDeviceId(deviceId) {
    const hash = crypto.createHash('sha256').update(deviceId).digest('hex');
    const num = parseInt(hash.substring(0, 8), 16);
    return num / 0xFFFFFFFF;
  }

  /**
   * Calculer le score d'un ensemble de credentials
   */
  calculateScore(credentials) {
    const weights = config.election.weights;
    let score = 0;

    // Critère 1 : Batterie (critère dominant)
    if (credentials.isPlugged) {
      score += weights.battery.plugged;
    } else if (credentials.batteryLevel > 70) {
      score += weights.battery.high;
    } else if (credentials.batteryLevel >= 50) {
      score += weights.battery.medium;
    } else if (credentials.batteryLevel >= 30) {
      score += weights.battery.low;
    } else {
      score += weights.battery.critical;
    }

    // Critère 2 : Ancienneté (secondes dans le réseau)
    const ageSeconds = (Date.now() - credentials.joinTimestamp) / 1000;
    score += Math.min(ageSeconds, weights.seniority);

    // Critère 3 : RAM
    score += Math.min(credentials.ramGB * 10, weights.ram);

    // Critère 4 : Hash du deviceId (départage final)
    score += this.hashDeviceId(credentials.deviceId);

    return score;
  }

  /**
   * Démarrer le processus d'élection
   */
  async startElection() {
    logger.info('ELECTION', `Démarrage de l'élection (round ${this.electionRound})`);
    
    this.electionRound++;
    this.participants.clear();

    // Phase 1 : Construire mes credentials
    await this.buildCredentials();

    // Phase 2 : Broadcaster pendant 3 secondes
    await this.broadcastCredentials();

    // Phase 3 : Calculer le gagnant
    setTimeout(() => {
      this.electCoordinator();
    }, config.election.phases.broadcast + config.election.phases.calculation);
  }

  /**
   * Broadcaster les credentials pendant 3 secondes
   */
  async broadcastCredentials() {
    return new Promise((resolve) => {
      let count = 0;
      const maxBroadcasts = 6; // 3 secondes / 500ms

      this.broadcastInterval = setInterval(() => {
        this.emit('broadcastCredentials', this.credentials);
        count++;

        if (count >= maxBroadcasts) {
          clearInterval(this.broadcastInterval);
          resolve();
        }
      }, 500);
    });
  }

  /**
   * Recevoir les credentials d'un autre participant
   */
  onCredentialsReceived(credentials) {
    // Ignorer les credentials de rounds antérieurs
    if (credentials.electionRound < this.electionRound) {
      logger.debug('ELECTION', `Credentials ignorés (ancien round): ${credentials.deviceId}`);
      return;
    }

    // Si c'est un round plus récent, on redémarre notre élection
    if (credentials.electionRound > this.electionRound) {
      logger.warn('ELECTION', `Round plus récent détecté, redémarrage élection`);
      this.electionRound = credentials.electionRound - 1;
      this.startElection();
      return;
    }

    this.participants.set(credentials.deviceId, credentials);
    logger.debug('ELECTION', `Credentials reçus de ${credentials.deviceId}`);
  }

  /**
   * Élire le coordinateur en comparant tous les scores
   */
  electCoordinator() {
    logger.info('ELECTION', 'Calcul du coordinateur...');

    // Ajouter mes propres credentials
    this.participants.set(this.credentials.deviceId, this.credentials);

    let maxScore = -1;
    let winner = null;

    // Calculer les scores de tous les participants
    this.participants.forEach((cred, deviceId) => {
      const score = this.calculateScore(cred);
      logger.info('ELECTION', `Score ${deviceId}: ${score.toFixed(2)}`);

      if (score > maxScore) {
        maxScore = score;
        winner = cred;
      }
    });

    if (!winner) {
      logger.error('ELECTION', 'Aucun gagnant trouvé, auto-élection');
      this.emit('elected', true);
      this.isHost = true;
      return;
    }

    // Vérifier si je suis le gagnant
    if (winner.deviceId === this.credentials.deviceId) {
      logger.info('ELECTION', `🎯 JE SUIS ÉLU COORDINATEUR (score: ${maxScore.toFixed(2)})`);
      this.isHost = true;
      this.emit('elected', true);
    } else {
      logger.info('ELECTION', `Coordinateur élu: ${winner.deviceId} (score: ${maxScore.toFixed(2)})`);
      this.isHost = false;
      this.emit('elected', false);
      
      // Démarrer la surveillance du Host
      this.startHeartbeatMonitoring();
    }
  }

  /**
   * Recevoir un ping du Host
   */
  onPingReceived() {
    this.lastPingTime = Date.now();
    logger.debug('ELECTION', 'Ping reçu du Host');
  }

  /**
   * Surveiller le Host (heartbeat)
   */
  startHeartbeatMonitoring() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.heartbeatInterval = setInterval(() => {
      if (!this.isHost && this.lastPingTime) {
        const elapsed = Date.now() - this.lastPingTime;

        if (elapsed > config.network.heartbeatTimeout) {
          logger.warn('ELECTION', `Host timeout détecté (${elapsed}ms sans ping)`);
          this.emit('hostLost');
          this.restartElection();
        }
      }
    }, config.network.pingInterval);

    logger.info('ELECTION', 'Surveillance du Host démarrée');
  }

  /**
   * Redémarrer une élection
   */
  restartElection() {
    logger.info('ELECTION', 'Redémarrage de l\'élection');
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
      this.broadcastInterval = null;
    }

    this.participants.clear();
    this.lastPingTime = null;

    // Attendre 1 seconde avant de redémarrer
    setTimeout(() => {
      this.startElection();
    }, 1000);
  }

  /**
   * Arrêter tous les processus d'élection
   */
  stop() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.broadcastInterval) {
      clearInterval(this.broadcastInterval);
    }
    logger.info('ELECTION', 'Service d\'élection arrêté');
  }

  /**
   * Obtenir le deviceId
   */
  getDeviceId() {
    return this.deviceId;
  }

  /**
   * Obtenir les credentials actuels
   */
  getCredentials() {
    return this.credentials;
  }
}

module.exports = ElectionService;