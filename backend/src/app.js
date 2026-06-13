require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const logger = require('./config/logger');
const httpLogger = require('./middleware/httpLogger');

const app = express();

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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── HTTP request logging ──────────────────────────────────────────────────
app.use(httpLogger);

// Servir archivos estáticos — un solo punto de entrada cubre tasks/ y sgc/
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

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
  res.status(err.status || 500).json({
    message: err.message || 'Error interno del servidor',
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
});

module.exports = app;
