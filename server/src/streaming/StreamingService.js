// server/src/streaming/StreamingService.js
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const config = require('../utils/config');

class StreamingService {
  constructor(port) {

  this.port = port || config.server.streamingPort || 3000;
    this.app = express();
    this.server = null;
    this.musicDirectory = path.join(__dirname, '../../music');
    this.catalogRef = null; // Référence au catalogue global
  }

  /**
   * Définir la référence au catalogue global
   */
  setCatalogRef(catalogRef) {
    this.catalogRef = catalogRef;
    logger.info('STREAM', 'Référence au catalogue définie');
  }

  /**
   * Configurer les middlewares
   */
  setupMiddleware() {
    // CORS pour permettre les requêtes cross-origin
    this.app.use(cors());

    // Parser JSON
    this.app.use(express.json());

    // Logger les requêtes
    this.app.use((req, res, next) => {
      logger.debug('STREAM', `${req.method} ${req.url}`);
      next();
    });
  }

  /**
   * Configurer les routes
   */
  setupRoutes() {
    // Route de test
    this.app.get('/', (req, res) => {
      res.json({
        service: 'ShareMusic Streaming Service',
        version: '1.0',
        status: 'running'
      });
    });

    // Route de streaming principal
    this.app.get('/stream/:deviceId/:trackId', (req, res) => {
      this.handleStream(req, res);
    });

    // Route pour les métadonnées
    this.app.get('/track-info/:deviceId/:trackId', (req, res) => {
      this.handleTrackInfo(req, res);
    });

    // Route pour la pochette
    this.app.get('/cover/:deviceId/:trackId', (req, res) => {
      this.handleCoverArt(req, res);
    });

    // Route pour lister les tracks d'un user
    this.app.get('/tracks/:deviceId', (req, res) => {
      this.handleListTracks(req, res);
    });
  }

  /**
   * Gérer le streaming d'un fichier audio
   */
  handleStream(req, res) {
    const { deviceId, trackId } = req.params;

    try {
      logger.info('STREAM', `Demande de streaming: ${deviceId}/${trackId}`);

      // Récupérer le chemin du fichier depuis le catalogue
      const filePath = this.getTrackPath(deviceId, trackId);

      if (!filePath) {
        logger.warn('STREAM', `Track non trouvé: ${deviceId}/${trackId}`);
        return res.status(404).json({ error: 'Track not found' });
      }

      // Vérifier que le fichier existe
      if (!fs.existsSync(filePath)) {
        logger.error('STREAM', `Fichier inexistant: ${filePath}`);
        return res.status(404).json({ error: 'File not found on disk' });
      }

      // Obtenir les stats du fichier
      const stat = fs.statSync(filePath);
      const fileSize = stat.size;
      const range = req.headers.range;

      // Déterminer le type MIME
      const mimeType = this.getMimeType(filePath);

      if (range) {
        // Streaming avec Range Requests
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;

        logger.debug('STREAM', `Range: ${start}-${end}/${fileSize}`);

        const stream = fs.createReadStream(filePath, { start, end });

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': mimeType,
          'Access-Control-Allow-Origin': '*'
        });

        stream.pipe(res);

        stream.on('error', (err) => {
          logger.error('STREAM', 'Erreur lors du streaming', err);
          res.status(500).end();
        });
      } else {
        // Streaming complet sans range
        logger.debug('STREAM', `Streaming complet: ${fileSize} bytes`);

        res.writeHead(200, {
          'Content-Length': fileSize,
          'Content-Type': mimeType,
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*'
        });

        const stream = fs.createReadStream(filePath);
        stream.pipe(res);

        stream.on('error', (err) => {
          logger.error('STREAM', 'Erreur lors du streaming', err);
          res.status(500).end();
        });
      }
    } catch (err) {
      logger.error('STREAM', 'Erreur dans handleStream', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Gérer la demande d'informations sur un track
   */
  handleTrackInfo(req, res) {
    const { deviceId, trackId } = req.params;

    try {
      const track = this.getTrackMetadata(deviceId, trackId);

      if (!track) {
        return res.status(404).json({ error: 'Track not found' });
      }

      res.json(track);
    } catch (err) {
      logger.error('STREAM', 'Erreur dans handleTrackInfo', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Gérer la demande de pochette
   */
  handleCoverArt(req, res) {
    const { deviceId, trackId } = req.params;

    try {
      const track = this.getTrackMetadata(deviceId, trackId);

      if (!track || !track.cover_art) {
        return res.status(404).json({ error: 'Cover art not found' });
      }

      const coverPath = track.cover_art;

      if (!fs.existsSync(coverPath)) {
        return res.status(404).json({ error: 'Cover file not found' });
      }

      const mimeType = this.getMimeType(coverPath);
      res.setHeader('Content-Type', mimeType);
      
      const stream = fs.createReadStream(coverPath);
      stream.pipe(res);

      stream.on('error', (err) => {
        logger.error('STREAM', 'Erreur lors de l\'envoi de la pochette', err);
        res.status(500).end();
      });
    } catch (err) {
      logger.error('STREAM', 'Erreur dans handleCoverArt', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Lister les tracks d'un utilisateur
   */
  handleListTracks(req, res) {
    const { deviceId } = req.params;

    try {
      if (!this.catalogRef) {
        return res.status(503).json({ error: 'Catalog not available' });
      }

      const user = this.catalogRef.getUser(deviceId);

      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({
        deviceId: deviceId,
        userName: user.info_user?.nom || 'Unknown',
        tracks: user.track_list || []
      });
    } catch (err) {
      logger.error('STREAM', 'Erreur dans handleListTracks', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  /**
   * Obtenir le chemin d'un fichier depuis le catalogue
   */
  getTrackPath(deviceId, trackId) {
    if (!this.catalogRef) {
      logger.warn('STREAM', 'Catalogue non disponible');
      return null;
    }

    const user = this.catalogRef.getUser(deviceId);
    if (!user || !user.track_list) {
      return null;
    }

    const track = user.track_list.find(t => t.id_musique === trackId);
    if (!track || !track.chemin) {
      return null;
    }

    return track.chemin;
  }

  /**
   * Obtenir les métadonnées d'un track
   */
  getTrackMetadata(deviceId, trackId) {
    if (!this.catalogRef) {
      return null;
    }

    const user = this.catalogRef.getUser(deviceId);
    if (!user || !user.track_list) {
      return null;
    }

    const track = user.track_list.find(t => t.id_musique === trackId);
    return track || null;
  }

  /**
   * Déterminer le type MIME depuis l'extension
   */
  getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      '.mp3': 'audio/mpeg',
      '.flac': 'audio/flac',
      '.aac': 'audio/aac',
      '.m4a': 'audio/mp4',
      '.ogg': 'audio/ogg',
      '.wav': 'audio/wav',
      '.wma': 'audio/x-ms-wma',
      '.opus': 'audio/opus',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp'
    };

    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Démarrer le serveur
   */
  start() {
    return new Promise((resolve, reject) => {
      try {
        this.setupMiddleware();
        this.setupRoutes();

        this.server = this.app.listen(this.port, () => {
          logger.info('STREAM', `Service streaming démarré sur port ${this.port}`);
          resolve();
        });

        this.server.on('error', (err) => {
          logger.error('STREAM', 'Erreur serveur streaming', err);
          reject(err);
        });
      } catch (err) {
        logger.error('STREAM', 'Impossible de démarrer le serveur streaming', err);
        reject(err);
      }
    });
  }

  /**
   * Arrêter le serveur
   */
  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('STREAM', 'Service streaming arrêté');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Obtenir le port
   */
  getPort() {
    return this.port;
  }
}

module.exports = StreamingService;