-- ============================================================
--  Scrumban — Migración v3
-- ============================================================
--  Adjuntos en Google Drive (Unidad Compartida).
--
--  Agrega:
--    1. De dónde se sirve cada adjunto (disco local o Drive)
--    2. El id del archivo en Drive
--    3. La carpeta de cada proyecto dentro de la Unidad Compartida
--
--  Los adjuntos que ya existen quedan marcados como 'local' y siguen
--  funcionando igual: esta migración no mueve ningún archivo.
--
--  CÓMO EJECUTARLA
--  ───────────────
--  Opción A — recomendada (local o Railway, todo de una vez):
--      cd backend
--      node scripts/migrate.js ../database/migration_v3.sql
--      node scripts/migrate.js ../database/migration_v3.sql "mysql://usuario:clave@host:puerto/basededatos"
--
--  Opción B — cliente MySQL (Workbench, TablePlus, DBeaver, CLI):
--      mysql -u root -p project_manager < database/migration_v3.sql
--
--  Si un paso ya estaba aplicado, MySQL responde "Duplicate column name":
--  es inofensivo, significa que ya está hecho.
-- ============================================================


-- ── PASO 1 ──────────────────────────────────────────────────
-- Dónde vive cada adjunto y su identificador en Drive.
--   storage_provider = 'local'  → disco del servidor (como hasta ahora)
--   storage_provider = 'gdrive' → Unidad Compartida, external_id es su id
ALTER TABLE task_attachments
  ADD COLUMN storage_provider VARCHAR(20)  NOT NULL DEFAULT 'local',
  ADD COLUMN external_id      VARCHAR(255) NULL DEFAULT NULL;


-- ── PASO 2 ──────────────────────────────────────────────────
-- Carpeta del proyecto dentro de la Unidad Compartida.
-- Se crea sola la primera vez que se sube un archivo del proyecto.
ALTER TABLE projects
  ADD COLUMN gdrive_folder_id VARCHAR(255) NULL DEFAULT NULL;


-- ── PASO 3 ──────────────────────────────────────────────────
-- Para listar rápido los adjuntos pendientes de migrar a Drive.
CREATE INDEX idx_attachments_storage ON task_attachments(storage_provider);


-- ============================================================
--  ✓  Migración v3 completada
-- ============================================================
