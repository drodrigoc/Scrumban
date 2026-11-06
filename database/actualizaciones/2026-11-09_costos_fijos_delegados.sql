-- ============================================================
--  Actualización 2026-11-09 — Costos fijos delegados
-- ============================================================
--  Solo para bases que ya existían antes de esta fecha (sandbox,
--  Railway). Una instalación nueva con instalacion.sql ya lo trae.
--
--  Los costos fijos (salarios, prestaciones) solo los ven el
--  administrador, el coordinador y el Super Visor del sistema. El
--  administrador o el coordinador del sistema pueden permitir que un
--  coordinador de un proyecto concreto también los vea y los maneje.
--  Es seguro repetirlo: lo ya aplicado se informa como "ya aplicado".
-- ============================================================

ALTER TABLE project_members
  ADD COLUMN ver_costos_fijos TINYINT(1) NOT NULL DEFAULT 0;
