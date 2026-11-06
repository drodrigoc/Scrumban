-- ============================================================
--  Actualización 2026-11-06 — Partidas del presupuesto en las tareas
-- ============================================================
--  Solo para bases que ya existían antes de esta fecha (sandbox,
--  Railway). Una instalación nueva con instalacion.sql ya lo trae.
--
--  Cada tarea puede indicar a qué partida variable del presupuesto
--  corresponde su costo. El ejecutado de las partidas variables se
--  calcula con esas tareas; el de las fijas se sigue escribiendo a mano.
--  Si se elimina la partida, sus tareas quedan "sin partida".
--
--  CÓMO EJECUTARLO (desde la carpeta backend)
--      node scripts/migrate.js ../database/actualizaciones/2026-11-06_partidas_en_tareas.sql "mysql://usuario:clave@host:3306/base"
--  Es seguro repetirlo: lo ya aplicado se informa como "ya aplicado".
-- ============================================================

ALTER TABLE tasks
  ADD COLUMN budget_item_id INT DEFAULT NULL;

CREATE INDEX idx_tasks_budget_item ON tasks(budget_item_id);

ALTER TABLE tasks
  ADD CONSTRAINT fk_tasks_budget_item
  FOREIGN KEY (budget_item_id) REFERENCES project_budget_items(id) ON DELETE SET NULL;
