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
// La ruta sin valores sensibles: el callback de Google trae code y state
morgan.token('ruta', (req) =>
  req.originalUrl.replace(/([?&](?:code|state|token)=)[^&]*/gi, '$1***'));
morgan.token('ip', (req) => req.ip);

const format =
  ':method :ruta :status :res[content-length]b :response-time ms | user=:user-id (:user-name) ip=:ip';

// Consultas automáticas que se repiten cada pocos segundos
const SIN_REGISTRO = ['/api/health', '/api/notifications/unread-count'];

const httpLogger = morgan(format, {
  stream,
  // No loguear el health-check ni los sondeos para no ensuciar los archivos
  skip: (req) => SIN_REGISTRO.includes(req.originalUrl.split('?')[0]),
});

module.exports = httpLogger;
