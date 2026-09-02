-- ============================================================
--  Scrumban — Migración v2
-- ============================================================
--  Agrega:
--    1. Archivado de tareas          (tasks.completed_at, tasks.archived_at)
--    2. Columnas Kanban compartidas  (project_kanban_columns)
--    3. Presupuesto por partidas     (project_budget_items)
--    4. Cronograma macro / fases     (project_phases, tasks.phase_id)
--
--  CÓMO EJECUTARLA
--  ───────────────
--  Opción A — recomendada (local o Railway, todo de una vez):
--      cd backend
--      node scripts/migrate.js ../database/migration_v2.sql
--      node scripts/migrate.js ../database/migration_v2.sql "mysql://usuario:clave@host:puerto/basededatos"
--
--  Opción B — cliente MySQL (Workbench, TablePlus, DBeaver, CLI):
--      mysql -u root -p project_manager < database/migration_v2.sql
--
--  Opción C — consola web de Railway:
--      Copiar y pegar UN PASO A LA VEZ (los bloques numerados de abajo).
--      Esa consola no acepta varias sentencias juntas.
--
--  EL ORDEN IMPORTA: el paso 6 necesita el 3 y el 5 ya aplicados.
--
--  Si un paso ya estaba aplicado, MySQL responde con uno de estos
--  errores — son inofensivos, significa "ya está hecho", continúa
--  con el siguiente paso:
--      Duplicate column name            → la columna ya existe
--      Table ... already exists         → la tabla ya existe
--      Duplicate key name               → el índice ya existe
--      Duplicate foreign key constraint → la FK ya existe
-- ============================================================


-- ── PASO 1 ──────────────────────────────────────────────────
-- Columnas nuevas en tasks:
--   completed_at → fecha de cierre (agrupa el archivo por mes)
--   archived_at  → NULL = visible en el tablero
--   phase_id     → fase del cronograma macro
ALTER TABLE tasks
  ADD COLUMN completed_at DATETIME NULL DEFAULT NULL,
  ADD COLUMN archived_at  DATETIME NULL DEFAULT NULL,
  ADD COLUMN phase_id     INT      NULL DEFAULT NULL;


-- ── PASO 2 ──────────────────────────────────────────────────
-- Las tareas ya completadas toman su última actualización como
-- fecha de cierre aproximada.
UPDATE tasks
   SET completed_at = updated_at
 WHERE status = 'completed'
   AND completed_at IS NULL;


-- ── PASO 3 ──────────────────────────────────────────────────
-- Columnas del tablero Kanban, compartidas por proyecto.
-- Antes vivían en el localStorage de cada navegador.
CREATE TABLE IF NOT EXISTS project_kanban_columns (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  project_id INT          NOT NULL,
  column_key VARCHAR(100) NOT NULL,
  label      VARCHAR(100) NOT NULL,
  color      VARCHAR(50)  DEFAULT 'bg-gray-400',
  ring       VARCHAR(50)  DEFAULT 'ring-gray-400',
  position   INT          DEFAULT 0,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_project_column (project_id, column_key),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ── PASO 4 ──────────────────────────────────────────────────
-- Partidas de presupuesto: costos fijos y variables.
CREATE TABLE IF NOT EXISTS project_budget_items (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  project_id      INT NOT NULL,
  tipo            ENUM('fijo','variable') NOT NULL DEFAULT 'fijo',
  categoria       VARCHAR(120)  NOT NULL,
  descripcion     VARCHAR(255)  DEFAULT NULL,
  monto_estimado  DECIMAL(14,2) NOT NULL DEFAULT 0,
  monto_ejecutado DECIMAL(14,2) NOT NULL DEFAULT 0,
  fecha           DATE          DEFAULT NULL,
  created_by      INT           DEFAULT NULL,
  created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ── PASO 5 ──────────────────────────────────────────────────
-- Fases del proyecto (cronograma macro).
-- progress NULL = se calcula con las tareas de la fase.
CREATE TABLE IF NOT EXISTS project_phases (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  project_id  INT          NOT NULL,
  name        VARCHAR(255) NOT NULL,
  description VARCHAR(500) DEFAULT NULL,
  start_date  DATE         DEFAULT NULL,
  end_date    DATE         DEFAULT NULL,
  position    INT          DEFAULT 0,
  color       VARCHAR(7)   DEFAULT '#6366F1',
  progress    INT          DEFAULT NULL,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ── PASO 6 ──────────────────────────────────────────────────
-- Enlace tarea → fase. Necesita los pasos 1 y 5 aplicados.
-- Al borrar una fase, sus tareas quedan sin fase (no se borran).
ALTER TABLE tasks
  ADD CONSTRAINT fk_tasks_phase
  FOREIGN KEY (phase_id) REFERENCES project_phases(id) ON DELETE SET NULL;


-- ── PASO 7 ──────────────────────────────────────────────────
-- Índices para las consultas nuevas (archivo, fases, presupuesto).
ALTER TABLE tasks
  ADD INDEX idx_tasks_archived (project_id, archived_at),
  ADD INDEX idx_tasks_completed_at (completed_at),
  ADD INDEX idx_tasks_phase (phase_id);


-- ── PASO 8 ──────────────────────────────────────────────────
CREATE INDEX idx_budget_project ON project_budget_items(project_id, tipo);


-- ── PASO 9 ──────────────────────────────────────────────────
CREATE INDEX idx_phases_project ON project_phases(project_id, position);


-- ============================================================
--  ✓  Migración v2 completada
-- ============================================================
