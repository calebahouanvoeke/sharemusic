// server/server.js
require('dotenv').config();
const ElectionService = require('./src/core/ElectionService');
const WebSocketServer = require('./src/core/WebSocketServer');
const MdnsService = require('./src/core/MdnsService');
const XmlParser = require('./src/data/XmlParser');
const XmlFusion = require('./src/data/XmlFusion');
const StreamingService = require('./src/streaming/StreamingService');
const config = require('./src/utils/config');
const logger = require('./src/utils/logger');
const FileUploadService = require('./src/services/FileUploadService');
const express = require('express');
const cors = require('cors');

class ShareMusicServer {
  constructor() {
    this.electionService = new ElectionService();
    this.wsServer = null;
    this.mdnsService = new MdnsService();
    this.xmlParser = new XmlParser(config.paths.dtdPath);
    this.xmlFusion = new XmlFusion();
    this.streamingService = new StreamingService();
    this.isHost = false;
    this.fileUploadService = new FileUploadService();
    this.userName = process.env.USER_NAME || 'User_' + Math.random().toString(36).substr(2, 5);
    this.app = express();
    this.httpServer = null;
    
    // ✅ NOUVEAU : Stocker les infos du Host découvert
    this.currentHostInfo = null;
    this.hostDiscoveryInProgress = false;

    this.setupEventHandlers();
  }

  /**
   * ✅ NOUVEAU : Configurer le serveur HTTP avec la route /api/host-info
   */
  setupHttpServer() {
    // Middlewares
    this.app.use(cors()); // ✅ Activer CORS pour les requêtes cross-origin
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // ✅ ROUTE CRITIQUE : Informations sur le Host
    this.app.get('/api/host-info', (req, res) => {
      if (this.isHost) {
        // Je suis le Host
        logger.debug('HTTP', 'Requête host-info: JE SUIS LE HOST');
        res.json({
          isHost: true,
          hostIp: 'localhost',
          wsPort: config.server.port,
          streamingPort: config.streaming?.port || 3000,
          uploadPort: config.server.httpPort || 3001
        });
      } else if (this.currentHostInfo) {
        // Je connais le Host
        logger.debug('HTTP', `Requête host-info: HOST est ${this.currentHostInfo.host}:${this.currentHostInfo.port}`);
        res.json({
          isHost: false,
          hostIp: this.currentHostInfo.host,
          wsPort: this.currentHostInfo.port,
          streamingPort: config.streaming?.port || 3000,
          uploadPort: config.server.httpPort || 3001
        });
      } else if (this.hostDiscoveryInProgress) {
        // Découverte en cours
        logger.debug('HTTP', 'Requête host-info: DÉCOUVERTE EN COURS');
        res.status(503).json({ 
          error: 'DISCOVERY_IN_PROGRESS',
          message: 'Découverte du réseau en cours, veuillez patienter...'
        });
      } else {
        // Pas encore d'info (ne devrait pas arriver)
        logger.warn('HTTP', 'Requête host-info: AUCUNE INFO DISPONIBLE');
        res.status(503).json({ 
          error: 'NO_HOST_INFO',
          message: 'Aucune information sur le Host disponible'
        });
      }
    });

    // Routes du FileUploadService
    this.app.use('/api', this.fileUploadService.getRouter());

    // Route de santé
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        service: 'ShareMusic Server',
        isHost: this.isHost,
        userName: this.userName
      });
    });

    // Démarrer le serveur HTTP
    const httpPort = config.server.httpPort || 3001;
    this.httpServer = this.app.listen(httpPort, () => {
      logger.info('SERVER', `✓ Serveur HTTP démarré sur le port ${httpPort}`);
    });

    this.httpServer.on('error', (err) => {
      logger.error('SERVER', 'Erreur serveur HTTP', err);
    });
  }

  setupEventHandlers() {
    this.electionService.on('elected', (isHost) => {
      if (isHost) {
        this.becomeHost();
      } else {
        logger.info('SERVER', 'Je ne suis pas élu Host, je reste en mode Client');
      }
    });

    this.electionService.on('hostLost', () => {
      logger.warn('SERVER', '⚠️  Host perdu, redémarrage élection...');
      this.handleHostLoss();
    });
  }

  async start() {
    logger.info('SERVER', '╔════════════════════════════════════════╗');
    logger.info('SERVER', '║     DÉMARRAGE SHAREMUSIC SERVER        ║');
    logger.info('SERVER', '╚════════════════════════════════════════╝');
    logger.info('SERVER', '');
    logger.info('SERVER', `👤 Utilisateur: ${this.userName}`);
    logger.info('SERVER', `🆔 DeviceId: ${this.electionService.getDeviceId()}`);
    logger.info('SERVER', '');

    try {
      // ✅ Démarrer le serveur HTTP D'ABORD (pour /api/host-info)
      this.setupHttpServer();

      // Démarrer le service de streaming
      await this.streamingService.start();

      // Marquer que la découverte est en cours
      this.hostDiscoveryInProgress = true;

      logger.info('SERVER', '🔍 Recherche de réseaux ShareMusic...');
      const servicesFound = await this.discoverNetworks();

      // Découverte terminée
      this.hostDiscoveryInProgress = false;

      if (servicesFound.length > 0) {
        logger.info('SERVER', `✓ ${servicesFound.length} réseau(x) ShareMusic trouvé(s)`);
        logger.info('SERVER', `→ Connexion au Host: ${servicesFound[0].name}`);
        this.connectToHost(servicesFound[0]);
      } else {
        logger.info('SERVER', '→ Aucun réseau trouvé');
        logger.info('SERVER', '🗳️  Démarrage de l\'élection...');
        await this.electionService.startElection();
      }

    } catch (err) {
      logger.error('SERVER', '❌ Erreur fatale au démarrage', err);
      process.exit(1);
    }
  }

  async discoverNetworks() {
    return new Promise((resolve) => {
      const discovered = [];

      this.mdnsService.discover((service) => {
        logger.info('MDNS', `📡 Service trouvé: ${service.name} (${service.host}:${service.port})`);
        discovered.push(service);
        
        // ✅ Stocker le premier Host découvert
        if (discovered.length === 1) {
          this.currentHostInfo = service;
          logger.debug('SERVER', `Host info stockée: ${service.host}:${service.port}`);
        }
      });

      setTimeout(() => {
        this.mdnsService.stopDiscovery();
        resolve(discovered);
      }, config.network.electionTimeout);
    });
  }

  becomeHost() {
    logger.info('SERVER', '');
    logger.info('SERVER', '╔════════════════════════════════════════╗');
    logger.info('SERVER', '║   🎯  JE DEVIENS HOST (COORDINATEUR)   ║');
    logger.info('SERVER', '╚════════════════════════════════════════╝');
    logger.info('SERVER', '');
    
    this.isHost = true;
    this.currentHostInfo = null; // Je suis le Host, pas besoin de stocker

    try {
      // Démarrer le serveur WebSocket
      this.wsServer = new WebSocketServer(config.server.port);
      this.wsServer.start();

      // Lier le catalogue au service de streaming
      this.streamingService.setCatalogRef(this.xmlFusion);

      // Gérer les événements WebSocket
      this.wsServer.on('catalog', (deviceId, catalogXml) => {
        this.handleClientCatalog(deviceId, catalogXml);
      });

      this.wsServer.on('clientDisconnected', (deviceId) => {
        this.handleClientDisconnection(deviceId);
      });

      // Démarrer les pings périodiques
      this.wsServer.startPingInterval();

      // Annoncer le service via mDNS
      this.mdnsService.advertise(this.userName);

      // Définir mon deviceId comme Host dans le catalogue
      const myDeviceId = this.electionService.getDeviceId();
      this.xmlFusion.setHostId(myDeviceId);

      logger.info('SERVER', '✓ Serveur WebSocket opérationnel');
      logger.info('SERVER', '✓ Service mDNS annoncé');
      logger.info('SERVER', '✓ Host prêt à accepter des connexions');
      logger.info('SERVER', '');

    } catch (err) {
      logger.error('SERVER', '❌ Erreur lors du passage en mode Host', err);
    }
  }

  connectToHost(serviceInfo) {
    logger.info('SERVER', '');
    logger.info('SERVER', '╔════════════════════════════════════════╗');
    logger.info('SERVER', '║     CONNEXION AU HOST EN COURS...      ║');
    logger.info('SERVER', '╚════════════════════════════════════════╝');
    logger.info('SERVER', '');
    logger.info('SERVER', `→ Host: ${serviceInfo.name}`);
    logger.info('SERVER', `→ Adresse: ${serviceInfo.host}:${serviceInfo.port}`);
    logger.info('SERVER', '');
    
    this.isHost = false;
    this.currentHostInfo = serviceInfo; // ✅ Stocker pour /api/host-info

    // ✅ TODO: Implémenter la connexion WebSocket Client
    // Pour l'instant, on reste en mode découverte
    logger.warn('SERVER', '⚠️  Module WebSocket Client à implémenter');
    logger.info('SERVER', '→ Le frontend peut maintenant récupérer l\'info via /api/host-info');
    logger.info('SERVER', '');
  }

  handleClientCatalog(deviceId, catalogXml) {
    logger.info('SERVER', `📥 Catalogue reçu de ${deviceId}`);

    try {
      // Parser le catalogue XML
      const catalog = this.xmlParser.parse(catalogXml);

      if (catalog.users && catalog.users.length > 0) {
        // Ajouter/mettre à jour l'utilisateur
        this.xmlFusion.addOrUpdateUser(catalog.users[0]);

        // Générer le catalogue global
        const globalXml = this.xmlFusion.toXmlString();

        // Broadcaster à tous les clients
        this.wsServer.broadcast({
          type: 'CATALOG_UPDATE',
          data: globalXml,
          totalUsers: this.xmlFusion.getUserCount()
        });

        logger.info('SERVER', `✓ Catalogue global mis à jour (${this.xmlFusion.getUserCount()} utilisateur(s), ${this.xmlFusion.getTotalTracks()} morceau(x))`);
      }

    } catch (err) {
      logger.error('SERVER', '❌ Erreur lors du traitement du catalogue', err);
    }
  }

  handleClientDisconnection(deviceId) {
    logger.info('SERVER', `👋 Client déconnecté: ${deviceId}`);

    // Retirer l'utilisateur du catalogue
    this.xmlFusion.removeUser(deviceId);

    // Broadcaster le catalogue mis à jour
    const globalXml = this.xmlFusion.toXmlString();
    this.wsServer.broadcast({
      type: 'CATALOG_UPDATE',
      data: globalXml,
      totalUsers: this.xmlFusion.getUserCount()
    });

    logger.info('SERVER', `✓ Catalogue mis à jour (${this.xmlFusion.getUserCount()} utilisateur(s) restant(s))`);
  }

  handleHostLoss() {
    logger.warn('SERVER', '');
    logger.warn('SERVER', '╔════════════════════════════════════════╗');
    logger.warn('SERVER', '║   ⚠️   HOST PERDU - NOUVELLE ÉLECTION  ║');
    logger.warn('SERVER', '╚════════════════════════════════════════╝');
    logger.warn('SERVER', '');

    if (!this.isHost) {
      this.currentHostInfo = null;
      this.hostDiscoveryInProgress = true;

      setTimeout(() => {
        this.electionService.startElection();
      }, 1000);
    }
  }

  stop() {
    logger.info('SERVER', '');
    logger.info('SERVER', '╔════════════════════════════════════════╗');
    logger.info('SERVER', '║        ARRÊT DU SERVEUR...             ║');
    logger.info('SERVER', '╚════════════════════════════════════════╝');
    logger.info('SERVER', '');

    if (this.wsServer) {
      this.wsServer.stop();
      logger.info('SERVER', '✓ Serveur WebSocket arrêté');
    }
    
    if (this.httpServer) {
      this.httpServer.close(() => {
        logger.info('SERVER', '✓ Serveur HTTP arrêté');
      });
    }
    
    this.mdnsService.stop();
    logger.info('SERVER', '✓ Service mDNS arrêté');
    
    this.streamingService.stop();
    logger.info('SERVER', '✓ Service de streaming arrêté');

    logger.info('SERVER', '');
    logger.info('SERVER', '👋 Serveur arrêté proprement');
    logger.info('SERVER', '');
  }
}

// ═══════════════════════════════════════════════════════════
// DÉMARRAGE DU SERVEUR
// ═══════════════════════════════════════════════════════════

const server = new ShareMusicServer();

server.start().catch(err => {
  logger.error('SERVER', '❌ Erreur fatale lors du démarrage', err);
  process.exit(1);
});

// Gestion des signaux d'arrêt
process.on('SIGINT', () => {
  console.log(); // Saut de ligne après ^C
  logger.info('SERVER', '🛑 Signal SIGINT reçu (Ctrl+C)');
  server.stop();
  setTimeout(() => process.exit(0), 1000);
});

process.on('SIGTERM', () => {
  logger.info('SERVER', '🛑 Signal SIGTERM reçu');
  server.stop();
  setTimeout(() => process.exit(0), 1000);
});

process.on('uncaughtException', (err) => {
  logger.error('SERVER', '💥 Exception non capturée', err);
  server.stop();
  setTimeout(() => process.exit(1), 1000);
});

module.exports = ShareMusicServer;