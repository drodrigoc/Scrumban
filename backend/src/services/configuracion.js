/**
 * Configuración del sistema editable desde la aplicación (tabla
 * system_settings). Se usa para lo que un administrador debe poder
 * cambiar sin redesplegar, como la cuenta de correo del sistema.
 */

const db = require('../config/database');

let cache = null;
let cacheHasta = 0;
const VIGENCIA_MS = 30 * 1000;

async function todas() {
  if (cache && Date.now() < cacheHasta) return cache;

  const [filas] = await db.query('SELECT setting_key, setting_value FROM system_settings');
  cache = Object.fromEntries(filas.map(f => [f.setting_key, f.setting_value]));
  cacheHasta = Date.now() + VIGENCIA_MS;
  return cache;
}

async function obtener(clave) {
  return (await todas())[clave] ?? null;
}

// valores: { clave: valor }. null borra la clave.
async function guardar(valores, userId = null) {
  for (const [clave, valor] of Object.entries(valores)) {
    if (valor === null || valor === undefined) {
      await db.query('DELETE FROM system_settings WHERE setting_key = ?', [clave]);
    } else {
      await db.query(
        `INSERT INTO system_settings (setting_key, setting_value, updated_by) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)`,
        [clave, String(valor), userId]
      );
    }
  }
  cache = null;
}

module.exports = { todas, obtener, guardar };
