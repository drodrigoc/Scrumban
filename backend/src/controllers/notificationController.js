const logger = require('../config/logger');
const db = require('../config/database');

exports.getAll = async (req, res) => {
  try {
    const [notifications] = await db.query(
      `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener notificaciones' });
  }
};

exports.getUnreadCount = async (req, res) => {
  try {
    const [result] = await db.query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = FALSE',
      [req.user.id]
    );
    res.json({ count: result[0].count });
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener conteo' });
  }
};

exports.markRead = async (req, res) => {
  try {
    await db.query('UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?', [req.params.id, req.user.id]);
    res.json({ message: 'Notificación marcada como leída' });
  } catch (error) {
    res.status(500).json({ message: 'Error al marcar notificación' });
  }
};

exports.markAllRead = async (req, res) => {
  try {
    await db.query('UPDATE notifications SET is_read = TRUE WHERE user_id = ?', [req.user.id]);
    res.json({ message: 'Todas las notificaciones marcadas como leídas' });
  } catch (error) {
    res.status(500).json({ message: 'Error al marcar notificaciones' });
  }
};
