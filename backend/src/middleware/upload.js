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
// Se valida SOLO por extensión: el mimetype lo declara el cliente (en
// Windows llegan cosas inesperadas, como 'application/octet-stream' para
// texto o 'application/x-zip-compressed' para los .zip) y no es confiable.
// Aceptar por mimetype permitía, por ejemplo, subir un .html declarado
// como text/plain.
const EXTENSIONES_PERMITIDAS = [
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.pdf',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.csv', '.md', '.rtf',
  '.zip',
];

const fileFilter = (req, file, cb) => {
  const extension = path.extname(file.originalname).toLowerCase();

  if (EXTENSIONES_PERMITIDAS.includes(extension)) {
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
