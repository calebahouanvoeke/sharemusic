// client/src/js/UIController.js

class UIController {
  constructor() {
    this.networkClient = null;
    this.audioPlayer = null;
    this.currentCatalog = null;
    this.allTracks = [];
    this.filteredTracks = [];
    this.currentPlayingTrackId = null;
    
    this.init();
  }

  /**
   * Initialiser l'application
   */
  init() {
    console.log('[UIController] Initialisation...');
    
    const savedUserName = localStorage.getItem('sharemusic_user_name');
    
    if (savedUserName) {
      this.showMainScreen(savedUserName);
    } else {
      this.showLoginScreen();
    }
    
    this.setupEventListeners();
  }

  /**
   * Configurer les écouteurs d'événements
   */
  setupEventListeners() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const userName = document.getElementById('userName').value.trim();
        if (userName) {
          this.handleLogin(userName);
        }
      });
    }

    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.handleSearch(e.target.value);
      });
    }

    const genreFilter = document.getElementById('genreFilter');
    if (genreFilter) {
      genreFilter.addEventListener('change', () => {
        this.applyFilters();
      });
    }

    const userFilter = document.getElementById('userFilter');
    if (userFilter) {
      userFilter.addEventListener('change', () => {
        this.applyFilters();
      });
    }

    const clearFilters = document.getElementById('clearFilters');
    if (clearFilters) {
      clearFilters.addEventListener('click', () => {
        this.clearFilters();
      });
    }

    this.setupPlayerControls();
  }

  /**
   * Configurer les contrôles du lecteur
   */
  setupPlayerControls() {
    const btnPlayPause = document.getElementById('btnPlayPause');
    const btnPrevious = document.getElementById('btnPrevious');
    const btnNext = document.getElementById('btnNext');
    const btnMute = document.getElementById('btnMute');
    const playerProgress = document.getElementById('playerProgress');
    const volumeSlider = document.getElementById('volumeSlider');

    if (btnPlayPause) {
      btnPlayPause.addEventListener('click', () => {
        if (this.audioPlayer) {
          this.audioPlayer.togglePlayPause();
        }
      });
    }

    if (btnPrevious) {
      btnPrevious.addEventListener('click', () => {
        if (this.audioPlayer) {
          this.audioPlayer.playPrevious();
        }
      });
    }

    if (btnNext) {
      btnNext.addEventListener('click', () => {
        if (this.audioPlayer) {
          this.audioPlayer.playNext();
        }
      });
    }

    if (btnMute) {
      btnMute.addEventListener('click', () => {
        if (this.audioPlayer) {
          const muted = this.audioPlayer.toggleMute();
          this.updateMuteButton(muted);
        }
      });
    }

    if (playerProgress) {
      playerProgress.addEventListener('click', (e) => {
        if (this.audioPlayer) {
          const rect = playerProgress.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const percentage = (x / rect.width) * 100;
          this.audioPlayer.seekToPercentage(percentage);
        }
      });
    }

    if (volumeSlider) {
      volumeSlider.addEventListener('click', (e) => {
        if (this.audioPlayer) {
          const rect = volumeSlider.getBoundingClientRect();
          const x = e.clientX - rect.left;
          const percentage = (x / rect.width) * 100;
          this.audioPlayer.setVolume(percentage);
          this.updateVolumeDisplay(percentage);
        }
      });
    }
  }

  showLoginScreen() {
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('mainScreen').classList.add('hidden');
  }

  showMainScreen(userName) {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('mainScreen').classList.remove('hidden');
    document.getElementById('currentUserName').textContent = userName;
    
    this.initializeNetworkAndPlayer();
  }

  handleLogin(userName) {
    localStorage.setItem('sharemusic_user_name', userName);
    this.showMainScreen(userName);
  }

  /**
   * ✅ MODIFIÉ : Découverte automatique du Host avec SweetAlert
   */
  async initializeNetworkAndPlayer() {
    console.log('[UIController] ═══════════════════════════════════════');
    console.log('[UIController] INITIALISATION RÉSEAU ET LECTEUR');
    console.log('[UIController] ═══════════════════════════════════════');
    
    this.showLoadingModal();

    this.audioPlayer = new AudioPlayer();
    this.setupAudioPlayerCallbacks();

    this.networkClient = new NetworkClient();
    this.setupNetworkCallbacks();

    this.initializeMusicLibrary();

    try {
      console.log('[UIController] 🔍 Découverte du Host en cours...');
      const hostInfo = await this.discoverHost();
      
      console.log('[UIController] ✓ Host découvert:');
      console.log('[UIController]   → IP:', hostInfo.hostIp);
      console.log('[UIController]   → WebSocket:', `ws://${hostInfo.hostIp}:${hostInfo.wsPort}`);
      console.log('[UIController]   → Streaming:', `http://${hostInfo.hostIp}:${hostInfo.streamingPort}`);
      console.log('[UIController]   → Upload:', `http://${hostInfo.hostIp}:${hostInfo.uploadPort}`);
      
      this.audioPlayer.setStreamingBaseUrl(`http://${hostInfo.hostIp}:${hostInfo.streamingPort}`);
      this.hostInfo = hostInfo;
      this.networkClient.connect(hostInfo.hostIp, hostInfo.wsPort);
      
    } catch (err) {
      console.error('[UIController] ❌ Erreur découverte Host:', err);
      this.hideLoadingModal();
      
      // ✅ SWEETALERT : Erreur de connexion
      await Swal.fire({
        icon: 'error',
        title: 'Impossible de se connecter',
        html: `
          <div style="text-align: left;">
            <p><strong>❌ Erreur de connexion au réseau ShareMusic</strong></p>
            <br>
            <p><strong>Vérifiez que :</strong></p>
            <ul style="margin-left: 20px;">
              <li>Le serveur backend est lancé (<code>npm run dev</code>)</li>
              <li>Vous êtes sur le <strong>même réseau Wi-Fi</strong></li>
              <li>Le firewall autorise les connexions (ports 3000, 3001, 8080, 5500)</li>
            </ul>
            <br>
            <details style="margin-top: 10px;">
              <summary style="cursor: pointer; color: #667eea;">Détails techniques</summary>
              <p style="font-size: 12px; color: #666; margin-top: 5px;">
                ${err.message}
              </p>
            </details>
          </div>
        `,
        confirmButtonText: 'Réessayer',
        confirmButtonColor: '#667eea',
        showCancelButton: true,
        cancelButtonText: 'Annuler',
        cancelButtonColor: '#cbd5e0',
        allowOutsideClick: false
      }).then((result) => {
        if (result.isConfirmed) {
          window.location.reload();
        }
      });
    }
  }

  /**
   * ✅ MODIFIÉ : Découverte automatique universelle avec messages adaptés
   */
// client/src/js/UIController.js

/**
 * ✅ MODIFIÉ : Découverte automatique avec détection IP AVANT la requête
 */
async discoverHost() {
  const maxRetries = 20;
  const retryDelay = 1000;
  let attempts = 0;

  // ✅ CRITIQUE : Détecter l'IP AVANT d'appeler l'API
  const currentHost = window.location.hostname;
  const isLocal = (currentHost === 'localhost' || 
                  currentHost === '127.0.0.1' || 
                  currentHost === '' ||
                  currentHost === '::1');
  
  // ✅ Si on accède depuis une IP (mobile), utiliser cette IP pour tout
  const backendIp = isLocal ? 'localhost' : currentHost;
  
  // ✅ Stocker IMMÉDIATEMENT (au cas où ça n'a pas été fait avant)
  localStorage.setItem('sharemusic_backend_ip', backendIp);
  
  const deviceType = localStorage.getItem('sharemusic_device_type') || 'Unknown';
  const accessMode = isLocal ? 'local' : 'remote';
  const backendUrl = `http://${backendIp}:3001/api/host-info`;
  
  console.log('[UIController] ═══════════════════════════════════════');
  console.log('[UIController] DÉCOUVERTE DU HOST');
  console.log('[UIController] ═══════════════════════════════════════');
  console.log(`[UIController] 📱 Appareil: ${deviceType}`);
  console.log(`[UIController] 🌐 Mode: ${accessMode.toUpperCase()}`);
  console.log(`[UIController] 🔗 Backend IP: ${backendIp}`);
  console.log(`[UIController] 🔗 Backend URL: ${backendUrl}`);
  console.log('[UIController] ');

  const loadingText = document.getElementById('loadingText');
  if (loadingText) {
    if (accessMode === 'remote') {
      loadingText.textContent = `📱 Connexion au réseau ShareMusic depuis ${deviceType}...`;
    } else {
      loadingText.textContent = '💻 Connexion au réseau ShareMusic...';
    }
  }

  while (attempts < maxRetries) {
    try {
      attempts++;
      console.log(`[UIController] 🔄 Tentative ${attempts}/${maxRetries}...`);
      
      const response = await fetch(backendUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        },
        signal: AbortSignal.timeout(5000)
      });
      
      if (response.ok) {
        const hostInfo = await response.json();
        console.log('[UIController] ✅ Réponse backend:', hostInfo);
        
        // ✅ CRITIQUE : Si on est en mode distant, forcer l'IP du serveur
        if (!isLocal) {
          console.log(`[UIController] 📱 Mode distant détecté, override hostIp: ${backendIp}`);
          hostInfo.hostIp = backendIp; // ✅ Forcer l'IP réelle du serveur
        }
        
        console.log('[UIController] ✅ Host final:', hostInfo);
        console.log('[UIController] ');
        
        if (loadingText) {
          loadingText.textContent = hostInfo.isHost ? 
            '🎯 Vous êtes le coordinateur !' : 
            `✅ Connecté au réseau ShareMusic !`;
        }
        
        return hostInfo;
      }
      
      if (response.status === 503) {
        const errorData = await response.json();
        console.log(`[UIController] ⏳ ${errorData.message || 'Découverte en cours...'}`);
        
        if (loadingText) {
          loadingText.textContent = `⏳ Découverte du réseau (${attempts}/${maxRetries})...`;
        }
        
        await this.sleep(retryDelay);
        continue;
      }
      
      throw new Error(`Erreur HTTP ${response.status}: ${response.statusText}`);
      
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        console.warn(`[UIController] ⏱️  Timeout (tentative ${attempts})`);
      } else {
        console.warn(`[UIController] ⚠️  Tentative ${attempts} échouée:`, err.message);
      }
      
      if (attempts < maxRetries) {
        console.log('[UIController] → Nouvelle tentative dans 1 seconde...');
        
        if (loadingText) {
          loadingText.textContent = `⏳ Tentative ${attempts}/${maxRetries}...`;
        }
        
        await this.sleep(retryDelay);
      } else {
        let errorMessage = `❌ Impossible de découvrir le réseau ShareMusic après ${maxRetries} tentatives.\n\n`;
        
        if (accessMode === 'remote') {
          errorMessage += `📱 Appareil: ${deviceType}\n`;
          errorMessage += `🌐 Serveur: ${backendIp}\n\n`;
          errorMessage += `Vérifiez que:\n`;
          errorMessage += `1. Un PC avec ShareMusic est actif sur le réseau\n`;
          errorMessage += `2. Vous êtes sur le MÊME réseau Wi-Fi\n`;
          errorMessage += `3. L'IP est correcte (${backendIp})\n`;
          errorMessage += `4. Le backend tourne sur le PC (npm run dev)\n`;
          errorMessage += `5. Le firewall autorise les connexions\n\n`;
          errorMessage += `💡 Astuce: Vérifiez l'IP du PC avec "ipconfig" (Windows) ou "ifconfig" (Mac/Linux)`;
        } else {
          errorMessage += `💻 Mode: LOCAL\n\n`;
          errorMessage += `Vérifiez que:\n`;
          errorMessage += `1. Le backend est lancé: npm run dev\n`;
          errorMessage += `2. Le port 3001 n'est pas bloqué\n`;
          errorMessage += `3. Node.js fonctionne correctement\n\n`;
          errorMessage += `Erreur: ${err.message}`;
        }
        
        throw new Error(errorMessage);
      }
    }
  }
}

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  setupAudioPlayerCallbacks() {
    this.audioPlayer.on('play', (track) => {
      this.updatePlayerUI(track);
      this.updatePlayPauseButton(true);
      this.updateNowPlayingIndicator(track);
    });

    this.audioPlayer.on('pause', () => {
      this.updatePlayPauseButton(false);
    });

    this.audioPlayer.on('stop', () => {
      this.updatePlayPauseButton(false);
      this.removeNowPlayingIndicator();
    });

    this.audioPlayer.on('timeUpdate', (data) => {
      this.updateProgressBar(data.percentage);
      this.updateTimeDisplay(data.currentTime, data.duration);
    });

    this.audioPlayer.on('error', (error) => {
      console.error('[UIController] Erreur lecteur:', error);
      
      // ✅ SWEETALERT : Erreur de lecture
      Swal.fire({
        icon: 'error',
        title: 'Erreur de lecture',
        text: 'Impossible de lire ce morceau. Vérifiez que le serveur de streaming est actif.',
        confirmButtonText: 'Ok',
        confirmButtonColor: '#667eea',
        timer: 3000,
        timerProgressBar: true
      });
      
      this.removeNowPlayingIndicator();
    });
  }

// client/src/js/UIController.js

setupNetworkCallbacks() {
  this.networkClient.on('connected', () => {
    console.log('[UIController] ✓ Connecté au réseau WebSocket');
    this.hideLoadingModal();
    this.updateConnectionStatus(true);
  });

  this.networkClient.on('disconnected', () => {
    console.log('[UIController] ⚠️  Déconnecté du réseau WebSocket');
    this.updateConnectionStatus(false);
    
    // ✅ NE PAS afficher l'alerte sur mobile (éviter les faux positifs)
    const deviceType = localStorage.getItem('sharemusic_device_type') || 'Unknown';
    const isMobile = deviceType === 'Android' || deviceType === 'iPhone/iPad';
    
    if (!isMobile) {
      // Seulement sur PC
      Swal.fire({
        icon: 'warning',
        title: 'Déconnecté',
        text: 'Vous avez été déconnecté du réseau ShareMusic',
        confirmButtonText: 'Reconnexion',
        confirmButtonColor: '#667eea',
        timer: 5000,
        timerProgressBar: true
      }).then((result) => {
        if (result.isConfirmed) {
          window.location.reload();
        }
      });
    } else {
      // Sur mobile : juste logger + tentative de reconnexion silencieuse
      console.log('[UIController] 📱 Déconnexion mobile détectée, tentative de reconnexion...');
      
      // Tentative de reconnexion automatique après 2 secondes
      setTimeout(() => {
        if (!this.networkClient.isWebSocketConnected()) {
          console.log('[UIController] Reconnexion automatique...');
          const hostIp = this.hostInfo?.hostIp || 'localhost';
          const wsPort = this.hostInfo?.wsPort || 8080;
          this.networkClient.connect(hostIp, wsPort);
        }
      }, 2000);
    }
  });

  this.networkClient.on('catalogUpdate', (xmlData, totalUsers) => {
    console.log('[UIController] 📥 Catalogue reçu (mis à jour)');
    this.handleCatalogUpdate(xmlData, totalUsers);
  });

  this.networkClient.on('error', (error) => {
    console.error('[UIController] ❌ Erreur réseau:', error);
    this.hideLoadingModal();
  });
}

  handleCatalogUpdate(xmlData, totalUsers) {
    try {
      console.log('[UIController] Traitement du catalogue mis à jour...');
      
      this.currentCatalog = xmlData;
      this.extractTracksFromCatalog(xmlData);
      
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlData, 'text/xml');
      const users = xmlDoc.querySelectorAll('user');
      const actualUserCount = users.length;
      
      this.updateNetworkInfo(actualUserCount, this.allTracks.length);
      this.updateUserFilter();
      this.displayTracks(this.allTracks);
      
      console.log(`[UIController] ✓ Catalogue traité: ${actualUserCount} utilisateur(s), ${this.allTracks.length} morceau(x)`);
      
    } catch (err) {
      console.error('[UIController] ❌ Erreur parsing catalogue:', err);
    }
  }

  extractTracksFromCatalog(xmlData) {
    this.allTracks = [];
    
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlData, 'text/xml');
      
      const parseError = xmlDoc.querySelector('parsererror');
      if (parseError) {
        console.error('[UIController] Erreur parsing XML:', parseError.textContent);
        return;
      }
      
      const users = xmlDoc.querySelectorAll('user');
      
      users.forEach(userElement => {
        const deviceId = userElement.getAttribute('device_id');
        const userName = userElement.querySelector('nom')?.textContent || 'Inconnu';
        
        const musiques = userElement.querySelectorAll('musique');
        
        musiques.forEach(musique => {
          const track = {
            deviceId: deviceId,
            trackId: musique.getAttribute('id_musique'),
            titre: musique.querySelector('titre')?.textContent || 'Sans titre',
            artistes: Array.from(musique.querySelectorAll('artiste')).map(a => a.textContent),
            album: musique.querySelector('album')?.textContent || null,
            genre: musique.getAttribute('genre') || 'Autres',
            duree: parseInt(musique.querySelector('duree')?.textContent) || 0,
            format: musique.getAttribute('format') || 'mp3',
            userName: userName
          };
          
          this.allTracks.push(track);
        });
      });
      
      console.log('[UIController] ✓ Extraction terminée:', this.allTracks.length, 'tracks');
      this.filteredTracks = [...this.allTracks];
      
    } catch (err) {
      console.error('[UIController] ❌ Erreur extraction tracks:', err);
    }
  }

  displayTracks(tracks) {
    const grid = document.getElementById('tracksGrid');
    
    if (!tracks || tracks.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon"><i class="fa-solid fa-wifi"></i></div>
          <h3>Aucun morceau disponible</h3>
          <p>En attente de musique sur le réseau...</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = '';
    
    tracks.forEach(track => {
      const card = this.createTrackCard(track);
      grid.appendChild(card);
    });

    if (this.audioPlayer) {
      this.audioPlayer.setPlaylist(tracks);
    }
    
    if (this.currentPlayingTrackId) {
      const currentTrack = tracks.find(t => 
        t.deviceId === this.currentPlayingTrackId.deviceId && 
        t.trackId === this.currentPlayingTrackId.trackId
      );
      if (currentTrack) {
        this.updateNowPlayingIndicator(currentTrack);
      }
    }
  }

  createTrackCard(track) {
    const card = document.createElement('div');
    card.className = 'track-card';
    card.dataset.deviceId = track.deviceId;
    card.dataset.trackId = track.trackId;
    
    const duration = this.formatDuration(track.duree);
    const isPlaying = this.currentPlayingTrackId && 
                     this.currentPlayingTrackId.deviceId === track.deviceId && 
                     this.currentPlayingTrackId.trackId === track.trackId;
    
    card.innerHTML = `
      ${isPlaying ? '<div class="now-playing-indicator"><i class="fa-solid fa-volume-high"></i><span>En lecture</span></div>' : ''}
      <div class="track-cover">
        <i class="fa-solid fa-compact-disc track-cover-icon"></i>
        ${isPlaying ? '<div class="playing-animation"><span></span><span></span><span></span></div>' : ''}
      </div>
      <div class="track-info">
        <div class="track-title">${track.titre}</div>
        <div class="track-artist">
          <i class="fa-solid fa-microphone"></i>
          ${track.artistes.join(', ')}
        </div>
        <div class="track-meta">
          <span class="track-badge">
            <i class="fa-solid fa-music"></i>
            ${track.genre}
          </span>
          ${track.album ? `<span class="track-badge"><i class="fa-solid fa-record-vinyl"></i>${track.album}</span>` : ''}
          <span class="track-badge">
            <i class="fa-regular fa-clock"></i>
            ${duration}
          </span>
          <span class="track-badge">
            <i class="fa-solid fa-file-audio"></i>
            ${track.format.toUpperCase()}
          </span>
        </div>
        <div class="track-user">
          <i class="fa-solid fa-user"></i>
          <span>${track.userName}</span>
        </div>
      </div>
      <div class="track-actions">
        <button class="btn-play" title="${isPlaying ? 'En lecture' : 'Écouter'}">
          <i class="fa-solid fa-${isPlaying ? 'pause' : 'play'}"></i>
          <span>${isPlaying ? 'En lecture' : 'Écouter'}</span>
        </button>
      </div>
    `;

    const playBtn = card.querySelector('.btn-play');
    playBtn.addEventListener('click', () => {
      if (isPlaying && this.audioPlayer.isPlaying) {
        this.audioPlayer.pause();
      } else {
        this.playTrack(track);
      }
    });

    return card;
  }

  updateNowPlayingIndicator(track) {
    this.removeNowPlayingIndicator();
    
    this.currentPlayingTrackId = {
      deviceId: track.deviceId,
      trackId: track.trackId
    };
    
    const cards = document.querySelectorAll('.track-card');
    cards.forEach(card => {
      if (card.dataset.deviceId === track.deviceId && card.dataset.trackId === track.trackId) {
        card.classList.add('now-playing');
        
        if (!card.querySelector('.now-playing-indicator')) {
          const indicator = document.createElement('div');
          indicator.className = 'now-playing-indicator';
          indicator.innerHTML = '<i class="fa-solid fa-volume-high"></i><span>En lecture</span>';
          card.insertBefore(indicator, card.firstChild);
        }
        
        const coverDiv = card.querySelector('.track-cover');
        if (coverDiv && !coverDiv.querySelector('.playing-animation')) {
          const animation = document.createElement('div');
          animation.className = 'playing-animation';
          animation.innerHTML = '<span></span><span></span><span></span>';
          coverDiv.appendChild(animation);
        }
        
        const playBtn = card.querySelector('.btn-play');
        if (playBtn) {
          playBtn.innerHTML = '<i class="fa-solid fa-pause"></i><span>En lecture</span>';
          playBtn.title = 'En lecture';
        }
      }
    });
  }

  removeNowPlayingIndicator() {
    const cards = document.querySelectorAll('.track-card.now-playing');
    cards.forEach(card => {
      card.classList.remove('now-playing');
      
      const indicator = card.querySelector('.now-playing-indicator');
      if (indicator) indicator.remove();
      
      const animation = card.querySelector('.playing-animation');
      if (animation) animation.remove();
      
      const playBtn = card.querySelector('.btn-play');
      if (playBtn) {
        playBtn.innerHTML = '<i class="fa-solid fa-play"></i><span>Écouter</span>';
        playBtn.title = 'Écouter';
      }
    });
    
    this.currentPlayingTrackId = null;
  }

  playTrack(track) {
    if (this.audioPlayer) {
      this.audioPlayer.play(track.deviceId, track.trackId, track);
      console.log('[UIController] ▶️  Lecture:', track.titre);
    }
  }

  formatDuration(seconds) {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  handleSearch(query) {
    query = query.toLowerCase().trim();
    
    if (!query) {
      this.applyFilters();
      return;
    }

    this.filteredTracks = this.allTracks.filter(track => {
      return (
        track.titre.toLowerCase().includes(query) ||
        track.artistes.some(a => a.toLowerCase().includes(query)) ||
        (track.album && track.album.toLowerCase().includes(query))
      );
    });

    this.displayTracks(this.filteredTracks);
  }

  applyFilters() {
    const genre = document.getElementById('genreFilter').value;
    const user = document.getElementById('userFilter').value;

    this.filteredTracks = this.allTracks.filter(track => {
      const genreMatch = !genre || track.genre === genre;
      const userMatch = !user || track.userName === user;
      return genreMatch && userMatch;
    });

    this.displayTracks(this.filteredTracks);
  }

  clearFilters() {
    document.getElementById('searchInput').value = '';
    document.getElementById('genreFilter').value = '';
    document.getElementById('userFilter').value = '';
    this.filteredTracks = [...this.allTracks];
    this.displayTracks(this.filteredTracks);
  }

  updateUserFilter() {
    const userFilter = document.getElementById('userFilter');
    const users = [...new Set(this.allTracks.map(t => t.userName))];
    
    userFilter.innerHTML = '<option value="">Tous les utilisateurs</option>';
    users.forEach(user => {
      const option = document.createElement('option');
      option.value = user;
      option.textContent = user;
      userFilter.appendChild(option);
    });
  }

  updateNetworkInfo(usersCount, tracksCount) {
    document.getElementById('usersCount').innerHTML = 
      `<i class="fa-solid fa-users"></i> ${usersCount}`;
    document.getElementById('tracksCount').innerHTML = 
      `<i class="fa-solid fa-compact-disc"></i> ${tracksCount}`;
  }

  updateConnectionStatus(connected) {
    const status = document.getElementById('connectionStatus');
    if (connected) {
      status.classList.add('connected');
      status.querySelector('.status-text').textContent = 'Connecté';
    } else {
      status.classList.remove('connected');
      status.querySelector('.status-text').textContent = 'Déconnecté';
    }
  }

  updatePlayerUI(track) {
    document.getElementById('playerTitle').textContent = track.titre || 'Sans titre';
    document.getElementById('playerArtist').textContent = 
      track.artistes ? track.artistes.join(', ') : 'Artiste inconnu';
    
    document.getElementById('btnPlayPause').disabled = false;
    document.getElementById('btnPrevious').disabled = false;
    document.getElementById('btnNext').disabled = false;
  }

  updatePlayPauseButton(isPlaying) {
    const playIcon = document.querySelector('.play-icon');
    const pauseIcon = document.querySelector('.pause-icon');
    
    if (isPlaying) {
      playIcon.classList.add('hidden');
      pauseIcon.classList.remove('hidden');
    } else {
      playIcon.classList.remove('hidden');
      pauseIcon.classList.add('hidden');
    }
  }

  updateProgressBar(percentage) {
    document.getElementById('playerProgressFill').style.width = percentage + '%';
  }

  updateTimeDisplay(currentTime, duration) {
    if (this.audioPlayer) {
      document.getElementById('playerCurrentTime').textContent = 
        this.audioPlayer.formatTime(currentTime);
      document.getElementById('playerDuration').textContent = 
        this.audioPlayer.formatTime(duration);
    }
  }

  updateMuteButton(muted) {
    const volumeIcon = document.querySelector('.volume-icon');
    const muteIcon = document.querySelector('.mute-icon');
    
    if (muted) {
      volumeIcon.classList.add('hidden');
      muteIcon.classList.remove('hidden');
    } else {
      volumeIcon.classList.remove('hidden');
      muteIcon.classList.add('hidden');
    }
  }

  updateVolumeDisplay(percentage) {
    document.getElementById('volumeFill').style.width = percentage + '%';
    document.getElementById('volumeValue').textContent = Math.round(percentage) + '%';
  }

  // ═══════════════════════════════════════════════════════════
  // GESTION DE LA BIBLIOTHÈQUE MUSICALE
  // ═══════════════════════════════════════════════════════════

  initializeMusicLibrary() {
    this.musicLibrary = new MusicLibraryManager();
    console.log('[UIController] Bibliothèque initialisée:', this.musicLibrary.getTrackCount(), 'morceaux');
    
    if (this.networkClient && this.networkClient.isWebSocketConnected()) {
      this.syncLibrary();
    }
  }

  openLibraryModal() {
    const modal = document.getElementById('libraryModal');
    modal.classList.remove('hidden');
    this.refreshLibraryDisplay();
  }

  closeLibraryModal() {
    const modal = document.getElementById('libraryModal');
    modal.classList.add('hidden');
  }

  refreshLibraryDisplay() {
    const library = this.musicLibrary.getLibrary();
    
    document.getElementById('libraryTrackCount').textContent = library.length;
    
    const totalSize = library.reduce((sum, track) => sum + (track.filesize || 0), 0);
    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
    document.getElementById('libraryTotalSize').textContent = totalSizeMB + ' MB';
    
    const trackList = document.getElementById('libraryTrackList');
    
    if (library.length === 0) {
      trackList.innerHTML = `
        <div class="empty-library">
          <i class="fa-solid fa-record-vinyl empty-icon"></i>
          <p>Aucun morceau dans votre bibliothèque</p>
          <p class="empty-subtitle">Cliquez sur "Importer des fichiers" pour commencer</p>
        </div>
      `;
      return;
    }
    
    trackList.innerHTML = '';
    
    library.forEach(track => {
      const item = this.createLibraryTrackItem(track);
      trackList.appendChild(item);
    });
  }

  createLibraryTrackItem(track) {
    const div = document.createElement('div');
    div.className = 'library-track-item';
    
    const duration = this.formatDuration(track.duree);
    const artists = Array.isArray(track.artistes) ? track.artistes.join(', ') : track.artistes;
    
    div.innerHTML = `
      <div class="track-item-title">
        <i class="fa-solid fa-music"></i>
        ${track.titre}
      </div>
      <div class="track-item-artist">${artists}</div>
      <div class="track-item-album">${track.album || '-'}</div>
      <div class="track-item-duration">${duration}</div>
      <div class="track-item-format">${track.format.toUpperCase()}</div>
      <div class="track-item-actions">
        <button class="track-action-btn" onclick="uiController.playLibraryTrack('${track.id_musique}')" title="Écouter">
          <i class="fa-solid fa-play"></i>
        </button>
        <button class="track-action-btn" onclick="uiController.removeLibraryTrack('${track.id_musique}')" title="Supprimer">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    `;
    
    return div;
  }

  /**
   * ✅ MODIFIÉ : Ajout de fichiers avec SweetAlert
   */
// client/src/js/UIController.js

/**
 * ✅ MODIFIÉ : Gestion détaillée des erreurs de fichiers
 */
async handleFileSelect(event) {
  const files = Array.from(event.target.files);
  
  if (files.length === 0) {
    return;
  }
  
  console.log('[UIController] Fichiers sélectionnés:', files.length);
  
  this.showUploadProgress(files.length);
  
  try {
    const results = await this.musicLibrary.addFiles(files);
    
    console.log('[UIController] Résultats:', results);
    
    // ✅ Construire le message selon les résultats
    let hasErrors = results.errors.length > 0 || 
                    results.tooLarge.length > 0 || 
                    results.unsupportedFormat.length > 0;
    
    if (hasErrors) {
      // ✅ Cas avec erreurs
      let htmlMessage = '';
      
      if (results.success.length > 0) {
        htmlMessage += `<p style="color: #48bb78; font-size: 16px; margin-bottom: 15px;">
          <strong>✅ ${results.success.length} fichier(s) ajouté(s) avec succès</strong>
        </p>`;
      }
      
      // ✅ Fichiers trop volumineux
      if (results.tooLarge.length > 0) {
        htmlMessage += `<div style="background: #fff3cd; padding: 15px; border-radius: 8px; margin-bottom: 15px; text-align: left;">
          <p style="color: #856404; font-weight: bold; margin-bottom: 10px;">
            ⚠️ ${results.tooLarge.length} fichier(s) trop volumineux :
          </p>
          <ul style="margin: 0; padding-left: 20px; color: #856404;">`;
        
        results.tooLarge.forEach(item => {
          htmlMessage += `<li style="margin-bottom: 5px;">
            <strong>${item.file}</strong><br>
            <small>Taille : ${item.size} (max : ${item.maxSize})</small>
          </li>`;
        });
        
        htmlMessage += `</ul>
          <p style="margin-top: 10px; font-size: 13px; color: #856404;">
            💡 Conseil : Compressez vos fichiers ou utilisez un format plus léger
          </p>
        </div>`;
      }
      
      // ✅ Formats non supportés
      if (results.unsupportedFormat.length > 0) {
        htmlMessage += `<div style="background: #f8d7da; padding: 15px; border-radius: 8px; margin-bottom: 15px; text-align: left;">
          <p style="color: #721c24; font-weight: bold; margin-bottom: 10px;">
            ❌ ${results.unsupportedFormat.length} format(s) non supporté(s) :
          </p>
          <ul style="margin: 0; padding-left: 20px; color: #721c24;">`;
        
        results.unsupportedFormat.forEach(item => {
          htmlMessage += `<li>${item.file}</li>`;
        });
        
        htmlMessage += `</ul>
          <p style="margin-top: 10px; font-size: 13px; color: #721c24;">
            💡 Formats acceptés : MP3, FLAC, AAC, OGG, WAV, M4A
          </p>
        </div>`;
      }
      
      // ✅ Autres erreurs
      if (results.errors.length > 0) {
        htmlMessage += `<div style="background: #f8d7da; padding: 15px; border-radius: 8px; text-align: left;">
          <p style="color: #721c24; font-weight: bold; margin-bottom: 10px;">
            ❌ ${results.errors.length} erreur(s) détectée(s)
          </p>
          <p style="font-size: 13px; color: #721c24;">
            Consultez la console (F12) pour plus de détails
          </p>
        </div>`;
        
        console.error('[UIController] Erreurs détaillées:', results.errors);
      }
      
      await Swal.fire({
        icon: 'warning',
        title: 'Ajout partiel',
        html: htmlMessage,
        confirmButtonText: 'Ok',
        confirmButtonColor: '#667eea',
        width: '600px'
      });
      
    } else {
      // ✅ Tout s'est bien passé
      const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 2000,
        timerProgressBar: true
      });
      
      Toast.fire({
        icon: 'success',
        title: `✅ ${results.success.length} morceau(x) ajouté(s)`
      });
    }
    
    this.refreshLibraryDisplay();
    await this.syncLibrary();
    
  } catch (err) {
    console.error('[UIController] Erreur lors de l\'ajout des fichiers:', err);
    
    await Swal.fire({
      icon: 'error',
      title: 'Erreur',
      text: 'Une erreur est survenue lors de l\'ajout des fichiers',
      confirmButtonText: 'Ok',
      confirmButtonColor: '#667eea'
    });
  } finally {
    this.hideUploadProgress();
    event.target.value = '';
  }
}

  showUploadProgress(fileCount) {
    const trackList = document.getElementById('libraryTrackList');
    const progressHtml = `
      <div class="upload-progress">
        <i class="fa-solid fa-cloud-arrow-up upload-icon"></i>
        <div>Ajout de ${fileCount} fichier(s)...</div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: 0%"></div>
        </div>
        <div class="progress-text">En cours...</div>
      </div>
    `;
    trackList.insertAdjacentHTML('afterbegin', progressHtml);
  }

  hideUploadProgress() {
    const progress = document.querySelector('.upload-progress');
    if (progress) {
      progress.remove();
    }
  }

  /**
   * ✅ MODIFIÉ : Synchronisation automatique avec SweetAlert
   */
  async syncLibrary() {
    if (!this.networkClient || !this.networkClient.isWebSocketConnected()) {
      await Swal.fire({
        icon: 'warning',
        title: 'Non connecté',
        text: 'Vous n\'êtes pas connecté au réseau ShareMusic',
        confirmButtonText: 'Ok',
        confirmButtonColor: '#667eea'
      });
      return;
    }
    
    console.log('[UIController] 🔄 Synchronisation de la bibliothèque...');
    
    try {
      const tracksToUpload = this.musicLibrary.getLibrary().filter(t => t.file && !t.serverPath);
      
      if (tracksToUpload.length > 0) {
        console.log(`[UIController] Upload de ${tracksToUpload.length} fichier(s)...`);
        
        this.showUploadProgress(tracksToUpload.length);
        
        const uploadUrl = `http://${this.hostInfo.hostIp}:${this.hostInfo.uploadPort}/api/upload`;
        console.log('[UIController] URL d\'upload:', uploadUrl);
        
        const formData = new FormData();
        formData.append('deviceId', this.networkClient.getDeviceId());
        
        tracksToUpload.forEach((track, index) => {
          formData.append('files', track.file);
          formData.append(`metadata_${index}`, JSON.stringify({
            id_musique: track.id_musique,
            titre: track.titre,
            artistes: track.artistes,
            album: track.album,
            genre: track.genre,
            format: track.format
          }));
        });
        
        const response = await fetch(uploadUrl, {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok) {
          throw new Error('Erreur upload: ' + response.statusText);
        }
        
        const result = await response.json();
        console.log('[UIController] Upload réussi:', result);
        
        if (result.success && result.files) {
          result.files.forEach(fileInfo => {
            const track = this.musicLibrary.getTrack(fileInfo.trackId);
            if (track) {
              track.serverPath = fileInfo.serverPath;
              console.log(`[UIController] serverPath mis à jour: ${track.titre} -> ${fileInfo.serverPath}`);
            }
          });
          this.musicLibrary.saveLibraryToStorage();
        }
        
        this.hideUploadProgress();
      } else {
        console.log('[UIController] Tous les fichiers sont déjà uploadés');
      }
      
      const deviceId = this.networkClient.getDeviceId();
      const userName = this.networkClient.getUserName();
      const catalogXml = this.musicLibrary.generateCatalogXML(deviceId, userName);
      
      console.log('[UIController] Catalogue XML généré');
      this.networkClient.sendCatalog(catalogXml);
      
      console.log('[UIController] ✅ Catalogue envoyé au serveur');
      
      // ✅ SWEETALERT : Succès de la synchronisation
      await Swal.fire({
        icon: 'success',
        title: 'Synchronisation réussie !',
        html: `
          <div style="text-align: center;">
            <p style="font-size: 16px; margin-bottom: 10px;">
              ✅ Votre bibliothèque a été synchronisée avec le réseau
            </p>
            <p style="font-size: 14px; color: #48bb78;">
              Les autres utilisateurs peuvent maintenant voir et écouter vos morceaux
            </p>
          </div>
        `,
        confirmButtonText: 'Super !',
        confirmButtonColor: '#667eea'
      });
      
    } catch (err) {
      console.error('[UIController] Erreur synchronisation:', err);
      
      // ✅ SWEETALERT : Erreur de synchronisation
      await Swal.fire({
        icon: 'error',
        title: 'Erreur de synchronisation',
        html: `
          <div style="text-align: left;">
            <p><strong>❌ Impossible de synchroniser votre bibliothèque</strong></p>
            <br>
            <details>
              <summary style="cursor: pointer; color: #667eea;">Détails de l'erreur</summary>
              <p style="font-size: 12px; color: #666; margin-top: 5px;">
                ${err.message}
              </p>
            </details>
          </div>
        `,
        confirmButtonText: 'Ok',
        confirmButtonColor: '#667eea'
      });
      
      this.hideUploadProgress();
    }
  }

  /**
   * ✅ Lecture locale d'un morceau de la bibliothèque
   */
  playLibraryTrack(trackId) {
    const track = this.musicLibrary.getTrack(trackId);
    
    if (!track) {
      Swal.fire({
        icon: 'error',
        title: 'Morceau introuvable',
        text: 'Ce morceau n\'existe pas dans votre bibliothèque',
        confirmButtonText: 'Ok',
        confirmButtonColor: '#667eea'
      });
      return;
    }
    
    if (!track.file) {
      Swal.fire({
        icon: 'warning',
        title: 'Fichier non disponible',
        html: `
          <p>Le fichier n'est plus accessible localement.</p>
          <br>
          <p style="font-size: 13px; color: #666;">
            Veuillez ré-ajouter ce morceau à votre bibliothèque.
          </p>
        `,
        confirmButtonText: 'Ok',
        confirmButtonColor: '#667eea'
      });
      return;
    }
    
    try {
      const url = URL.createObjectURL(track.file);
      
      if (this.audioPlayer) {
        this.audioPlayer.audio.src = url;
        this.audioPlayer.currentTrack = track;
        this.audioPlayer.audio.play();
        
        this.updatePlayerUI(track);
        this.closeLibraryModal();
        
        this.audioPlayer.audio.addEventListener('ended', () => {
          URL.revokeObjectURL(url);
        }, { once: true });
      }
    } catch (err) {
      console.error('[UIController] Erreur lecture locale:', err);
      
      Swal.fire({
        icon: 'error',
        title: 'Erreur de lecture',
        text: 'Impossible de lire ce fichier localement',
        confirmButtonText: 'Ok',
        confirmButtonColor: '#667eea'
      });
    }
  }

  /**
   * ✅ MODIFIÉ : Suppression avec confirmation SweetAlert
   */
  removeLibraryTrack(trackId) {
    const track = this.musicLibrary.getTrack(trackId);
    
    Swal.fire({
      icon: 'question',
      title: 'Confirmer la suppression',
      html: `
        <p>Voulez-vous vraiment supprimer ce morceau ?</p>
        <br>
        <p style="font-weight: bold; color: #667eea;">${track.titre}</p>
        <p style="font-size: 13px; color: #666;">${track.artistes.join(', ')}</p>
      `,
      showCancelButton: true,
      confirmButtonText: 'Oui, supprimer',
      cancelButtonText: 'Annuler',
      confirmButtonColor: '#f56565',
      cancelButtonColor: '#cbd5e0'
    }).then((result) => {
      if (result.isConfirmed) {
        this.musicLibrary.removeTrack(trackId);
        this.refreshLibraryDisplay();
        this.syncLibrary();
        
        const Toast = Swal.mixin({
          toast: true,
          position: 'top-end',
          showConfirmButton: false,
          timer: 2000,
          timerProgressBar: true
        });
        
        Toast.fire({
          icon: 'success',
          title: 'Morceau supprimé'
        });
      }
    });
  }

  /**
   * ✅ MODIFIÉ : Suppression totale avec confirmation SweetAlert
   */
  clearLibrary() {
    Swal.fire({
      icon: 'warning',
      title: 'Attention !',
      html: `
        <p style="font-size: 16px;">Voulez-vous vraiment <strong style="color: #f56565;">vider toute votre bibliothèque</strong> ?</p>
        <br>
        <p style="font-size: 13px; color: #666;">
          Cette action est irréversible. Tous vos morceaux seront supprimés.
        </p>
      `,
      showCancelButton: true,
      confirmButtonText: 'Oui, tout supprimer',
      cancelButtonText: 'Annuler',
      confirmButtonColor: '#f56565',
      cancelButtonColor: '#cbd5e0'
    }).then((result) => {
      if (result.isConfirmed) {
        this.musicLibrary.clearLibrary();
        this.refreshLibraryDisplay();
        this.syncLibrary();
        
        Swal.fire({
          icon: 'success',
          title: 'Bibliothèque vidée',
          text: 'Tous vos morceaux ont été supprimés',
          timer: 2000,
          showConfirmButton: false
        });
      }
    });
  }

  showLoadingModal() {
    document.getElementById('loadingModal').classList.remove('hidden');
  }

  hideLoadingModal() {
    document.getElementById('loadingModal').classList.add('hidden');
  }
}

// ═══════════════════════════════════════════════════════════
// INITIALISATION
// ═══════════════════════════════════════════════════════════

let uiController = null;

window.addEventListener('DOMContentLoaded', () => {
  uiController = new UIController();
});