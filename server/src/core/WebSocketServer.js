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
    this.clients = new Map();
  }

  start() {
    this.wss = new WebSocket.Server({ port: this.port });
    
    this.wss.on('connection', (ws, req) => {
      logger.info('WS', 'Nouvelle connexion');
      
      ws.on('message', (data) => {
        this.handleMessage(ws, data);
      });
      
      ws.on('close', () => {
        this.handleDisconnection(ws);
      });

      ws.on('error', (error) => {
        logger.error('WS', 'Erreur WebSocket', error);
      });
    });
    
    logger.info('WS', `Serveur WebSocket démarré sur port ${this.port}`);
  }

  handleMessage(ws, data) {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'AUTH':
          this.clients.set(message.deviceId, ws);
          ws.deviceId = message.deviceId;
          logger.info('WS', `Client authentifié: ${message.deviceId}`);
          break;
          
        case 'CATALOG':
          this.emit('catalog', ws.deviceId, message.data);
          break;
          
        case 'PONG':
          logger.debug('WS', `Pong reçu de ${ws.deviceId}`);
          break;
          
        default:
          logger.warn('WS', `Type de message inconnu: ${message.type}`);
      }
    } catch (err) {
      logger.error('WS', 'Erreur parsing message', err);
    }
  }

  handleDisconnection(ws) {
    if (ws.deviceId) {
      logger.info('WS', `Client déconnecté: ${ws.deviceId}`);
      this.clients.delete(ws.deviceId);
      this.emit('clientDisconnected', ws.deviceId);
    }
  }

  broadcast(message) {
    const data = JSON.stringify(message);
    this.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      }
    });
  }

  startPingInterval() {
    setInterval(() => {
      this.broadcast({ type: 'PING', timestamp: Date.now() });
    }, config.network.pingInterval);
    logger.info('WS', 'Pings démarrés');
  }

  stop() {
    if (this.wss) {
      this.wss.close();
      logger.info('WS', 'Serveur WebSocket arrêté');
    }
  }

  // TODO MODULE 2: Optimiser la gestion des clients
  // TODO MODULE 2: Ajouter détection de clients zombies
}

module.exports = WebSocketServer;
