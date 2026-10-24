/**
 * Cifrado de valores sensibles que se guardan en la base de datos
 * (por ejemplo, el token de Google de la cuenta de correo del sistema).
 *
 * AES-256-GCM: además de cifrar, detecta si el valor fue alterado.
 * La clave sale de APP_ENCRYPTION_KEY (64 caracteres hexadecimales).
 */

const crypto = require('crypto');
const logger = require('../config/logger');

let clave = null;

function obtenerClave() {
  if (clave) return clave;

  const hex = process.env.APP_ENCRYPTION_KEY;
  if (hex && /^[0-9a-fA-F]{64}$/.test(hex)) {
    clave = Buffer.from(hex, 'hex');
    return clave;
  }

  // Respaldo para no bloquear el arranque: deriva la clave del JWT_SECRET.
  // Funciona, pero si alguna vez se cambia JWT_SECRET los valores cifrados
  // dejan de poder leerse y habría que reconectar la cuenta de correo.
  logger.warn('APP_ENCRYPTION_KEY no está definida o no tiene 64 caracteres hex; ' +
              'se deriva la clave de cifrado de JWT_SECRET');
  clave = crypto.createHash('sha256').update(String(process.env.JWT_SECRET || '')).digest();
  return clave;
}

// Resultado: iv.etiqueta.cifrado, todo en base64
function cifrar(texto) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', obtenerClave(), iv);
  const cifrado = Buffer.concat([cipher.update(String(texto), 'utf8'), cipher.final()]);
  const etiqueta = cipher.getAuthTag();
  return [iv, etiqueta, cifrado].map(b => b.toString('base64')).join('.');
}

function descifrar(valor) {
  const [iv, etiqueta, cifrado] = String(valor).split('.').map(p => Buffer.from(p, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', obtenerClave(), iv);
  decipher.setAuthTag(etiqueta);
  return Buffer.concat([decipher.update(cifrado), decipher.final()]).toString('utf8');
}

module.exports = { cifrar, descifrar };
