-- ============================================================
--  ProjectFlow — Script de instalación unificado
-- ============================================================
--  Descripción : Crea la base de datos completa con todas las
--                tablas, índices y el usuario administrador.
--
--  Credenciales iniciales del administrador
--  ─────────────────────────────────────────
--    Email      : admin@projectflow.com
--    Contraseña : Admin1234
--
--  ⚠  IMPORTANTE: Cambia la contraseña en el primer inicio
--                  de sesión desde Configuración de cuenta.
--
--  Ejecución
--  ─────────
--    mysql -u root -p < setup.sql
-- ============================================================

-- ------------------------------------------------------------
-- 0. Base de datos
-- ------------------------------------------------------------
DROP DATABASE IF EXISTS project_manager;
CREATE DATABASE project_manager
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE project_manager;

-- ------------------------------------------------------------
-- 1. Usuarios
-- ------------------------------------------------------------
CREATE TABLE users (
  id                  INT PRIMARY KEY AUTO_INCREMENT,
  name                VARCHAR(255) NOT NULL,
  email               VARCHAR(255) UNIQUE NOT NULL,
  password            VARCHAR(255) NOT NULL,
  avatar              VARCHAR(500)       DEFAULT NULL,
  unit                VARCHAR(100)       DEFAULT NULL,
  role                ENUM('admin','coordinator','member','viewer','superViewer')
                      DEFAULT 'member',
  is_active           BOOLEAN            DEFAULT TRUE,
  reset_token         VARCHAR(255)       DEFAULT NULL,
  reset_token_expires DATETIME           DEFAULT NULL,
  created_at          TIMESTAMP          DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP          DEFAULT CURRENT_TIMESTAMP
                      ON UPDATE CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- 2. Unidades organizacionales
-- ------------------------------------------------------------
CREATE TABLE units (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  name        VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(255)  DEFAULT NULL,
  created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
              ON UPDATE CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- 3. Proyectos
-- ------------------------------------------------------------
CREATE TABLE projects (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  name        VARCHAR(255) NOT NULL,
  description TEXT,
  objectives  TEXT,
  start_date  DATE,
  end_date    DATE,
  status      ENUM('active','paused','completed','cancelled') DEFAULT 'active',
  progress    INT           DEFAULT 0,
  owner_id    INT           DEFAULT NULL,
  color       VARCHAR(7)    DEFAULT '#3B82F6',
  created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
              ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ------------------------------------------------------------
-- 4. Miembros de proyecto
-- ------------------------------------------------------------
CREATE TABLE project_members (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  project_id INT NOT NULL,
  user_id    INT NOT NULL,
  role       ENUM('coordinator','member','viewer') DEFAULT 'member',
  joined_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unique_member (project_id, user_id),
  FOREIGN KEY (project_id) REFERENCES projects(id)  ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id)      ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 5. Etiquetas
-- ------------------------------------------------------------
CREATE TABLE labels (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  name       VARCHAR(100) NOT NULL,
  color      VARCHAR(7)   DEFAULT '#6366F1',
  project_id INT          DEFAULT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 6. Tareas
-- ------------------------------------------------------------
CREATE TABLE tasks (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  project_id  INT NOT NULL,
  title       VARCHAR(255) NOT NULL,
  description TEXT,
  assignee_id INT          DEFAULT NULL,
  start_date  DATE         DEFAULT NULL,
  due_date    DATE         DEFAULT NULL,
  priority    ENUM('low','medium','high','critical') DEFAULT 'medium',
  status      ENUM('pending','in_progress','in_review','completed') DEFAULT 'pending',
  position    INT          DEFAULT 0,
  progress    INT          DEFAULT 0,
  created_by  INT          DEFAULT NULL,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
              ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (project_id)  REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (assignee_id) REFERENCES users(id)    ON DELETE SET NULL,
  FOREIGN KEY (created_by)  REFERENCES users(id)    ON DELETE SET NULL
);

-- ------------------------------------------------------------
-- 7. Relación tarea ↔ etiqueta
-- ------------------------------------------------------------
CREATE TABLE task_labels (
  task_id  INT,
  label_id INT,
  PRIMARY KEY (task_id, label_id),
  FOREIGN KEY (task_id)  REFERENCES tasks(id)  ON DELETE CASCADE,
  FOREIGN KEY (label_id) REFERENCES labels(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 8. Ítems de checklist de tareas
-- ------------------------------------------------------------
CREATE TABLE task_checklist_items (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  task_id      INT NOT NULL,
  text         VARCHAR(500) NOT NULL,
  is_completed BOOLEAN      DEFAULT FALSE,
  position     INT          DEFAULT 0,
  created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 9. Comentarios de tareas
-- ------------------------------------------------------------
CREATE TABLE task_comments (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  task_id    INT  NOT NULL,
  user_id    INT  NOT NULL,
  content    TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id)  ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)  ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 10. Archivos adjuntos de tareas
-- ------------------------------------------------------------
CREATE TABLE task_attachments (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  task_id    INT          NOT NULL,
  user_id    INT          NOT NULL,
  filename   VARCHAR(255) NOT NULL,
  filepath   VARCHAR(500) NOT NULL,
  filesize   INT          DEFAULT NULL,
  mimetype   VARCHAR(100) DEFAULT NULL,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id)  ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)  ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 11. Historial de cambios en tareas
-- ------------------------------------------------------------
CREATE TABLE task_history (
  id            INT PRIMARY KEY AUTO_INCREMENT,
  task_id       INT          NOT NULL,
  user_id       INT          NOT NULL,
  field_changed VARCHAR(100) DEFAULT NULL,
  old_value     TEXT         DEFAULT NULL,
  new_value     TEXT         DEFAULT NULL,
  created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (task_id) REFERENCES tasks(id)  ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)  ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 12. Dependencias entre tareas
-- ------------------------------------------------------------
CREATE TABLE task_dependencies (
  task_id       INT NOT NULL,
  depends_on_id INT NOT NULL,
  PRIMARY KEY (task_id, depends_on_id),
  FOREIGN KEY (task_id)       REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (depends_on_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 13. Notificaciones
-- ------------------------------------------------------------
CREATE TABLE notifications (
  id             INT PRIMARY KEY AUTO_INCREMENT,
  user_id        INT NOT NULL,
  title          VARCHAR(255) NOT NULL,
  message        TEXT         DEFAULT NULL,
  type           ENUM('task_assigned','status_changed','comment_added',
                      'task_due_soon','task_overdue','project_update')
                 DEFAULT 'task_assigned',
  reference_id   INT          DEFAULT NULL,
  reference_type ENUM('task','project','comment') DEFAULT NULL,
  is_read        BOOLEAN      DEFAULT FALSE,
  created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- 14. Índices de rendimiento
-- ------------------------------------------------------------
CREATE INDEX idx_tasks_project        ON tasks(project_id);
CREATE INDEX idx_tasks_assignee       ON tasks(assignee_id);
CREATE INDEX idx_tasks_status         ON tasks(status);
CREATE INDEX idx_tasks_due_date       ON tasks(due_date);
CREATE INDEX idx_notifications_user   ON notifications(user_id, is_read);
CREATE INDEX idx_project_members_user ON project_members(user_id);
CREATE INDEX idx_checklist_task       ON task_checklist_items(task_id);
CREATE INDEX idx_units_name           ON units(name);

-- ------------------------------------------------------------
-- 15. Usuario administrador inicial
--     Contraseña: Admin1234
-- ------------------------------------------------------------
INSERT INTO users (name, email, password, role, is_active)
VALUES (
  'Administrador',
  'admin@projectflow.com',
  '$2a$10$3Yir6a6Yk9SiNO5zfzdTOOIbe.Q1N3tpY7bmhV4.qHo8ERzd6ZI6q',
  'admin',
  TRUE
);

-- ============================================================
--  ✓  Instalación completada
--  Accede con:  admin@projectflow.com  /  Admin1234
-- ============================================================
