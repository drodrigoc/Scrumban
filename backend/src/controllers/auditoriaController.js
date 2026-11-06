const logger = require('../config/logger');
const db     = require('../config/database');
const { ACCIONES, CATEGORIAS } = require('../services/auditoria');
const { hoyLocal } = require('../services/sgcCobertura');

/*
 * Administración → Auditoría: consulta y descarga de la bitácora.
 * Solo administradores (lo exige la ruta).
 *
 * Filtros (query): usuario (id), correo, categoria, accion, resultado,
 * desde, hasta (instantes ISO: el navegador ya convirtió el día local),
 * q (texto libre) y pagina.
 */

const POR_PAGINA = 50;
const MAX_CSV    = 100000; // tope de filas por descarga

function construirFiltro(query) {
  const { usuario, correo, categoria, accion, resultado, desde, hasta, q } = query;
  const condiciones = [];
  const valores = [];

  // Lo que la persona hizo y lo que se hizo sobre su cuenta (deshabilitarla,
  // restablecer su contraseña…): así se ve completo si tuvo algún problema
  if (usuario) {
    condiciones.push("(a.user_id = ? OR (a.entidad = 'usuario' AND a.entidad_id = ?))");
    valores.push(Number(usuario), Number(usuario));
  }
  if (correo)   { condiciones.push('a.usuario_correo = ?'); valores.push(String(correo).toLowerCase().trim()); }
  if (categoria && CATEGORIAS[categoria]) { condiciones.push('a.categoria = ?'); valores.push(categoria); }
  if (accion && ACCIONES[accion])         { condiciones.push('a.accion = ?');    valores.push(accion); }
  if (resultado === 'exito' || resultado === 'fallo') { condiciones.push('a.resultado = ?'); valores.push(resultado); }

  const fecha = (v) => { const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d; };
  if (desde && fecha(desde)) { condiciones.push('a.creado_en >= ?'); valores.push(fecha(desde)); }
  if (hasta && fecha(hasta)) { condiciones.push('a.creado_en < ?');  valores.push(fecha(hasta)); }

  if (q && String(q).trim()) {
    const texto = `%${String(q).trim()}%`;
    condiciones.push(`(a.usuario_nombre LIKE ? OR a.usuario_correo LIKE ? OR a.entidad_nombre LIKE ?
                       OR a.detalle LIKE ? OR a.ip LIKE ?)`);
    valores.push(texto, texto, texto, texto, `${String(q).trim()}%`);
  }

  return { where: condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '', valores };
}

const COLUMNAS = `a.id, a.creado_en, a.user_id, a.usuario_nombre, a.usuario_correo,
                  a.accion, a.categoria, a.resultado, a.entidad, a.entidad_id,
                  a.entidad_nombre, a.detalle, a.ip, a.navegador`;

const conEtiquetas = (fila) => ({
  ...fila,
  accion_etiqueta:    ACCIONES[fila.accion]?.etiqueta || fila.accion,
  categoria_etiqueta: CATEGORIAS[fila.categoria] || fila.categoria,
});

function faltaTabla(res, err) {
  if (err.code !== 'ER_NO_SUCH_TABLE') return false;
  res.status(503).json({
    message: 'Falta actualizar la base de datos: ejecuta database/actualizaciones/2026-11-05_auditoria.sql',
  });
  return true;
}

// GET /api/auditoria
exports.listar = async (req, res) => {
  try {
    const pagina = Math.max(1, parseInt(req.query.pagina, 10) || 1);
    const { where, valores } = construirFiltro(req.query);

    const [[items], [[{ total }]], [usuarios], [[resumen]]] = await Promise.all([
      db.query(
        `SELECT ${COLUMNAS} FROM auditoria a ${where}
          ORDER BY a.creado_en DESC, a.id DESC LIMIT ? OFFSET ?`,
        [...valores, POR_PAGINA, (pagina - 1) * POR_PAGINA]
      ),
      db.query(`SELECT COUNT(*) AS total FROM auditoria a ${where}`, valores),
      // Personas que aparecen en la bitácora, para el filtro
      db.query(
        `SELECT a.user_id AS id, MAX(a.usuario_nombre) AS nombre, MAX(a.usuario_correo) AS correo
           FROM auditoria a WHERE a.user_id IS NOT NULL
          GROUP BY a.user_id ORDER BY nombre`
      ),
      // Resumen de los últimos 7 días, sin depender de los filtros
      db.query(
        `SELECT
           SUM(accion = 'login')                          AS accesos,
           -- Por correo: sigue contando aunque la cuenta se haya eliminado
           COUNT(DISTINCT IF(accion = 'login', usuario_correo, NULL)) AS personas,
           SUM(accion = 'login_fallido')                  AS fallidos,
           SUM(accion = 'login_bloqueado')                AS bloqueos,
           SUM(categoria <> 'acceso')                     AS cambios
         FROM auditoria
        WHERE creado_en >= NOW() - INTERVAL 7 DAY`
      ),
    ]);

    // Correos con más intentos fallidos en las últimas 24 horas: quién
    // podría necesitar ayuda (o quién está siendo atacado)
    const [alertas] = await db.query(
      `SELECT usuario_correo AS correo, MAX(usuario_nombre) AS nombre, COUNT(*) AS intentos,
              MAX(creado_en) AS ultimo
         FROM auditoria
        WHERE accion IN ('login_fallido', 'login_bloqueado')
          AND creado_en >= NOW() - INTERVAL 1 DAY AND usuario_correo IS NOT NULL
        GROUP BY usuario_correo
       HAVING intentos >= 3
        ORDER BY intentos DESC LIMIT 5`
    );

    res.json({
      items: items.map(conEtiquetas),
      total: Number(total),
      pagina,
      por_pagina: POR_PAGINA,
      usuarios,
      acciones:   Object.entries(ACCIONES).map(([id, a]) => ({ id, ...a })),
      categorias: Object.entries(CATEGORIAS).map(([id, etiqueta]) => ({ id, etiqueta })),
      resumen: {
        accesos:  Number(resumen.accesos)  || 0,
        personas: Number(resumen.personas) || 0,
        fallidos: Number(resumen.fallidos) || 0,
        bloqueos: Number(resumen.bloqueos) || 0,
        cambios:  Number(resumen.cambios)  || 0,
      },
      alertas,
    });
  } catch (err) {
    if (faltaTabla(res, err)) return;
    logger.error('Error al consultar la auditoría', { message: err.message });
    res.status(500).json({ message: 'Error al consultar la auditoría' });
  }
};

// ── CSV ────────────────────────────────────────────────────────────────────
// Separado por comas, con BOM para que Excel reconozca los acentos. Las
// celdas que empiezan con = + - @ se anteponen con ' para que Excel no
// las ejecute como fórmula (alguien podría escribir "=HYPERLINK(...)"
// como correo en el login).
function celda(valor) {
  if (valor == null) return '';
  let texto = String(valor);
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  return /[",\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

const ZONA = process.env.APP_TIMEZONE || 'America/El_Salvador';
const formatoFecha = new Intl.DateTimeFormat('sv-SE', {
  timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});
const fechaLocal = (d) => (d ? formatoFecha.format(new Date(d)) : '');

// GET /api/auditoria/export.csv
exports.exportarCsv = async (req, res) => {
  try {
    const { where, valores } = construirFiltro(req.query);
    const [filas] = await db.query(
      `SELECT ${COLUMNAS} FROM auditoria a ${where}
        ORDER BY a.creado_en DESC, a.id DESC LIMIT ?`,
      [...valores, MAX_CSV]
    );

    const encabezado = [
      'Fecha y hora', 'Persona', 'Correo', 'Categoría', 'Acción', 'Resultado',
      'Elemento', 'Detalle', 'IP', 'Navegador', 'ID',
    ];
    const lineas = filas.map((f) => {
      const e = conEtiquetas(f);
      return [
        fechaLocal(f.creado_en), f.usuario_nombre, f.usuario_correo, e.categoria_etiqueta,
        e.accion_etiqueta, f.resultado === 'fallo' ? 'Fallo' : 'Éxito',
        f.entidad_nombre, f.detalle, f.ip, f.navegador, f.id,
      ].map(celda).join(',');
    });

    const nombre = `auditoria-${hoyLocal()}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${nombre}"`);
    if (filas.length === MAX_CSV) res.setHeader('X-Recortado', String(MAX_CSV));
    res.send('﻿' + [encabezado.join(','), ...lineas].join('\r\n') + '\r\n');
  } catch (err) {
    if (faltaTabla(res, err)) return;
    logger.error('Error al exportar la auditoría', { message: err.message });
    res.status(500).json({ message: 'Error al exportar la auditoría' });
  }
};
