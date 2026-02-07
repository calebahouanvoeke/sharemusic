// client/src/js/NetworkClient.js

class NetworkClient {
  constructor() {
    this.ws = null;
    this.deviceId = this.getOrCreateDeviceId();
    this.userName = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 2000;
    
    // ✅ NOUVEAU : Stocker host et port pour reconnexion
    this.currentHost = null;
    this.currentPort = null;
    
    // ✅ NOUVEAU : Détecter si on est sur mobile
    const deviceType = localStorage.getItem('sharemusic_device_type') || 'PC/Desktop';
    this.isMobile = deviceType === 'Android' || deviceType === 'iPhone/iPad';
    
    // ✅ Sur mobile, ajuster les paramètres de reconnexion
    if (this.isMobile) {
      this.maxReconnectAttempts = 3;
      this.reconnectDelay = 3000;
      console.log('[NetworkClient] 📱 Mode mobile activé');
    }
    
    this.callbacks = {
      onConnected: null,
      onDisconnected: null,
      onCatalogUpdate: null,
      onError: null,
      onPing: null
    };
    
    this.mobileKeepAliveInterval = null;
  }

  /**
   * Obtenir ou créer un deviceId unique dans sessionStorage
   */
  getOrCreateDeviceId() {
    let deviceId = sessionStorage.getItem('sharemusic_device_id');
    
    if (!deviceId) {
      deviceId = 'device_web_' + this.generateUUID();
      sessionStorage.setItem('sharemusic_device_id', deviceId);
      console.log('[NetworkClient] Nouveau deviceId créé:', deviceId);
    } else {
      console.log('[NetworkClient] DeviceId existant:', deviceId);
    }
    
    return deviceId;
  }

  /**
   * Générer un UUID simple
   */
  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * Obtenir ou demander le nom d'utilisateur
   */
  getOrAskUserName() {
    let userName = localStorage.getItem('sharemusic_user_name');
    
    if (!userName) {
      userName = prompt('Entrez votre pseudo:');
      if (userName && userName.trim()) {
        userName = userName.trim();
        localStorage.setItem('sharemusic_user_name', userName);
      } else {
        userName = 'Utilisateur_' + Math.floor(Math.random() * 1000);
        localStorage.setItem('sharemusic_user_name', userName);
      }
    }
    
    this.userName = userName;
    return userName;
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
   * ✅ MODIFIÉ : Se connecter au serveur WebSocket avec stockage de host/port
   */
connect(host, port) {
  this.currentHost = host;
  this.currentPort = port;
  
  const url = `ws://${host}:${port}`;
  console.log('[NetworkClient] ═══════════════════════════════════════');
  console.log('[NetworkClient] CONNEXION WEBSOCKET');
  console.log('[NetworkClient] ═══════════════════════════════════════');
  console.log('[NetworkClient] URL:', url);
  console.log('[NetworkClient] Device:', this.deviceId);
  console.log('[NetworkClient] Mobile:', this.isMobile ? 'OUI' : 'NON');
  console.log('[NetworkClient] ');

  try {
    this.ws = new WebSocket(url);
    
    // ✅ NOUVEAU : Timeout de connexion (30 secondes pour mobile)
    let connectionTimeout = setTimeout(() => {
      if (this.ws.readyState !== WebSocket.OPEN) {
        console.error('[NetworkClient] ⏱️  Timeout de connexion (30s)');
        this.ws.close();
      }
    }, 30000);

    this.ws.onopen = () => {
      console.log('[NetworkClient] ✅ WebSocket CONNECTÉ');
      clearTimeout(connectionTimeout); // ✅ Annuler le timeout
      
      this.isConnected = true;
      this.reconnectAttempts = 0;
      
      this.authenticate();
      
      if (this.callbacks.onConnected) {
        this.callbacks.onConnected();
      }

      if (this.isMobile) {
        this.startMobileKeepAlive();
      }
    };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (error) => {
        console.error('[NetworkClient] ❌ Erreur WebSocket:', error);
        
        if (this.callbacks.onError) {
          this.callbacks.onError(error);
        }
      };

      this.ws.onclose = (event) => {
        console.log('[NetworkClient] ⚠️  WebSocket FERMÉ');
        console.log('[NetworkClient] Code:', event.code);
        console.log('[NetworkClient] Raison:', event.reason || 'Aucune raison fournie');
        console.log('[NetworkClient] Clean:', event.wasClean);
        
        this.isConnected = false;

        // ✅ Arrêter le keep-alive mobile
        if (this.mobileKeepAliveInterval) {
          clearInterval(this.mobileKeepAliveInterval);
          this.mobileKeepAliveInterval = null;
        }
        
        // Callback de déconnexion
        if (this.callbacks.onDisconnected) {
          this.callbacks.onDisconnected();
        }

        // ✅ Gestion de la reconnexion
        if (event.code !== 1000 && event.code !== 1001) {
          // Déconnexion anormale (pas un close propre)
          if (!this.isMobile) {
            // PC : reconnexion automatique
            this.attemptReconnect();
          } else {
            // Mobile : logger mais ne pas reconnecter automatiquement
            console.log('[NetworkClient] 📱 Mobile : reconnexion manuelle requise');
            console.log('[NetworkClient] Pour reconnecter manuellement, utilisez :');
            console.log(`[NetworkClient] networkClient.connect('${this.currentHost}', ${this.currentPort})`);
          }
        }
      };
    } catch (err) {
      console.error('[NetworkClient] ❌ Erreur lors de la connexion:', err);
      
      if (this.callbacks.onError) {
        this.callbacks.onError(err);
      }
    }
  }

  /**
   * ✅ NOUVEAU : Keep-alive pour mobile
   */
  startMobileKeepAlive() {
    console.log('[NetworkClient] 📱 Démarrage du keep-alive mobile...');
    
    // Nettoyer l'ancien interval si existant
    if (this.mobileKeepAliveInterval) {
      clearInterval(this.mobileKeepAliveInterval);
    }
    
    // Envoyer un PONG toutes les 5 secondes pour garder la connexion active
    this.mobileKeepAliveInterval = setInterval(() => {
      if (this.isWebSocketConnected()) {
        this.sendPong();
        console.log('[NetworkClient] 📱 Keep-alive PONG envoyé');
      } else {
        console.warn('[NetworkClient] 📱 Keep-alive arrêté : WebSocket non connecté');
        clearInterval(this.mobileKeepAliveInterval);
        this.mobileKeepAliveInterval = null;
      }
    }, 5000);
  }

  /**
   * ✅ MODIFIÉ : Reconnexion utilisant host/port stockés
   */
  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`[NetworkClient] 🔄 Tentative de reconnexion ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`);
      
      setTimeout(() => {
        if (this.currentHost && this.currentPort) {
          this.connect(this.currentHost, this.currentPort);
        } else {
          console.error('[NetworkClient] ❌ Impossible de reconnecter : host/port non définis');
        }
      }, this.reconnectDelay);
    } else {
      console.error('[NetworkClient] ❌ Nombre maximum de tentatives de reconnexion atteint');
    }
  }

  /**
   * S'authentifier auprès du serveur
   */
  authenticate() {
    if (!this.userName) {
      this.getOrAskUserName();
    }

    const authMessage = {
      type: 'AUTH',
      deviceId: this.deviceId,
      userName: this.userName,
      timestamp: Date.now()
    };

    this.send(authMessage);
    console.log('[NetworkClient] 📤 Message AUTH envoyé');
  }

  /**
   * Gérer les messages entrants
   */
  handleMessage(data) {
    try {
      const message = JSON.parse(data);
      console.log('[NetworkClient] 📥 Message reçu:', message.type);

      switch (message.type) {
        case 'AUTH_SUCCESS':
          console.log('[NetworkClient] ✅ Authentification réussie');
          break;

        case 'CATALOG_UPDATE':
          console.log('[NetworkClient] 📋 Mise à jour du catalogue reçue');
          if (this.callbacks.onCatalogUpdate) {
            this.callbacks.onCatalogUpdate(message.data, message.totalUsers);
          }
          break;

        case 'PING':
          console.log('[NetworkClient] 🏓 PING reçu');
          this.sendPong();
          if (this.callbacks.onPing) {
            this.callbacks.onPing();
          }
          break;

        case 'ERROR':
          console.error('[NetworkClient] ❌ Erreur serveur:', message.code, message.message);
          if (this.callbacks.onError) {
            this.callbacks.onError(message);
          }
          break;

        default:
          console.warn('[NetworkClient] ⚠️  Type de message inconnu:', message.type);
      }
    } catch (err) {
      console.error('[NetworkClient] ❌ Erreur lors du parsing du message:', err);
    }
  }

  /**
   * Envoyer un message au serveur
   */
  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
      return true;
    } else {
      console.warn('[NetworkClient] ⚠️  WebSocket non connecté, impossible d\'envoyer');
      return false;
    }
  }

  /**
   * Répondre PONG au serveur
   */
  sendPong() {
    this.send({
      type: 'PONG',
      deviceId: this.deviceId,
      timestamp: Date.now()
    });
  }

  /**
   * Envoyer son catalogue musical
   */
  sendCatalog(xmlData) {
    const message = {
      type: 'CATALOG',
      deviceId: this.deviceId,
      data: xmlData
    };

    const success = this.send(message);
    if (success) {
      console.log('[NetworkClient] 📤 Catalogue envoyé');
    } else {
      console.error('[NetworkClient] ❌ Échec de l\'envoi du catalogue');
    }
  }

  /**
   * ✅ MODIFIÉ : Se déconnecter proprement
   */
  disconnect() {
    console.log('[NetworkClient] Déconnexion en cours...');
    
    // Nettoyer le keep-alive mobile
    if (this.mobileKeepAliveInterval) {
      clearInterval(this.mobileKeepAliveInterval);
      this.mobileKeepAliveInterval = null;
    }
    
    if (this.ws) {
      // Envoyer un message de déconnexion
      this.send({
        type: 'DISCONNECT',
        deviceId: this.deviceId
      });

      // Fermer proprement le WebSocket
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
      this.isConnected = false;
      console.log('[NetworkClient] ✅ Déconnexion terminée');
    }
  }

  /**
   * Vérifier si connecté
   */
  isWebSocketConnected() {
    return this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN;
  }

  /**
   * Obtenir le deviceId
   */
  getDeviceId() {
    return this.deviceId;
  }

  /**
   * Obtenir le userName
   */
  getUserName() {
    return this.userName;
  }

  /**
   * Changer le userName
   */
  setUserName(newUserName) {
    this.userName = newUserName;
    localStorage.setItem('sharemusic_user_name', newUserName);
    console.log('[NetworkClient] UserName mis à jour:', newUserName);
  }

  /**
   * Réinitialiser l'identité (pour tests)
   */
  resetIdentity() {
    sessionStorage.removeItem('sharemusic_device_id');
    localStorage.removeItem('sharemusic_user_name');
    this.deviceId = this.getOrCreateDeviceId();
    this.userName = null;
    console.log('[NetworkClient] Identité réinitialisée');
  }

  /**
   * ✅ NOUVEAU : Forcer une reconnexion manuelle (utile pour mobile)
   */
  forceReconnect() {
    console.log('[NetworkClient] 🔄 Reconnexion forcée...');
    
    if (this.currentHost && this.currentPort) {
      // Déconnecter proprement
      if (this.ws) {
        this.ws.close(1000, 'Force reconnect');
      }
      
      // Réinitialiser les compteurs
      this.reconnectAttempts = 0;
      
      // Reconnecter
      setTimeout(() => {
        this.connect(this.currentHost, this.currentPort);
      }, 1000);
    } else {
      console.error('[NetworkClient] ❌ Impossible de reconnecter : aucun serveur configuré');
    }
  }
}

// Export pour utilisation en module (optionnel)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = NetworkClient;
}