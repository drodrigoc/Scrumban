const logger = require('../config/logger');
const db = require('../config/database');

async function createNotification(userId, title, message, type, refId, refType) {
  try {
    await db.query(
      'INSERT INTO notifications (user_id, title, message, type, reference_id, reference_type) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, title, message, type, refId, refType]
    );
  } catch (_) {}
}

async function logHistory(taskId, userId, field, oldVal, newVal) {
  try {
    await db.query(
      'INSERT INTO task_history (task_id, user_id, field_changed, old_value, new_value) VALUES (?, ?, ?, ?, ?)',
      [taskId, userId, field, oldVal, newVal]
    );
  } catch (_) {}
}

exports.getByProject = async (req, res) => {
  try {
    const { project_id } = req.params;
    const { status, assignee_id, priority, label_id, archived, month, phase_id } = req.query;

    let where = 'WHERE t.project_id = ?';
    const params = [project_id];

    if (status) { where += ' AND t.status = ?'; params.push(status); }
    if (assignee_id) { where += ' AND t.assignee_id = ?'; params.push(assignee_id); }
    if (priority) { where += ' AND t.priority = ?'; params.push(priority); }
    if (label_id) {
      where += ' AND EXISTS (SELECT 1 FROM task_labels tl WHERE tl.task_id = t.id AND tl.label_id = ?)';
      params.push(label_id);
    }
    if (phase_id) { where += ' AND t.phase_id = ?'; params.push(phase_id); }

    // Las archivadas quedan fuera de todas las vistas salvo que se pidan
    const onlyArchived = archived === '1' || archived === 'true';
    if (onlyArchived)            where += ' AND t.archived_at IS NOT NULL';
    else if (archived !== 'all') where += ' AND t.archived_at IS NULL';

    // month = 'YYYY-MM' sobre la fecha de cierre (vista de Archivo)
    if (month) {
      where += " AND DATE_FORMAT(COALESCE(t.completed_at, t.archived_at), '%Y-%m') = ?";
      params.push(month);
    }

    const orderBy = onlyArchived
      ? 'ORDER BY COALESCE(t.completed_at, t.archived_at) DESC, t.id DESC'
      : 'ORDER BY t.position, t.created_at';

    const [tasks] = await db.query(`
      SELECT t.*,
        u.name as assignee_name, u.avatar as assignee_avatar,
        cb.name as created_by_name,
        ph.name as phase_name, ph.color as phase_color,
        GROUP_CONCAT(DISTINCT l.id, ':', l.name, ':', l.color SEPARATOR '|') as labels_raw
      FROM tasks t
      LEFT JOIN users u ON u.id = t.assignee_id
      LEFT JOIN users cb ON cb.id = t.created_by
      LEFT JOIN project_phases ph ON ph.id = t.phase_id
      LEFT JOIN task_labels tl ON tl.task_id = t.id
      LEFT JOIN labels l ON l.id = tl.label_id
      ${where}
      GROUP BY t.id
      ${orderBy}
    `, params);

    const formatted = tasks.map(t => ({
      ...t,
      labels: t.labels_raw
        ? t.labels_raw.split('|').map(raw => {
            const [id, name, color] = raw.split(':');
            return { id: parseInt(id), name, color };
          })
        : [],
      labels_raw: undefined,
    }));

    res.json(formatted);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al obtener tareas' });
  }
};

exports.getById = async (req, res) => {
  try {
    const [tasks] = await db.query(`
      SELECT t.*,
        u.name as assignee_name, u.avatar as assignee_avatar,
        cb.name as created_by_name
      FROM tasks t
      LEFT JOIN users u ON u.id = t.assignee_id
      LEFT JOIN users cb ON cb.id = t.created_by
      WHERE t.id = ?
    `, [req.params.id]);

    if (!tasks.length) return res.status(404).json({ message: 'Tarea no encontrada' });

    const [labels] = await db.query(
      'SELECT l.* FROM labels l JOIN task_labels tl ON l.id = tl.label_id WHERE tl.task_id = ?',
      [req.params.id]
    );

    const [comments] = await db.query(`
      SELECT tc.*, u.name as user_name, u.avatar as user_avatar
      FROM task_comments tc JOIN users u ON u.id = tc.user_id
      WHERE tc.task_id = ? ORDER BY tc.created_at ASC
    `, [req.params.id]);

    const [attachments] = await db.query(`
      SELECT ta.*, u.name as uploaded_by_name
      FROM task_attachments ta JOIN users u ON u.id = ta.user_id
      WHERE ta.task_id = ? AND ta.category = 'task' ORDER BY ta.created_at DESC
    `, [req.params.id]);

    const [sgcAttachments] = await db.query(`
      SELECT ta.*, u.name as uploaded_by_name
      FROM task_attachments ta JOIN users u ON u.id = ta.user_id
      WHERE ta.task_id = ? AND ta.category = 'sgc' ORDER BY ta.created_at DESC
    `, [req.params.id]);

    const [history] = await db.query(`
      SELECT th.*, u.name as user_name
      FROM task_history th JOIN users u ON u.id = th.user_id
      WHERE th.task_id = ? ORDER BY th.created_at DESC
    `, [req.params.id]);

    const [deps] = await db.query(`
      SELECT t2.id, t2.title, t2.status FROM tasks t2
      JOIN task_dependencies td ON td.depends_on_id = t2.id
      WHERE td.task_id = ?
    `, [req.params.id]);

    const [sgcEvidencias] = await db.query(
      'SELECT e.* FROM sgc_evidencias e JOIN task_sgc ts ON e.id = ts.evidencia_id WHERE ts.task_id = ? ORDER BY e.evidencia ASC',
      [req.params.id]
    );

    res.json({ ...tasks[0], labels, comments, attachments, sgc_attachments: sgcAttachments, history, dependencies: deps, sgc_evidencias: sgcEvidencias });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al obtener tarea' });
  }
};

exports.create = async (req, res) => {
  try {
    const { project_id } = req.params;
    const { title, description, assignee_id, start_date, due_date, priority, status, label_ids, sgc_ids, costo, phase_id } = req.body;

    if (!title) return res.status(400).json({ message: 'El título es requerido' });

    const [maxPos] = await db.query(
      'SELECT MAX(position) as max FROM tasks WHERE project_id = ? AND status = ?',
      [project_id, status || 'pending']
    );
    const position = (maxPos[0].max || 0) + 1;

    // Una tarea creada ya completada guarda su fecha de cierre de una vez
    const completedAt = (status || 'pending') === 'completed' ? new Date() : null;

    const [result] = await db.query(
      `INSERT INTO tasks (project_id, title, description, assignee_id, start_date, due_date, priority, status, position, created_by, costo, phase_id, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [project_id, title, description, assignee_id || null, start_date || null, due_date || null,
       priority || 'medium', status || 'pending', position, req.user.id, costo || null,
       phase_id || null, completedAt]
    );

    const taskId = result.insertId;

    if (label_ids && label_ids.length) {
      const labelValues = label_ids.map(lid => [taskId, lid]);
      await db.query('INSERT INTO task_labels (task_id, label_id) VALUES ?', [labelValues]);
    }

    if (sgc_ids && sgc_ids.length) {
      const sgcValues = sgc_ids.map(eid => [taskId, eid]);
      await db.query('INSERT INTO task_sgc (task_id, evidencia_id) VALUES ?', [sgcValues]);
    }

    if (assignee_id && assignee_id !== req.user.id) {
      await createNotification(assignee_id, 'Nueva tarea asignada', `Se te asignó la tarea "${title}"`, 'task_assigned', taskId, 'task');
    }

    await logHistory(taskId, req.user.id, 'created', null, 'Tarea creada');

    const [tasks] = await db.query('SELECT * FROM tasks WHERE id = ?', [taskId]);
    res.status(201).json(tasks[0]);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al crear tarea' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, assignee_id, start_date, due_date, priority, status, position, progress, label_ids, sgc_ids, costo, phase_id } = req.body;

    const [current] = await db.query('SELECT * FROM tasks WHERE id = ?', [id]);
    if (!current.length) return res.status(404).json({ message: 'Tarea no encontrada' });

    const task = current[0];
    const fields = [];
    const values = [];
    const changes = [];

    if (title && title !== task.title) {
      fields.push('title = ?'); values.push(title);
      changes.push({ field: 'title', old: task.title, new: title });
    }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (assignee_id !== undefined) {
      fields.push('assignee_id = ?'); values.push(assignee_id || null);
      if (assignee_id && assignee_id !== task.assignee_id) {
        changes.push({ field: 'assignee', old: task.assignee_id, new: assignee_id });
        if (assignee_id !== req.user.id) {
          await createNotification(assignee_id, 'Tarea asignada', `Se te asignó la tarea "${task.title}"`, 'task_assigned', id, 'task');
        }
      }
    }
    if (start_date !== undefined) { fields.push('start_date = ?'); values.push(start_date || null); }
    if (due_date !== undefined) { fields.push('due_date = ?'); values.push(due_date || null); }
    if (priority) { fields.push('priority = ?'); values.push(priority); changes.push({ field: 'priority', old: task.priority, new: priority }); }
    if (status && status !== task.status) {
      fields.push('status = ?'); values.push(status);
      changes.push({ field: 'status', old: task.status, new: status });

      // Fecha de cierre: se sella al completar y se limpia al reabrir.
      // Es lo que permite agrupar el archivo por mes.
      if (status === 'completed') {
        fields.push('completed_at = ?'); values.push(new Date());
      } else if (task.status === 'completed') {
        fields.push('completed_at = ?', 'archived_at = ?'); values.push(null, null);
      }

      if (task.assignee_id && task.assignee_id !== req.user.id) {
        await createNotification(task.assignee_id, 'Estado de tarea actualizado', `La tarea "${task.title}" cambió a ${status}`, 'status_changed', id, 'task');
      }
    }
    if (position !== undefined) { fields.push('position = ?'); values.push(position); }
    if (progress !== undefined) { fields.push('progress = ?'); values.push(progress); }
    if (costo !== undefined) { fields.push('costo = ?'); values.push(costo || null); }
    if (phase_id !== undefined) {
      fields.push('phase_id = ?'); values.push(phase_id || null);
      if ((phase_id || null) !== task.phase_id) {
        changes.push({ field: 'phase', old: task.phase_id, new: phase_id || null });
      }
    }

    if (fields.length) {
      values.push(id);
      await db.query(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`, values);
    }

    // Actualizar etiquetas
    if (label_ids !== undefined) {
      await db.query('DELETE FROM task_labels WHERE task_id = ?', [id]);
      if (label_ids.length) {
        const labelValues = label_ids.map(lid => [id, lid]);
        await db.query('INSERT INTO task_labels (task_id, label_id) VALUES ?', [labelValues]);
      }
    }

    // Actualizar evidencias SGC
    if (sgc_ids !== undefined) {
      await db.query('DELETE FROM task_sgc WHERE task_id = ?', [id]);
      if (sgc_ids.length) {
        const sgcValues = sgc_ids.map(eid => [id, eid]);
        await db.query('INSERT INTO task_sgc (task_id, evidencia_id) VALUES ?', [sgcValues]);
      }
    }

    // Guardar historial
    for (const change of changes) {
      await logHistory(id, req.user.id, change.field, change.old, change.new);
    }

    const [updated] = await db.query('SELECT * FROM tasks WHERE id = ?', [id]);
    const [taskLabels] = await db.query(
      'SELECT l.* FROM labels l JOIN task_labels tl ON l.id = tl.label_id WHERE tl.task_id = ?',
      [id]
    );
    res.json({ ...updated[0], labels: taskLabels });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al actualizar tarea' });
  }
};

exports.delete = async (req, res) => {
  try {
    await db.query('DELETE FROM tasks WHERE id = ?', [req.params.id]);
    res.json({ message: 'Tarea eliminada' });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al eliminar tarea' });
  }
};

// ── Archivado ────────────────────────────────────────────────────────────
// Archivar no borra nada: saca la tarjeta del tablero y la manda a la
// vista de Archivo, agrupada por mes de cierre.

// PATCH /:id/archive
exports.archive = async (req, res) => {
  try {
    const { id } = req.params;
    const [current] = await db.query('SELECT id, status, completed_at FROM tasks WHERE id = ?', [id]);
    if (!current.length) return res.status(404).json({ message: 'Tarea no encontrada' });

    const task = current[0];
    const now = new Date();
    // Si se completó antes de que existiera completed_at, sellamos la fecha ahora
    const completedAt = task.status === 'completed' ? (task.completed_at || now) : task.completed_at;

    await db.query('UPDATE tasks SET archived_at = ?, completed_at = ? WHERE id = ?', [now, completedAt, id]);
    await logHistory(id, req.user.id, 'archived', null, 'Tarea archivada');

    const [[updated]] = await db.query('SELECT * FROM tasks WHERE id = ?', [id]);
    res.json(updated);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al archivar la tarea' });
  }
};

// PATCH /:id/unarchive
exports.unarchive = async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await db.query('UPDATE tasks SET archived_at = NULL WHERE id = ?', [id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Tarea no encontrada' });

    await logHistory(id, req.user.id, 'archived', 'Tarea archivada', 'Restaurada al tablero');

    const [[updated]] = await db.query('SELECT * FROM tasks WHERE id = ?', [id]);
    res.json(updated);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al restaurar la tarea' });
  }
};

// POST /archive-completed — archiva en bloque las completadas antiguas
// body: { older_than_days } — 0 archiva todas las completadas
exports.archiveCompleted = async (req, res) => {
  try {
    const { project_id } = req.params;
    const days = Math.max(0, parseInt(req.body?.older_than_days ?? 30, 10) || 0);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [result] = await db.query(
      `UPDATE tasks
          SET archived_at = NOW(),
              completed_at = COALESCE(completed_at, updated_at)
        WHERE project_id = ?
          AND status = 'completed'
          AND archived_at IS NULL
          AND COALESCE(completed_at, updated_at) <= ?`,
      [project_id, cutoff]
    );

    res.json({ archived: result.affectedRows });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al archivar las tareas completadas' });
  }
};

// GET /archived-count — para el contador del tablero
exports.archivedCount = async (req, res) => {
  try {
    const [[row]] = await db.query(
      'SELECT COUNT(*) AS count FROM tasks WHERE project_id = ? AND archived_at IS NOT NULL',
      [req.params.project_id]
    );
    res.json({ count: Number(row.count) });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al contar las tareas archivadas' });
  }
};

exports.addComment = async (req, res) => {
  try {
    const { content } = req.body;
    const { id } = req.params;

    if (!content?.trim()) return res.status(400).json({ message: 'El contenido es requerido' });

    const [result] = await db.query(
      'INSERT INTO task_comments (task_id, user_id, content) VALUES (?, ?, ?)',
      [id, req.user.id, content.trim()]
    );

    const [task] = await db.query('SELECT title, assignee_id FROM tasks WHERE id = ?', [id]);
    if (task[0]?.assignee_id && task[0].assignee_id !== req.user.id) {
      await createNotification(
        task[0].assignee_id,
        'Nuevo comentario',
        `${req.user.name} comentó en "${task[0].title}"`,
        'comment_added', id, 'task'
      );
    }

    const [comment] = await db.query(`
      SELECT tc.*, u.name as user_name, u.avatar as user_avatar
      FROM task_comments tc JOIN users u ON u.id = tc.user_id WHERE tc.id = ?
    `, [result.insertId]);

    res.status(201).json(comment[0]);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al agregar comentario' });
  }
};

exports.deleteComment = async (req, res) => {
  try {
    const [comments] = await db.query('SELECT user_id FROM task_comments WHERE id = ?', [req.params.commentId]);
    if (!comments.length) return res.status(404).json({ message: 'Comentario no encontrado' });
    if (comments[0].user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Sin permisos para eliminar este comentario' });
    }
    await db.query('DELETE FROM task_comments WHERE id = ?', [req.params.commentId]);
    res.json({ message: 'Comentario eliminado' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar comentario' });
  }
};

// ── Adjuntos ─────────────────────────────────────────────────────────────
// Cada archivo vive en el disco del servidor o en la Unidad Compartida de
// Google Drive, según estuviera configurado Drive al momento de subirlo.
// Los dos conviven: storage_provider dice de dónde sacarlo.

const fs   = require('fs');
const path = require('path');
const { Readable } = require('stream');
const gdrive = require('../services/gdrive');
const BASE_UPLOAD = process.env.UPLOAD_PATH || './uploads';

// Los adjuntos antiguos quedaron en la raíz de uploads/ y los siguientes
// en subcarpetas por categoría, así que se busca en ambos sitios.
function rutaLocal(attachment) {
  const sub = attachment.category === 'sgc' ? 'sgc' : 'tasks';
  const candidatos = [
    path.join(BASE_UPLOAD, sub, attachment.filepath),
    path.join(BASE_UPLOAD, attachment.filepath),
  ];
  return candidatos.find(p => fs.existsSync(p)) || null;
}

// Carpeta del proyecto dentro de la unidad. Se crea la primera vez que se
// sube algo y se recuerda en projects.gdrive_folder_id.
async function carpetaDelProyecto(projectId) {
  const [[proyecto]] = await db.query(
    'SELECT name, gdrive_folder_id FROM projects WHERE id = ?', [projectId]
  );
  if (!proyecto) throw new Error(`Proyecto ${projectId} no encontrado`);
  if (proyecto.gdrive_folder_id) return proyecto.gdrive_folder_id;

  // El sufijo con el id evita confundir dos proyectos con el mismo nombre
  const folderId = await gdrive.ensureFolder(`${proyecto.name} (#${projectId})`);
  await db.query('UPDATE projects SET gdrive_folder_id = ? WHERE id = ?', [folderId, projectId]);
  return folderId;
}

async function guardarAdjunto(req, category) {
  const file = req.file;
  let storage = 'local';
  let externalId = null;
  let filepath = file.filename;

  // Con Drive activo multer entrega el archivo en memoria, no en disco
  if (gdrive.isEnabled() && file.buffer) {
    const parentId = await carpetaDelProyecto(req.params.project_id);
    const subido = await gdrive.uploadFile({
      name:     file.originalname,
      mimeType: file.mimetype,
      buffer:   file.buffer,
      parentId,
    });
    storage    = 'gdrive';
    externalId = subido.id;
    filepath   = subido.id;
  }

  const [result] = await db.query(
    `INSERT INTO task_attachments
       (task_id, user_id, filename, filepath, filesize, mimetype, category, storage_provider, external_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [req.params.id, req.user.id, file.originalname, filepath,
     file.size, file.mimetype, category, storage, externalId]
  );

  return {
    id:               result.insertId,
    filename:         file.originalname,
    filepath,
    filesize:         file.size,
    mimetype:         file.mimetype,
    category,
    storage_provider: storage,
    external_id:      externalId,
  };
}

async function eliminarAdjunto(attachment) {
  if (attachment.storage_provider === 'gdrive' && attachment.external_id) {
    // Si falla el borrado en Drive se registra pero no se aborta: el
    // registro debe irse igual para no dejar un adjunto fantasma.
    try {
      await gdrive.deleteFile(attachment.external_id);
    } catch (error) {
      logger.error('No se pudo eliminar el archivo en Drive', {
        fileId: attachment.external_id, message: error.message,
      });
    }
  } else {
    const ruta = rutaLocal(attachment);
    if (ruta) fs.unlinkSync(ruta);
  }

  await db.query('DELETE FROM task_attachments WHERE id = ?', [attachment.id]);
}

exports.uploadAttachment = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No se proporcionó archivo' });
    res.status(201).json(await guardarAdjunto(req, 'task'));
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al subir archivo' });
  }
};

exports.deleteAttachment = async (req, res) => {
  try {
    const [attachments] = await db.query(
      'SELECT * FROM task_attachments WHERE id = ? AND category = ?', [req.params.attachmentId, 'task']
    );
    if (!attachments.length) return res.status(404).json({ message: 'Archivo no encontrado' });

    await eliminarAdjunto(attachments[0]);
    res.json({ message: 'Archivo eliminado' });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al eliminar archivo' });
  }
};

exports.uploadSGCAttachment = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No se proporcionó archivo' });
    res.status(201).json(await guardarAdjunto(req, 'sgc'));
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al subir archivo SGC' });
  }
};

exports.deleteSGCAttachment = async (req, res) => {
  try {
    const [attachments] = await db.query(
      'SELECT * FROM task_attachments WHERE id = ? AND category = ?', [req.params.attachmentId, 'sgc']
    );
    if (!attachments.length) return res.status(404).json({ message: 'Archivo no encontrado' });

    await eliminarAdjunto(attachments[0]);
    res.json({ message: 'Archivo eliminado' });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al eliminar archivo SGC' });
  }
};

// GET /:id/attachments/:attachmentId/download
// Los archivos de Drive no son públicos: el backend los transmite usando
// la sesión de quien los pide. Sirve también los locales, por uniformidad.
exports.downloadAttachment = async (req, res) => {
  try {
    const [[attachment]] = await db.query(
      'SELECT * FROM task_attachments WHERE id = ?', [req.params.attachmentId]
    );
    if (!attachment) return res.status(404).json({ message: 'Archivo no encontrado' });

    if (attachment.storage_provider === 'gdrive' && attachment.external_id) {
      const upstream = await gdrive.getFileResponse(attachment.external_id);

      // filename* cubre los nombres con acentos; filename queda de respaldo
      const seguro = attachment.filename.replace(/["\\]/g, '_');
      res.setHeader('Content-Type', attachment.mimetype || 'application/octet-stream');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${seguro}"; filename*=UTF-8''${encodeURIComponent(attachment.filename)}`
      );
      const largo = upstream.headers.get('content-length');
      if (largo) res.setHeader('Content-Length', largo);

      return Readable.fromWeb(upstream.body).pipe(res);
    }

    const ruta = rutaLocal(attachment);
    if (!ruta) return res.status(404).json({ message: 'El archivo ya no está en el servidor' });
    return res.download(ruta, attachment.filename);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al descargar el archivo' });
  }
};

exports.updatePositions = async (req, res) => {
  try {
    const { tasks } = req.body; // Array de { id, status, position }
    for (const t of tasks) {
      await db.query('UPDATE tasks SET status = ?, position = ? WHERE id = ?', [t.status, t.position, t.id]);
    }
    res.json({ message: 'Posiciones actualizadas' });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al actualizar posiciones' });
  }
};
