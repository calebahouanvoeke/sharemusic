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
    this.serviceCallbacks = new Map(); // Pour stocker les callbacks par service
  }

  /**
   * Annoncer le service ShareMusic (quand on est Host)
   */
  advertise(userName) {
    try {
      logger.info('MDNS', `Annonce du service: ShareMusic-${userName}`);

      this.service = this.bonjour.publish({
        name: `ShareMusic-${userName}`,
        type: config.network.mdnsType,
        port: config.server.port,
        txt: {
          userName: userName,
          version: '1.0',
          participants: '1',
          timestamp: Date.now().toString()
        }
      });

      this.service.on('up', () => {
        logger.info('MDNS', 'Service annoncé avec succès');
      });

      this.service.on('error', (err) => {
        logger.error('MDNS', 'Erreur lors de l\'annonce du service', err);
      });

      logger.info('MDNS', `Service ShareMusic-${userName} publié sur port ${config.server.port}`);
    } catch (err) {
      logger.error('MDNS', 'Erreur lors de la publication du service', err);
      throw err;
    }
  }

  /**
   * Mettre à jour les métadonnées du service annoncé
   */
  updateServiceMetadata(participants) {
    if (this.service) {
      try {
        // Note: bonjour-service ne supporte pas la mise à jour directe
        // Il faudrait republier le service avec les nouvelles données
        logger.debug('MDNS', `Mise à jour metadata: ${participants} participants`);
      } catch (err) {
        logger.error('MDNS', 'Erreur lors de la mise à jour des métadonnées', err);
      }
    }
  }

  /**
   * Découvrir les services ShareMusic sur le réseau
   */
  discover(callback) {
    try {
      logger.info('MDNS', 'Démarrage de la découverte mDNS...');

      this.browser = this.bonjour.find({ type: config.network.mdnsType });

      this.browser.on('up', (service) => {
        logger.info('MDNS', `Service trouvé: ${service.name}`);

        const serviceInfo = {
          name: service.name,
          host: service.host || service.referer?.address || 'localhost',
          port: service.port,
          addresses: service.addresses || [],
          txtRecord: service.txt || {},
          type: service.type,
          fqdn: service.fqdn
        };

        // Vérifier si ce service n'est pas déjà dans la liste
        const existingIndex = this.discoveredServices.findIndex(
          s => s.name === serviceInfo.name
        );

        if (existingIndex === -1) {
          this.discoveredServices.push(serviceInfo);
          logger.info('MDNS', `Nouveau service ajouté: ${serviceInfo.name} (${serviceInfo.host}:${serviceInfo.port})`);
        } else {
          this.discoveredServices[existingIndex] = serviceInfo;
          logger.debug('MDNS', `Service mis à jour: ${serviceInfo.name}`);
        }

        // Appeler le callback si fourni
        if (callback) {
          callback(serviceInfo);
        }
      });

      this.browser.on('down', (service) => {
        logger.info('MDNS', `Service perdu: ${service.name}`);

        this.discoveredServices = this.discoveredServices.filter(
          s => s.name !== service.name
        );

        logger.debug('MDNS', `Service retiré de la liste: ${service.name}`);
      });

      logger.info('MDNS', 'Découverte mDNS démarrée');
    } catch (err) {
      logger.error('MDNS', 'Erreur lors de la découverte', err);
      throw err;
    }
  }

  /**
   * Arrêter la découverte
   */
  stopDiscovery() {
    if (this.browser) {
      try {
        this.browser.stop();
        this.browser = null;
        logger.info('MDNS', 'Découverte mDNS arrêtée');
      } catch (err) {
        logger.error('MDNS', 'Erreur lors de l\'arrêt de la découverte', err);
      }
    }
  }

  /**
   * Obtenir la liste des services découverts
   */
  getDiscoveredServices() {
    return this.discoveredServices;
  }

  /**
   * Vérifier si des services ont été découverts
   */
  hasDiscoveredServices() {
    return this.discoveredServices.length > 0;
  }

  /**
   * Obtenir le nombre de services découverts
   */
  getDiscoveredServicesCount() {
    return this.discoveredServices.length;
  }

  /**
   * Rechercher un service par nom
   */
  findServiceByName(name) {
    return this.discoveredServices.find(s => s.name === name);
  }

  /**
   * Arrêter tous les services mDNS
   */
  stop() {
    logger.info('MDNS', 'Arrêt du service mDNS...');

    // Arrêter l'annonce
    if (this.service) {
      try {
        this.bonjour.unpublishAll();
        this.service = null;
        logger.info('MDNS', 'Service dépublié');
      } catch (err) {
        logger.error('MDNS', 'Erreur lors de la dépublication', err);
      }
    }

    // Arrêter la découverte
    this.stopDiscovery();

    // Nettoyer
    this.discoveredServices = [];

    // Détruire l'instance bonjour
    try {
      this.bonjour.destroy();
      logger.info('MDNS', 'Instance Bonjour détruite');
    } catch (err) {
      logger.error('MDNS', 'Erreur lors de la destruction de Bonjour', err);
    }

    logger.info('MDNS', 'Service mDNS arrêté');
  }
}

module.exports = MdnsService;