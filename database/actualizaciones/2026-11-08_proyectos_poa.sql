-- ============================================================
--  Actualización 2026-11-08 — Proyectos del POA y su bloqueo
-- ============================================================
--  Solo para bases que ya existían antes de esta fecha (sandbox,
--  Railway). Una instalación nueva con instalacion.sql ya lo trae.
--
--  - es_poa / poa_aprobacion: si el proyecto viene del Plan Operativo
--    Anual y el texto de su aprobación (acta, fecha, instancia).
--  - planificacion_bloqueada: el administrador congela la planificación
--    de un proyecto POA (datos, alineación, cronograma y presupuesto).
--    La ejecución sigue: tareas, costos, evidencias.
--  Es seguro repetirlo: lo ya aplicado se informa como "ya aplicado".
-- ============================================================

ALTER TABLE projects
  ADD COLUMN es_poa         TINYINT(1)    NOT NULL DEFAULT 0,
  ADD COLUMN poa_aprobacion VARCHAR(1000) DEFAULT NULL;

ALTER TABLE projects
  ADD COLUMN planificacion_bloqueada TINYINT(1) NOT NULL DEFAULT 0,
  ADD COLUMN bloqueada_at            DATETIME   DEFAULT NULL,
  ADD COLUMN bloqueada_por           INT        DEFAULT NULL;

ALTER TABLE projects
  ADD CONSTRAINT fk_projects_bloqueada_por
  FOREIGN KEY (bloqueada_por) REFERENCES users(id) ON DELETE SET NULL;
