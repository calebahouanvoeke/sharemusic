// server/src/data/XmlParser.js
const { DOMParser } = require('xmldom');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class XmlParser {
  constructor(dtdPath) {
    this.dtdPath = dtdPath || path.join(__dirname, '../../dtd/sharemusic.dtd');
    this.parser = new DOMParser({
      errorHandler: {
        warning: (msg) => logger.warn('XML_PARSER', `Warning: ${msg}`),
        error: (msg) => logger.error('XML_PARSER', `Error: ${msg}`),
        fatalError: (msg) => {
          logger.error('XML_PARSER', `Fatal error: ${msg}`);
          throw new Error(`XML Parse Error: ${msg}`);
        }
      }
    });
  }

  /**
   * Parser un string XML en objet JavaScript
   */
  parse(xmlString) {
    try {
      logger.info('XML_PARSER', 'Parsing XML...');

      // Parser le XML
      const doc = this.parser.parseFromString(xmlString, 'text/xml');

      // Vérifier les erreurs de parsing
      const parserErrors = doc.getElementsByTagName('parsererror');
      if (parserErrors.length > 0) {
        const errorText = parserErrors[0].textContent;
        throw new Error(`Erreur de parsing XML: ${errorText}`);
      }

      // Convertir en objet JavaScript
      const result = this.xmlToObject(doc);

      logger.info('XML_PARSER', 'XML parsé avec succès');
      return result;
    } catch (err) {
      logger.error('XML_PARSER', 'Erreur lors du parsing', err);
      throw err;
    }
  }

  /**
   * Convertir un document XML en objet JavaScript
   */
  xmlToObject(doc) {
    const music = {};

    // Récupérer les attributs de la racine
    const rootElement = doc.documentElement;
    if (rootElement.hasAttribute('version')) {
      music.version = rootElement.getAttribute('version');
    }
    if (rootElement.hasAttribute('generated_at')) {
      music.generated_at = rootElement.getAttribute('generated_at');
    }

    // Extraire network_info
    const networkInfo = doc.getElementsByTagName('network_info')[0];
    if (networkInfo) {
      music.network_info = {
        host_id: this.getTextContent(networkInfo, 'host_id'),
        total_users: this.getTextContent(networkInfo, 'total_users'),
        total_tracks: this.getTextContent(networkInfo, 'total_tracks'),
        last_update: this.getTextContent(networkInfo, 'last_update')
      };
    } else {
      music.network_info = {};
    }

    // Extraire users
    music.users = [];
    const usersElement = doc.getElementsByTagName('users')[0];
    
    if (usersElement) {
      const userElements = usersElement.getElementsByTagName('user');
      
      for (let i = 0; i < userElements.length; i++) {
        const user = this.parseUser(userElements[i]);
        music.users.push(user);
      }
    }

    return music;
  }

  /**
   * Parser un élément user
   */
  parseUser(userElement) {
    const user = {
      device_id: userElement.getAttribute('device_id'),
      is_host: userElement.getAttribute('is_host') === 'true',
      is_online: userElement.getAttribute('is_online') === 'true',
      battery_level: userElement.getAttribute('battery_level') || null,
      is_plugged: userElement.getAttribute('is_plugged') === 'true',
      join_timestamp: userElement.getAttribute('join_timestamp') || null,
      ram_gb: userElement.getAttribute('ram_gb') || null,
      info_user: {},
      track_list: []
    };

    // Parser info_user
    const infoUser = userElement.getElementsByTagName('info_user')[0];
    if (infoUser) {
      user.info_user = {
        id_user: infoUser.getAttribute('id_user'),
        nom: this.getTextContent(infoUser, 'nom'),
        email: this.getTextContent(infoUser, 'email'),
        age: this.getTextContent(infoUser, 'age'),
        device_name: this.getTextContent(infoUser, 'device_name'),
        os_version: this.getTextContent(infoUser, 'os_version')
      };
    }

    // Parser track_list
    const trackList = userElement.getElementsByTagName('track_list')[0];
    if (trackList) {
      const musiques = trackList.getElementsByTagName('musique');
      
      for (let j = 0; j < musiques.length; j++) {
        const track = this.parseTrack(musiques[j]);
        user.track_list.push(track);
      }
    }

    return user;
  }

  /**
   * Parser un élément musique
   */
  parseTrack(musiqueElement) {
    const track = {
      id_musique: musiqueElement.getAttribute('id_musique'),
      ajouter_par: musiqueElement.getAttribute('ajouter_par') || null,
      genre: musiqueElement.getAttribute('genre') || 'Autres',
      format: musiqueElement.getAttribute('format') || 'mp3',
      filesize: musiqueElement.getAttribute('filesize') || null,
      bitrate: musiqueElement.getAttribute('bitrate') || null,
      sample_rate: musiqueElement.getAttribute('sample_rate') || null,
      titre: this.getTextContent(musiqueElement, 'titre'),
      artistes: this.parseArtistes(musiqueElement),
      album: this.getTextContent(musiqueElement, 'album'),
      duree: this.getTextContent(musiqueElement, 'duree'),
      description: this.getTextContent(musiqueElement, 'description'),
      date_de_sortie: this.getTextContent(musiqueElement, 'date_de_sortie'),
      chemin: this.getTextContent(musiqueElement, 'chemin'),
      cover_art: this.getTextContent(musiqueElement, 'cover_art')
    };

    return track;
  }

  /**
   * Parser les artistes
   */
  parseArtistes(musiqueElement) {
    const artistes = [];
    const artistesElement = musiqueElement.getElementsByTagName('artistes')[0];
    
    if (artistesElement) {
      const artisteElements = artistesElement.getElementsByTagName('artiste');
      
      for (let i = 0; i < artisteElements.length; i++) {
        const artisteName = artisteElements[i].textContent.trim();
        if (artisteName) {
          artistes.push(artisteName);
        }
      }
    }

    return artistes;
  }

  /**
   * Obtenir le contenu texte d'un élément enfant
   */
  getTextContent(parentElement, tagName) {
    const element = parentElement.getElementsByTagName(tagName)[0];
    if (element && element.textContent) {
      return element.textContent.trim();
    }
    return null;
  }

  /**
   * Valider un XML contre la DTD (simplifié)
   */
  validate(xmlString) {
    try {
      logger.info('XML_PARSER', 'Validation du XML...');

      // Parser le XML
      const doc = this.parser.parseFromString(xmlString, 'text/xml');

      // Vérifier les erreurs de parsing
      const parserErrors = doc.getElementsByTagName('parsererror');
      if (parserErrors.length > 0) {
        logger.error('XML_PARSER', 'XML invalide');
        return false;
      }

      // Vérifications basiques de structure
      const rootElement = doc.documentElement;
      if (rootElement.tagName !== 'music') {
        logger.error('XML_PARSER', 'Élément racine doit être <music>');
        return false;
      }

      const networkInfo = doc.getElementsByTagName('network_info')[0];
      if (!networkInfo) {
        logger.error('XML_PARSER', 'Élément <network_info> manquant');
        return false;
      }

      const users = doc.getElementsByTagName('users')[0];
      if (!users) {
        logger.error('XML_PARSER', 'Élément <users> manquant');
        return false;
      }

      logger.info('XML_PARSER', 'XML valide');
      return true;
    } catch (err) {
      logger.error('XML_PARSER', 'Erreur lors de la validation', err);
      return false;
    }
  }

  /**
   * Parser un fichier XML
   */
  parseFile(filePath) {
    try {
      const xmlString = fs.readFileSync(filePath, 'utf-8');
      return this.parse(xmlString);
    } catch (err) {
      logger.error('XML_PARSER', `Erreur lors de la lecture du fichier ${filePath}`, err);
      throw err;
    }
  }

  /**
   * Obtenir un résumé du catalogue
   */
  getSummary(parsedXml) {
    const summary = {
      totalUsers: parsedXml.users ? parsedXml.users.length : 0,
      totalTracks: 0,
      onlineUsers: 0,
      hostDevice: parsedXml.network_info?.host_id || 'unknown'
    };

    if (parsedXml.users) {
      parsedXml.users.forEach(user => {
        if (user.is_online) {
          summary.onlineUsers++;
        }
        if (user.track_list) {
          summary.totalTracks += user.track_list.length;
        }
      });
    }

    return summary;
  }
}

module.exports = XmlParser;