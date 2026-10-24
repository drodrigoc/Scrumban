#!/usr/bin/env node
/**
 * Migra a Google Drive los adjuntos que todavía están en el disco.
 *
 * Sube cada archivo a la carpeta de su proyecto dentro de la Unidad
 * Compartida, actualiza el registro y —solo si la subida salió bien—
 * borra la copia del disco.
 *
 * Es seguro repetirlo: solo toca los que siguen marcados como 'local'.
 * Si un archivo ya no está en el disco, lo reporta y sigue con el resto.
 *
 * Uso:
 *   cd backend
 *   node scripts/gdrive-migrate.js            # simulación, no cambia nada
 *   node scripts/gdrive-migrate.js --aplicar  # migra de verdad
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const db     = require('../src/config/database');
const gdrive = require('../src/services/gdrive');
const sgcCarpetas = require('../src/services/sgcCarpetas');

const BASE_UPLOAD = process.env.UPLOAD_PATH || './uploads';
const APLICAR = process.argv.includes('--aplicar');

// Misma búsqueda que el controlador: subcarpeta por categoría o raíz
function rutaLocal(a) {
  const sub = a.category === 'sgc' ? 'sgc' : 'tasks';
  return [
    path.join(BASE_UPLOAD, sub, a.filepath),
    path.join(BASE_UPLOAD, a.filepath),
  ].find(p => fs.existsSync(p)) || null;
}

// Misma estructura que usa el backend: Documentos/<Proyecto> para los
// adjuntos, y SGC/<Dimensión>/<Criterio>/<Evidencia> para las evidencias.
const CARPETAS_RAIZ = {
  task: process.env.GDRIVE_FOLDER_DOCUMENTOS || 'Documentos',
  sgc:  process.env.GDRIVE_FOLDER_SGC        || 'SGC',
};

const nombreCarpeta = (texto, max = 120) =>
  String(texto).replace(/[/\\]/g, '-').replace(/\s+/g, ' ').trim().slice(0, max) || 'Sin nombre';

async function nombreProyecto(projectId) {
  const [[proyecto]] = await db.query('SELECT name FROM projects WHERE id = ?', [projectId]);
  if (!proyecto) throw new Error(`Proyecto ${projectId} no encontrado`);
  return `${nombreCarpeta(proyecto.name)} (#${projectId})`;
}

// Los adjuntos que ya existen no tienen evidencia asignada, así que las
// evidencias viejas caen en "Sin clasificar" hasta que se reorganicen.
async function carpetaDestino(adjunto) {
  if (adjunto.category !== 'sgc') {
    return gdrive.ensurePath([CARPETAS_RAIZ.task, await nombreProyecto(adjunto.project_id)]);
  }

  const [[e]] = adjunto.evidencia_id
    ? await db.query('SELECT id FROM sgc_evidencias WHERE id = ?', [adjunto.evidencia_id])
    : [[null]];

  if (!e) {
    return gdrive.ensurePath([CARPETAS_RAIZ.sgc, 'Sin clasificar', await nombreProyecto(adjunto.project_id)]);
  }

  // Dimensión / criterio / indicador / evidencia, igual que el backend
  return sgcCarpetas.carpetaEvidencia(e.id);
}

// Etiqueta de la ruta, para el modo simulación
const rutaLegible = (a) =>
  a.category === 'sgc'
    ? (a.evidencia_id ? `${CARPETAS_RAIZ.sgc}/…/evidencia` : `${CARPETAS_RAIZ.sgc}/Sin clasificar`)
    : `${CARPETAS_RAIZ.task}`;

async function main() {
  if (!gdrive.isEnabled()) {
    console.error('\nGoogle Drive no está configurado. Define GDRIVE_CLIENT_EMAIL,' +
                  ' GDRIVE_PRIVATE_KEY y GDRIVE_SHARED_DRIVE_ID.\n');
    process.exit(1);
  }

  const unidad = await gdrive.checkConnection();
  console.log(`\nUnidad Compartida : ${unidad}`);
  console.log(`Modo              : ${APLICAR ? 'MIGRACIÓN REAL' : 'simulación (agrega --aplicar para migrar)'}\n`);

  const [pendientes] = await db.query(`
    SELECT a.*, t.project_id
      FROM task_attachments a
      JOIN tasks t ON t.id = a.task_id
     WHERE a.storage_provider = 'local'
     ORDER BY t.project_id, a.id
  `);

  if (!pendientes.length) {
    console.log('No hay adjuntos pendientes de migrar.\n');
    await db.end();
    return;
  }

  console.log(`${pendientes.length} adjunto(s) por migrar\n`);

  let migrados = 0, ausentes = 0, fallidos = 0;

  for (const adjunto of pendientes) {
    const etiqueta = `[${adjunto.id}] ${adjunto.filename}`;
    const ruta = rutaLocal(adjunto);

    if (!ruta) {
      console.log(`  ? ${etiqueta} — el archivo ya no está en el disco, se omite`);
      ausentes++;
      continue;
    }

    if (!APLICAR) {
      console.log(`  · ${etiqueta} — iría a ${rutaLegible(adjunto)}/ (proyecto ${adjunto.project_id})`);
      migrados++;
      continue;
    }

    try {
      const parentId = await carpetaDestino(adjunto);
      const subido = await gdrive.uploadFile({
        name:     adjunto.filename,
        mimeType: adjunto.mimetype,
        buffer:   fs.readFileSync(ruta),
        parentId,
      });

      await db.query(
        `UPDATE task_attachments
            SET storage_provider = 'gdrive', external_id = ?, filepath = ?
          WHERE id = ?`,
        [subido.id, subido.id, adjunto.id]
      );

      // El disco se limpia solo después de que el registro quedó apuntando a Drive
      fs.unlinkSync(ruta);

      console.log(`  ✓ ${etiqueta}`);
      migrados++;
    } catch (error) {
      console.log(`  ✗ ${etiqueta} — ${error.message}`);
      fallidos++;
    }
  }

  console.log(
    `\nResumen: ${migrados} ${APLICAR ? 'migrados' : 'por migrar'} · ` +
    `${ausentes} sin archivo en disco · ${fallidos} con error\n`
  );

  await db.end();
  process.exit(fallidos ? 1 : 0);
}

main().catch(async (error) => {
  console.error(`\nError: ${error.message}\n`);
  try { await db.end(); } catch { /* la conexión ya estaba cerrada */ }
  process.exit(1);
});
