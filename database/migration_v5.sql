-- ============================================================
--  Scrumban — Migración v5
-- ============================================================
--  Correo de notificaciones con una cuenta de Google.
--
--  Agrega:
--    1. system_settings  → configuración editable desde la pantalla
--                          "Correo del sistema" (cuenta conectada,
--                          remitente, token cifrado)
--    2. email_queue      → cola de salida: los correos no se envían
--                          al momento de la acción, sino en segundo
--                          plano y con reintentos
--    3. users.email_notifications → cada usuario decide si recibe
--                          correos de notificación
--
--  CÓMO EJECUTARLA
--  ───────────────
--      cd backend
--      node scripts/migrate.js ../database/migration_v5.sql
--      node scripts/migrate.js ../database/migration_v5.sql "mysql://usuario:clave@host:puerto/base"
--
--  Si un paso ya estaba aplicado, MySQL responde "already exists" o
--  "Duplicate column name": es inofensivo.
-- ============================================================


-- ── PASO 1 ──────────────────────────────────────────────────
-- Configuración clave/valor editable desde la aplicación.
-- Los valores sensibles (el token de Google) se guardan cifrados.
CREATE TABLE IF NOT EXISTS system_settings (
  setting_key   VARCHAR(100) PRIMARY KEY,
  setting_value TEXT         DEFAULT NULL,
  updated_by    INT          DEFAULT NULL,
  updated_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ── PASO 2 ──────────────────────────────────────────────────
-- Cola de correos salientes.
--   pending → esperando su turno (send_after)
--   sending → tomado por el proceso de envío
--   sent    → entregado a Gmail
--   failed  → agotó los reintentos; last_error dice por qué
CREATE TABLE IF NOT EXISTS email_queue (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  to_email    VARCHAR(255)  NOT NULL,
  to_user_id  INT           DEFAULT NULL,
  subject     VARCHAR(255)  NOT NULL,
  html        MEDIUMTEXT    NOT NULL,
  text_body   MEDIUMTEXT    DEFAULT NULL,
  event_type  VARCHAR(50)   NOT NULL,
  status      ENUM('pending','sending','sent','failed') NOT NULL DEFAULT 'pending',
  attempts    INT           NOT NULL DEFAULT 0,
  last_error  VARCHAR(1000) DEFAULT NULL,
  send_after  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at     DATETIME      DEFAULT NULL,
  created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ── PASO 3 ──────────────────────────────────────────────────
CREATE INDEX idx_email_queue_pendientes ON email_queue(status, send_after);


-- ── PASO 4 ──────────────────────────────────────────────────
-- Preferencia de cada usuario. Por defecto todos reciben correos.
ALTER TABLE users
  ADD COLUMN email_notifications BOOLEAN NOT NULL DEFAULT TRUE;


-- ============================================================
--  ✓  Migración v5 completada
-- ============================================================
