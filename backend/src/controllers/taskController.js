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
    const { status, assignee_id, priority, label_id } = req.query;

    let where = 'WHERE t.project_id = ?';
    const params = [project_id];

    if (status) { where += ' AND t.status = ?'; params.push(status); }
    if (assignee_id) { where += ' AND t.assignee_id = ?'; params.push(assignee_id); }
    if (priority) { where += ' AND t.priority = ?'; params.push(priority); }
    if (label_id) {
      where += ' AND EXISTS (SELECT 1 FROM task_labels tl WHERE tl.task_id = t.id AND tl.label_id = ?)';
      params.push(label_id);
    }

    const [tasks] = await db.query(`
      SELECT t.*,
        u.name as assignee_name, u.avatar as assignee_avatar,
        cb.name as created_by_name,
        GROUP_CONCAT(DISTINCT l.id, ':', l.name, ':', l.color SEPARATOR '|') as labels_raw
      FROM tasks t
      LEFT JOIN users u ON u.id = t.assignee_id
      LEFT JOIN users cb ON cb.id = t.created_by
      LEFT JOIN task_labels tl ON tl.task_id = t.id
      LEFT JOIN labels l ON l.id = tl.label_id
      ${where}
      GROUP BY t.id
      ORDER BY t.position, t.created_at
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
      WHERE ta.task_id = ? ORDER BY ta.created_at DESC
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

    res.json({ ...tasks[0], labels, comments, attachments, history, dependencies: deps });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al obtener tarea' });
  }
};

exports.create = async (req, res) => {
  try {
    const { project_id } = req.params;
    const { title, description, assignee_id, start_date, due_date, priority, status, label_ids } = req.body;

    if (!title) return res.status(400).json({ message: 'El título es requerido' });

    const [maxPos] = await db.query(
      'SELECT MAX(position) as max FROM tasks WHERE project_id = ? AND status = ?',
      [project_id, status || 'pending']
    );
    const position = (maxPos[0].max || 0) + 1;

    const [result] = await db.query(
      `INSERT INTO tasks (project_id, title, description, assignee_id, start_date, due_date, priority, status, position, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [project_id, title, description, assignee_id || null, start_date || null, due_date || null,
       priority || 'medium', status || 'pending', position, req.user.id]
    );

    const taskId = result.insertId;

    if (label_ids && label_ids.length) {
      const labelValues = label_ids.map(lid => [taskId, lid]);
      await db.query('INSERT INTO task_labels (task_id, label_id) VALUES ?', [labelValues]);
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
    const { title, description, assignee_id, start_date, due_date, priority, status, position, progress, label_ids } = req.body;

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
      if (task.assignee_id && task.assignee_id !== req.user.id) {
        await createNotification(task.assignee_id, 'Estado de tarea actualizado', `La tarea "${task.title}" cambió a ${status}`, 'status_changed', id, 'task');
      }
    }
    if (position !== undefined) { fields.push('position = ?'); values.push(position); }
    if (progress !== undefined) { fields.push('progress = ?'); values.push(progress); }

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

exports.uploadAttachment = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No se proporcionó archivo' });

    const [result] = await db.query(
      'INSERT INTO task_attachments (task_id, user_id, filename, filepath, filesize, mimetype) VALUES (?, ?, ?, ?, ?, ?)',
      [req.params.id, req.user.id, req.file.originalname, req.file.filename, req.file.size, req.file.mimetype]
    );

    res.status(201).json({
      id: result.insertId,
      filename: req.file.originalname,
      filepath: req.file.filename,
      filesize: req.file.size,
      mimetype: req.file.mimetype,
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al subir archivo' });
  }
};

exports.deleteAttachment = async (req, res) => {
  try {
    const fs = require('fs');
    const path = require('path');
    const [attachments] = await db.query('SELECT * FROM task_attachments WHERE id = ?', [req.params.attachmentId]);
    if (!attachments.length) return res.status(404).json({ message: 'Archivo no encontrado' });

    const filePath = path.join(process.env.UPLOAD_PATH || './uploads', attachments[0].filepath);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await db.query('DELETE FROM task_attachments WHERE id = ?', [req.params.attachmentId]);
    res.json({ message: 'Archivo eliminado' });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar archivo' });
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
