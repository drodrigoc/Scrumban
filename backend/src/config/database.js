const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'project_manager',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '+00:00',
  // Las columnas DATE son un día del calendario, sin hora. Si llegan como
  // Date quedan en medianoche UTC, y en El Salvador eso ya es el día anterior.
  dateStrings: ['DATE'],
});

// La aplicación trabaja siempre en UTC, sin depender de la zona horaria
// configurada en el servidor MySQL
pool.on('connection', (conn) => {
  // Este evento entrega la conexión de callbacks, no la de promesas
  conn.query("SET time_zone = '+00:00'", (err) => {
    if (err) console.error('❌ No se pudo fijar la zona horaria de MySQL:', err.message);
  });
});

// Verificar conexión al iniciar
pool.getConnection()
  .then(conn => {
    console.log('✅ Conexión a MySQL establecida');
    conn.release();
  })
  .catch(err => {
    console.error('❌ Error conectando a MySQL:', err.message);
  });

module.exports = pool;
