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

// Tipos de archivo aceptados.
//
// Se valida por mimetype y, si no coincide, por extensión: el mimetype lo
// declara el navegador según el registro del sistema operativo, y Windows
// manda cosas inesperadas — 'application/octet-stream' para archivos de
// texto, 'application/x-zip-compressed' para los .zip. Validar solo por
// mimetype rechazaba archivos perfectamente válidos.
const MIMES_PERMITIDOS = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv', 'text/markdown', 'application/rtf', 'text/rtf',
  'application/zip', 'application/x-zip-compressed', 'multipart/x-zip',
];

const EXTENSIONES_PERMITIDAS = [
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.pdf',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.csv', '.md', '.rtf',
  '.zip',
];

const fileFilter = (req, file, cb) => {
  const extension = path.extname(file.originalname).toLowerCase();

  if (MIMES_PERMITIDOS.includes(file.mimetype) || EXTENSIONES_PERMITIDAS.includes(extension)) {
    return cb(null, true);
  }

  // Mensaje que sí llega al usuario: dice qué se rechazó y qué se acepta
  const error = new Error(
    `No se permite este tipo de archivo (${extension || file.mimetype}). ` +
    `Formatos aceptados: ${EXTENSIONES_PERMITIDAS.join(', ')}`
  );
  error.status = 400;
  cb(error, false);
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

module.exports = { uploadTask, uploadSGC, EXTENSIONES_PERMITIDAS };
