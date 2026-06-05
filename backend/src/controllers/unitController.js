const logger = require('../config/logger');
const db = require('../config/database');

exports.getAll = async (req, res) => {
  try {
    // Include how many users belong to each unit
    const [units] = await db.query(`
      SELECT
        u.id, u.name, u.description, u.created_at,
        COUNT(usr.id) AS user_count
      FROM units u
      LEFT JOIN users usr ON usr.unit = u.name AND usr.is_active = 1
      GROUP BY u.id
      ORDER BY u.name
    `);
    res.json(units);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al obtener unidades' });
  }
};

exports.create = async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ message: 'El nombre de la unidad es requerido' });
    }

    const [existing] = await db.query(
      'SELECT id FROM units WHERE name = ?',
      [name.trim()]
    );
    if (existing.length) {
      return res.status(409).json({ message: 'Ya existe una unidad con ese nombre' });
    }

    const [result] = await db.query(
      'INSERT INTO units (name, description) VALUES (?, ?)',
      [name.trim(), description?.trim() || null]
    );

    res.status(201).json({
      id: result.insertId,
      name: name.trim(),
      description: description?.trim() || null,
      user_count: 0,
    });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al crear unidad' });
  }
};

exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    if (!name?.trim()) {
      return res.status(400).json({ message: 'El nombre de la unidad es requerido' });
    }

    const [existing] = await db.query(
      'SELECT id FROM units WHERE name = ? AND id != ?',
      [name.trim(), id]
    );
    if (existing.length) {
      return res.status(409).json({ message: 'Ya existe una unidad con ese nombre' });
    }

    // Also update users.unit to the new name so references stay consistent
    const [current] = await db.query('SELECT name FROM units WHERE id = ?', [id]);
    if (!current.length) return res.status(404).json({ message: 'Unidad no encontrada' });

    const oldName = current[0].name;

    await db.query(
      'UPDATE units SET name = ?, description = ? WHERE id = ?',
      [name.trim(), description?.trim() || null, id]
    );

    if (oldName !== name.trim()) {
      await db.query('UPDATE users SET unit = ? WHERE unit = ?', [name.trim(), oldName]);
    }

    const [updated] = await db.query(
      `SELECT u.id, u.name, u.description, u.created_at,
              COUNT(usr.id) AS user_count
       FROM units u
       LEFT JOIN users usr ON usr.unit = u.name AND usr.is_active = 1
       WHERE u.id = ?
       GROUP BY u.id`,
      [id]
    );
    res.json(updated[0]);
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al actualizar unidad' });
  }
};

exports.delete = async (req, res) => {
  try {
    const { id } = req.params;

    const [unit] = await db.query('SELECT name FROM units WHERE id = ?', [id]);
    if (!unit.length) return res.status(404).json({ message: 'Unidad no encontrada' });

    // Disassociate users before deleting
    await db.query('UPDATE users SET unit = NULL WHERE unit = ?', [unit[0].name]);
    await db.query('DELETE FROM units WHERE id = ?', [id]);

    res.json({ message: 'Unidad eliminada' });
  } catch (error) {
    logger.error(error);
    res.status(500).json({ message: 'Error al eliminar unidad' });
  }
};
