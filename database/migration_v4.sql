-- ============================================================
--  Scrumban — Migración v4
-- ============================================================
--  Evidencias SGC clasificadas en Drive por su taxonomía:
--
--      SGC/
--      └── Dimensión/
--          └── Criterio/
--              └── E1.2.3 — Nombre de la evidencia/
--                  └── archivos
--
--  Cuando una tarea tiene varias evidencias vinculadas, el archivo se
--  sube a la carpeta de cada una. Esta columna guarda a qué evidencia
--  corresponde cada copia, para poder borrarla o listarla por separado.
--
--  Los archivos SGC que ya existen quedan con evidencia_id nulo: se
--  siguen viendo igual y, si se migran a Drive, van a "Sin clasificar".
--
--  CÓMO EJECUTARLA
--  ───────────────
--      cd backend
--      node scripts/migrate.js ../database/migration_v4.sql
--      node scripts/migrate.js ../database/migration_v4.sql "mysql://usuario:clave@host:puerto/base"
--
--  "Duplicate column name" al repetirla significa que ya estaba aplicada.
-- ============================================================


-- ── PASO 1 ──────────────────────────────────────────────────
-- A qué evidencia SGC respalda este archivo.
-- NULL = adjunto normal de tarea, o evidencia sin clasificar.
ALTER TABLE task_attachments
  ADD COLUMN evidencia_id INT NULL DEFAULT NULL;


-- ── PASO 2 ──────────────────────────────────────────────────
-- Si se elimina una evidencia del catálogo, sus archivos no se borran:
-- quedan sin clasificar.
ALTER TABLE task_attachments
  ADD CONSTRAINT fk_attachments_evidencia
  FOREIGN KEY (evidencia_id) REFERENCES sgc_evidencias(id) ON DELETE SET NULL;


-- ── PASO 3 ──────────────────────────────────────────────────
-- Para listar rápido los archivos de una evidencia.
CREATE INDEX idx_attachments_evidencia ON task_attachments(evidencia_id);


-- ============================================================
--  ✓  Migración v4 completada
-- ============================================================
