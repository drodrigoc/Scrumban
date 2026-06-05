const { createLogger, format, transports } = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

const LOGS_DIR = path.join(__dirname, '..', '..', 'logs');

// ── Formato para archivos (JSON estructurado) ──────────────────────────────
const fileFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.errors({ stack: true }),
  format.json()
);

// ── Formato para consola (legible) ────────────────────────────────────────
const consoleFormat = format.combine(
  format.colorize({ all: true }),
  format.timestamp({ format: 'HH:mm:ss' }),
  format.printf(({ timestamp, level, message, ...meta }) => {
    const extra = Object.keys(meta).length ? ' ' + JSON.stringify(meta) : '';
    return `[${timestamp}] ${level}: ${message}${extra}`;
  })
);

// ── Transporte: todos los logs rotados diariamente ────────────────────────
const combinedTransport = new DailyRotateFile({
  filename:     path.join(LOGS_DIR, 'combined-%DATE%.log'),
  datePattern:  'YYYY-MM-DD',
  maxSize:      '10m',   // máximo 10 MB por archivo
  maxFiles:     '14d',   // conserva los últimos 14 días
  format:       fileFormat,
  level:        'info',
});

// ── Transporte: solo errores ───────────────────────────────────────────────
const errorTransport = new DailyRotateFile({
  filename:     path.join(LOGS_DIR, 'error-%DATE%.log'),
  datePattern:  'YYYY-MM-DD',
  maxSize:      '10m',
  maxFiles:     '30d',   // errores se conservan 30 días
  format:       fileFormat,
  level:        'error',
});

// ── Logger principal ───────────────────────────────────────────────────────
const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: [
    combinedTransport,
    errorTransport,
    new transports.Console({ format: consoleFormat }),
  ],
  // No detener el proceso ante excepciones no capturadas
  exitOnError: false,
});

// ── Captura de excepciones y rechazos no manejados ────────────────────────
logger.exceptions.handle(
  new DailyRotateFile({
    filename:    path.join(LOGS_DIR, 'exceptions-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxFiles:    '30d',
    format:      fileFormat,
  })
);

logger.rejections.handle(
  new DailyRotateFile({
    filename:    path.join(LOGS_DIR, 'rejections-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxFiles:    '30d',
    format:      fileFormat,
  })
);

module.exports = logger;
