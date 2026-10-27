require('dotenv').config();
const express = require('express');
const cors = require('cors');
const logger = require('./config/logger');
const httpLogger = require('./middleware/httpLogger');
const { cabecerasSeguridad } = require('./middleware/seguridad');

const app = express();

// Railway y el Nginx de producción ponen un proxy delante: sin esto, la IP
// de todos los usuarios sería la del proxy y el límite de intentos los
// trataría como una sola persona. TRUST_PROXY=0 lo desactiva.
app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
app.disable('x-powered-by');
app.use(cabecerasSeguridad);

// Middlewares globales
const ALLOWED_ORIGINS = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map((o) => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Permitir peticiones sin origin (Postman, curl, etc.)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origen no permitido → ${origin}`));
    }
  },
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// ── HTTP request logging ──────────────────────────────────────────────────
app.use(httpLogger);

// Rutas
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users',   require('./routes/users'));
app.use('/api/units',   require('./routes/units'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/projects/:project_id/tasks', require('./routes/tasks'));
app.use('/api/projects/:project_id/tasks/:task_id/checklist', require('./routes/checklist'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/sgc',       require('./routes/sgc'));
app.use('/api/my-tasks',  require('./routes/myTasks'));
app.use('/api/settings',  require('./routes/settings'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Manejo de rutas no encontradas
app.use((req, res) => {
  res.status(404).json({ message: 'Ruta no encontrada' });
});

// Manejo de errores global
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    message: err.message,
    stack:   err.stack,
    method:  req.method,
    url:     req.originalUrl,
    userId:  req.user?.id,
  });

  // multer avisa del límite de tamaño en inglés y sin código de estado
  if (err.code === 'LIMIT_FILE_SIZE') {
    const mb = Math.round((parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024) / (1024 * 1024));
    return res.status(400).json({ message: `El archivo supera el límite de ${mb} MB` });
  }

  // Los errores 4xx traen un mensaje pensado para el usuario; los 500
  // pueden traer detalles internos (SQL, rutas), que solo van al log
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    message: status < 500 ? err.message : 'Error interno del servidor',
  });
});

const PORT = process.env.PORT || 5000;
const HOST = process.env.HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  logger.info(`Servidor iniciado`, {
    local: `http://localhost:${PORT}`,
    red:   `http://${process.env.SERVER_IP || '10.10.25.10'}:${PORT}`,
    mode:  process.env.NODE_ENV || 'development',
  });

  // Envío de correos de notificación en segundo plano
  require('./services/email').iniciarProceso();

  // Dónde van a parar los adjuntos, visible desde el arranque
  const gdrive = require('./services/gdrive');
  if (!gdrive.isEnabled()) {
    logger.info('Adjuntos: disco local (Google Drive no configurado)');
  } else {
    gdrive.checkConnection()
      .then(nombre => logger.info('Adjuntos: Google Drive', { unidad: nombre }))
      .catch(error => logger.error('Google Drive configurado pero inaccesible', {
        message: error.message,
      }));
  }
});

module.exports = app;
