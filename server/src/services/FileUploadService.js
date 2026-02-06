// server/src/services/FileUploadService.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const config = require('../utils/config');
const crypto = require('crypto');

class FileUploadService {
  constructor() {
    this.router = express.Router();
    this.musicDir = path.resolve(config.paths.musicDir);
    this.setupStorage();
    this.setupRoutes();
  }

  /**
   * Configurer le stockage multer
   */
  setupStorage() {
    // Créer le dossier music s'il n'existe pas
    if (!fs.existsSync(this.musicDir)) {
      fs.mkdirSync(this.musicDir, { recursive: true });
      logger.info('FILE_UPLOAD', `Dossier music créé: ${this.musicDir}`);
    }

    // Configurer multer pour le stockage des fichiers
    this.storage = multer.diskStorage({
      destination: (req, file, cb) => {
        // Créer un sous-dossier pour chaque utilisateur
        const deviceId = req.body.deviceId || 'unknown';
        const userDir = path.join(this.musicDir, this.sanitizeDeviceId(deviceId));
        
        if (!fs.existsSync(userDir)) {
          fs.mkdirSync(userDir, { recursive: true });
        }
        
        cb(null, userDir);
      },
      filename: (req, file, cb) => {
        // Générer un nom de fichier unique
        const ext = path.extname(file.originalname);
        const basename = path.basename(file.originalname, ext);
        const hash = crypto.randomBytes(8).toString('hex');
        const filename = `${this.sanitizeFilename(basename)}_${hash}${ext}`;
        
        cb(null, filename);
      }
    });

    // Filtrer les fichiers audio uniquement
    this.fileFilter = (req, file, cb) => {
      const allowedMimes = [
        'audio/mpeg',
        'audio/mp3',
        'audio/flac',
        'audio/aac',
        'audio/ogg',
        'audio/wav',
        'audio/x-m4a',
        'audio/mp4'
      ];
      
      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        logger.warn('FILE_UPLOAD', `Type de fichier rejeté: ${file.mimetype}`);
        cb(new Error('Format audio non supporté'), false);
      }
    };

    this.upload = multer({
      storage: this.storage,
      fileFilter: this.fileFilter,
      limits: {
        fileSize: 100 * 1024 * 1024 // 100 MB max
      }
    });
  }

  /**
   * Configurer les routes
   */
  setupRoutes() {
    // Route d'upload
    this.router.post('/upload', this.upload.array('files', 50), (req, res) => {
      this.handleUpload(req, res);
    });

    // Route pour lister les fichiers d'un utilisateur
    this.router.get('/files/:deviceId', (req, res) => {
      this.handleListFiles(req, res);
    });

    // Route pour supprimer un fichier
    this.router.delete('/file/:deviceId/:filename', (req, res) => {
      this.handleDeleteFile(req, res);
    });
  }

  /**
   * Gérer l'upload de fichiers
   */
  handleUpload(req, res) {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: 'Aucun fichier uploadé' });
      }

      logger.info('FILE_UPLOAD', `${req.files.length} fichiers uploadés`);

const uploadedFiles = req.files.map(file => {
  // Extraire les métadonnées si fournies
  const metadataKey = `metadata_${req.files.indexOf(file)}`;
  let metadata = {};
  
  try {
    if (req.body[metadataKey]) {
      metadata = JSON.parse(req.body[metadataKey]);
    }
  } catch (err) {
    logger.warn('FILE_UPLOAD', 'Erreur parsing métadonnées', err);
  }

  return {
    originalName: file.originalname,
    savedName: file.filename,
    serverPath: file.path,  // ⚠️ IMPORTANT: Chemin complet sur le serveur
    trackId: metadata.id_musique || null,  // ⚠️ IMPORTANT: ID du morceau
    size: file.size,
    mimetype: file.mimetype,
    metadata: metadata
  };
});

      res.json({
        success: true,
        message: `${uploadedFiles.length} fichiers uploadés avec succès`,
        files: uploadedFiles
      });

      logger.info('FILE_UPLOAD', 'Upload terminé avec succès');
    } catch (err) {
      logger.error('FILE_UPLOAD', 'Erreur lors de l\'upload', err);
      res.status(500).json({ error: 'Erreur lors de l\'upload' });
    }
  }

  /**
   * Lister les fichiers d'un utilisateur
   */
  handleListFiles(req, res) {
    try {
      const deviceId = req.params.deviceId;
      const userDir = path.join(this.musicDir, this.sanitizeDeviceId(deviceId));

      if (!fs.existsSync(userDir)) {
        return res.json({ files: [] });
      }

      const files = fs.readdirSync(userDir).map(filename => {
        const filePath = path.join(userDir, filename);
        const stats = fs.statSync(filePath);
        
        return {
          filename: filename,
          path: filePath,
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime
        };
      });

      res.json({ files: files });
    } catch (err) {
      logger.error('FILE_UPLOAD', 'Erreur listing fichiers', err);
      res.status(500).json({ error: 'Erreur lors du listing' });
    }
  }

  /**
   * Supprimer un fichier
   */
  handleDeleteFile(req, res) {
    try {
      const { deviceId, filename } = req.params;
      const userDir = path.join(this.musicDir, this.sanitizeDeviceId(deviceId));
      const filePath = path.join(userDir, filename);

      // Vérifier que le fichier existe et qu'il est dans le bon dossier
      if (!filePath.startsWith(userDir)) {
        return res.status(403).json({ error: 'Accès refusé' });
      }

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'Fichier non trouvé' });
      }

      fs.unlinkSync(filePath);
      logger.info('FILE_UPLOAD', `Fichier supprimé: ${filename}`);

      res.json({ success: true, message: 'Fichier supprimé' });
    } catch (err) {
      logger.error('FILE_UPLOAD', 'Erreur suppression fichier', err);
      res.status(500).json({ error: 'Erreur lors de la suppression' });
    }
  }

  /**
   * Nettoyer un deviceId pour l'utiliser comme nom de dossier
   */
  sanitizeDeviceId(deviceId) {
    return deviceId.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  /**
   * Nettoyer un nom de fichier
   */
  sanitizeFilename(filename) {
    return filename
      .replace(/[^a-zA-Z0-9_.-]/g, '_')
      .substring(0, 200); // Limiter la longueur
  }

  /**
   * Obtenir le router Express
   */
  getRouter() {
    return this.router;
  }

  /**
   * Obtenir le chemin d'un fichier
   */
  getFilePath(deviceId, filename) {
    const userDir = path.join(this.musicDir, this.sanitizeDeviceId(deviceId));
    return path.join(userDir, filename);
  }

  /**
   * Vérifier si un fichier existe
   */
  fileExists(deviceId, filename) {
    const filePath = this.getFilePath(deviceId, filename);
    return fs.existsSync(filePath);
  }
}

module.exports = FileUploadService;