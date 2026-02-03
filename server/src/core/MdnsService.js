// server/src/core/MdnsService.js
const { Bonjour } = require('bonjour-service');
const logger = require('../utils/logger');
const config = require('../utils/config');

class MdnsService {
  constructor() {
    this.bonjour = new Bonjour();
    this.service = null;
    this.browser = null;
    this.discoveredServices = [];
  }

  advertise(userName) {
    logger.info('MDNS', `Annonce du service: ShareMusic-${userName}`);
    
    try {
      this.service = this.bonjour.publish({
        name: `ShareMusic-${userName}`,
        type: 'sharemusic',
        port: config.server.port,
        txt: {
          userName: userName,
          version: '1.0',
          participants: '1'
        }
      });
      
      logger.info('MDNS', 'Service annoncé avec succès');
    } catch (err) {
      logger.error('MDNS', 'Erreur annonce service', err);
    }
  }

  discover(callback) {
    logger.info('MDNS', 'Démarrage de la découverte mDNS...');
    
    try {
      this.browser = this.bonjour.find({ type: 'sharemusic' });
      
      this.browser.on('up', (service) => {
        logger.info('MDNS', `Service trouvé: ${service.name}`);
        
        const serviceInfo = {
          name: service.name,
          host: service.host || service.referer?.address,
          port: service.port,
          addresses: service.addresses,
          txtRecord: service.txt
        };
        
        this.discoveredServices.push(serviceInfo);
        
        if (callback) callback(serviceInfo);
      });
      
      this.browser.on('down', (service) => {
        logger.info('MDNS', `Service perdu: ${service.name}`);
        this.discoveredServices = this.discoveredServices.filter(
          s => s.name !== service.name
        );
      });
      
    } catch (err) {
      logger.error('MDNS', 'Erreur découverte', err);
    }
  }

  stopDiscovery() {
    logger.info('MDNS', 'Arrêt de la découverte');
    if (this.browser) {
      this.browser.stop();
      this.browser = null;
    }
  }

  getDiscoveredServices() {
    return this.discoveredServices;
  }

  stop() {
    if (this.service) {
      this.bonjour.unpublishAll();
      this.service = null;
    }
    this.stopDiscovery();
    this.bonjour.destroy();
    logger.info('MDNS', 'Service mDNS arrêté');
  }
}

module.exports = MdnsService;