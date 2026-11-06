-- ============================================================
--  Actualización 2026-11-05 — Bitácora de auditoría
-- ============================================================
--  Solo para bases que ya existían antes de esta fecha (sandbox,
--  Railway). Una instalación nueva con instalacion.sql ya lo trae.
--
--  Registra quién entra al sistema (y quién falla al intentarlo) y los
--  cambios importantes: usuarios, proyectos, correo del sistema y
--  catálogo SGC. Se consulta en Administración → Auditoría.
--
--  CÓMO EJECUTARLO (desde la carpeta backend, con el usuario
--  administrador de la base, no con el de la aplicación)
--      node scripts/migrate.js ../database/actualizaciones/2026-11-05_auditoria.sql "mysql://usuario:clave@host:3306/base"
--  Es seguro repetirlo: lo ya aplicado se informa como "ya aplicado".
-- ============================================================

CREATE TABLE IF NOT EXISTS auditoria (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  creado_en       TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  user_id         INT           DEFAULT NULL,
  usuario_nombre  VARCHAR(255)  DEFAULT NULL,
  usuario_correo  VARCHAR(255)  DEFAULT NULL,
  accion          VARCHAR(50)   NOT NULL,
  categoria       VARCHAR(20)   NOT NULL,
  resultado       VARCHAR(10)   NOT NULL DEFAULT 'exito',
  entidad         VARCHAR(30)   DEFAULT NULL,
  entidad_id      INT           DEFAULT NULL,
  entidad_nombre  VARCHAR(255)  DEFAULT NULL,
  detalle         VARCHAR(1000) DEFAULT NULL,
  ip              VARCHAR(45)   DEFAULT NULL,
  navegador       VARCHAR(255)  DEFAULT NULL,
  INDEX idx_auditoria_fecha     (creado_en),
  INDEX idx_auditoria_usuario   (user_id, creado_en),
  INDEX idx_auditoria_categoria (categoria, creado_en),
  INDEX idx_auditoria_correo    (usuario_correo),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE users
  ADD COLUMN last_login_at DATETIME DEFAULT NULL;
