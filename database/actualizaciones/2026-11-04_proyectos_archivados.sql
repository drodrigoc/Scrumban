-- ============================================================
--  Actualización 2026-11-04 — Proyectos archivados
-- ============================================================
--  Solo para bases que ya existían antes de esta fecha (sandbox,
--  Railway). Una instalación nueva con instalacion.sql ya lo trae.
--
--  Un proyecto archivado sale de la lista principal y queda de solo
--  lectura; se puede restaurar. Eliminar un proyecto exige archivarlo
--  antes.
--
--  CÓMO EJECUTARLO (desde la carpeta backend)
--      node scripts/migrate.js ../database/actualizaciones/2026-11-04_proyectos_archivados.sql "mysql://usuario:clave@host:3306/base"
--  Es seguro repetirlo: lo ya aplicado se informa como "ya aplicado".
-- ============================================================

ALTER TABLE projects
  ADD COLUMN archived_at DATETIME DEFAULT NULL,
  ADD COLUMN archived_by INT      DEFAULT NULL;

ALTER TABLE projects
  ADD CONSTRAINT fk_projects_archived_by
  FOREIGN KEY (archived_by) REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_projects_archived ON projects(archived_at);
