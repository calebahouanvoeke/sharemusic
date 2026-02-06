// server/src/data/XmlFusion.js
const { DOMImplementation, XMLSerializer } = require('xmldom');
const logger = require('../utils/logger');

class XmlFusion {
  constructor() {
    this.globalCatalog = this.initializeEmptyCatalog();
  }

  /**
   * Initialiser un catalogue vide
   */
  initializeEmptyCatalog() {
    return {
      version: '1.0',
      generated_at: new Date().toISOString(),
      network_info: {
        host_id: null,
        total_users: 0,
        total_tracks: 0,
        last_update: new Date().toISOString()
      },
      users: []
    };
  }

  /**
   * Ajouter ou mettre à jour un utilisateur
   */
  addOrUpdateUser(user) {
    if (!user || !user.device_id) {
      logger.error('XML_FUSION', 'Utilisateur invalide (device_id manquant)');
      return false;
    }

    const deviceId = user.device_id;

    // Chercher si l'utilisateur existe déjà
    const existingIndex = this.globalCatalog.users.findIndex(
      u => u.device_id === deviceId
    );

    if (existingIndex >= 0) {
      // Mise à jour
      this.globalCatalog.users[existingIndex] = user;
      logger.info('XML_FUSION', `Utilisateur mis à jour: ${deviceId}`);
    } else {
      // Ajout
      this.globalCatalog.users.push(user);
      logger.info('XML_FUSION', `Nouvel utilisateur ajouté: ${deviceId}`);
    }

    this.updateMetadata();
    return true;
  }

  /**
   * Retirer un utilisateur du catalogue
   */
  removeUser(deviceId) {
    const initialLength = this.globalCatalog.users.length;
    
    this.globalCatalog.users = this.globalCatalog.users.filter(
      u => u.device_id !== deviceId
    );

    if (this.globalCatalog.users.length < initialLength) {
      logger.info('XML_FUSION', `Utilisateur retiré: ${deviceId}`);
      this.updateMetadata();
      return true;
    }

    logger.warn('XML_FUSION', `Utilisateur non trouvé pour suppression: ${deviceId}`);
    return false;
  }

  /**
   * Marquer un utilisateur comme offline
   */
  markUserOffline(deviceId) {
    const user = this.globalCatalog.users.find(u => u.device_id === deviceId);
    
    if (user) {
      user.is_online = false;
      logger.info('XML_FUSION', `Utilisateur marqué offline: ${deviceId}`);
      this.updateMetadata();
      return true;
    }

    logger.warn('XML_FUSION', `Utilisateur non trouvé pour marquer offline: ${deviceId}`);
    return false;
  }

  /**
   * Marquer un utilisateur comme online
   */
  markUserOnline(deviceId) {
    const user = this.globalCatalog.users.find(u => u.device_id === deviceId);
    
    if (user) {
      user.is_online = true;
      logger.info('XML_FUSION', `Utilisateur marqué online: ${deviceId}`);
      this.updateMetadata();
      return true;
    }

    return false;
  }

  /**
   * Mettre à jour les métadonnées du catalogue
   */
  updateMetadata() {
    // Compter les utilisateurs
    this.globalCatalog.network_info.total_users = this.globalCatalog.users.length;

    // Compter le nombre total de morceaux
    let totalTracks = 0;
    this.globalCatalog.users.forEach(user => {
      if (user.track_list && Array.isArray(user.track_list)) {
        totalTracks += user.track_list.length;
      }
    });
    this.globalCatalog.network_info.total_tracks = totalTracks;

    // Mettre à jour le timestamp
    this.globalCatalog.network_info.last_update = new Date().toISOString();
    this.globalCatalog.generated_at = new Date().toISOString();

    logger.debug('XML_FUSION', `Métadonnées mises à jour: ${this.globalCatalog.network_info.total_users} users, ${totalTracks} tracks`);
  }

  /**
   * Définir le Host ID
   */
  setHostId(deviceId) {
    this.globalCatalog.network_info.host_id = deviceId;
    logger.info('XML_FUSION', `Host ID défini: ${deviceId}`);
    this.updateMetadata();
  }

  /**
   * Convertir le catalogue en string XML
   */
  toXmlString() {
    try {
      logger.info('XML_FUSION', 'Génération du XML...');

      const impl = new DOMImplementation();
      const doc = impl.createDocument(null, 'music', null);
      const root = doc.documentElement;

      // Ajouter les attributs de la racine
      root.setAttribute('version', this.globalCatalog.version);
      root.setAttribute('generated_at', this.globalCatalog.generated_at);

      // Ajouter network_info
      const networkInfo = doc.createElement('network_info');
      
      if (this.globalCatalog.network_info.host_id) {
        this.addElement(doc, networkInfo, 'host_id', this.globalCatalog.network_info.host_id);
      }
      this.addElement(doc, networkInfo, 'total_users', this.globalCatalog.network_info.total_users.toString());
      this.addElement(doc, networkInfo, 'total_tracks', this.globalCatalog.network_info.total_tracks.toString());
      this.addElement(doc, networkInfo, 'last_update', this.globalCatalog.network_info.last_update);
      
      root.appendChild(networkInfo);

      // Ajouter users
      const usersElement = doc.createElement('users');

      this.globalCatalog.users.forEach(user => {
        const userElement = this.createUserElement(doc, user);
        usersElement.appendChild(userElement);
      });

      root.appendChild(usersElement);

      // Sérialiser
      const serializer = new XMLSerializer();
      const xmlString = serializer.serializeToString(doc);

      logger.info('XML_FUSION', 'XML généré avec succès');
      return xmlString;
    } catch (err) {
      logger.error('XML_FUSION', 'Erreur lors de la génération du XML', err);
      throw err;
    }
  }

  /**
   * Créer un élément user XML
   */
  createUserElement(doc, user) {
    const userElement = doc.createElement('user');
    
    // Attributs
    userElement.setAttribute('device_id', user.device_id);
    userElement.setAttribute('is_host', user.is_host ? 'true' : 'false');
    userElement.setAttribute('is_online', user.is_online !== false ? 'true' : 'false');
    
    if (user.battery_level != null) {
      userElement.setAttribute('battery_level', user.battery_level.toString());
    }
    if (user.is_plugged != null) {
      userElement.setAttribute('is_plugged', user.is_plugged ? 'true' : 'false');
    }
    if (user.join_timestamp != null) {
      userElement.setAttribute('join_timestamp', user.join_timestamp.toString());
    }
    if (user.ram_gb != null) {
      userElement.setAttribute('ram_gb', user.ram_gb.toString());
    }

    // info_user
    if (user.info_user) {
      const infoUser = doc.createElement('info_user');
      infoUser.setAttribute('id_user', user.info_user.id_user || user.device_id);
      
      this.addElement(doc, infoUser, 'nom', user.info_user.nom);
      if (user.info_user.email) this.addElement(doc, infoUser, 'email', user.info_user.email);
      if (user.info_user.age) this.addElement(doc, infoUser, 'age', user.info_user.age);
      if (user.info_user.device_name) this.addElement(doc, infoUser, 'device_name', user.info_user.device_name);
      if (user.info_user.os_version) this.addElement(doc, infoUser, 'os_version', user.info_user.os_version);
      
      userElement.appendChild(infoUser);
    }

    // track_list
    const trackList = doc.createElement('track_list');
    const trackCount = (user.track_list && user.track_list.length) || 0;
    trackList.setAttribute('count', trackCount.toString());

    if (user.track_list && Array.isArray(user.track_list)) {
      user.track_list.forEach(track => {
        const trackElement = this.createTrackElement(doc, track);
        trackList.appendChild(trackElement);
      });
    }

    userElement.appendChild(trackList);

    return userElement;
  }

  /**
   * Créer un élément musique XML
   */
  createTrackElement(doc, track) {
    const musiqueElement = doc.createElement('musique');
    
    // Attributs
    musiqueElement.setAttribute('id_musique', track.id_musique);
    if (track.ajouter_par) musiqueElement.setAttribute('ajouter_par', track.ajouter_par);
    if (track.genre) musiqueElement.setAttribute('genre', track.genre);
    if (track.format) musiqueElement.setAttribute('format', track.format);
    if (track.filesize) musiqueElement.setAttribute('filesize', track.filesize.toString());
    if (track.bitrate) musiqueElement.setAttribute('bitrate', track.bitrate.toString());
    if (track.sample_rate) musiqueElement.setAttribute('sample_rate', track.sample_rate.toString());

    // Éléments
    this.addElement(doc, musiqueElement, 'titre', track.titre);

    // Artistes
    if (track.artistes && track.artistes.length > 0) {
      const artistesElement = doc.createElement('artistes');
      track.artistes.forEach(artiste => {
        this.addElement(doc, artistesElement, 'artiste', artiste);
      });
      musiqueElement.appendChild(artistesElement);
    }

    if (track.album) this.addElement(doc, musiqueElement, 'album', track.album);
    if (track.duree) this.addElement(doc, musiqueElement, 'duree', track.duree.toString());
    if (track.description) this.addElement(doc, musiqueElement, 'description', track.description);
    if (track.date_de_sortie) this.addElement(doc, musiqueElement, 'date_de_sortie', track.date_de_sortie);
    this.addElement(doc, musiqueElement, 'chemin', track.chemin);
    if (track.cover_art) this.addElement(doc, musiqueElement, 'cover_art', track.cover_art);

    return musiqueElement;
  }

  /**
   * Ajouter un élément avec contenu texte
   */
  addElement(doc, parent, tagName, textContent) {
    if (textContent != null && textContent !== '') {
      const element = doc.createElement(tagName);
      element.textContent = textContent;
      parent.appendChild(element);
    }
  }

  /**
   * Obtenir le catalogue global
   */
  getCatalog() {
    return this.globalCatalog;
  }

  /**
   * Obtenir le nombre d'utilisateurs
   */
  getUserCount() {
    return this.globalCatalog.users.length;
  }

  /**
   * Obtenir le nombre total de morceaux
   */
  getTotalTracks() {
    return this.globalCatalog.network_info.total_tracks;
  }

  /**
   * Vérifier si un utilisateur existe
   */
  hasUser(deviceId) {
    return this.globalCatalog.users.some(u => u.device_id === deviceId);
  }

  /**
   * Obtenir un utilisateur par deviceId
   */
  getUser(deviceId) {
    return this.globalCatalog.users.find(u => u.device_id === deviceId);
  }

  /**
   * Réinitialiser le catalogue
   */
  reset() {
    this.globalCatalog = this.initializeEmptyCatalog();
    logger.info('XML_FUSION', 'Catalogue réinitialisé');
  }
}

module.exports = XmlFusion;