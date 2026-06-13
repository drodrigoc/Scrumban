const multer = require('multer');
const path = require('path');
const fs = require('fs');

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

const uploadTask = multer({ storage: makeStorage(tasksDir), fileFilter, limits });
const uploadSGC  = multer({ storage: makeStorage(sgcDir),   fileFilter, limits });

module.exports = { uploadTask, uploadSGC };
