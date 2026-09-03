const multer = require('multer');
const path = require('path');
const fs = require('fs');
const gdrive = require('../services/gdrive');

const baseDir = process.env.UPLOAD_PATH || './uploads';
const tasksDir = path.join(baseDir, 'tasks');
const sgcDir   = path.join(baseDir, 'sgc');

[baseDir, tasksDir, sgcDir].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

const fileFilter = (req, file, cb) => {
  const allowed = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain', 'text/csv',
    'application/zip',
  ];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Tipo de archivo no permitido'), false);
};

const limits = { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024 };

const makeStorage = (dest) => multer.diskStorage({
  destination: (req, file, cb) => cb(null, dest),
  filename:    (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, unique + path.extname(file.originalname));
  },
});

// Con Google Drive configurado el archivo no toca el disco: se recibe en
// memoria y el controlador lo sube a la Unidad Compartida. Sin Drive, se
// guarda en disco como siempre.
const almacenamiento = (dest) =>
  gdrive.isEnabled() ? multer.memoryStorage() : makeStorage(dest);

const uploadTask = multer({ storage: almacenamiento(tasksDir), fileFilter, limits });
const uploadSGC  = multer({ storage: almacenamiento(sgcDir),   fileFilter, limits });

module.exports = { uploadTask, uploadSGC };
