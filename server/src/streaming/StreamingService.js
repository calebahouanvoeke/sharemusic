// server/src/streaming/StreamingService.js
const express = require('express');
const cors = require('cors');
const logger = require('../utils/logger');
const config = require('../utils/config');

class StreamingService {
  constructor() {
    this.app = express();
    this.port = config.server.streamingPort;
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
  }

  setupRoutes() {
    this.app.get('/stream/:deviceId/:trackId', (req, res) => {
      logger.info('STREAM', `Requête stream: ${req.params.trackId}`);
      
      // TODO MODULE 6: Implémenter le streaming HTTP
      // Gérer les Range Requests
      // Lire le fichier avec fs.createReadStream
      // Envoyer les bons headers (Content-Range, Content-Type)
      
      res.status(501).send('À implémenter par Module 6');
    });

    this.app.get('/track-info/:deviceId/:trackId', (req, res) => {
      // TODO MODULE 6: Retourner les métadonnées du morceau
      res.status(501).json({ error: 'À implémenter par Module 6' });
    });
  }

  start() {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        logger.info('STREAM', `Service streaming démarré sur port ${this.port}`);
        resolve();
      });
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      logger.info('STREAM', 'Service streaming arrêté');
    }
  }

  // TODO MODULE 6: Ajouter méthodes :
  // - getMimeType(filePath)
  // - getFilePath(deviceId, trackId)
  // - handleRangeRequest(req, res, filePath)
}

module.exports = StreamingService;
