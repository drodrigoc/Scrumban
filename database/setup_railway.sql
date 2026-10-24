-- Scrumban - Script de instalacion (Railway / Produccion)
-- NO incluye DROP/CREATE DATABASE ni USE.
-- Ejecutar en el cliente MySQL de Railway o TablePlus/DBeaver.
-- Credenciales admin: admin@projectflow.com / Admin1234

-- 1. Usuarios
CREATE TABLE users (
  id                  INT PRIMARY KEY AUTO_INCREMENT,
  name                VARCHAR(255) NOT NULL,
  email               VARCHAR(255) UNIQUE NOT NULL,
  password            VARCHAR(255) NOT NULL,
  avatar              VARCHAR(500) DEFAULT NULL,
  unit                VARCHAR(100) DEFAULT NULL,
  role                ENUM('admin','coordinator','member','superViewer') DEFAULT 'member',
  sgc_access          BOOLEAN DEFAULT FALSE,
  is_active           BOOLEAN DEFAULT TRUE,
  email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  reset_token         VARCHAR(255) DEFAULT NULL,
  reset_token_expires DATETIME DEFAULT NULL,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 2. Unidades organizacionales
CREATE TABLE units (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  name        VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(255) DEFAULT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 3. Proyectos
CREATE TABLE projects (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  objectives  TEXT,
  start_date  DATE,
  end_date    DATE,
  status      ENUM('active','paused','completed','cancelled') DEFAULT 'active',
  progress    INT DEFAULT 0,
  owner_id    INT DEFAULT NULL,
  color       VARCHAR(7) DEFAULT '#3B82F6',
  presupuesto DECIMAL(14,2) DEFAULT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
);

-- 4. Miembros de proyecto
CREATE TABLE project_members (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  project_id INT NOT NULL,
  user_id    INT NOT NULL,
  role       ENUM('coordinator','member','viewer') DEFAULT 'member',
  joined_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_member (project_id, user_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id)     ON DELETE CASCADE
);

-- 5. Etiquetas
CREATE TABLE labels (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  name       VARCHAR(100) NOT NULL,
  color      VARCHAR(7) DEFAULT '#6366F1',
  project_id INT DEFAULT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- 6. Tareas
CREATE TABLE tasks (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  project_id  INT NOT NULL,
  title       VARCHAR(255) NOT NULL,
  description TEXT,
  assignee_id INT DEFAULT NULL,
  start_date  DATE DEFAULT NULL,
  due_date    DATE DEFAULT NULL,
  priority    ENUM('low','medium','high','critical') DEFAULT 'medium',
  status      VARCHAR(100) NOT NULL DEFAULT 'pending',
  position    INT DEFAULT 0,
  progress    INT DEFAULT 0,
  costo       DECIMAL(12,2) DEFAULT NULL,
  phase_id    INT DEFAULT NULL,
  completed_at DATETIME DEFAULT NULL,
  archived_at  DATETIME DEFAULT NULL,
  created_by  INT DEFAULT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id)  REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (assignee_id) REFERENCES users(id)    ON DELETE SET NULL,
  FOREIGN KEY (created_by)  REFERENCES users(id)    ON DELETE SET NULL
);

-- 7. Relacion tarea - etiqueta
CREATE TABLE task_labels (
  task_id  INT,
  label_id INT,
  PRIMARY KEY (task_id, label_id),
  FOREIGN KEY (task_id)  REFERENCES tasks(id)  ON DELETE CASCADE,
  FOREIGN KEY (label_id) REFERENCES labels(id) ON DELETE CASCADE
);

-- 8. Checklist de tareas
CREATE TABLE task_checklist_items (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  task_id      INT NOT NULL,
  text         VARCHAR(500) NOT NULL,
  is_completed BOOLEAN DEFAULT FALSE,
  position     INT DEFAULT 0,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- 9. Comentarios de tareas
CREATE TABLE task_comments (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  task_id    INT NOT NULL,
  user_id    INT NOT NULL,
  content    TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id)  ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)  ON DELETE CASCADE
);

-- 10. Archivos adjuntos de tareas
CREATE TABLE task_attachments (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  task_id    INT NOT NULL,
  user_id    INT NOT NULL,
  filename   VARCHAR(255) NOT NULL,
  filepath   VARCHAR(500) NOT NULL,
  filesize   INT DEFAULT NULL,
  mimetype   VARCHAR(100) DEFAULT NULL,
  category   VARCHAR(20) NOT NULL DEFAULT 'task',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id)  ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)  ON DELETE CASCADE
);

-- 11. Historial de cambios en tareas
CREATE TABLE task_history (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  task_id       INT NOT NULL,
  user_id       INT NOT NULL,
  field_changed VARCHAR(100) DEFAULT NULL,
  old_value     TEXT DEFAULT NULL,
  new_value     TEXT DEFAULT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id)  ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)  ON DELETE CASCADE
);

-- 12. Dependencias entre tareas
CREATE TABLE task_dependencies (
  task_id       INT NOT NULL,
  depends_on_id INT NOT NULL,
  PRIMARY KEY (task_id, depends_on_id),
  FOREIGN KEY (task_id)       REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (depends_on_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- 13. Notificaciones
CREATE TABLE notifications (
  id             INT PRIMARY KEY AUTO_INCREMENT,
  user_id        INT NOT NULL,
  title          VARCHAR(255) NOT NULL,
  message        TEXT DEFAULT NULL,
  type           ENUM('task_assigned','status_changed','comment_added','task_due_soon','task_overdue','project_update') DEFAULT 'task_assigned',
  reference_id   INT DEFAULT NULL,
  reference_type ENUM('task','project','comment') DEFAULT NULL,
  is_read        BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 14. SGC - Sistema de Gestion de Calidad
-- Cuatro niveles: Dimension -> Criterio -> Indicador -> Evidencia
CREATE TABLE sgc_dimensiones (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  codigo      VARCHAR(20) NOT NULL,
  nombre      VARCHAR(600) NOT NULL,
  descripcion TEXT DEFAULT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_dimension_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE sgc_criterios (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  dimension_id INT NOT NULL,
  codigo       VARCHAR(20) NOT NULL,
  nombre       VARCHAR(600) NOT NULL,
  descripcion  TEXT DEFAULT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_criterio_codigo (codigo),
  FOREIGN KEY (dimension_id) REFERENCES sgc_dimensiones(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE sgc_indicadores (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  criterio_id  INT NOT NULL,
  codigo       VARCHAR(30) NOT NULL,
  nombre       VARCHAR(600) NOT NULL,
  descripcion  TEXT DEFAULT NULL,
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_indicador_codigo (codigo),
  FOREIGN KEY (criterio_id) REFERENCES sgc_criterios(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE sgc_evidencias (
  id               INT PRIMARY KEY AUTO_INCREMENT,
  indicador_id     INT DEFAULT NULL,
  dimension        VARCHAR(255) DEFAULT NULL,
  criterio         VARCHAR(255) DEFAULT NULL,
  evidencia        VARCHAR(30) NOT NULL,
  nombre_evidencia VARCHAR(600) NOT NULL,
  descripcion      TEXT DEFAULT NULL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_evidencia (evidencia),
  CONSTRAINT fk_evidencias_indicador FOREIGN KEY (indicador_id) REFERENCES sgc_indicadores(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE task_sgc (
  task_id      INT NOT NULL,
  evidencia_id INT NOT NULL,
  PRIMARY KEY (task_id, evidencia_id),
  FOREIGN KEY (task_id)      REFERENCES tasks(id)          ON DELETE CASCADE,
  FOREIGN KEY (evidencia_id) REFERENCES sgc_evidencias(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 15. Columnas del tablero Kanban (compartidas por proyecto)
CREATE TABLE project_kanban_columns (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  project_id INT NOT NULL,
  column_key VARCHAR(100) NOT NULL,
  label      VARCHAR(100) NOT NULL,
  color      VARCHAR(50) DEFAULT 'bg-gray-400',
  ring       VARCHAR(50) DEFAULT 'ring-gray-400',
  position   INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_project_column (project_id, column_key),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 16. Partidas de presupuesto (costos fijos y variables)
CREATE TABLE project_budget_items (
  id              INT PRIMARY KEY AUTO_INCREMENT,
  project_id      INT NOT NULL,
  tipo            ENUM('fijo','variable') NOT NULL DEFAULT 'fijo',
  categoria       VARCHAR(120) NOT NULL,
  descripcion     VARCHAR(255) DEFAULT NULL,
  monto_estimado  DECIMAL(14,2) NOT NULL DEFAULT 0,
  monto_ejecutado DECIMAL(14,2) NOT NULL DEFAULT 0,
  fecha           DATE DEFAULT NULL,
  created_by      INT DEFAULT NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id)    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 17. Fases del proyecto (cronograma macro)
CREATE TABLE project_phases (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  project_id  INT NOT NULL,
  name        VARCHAR(255) NOT NULL,
  description VARCHAR(500) DEFAULT NULL,
  start_date  DATE DEFAULT NULL,
  end_date    DATE DEFAULT NULL,
  position    INT DEFAULT 0,
  color       VARCHAR(7) DEFAULT '#6366F1',
  progress    INT DEFAULT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE tasks
  ADD CONSTRAINT fk_tasks_phase FOREIGN KEY (phase_id) REFERENCES project_phases(id) ON DELETE SET NULL;

-- 18a. Configuracion editable desde la aplicacion
CREATE TABLE system_settings (
  setting_key   VARCHAR(100) PRIMARY KEY,
  setting_value TEXT DEFAULT NULL,
  updated_by    INT DEFAULT NULL,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 18b. Cola de correos salientes
CREATE TABLE email_queue (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  to_email    VARCHAR(255) NOT NULL,
  to_user_id  INT DEFAULT NULL,
  subject     VARCHAR(255) NOT NULL,
  html        MEDIUMTEXT NOT NULL,
  text_body   MEDIUMTEXT DEFAULT NULL,
  event_type  VARCHAR(50) NOT NULL,
  status      ENUM('pending','sending','sent','failed') NOT NULL DEFAULT 'pending',
  attempts    INT NOT NULL DEFAULT 0,
  last_error  VARCHAR(1000) DEFAULT NULL,
  send_after  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sent_at     DATETIME DEFAULT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX idx_email_queue_pendientes ON email_queue(status, send_after);

-- 18. Indices de rendimiento
CREATE INDEX idx_tasks_project        ON tasks(project_id);
CREATE INDEX idx_tasks_assignee       ON tasks(assignee_id);
CREATE INDEX idx_tasks_status         ON tasks(status);
CREATE INDEX idx_tasks_due_date       ON tasks(due_date);
CREATE INDEX idx_tasks_archived       ON tasks(project_id, archived_at);
CREATE INDEX idx_tasks_completed_at   ON tasks(completed_at);
CREATE INDEX idx_notifications_user   ON notifications(user_id, is_read);
CREATE INDEX idx_project_members_user ON project_members(user_id);
CREATE INDEX idx_checklist_task       ON task_checklist_items(task_id);
CREATE INDEX idx_units_name           ON units(name);
CREATE INDEX idx_budget_project       ON project_budget_items(project_id, tipo);
CREATE INDEX idx_phases_project       ON project_phases(project_id, position);

-- 19. Usuario administrador inicial (contrasena: Admin1234)
INSERT INTO users (name, email, password, role, is_active)
VALUES (
  'Administrador',
  'admin@projectflow.com',
  '$2a$10$3Yir6a6Yk9SiNO5zfzdTOOIbe.Q1N3tpY7bmhV4.qHo8ERzd6ZI6q',
  'admin',
  TRUE
);
