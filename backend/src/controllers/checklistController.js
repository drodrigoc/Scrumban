const logger = require('../config/logger');
const db = require('../config/database');

exports.getItems = async (req, res) => {
  try {
    const { task_id } = req.params;
    const [items] = await db.query(
      'SELECT * FROM task_checklist_items WHERE task_id = ? ORDER BY position, id',
      [task_id]
    );
    res.json(items);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al obtener checklist' });
  }
};

exports.addItem = async (req, res) => {
  try {
    const { task_id } = req.params;
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ message: 'El texto es requerido' });

    const [maxPos] = await db.query(
      'SELECT COALESCE(MAX(position), -1) + 1 AS next_pos FROM task_checklist_items WHERE task_id = ?',
      [task_id]
    );

    const [result] = await db.query(
      'INSERT INTO task_checklist_items (task_id, text, position) VALUES (?, ?, ?)',
      [task_id, text.trim(), maxPos[0].next_pos]
    );

    res.status(201).json({
      id: result.insertId,
      task_id: parseInt(task_id),
      text: text.trim(),
      is_completed: false,
      position: maxPos[0].next_pos,
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al agregar ítem' });
  }
};

exports.updateItem = async (req, res) => {
  try {
    const { task_id, item_id } = req.params;
    const { text, is_completed } = req.body;

    const fields = [];
    const values = [];
    if (text !== undefined) { fields.push('text = ?'); values.push(text.trim()); }
    if (is_completed !== undefined) { fields.push('is_completed = ?'); values.push(is_completed ? 1 : 0); }

    if (!fields.length) return res.status(400).json({ message: 'Sin campos para actualizar' });

    values.push(item_id, task_id);
    await db.query(
      `UPDATE task_checklist_items SET ${fields.join(', ')} WHERE id = ? AND task_id = ?`,
      values
    );

    const [items] = await db.query('SELECT * FROM task_checklist_items WHERE id = ?', [item_id]);
    res.json(items[0]);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al actualizar ítem' });
  }
};

exports.deleteItem = async (req, res) => {
  try {
    const { task_id, item_id } = req.params;
    await db.query(
      'DELETE FROM task_checklist_items WHERE id = ? AND task_id = ?',
      [item_id, task_id]
    );
    res.json({ message: 'Ítem eliminado' });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al eliminar ítem' });
  }
};
