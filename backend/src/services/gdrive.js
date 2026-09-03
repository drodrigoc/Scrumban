/**
 * Cliente de Google Drive para la Unidad Compartida de adjuntos.
 *
 * Usa el flujo JWT bearer de cuentas de servicio con las utilidades que
 * ya trae Node (crypto y fetch), sin dependencias extra: es el mismo
 * mecanismo que valida scripts/gdrive-test.js.
 *
 * Si las variables de entorno no están definidas, isEnabled() devuelve
 * false y el sistema sigue guardando los adjuntos en disco.
 */

const crypto = require('crypto');
const logger = require('../config/logger');

const SCOPE     = 'https://www.googleapis.com/auth/drive';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API       = 'https://www.googleapis.com/drive/v3';
const UPLOAD    = 'https://www.googleapis.com/upload/drive/v3/files';

const CLIENT_EMAIL = process.env.GDRIVE_CLIENT_EMAIL;
const PRIVATE_KEY  = (process.env.GDRIVE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
const DRIVE_ID     = process.env.GDRIVE_SHARED_DRIVE_ID;

const isEnabled = () => Boolean(CLIENT_EMAIL && PRIVATE_KEY && DRIVE_ID);

// ── Token ────────────────────────────────────────────────────────────────
// Los tokens duran una hora; se reutilizan hasta un minuto antes de vencer.
let cache = { token: null, expira: 0 };

const b64url = (buf) =>
  Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function getToken() {
  if (cache.token && Date.now() < cache.expira) return cache.token;

  const ahora = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: CLIENT_EMAIL, scope: SCOPE, aud: TOKEN_URL, iat: ahora, exp: ahora + 3600,
  }));
  const firma = crypto.createSign('RSA-SHA256').update(`${header}.${claims}`).sign(PRIVATE_KEY);

  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  `${header}.${claims}.${b64url(firma)}`,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Google rechazó las credenciales: ${data.error_description || data.error}`);
  }

  cache = { token: data.access_token, expira: Date.now() + (data.expires_in - 60) * 1000 };
  return cache.token;
}

async function api(url, opciones = {}) {
  const token = await getToken();
  const res = await fetch(url, {
    ...opciones,
    headers: { Authorization: `Bearer ${token}`, ...(opciones.headers || {}) },
  });
  return res;
}

async function apiJson(url, opciones = {}) {
  const res   = await api(url, opciones);
  const texto = await res.text();
  const data  = texto ? JSON.parse(texto) : {};
  if (!res.ok) {
    throw new Error(data?.error?.message || `Drive respondió ${res.status}`);
  }
  return data;
}

// ── Carpetas ─────────────────────────────────────────────────────────────

const FOLDER_MIME = 'application/vnd.google-apps.folder';

// Escapa comillas simples para el lenguaje de consulta de Drive
const escapar = (texto) => String(texto).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function buscarCarpeta(nombre, parentId) {
  const q = [
    `name = '${escapar(nombre)}'`,
    `mimeType = '${FOLDER_MIME}'`,
    `'${parentId}' in parents`,
    'trashed = false',
  ].join(' and ');

  const data = await apiJson(
    `${API}/files?q=${encodeURIComponent(q)}` +
    `&driveId=${DRIVE_ID}&corpora=drive&includeItemsFromAllDrives=true&supportsAllDrives=true` +
    '&pageSize=1&fields=files(id,name)'
  );
  return data.files?.[0]?.id || null;
}

async function crearCarpeta(nombre, parentId) {
  const data = await apiJson(`${API}/files?supportsAllDrives=true&fields=id`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: nombre, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
  return data.id;
}

/**
 * Devuelve el id de una carpeta dentro de la unidad, creándola si no existe.
 * `parentId` por defecto es la raíz de la Unidad Compartida.
 */
async function ensureFolder(nombre, parentId = DRIVE_ID) {
  return (await buscarCarpeta(nombre, parentId)) || crearCarpeta(nombre, parentId);
}

// Los ids de carpeta no cambian, así que se recuerdan mientras viva el
// proceso: solo la primera subida de cada proyecto consulta a Drive.
const cacheCarpetas = new Map();

/**
 * Recorre una ruta de carpetas desde la raíz de la unidad, creando las
 * que falten, y devuelve el id de la última.
 *
 *   ensurePath(['SGC', 'Alumni (#3)'])  →  id de "Alumni (#3)" dentro de SGC
 */
async function ensurePath(nombres) {
  let parentId = DRIVE_ID;
  let clave = '';

  for (const nombre of nombres) {
    clave += `/${nombre}`;

    if (cacheCarpetas.has(clave)) {
      parentId = cacheCarpetas.get(clave);
      continue;
    }

    parentId = await ensureFolder(nombre, parentId);
    cacheCarpetas.set(clave, parentId);
  }

  return parentId;
}

// ── Archivos ─────────────────────────────────────────────────────────────

/**
 * Sube un archivo desde memoria. Devuelve { id, name, webViewLink }.
 */
async function uploadFile({ name, mimeType, buffer, parentId = DRIVE_ID }) {
  const limite   = '-'.repeat(18) + crypto.randomBytes(8).toString('hex');
  const metadata = JSON.stringify({ name, parents: [parentId] });

  // multipart/related: primero los metadatos en JSON, luego el contenido binario
  const cuerpo = Buffer.concat([
    Buffer.from(
      `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${limite}\r\nContent-Type: ${mimeType || 'application/octet-stream'}\r\n\r\n`
    ),
    buffer,
    Buffer.from(`\r\n--${limite}--`),
  ]);

  return apiJson(`${UPLOAD}?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink`, {
    method:  'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${limite}` },
    body:    cuerpo,
  });
}

/**
 * Abre el contenido de un archivo. Devuelve la respuesta de fetch para
 * poder transmitirla al cliente sin cargarla entera en memoria.
 */
async function getFileResponse(fileId) {
  const res = await api(`${API}/files/${fileId}?alt=media&supportsAllDrives=true`);
  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    throw new Error(`No se pudo descargar el archivo de Drive (${res.status}) ${detalle}`);
  }
  return res;
}

/**
 * Elimina un archivo de la unidad.
 *
 * Se manda primero a la papelera en vez de borrarlo definitivamente: en
 * una Unidad Compartida el rol "Administrador de contenido" puede enviar
 * a la papelera, pero el borrado permanente suele estar reservado al rol
 * "Administrador". Además deja 30 días para recuperar un archivo que se
 * eliminó por error, algo deseable tratándose de evidencias.
 *
 * Si la papelera falla se intenta el borrado directo, por si la unidad
 * está configurada de otra forma.
 */
async function deleteFile(fileId) {
  const aPapelera = await api(`${API}/files/${fileId}?supportsAllDrives=true`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ trashed: true }),
  });

  // 404 = ya no existe; para nuestro propósito es un borrado exitoso
  if (aPapelera.ok || aPapelera.status === 404) return;

  const borrado = await api(`${API}/files/${fileId}?supportsAllDrives=true`, { method: 'DELETE' });
  if (borrado.ok || borrado.status === 404) return;

  const detalle = await borrado.text().catch(() => '');
  throw new Error(`Drive rechazó eliminar el archivo (${borrado.status}). ${detalle}`);
}

/**
 * Mueve un archivo a otra carpeta de la unidad. Drive no tiene "mover":
 * se cambia de padre, así que primero hay que saber cuál tiene.
 */
async function moveFile(fileId, nuevoParentId) {
  const actual = await apiJson(`${API}/files/${fileId}?fields=parents&supportsAllDrives=true`);

  const params = new URLSearchParams({
    supportsAllDrives: 'true',
    addParents: nuevoParentId,
    fields: 'id,parents',
  });
  if (actual.parents?.length) params.set('removeParents', actual.parents.join(','));

  return apiJson(`${API}/files/${fileId}?${params}`, { method: 'PATCH' });
}

/** Comprobación de arranque: confirma que la unidad es accesible. */
async function checkConnection() {
  const data = await apiJson(`${API}/drives/${DRIVE_ID}?fields=id,name`);
  return data.name;
}

module.exports = {
  isEnabled,
  ensureFolder,
  ensurePath,
  uploadFile,
  getFileResponse,
  deleteFile,
  moveFile,
  checkConnection,
  DRIVE_ID,
};
