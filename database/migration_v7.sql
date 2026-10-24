-- ============================================================
--  Scrumban — Migración v7
-- ============================================================
--  Bitácora de archivos SGC (pestaña Actividad): qué se subió, se movió
--  a otra evidencia o se eliminó, quién lo hizo y cuándo.
--
--  Cada fila guarda una copia del nombre del archivo, del código de la
--  evidencia, del título de la tarea y del nombre de la persona, para
--  que el registro se pueda leer aunque después se borre cualquiera de
--  ellos.
--
--  CÓMO EJECUTARLA
--  ───────────────
--      cd backend
--      node scripts/migrate.js ../database/migration_v7.sql "mysql://usuario:clave@host:puerto/base"
--
--  Es segura de repetir: la tabla se crea solo si no existe y el paso 2
--  no duplica registros.
-- ============================================================


-- ── PASO 1 ── Bitácora ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS sgc_actividad (
  id                 INT PRIMARY KEY AUTO_INCREMENT,
  accion             VARCHAR(20)  NOT NULL,          -- subida | reasignacion | eliminacion
  user_id            INT          DEFAULT NULL,
  usuario_nombre     VARCHAR(255) DEFAULT NULL,
  attachment_id      INT          DEFAULT NULL,      -- sin FK: el archivo puede haberse eliminado
  filename           VARCHAR(255) NOT NULL,
  evidencia_id       INT          DEFAULT NULL,
  evidencia_codigo   VARCHAR(30)  DEFAULT NULL,
  evidencia_anterior VARCHAR(30)  DEFAULT NULL,      -- solo en reasignaciones
  task_id            INT          DEFAULT NULL,
  task_titulo        VARCHAR(255) DEFAULT NULL,
  project_id         INT          DEFAULT NULL,
  created_at         TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_actividad_fecha     (created_at),
  INDEX idx_actividad_usuario   (user_id, created_at),
  INDEX idx_actividad_evidencia (evidencia_id),
  FOREIGN KEY (user_id)      REFERENCES users(id)          ON DELETE SET NULL,
  FOREIGN KEY (evidencia_id) REFERENCES sgc_evidencias(id) ON DELETE SET NULL,
  FOREIGN KEY (task_id)      REFERENCES tasks(id)          ON DELETE SET NULL,
  FOREIGN KEY (project_id)   REFERENCES projects(id)       ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ── PASO 2 ── Las subidas que ya existían ────────────────────
-- Hasta ahora no se registraban. Se reconstruyen a partir de los
-- archivos SGC actuales, con su fecha original. Las eliminaciones y
-- reasignaciones anteriores no se pueden recuperar.
INSERT INTO sgc_actividad
  (accion, user_id, usuario_nombre, attachment_id, filename,
   evidencia_id, evidencia_codigo, task_id, task_titulo, project_id, created_at)
SELECT 'subida', ta.user_id, u.name, ta.id, ta.filename,
       ta.evidencia_id, e.evidencia, ta.task_id, t.title, t.project_id, ta.created_at
  FROM task_attachments ta
  JOIN tasks t               ON t.id = ta.task_id
  LEFT JOIN users u          ON u.id = ta.user_id
  LEFT JOIN sgc_evidencias e ON e.id = ta.evidencia_id
 WHERE ta.category = 'sgc'
   AND NOT EXISTS (
     SELECT 1 FROM sgc_actividad a
      WHERE a.accion = 'subida' AND a.attachment_id = ta.id
   );


-- ============================================================
--  ✓  Migración v7 completada
-- ============================================================
