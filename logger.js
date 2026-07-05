'use strict';

/**
 * Simple logger utility with timestamped output.
 * Levels: debug, info, warn, error
 *
 * Set LOG_LEVEL env var to control verbosity: debug | info | warn | error
 * Default level: info
 */

const LEVELS = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function getConfiguredLevel() {
  const envLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();
  return LEVELS[envLevel] !== undefined ? LEVELS[envLevel] : LEVELS.info;
}

function timestamp() {
  return new Date().toISOString();
}

function formatMessage(level, args) {
  const prefix = `[${timestamp()}] [${level.toUpperCase()}]`;
  return [prefix, ...args];
}

function shouldLog(level) {
  return LEVELS[level] >= getConfiguredLevel();
}

const logger = {
  debug(...args) {
    if (shouldLog('debug')) {
      console.debug(...formatMessage('debug', args));
    }
  },

  info(...args) {
    if (shouldLog('info')) {
      console.log(...formatMessage('info', args));
    }
  },

  warn(...args) {
    if (shouldLog('warn')) {
      console.warn(...formatMessage('warn', args));
    }
  },

  error(...args) {
    if (shouldLog('error')) {
      console.error(...formatMessage('error', args));
    }
  },
};

module.exports = logger;
