// client/src/js/MusicLibraryManager.js

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB en bytes
const MAX_FILE_SIZE_MB = 50;

class MusicLibraryManager {
  constructor() {
    this.library = []; // Liste des morceaux de l'utilisateur
    this.loadLibraryFromStorage();
  }


  
  /**
   * Charger la bibliothèque depuis localStorage
   */
/**
 * Charger la bibliothèque depuis localStorage
 */
loadLibraryFromStorage() {
  try {
    const saved = localStorage.getItem('sharemusic_library');
    if (saved) {
      const tracks = JSON.parse(saved);
      
      // Filtrer les tracks pour ne garder que les métadonnées
      // (on ne peut pas stocker les objets File)
      this.library = tracks.map(track => {
        const { file, ...metadata } = track; // Retirer l'objet File
        return metadata;
      });
      
      console.log('[MusicLibrary] Bibliothèque chargée:', this.library.length, 'morceaux');
      console.warn('[MusicLibrary] Les fichiers locaux ne sont pas disponibles après actualisation');
    }
  } catch (err) {
    console.error('[MusicLibrary] Erreur lors du chargement', err);
    this.library = [];
  }
}

/**
 * Sauvegarder la bibliothèque dans localStorage
 */
saveLibraryToStorage() {
  try {
    // Créer une copie sans les objets File
    const tracksToSave = this.library.map(track => {
      const { file, ...metadata } = track;
      return metadata;
    });
    
    localStorage.setItem('sharemusic_library', JSON.stringify(tracksToSave));
    console.log('[MusicLibrary] Bibliothèque sauvegardée');
  } catch (err) {
    console.error('[MusicLibrary] Erreur lors de la sauvegarde', err);
  }
}

async addFile(file) {
    // ✅ Vérifier la taille du fichier
    if (file.size > MAX_FILE_SIZE) {
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      throw new Error(
        `TAILLE_TROP_GRANDE:${file.name}:${fileSizeMB}MB`
      );
    }

    const format = this.getAudioFormat(file.name);
    if (!format) {
      throw new Error(`FORMAT_NON_SUPPORTÉ:${file.name}`);
    }

    const trackId = 'track_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);

    try {
      const metadata = await this.extractMetadata(file);

      const track = {
        id_musique: trackId,
        titre: metadata.title || this.extractTitleFromFilename(file.name),
        artistes: metadata.artist ? [metadata.artist] : ['Artiste inconnu'],
        album: metadata.album || null,
        genre: metadata.genre || 'Autres',
        duree: metadata.duration || 0,
        format: format,
        filesize: file.size,
        bitrate: metadata.bitrate || null,
        sample_rate: metadata.sampleRate || null,
        date_de_sortie: metadata.year || null,
        description: null,
        chemin: null,
        cover_art: metadata.coverArt || null,
        file: file,
        addedAt: Date.now(),
        localPath: file.name,
        serverPath: null
      };

      this.library.push(track);
      this.saveLibraryToStorage();

      return track;
    } catch (err) {
      console.error('[MusicLibraryManager] Erreur extraction métadonnées:', err);
      throw err;
    }
  }

  /**
   * ✅ MODIFIÉ : Gestion des erreurs détaillée
   */
  async addFiles(files) {
    const results = {
      success: [],
      errors: [],
      tooLarge: [],
      unsupportedFormat: []
    };

    for (const file of files) {
      try {
        const track = await this.addFile(file);
        results.success.push({
          file: file.name,
          track: track
        });
      } catch (err) {
        const errorMessage = err.message || err.toString();

        // ✅ Classifier les erreurs
        if (errorMessage.startsWith('TAILLE_TROP_GRANDE:')) {
          const [, fileName, fileSize] = errorMessage.split(':');
          results.tooLarge.push({
            file: fileName,
            size: fileSize,
            maxSize: `${MAX_FILE_SIZE_MB} MB`
          });
        } else if (errorMessage.startsWith('FORMAT_NON_SUPPORTÉ:')) {
          const [, fileName] = errorMessage.split(':');
          results.unsupportedFormat.push({
            file: fileName
          });
        } else {
          results.errors.push({
            file: file.name,
            error: errorMessage
          });
        }
      }
    }

    return results;
  }

  /**
   * Extraire les métadonnées avec jsmediatags
   */
  async extractMetadata(file) {
    return new Promise((resolve) => {
      // Si jsmediatags est disponible
      if (typeof jsmediatags !== 'undefined') {
        jsmediatags.read(file, {
          onSuccess: (tag) => {
            const tags = tag.tags;
            
            // Extraire la pochette
            let coverArt = null;
            if (tags.picture) {
              const { data, format } = tags.picture;
              let base64String = '';
              for (let i = 0; i < data.length; i++) {
                base64String += String.fromCharCode(data[i]);
              }
              coverArt = `data:${format};base64,${btoa(base64String)}`;
            }

            resolve({
              title: tags.title || null,
              artists: tags.artist ? [tags.artist] : null,
              album: tags.album || null,
              genre: tags.genre || null,
              year: tags.year || null,
              coverArt: coverArt,
              duration: null, // Nécessite Web Audio API
              bitrate: null,
              sampleRate: null
            });
          },
          onError: (error) => {
            console.warn('[MusicLibrary] Impossible de lire les métadonnées:', error);
            resolve({});
          }
        });
      } else {
        // Pas de jsmediatags, retourner métadonnées vides
        console.warn('[MusicLibrary] jsmediatags non disponible');
        resolve({});
      }
    });
  }

  /**
   * Extraire le titre depuis le nom de fichier
   */
  extractTitleFromFilename(filename) {
    // Retirer l'extension
    const nameWithoutExt = filename.replace(/\.[^/.]+$/, '');
    
    // Retirer les numéros de piste (01-, 02-, etc.)
    const cleanName = nameWithoutExt.replace(/^\d+[\s-_.]*/, '');
    
    return cleanName || filename;
  }

  /**
   * Obtenir le format audio depuis le nom de fichier
   */
  getAudioFormat(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const supportedFormats = ['mp3', 'flac', 'aac', 'ogg', 'wav', 'm4a'];
    
    return supportedFormats.includes(ext) ? ext : null;
  }

  /**
   * Retirer un morceau de la bibliothèque
   */
  removeTrack(trackId) {
    const initialLength = this.library.length;
    this.library = this.library.filter(t => t.id_musique !== trackId);
    
    if (this.library.length < initialLength) {
      this.saveLibraryToStorage();
      console.log('[MusicLibrary] Morceau retiré:', trackId);
      return true;
    }
    
    return false;
  }

  /**
   * Obtenir la bibliothèque complète
   */
  getLibrary() {
    return this.library;
  }

  /**
   * Obtenir un morceau par ID
   */
  getTrack(trackId) {
    return this.library.find(t => t.id_musique === trackId);
  }

  /**
   * Vider la bibliothèque
   */
  clearLibrary() {
    this.library = [];
    this.saveLibraryToStorage();
    console.log('[MusicLibrary] Bibliothèque vidée');
  }

  /**
   * Obtenir le nombre de morceaux
   */
  getTrackCount() {
    return this.library.length;
  }

  /**
   * Créer un catalogue XML au format ShareMusic
   */
/**
 * Créer un catalogue XML au format ShareMusic
 * Note: Le chemin sera le chemin serveur après upload
 */
generateCatalogXML(deviceId, userName) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<music version="1.0" generated_at="' + new Date().toISOString() + '">\n';
  xml += '  <network_info>\n';
  xml += '    <total_users>1</total_users>\n';
  xml += '    <total_tracks>' + this.library.length + '</total_tracks>\n';
  xml += '    <last_update>' + new Date().toISOString() + '</last_update>\n';
  xml += '  </network_info>\n';
  xml += '  <users>\n';
  xml += '    <user device_id="' + this.escapeXml(deviceId) + '" is_host="false" is_online="true">\n';
  xml += '      <info_user id_user="' + this.escapeXml(deviceId) + '">\n';
  xml += '        <nom>' + this.escapeXml(userName) + '</nom>\n';
  xml += '      </info_user>\n';
  xml += '      <track_list count="' + this.library.length + '">\n';

  this.library.forEach(track => {
    xml += '        <musique id_musique="' + this.escapeXml(track.id_musique) + '"';
    xml += ' genre="' + this.escapeXml(track.genre || 'Autres') + '"';
    xml += ' format="' + this.escapeXml(track.format || 'mp3') + '"';
    if (track.filesize) xml += ' filesize="' + track.filesize + '"';
    if (track.bitrate) xml += ' bitrate="' + track.bitrate + '"';
    if (track.sample_rate) xml += ' sample_rate="' + track.sample_rate + '"';
    xml += '>\n';
    xml += '          <titre>' + this.escapeXml(track.titre) + '</titre>\n';
    xml += '          <artistes>\n';
    
    (track.artistes || ['Artiste inconnu']).forEach(artiste => {
      xml += '            <artiste>' + this.escapeXml(artiste) + '</artiste>\n';
    });
    
    xml += '          </artistes>\n';
    if (track.album) xml += '          <album>' + this.escapeXml(track.album) + '</album>\n';
    if (track.duree) xml += '          <duree>' + track.duree + '</duree>\n';
    if (track.date_de_sortie) xml += '          <date_de_sortie>' + this.escapeXml(track.date_de_sortie) + '</date_de_sortie>\n';
    
    // ⚠️ IMPORTANT: Utiliser serverPath si disponible, sinon générer le chemin attendu
    const serverPath = track.serverPath || `/music/${deviceId}/${track.id_musique}.${track.format}`;
    xml += '          <chemin>' + this.escapeXml(serverPath) + '</chemin>\n';
    
    xml += '        </musique>\n';
  });

  xml += '      </track_list>\n';
  xml += '    </user>\n';
  xml += '  </users>\n';
  xml += '</music>';

  return xml;
}

  /**
   * Échapper les caractères XML spéciaux
   */
  escapeXml(unsafe) {
    if (unsafe == null) return '';
    return String(unsafe)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Uploader les fichiers vers le serveur
   */
  async uploadToServer(serverUrl) {
    console.log('[MusicLibrary] Upload vers serveur:', serverUrl);

    const formData = new FormData();
    
    // Ajouter tous les fichiers
    this.library.forEach((track, index) => {
      if (track.file) {
        formData.append('files', track.file);
        formData.append('metadata_' + index, JSON.stringify({
          id_musique: track.id_musique,
          titre: track.titre,
          artistes: track.artistes,
          album: track.album,
          genre: track.genre,
          duree: track.duree,
          format: track.format
        }));
      }
    });

    try {
      const response = await fetch(serverUrl + '/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Erreur lors de l\'upload: ' + response.statusText);
      }

      const result = await response.json();
      console.log('[MusicLibrary] Upload réussi:', result);
      return result;
    } catch (err) {
      console.error('[MusicLibrary] Erreur upload:', err);
      throw err;
    }
  }
}

// Export
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MusicLibraryManager;
}