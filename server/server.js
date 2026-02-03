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

class ShareMusicServer {
  constructor() {
    this.electionService = new ElectionService();
    this.wsServer = null;
    this.mdnsService = new MdnsService();
    this.xmlParser = new XmlParser(config.paths.dtdPath);
    this.xmlFusion = new XmlFusion();
    this.streamingService = new StreamingService();
    this.isHost = false;
    this.userName = process.env.USER_NAME || 'User_' + Math.random().toString(36).substr(2, 5);
    
    this.setupEventHandlers();
  }

  setupEventHandlers() {
    this.electionService.on('elected', (isHost) => {
      if (isHost) {
        this.becomeHost();
      } else {
        logger.info('SERVER', 'Je ne suis pas élu Host');
      }
    });

    this.electionService.on('hostLost', () => {
      logger.warn('SERVER', 'Host perdu, redémarrage élection');
      this.handleHostLoss();
    });
  }

  async start() {
    logger.info('SERVER', '=== DÉMARRAGE SHAREMUSIC ===');
    logger.info('SERVER', `Utilisateur: ${this.userName}`);
    logger.info('SERVER', `DeviceId: ${this.electionService.getDeviceId()}`);
    
    try {
      await this.streamingService.start();
      
      logger.info('SERVER', 'Recherche de réseaux ShareMusic...');
      const servicesFound = await this.discoverNetworks();
      
      if (servicesFound.length > 0) {
        logger.info('SERVER', `\ réseau(x) trouvé(s)`);
        this.connectToHost(servicesFound[0]);
      } else {
        logger.info('SERVER', 'Aucun réseau trouvé, démarrage élection');
        await this.electionService.startElection();
      }
      
    } catch (err) {
      logger.error('SERVER', 'Erreur au démarrage', err);
      process.exit(1);
    }
  }

  async discoverNetworks() {
    return new Promise((resolve) => {
      const discovered = [];
      
      this.mdnsService.discover((service) => {
        logger.info('MDNS', `Service trouvé: ${service.name}`);
        discovered.push(service);
      });
      
      setTimeout(() => {
        this.mdnsService.stopDiscovery();
        resolve(discovered);
      }, config.network.electionTimeout);
    });
  }

  becomeHost() {
    logger.info('SERVER', '🎯 JE DEVIENS HOST');
    this.isHost = true;
    
    try {
      this.wsServer = new WebSocketServer(config.server.port);
      this.wsServer.start();
      
      this.wsServer.on('catalog', (deviceId, catalogXml) => {
        this.handleClientCatalog(deviceId, catalogXml);
      });
      
      this.wsServer.on('clientDisconnected', (deviceId) => {
        this.handleClientDisconnection(deviceId);
      });
      
      this.wsServer.startPingInterval();
      this.mdnsService.advertise(this.userName);
      
      const myDeviceId = this.electionService.getDeviceId();
      this.xmlFusion.globalCatalog.network_info.host_id = myDeviceId;
      
      logger.info('SERVER', '✓ Host opérationnel');
      
    } catch (err) {
      logger.error('SERVER', 'Erreur passage en mode Host', err);
    }
  }

  connectToHost(serviceInfo) {
    logger.info('SERVER', `Connexion au Host: ${serviceInfo.host}:${serviceInfo.port}`);
    this.isHost = false;
    
    // TODO MODULE 7: Implémenter la connexion WebSocket Client
    logger.warn('SERVER', 'WebSocket Client à implémenter par Module 7');
  }

  handleClientCatalog(deviceId, catalogXml) {
    logger.info('SERVER', `Catalogue reçu de ${deviceId}`);
    
    try {
      const catalog = this.xmlParser.parse(catalogXml);
      
      if (catalog.users && catalog.users.length > 0) {
        this.xmlFusion.addOrUpdateUser(catalog.users[0]);
        
        const globalXml = this.xmlFusion.toXmlString();
        
        this.wsServer.broadcast({
          type: 'CATALOG_UPDATE',
          data: globalXml,
          totalUsers: this.xmlFusion.globalCatalog.users.length
        });
        
        logger.info('SERVER', `Catalogue mis à jour (${this.xmlFusion.globalCatalog.users.length} users)`);
      }
      
    } catch (err) {
      logger.error('SERVER', 'Erreur traitement catalogue', err);
    }
  }

  handleClientDisconnection(deviceId) {
    logger.info('SERVER', `Client déconnecté: ${deviceId}`);
    
    this.xmlFusion.removeUser(deviceId);
    
    const globalXml = this.xmlFusion.toXmlString();
    this.wsServer.broadcast({
      type: 'CATALOG_UPDATE',
      data: globalXml,
      totalUsers: this.xmlFusion.globalCatalog.users.length
    });
  }

  handleHostLoss() {
    if (!this.isHost) {
      setTimeout(() => {
        this.electionService.startElection();
      }, 1000);
    }
  }

  stop() {
    logger.info('SERVER', 'Arrêt du serveur...');
    
    if (this.wsServer) this.wsServer.stop();
    this.mdnsService.stop();
    this.streamingService.stop();
    
    logger.info('SERVER', 'Serveur arrêté');
  }
}

const server = new ShareMusicServer();

server.start().catch(err => {
  logger.error('SERVER', 'Erreur fatale', err);
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log();
  logger.info('SERVER', 'Signal SIGINT reçu');
  server.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('SERVER', 'Signal SIGTERM reçu');
  server.stop();
  process.exit(0);
});

process.on('uncaughtException', (err) => {
  logger.error('SERVER', 'Exception non capturée', err);
  server.stop();
  process.exit(1);
});

module.exports = ShareMusicServer;
