// server/src/services/FileUploadService.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');
const config = require('../utils/config');
const crypto = require('crypto');

// ✅ NOUVEAU : Limite de taille de fichier (50 MB)
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB en bytes
const MAX_FILE_SIZE_MB = 50;

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
      
      const allowedExtensions = ['.mp3', '.flac', '.aac', '.ogg', '.wav', '.m4a'];
      const ext = path.extname(file.originalname).toLowerCase();
      
      // ✅ Vérifier à la fois le MIME type et l'extension
      if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(ext)) {
        cb(null, true);
      } else {
        logger.warn('FILE_UPLOAD', `Type de fichier rejeté: ${file.mimetype} (${ext})`);
        cb(new Error(`FORMAT_NON_SUPPORTÉ:${file.originalname}`), false);
      }
    };

    // ✅ MODIFIÉ : Ajout de la limite de taille
    this.upload = multer({
      storage: this.storage,
      fileFilter: this.fileFilter,
      limits: {
        fileSize: MAX_FILE_SIZE, // ✅ 50 MB au lieu de 100 MB
        files: 10 // ✅ Max 10 fichiers simultanés
      }
    });
  }

  /**
   * Configurer les routes
   */
  setupRoutes() {
    // ✅ MODIFIÉ : Gestion des erreurs Multer
    this.router.post('/upload', (req, res) => {
      this.upload.array('files', 10)(req, res, (err) => {
        if (err instanceof multer.MulterError) {
          // ✅ Erreur Multer spécifique
          if (err.code === 'LIMIT_FILE_SIZE') {
            logger.warn('FILE_UPLOAD', `Fichier trop volumineux (max: ${MAX_FILE_SIZE_MB} MB)`);
            return res.status(413).json({
              success: false,
              error: 'FILE_TOO_LARGE',
              message: `Un ou plusieurs fichiers dépassent la taille maximale autorisée (${MAX_FILE_SIZE_MB} MB)`,
              maxSize: `${MAX_FILE_SIZE_MB} MB`,
              maxSizeBytes: MAX_FILE_SIZE
            });
          } else if (err.code === 'LIMIT_FILE_COUNT') {
            logger.warn('FILE_UPLOAD', `Trop de fichiers (max: 10)`);
            return res.status(400).json({
              success: false,
              error: 'TOO_MANY_FILES',
              message: 'Trop de fichiers à uploader simultanément (max: 10)',
              maxFiles: 10
            });
          } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
            logger.warn('FILE_UPLOAD', `Champ de fichier inattendu`);
            return res.status(400).json({
              success: false,
              error: 'UNEXPECTED_FILE',
              message: 'Champ de fichier inattendu dans la requête'
            });
          }
          
          logger.error('FILE_UPLOAD', 'Erreur Multer:', err);
          return res.status(400).json({
            success: false,
            error: err.code || 'MULTER_ERROR',
            message: err.message
          });
          
        } else if (err) {
          // ✅ Erreur personnalisée (fileFilter)
          if (err.message.startsWith('FORMAT_NON_SUPPORTÉ:')) {
            const [, fileName] = err.message.split(':');
            logger.warn('FILE_UPLOAD', `Format non supporté: ${fileName}`);
            return res.status(415).json({
              success: false,
              error: 'UNSUPPORTED_FORMAT',
              message: `Le fichier "${fileName}" n'est pas un format audio supporté`,
              fileName: fileName,
              supportedFormats: ['MP3', 'FLAC', 'AAC', 'OGG', 'WAV', 'M4A']
            });
          }
          
          logger.error('FILE_UPLOAD', 'Erreur upload:', err);
          return res.status(500).json({
            success: false,
            error: 'UPLOAD_ERROR',
            message: err.message
          });
        }
        
        // ✅ Pas d'erreur, traiter l'upload normalement
        this.handleUpload(req, res);
      });
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
// server/src/services/FileUploadService.js

/**
 * Gérer l'upload de fichiers
 */
handleUpload(req, res) {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ 
        success: false,
        error: 'NO_FILES',
        message: 'Aucun fichier uploadé' 
      });
    }

    // ✅ Vérifier le deviceId
    if (!req.body.deviceId) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_DEVICE_ID',
        message: 'Le deviceId est requis'
      });
    }

    logger.info('FILE_UPLOAD', `${req.files.length} fichiers uploadés pour ${req.body.deviceId}`);

    const uploadedFiles = req.files.map((file, index) => {
      // Extraire les métadonnées si fournies
      const metadataKey = `metadata_${index}`;
      let metadata = {};
      
      try {
        if (req.body[metadataKey]) {
          metadata = JSON.parse(req.body[metadataKey]);
        }
      } catch (err) {
        logger.warn('FILE_UPLOAD', `Erreur parsing métadonnées pour ${file.originalname}`, err);
      }

      // ✅ Calculer la taille en MB
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);

      return {
        trackId: metadata.id_musique || null,
        originalName: file.originalname,
        savedName: file.filename,
        serverPath: file.path,  // ✅ CRITIQUE : Garder le chemin absolu complet !
        size: file.size,
        sizeMB: fileSizeMB,
        mimetype: file.mimetype,
        format: path.extname(file.originalname).substring(1).toLowerCase(),
        metadata: metadata
      };
    });

    res.json({
      success: true,
      message: `${uploadedFiles.length} fichier(s) uploadé(s) avec succès`,
      deviceId: req.body.deviceId,
      files: uploadedFiles,
      count: uploadedFiles.length
    });

    logger.info('FILE_UPLOAD', `Upload terminé : ${uploadedFiles.length} fichiers, total ${uploadedFiles.reduce((sum, f) => sum + f.size, 0)} bytes`);
    
  } catch (err) {
    logger.error('FILE_UPLOAD', 'Erreur lors de l\'upload', err);
    res.status(500).json({ 
      success: false,
      error: 'SERVER_ERROR',
      message: 'Erreur serveur lors de l\'upload' 
    });
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
        return res.json({ 
          deviceId: deviceId,
          files: [],
          count: 0
        });
      }

      const files = fs.readdirSync(userDir).map(filename => {
        const filePath = path.join(userDir, filename);
        const stats = fs.statSync(filePath);
        const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        
        return {
          filename: filename,
          path: `/music/${this.sanitizeDeviceId(deviceId)}/${filename}`,
          absolutePath: filePath,
          size: stats.size,
          sizeMB: fileSizeMB,
          created: stats.birthtime,
          modified: stats.mtime,
          format: path.extname(filename).substring(1).toLowerCase()
        };
      });

      res.json({ 
        deviceId: deviceId,
        files: files,
        count: files.length,
        totalSize: files.reduce((sum, f) => sum + f.size, 0)
      });
      
    } catch (err) {
      logger.error('FILE_UPLOAD', 'Erreur listing fichiers', err);
      res.status(500).json({ 
        success: false,
        error: 'LISTING_ERROR',
        message: 'Erreur lors du listing des fichiers' 
      });
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
        logger.warn('FILE_UPLOAD', `Tentative d'accès non autorisé: ${filePath}`);
        return res.status(403).json({ 
          success: false,
          error: 'FORBIDDEN',
          message: 'Accès refusé' 
        });
      }

      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ 
          success: false,
          error: 'NOT_FOUND',
          message: 'Fichier non trouvé' 
        });
      }

      const stats = fs.statSync(filePath);
      fs.unlinkSync(filePath);
      
      logger.info('FILE_UPLOAD', `Fichier supprimé: ${filename} (${stats.size} bytes)`);

      res.json({ 
        success: true, 
        message: 'Fichier supprimé avec succès',
        filename: filename,
        size: stats.size
      });
      
    } catch (err) {
      logger.error('FILE_UPLOAD', 'Erreur suppression fichier', err);
      res.status(500).json({ 
        success: false,
        error: 'DELETE_ERROR',
        message: 'Erreur lors de la suppression' 
      });
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

  /**
   * ✅ NOUVEAU : Obtenir la taille maximale autorisée
   */
  getMaxFileSize() {
    return MAX_FILE_SIZE;
  }

  /**
   * ✅ NOUVEAU : Obtenir la taille maximale en MB
   */
  getMaxFileSizeMB() {
    return MAX_FILE_SIZE_MB;
  }
}

module.exports = FileUploadService;