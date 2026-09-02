#!/usr/bin/env node
/**
 * Ejecuta un archivo .sql sentencia por sentencia.
 *
 * Pensado para bases donde la consola web no acepta varias sentencias
 * juntas (Railway, por ejemplo). Si una sentencia ya estaba aplicada,
 * la reporta como "ya aplicado" y sigue con la siguiente, así que el
 * script se puede volver a correr sin romper nada.
 *
 * Uso:
 *   # con las credenciales del .env (local)
 *   node scripts/migrate.js ../database/migration_v2.sql
 *
 *   # contra otra base (Railway → variable MYSQL_PUBLIC_URL del servicio)
 *   node scripts/migrate.js ../database/migration_v2.sql "mysql://usuario:clave@host:puerto/basededatos"
 */

require('dotenv').config();
const fs    = require('fs');
const path  = require('path');
const mysql = require('mysql2/promise');

// Errores que significan "este paso ya estaba aplicado"
const YA_APLICADO = new Set([
  'ER_DUP_FIELDNAME',        // la columna ya existe
  'ER_TABLE_EXISTS_ERROR',   // la tabla ya existe
  'ER_DUP_KEYNAME',          // el índice ya existe
  'ER_FK_DUP_NAME',          // la foreign key ya existe
  'ER_DUP_CONSTRAINT_NAME',
]);

// Divide el archivo en sentencias. Quita comentarios de línea (-- …)
// antes de cortar por ';' para no partir en un ';' comentado.
function splitStatements(sql) {
  return sql
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n')
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);
}

// Versión de una línea de la sentencia, para mostrarla en el log
function resumen(stmt) {
  const plano = stmt.replace(/\s+/g, ' ').trim();
  return plano.length > 72 ? `${plano.slice(0, 69)}…` : plano;
}

async function main() {
  const [, , archivo, urlConexion] = process.argv;

  if (!archivo) {
    console.error('Falta el archivo .sql.\n' +
      'Uso: node scripts/migrate.js ../database/migration_v2.sql ["mysql://usuario:clave@host:puerto/base"]');
    process.exit(1);
  }

  const rutaSql = path.resolve(process.cwd(), archivo);
  if (!fs.existsSync(rutaSql)) {
    console.error(`No se encontró el archivo: ${rutaSql}`);
    process.exit(1);
  }

  const destino = urlConexion || process.env.DATABASE_URL || process.env.MYSQL_URL;

  const conn = destino
    ? await mysql.createConnection(destino)
    : await mysql.createConnection({
        host:     process.env.DB_HOST || 'localhost',
        port:     process.env.DB_PORT || 3306,
        user:     process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'project_manager',
      });

  const [[info]] = await conn.query('SELECT DATABASE() AS db, VERSION() AS version');
  console.log(`\nBase de datos : ${info.db}  (MySQL ${info.version})`);
  console.log(`Archivo       : ${path.basename(rutaSql)}\n`);

  const sentencias = splitStatements(fs.readFileSync(rutaSql, 'utf8'));
  let aplicadas = 0, omitidas = 0, fallidas = 0;

  for (const [i, stmt] of sentencias.entries()) {
    const etiqueta = `${String(i + 1).padStart(2, '0')}/${sentencias.length}`;
    try {
      const [res] = await conn.query(stmt);
      const filas = res?.affectedRows != null ? ` (${res.affectedRows} filas)` : '';
      console.log(`  ✓ ${etiqueta}  ${resumen(stmt)}${filas}`);
      aplicadas++;
    } catch (err) {
      if (YA_APLICADO.has(err.code)) {
        console.log(`  ↷ ${etiqueta}  ${resumen(stmt)} — ya aplicado`);
        omitidas++;
      } else {
        console.error(`  ✗ ${etiqueta}  ${resumen(stmt)}`);
        console.error(`     ${err.code || ''} ${err.message}`);
        fallidas++;
      }
    }
  }

  await conn.end();

  console.log(`\nResumen: ${aplicadas} aplicadas · ${omitidas} ya estaban · ${fallidas} con error\n`);
  process.exit(fallidas ? 1 : 0);
}

main().catch(err => {
  console.error('\nNo se pudo ejecutar la migración:', err.message);
  process.exit(1);
});
