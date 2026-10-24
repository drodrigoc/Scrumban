#!/usr/bin/env node
/**
 * Mueve las pruebas SGC que ya están en Drive a la estructura de cuatro
 * niveles (migración v6):
 *
 *   antes:  SGC/<dimensión>/<criterio>/<evidencia>/archivo
 *   ahora:  SGC/<dimensión>/<criterio>/<indicador>/<evidencia>/archivo
 *
 * La migración v6 solo cambia la base de datos; los archivos que ya
 * estaban en Drive siguen en las carpetas viejas hasta correr esto.
 * Mueve archivos, no los copia ni los vuelve a subir.
 *
 * Es seguro repetirlo: un archivo que ya está en su carpeta no se toca.
 * Las carpetas viejas quedan vacías; se pueden borrar a mano en Drive.
 *
 * Uso:
 *   cd backend
 *   node scripts/sgc-reubicar-archivos.js            # simulación
 *   node scripts/sgc-reubicar-archivos.js --aplicar  # mueve de verdad
 */

require('dotenv').config();
const db          = require('../src/config/database');
const gdrive      = require('../src/services/gdrive');
const sgcCarpetas = require('../src/services/sgcCarpetas');

const APLICAR = process.argv.includes('--aplicar');

async function main() {
  if (!gdrive.isEnabled()) {
    console.error('\nGoogle Drive no está configurado en este entorno.\n');
    process.exit(1);
  }

  console.log(`\nUnidad Compartida : ${await gdrive.checkConnection()}`);
  console.log(`Modo              : ${APLICAR ? 'MOVER DE VERDAD' : 'simulación (agrega --aplicar para mover)'}\n`);

  const [archivos] = await db.query(`
    SELECT id, filename, external_id, evidencia_id
      FROM task_attachments
     WHERE category = 'sgc' AND storage_provider = 'gdrive'
       AND external_id IS NOT NULL AND evidencia_id IS NOT NULL
     ORDER BY evidencia_id, id
  `);

  if (!archivos.length) {
    console.log('No hay pruebas SGC en Drive para reubicar.\n');
    await db.end();
    return;
  }

  let movidos = 0, enSuLugar = 0, fallidos = 0;

  for (const a of archivos) {
    const ruta = await sgcCarpetas.rutaDeNivel('evidencia', a.evidencia_id);
    const destino = ruta.slice(1).join(' / ');

    try {
      // Solo se crea la carpeta destino cuando de verdad se va a mover
      const destinoId = APLICAR ? await sgcCarpetas.carpetaEvidencia(a.evidencia_id) : await gdrive.findPath(ruta);
      const padres = await gdrive.getParents(a.external_id);

      if (destinoId && padres.includes(destinoId)) {
        enSuLugar++;
        continue;
      }

      if (!APLICAR) {
        console.log(`  · [${a.id}] ${a.filename}\n      → ${destino}`);
        movidos++;
        continue;
      }

      await gdrive.moveFile(a.external_id, destinoId);
      console.log(`  ✓ [${a.id}] ${a.filename} → ${destino}`);
      movidos++;
    } catch (error) {
      console.log(`  ✗ [${a.id}] ${a.filename} — ${error.message}`);
      fallidos++;
    }
  }

  console.log(
    `\nResumen: ${movidos} ${APLICAR ? 'movidos' : 'por mover'} · ` +
    `${enSuLugar} ya estaban en su lugar · ${fallidos} con error\n`
  );
  await db.end();
  process.exit(fallidos ? 1 : 0);
}

main().catch(async (error) => {
  console.error(`\nError: ${error.message}\n`);
  try { await db.end(); } catch { /* ya cerrada */ }
  process.exit(1);
});
