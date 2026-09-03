#!/usr/bin/env node
/**
 * Prueba de conexión con la Unidad Compartida de Google Drive.
 *
 * Comprueba, en orden, las cuatro cosas que pueden fallar:
 *   1. Que la clave privada sea válida y Google emita un token
 *   2. Que la API de Drive esté habilitada en el proyecto
 *   3. Que la cuenta de servicio sea miembro de la Unidad Compartida
 *   4. Que pueda escribir (sube un archivo de prueba y lo borra)
 *
 * No usa dependencias: solo Node 18+ (fetch y crypto incluidos), para que
 * un fallo aquí sea siempre de configuración y nunca del código.
 *
 * Uso:
 *   # leyendo las variables de backend/.env
 *   node scripts/gdrive-test.js
 *
 *   # o apuntando directo al JSON descargado y a la URL de la unidad
 *   node scripts/gdrive-test.js ./projectflow-drive-123456.json "https://drive.google.com/drive/folders/0AB..."
 */

require('dotenv').config();
const fs     = require('fs');
const crypto = require('crypto');

const SCOPE     = 'https://www.googleapis.com/auth/drive';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API       = 'https://www.googleapis.com/drive/v3';
const UPLOAD    = 'https://www.googleapis.com/upload/drive/v3/files';

const ok    = (msg) => console.log(`  ✓ ${msg}`);
const fail  = (msg) => console.log(`  ✗ ${msg}`);
const info  = (msg) => console.log(`     ${msg}`);

// El ID de la unidad puede venir suelto o dentro de la URL de Drive
function extraerDriveId(valor) {
  if (!valor) return null;
  const m = String(valor).match(/[-\w]{15,}/);
  return m ? m[0] : null;
}

function leerCredenciales() {
  const [, , archivo, unidad] = process.argv;

  let clientEmail, privateKey;

  if (archivo) {
    if (!fs.existsSync(archivo)) {
      throw new Error(`No se encontró el archivo JSON: ${archivo}`);
    }
    const json = JSON.parse(fs.readFileSync(archivo, 'utf8'));
    clientEmail = json.client_email;
    privateKey  = json.private_key;
  } else {
    clientEmail = process.env.GDRIVE_CLIENT_EMAIL;
    // En un .env los saltos de línea van escritos como \n
    privateKey  = (process.env.GDRIVE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  }

  const driveId = extraerDriveId(unidad || process.env.GDRIVE_SHARED_DRIVE_ID);

  if (!clientEmail || !privateKey) {
    throw new Error(
      'Faltan credenciales. Define GDRIVE_CLIENT_EMAIL y GDRIVE_PRIVATE_KEY en backend/.env,\n' +
      'o pasa la ruta del JSON como primer argumento.'
    );
  }
  if (!driveId) {
    throw new Error(
      'Falta el ID de la Unidad Compartida. Define GDRIVE_SHARED_DRIVE_ID en backend/.env,\n' +
      'o pasa la URL de la unidad como segundo argumento.'
    );
  }
  if (!privateKey.includes('BEGIN PRIVATE KEY')) {
    throw new Error(
      'La clave privada no tiene el formato esperado (falta "-----BEGIN PRIVATE KEY-----").\n' +
      'Si la copiaste al .env, revisa que esté entre comillas y con los saltos como \\n.'
    );
  }

  return { clientEmail, privateKey, driveId };
}

const b64url = (buf) =>
  Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Firma un JWT y lo cambia por un access token (flujo JWT bearer)
async function obtenerToken({ clientEmail, privateKey }) {
  const ahora = Math.floor(Date.now() / 1000);

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss:   clientEmail,
    scope: SCOPE,
    aud:   TOKEN_URL,
    iat:   ahora,
    exp:   ahora + 3600,
  }));

  const firma = crypto
    .createSign('RSA-SHA256')
    .update(`${header}.${claims}`)
    .sign(privateKey);

  const jwt = `${header}.${claims}.${b64url(firma)}`;

  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  jwt,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    const detalle = data.error_description || data.error || 'error desconocido';
    throw new Error(
      `Google rechazó las credenciales: ${detalle}\n` +
      '     Suele ser la clave privada mal copiada (saltos de línea) o una clave ya eliminada.'
    );
  }
  return data.access_token;
}

async function llamar(token, url, opciones = {}) {
  const res = await fetch(url, {
    ...opciones,
    headers: { Authorization: `Bearer ${token}`, ...(opciones.headers || {}) },
  });
  const texto = await res.text();
  const data  = texto ? JSON.parse(texto) : {};
  return { ok: res.ok, status: res.status, data };
}

// Traduce los errores de Google a la causa concreta y al paso que falta
function diagnosticar(status, data) {
  const motivo  = data?.error?.errors?.[0]?.reason || '';
  const mensaje = data?.error?.message || '';

  if (motivo === 'accessNotConfigured' || /has not been used|is disabled/i.test(mensaje)) {
    return 'La API de Drive no está habilitada en el proyecto de Google Cloud (paso 3 de la guía).';
  }
  if (status === 404) {
    return 'La cuenta de servicio no ve esta unidad. Casi siempre es que falta agregarla\n' +
           '     como miembro de la Unidad Compartida con rol "Administrador de contenido" (paso 6),\n' +
           '     o que el ID de la unidad no corresponde.';
  }
  if (motivo === 'storageQuotaExceeded') {
    return 'Se está intentando escribir fuera de una Unidad Compartida. Las cuentas de servicio\n' +
           '     no tienen espacio propio: revisa que el ID sea de una unidad compartida, no de una carpeta de Mi unidad.';
  }
  if (status === 403) {
    return `Permiso insuficiente: ${mensaje}\n` +
           '     Revisa que el rol en la unidad sea "Administrador de contenido" y no "Lector".';
  }
  return mensaje || `HTTP ${status}`;
}

async function main() {
  console.log('\nPrueba de conexión con Google Drive\n');

  const cred = leerCredenciales();
  info(`cuenta de servicio : ${cred.clientEmail}`);
  info(`unidad compartida  : ${cred.driveId}\n`);

  // 1 — Credenciales
  const token = await obtenerToken(cred);
  ok('Credenciales válidas, Google emitió un token de acceso');

  // 2 y 3 — API habilitada y acceso a la unidad
  const unidad = await llamar(token, `${API}/drives/${cred.driveId}?fields=id,name`);
  if (!unidad.ok) {
    fail('No se pudo abrir la Unidad Compartida');
    info(diagnosticar(unidad.status, unidad.data));

    // Qué unidades ve realmente: separa "no es miembro" de "el ID no es ese"
    const visibles = await llamar(token, `${API}/drives?pageSize=10&fields=drives(id,name)`);
    if (visibles.ok) {
      const drives = visibles.data.drives || [];
      console.log('');
      if (!drives.length) {
        info('La cuenta de servicio no es miembro de NINGUNA unidad compartida.');
        info('Falta el paso 6: agregar este correo como miembro de la unidad,');
        info(`con rol "Administrador de contenido":`);
        info('');
        info(`    ${cred.clientEmail}`);
        info('');
        info('Ojo: es ese correo largo terminado en .iam.gserviceaccount.com,');
        info('no una cuenta de usuario del dominio aunque se llame parecido.');
      } else {
        info('Unidades que sí ve esta cuenta de servicio:');
        drives.forEach(d => info(`   · ${d.name}  →  ${d.id}`));
        info('');
        info('Si la unidad que buscas está en la lista, usa ese ID.');
      }
    }
    process.exit(1);
  }
  ok(`Unidad Compartida accesible: "${unidad.data.name}"`);

  // Contenido actual
  const lista = await llamar(token,
    `${API}/files?driveId=${cred.driveId}&corpora=drive` +
    '&includeItemsFromAllDrives=true&supportsAllDrives=true' +
    '&pageSize=5&fields=files(id,name,mimeType)');

  if (lista.ok) {
    const archivos = lista.data.files || [];
    ok(`Lectura correcta (${archivos.length === 0 ? 'la unidad está vacía' : `${archivos.length} elemento(s) visibles`})`);
    archivos.forEach(f => info(`· ${f.name}`));
  }

  // 4 — Escritura
  const limite = '-'.repeat(20) + Date.now();
  const metadata = {
    name: `prueba-projectflow-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '')}.txt`,
    parents: [cred.driveId],
  };
  const cuerpo =
    `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${limite}\r\nContent-Type: text/plain\r\n\r\n` +
    `Archivo de prueba creado por ProjectFlow el ${new Date().toLocaleString('es')}.\r\n` +
    `--${limite}--`;

  const subida = await llamar(token, `${UPLOAD}?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink`, {
    method:  'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${limite}` },
    body:    cuerpo,
  });

  if (!subida.ok) {
    fail('No se pudo subir el archivo de prueba');
    info(diagnosticar(subida.status, subida.data));
    process.exit(1);
  }
  ok(`Escritura correcta: se creó "${subida.data.name}"`);

  // Limpieza — el archivo de prueba no debe quedarse
  const borrado = await llamar(token, `${API}/files/${subida.data.id}?supportsAllDrives=true`, { method: 'DELETE' });
  if (borrado.ok) ok('Borrado correcto: el archivo de prueba se eliminó');
  else            info(`El archivo de prueba quedó en la unidad (${subida.data.id}); puedes borrarlo a mano.`);

  console.log('\nTodo listo. La conexión con la Unidad Compartida funciona.\n');
}

main().catch(err => {
  console.error(`\n  ✗ ${err.message}\n`);
  process.exit(1);
});
