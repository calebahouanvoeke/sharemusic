// server/src/core/WebSocketServer.js
const WebSocket = require('ws');
const EventEmitter = require('events');
const logger = require('../utils/logger');
const config = require('../utils/config');

class WebSocketServer extends EventEmitter {
  constructor(port) {
    super();
    this.port = port || config.server.port;
    this.wss = null;
    this.clients = new Map(); // deviceId -> WebSocket
    this.pingInterval = null;
  }

  /**
   * Démarrer le serveur WebSocket
   */
  start() {
    try {
      this.wss = new WebSocket.Server({ port: this.port });

      this.wss.on('connection', (ws, req) => {
        const clientIp = req.socket.remoteAddress;
        logger.info('WS', `Nouvelle connexion depuis ${clientIp}`);

        // Gérer les messages entrants
        ws.on('message', (data) => {
          this.handleMessage(ws, data);
        });

        // Gérer les déconnexions
        ws.on('close', () => {
          this.handleDisconnection(ws);
        });

        // Gérer les erreurs
        ws.on('error', (error) => {
          logger.error('WS', 'Erreur WebSocket', error);
        });

        // Gérer les pongs (réponse au ping WebSocket natif)
        ws.on('pong', () => {
          ws.isAlive = true;
        });
      });

      this.wss.on('error', (error) => {
        logger.error('WS', 'Erreur serveur WebSocket', error);
      });

      logger.info('WS', `Serveur WebSocket démarré sur port ${this.port}`);
    } catch (err) {
      logger.error('WS', 'Impossible de démarrer le serveur', err);
      throw err;
    }
  }

  /**
   * Gérer les messages entrants
   */
  handleMessage(ws, data) {
    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case 'AUTH':
          this.handleAuth(ws, message);
          break;

        case 'CATALOG':
          this.handleCatalog(ws, message);
          break;

        case 'PONG':
          this.handlePong(ws, message);
          break;

        case 'DISCONNECT':
          this.handleDisconnectRequest(ws, message);
          break;

        case 'ELECTION_CREDENTIALS':
          this.handleElectionCredentials(ws, message);
          break;

        default:
          logger.warn('WS', `Type de message inconnu: ${message.type}`);
      }
    } catch (err) {
      logger.error('WS', 'Erreur lors du parsing du message', err);
      this.sendError(ws, 'MESSAGE_PARSE_ERROR', 'Format de message invalide');
    }
  }

  /**
   * Gérer l'authentification
   */
  handleAuth(ws, message) {
    if (!message.deviceId || !message.userName) {
      this.sendError(ws, 'AUTH_ERROR', 'deviceId et userName requis');
      return;
    }

    // Stocker le client
    this.clients.set(message.deviceId, ws);
    ws.deviceId = message.deviceId;
    ws.userName = message.userName;
    ws.isAlive = true;

    logger.info('WS', `Client authentifié: ${message.deviceId} (${message.userName})`);

    // Envoyer une confirmation
    this.send(ws, {
      type: 'AUTH_SUCCESS',
      message: 'Authentification réussie',
      deviceId: message.deviceId
    });

    // Émettre l'événement d'authentification
    this.emit('clientAuthenticated', message.deviceId, message.userName);
  }

  /**
   * Gérer la réception d'un catalogue
   */
  handleCatalog(ws, message) {
    if (!ws.deviceId) {
      this.sendError(ws, 'NOT_AUTHENTICATED', 'Authentification requise');
      return;
    }

    if (!message.data) {
      this.sendError(ws, 'CATALOG_ERROR', 'Données du catalogue manquantes');
      return;
    }

    logger.info('WS', `Catalogue reçu de ${ws.deviceId}`);

    // Émettre l'événement avec le deviceId et les données XML
    this.emit('catalog', ws.deviceId, message.data);
  }

  /**
   * Gérer la réception d'un PONG
   */
  handlePong(ws, message) {
    if (ws.deviceId) {
      logger.debug('WS', `PONG reçu de ${ws.deviceId}`);
      this.emit('pong', ws.deviceId);
    }
  }

  /**
   * Gérer une demande de déconnexion
   */
  handleDisconnectRequest(ws, message) {
    logger.info('WS', `Déconnexion demandée par ${ws.deviceId}`);
    ws.close();
  }

  /**
   * Gérer les credentials d'élection
   */
  handleElectionCredentials(ws, message) {
    if (!message.credentials) {
      return;
    }

    logger.debug('WS', `Credentials d'élection reçus de ${message.credentials.deviceId}`);
    this.emit('electionCredentials', message.credentials);
  }

  /**
   * Gérer les déconnexions
   */
  handleDisconnection(ws) {
    if (ws.deviceId) {
      logger.info('WS', `Client déconnecté: ${ws.deviceId}`);
      this.clients.delete(ws.deviceId);
      this.emit('clientDisconnected', ws.deviceId);
    }
  }

  /**
   * Envoyer un message à un client spécifique
   */
  send(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(message));
        return true;
      } catch (err) {
        logger.error('WS', 'Erreur lors de l\'envoi du message', err);
        return false;
      }
    }
    return false;
  }

  /**
   * Envoyer une erreur à un client
   */
  sendError(ws, code, message) {
    this.send(ws, {
      type: 'ERROR',
      code: code,
      message: message
    });
  }

  /**
   * Broadcaster un message à tous les clients
   */
  broadcast(message) {
    const data = JSON.stringify(message);
    let sentCount = 0;

    this.clients.forEach((ws, deviceId) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(data);
          sentCount++;
        } catch (err) {
          logger.error('WS', `Erreur broadcast vers ${deviceId}`, err);
        }
      }
    });

    logger.debug('WS', `Message broadcasté à ${sentCount} client(s)`);
    return sentCount;
  }

  /**
   * Broadcaster sauf à un client spécifique
   */
  broadcastExcept(message, excludeDeviceId) {
    const data = JSON.stringify(message);
    let sentCount = 0;

    this.clients.forEach((ws, deviceId) => {
      if (deviceId !== excludeDeviceId && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(data);
          sentCount++;
        } catch (err) {
          logger.error('WS', `Erreur broadcast vers ${deviceId}`, err);
        }
      }
    });

    logger.debug('WS', `Message broadcasté à ${sentCount} client(s) (exclusion: ${excludeDeviceId})`);
    return sentCount;
  }

  /**
   * Démarrer l'envoi de pings périodiques
   */
  startPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }

    // Utiliser le ping natif de WebSocket
    this.pingInterval = setInterval(() => {
      this.clients.forEach((ws, deviceId) => {
        if (!ws.isAlive) {
          logger.warn('WS', `Client zombie détecté: ${deviceId}`);
          ws.terminate();
          this.clients.delete(deviceId);
          this.emit('clientDisconnected', deviceId);
          return;
        }

        ws.isAlive = false;
        ws.ping();
      });

      // Aussi envoyer un PING applicatif
      this.broadcast({
        type: 'PING',
        timestamp: Date.now()
      });
    }, config.network.pingInterval);

    logger.info('WS', `Pings démarrés (intervalle: ${config.network.pingInterval}ms)`);
  }

  /**
   * Arrêter les pings
   */
  stopPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
      logger.info('WS', 'Pings arrêtés');
    }
  }

  /**
   * Obtenir le nombre de clients connectés
   */
  getClientCount() {
    return this.clients.size;
  }

  /**
   * Obtenir la liste des deviceIds connectés
   */
  getConnectedDeviceIds() {
    return Array.from(this.clients.keys());
  }

  /**
   * Vérifier si un client est connecté
   */
  isClientConnected(deviceId) {
    return this.clients.has(deviceId);
  }

  /**
   * Arrêter le serveur
   */
  stop() {
    this.stopPingInterval();

    if (this.wss) {
      // Fermer toutes les connexions
      this.clients.forEach((ws, deviceId) => {
        ws.close();
      });

      this.clients.clear();

      // Fermer le serveur
      this.wss.close(() => {
        logger.info('WS', 'Serveur WebSocket arrêté');
      });

      this.wss = null;
    }
  }
}

module.exports = WebSocketServer;