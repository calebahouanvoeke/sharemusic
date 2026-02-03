const config = require('./config');

class Logger {
  constructor() {
    this.level = config.logging.level;
    this.levels = { error: 0, warn: 1, info: 2, debug: 3 };
  }

  log(level, module, message, data = null) {
    if (this.levels[level] <= this.levels[this.level]) {
      const timestamp = new Date().toISOString();
      const logMessage = `[${timestamp}] [${level.toUpperCase()}] [${module}] ${message}`;
      console.log(logMessage);
      if (data) console.log(JSON.stringify(data, null, 2));
    }
  }

  error(module, message, data) { this.log('error', module, message, data); }
  warn(module, message, data) { this.log('warn', module, message, data); }
  info(module, message, data) { this.log('info', module, message, data); }
  debug(module, message, data) { this.log('debug', module, message, data); }
}

module.exports = new Logger();
