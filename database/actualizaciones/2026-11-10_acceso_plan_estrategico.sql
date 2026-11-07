-- ============================================================
--  Actualización 2026-11-10 — Acceso al Plan estratégico
-- ============================================================
--  Solo para bases que ya existían antes de esta fecha (sandbox,
--  Railway). Una instalación nueva con instalacion.sql ya lo trae.
--
--  El Plan estratégico pasa a Administración / Supervisión, igual que
--  el SGC: lo ven el administrador, el Super Visor y las personas a las
--  que el administrador les dé acceso desde Control de Accesos.
--  Es seguro repetirlo: lo ya aplicado se informa como "ya aplicado".
-- ============================================================

ALTER TABLE users
  ADD COLUMN pei_access BOOLEAN DEFAULT FALSE;
