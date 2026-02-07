// client/src/js/AudioPlayer.js
class AudioPlayer {
  constructor() {
    this.audio = new Audio();
    this.currentTrack = null;
    this.playlist = [];
    this.currentIndex = -1;
    this.isPlaying = false;
    this.volume = 80; // 0-100
    this.streamingBaseUrl = 'http://localhost:3000';
    
    this.callbacks = {
      onPlay: null,
      onPause: null,
      onStop: null,
      onEnded: null,
      onTimeUpdate: null,
      onError: null,
      onLoadStart: null,
      onCanPlay: null
    };

    this.setupEventListeners();
  }

  /**
   * Configurer les écouteurs d'événements audio
   */
  setupEventListeners() {
    this.audio.addEventListener('play', () => {
      console.log('[AudioPlayer] Lecture démarrée');
      this.isPlaying = true;
      if (this.callbacks.onPlay) {
        this.callbacks.onPlay(this.currentTrack);
      }
    });

    this.audio.addEventListener('pause', () => {
      console.log('[AudioPlayer] Lecture en pause');
      this.isPlaying = false;
      if (this.callbacks.onPause) {
        this.callbacks.onPause(this.currentTrack);
      }
    });

    this.audio.addEventListener('ended', () => {
      console.log('[AudioPlayer] Morceau terminé');
      this.isPlaying = false;
      
      if (this.callbacks.onEnded) {
        this.callbacks.onEnded(this.currentTrack);
      }
      
      // Passer au suivant automatiquement si en playlist
      if (this.playlist.length > 0 && this.currentIndex < this.playlist.length - 1) {
        this.playNext();
      }
    });

    this.audio.addEventListener('timeupdate', () => {
      if (this.callbacks.onTimeUpdate) {
        this.callbacks.onTimeUpdate({
          currentTime: this.audio.currentTime,
          duration: this.audio.duration,
          percentage: (this.audio.currentTime / this.audio.duration) * 100 || 0
        });
      }
    });

    this.audio.addEventListener('error', (e) => {
      console.error('[AudioPlayer] Erreur de lecture:', e);
      this.isPlaying = false;
      
      if (this.callbacks.onError) {
        this.callbacks.onError(e, this.currentTrack);
      }
    });

    this.audio.addEventListener('loadstart', () => {
      console.log('[AudioPlayer] Chargement du morceau...');
      if (this.callbacks.onLoadStart) {
        this.callbacks.onLoadStart(this.currentTrack);
      }
    });

    this.audio.addEventListener('canplay', () => {
      console.log('[AudioPlayer] Morceau prêt à être lu');
      if (this.callbacks.onCanPlay) {
        this.callbacks.onCanPlay(this.currentTrack);
      }
    });
  }

  /**
   * Définir un callback
   */
  on(event, callback) {
    const eventName = 'on' + event.charAt(0).toUpperCase() + event.slice(1);
    if (this.callbacks.hasOwnProperty(eventName)) {
      this.callbacks[eventName] = callback;
    }
  }

  /**
   * Lire un morceau
   */
  play(deviceId, trackId, trackInfo = null) {
    console.log(`[AudioPlayer] Lecture: ${deviceId}/${trackId}`);
    
    // Construire l'URL de streaming
    const streamUrl = `${this.streamingBaseUrl}/stream/${deviceId}/${trackId}`;
    
    // Stocker les infos du morceau
    this.currentTrack = {
      deviceId: deviceId,
      trackId: trackId,
      streamUrl: streamUrl,
      ...trackInfo
    };

    // Configurer et lire
    this.audio.src = streamUrl;
    this.audio.volume = this.volume / 100;
    
    this.audio.play()
      .then(() => {
        console.log('[AudioPlayer] Lecture en cours');
      })
      .catch(err => {
        console.error('[AudioPlayer] Erreur lors de la lecture:', err);
        if (this.callbacks.onError) {
          this.callbacks.onError(err, this.currentTrack);
        }
      });
  }

  /**
   * Mettre en pause
   */
  pause() {
    console.log('[AudioPlayer] Pause');
    this.audio.pause();
  }

  /**
   * Reprendre la lecture
   */
  resume() {
    console.log('[AudioPlayer] Reprise');
    this.audio.play().catch(err => {
      console.error('[AudioPlayer] Erreur lors de la reprise:', err);
    });
  }

  /**
   * Basculer play/pause
   */
  togglePlayPause() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.resume();
    }
  }

  /**
   * Arrêter la lecture
   */
  stop() {
    console.log('[AudioPlayer] Arrêt');
    this.audio.pause();
    this.audio.currentTime = 0;
    this.isPlaying = false;
    
    if (this.callbacks.onStop) {
      this.callbacks.onStop(this.currentTrack);
    }
  }

  /**
   * Aller à une position spécifique (en secondes)
   */
  seekTo(seconds) {
    if (this.audio.duration && seconds >= 0 && seconds <= this.audio.duration) {
      this.audio.currentTime = seconds;
      console.log(`[AudioPlayer] Seek to ${seconds}s`);
    }
  }

  /**
   * Aller à une position (en pourcentage 0-100)
   */
  seekToPercentage(percentage) {
    if (this.audio.duration) {
      const seconds = (percentage / 100) * this.audio.duration;
      this.seekTo(seconds);
    }
  }

  /**
   * Définir le volume (0-100)
   */
  setVolume(level) {
    if (level >= 0 && level <= 100) {
      this.volume = level;
      this.audio.volume = level / 100;
      console.log(`[AudioPlayer] Volume: ${level}%`);
    }
  }

  /**
   * Obtenir le volume actuel
   */
  getVolume() {
    return this.volume;
  }

  /**
   * Mute/Unmute
   */
  toggleMute() {
    this.audio.muted = !this.audio.muted;
    return this.audio.muted;
  }

  /**
   * Vérifier si en mute
   */
  isMuted() {
    return this.audio.muted;
  }

  /**
   * Définir la playlist
   */
  setPlaylist(tracks) {
    this.playlist = tracks;
    this.currentIndex = -1;
    console.log(`[AudioPlayer] Playlist définie: ${tracks.length} morceaux`);
  }

  /**
   * Ajouter à la playlist
   */
  addToPlaylist(track) {
    this.playlist.push(track);
    console.log(`[AudioPlayer] Ajouté à la playlist: ${track.titre || track.trackId}`);
  }

  /**
   * Vider la playlist
   */
  clearPlaylist() {
    this.playlist = [];
    this.currentIndex = -1;
    console.log('[AudioPlayer] Playlist vidée');
  }

  /**
   * Lire un morceau de la playlist par index
   */
  playFromPlaylist(index) {
    if (index >= 0 && index < this.playlist.length) {
      this.currentIndex = index;
      const track = this.playlist[index];
      this.play(track.deviceId, track.trackId, track);
    }
  }

  /**
   * Morceau suivant
   */
  playNext() {
    if (this.playlist.length === 0) {
      console.warn('[AudioPlayer] Playlist vide');
      return;
    }

    this.currentIndex++;
    
    if (this.currentIndex >= this.playlist.length) {
      this.currentIndex = 0; // Boucler
    }

    this.playFromPlaylist(this.currentIndex);
    console.log(`[AudioPlayer] Morceau suivant (${this.currentIndex + 1}/${this.playlist.length})`);
  }

  /**
   * Morceau précédent
   */
  playPrevious() {
    if (this.playlist.length === 0) {
      console.warn('[AudioPlayer] Playlist vide');
      return;
    }

    this.currentIndex--;
    
    if (this.currentIndex < 0) {
      this.currentIndex = this.playlist.length - 1; // Aller à la fin
    }

    this.playFromPlaylist(this.currentIndex);
    console.log(`[AudioPlayer] Morceau précédent (${this.currentIndex + 1}/${this.playlist.length})`);
  }

  /**
   * Obtenir le temps actuel (formaté)
   */
  getCurrentTimeFormatted() {
    return this.formatTime(this.audio.currentTime || 0);
  }

  /**
   * Obtenir la durée totale (formatée)
   */
  getDurationFormatted() {
    return this.formatTime(this.audio.duration || 0);
  }

  /**
   * Formater le temps en MM:SS
   */
  formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Obtenir les informations du morceau en cours
   */
  getCurrentTrack() {
    return this.currentTrack;
  }

  /**
   * Obtenir l'état de lecture
   */
  getPlaybackState() {
    return {
      isPlaying: this.isPlaying,
      currentTime: this.audio.currentTime,
      duration: this.audio.duration,
      volume: this.volume,
      isMuted: this.audio.muted,
      currentTrack: this.currentTrack,
      playlistLength: this.playlist.length,
      currentIndex: this.currentIndex
    };
  }

  /**
   * Définir l'URL de base du streaming
   */
  setStreamingBaseUrl(url) {
    this.streamingBaseUrl = url;
    console.log(`[AudioPlayer] Streaming URL: ${url}`);
  }

  /**
   * Vérifier si un morceau est en cours de lecture
   */
  isTrackPlaying() {
    return this.isPlaying;
  }

  /**
   * Obtenir le pourcentage de progression
   */
  getProgressPercentage() {
    if (this.audio.duration) {
      return (this.audio.currentTime / this.audio.duration) * 100;
    }
    return 0;
  }

  /**
   * Obtenir le buffer chargé (pourcentage)
   */
  getBufferedPercentage() {
    if (this.audio.buffered.length > 0 && this.audio.duration) {
      const bufferedEnd = this.audio.buffered.end(this.audio.buffered.length - 1);
      return (bufferedEnd / this.audio.duration) * 100;
    }
    return 0;
  }

  /**
   * Définir la vitesse de lecture
   */
  setPlaybackRate(rate) {
    if (rate >= 0.5 && rate <= 2.0) {
      this.audio.playbackRate = rate;
      console.log(`[AudioPlayer] Vitesse: ${rate}x`);
    }
  }

  /**
   * Obtenir la vitesse de lecture
   */
  getPlaybackRate() {
    return this.audio.playbackRate;
  }
}

// Export pour utilisation en module (optionnel)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AudioPlayer;
}