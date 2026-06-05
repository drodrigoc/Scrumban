const morgan = require('morgan');
const logger = require('../config/logger');

// Stream que redirige morgan → winston
const stream = {
  write: (message) => {
    // morgan añade \n al final — lo quitamos
    logger.http(message.trim());
  },
};

// Formato personalizado:
// METHOD /ruta STATUS tiempo_ms - bytes  [usuario_id si está autenticado]
morgan.token('user-id', (req) => req.user?.id ?? 'anon');
morgan.token('user-name', (req) => req.user?.name ?? '—');

const format =
  ':method :url :status :res[content-length]b :response-time ms | user=:user-id (:user-name)';

const httpLogger = morgan(format, {
  stream,
  // No loguear el health-check para no ensuciar los archivos
  skip: (req) => req.url === '/api/health',
});

module.exports = httpLogger;
