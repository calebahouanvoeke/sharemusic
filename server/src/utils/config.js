const config = {
  server: {
    port: process.env.PORT || 8080,
    streamingPort: process.env.STREAMING_PORT || 3000
  },
  
  network: {
    serviceName: process.env.SERVICE_NAME || 'ShareMusic',
    mdnsType: process.env.MDNS_TYPE || 'sharemusic',
    pingInterval: parseInt(process.env.PING_INTERVAL) || 5000,
    electionTimeout: parseInt(process.env.ELECTION_TIMEOUT) || 3000,
    heartbeatTimeout: parseInt(process.env.HEARTBEAT_TIMEOUT) || 15000
  },
  
  paths: {
    musicDir: process.env.MUSIC_DIR || './music',
    dtdPath: process.env.DTD_PATH || './dtd/sharemusic.dtd'
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info'
  },
  
  election: {
    weights: {
      battery: {
        plugged: 40000000,
        high: 30000000,
        medium: 20000000,
        low: 10000000,
        critical: 0
      },
      seniority: 10000,
      ram: 100,
      deviceId: 1
    },
    phases: {
      broadcast: 3000,
      calculation: 1000,
      consensus: 2000,
      activation: 1000
    }
  }
};

module.exports = config;
