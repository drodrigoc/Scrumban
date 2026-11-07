-- ============================================================
--  Scrumban — Instalación de la base de datos
-- ============================================================
--  Crea todas las tablas, el usuario administrador inicial y el
--  catálogo SGC (7 dimensiones, 28 criterios, 71 indicadores y
--  362 evidencias). Se ejecuta UNA vez, sobre una base de datos vacía.
--
--  No crea ni borra la base de datos: créala antes, por ejemplo
--      CREATE DATABASE scrumban CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
--
--  CÓMO EJECUTARLO (desde la carpeta backend)
--      node scripts/migrate.js ../database/instalacion.sql "mysql://usuario:clave@host:3306/base"
--  Debe terminar con "0 con error". También se puede abrir y ejecutar
--  completo en MySQL Workbench, DBeaver o TablePlus.
--
--  USUARIO INICIAL: admin@projectflow.com / Admin1234
--  Esta clave está en el repositorio público: al entrar, crea tu propio
--  administrador y deshabilita este.
-- ============================================================


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
  pei_access          BOOLEAN DEFAULT FALSE,           -- puede ver el Plan estratégico
  is_active           BOOLEAN DEFAULT TRUE,
  email_notifications BOOLEAN NOT NULL DEFAULT TRUE,
  reset_token         VARCHAR(255) DEFAULT NULL,
  reset_token_expires DATETIME DEFAULT NULL,
  last_login_at       DATETIME DEFAULT NULL,
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
  gdrive_folder_id VARCHAR(255) DEFAULT NULL,
  color       VARCHAR(7) DEFAULT '#3B82F6',
  presupuesto DECIMAL(14,2) DEFAULT NULL,
  es_poa      TINYINT(1)    NOT NULL DEFAULT 0,      -- viene del Plan Operativo Anual
  poa_aprobacion VARCHAR(1000) DEFAULT NULL,           -- texto de la aprobación del POA
  planificacion_bloqueada TINYINT(1) NOT NULL DEFAULT 0, -- el administrador congeló la planificación
  bloqueada_at DATETIME DEFAULT NULL,
  bloqueada_por INT DEFAULT NULL,
  archived_at DATETIME DEFAULT NULL,
  archived_by INT DEFAULT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id)    REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (archived_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_projects_bloqueada_por FOREIGN KEY (bloqueada_por) REFERENCES users(id) ON DELETE SET NULL
);

-- 4. Miembros de proyecto
CREATE TABLE project_members (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  project_id INT NOT NULL,
  user_id    INT NOT NULL,
  role       ENUM('coordinator','member','viewer') DEFAULT 'member',
  ver_costos_fijos TINYINT(1) NOT NULL DEFAULT 0, -- coordinador del proyecto autorizado a ver los costos fijos
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
  budget_item_id INT DEFAULT NULL,
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
  storage_provider VARCHAR(20)  NOT NULL DEFAULT 'local',
  external_id VARCHAR(255) DEFAULT NULL,
  evidencia_id INT          DEFAULT NULL,
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

-- Archivos de evidencia: si se elimina una evidencia, sus archivos
-- quedan sin clasificar (la tabla de adjuntos se creó antes que esta)
ALTER TABLE task_attachments
  ADD CONSTRAINT fk_attachments_evidencia
  FOREIGN KEY (evidencia_id) REFERENCES sgc_evidencias(id) ON DELETE SET NULL;

-- Bitácora de archivos SGC (pestaña Actividad): guarda copia de los
-- nombres para seguir siendo legible si se borra el archivo, la tarea,
-- la evidencia o la persona
CREATE TABLE sgc_actividad (
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

-- La partida variable del presupuesto a la que corresponde el costo de la tarea
CREATE INDEX idx_tasks_budget_item ON tasks(budget_item_id);
ALTER TABLE tasks
  ADD CONSTRAINT fk_tasks_budget_item FOREIGN KEY (budget_item_id) REFERENCES project_budget_items(id) ON DELETE SET NULL;

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

-- 18c. Bitacora de auditoria (accesos y cambios importantes; se conserva un ano)
CREATE TABLE auditoria (
  id              BIGINT PRIMARY KEY AUTO_INCREMENT,
  creado_en       TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  user_id         INT           DEFAULT NULL,
  usuario_nombre  VARCHAR(255)  DEFAULT NULL,
  usuario_correo  VARCHAR(255)  DEFAULT NULL,
  accion          VARCHAR(50)   NOT NULL,
  categoria       VARCHAR(20)   NOT NULL,
  resultado       VARCHAR(10)   NOT NULL DEFAULT 'exito',
  entidad         VARCHAR(30)   DEFAULT NULL,
  entidad_id      INT           DEFAULT NULL,
  entidad_nombre  VARCHAR(255)  DEFAULT NULL,
  detalle         VARCHAR(1000) DEFAULT NULL,
  ip              VARCHAR(45)   DEFAULT NULL,
  navegador       VARCHAR(255)  DEFAULT NULL,
  INDEX idx_auditoria_fecha     (creado_en),
  INDEX idx_auditoria_usuario   (user_id, creado_en),
  INDEX idx_auditoria_categoria (categoria, creado_en),
  INDEX idx_auditoria_correo    (usuario_correo),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

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
CREATE INDEX idx_projects_archived     ON projects(archived_at);
CREATE INDEX idx_attachments_storage   ON task_attachments(storage_provider);
CREATE INDEX idx_attachments_evidencia ON task_attachments(evidencia_id);

-- 19. Usuario administrador inicial (contrasena: Admin1234)
INSERT INTO users (name, email, password, role, is_active)
VALUES (
  'Administrador',
  'admin@projectflow.com',
  '$2a$10$3Yir6a6Yk9SiNO5zfzdTOOIbe.Q1N3tpY7bmhV4.qHo8ERzd6ZI6q',
  'admin',
  TRUE
);


-- 20. Catálogo SGC: modelo de acreditación en cuatro niveles
--     Dimensión → Criterio → Indicador → Evidencia
-- 20a. Dimensiones (7) ─────────────────────────────
INSERT INTO sgc_dimensiones (codigo, nombre)
SELECT x.codigo, x.nombre FROM (
  SELECT '1' AS codigo, 'Gobierno, liderazgo, administración financiera y autorregulación institucional' AS nombre
  UNION ALL SELECT '2', 'Investigación, desarrollo e innovación'
  UNION ALL SELECT '3', 'Docencia y sistemas formativos'
  UNION ALL SELECT '4', 'Estudiantes y graduados'
  UNION ALL SELECT '5', 'Infraestructura y recursos'
  UNION ALL SELECT '6', 'Vinculación externa de la IES'
  UNION ALL SELECT '7', 'Proyección y vinculación social'
) AS x
ON DUPLICATE KEY UPDATE nombre = x.nombre;


-- 20b. Criterios (28) ──────────────────────────────
INSERT INTO sgc_criterios (dimension_id, codigo, nombre)
SELECT d.id, x.codigo, x.nombre FROM (
  SELECT '1.1' AS codigo, 'La institución tiene un sistema de gobierno y gestión que están alineados con su filosofía institucional y objetivos estratégicos.' AS nombre, '1' AS padre
  UNION ALL SELECT '1.2', 'La IES posee un liderazgo que promueve la cohesión, identidad y sentido de comunidad organizacional en el ámbito institucional en todos sus niveles.', '1'
  UNION ALL SELECT '1.3', 'La administración superior de la IES asegura una gestión financiera eficiente, transparente y sostenible para cumplir su filosofía institucional.', '1'
  UNION ALL SELECT '1.4', 'La IES demuestra compromiso con los sistemas internos de aseguramiento de calidad', '1'
  UNION ALL SELECT '2.1', 'La IES dispone de políticas institucionales bien definidas, comunicadas y aprobadas, que orientan, fortalecen y regulan las actividades de investigación, desarrollo e innovación.', '2'
  UNION ALL SELECT '2.2', 'La IES asigna recursos humanos, materiales, financieros y de equipamiento adecuados para realizar investigaciones de calidad.', '2'
  UNION ALL SELECT '2.3', 'La IES dispone de planes y presupuestos específicos para I+D+i, con mecanismos claros de seguimiento, evaluación, actualización y divulgación.', '2'
  UNION ALL SELECT '2.4', 'La IES promueve un desarrollo investigativo robusto, con un enfoque en la calidad y pertinencia de las investigaciones realizadas.', '2'
  UNION ALL SELECT '2.5', 'La IES cuenta con mecanismos claros para la divulgación de conocimiento y la transferencia de saberes hacia la sociedad.', '2'
  UNION ALL SELECT '3.1', 'La IES cuenta con una planta docente calificada.', '3'
  UNION ALL SELECT '3.2', 'La IES dispone de un sistema estructurado y transparente de escalafón docente.', '3'
  UNION ALL SELECT '3.3', 'La IES garantiza la formación continua y especializada de sus docentes.', '3'
  UNION ALL SELECT '3.4', 'Desarrollo coherente del currículo con la práctica docente.', '3'
  UNION ALL SELECT '3.5', 'La IES implementa un sistema de evaluación docente con múltiples actores.', '3'
  UNION ALL SELECT '3.6', 'La IES diseña su oferta académica de forma coherente con el entorno e innovaciones tecnológicas.', '3'
  UNION ALL SELECT '4.1', 'La IES cuenta con un sistema robusto para la admisión, permanencia y egreso de estudiantes.', '4'
  UNION ALL SELECT '4.2', 'La IES sitúa a los estudiantes en el centro de su proyecto educativo con enfoque integral.', '4'
  UNION ALL SELECT '4.3', 'La IES fomenta y facilita la participación activa de los estudiantes en el proyecto educativo.', '4'
  UNION ALL SELECT '4.4', 'La IES mantiene una relación activa y continua con sus graduados.', '4'
  UNION ALL SELECT '4.5', 'La IES garantiza el respeto a la diversidad y la inclusión en la comunidad.', '4'
  UNION ALL SELECT '4.6', 'La IES promueve la internacionalización y movilidad como parte de su estrategia educativa.', '4'
  UNION ALL SELECT '5.1', 'La IES cuenta con la infraestructura y recursos necesarios para garantizar condiciones óptimas de aprendizaje.', '5'
  UNION ALL SELECT '5.2', 'La IES demuestra compromiso con la sostenibilidad, la inclusión, y la digitalización de sus servicios.', '5'
  UNION ALL SELECT '6.1', 'La institución está activamente vinculada con sectores nacionales e internacionales.', '6'
  UNION ALL SELECT '6.2', 'La IES construye relaciones académicas, de investigación y proyección internacionales con normas flexibles para la movilidad.', '6'
  UNION ALL SELECT '7.1', 'La IES promueve la proyección social mediante programas que responden a necesidades comunitarias.', '7'
  UNION ALL SELECT '7.2', 'La IES dispone de los medios y recursos físicos y digitales para asegurar la accesibilidad de su información a todos los interesados y brinda con transparencia toda la información académica, de investigación, presupuestaria, de proyección e internacionalización y su actividad institucional.', '7'
  UNION ALL SELECT '7.3', 'La IES demuestra pertinencia con la comunidad educativa y cumple su misión y visión.', '7'
) AS x, sgc_dimensiones AS d
WHERE d.codigo = x.padre
ON DUPLICATE KEY UPDATE dimension_id = d.id, nombre = x.nombre;


-- 20c. Indicadores (71) ────────────────────────────
INSERT INTO sgc_indicadores (criterio_id, codigo, nombre)
SELECT c.id, x.codigo, x.nombre FROM (
  SELECT '1.1.1' AS codigo, 'La IES cuenta con una estructura organizativa efectiva y coherente con las funciones sustantivas y requerimientos del entorno.' AS nombre, '1.1' AS padre
  UNION ALL SELECT '1.1.2', 'El sistema de gobierno responde a la filosofía institucional', '1.1'
  UNION ALL SELECT '1.1.3', 'La gestión institucional promueve la transparencia y el cumplimiento de las normas a través de políticas y códigos de conducta institucionales.', '1.1'
  UNION ALL SELECT '1.1.4', 'La IES demuestra su compromiso ético y de respeto a las leyes y el orden constitucional', '1.1'
  UNION ALL SELECT '1.1.5', 'Liderazgo efectivo con experiencia en educación superior', '1.1'
  UNION ALL SELECT '1.2.1', 'La IES demuestra un clima organizacional coherente con la Misión y Valores Institucionales en todos sus niveles', '1.2'
  UNION ALL SELECT '1.2.2', 'Los órganos de gobierno promueven y garantizan mecanismos de consulta y participación con representación equitativa para la toma de decisiones', '1.2'
  UNION ALL SELECT '1.2.3', 'La IES demuestra que sus políticas de gestión de personal fortalecen las competencias de su equipo para el cumplimiento de la filosofía institucional', '1.2'
  UNION ALL SELECT '1.2.4', 'La IES cuenta con mecanismos internos y externos para la comunicación institucional', '1.2'
  UNION ALL SELECT '1.3.1', 'La IES cuenta con planes financieros acorde con su plan estratégico y responde a su modelo educativo', '1.3'
  UNION ALL SELECT '1.3.2', 'La IES posee políticas formalizadas para la planificación, adquisición y mantenimiento de recursos operativos', '1.3'
  UNION ALL SELECT '1.3.3', 'La IES demuestra transparencia financiera en su gestión', '1.3'
  UNION ALL SELECT '1.4.1', 'La institución promueve la cultura de calidad e implementa una política que promueve la autoevaluación y mejora continua.', '1.4'
  UNION ALL SELECT '1.4.2', 'La IES dispone de mecanismos formalizados y sistemas de información que facilitan la gestión interna de la calidad', '1.4'
  UNION ALL SELECT '1.4.3', 'La IES demuestra que retoma datos de sus procesos de evaluación interna, los analiza y utiliza para tomar decisiones', '1.4'
  UNION ALL SELECT '1.4.4', 'La IES integra el seguimiento y la evaluación de los planes de mejora a través de su sistema de aseguramiento interno de la calidad, tomando en cuenta las observaciones de la CdA.', '1.4'
  UNION ALL SELECT '2.1.1', 'La IES cuenta con políticas y normas institucionales aprobadas, para guiar la investigación, desarrollo e innovación.', '2.1'
  UNION ALL SELECT '2.1.2', 'La IES dispone de mecanismos participativos para la evaluación y actualización periódica de sus políticas de I+D+i para asegurar su relevancia y efectividad en la generación de nuevo conocimiento', '2.1'
  UNION ALL SELECT '2.2.1', 'La IES asigna recursos humanos, materiales, digitales y de equipamiento adecuados y suficientes para garantizar una investigación, desarrollo e innovación de alta calidad.', '2.2'
  UNION ALL SELECT '2.2.2', 'La IES dispone de planes para la actualización y mantenimiento para asegurar la continuidad y calidad en las actividades de investigación, desarrollo e innovación.', '2.2'
  UNION ALL SELECT '2.3.1', 'La IES ejecuta un porcentaje significativo e incremental de su presupuesto total a la investigación, desarrollo, innovación y transferencia de conocimiento, con mecanismos concretos de seguimiento y evaluación de resultados.', '2.3'
  UNION ALL SELECT '2.3.2', 'La IES demuestra su capacidad para atraer y gestionar financiamiento interno y externo para proyectos de investigación, desarrollo e innovación, contribuyendo a la diversificación de sus ingresos.', '2.3'
  UNION ALL SELECT '2.4.1', 'La IES demuestra que realiza investigaciones de calidad en todas las áreas de conocimiento, con resultados que son divulgados y evaluados en función de sus resultados', '2.4'
  UNION ALL SELECT '2.4.2', 'La IES promueve la colaboración multidisciplinaria e intersectorial en sus proyectos de investigación, participando en asociaciones nacionales e internacionales con resultados claros.', '2.4'
  UNION ALL SELECT '2.5.1', 'La IES tiene mecanismos definidos para la divulgación del conocimiento y la transferencia de saberes hacia la sociedad', '2.5'
  UNION ALL SELECT '2.5.2', 'Las acciones de divulgación son evaluadas regularmente para maximizar los resultados de las contribuciones de investigación, desarrollo e innovación', '2.5'
  UNION ALL SELECT '3.1.1', 'La planta docente de la IES es suficiente según tipo de contratación en relación a la cantidad de estudiantes que posee y está calificada para desempeñar sus funciones.', '3.1'
  UNION ALL SELECT '3.1.2', 'La IES posee un programa de formación y actualización continua de sus docentes', '3.1'
  UNION ALL SELECT '3.2.1', 'La IES posee un escalafón docente formal y se actualiza periódicamente para reflejar el desarrollo profesional y académico de los docentes', '3.2'
  UNION ALL SELECT '3.2.2', 'La IES dispone de políticas y normas de incentivos según tipo de contratación y según funciones de docencia, investigación y proyección social', '3.2'
  UNION ALL SELECT '3.3.1', 'La IES promueve la participación de docentes en actividades de investigación y proyección social.', '3.3'
  UNION ALL SELECT '3.3.2', 'La IES invierte recursos en la formación continua de sus docentes e investigadores', '3.3'
  UNION ALL SELECT '3.4.1', 'La IES realiza una verificación y evaluación de la coherencia entre la práctica docente y el currículo establecido para cada disciplina', '3.4'
  UNION ALL SELECT '3.4.2', 'La IES dispone de mecanismos para la actualización curricular con participación de todos los actores', '3.4'
  UNION ALL SELECT '3.5.1', 'La IES posee un sistema de evaluación docente integral que promueve la mejora continua y que integra diferentes perspectivas del proceso formativo.', '3.5'
  UNION ALL SELECT '3.5.2', 'La IES dispone de mecanismos como normas y políticas encaminados a corregir los resultados negativos de las evaluaciones docentes', '3.5'
  UNION ALL SELECT '3.6.1', 'Existe coherencia del currículo con el Modelo Educativo Institucional', '3.6'
  UNION ALL SELECT '3.6.2', 'La IES posee un proceso de actualización de los programas académicos para alinearse con las necesidades del entorno, las tendencias actuales y las innovaciones.', '3.6'
  UNION ALL SELECT '3.6.3', 'Participación de actores relevantes en el diseño y revisión Curricular', '3.6'
  UNION ALL SELECT '4.1.1', 'La IES cuenta con un proceso de admisión público, transparente, equitativo y alineado con su misión institucional', '4.1'
  UNION ALL SELECT '4.1.2', 'La IES implementa estrategias y mecanismos de permanencia', '4.1'
  UNION ALL SELECT '4.1.3', 'La IES garantiza un proceso de egreso que asegura que los estudiantes completen sus programas académicos', '4.1'
  UNION ALL SELECT '4.1.4', 'La IES dispone procedimientos que aseguran una graduación oportuna a los estudiantes', '4.1'
  UNION ALL SELECT '4.2.1', 'La IES se asegura de implementar sus programas académicos según su proyecto educativo', '4.2'
  UNION ALL SELECT '4.2.2', 'La IES ofrece una amplia gama de servicios complementarios para respaldar el bienestar de sus estudiantes', '4.2'
  UNION ALL SELECT '4.3.1', 'La IES asegura la representación y participación activa de los estudiantes en los órganos de gobierno de la IES.', '4.3'
  UNION ALL SELECT '4.3.2', 'La IES demuestra la participación de estudiantes en investigación, programas de proyección social', '4.3'
  UNION ALL SELECT '4.3.3', 'La IES asegura la participación estudiantil en la elaboración y revisión periódica programas académicos', '4.3'
  UNION ALL SELECT '4.4.1', 'La IES dispone de mecanismos de vinculación con graduados', '4.4'
  UNION ALL SELECT '4.4.2', 'La IES dispone de mecanismos para identificar la percepción de los graduados acerca del proceso formativo', '4.4'
  UNION ALL SELECT '4.5.1', 'La IES posee información confiable acerca de estudiantes pertenecientes a grupos en condición de vulnerabilidad', '4.5'
  UNION ALL SELECT '4.5.2', 'La IES cuenta con programas y actividades de sensibilización y formación en diversidad e inclusión', '4.5'
  UNION ALL SELECT '4.5.3', 'La IES cuenta programas de apoyo a estudiantes matriculados que pertenecen a grupos en condición de vulnerabilidad', '4.5'
  UNION ALL SELECT '4.6.1', 'La IES promueve la internacionalización como parte de sus políticas institucionales', '4.6'
  UNION ALL SELECT '4.6.2', 'La IES integra la internacionalización en el currículo como una estrategia para mejorar la calidad educativa', '4.6'
  UNION ALL SELECT '5.1.1', 'Los edificios, instalaciones, laboratorios y campus están diseñados y construidos conforme a las normas de seguridad y accesibilidad adecuadas para el proceso de enseñanza y aprendizaje', '5.1'
  UNION ALL SELECT '5.1.2', 'La IES cuenta con planes de inversión para mejoras en infraestructura y su mantenimiento', '5.1'
  UNION ALL SELECT '5.1.3', 'La institución proporciona a la comunidad académica recursos educacionales tales como bibliotecas, recursos de apoyo, material didáctico, centros de práctica, acceso a bases de datos digitales, centros de impresión, acceso a Internet que son adecuados en cantidad y calidad para satisfacer sus propósitos, actividades y proyectos de desarrollo', '5.1'
  UNION ALL SELECT '5.2.1', 'La IES demuestra su compromiso con la sostenibilidad ambiental mediante la implementación de prácticas responsables que minimizan el impacto ecológico de sus operaciones', '5.2'
  UNION ALL SELECT '5.2.2', 'La IES trabaja activamente en la eliminación de barreras digitales, garantizando un acceso igualitario para toda su comunidad', '5.2'
  UNION ALL SELECT '5.2.3', 'La IES invierte esfuerzos en la digitalización y modernización continua de sus servicios, asegurando que tanto estudiantes como docentes y personal administrativo puedan beneficiarse de tecnologías actualizadas y recursos digitales accesibles que faciliten el aprendizaje y la gestión académica', '5.2'
  UNION ALL SELECT '6.1.1', 'La IES posee una estructura y normativa institucional para gestionar actividades de internacionalización en múltiples dimensiones, respaldada por acuerdos y convenios', '6.1'
  UNION ALL SELECT '6.1.2', 'La IES establece vínculos efectivos con instituciones nacionales e internacionales para promover la formación académica, investigación y experiencias multiculturales', '6.1'
  UNION ALL SELECT '6.2.1', 'La IES tiene normas y procedimientos claros para la vinculación internacional, incluyendo reconocimiento de estudios, ofertas académicas internacionales, e intercambios académicos, con mecanismos de evaluación establecidos', '6.2'
  UNION ALL SELECT '6.2.2', 'La IES realiza actividades de intercambio de conocimientos, investigación conjunta y proyección institucional y las evalúa periódicamente', '6.2'
  UNION ALL SELECT '7.1.1', 'La IES dispone de políticas, procedimientos y mecanismos de proyección social y transferencia de sus resultados a la sociedad y a la comunidad universitaria', '7.1'
  UNION ALL SELECT '7.1.2', 'La IES integra la proyección social en su currículo de forma coherente entre el modelo educativo y las carreras que imparte', '7.1'
  UNION ALL SELECT '7.2.1', 'La IES demuestra que divulga con transparencia y con amplia cobertura su quehacer institucional a través de la rendición de cuentas', '7.2'
  UNION ALL SELECT '7.2.2', 'La IES contribuye por distintos medios a las grandes discusiones sociales de actualidad con opiniones y criterios calificados, fundados en su experiencia, trayectoria y el resultado de sus investigaciones', '7.2'
  UNION ALL SELECT '7.3.1', 'La IES demuestra que su oferta académica, de proyección responde a las necesidades del entorno', '7.3'
  UNION ALL SELECT '7.3.2', 'La IES demuestra que su comunidad académica se involucra activamente en proyectos sociales que atienden problemáticas del entorno', '7.3'
) AS x, sgc_criterios AS c
WHERE c.codigo = x.padre
ON DUPLICATE KEY UPDATE criterio_id = c.id, nombre = x.nombre;


-- 20d. Evidencias (362) ─────────────────────────────
INSERT INTO sgc_evidencias (indicador_id, evidencia, nombre_evidencia)
SELECT i.id, x.codigo, x.nombre FROM (
  SELECT '1.1.1.1' AS codigo, 'Estatutos y reglamentos de la IES (debidamente registrados en la DNES)' AS nombre, '1.1.1' AS padre
  UNION ALL SELECT '1.1.1.2', 'Estructura organizacional (debidamente registradas en la DNES)', '1.1.1'
  UNION ALL SELECT '1.1.1.3', 'Manual de cargos y funciones a nivel directivo', '1.1.1'
  UNION ALL SELECT '1.1.1.4', 'Hoja de vida de autoridades y atestados', '1.1.1'
  UNION ALL SELECT '1.1.1.5', 'Normas y mecanismos de integración, elección y sustitución de las autoridades superiores y sus documentos probatorios', '1.1.1'
  UNION ALL SELECT '1.1.1.6', 'Compendio de normativas institucionales aprobados y vigentes', '1.1.1'
  UNION ALL SELECT '1.1.2.1', 'Modelo Educativo Institucional', '1.1.2'
  UNION ALL SELECT '1.1.2.2', 'Filosofía Institucional', '1.1.2'
  UNION ALL SELECT '1.1.2.3', 'Plan de Desarrollo Institucional (Plan Estratégico)', '1.1.2'
  UNION ALL SELECT '1.1.2.4', 'Planes Operativos', '1.1.2'
  UNION ALL SELECT '1.1.2.5', 'Acta de revisión y actualización de la filosofía institucional', '1.1.2'
  UNION ALL SELECT '1.1.2.6', 'Plan de divulgación a la comunidad universitaria', '1.1.2'
  UNION ALL SELECT '1.1.2.7', 'Informes de consultas a la comunidad universitaria para la actualización de la filosofía institucional.', '1.1.2'
  UNION ALL SELECT '1.1.2.8', 'Informes de consulta a los grupos de interés sobre el desarrollo de los Planes Institucionales.', '1.1.2'
  UNION ALL SELECT '1.1.3.1', 'Códigos de ética práctica creado y aprobado por diferentes instancias de la IES y se renueva periódicamente.', '1.1.3'
  UNION ALL SELECT '1.1.3.2', 'Políticas institucionales relacionadas a la integridad de la comunidad educativa', '1.1.3'
  UNION ALL SELECT '1.1.3.3', 'Procedimientos y documentos probatorios relacionados a la resolución de conflictos internos y externos', '1.1.3'
  UNION ALL SELECT '1.1.3.4', 'Documentos probatorios de la aplicación de los procedimientos relacionados a la integridad de los miembros de la comunidad educativa', '1.1.3'
  UNION ALL SELECT '1.1.3.5', 'Mecanismos de divulgación del quehacer institucional', '1.1.3'
  UNION ALL SELECT '1.1.3.6', 'Normas internas de comportamientos de todo el personal institucional y estudiantes', '1.1.3'
  UNION ALL SELECT '1.1.3.7', 'Régimen de sanciones para comportamientos improcedentes (ej. normativa de acoso, violencia sexual, violencia de género, entre otras)', '1.1.3'
  UNION ALL SELECT '1.1.4.1', 'Documentos que demuestren cumplimiento normativo (Ej. políticas anticorrupción, promoción de la equidad y la justicia, resolución de conflictos, entre otros)', '1.1.4'
  UNION ALL SELECT '1.1.5.1', 'Documentación de la cualificación académica y experiencia profesional de la alta autoridad académica y administrativa de la IES', '1.1.5'
  UNION ALL SELECT '1.1.5.2', 'Documentos que demuestren la formación de posgrado de las autoridades académicas y administrativas.', '1.1.5'
  UNION ALL SELECT '1.1.5.3', 'Liderazgo académico pertinente, con formación coherente a la función que desempeña dentro de la IES', '1.1.5'
  UNION ALL SELECT '1.1.5.4', 'Registro de programas de capacitación y formación continua de las autoridades de la IES', '1.1.5'
  UNION ALL SELECT '1.2.1.1', 'Encuestas de satisfacción y percepción del clima organizacional y planes remediales para superar retos identificados', '1.2.1'
  UNION ALL SELECT '1.2.1.2', 'Evaluaciones de desempeño de la Alta Dirección y todo el personal institucional', '1.2.1'
  UNION ALL SELECT '1.2.1.3', 'Informe anual de gestión y logros institucionales', '1.2.1'
  UNION ALL SELECT '1.2.2.1', 'Estructura de gobierno', '1.2.2'
  UNION ALL SELECT '1.2.2.2', 'Políticas institucionales', '1.2.2'
  UNION ALL SELECT '1.2.2.3', 'Mecanismos de participación de la comunidad educativa en la toma de decisiones (que incluya informes de resultados de consultas y procesos participativos)', '1.2.2'
  UNION ALL SELECT '1.2.2.4', 'Actas y documentos de reuniones de participación comunitaria', '1.2.2'
  UNION ALL SELECT '1.2.3.1', 'Programas de capacitación y desarrollo profesional', '1.2.3'
  UNION ALL SELECT '1.2.3.2', 'Políticas de incentivos internos', '1.2.3'
  UNION ALL SELECT '1.2.3.3', 'Informes de impacto de capacitación', '1.2.3'
  UNION ALL SELECT '1.2.4.1', 'Plan de comunicación institucional y transparencia', '1.2.4'
  UNION ALL SELECT '1.2.4.2', 'Evidencias de comunicaciones oficiales', '1.2.4'
  UNION ALL SELECT '1.2.4.3', 'Encuestas de satisfacción y percepción de la rendición de cuentas con actores internos y externos de la IES', '1.2.4'
  UNION ALL SELECT '1.2.4.4', 'Informe de evaluación de la comunicación institucional con actores internos y externos de la IES', '1.2.4'
  UNION ALL SELECT '1.2.4.5', 'Manual de marca institucional', '1.2.4'
  UNION ALL SELECT '1.2.4.6', 'Informes de seguimiento y retroalimentación sobre procesos de información y divulgación con actores internos y externos de la IES', '1.2.4'
  UNION ALL SELECT '1.3.1.1', 'Estados financieros auditados', '1.3.1'
  UNION ALL SELECT '1.3.1.2', 'Política de inversiones', '1.3.1'
  UNION ALL SELECT '1.3.1.3', 'Reporte de ejecución presupuestaria', '1.3.1'
  UNION ALL SELECT '1.3.1.4', 'Plan estratégico institucional', '1.3.1'
  UNION ALL SELECT '1.3.1.5', 'Indicadores de solvencia económica', '1.3.1'
  UNION ALL SELECT '1.3.2.1', 'Documentos de políticas y procedimientos', '1.3.2'
  UNION ALL SELECT '1.3.2.2', 'Documentos de la gestión financiera (ej. manuales operativos, mapas de procesos, reglamentos, etc.)', '1.3.2'
  UNION ALL SELECT '1.3.2.3', 'Actas de reuniones', '1.3.2'
  UNION ALL SELECT '1.3.2.4', 'Plan de gestión de recursos', '1.3.2'
  UNION ALL SELECT '1.3.2.5', 'Registros de adquisiciones', '1.3.2'
  UNION ALL SELECT '1.3.2.7', 'Contratos y acuerdos de servicios', '1.3.2'
  UNION ALL SELECT '1.3.3.1', 'Informes financieros auditados', '1.3.3'
  UNION ALL SELECT '1.3.3.2', 'Actas de reuniones del consejo directivo o junta de gobierno', '1.3.3'
  UNION ALL SELECT '1.3.3.3', 'Informes de rendición de cuentas a la comunidad universitaria sobre el uso de recursos', '1.3.3'
  UNION ALL SELECT '1.3.3.4', 'Documentación de procesos de consulta y participación como respaldo para políticas de inversión y planificación financiera', '1.3.3'
  UNION ALL SELECT '1.3.3.5', 'Informes de auditoría interna y externa', '1.3.3'
  UNION ALL SELECT '1.3.3.6', 'Sistema de licitación y libre gestión para adquisición de bienes y servicios que demuestre la transparencia y optimización de las gestiones de compras del IES', '1.3.3'
  UNION ALL SELECT '1.4.1.1', 'Política de calidad', '1.4.1'
  UNION ALL SELECT '1.4.1.2', 'Objetivos de calidad', '1.4.1'
  UNION ALL SELECT '1.4.1.3', 'Manual de calidad', '1.4.1'
  UNION ALL SELECT '1.4.1.4', 'Mecanismos de divulgación de la política de calidad', '1.4.1'
  UNION ALL SELECT '1.4.2.1', 'Una estructura clara que define las responsabilidades y autoridades para el área de aseguramiento interno de la calidad', '1.4.2'
  UNION ALL SELECT '1.4.2.2', 'Mapas de procesos', '1.4.2'
  UNION ALL SELECT '1.4.2.3', 'Procedimientos estandarizados para la operación de la IES', '1.4.2'
  UNION ALL SELECT '1.4.2.4', 'Formatos y registros', '1.4.2'
  UNION ALL SELECT '1.4.3.1', 'Mapa de aliados estratégicos actualizado regularmente por parte de la IES', '1.4.3'
  UNION ALL SELECT '1.4.3.2', 'Mecanismos de gestión de la documentación y análisis de datos', '1.4.3'
  UNION ALL SELECT '1.4.3.3', 'Documentos que respalden el seguimiento continuo de los procesos para identificar desviaciones', '1.4.3'
  UNION ALL SELECT '1.4.3.4', 'Planes, análisis y matriz de gestión de riesgos', '1.4.3'
  UNION ALL SELECT '1.4.3.5', 'Procedimientos y registros de no conformidades', '1.4.3'
  UNION ALL SELECT '1.4.3.6', 'Encuestas y otros mecanismos para medir la satisfacción de los estudiantes, docentes, administrativos, empleadores y otras partes interesadas', '1.4.3'
  UNION ALL SELECT '1.4.4.1', 'Actas de reuniones de la instancia encargada de la calidad', '1.4.4'
  UNION ALL SELECT '1.4.4.2', 'Informes de seguimiento y evaluación', '1.4.4'
  UNION ALL SELECT '1.4.4.3', 'Informes de auditoría interna', '1.4.4'
  UNION ALL SELECT '1.4.4.4', 'Planes de mejora presentados a la CdA (anteriores y vigente)', '1.4.4'
  UNION ALL SELECT '1.4.4.5', 'Informes anuales de seguimiento', '1.4.4'
  UNION ALL SELECT '2.1.1.1', 'Documentos oficiales de políticas y normas de investigación', '2.1.1'
  UNION ALL SELECT '2.1.1.2', 'Actas de reuniones y acuerdos de aprobación de políticas y reglamentos de investigación', '2.1.1'
  UNION ALL SELECT '2.1.1.3', 'Documentos que detallan las estrategias de investigación, desarrollo e innovación alineadas con las políticas institucionales', '2.1.1'
  UNION ALL SELECT '2.1.2.1', 'Informes periódicos que muestren la implementación efectiva de las políticas, así como la evaluación de sus resultados', '2.1.2'
  UNION ALL SELECT '2.1.2.2', 'Resultados de auditorías internas o externas que verifiquen la aplicación de las políticas de investigación, desarrollo e innovación', '2.1.2'
  UNION ALL SELECT '2.1.2.3', 'Resultados de la retroalimentación de actores claves sobre la efectividad de las políticas implementadas', '2.1.2'
  UNION ALL SELECT '2.1.2.4', 'Documentación de convenios y alianzas estratégicas con otras instituciones', '2.1.2'
  UNION ALL SELECT '2.2.1.1', 'Documentación que certifique que el personal de I+D+i posee los títulos, experiencia y competencias necesarias para gestionar proyectos de investigación', '2.2.1'
  UNION ALL SELECT '2.2.1.2', 'Estructura organizativa del área de investigación que incluya investigadores internos y asociados, nacionales e internacionales.', '2.2.1'
  UNION ALL SELECT '2.2.1.3', 'Listados detallados de equipos, software, insumos y materiales disponibles para la investigación, así como su estado de conservación', '2.2.1'
  UNION ALL SELECT '2.2.1.4', 'Evidencia de laboratorios, talleres y otros espacios de investigación que demuestren el cumplimiento de normas de seguridad y funcionalidad', '2.2.1'
  UNION ALL SELECT '2.2.1.5', 'Plataformas institucionales para la gestión de proyectos de investigación, la colaboración en línea y la difusión de resultados', '2.2.1'
  UNION ALL SELECT '2.2.1.6', 'Indicadores que permitan evaluar la eficiencia y eficacia de los recursos asignados a I+D+i.', '2.2.1'
  UNION ALL SELECT '2.2.1.7', 'Planes de inversión e inventarios de recursos materiales como equipos, laboratorios y recursos digitales para la I+D+i', '2.2.1'
  UNION ALL SELECT '2.2.2.1', 'Planes de formación, actualización y de desarrollo profesional de investigadores.', '2.2.2'
  UNION ALL SELECT '2.2.2.2', 'Documentos probatorios de ejecución de gestiones para estudios de postdoctorado para investigadores', '2.2.2'
  UNION ALL SELECT '2.2.2.3', 'Presupuestos y planes para su actualización periódica, mantenimiento y mejora continua.', '2.2.2'
  UNION ALL SELECT '2.2.2.4', 'Planes de inversión e informes de del mantenimiento y actualización de recursos destinados a la I+D+i', '2.2.2'
  UNION ALL SELECT '2.3.1.1', 'Plan de incentivos y reconocimiento para investigadores de la institución.', '2.3.1'
  UNION ALL SELECT '2.3.1.2', 'Planes y presupuestos de inversión en investigación, desarrollo, innovación y transferencia de conocimiento con mecanismos concretos de seguimiento y evaluación de resultados.', '2.3.1'
  UNION ALL SELECT '2.3.1.3', 'Informes de ejecución presupuestaria y presupuestos de inversión', '2.3.1'
  UNION ALL SELECT '2.3.1.4', 'Informes financieros en actividades de investigación, desarrollo e innovación por área de conocimiento, con evaluación de resultados, con clara indicación de inversiones realizadas en salarios, materiales, publicaciones, entre otros.', '2.3.1'
  UNION ALL SELECT '2.3.2.1', 'Documentos que detallen el financiamiento recibido tanto interno como externo para proyectos de investigación, desarrollo e innovación. Estos informes deben mostrar cómo el financiamiento ha sido atraído y gestionado, y cómo ha contribuido a diversificar los ingresos de la IES, incluyendo análisis de la distribución de los fondos.', '2.3.2'
  UNION ALL SELECT '2.3.2.2', 'Evidencia de ingresos generados por venta de servicios, aplicaciones por desarrollo productivo, incubadora y aceleradora de emprendimientos productivos y derechos de patentes.', '2.3.2'
  UNION ALL SELECT '2.4.1.1', 'Agenda de investigación que incluya las líneas de investigación apegadas a la oferta académica que ofrecen, y que estas investigaciones superen la cantidad mínima establecida en la LES y que se supere progresivamente en el tiempo.', '2.4.1'
  UNION ALL SELECT '2.4.1.2', 'Informes sobre investigaciones realizadas por área de conocimiento, personal y estudiantes participantes, recursos destinados, medios de divulgación utilizados, resultados obtenidos y satisfacción de los usuarios o destinatarios de las iniciativas concretas de investigación.', '2.4.1'
  UNION ALL SELECT '2.4.1.3', 'Artículos científicos publicados en revistas indexadas, capítulos de libros y otras publicaciones', '2.4.1'
  UNION ALL SELECT '2.4.1.4', 'Evidencia de la transferencia de conocimientos y tecnologías desarrollados en la IES al sector productivo.', '2.4.1'
  UNION ALL SELECT '2.4.1.5', 'Informes sobre devoluciones de resultados de investigación a actores clave y otros socios, incluyendo análisis de tendencia a partir de indicadores de I+D+i.', '2.4.1'
  UNION ALL SELECT '2.4.1.6', 'Informes sobre iniciativas y proyectos de investigación con otros socios nacionales e internacionales, contribuciones, recursos y resultados concretos.', '2.4.1'
  UNION ALL SELECT '2.4.1.7', 'Informes que evidencian el reconocimiento y notoriedad de los investigadores a partir de la citación en bases de datos internacionales.', '2.4.1'
  UNION ALL SELECT '2.4.2.1', 'Articulación de postgrado con líneas de I+D+i', '2.4.2'
  UNION ALL SELECT '2.4.2.2', 'Informes que evidencian la participación activa de los estudiantes en I+D+i y transferencia de conocimientos.', '2.4.2'
  UNION ALL SELECT '2.4.2.3', 'Informes sobre emprendimientos sociales y productivos en colaboración con socios nacionales e internacionales, incluyendo análisis de resultados.', '2.4.2'
  UNION ALL SELECT '2.4.2.4', 'Evidencia de la participación en redes de investigación, tanto nacionales como internacionales.', '2.4.2'
  UNION ALL SELECT '2.4.2.5', 'Planes e informes que demuestren cómo la investigación se relaciona con la docencia y la proyección social, incluyendo análisis de resultados.', '2.4.2'
  UNION ALL SELECT '2.4.2.6', 'Planes, proyectos e informes sobre la implementación de programas de aceleración e incubación de emprendimientos productivos y sociales.', '2.4.2'
  UNION ALL SELECT '2.4.2.7', 'Informes sobre patentes, diseños, registros editoriales y cualquier otro tipo de registro de propiedad intelectual', '2.4.2'
  UNION ALL SELECT '2.5.1.1', 'Publicaciones en revistas científicas indexadas.', '2.5.1'
  UNION ALL SELECT '2.5.1.2', 'Participación en eventos académicos.', '2.5.1'
  UNION ALL SELECT '2.5.1.3', 'Documentación de proyectos conjuntos y actividades realizadas con socios externos.', '2.5.1'
  UNION ALL SELECT '2.5.1.4', 'Informes de actividades y resultados obtenidos de estas colaboraciones.', '2.5.1'
  UNION ALL SELECT '2.5.1.5', 'Sello editorial o colaboraciones para publicaciones y divulgación de investigaciones', '2.5.1'
  UNION ALL SELECT '2.5.2.1', 'Informes de medición de impacto de las investigaciones.', '2.5.2'
  UNION ALL SELECT '2.5.2.2', 'Informes periódicos que evalúan la efectividad de las acciones de divulgación.', '2.5.2'
  UNION ALL SELECT '2.5.2.3', 'Análisis de resultados de las publicaciones y eventos en la comunidad científica y en la sociedad.', '2.5.2'
  UNION ALL SELECT '2.5.2.4', 'Retroalimentación de socios externos sobre la colaboración y transferencia de conocimiento.', '2.5.2'
  UNION ALL SELECT '2.5.2.5', 'Datos sobre el alcance y la visibilidad de las publicaciones, como citas en otras investigaciones y visitas a los artículos.', '2.5.2'
  UNION ALL SELECT '2.5.2.6', 'Resultados de revisiones internas o auditorías externas que analicen la eficacia de las estrategias de divulgación y transferencia.', '2.5.2'
  UNION ALL SELECT '2.5.2.7', 'Recomendaciones y mejoras sugeridas por las auditorías.', '2.5.2'
  UNION ALL SELECT '3.1.1.1', 'Manual de organización y funciones de la IES', '3.1.1'
  UNION ALL SELECT '3.1.1.2', 'Descriptores de puesto según funciones de los docentes', '3.1.1'
  UNION ALL SELECT '3.1.1.3', 'Procesos institucionales para la selección del personal docente', '3.1.1'
  UNION ALL SELECT '3.1.1.4', 'Documentos probatorios de procesos de selección de personal docente', '3.1.1'
  UNION ALL SELECT '3.1.1.5', 'Expedientes de docentes que contengan atestados de formación y evidencias complementarias', '3.1.1'
  UNION ALL SELECT '3.1.1.6', 'Registros de planillas', '3.1.1'
  UNION ALL SELECT '3.1.1.7', 'Informes institucionales de estadísticas de contratación y cumplimiento de requisitos mínimos de docentes por estudiante según LES', '3.1.1'
  UNION ALL SELECT '3.1.1.8', 'Estadísticas de planta docente por tipo de contratación', '3.1.1'
  UNION ALL SELECT '3.1.2.1', 'Programas de Capacitación Docente', '3.1.2'
  UNION ALL SELECT '3.1.2.2', 'Programación de ejecución de Programas de Capacitación Docente', '3.1.2'
  UNION ALL SELECT '3.1.2.3', 'Informes de asistencia y participación en capacitaciones', '3.1.2'
  UNION ALL SELECT '3.1.2.4', 'Resultados de evaluaciones de las capacitaciones por parte de los docentes', '3.1.2'
  UNION ALL SELECT '3.1.2.5', 'Actas de reuniones o comités para diagnósticos de necesidades de formación docente', '3.1.2'
  UNION ALL SELECT '3.1.2.6', 'Evaluaciones de calidad de las capacitaciones', '3.1.2'
  UNION ALL SELECT '3.2.1.1', 'Documentos oficiales del escalafón docente (sistema de incentivos y reconocimientos)', '3.2.1'
  UNION ALL SELECT '3.2.1.2', 'Políticas y procedimientos para la actualización del escalafón', '3.2.1'
  UNION ALL SELECT '3.2.1.3', 'Registros de revisiones y actualizaciones del escalafón docente', '3.2.1'
  UNION ALL SELECT '3.2.1.4', 'Documentación probatoria de incentivos y estímulos otorgados basados en el escalafón', '3.2.1'
  UNION ALL SELECT '3.2.1.5', 'Informes de la evaluación del desempeño docente que justifiquen la promoción en el escalafón', '3.2.1'
  UNION ALL SELECT '3.2.1.6', 'Análisis de satisfacción sobre la implementación del escalafón docente y promueve el desarrollo de la planta docente', '3.2.1'
  UNION ALL SELECT '3.2.2.1', 'Documentos oficiales del escalafón docente que refleje la diferenciación de incentivos según funciones realizadas', '3.2.2'
  UNION ALL SELECT '3.2.2.2', 'Estadísticas sobre jornadas de docentes según tipo de contratación', '3.2.2'
  UNION ALL SELECT '3.2.2.3', 'Informes de evaluación del desempeño docente según funciones de investigación, docentes o proyección social', '3.2.2'
  UNION ALL SELECT '3.3.1.1', 'Informes de docentes involucrados en proyectos de investigación y proyección social.', '3.3.1'
  UNION ALL SELECT '3.3.1.2', 'Informes de proyectos de investigación y vinculación con la comunidad universitaria vinculados con cátedras.', '3.3.1'
  UNION ALL SELECT '3.3.1.3', 'Resultados y publicaciones derivadas de investigaciones realizadas por docentes.', '3.3.1'
  UNION ALL SELECT '3.3.1.4', 'Documentación de la participación de docentes en programas de formación continua.', '3.3.1'
  UNION ALL SELECT '3.3.1.5', 'Informes de satisfacción a docentes sobre oportunidades de formación continua que ofrece la IES', '3.3.1'
  UNION ALL SELECT '3.3.1.6', 'Informes de satisfacción a actores involucrados sobre oportunidades de formación continua que ofrece la IES', '3.3.1'
  UNION ALL SELECT '3.3.2.1', 'Evidencias que destina presupuestos a formación continua para docentes e investigadores', '3.3.2'
  UNION ALL SELECT '3.3.2.2', 'Informes sobre ejecución presupuestaria', '3.3.2'
  UNION ALL SELECT '3.4.1.1', 'Informes de Observación de Clases', '3.4.1'
  UNION ALL SELECT '3.4.1.2', 'Planificaciones Docentes', '3.4.1'
  UNION ALL SELECT '3.4.1.3', 'Instrumentos de Evaluación', '3.4.1'
  UNION ALL SELECT '3.4.1.4', 'Reportes de evaluación es docentes', '3.4.1'
  UNION ALL SELECT '3.4.1.5', 'Informes de Cumplimiento Curricular generados por los coordinadores de carrera o departamentos académicos', '3.4.1'
  UNION ALL SELECT '3.4.1.6', 'Registros de capacitaciones y talleres realizados para docentes sobre la aplicación del modelo educativo en la práctica docente y la correcta ejecución del currículo', '3.4.1'
  UNION ALL SELECT '3.4.2.1', 'Planes de estudio autorizados según lo establece la DNES', '3.4.2'
  UNION ALL SELECT '3.4.2.2', 'Evidencia de mecanismos de participación de la comunidad educativa en las actualizaciones curriculares', '3.4.2'
  UNION ALL SELECT '3.4.2.3', 'Evidencia de la coherencia entre la currícula y el modelo educativo promovido por la IES', '3.4.2'
  UNION ALL SELECT '3.5.1.1', 'Registros y calendarios de evaluaciones docentes por ciclo académico', '3.5.1'
  UNION ALL SELECT '3.5.1.2', 'Instrumentos y metodologías utilizadas en las evaluaciones', '3.5.1'
  UNION ALL SELECT '3.5.1.3', 'Resultados de las evaluaciones docentes', '3.5.1'
  UNION ALL SELECT '3.5.1.4', 'Mecanismos de retroalimentación a los docentes', '3.5.1'
  UNION ALL SELECT '3.5.1.5', 'Informes sobre el uso de los resultados de evaluación para la mejora continua', '3.5.1'
  UNION ALL SELECT '3.5.2.1', 'Programas para acompañamiento de los docentes', '3.5.2'
  UNION ALL SELECT '3.5.2.2', 'Normas para sancionar incumplimiento de normas docentes', '3.5.2'
  UNION ALL SELECT '3.5.2.3', 'Informes periódicos de resultados de evaluación docente, divulgados oportunamente', '3.5.2'
  UNION ALL SELECT '3.6.1.1', 'Documentos que describen el modelo educativo institucional.', '3.6.1'
  UNION ALL SELECT '3.6.1.2', 'Planes de estudio que detallan la alineación con el modelo educativo.', '3.6.1'
  UNION ALL SELECT '3.6.1.3', 'Actas de reuniones del comité curricular que revisan la coherencia curricular con el modelo educativo.', '3.6.1'
  UNION ALL SELECT '3.6.1.4', 'Informes de evaluación interna que demuestran la implementación del modelo educativo en el currículo.', '3.6.1'
  UNION ALL SELECT '3.6.2.1', 'Documentos de revisión y actualización curricular', '3.6.2'
  UNION ALL SELECT '3.6.2.2', 'Informes de estudios de mercado y necesidades del entorno', '3.6.2'
  UNION ALL SELECT '3.6.2.3', 'Actas de reuniones con actores clave (sector productivo, graduados, etc.) sobre la actualización de la oferta académica', '3.6.2'
  UNION ALL SELECT '3.6.2.4', 'Planes de estudio actualizados', '3.6.2'
  UNION ALL SELECT '3.6.3.1', 'Actas de reuniones de comités curriculares que incluyen la participación de actores clave del diseño curricular', '3.6.3'
  UNION ALL SELECT '3.6.3.2', 'Encuestas o focus groups realizados a estudiantes y egresados sobre la pertinencia del currículo', '3.6.3'
  UNION ALL SELECT '3.6.3.3', 'Informes de propuestas de mejora curricular basadas en la retroalimentación de estudiantes y egresados.', '3.6.3'
  UNION ALL SELECT '3.6.3.4', 'Casos documentados de cambios curriculares implementados a partir de las sugerencias de actores de la comunidad educativa', '3.6.3'
  UNION ALL SELECT '4.1.1.1', 'Políticas y criterios de admisión para cada una de las áreas o unidades académicas de la IES que se actualizan periódicamente', '4.1.1'
  UNION ALL SELECT '4.1.1.2', 'Publicación oficial de guías y folletos informativos sobre requisitos de admisión', '4.1.1'
  UNION ALL SELECT '4.1.1.3', 'Página web institucional actualizada con información detallada y accesible sobre el proceso de admisión', '4.1.1'
  UNION ALL SELECT '4.1.1.4', 'Registros de consultas atendidas por el departamento de admisión, incluyendo preguntas frecuentes y respuestas dadas', '4.1.1'
  UNION ALL SELECT '4.1.1.5', 'Encuestas de percepción de aspirantes sobre la claridad y suficiencia de la información recibida', '4.1.1'
  UNION ALL SELECT '4.1.1.6', 'Informes de tiempo promedio de procesamiento de solicitudes de admisión', '4.1.1'
  UNION ALL SELECT '4.1.1.7', 'Evaluaciones internas del proceso de admisión para identificar áreas de mejora', '4.1.1'
  UNION ALL SELECT '4.1.1.8', 'Documentos que demuestren que se divulga la información de los servicios ofrecidos por la IES', '4.1.1'
  UNION ALL SELECT '4.1.1.9', 'Documentos que evidencia los mecanismos de conservación de expedientes estudiantiles y las medidas de seguridad para proteger la información sensible', '4.1.1'
  UNION ALL SELECT '4.1.2.1', 'Informes de tasas de retención y deserción estudiantil', '4.1.2'
  UNION ALL SELECT '4.1.2.2', 'Programas de seguimiento académico (informes y registros de actividades de tutorías y asesorías académicas dirigidas a estudiantes en riesgo)', '4.1.2'
  UNION ALL SELECT '4.1.2.3', 'Encuestas de satisfacción de estudiantes', '4.1.2'
  UNION ALL SELECT '4.1.2.4', 'Informes de causas de deserción identificadas mediante encuestas y entrevistas con estudiantes que abandonan la carrera', '4.1.2'
  UNION ALL SELECT '4.1.2.5', 'Evaluaciones de programas de apoyo académico y psicosocial sobre la retención estudiantil', '4.1.2'
  UNION ALL SELECT '4.1.2.6', 'Registros de intervenciones realizadas para estudiantes en riesgo de deserción', '4.1.2'
  UNION ALL SELECT '4.1.3.1', 'Estadísticas de graduación', '4.1.3'
  UNION ALL SELECT '4.1.3.2', 'Informes de seguimiento a estudiantes en los últimos años de su carrera para identificar barreras al egreso', '4.1.3'
  UNION ALL SELECT '4.1.3.3', 'Evaluaciones de las políticas de apoyo académico en la tasa de graduación', '4.1.3'
  UNION ALL SELECT '4.1.3.4', 'Registros de tiempos de culminación de tesis o proyectos finales', '4.1.3'
  UNION ALL SELECT '4.1.3.5', 'Políticas para la inserción laboral de egresados', '4.1.3'
  UNION ALL SELECT '4.1.3.6', 'Registros de seguimiento a egresados en sus experiencias laborales', '4.1.3'
  UNION ALL SELECT '4.1.3.7', 'Encuestas a egresados sobre percepción de la formación recibida', '4.1.3'
  UNION ALL SELECT '4.1.4.1', 'Informe sobre tiempo s de graduación de los estudiantes por carrera', '4.1.4'
  UNION ALL SELECT '4.1.4.2', 'Documentación de políticas y procedimientos claros para el proceso de graduación', '4.1.4'
  UNION ALL SELECT '4.1.4.3', 'Encuestas de satisfacción de los graduados sobre el proceso de graduación', '4.1.4'
  UNION ALL SELECT '4.1.4.4', 'Registros de incidencias reportadas en el proceso de graduación y sus medidas correctivas implementadas', '4.1.4'
  UNION ALL SELECT '4.2.1.1', 'Programas de estudio que incluyan componentes académicos y actividades extracurriculares que fomenten el desarrollo integral', '4.2.1'
  UNION ALL SELECT '4.2.1.2', 'Documentos que demuestren que las mallas curriculares de todas las carreras impartidas aseguran de forma transversal ejes de formación como: valores, ética, responsabilidad ciudadana y otros valores presentes en la filosofía educativa.', '4.2.1'
  UNION ALL SELECT '4.2.1.3', 'Programas de desarrollo personal y profesional', '4.2.1'
  UNION ALL SELECT '4.2.1.4', 'Informes de evaluación de programas', '4.2.1'
  UNION ALL SELECT '4.2.1.5', 'Informes sobre la percepción de estudiantes y graduados de la formación integral recibida.', '4.2.1'
  UNION ALL SELECT '4.2.2.1', 'Catálogo institucional', '4.2.2'
  UNION ALL SELECT '4.2.2.2', 'Evidencias que demuestren la existencia de instancias de bienestar estudiantil (culturales, recreativos, salud, psicosociales, socioeconómicos, etc.)', '4.2.2'
  UNION ALL SELECT '4.2.2.3', 'Programa de servicios de bienestar estudiantil', '4.2.2'
  UNION ALL SELECT '4.2.2.4', 'Registros de uso de servicios complementarios que se ofrecen desde instancias de bienestar estudiantil', '4.2.2'
  UNION ALL SELECT '4.3.1.1', 'Normas que regulen la participación estudiantil en las diferentes instancias institucionales.', '4.3.1'
  UNION ALL SELECT '4.3.1.2', 'Listas de representación estudiantil en consejos y comités', '4.3.1'
  UNION ALL SELECT '4.3.1.3', 'Actas de reuniones de órganos de gobierno que muestren la participación y aportaciones de los representantes estudiantiles', '4.3.1'
  UNION ALL SELECT '4.3.1.4', 'Encuestas de percepción de los estudiantes sobre la utilidad y conveniencia de los espacios de participación de los que disponen', '4.3.1'
  UNION ALL SELECT '4.3.1.5', 'Informes de iniciativas propuestas por estudiantes y su implementación', '4.3.1'
  UNION ALL SELECT '4.3.1.6', 'Documentación de las políticas institucionales que formalizan la participación estudiantil en la toma de decisiones', '4.3.1'
  UNION ALL SELECT '4.3.2.1', 'Registros de participación estudiantil en programas de investigación, proyección social y extensión universitaria (ej. Grupos deportivos, culturales, etc.).', '4.3.2'
  UNION ALL SELECT '4.3.2.2', 'Informes de participación y contribución de estudiantes en las actividades de proyección social liderados por estudiantes', '4.3.2'
  UNION ALL SELECT '4.3.2.3', 'Informes con testimonios de los beneficiarios y destinatarios de los programas de proyección social y de los estudiantes que lideran los procesos', '4.3.2'
  UNION ALL SELECT '4.3.2.4', 'Convenios con organizaciones externas que demuestren vinculación de la IES y sus estudiantes con otras actividades comunales o sociales', '4.3.2'
  UNION ALL SELECT '4.3.3.1', 'Política de participación estudiantil en la revisión de programas académicos', '4.3.3'
  UNION ALL SELECT '4.3.3.2', 'Reglamentos y normas sobre la revisión y actualización de programas académicos', '4.3.3'
  UNION ALL SELECT '4.3.3.3', 'Actas donde se evidencia la participación de estudiantes sobre los programas académicos', '4.3.3'
  UNION ALL SELECT '4.3.3.4', 'Informes de resultados de encuestas y talleres de retroalimentación con estudiantes', '4.3.3'
  UNION ALL SELECT '4.3.3.5', 'Documentación de cambios implementados en los programas académicos en respuesta a las evaluaciones estudiantiles', '4.3.3'
  UNION ALL SELECT '4.4.1.1', 'Bases de datos de graduados actualizadas', '4.4.1'
  UNION ALL SELECT '4.4.1.2', 'Resultados de encuestas que evalúan la inserción laboral, satisfacción con la formación recibida y sugerencias para la mejora de los programas', '4.4.1'
  UNION ALL SELECT '4.4.1.3', 'Documentación de la existencia y actividad de asociaciones de exalumnos y su vinculación con la IES', '4.4.1'
  UNION ALL SELECT '4.4.1.4', 'Documentos que recojan y analicen la retroalimentación de los graduados para la mejora de los programas académicos', '4.4.1'
  UNION ALL SELECT '4.4.1.5', 'Registros de participación de graduados en actividades académicas, eventos institucionales y proyectos de mejora continua', '4.4.1'
  UNION ALL SELECT '4.4.2.1', 'Documentos que demuestran como la IES divulga los beneficios de los títulos ofertados', '4.4.2'
  UNION ALL SELECT '4.4.2.2', 'Encuestas de satisfacción realizadas a los egresados sobre su experiencia académica y su preparación para el mundo laboral', '4.4.2'
  UNION ALL SELECT '4.4.2.3', 'Informes de retroalimentación de empleadores sobre el desempeño de los graduados en el mercado laboral', '4.4.2'
  UNION ALL SELECT '4.4.2.4', 'Estudios de seguimiento a egresados para evaluar su inserción laboral y su adecuación profesional', '4.4.2'
  UNION ALL SELECT '4.4.2.5', 'Encuestas de autoevaluación de competencias adquiridas durante su formación académica', '4.4.2'
  UNION ALL SELECT '4.5.1.1', 'Estadísticas de admisión y matrícula desglosadas por grupo de estudiantes en condición de vulnerabilidad', '4.5.1'
  UNION ALL SELECT '4.5.1.2', 'Informes anuales de diversidad que muestren la evolución de la matrícula de estudiantes de estos grupos.', '4.5.1'
  UNION ALL SELECT '4.5.1.3', 'Políticas de admisión inclusiva que describan criterios y acciones para facilitar el acceso de estudiantes de grupos en condición de vulnerabilidad', '4.5.1'
  UNION ALL SELECT '4.5.1.4', 'Registros de becas y apoyos financieros otorgados a estudiantes de bajos ingresos o pertenecientes a grupos en condición de vulnerabilidad', '4.5.1'
  UNION ALL SELECT '4.5.2.1', 'Calendario de eventos y programas de formación en diversidad e inclusión realizados por la IES.', '4.5.2'
  UNION ALL SELECT '4.5.2.2', 'Materiales educativos (guías, manuales, presentaciones) utilizados en los talleres y cursos sobre diversidad e inclusión.', '4.5.2'
  UNION ALL SELECT '4.5.2.3', 'Encuestas de satisfacción y evaluación de participantes en los programas de formación.', '4.5.2'
  UNION ALL SELECT '4.5.2.4', 'Informes de las actividades de sensibilización en la comunidad estudiantil y docente.', '4.5.2'
  UNION ALL SELECT '4.5.2.5', 'Registros de asistencia y participación en los programas y talleres de sensibilización.', '4.5.2'
  UNION ALL SELECT '4.5.3.1', 'Políticas institucionales que describen los servicios de apoyo disponibles para estudiantes que pertenecen a grupos en condición de vulnerabilidad', '4.5.3'
  UNION ALL SELECT '4.5.3.2', 'Registros de uso de servicios de apoyo (asesoría, tutoría, servicios psicosociales) por parte de estos estudiantes', '4.5.3'
  UNION ALL SELECT '4.5.3.3', 'Encuestas de satisfacción y testimonios de estudiantes sobre la efectividad y accesibilidad de los servicios de apoyo', '4.5.3'
  UNION ALL SELECT '4.5.3.4', 'Informes sobre el rendimiento académico y la retención de estudiantes que han utilizado estos servicios', '4.5.3'
  UNION ALL SELECT '4.5.3.5', 'Evidencia de adaptaciones realizadas en infraestructura o materiales para estudiantes con discapacidad', '4.5.3'
  UNION ALL SELECT '4.6.1.1', 'Programas de internacionalización y movilidad de los miembros de la comunidad estudiantil', '4.6.1'
  UNION ALL SELECT '4.6.1.2', 'Acuerdos y convenios de colaboración internacional con otras instituciones que soportan los programas de movilidad', '4.6.1'
  UNION ALL SELECT '4.6.1.3', 'Planes y presupuestos para financiar los programas de internacionalización', '4.6.1'
  UNION ALL SELECT '4.6.1.4', 'Estadísticas de participación en programas de movilidad internacional desglosadas por año, facultad y tipo de programa', '4.6.1'
  UNION ALL SELECT '4.6.1.5', 'Informes que muestren los beneficios académicos, profesionales y personales obtenidos por los estudiantes que participaron en estos programas.', '4.6.1'
  UNION ALL SELECT '4.6.1.6', 'Documentación de procesos para la selección, preparación y seguimiento de estudiantes en programas de movilidad', '4.6.1'
  UNION ALL SELECT '4.6.2.1', 'Planes de internacionalización que consideren el componente de la educación virtual, la movilidad, la investigación y la proyección social.', '4.6.2'
  UNION ALL SELECT '4.6.2.2', 'Planes de estudio que incluyen asignaturas con componentes de internacionalización (ej. como estudios regionales, cursos impartidos en idiomas extranjeros, y analisis de casos globales)', '4.6.2'
  UNION ALL SELECT '4.6.2.3', 'Registros de actividades académicas internacionales, como conferencias, seminarios y talleres con ponentes extranjeros o tematicas internacionales)', '4.6.2'
  UNION ALL SELECT '4.6.2.4', 'Informes de revisión curricular que documentan cómo se ha integrado la internacionalización en los programas academicos', '4.6.2'
  UNION ALL SELECT '4.6.2.5', 'Convenios con universidades e institucionales internacionales para el reconocimiento de estudios, la convalidacion de titulos y el desarrollo de programas academicos conjuntos', '4.6.2'
  UNION ALL SELECT '5.1.1.1', 'Inventario de activos físicos de la IES y su correlación con las carreras...', '5.1.1'
  UNION ALL SELECT '5.1.1.2', 'Políticas institucionales que documenten el compromiso con la accesibilidad y seguridad en la construccion y mantenimiento de los edificios e instalaciones', '5.1.1'
  UNION ALL SELECT '5.1.1.3', 'Registros de formación del personal en temas de accesibilidad y seguridad, que garanticen la correcta aplicacion de los protocolos', '5.1.1'
  UNION ALL SELECT '5.1.1.4', 'Mapas de accesibilidad del campus que identifiquen rutas accesibles y la ubicacion de instalaciones adaptadas', '5.1.1'
  UNION ALL SELECT '5.1.1.5', 'Planos de diseño arquitectónico que muestren la inclusión de elementos de accesibilidad, como rampas, ascensores accesibles, baños y señalizacion adaptados', '5.1.1'
  UNION ALL SELECT '5.1.1.6', 'Informes de inspección de seguridad realizados por organismos competentes que confirmen que los edificios e instalaciones cumplen con las normativas de seguridad y accesibilidad', '5.1.1'
  UNION ALL SELECT '5.1.1.7', 'Registros que contengan planes, presupuestos e informes de ejecución sobre mantenimientos de infraestructura, que demuestren revisiones y reparaciones periodicas para asegurar la seguridad y accesibilidad', '5.1.1'
  UNION ALL SELECT '5.1.2.1', 'Documentos que demuestren la existencia de recursos básicos en la institución: agua, energia electrica, iluminacion adecuada en todos los espacios, ventilacion, internet y otros servicios que sean necesarios para el correcto funcionamiento', '5.1.2'
  UNION ALL SELECT '5.1.2.2', 'Los usuarios (estudiantes, docentes, personal) están satisfechos con la calidad y cantidad de las instalaciones disponibles', '5.1.2'
  UNION ALL SELECT '5.1.2.3', 'La institución registra el uso de sus instalaciones para fines académicos, de investigacion, recreacion, entre otras', '5.1.2'
  UNION ALL SELECT '5.1.2.4', 'Planes, presupuestos e informes de ejecución de corto, mediano y largo plazo para la actualizacion, modernizacion y mantenimiento de todas las instalaciones, su ampliacion y adecuacion a nuevas necesidades segun crecimiento de matricula y otras variables', '5.1.2'
  UNION ALL SELECT '5.1.2.5', 'Pólizas de seguros de accidentes y de vida para personal administrativo, docente y estudiantes', '5.1.2'
  UNION ALL SELECT '5.1.2.6', 'Pólizas de seguros sobre la infraestructura, equipamiento y otros recursos de la IES necesarios para su proyecto educativo', '5.1.2'
  UNION ALL SELECT '5.1.2.7', 'La institución implementa y mantiene programas de seguridad ocupacional que garantizan un entorno de trabajo seguro y saludable para todos sus empleados, evalua periodicamente los riesgos y realiza las mejoras necesarias (Esto incluye: politicas y procedimientos, evaluaciones de riesgo, capacitaciones, equipos y materiales, informes de medidas correctivas e informes de capacitacion de la comunidad en estos programas)', '5.1.2'
  UNION ALL SELECT '5.1.2.8', 'Existencia de planes de manejo de desastres naturales, y todo lo relacionado a esta gestión.', '5.1.2'
  UNION ALL SELECT '5.1.3.1', 'Planes e informes de inversión en servicios educativos como adquisiciones de bibliografía, recursos tecnologicos, materiales, equipos y herramientas de laboratorio', '5.1.3'
  UNION ALL SELECT '5.1.3.2', 'Inventario de servicios culturales, recreativos, deportivos y de atención psicosocial de la comunidad universitaria e informes de satisfaccion de los usuarios', '5.1.3'
  UNION ALL SELECT '5.1.3.3', 'Informes con las ratios de equipos y otros recursos por estudiantes, profesores e investigadores.', '5.1.3'
  UNION ALL SELECT '5.1.3.4', 'Informes de satisfacción de la comunidad universitaria con los servicios, materiales, recursos y equipos disponibles', '5.1.3'
  UNION ALL SELECT '5.2.1.1', 'Políticas institucionales de sostenibilidad ambiental', '5.2.1'
  UNION ALL SELECT '5.2.1.2', 'Informes de auditorías ambientales que muestren el compromiso con el medio ambiente', '5.2.1'
  UNION ALL SELECT '5.2.1.3', 'Registros de gestión de residuos y programas de reducción de desechos', '5.2.1'
  UNION ALL SELECT '5.2.1.4', 'Programas de sensibilización y formación en sostenibilidad para la comunidad universitaria', '5.2.1'
  UNION ALL SELECT '5.2.1.5', 'Documentación sobre el uso de energías renovables', '5.2.1'
  UNION ALL SELECT '5.2.1.6', 'Planes e informes de iniciativas de manejo y mitigación de riesgos de desastres naturales', '5.2.1'
  UNION ALL SELECT '5.2.2.1', 'Registros de tecnologías asistivas implementadas (software de lectura de pantalla, dispositivos de asistencia auditiva, etc.)', '5.2.2'
  UNION ALL SELECT '5.2.2.2', 'Encuestas de satisfacción de accesibilidad realizadas entre los estudiantes y el personal', '5.2.2'
  UNION ALL SELECT '5.2.2.3', 'Programas de formación y sensibilización sobre accesibilidad para toda la comunidad universitaria', '5.2.2'
  UNION ALL SELECT '5.2.2.4', 'Documentación de la política de igualdad de oportunidades de la institución', '5.2.2'
  UNION ALL SELECT '5.2.3.1', 'Informes de inversión en tecnología y modernización de infraestructuras digitales', '5.2.3'
  UNION ALL SELECT '5.2.3.2', 'Registros de plataformas de aprendizaje en línea y recursos digitales accesibles', '5.2.3'
  UNION ALL SELECT '5.2.3.3', 'Documentación sobre la digitalización de bibliotecas y acceso a bases de datos electrónicas', '5.2.3'
  UNION ALL SELECT '5.2.3.4', 'Informes de actualización de hardware y software en instalaciones académicas y administrativas', '5.2.3'
  UNION ALL SELECT '5.2.3.5', 'Encuestas de satisfacción sobre el uso de tecnologías digitales entre estudiantes, docentes y personal administrativo', '5.2.3'
  UNION ALL SELECT '5.2.3.6', 'Reportes de implementación de sistemas de gestión académica y administrativa digital', '5.2.3'
  UNION ALL SELECT '5.2.3.7', 'Planes de inversión en equipos de laboratorios adecuados para cada carrera que se imparte en la IES', '5.2.3'
  UNION ALL SELECT '6.1.1.1', 'Política Institucional de Internacionalización', '6.1.1'
  UNION ALL SELECT '6.1.1.2', 'Planes de trabajo específicos con mecanismos de evaluación, seguimiento y actualización de la política de internacionalización', '6.1.1'
  UNION ALL SELECT '6.1.1.3', 'Informes sobre recursos financieros, humanos y materiales asignados a estas actividades de internacionalización.', '6.1.1'
  UNION ALL SELECT '6.1.1.4', 'Listado de convenios, acuerdos y cartas de entendimiento vigentes con socios estratégicos nacionales e internacionales.', '6.1.1'
  UNION ALL SELECT '6.1.1.5', 'Documentación que incluye objetivos claros, mecanismos de evaluación periódica y procedimientos para la actualización de estos acuerdos', '6.1.1'
  UNION ALL SELECT '6.1.2.1', 'Informes de seguimiento a Proyectos de Internacionalización:', '6.1.2'
  UNION ALL SELECT '6.1.2.2', 'Documentación de iniciativas de investigación y pasantías profesionales con análisis de resultados', '6.1.2'
  UNION ALL SELECT '6.1.2.3', 'Estadísticas sobre movilidad horizontal y vertical de docentes, estudiantes, investigadores y otros funcionarios', '6.1.2'
  UNION ALL SELECT '6.1.2.4', 'Registros de participación en redes, congresos, investigaciones conjuntas y otros proyectos de vinculación', '6.1.2'
  UNION ALL SELECT '6.1.2.5', 'Informes que documentan acciones concretas derivadas de convenios y acuerdos, destacando resultados tangibles como patentes, diseños industriales, innovaciones científicas o tecnológicas, y participación en redes académicas.', '6.1.2'
  UNION ALL SELECT '6.1.2.6', 'Evidencias de pasantías o prácticas profesionales realizadas a través de estos acuerdos', '6.1.2'
  UNION ALL SELECT '6.2.1.1', 'Reglamentos y normas para el reconocimiento, equiparación o convalidación de estudios', '6.2.1'
  UNION ALL SELECT '6.2.1.2', 'Informes sobre Proyectos de intercambio virtual o presencial con mecanismos de evaluación de resultados.', '6.2.1'
  UNION ALL SELECT '6.2.1.3', 'Informes de Proyectos de movilidad académica de investigadores, docentes y estudiantes.', '6.2.1'
  UNION ALL SELECT '6.2.1.4', 'Programas y planes de titulaciones conjuntas, calendarios de actividades y los informes de ejecución respectivos.', '6.2.1'
  UNION ALL SELECT '6.2.1.5', 'Estadísticas periódicas de equiparación y reconocimiento de estudios.', '6.2.1'
  UNION ALL SELECT '6.2.2.1', 'Informes sobre proyectos de proyección o investigación con socios nacionales e internacionales con evaluación de resultados, presupuestos invertidos y logros alcanzados', '6.2.2'
  UNION ALL SELECT '6.2.2.2', 'Informes sobre publicaciones y otros medios de transmisión de conocimiento en iniciativas conjuntas con socios nacionales e internacionales', '6.2.2'
  UNION ALL SELECT '6.2.2.3', 'Informes sobre intercambio de recursos tecnológicos, bibliográficos, laboratorios, equipos y otros activos tangibles o intangibles con instituciones nacionales e internacionales en el marco de acuerdos de cooperación', '6.2.2'
  UNION ALL SELECT '6.2.2.4', 'Informes sobre rendición de cuentas sobre ejecución de proyectos', '6.2.2'
  UNION ALL SELECT '7.1.1.1', 'Políticas y planes de proyección social de la IES', '7.1.1'
  UNION ALL SELECT '7.1.1.2', 'Informes sobre rendición de cuenta sobre proyectos de proyección social', '7.1.1'
  UNION ALL SELECT '7.1.1.3', 'Evidencias de convenios nacionales o internacionales para solventar problemáticas sociales', '7.1.1'
  UNION ALL SELECT '7.1.1.4', 'Registros de participación de estudiantes, docentes e investigadores en actividades de proyección social', '7.1.1'
  UNION ALL SELECT '7.1.1.5', 'Encuestas de satisfacción a poblaciones beneficiarias de los proyectos de proyección social.', '7.1.1'
  UNION ALL SELECT '7.1.1.6', 'Presupuestos destinados a la proyección social', '7.1.1'
  UNION ALL SELECT '7.1.1.7', 'Evidencias de la evaluación continua de los proyectos de proyección social para garantizar la mejora continua.', '7.1.1'
  UNION ALL SELECT '7.1.1.8', 'Inventario de mecanismos de comunicación y diálogo entre las autoridades y la comunidad educativa', '7.1.1'
  UNION ALL SELECT '7.1.1.9', 'Muestras de los reportes, eventos y otras actividades de divulgación de las actividades de la IES con sus comunidades académicas y con la sociedad y evaluaciones de su cobertura', '7.1.1'
  UNION ALL SELECT '7.1.1.10', 'Evidencia de los mecanismos implementados para el monitoreo y la evaluación de la incidencia de las acciones realizadas en el marco de la proyección social', '7.1.1'
  UNION ALL SELECT '7.1.2.1', 'Documentación que muestre cómo los planes de estudio incluyen actividades y prácticas que requieren la participación en proyectos de proyección social', '7.1.2'
  UNION ALL SELECT '7.1.2.2', 'Agenda de proyección social articulada con la docencia e investigación, y que incluya al menos objetivos y metas, programas y proyectos, convenios, actividades de extensión, mecanismos e indicadores de medición y seguimiento, mecanismos de difusión y comunicación, financiamiento y recursos.', '7.1.2'
  UNION ALL SELECT '7.2.1.1', 'Páginas web institucionales actualizadas con toda la información institucional pertinente', '7.2.1'
  UNION ALL SELECT '7.2.1.2', 'Planes de medios físicos y digitales con identificación de audiencias internas y externas, temáticas relevantes, recursos multimedia a utilizar en las relaciones públicas y la comunicación institucional', '7.2.1'
  UNION ALL SELECT '7.2.1.3', 'Recursos como redes sociales, boletines y otros medios físicos o digitales de comunicación con los auditorios internos y externos de la IES', '7.2.1'
  UNION ALL SELECT '7.2.1.4', 'Informes de cobertura de las noticias y las actualizaciones en medios electrónicos de la actividad institucional', '7.2.1'
  UNION ALL SELECT '7.2.1.5', 'Informes de satisfacción de usuarios con los medios y servicios de comunicación de la IES sobre su actividad institucional', '7.2.1'
  UNION ALL SELECT '7.2.1.6', 'Presupuestos institucionales para la divulgación de la IES de su quehacer institucional', '7.2.1'
  UNION ALL SELECT '7.2.2.1', 'Política de proyección social que contenga actividades, objetivos, recursos y mecanismos de evaluación periódica', '7.2.2'
  UNION ALL SELECT '7.2.2.2', 'Informes de rendición de cuentas y transferencia de conocimiento, a diferentes aliados estratégicos', '7.2.2'
  UNION ALL SELECT '7.2.2.3', 'Documentos de trabajo con actores locales y regionales para el cumplimiento de sus objetivos de proyección social.', '7.2.2'
  UNION ALL SELECT '7.2.2.4', 'Planes de vinculación en las discusiones de actualidad nacional y evaluaciones de su aplicación.', '7.2.2'
  UNION ALL SELECT '7.2.2.5', 'Informes de participación en foros de opinión e iniciativas públicas y privadas de actualidad nacional', '7.2.2'
  UNION ALL SELECT '7.2.2.6', 'Informes sobre relaciones de trabajo con instituciones públicas, ONG y organismos internacionales como municipios, sistema de salud, educación media, seguridad, judiciales, ambiente, entre otros.', '7.2.2'
  UNION ALL SELECT '7.2.2.7', 'Ejemplos de publicaciones en rotativos locales o nacionales con contribuciones de opinión en temas de actualidad nacional', '7.2.2'
  UNION ALL SELECT '7.3.1.1', 'Políticas institucionales sobre proyección social y vinculación con la sociedad.', '7.3.1'
  UNION ALL SELECT '7.3.1.2', 'Planes y presupuestos de inversión en actividades y proyectos de proyección social.', '7.3.1'
  UNION ALL SELECT '7.3.1.3', 'Informes de participación de la comunidad académica en proyectos y programas de responsabilidad social y proyección con la comunidad y los socios de la IES.', '7.3.1'
  UNION ALL SELECT '7.3.2.1', 'Registro detallado de los proyectos sociales en los que participan estudiantes, docentes y personal administrativo, especificando los objetivos, el alcance, los beneficiarios y los resultados obtenidos.', '7.3.2'
  UNION ALL SELECT '7.3.2.2', 'Listas de asistencia o participación de docentes y estudiantes en actividades de los proyectos sociales, incluyendo roles y responsabilidades asignadas.', '7.3.2'
  UNION ALL SELECT '7.3.2.3', 'Certificados o constancias de participación otorgadas a miembros de la comunidad académica por su contribución en los proyectos.', '7.3.2'
  UNION ALL SELECT '7.3.2.4', 'Resultados de encuestas de satisfacción aplicadas a beneficiarios, participantes y miembros de la comunidad académica que midan la percepción sobre la efectividad y relevancia de los proyectos sociales.', '7.3.2'
  UNION ALL SELECT '7.3.2.5', 'Documentación de convenios y alianzas estratégicas con organizaciones comunitarias, ONGs, gobiernos locales o empresas para el desarrollo de proyectos sociales con la participación de la comunidad académica.', '7.3.2'
) AS x, sgc_indicadores AS i
WHERE i.codigo = x.padre
ON DUPLICATE KEY UPDATE indicador_id = i.id, nombre_evidencia = x.nombre;


-- 21. Plan Estratégico Institucional 2026-2030 ─────────────
-- Catálogo (líneas, acciones y actividades con indicador) y vínculo
-- de cada proyecto con las actividades a las que responde.

-- Datos generales del plan (una sola fila). La misión y la visión se
-- escriben desde Plan estratégico → Catálogo.
CREATE TABLE pei_plan (
  id          INT PRIMARY KEY,
  nombre      VARCHAR(255) NOT NULL,
  anio_inicio SMALLINT     NOT NULL,
  anio_fin    SMALLINT     NOT NULL,
  mision      TEXT         DEFAULT NULL,
  vision      TEXT         DEFAULT NULL,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Línea estratégica (cada una con su objetivo estratégico)
CREATE TABLE pei_lineas (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  numero      INT          NOT NULL,
  nombre      VARCHAR(255) NOT NULL,
  objetivo    TEXT         DEFAULT NULL,
  responsable VARCHAR(255) DEFAULT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pei_linea_numero (numero)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Acción estratégica (numeración corrida en todo el plan)
CREATE TABLE pei_acciones (
  id         INT PRIMARY KEY AUTO_INCREMENT,
  linea_id   INT          NOT NULL,
  numero     INT          NOT NULL,
  nombre     VARCHAR(500) NOT NULL,
  recursos   TEXT         DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pei_accion_numero (numero),
  CONSTRAINT fk_pei_accion_linea FOREIGN KEY (linea_id) REFERENCES pei_lineas(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Actividad estratégica: es la que tiene indicador y fuente de verificación
CREATE TABLE pei_actividades (
  id                  INT PRIMARY KEY AUTO_INCREMENT,
  accion_id           INT          NOT NULL,
  numero              INT          NOT NULL,
  nombre              VARCHAR(500) NOT NULL,
  periodo_inicio      SMALLINT     DEFAULT NULL,
  periodo_fin         SMALLINT     DEFAULT NULL,
  indicador           VARCHAR(500) DEFAULT NULL,
  fuente_verificacion VARCHAR(500) DEFAULT NULL,
  created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pei_actividad_numero (numero),
  CONSTRAINT fk_pei_actividad_accion FOREIGN KEY (accion_id) REFERENCES pei_acciones(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Actividades del plan a las que responde cada proyecto y su control:
-- cumplida o no, con su evidencia (un enlace o una tarea del proyecto
-- que tiene los archivos)
CREATE TABLE project_pei (
  id                INT PRIMARY KEY AUTO_INCREMENT,
  project_id        INT           NOT NULL,
  actividad_id      INT           NOT NULL,
  cumplido          TINYINT(1)    NOT NULL DEFAULT 0,
  cumplido_at       DATETIME      DEFAULT NULL,
  cumplido_por      INT           DEFAULT NULL,
  evidencia_url     VARCHAR(1000) DEFAULT NULL,
  evidencia_task_id INT           DEFAULT NULL,
  nota              VARCHAR(1000) DEFAULT NULL,
  created_by        INT           DEFAULT NULL,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_project_pei (project_id, actividad_id),
  CONSTRAINT fk_project_pei_project   FOREIGN KEY (project_id)        REFERENCES projects(id)        ON DELETE CASCADE,
  CONSTRAINT fk_project_pei_actividad FOREIGN KEY (actividad_id)      REFERENCES pei_actividades(id) ON DELETE RESTRICT,
  CONSTRAINT fk_project_pei_task      FOREIGN KEY (evidencia_task_id) REFERENCES tasks(id)           ON DELETE SET NULL,
  CONSTRAINT fk_project_pei_cumplido  FOREIGN KEY (cumplido_por)      REFERENCES users(id)           ON DELETE SET NULL,
  CONSTRAINT fk_project_pei_creador   FOREIGN KEY (created_by)        REFERENCES users(id)           ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO pei_plan (id, nombre, anio_inicio, anio_fin)
VALUES (1, 'Plan Estratégico Institucional', 2026, 2030);

INSERT IGNORE INTO pei_lineas (numero, nombre, objetivo, responsable) VALUES
  (1, 'Mejora continua de la docencia', 'Promover la excelencia académica mediante la implementación de estrategias de mejora continua que fortalezcan las competencias docentes, optimicen los procesos educativos y garanticen una educación de calidad adaptada a las necesidades de los estudiantes, a la situación socioeconómica de la sociedad y a los avances tecnológicos.', 'Decanos de las Facultades'),
  (2, 'Incremento de la capacidad de investigación', 'Fortalecer la capacidad de investigación mediante el desarrollo de infraestructura, la formación de talentos humanos calificados, la promoción de colaboraciones interdisciplinarias y la obtención de financiamiento para generar conocimiento innovador y relevante para la sociedad.', 'Dirección de Investigación'),
  (3, 'Desarrollo de una vinculación pertinente', 'Fomentar la vinculación efectiva y sostenible con los sectores productivo, social y gubernamental, mediante la implementación de proyectos, programas y alianzas estratégicas que respondan a las necesidades del entorno y contribuyan al desarrollo integral de la zona de influencia.', 'Dirección de Proyección Social'),
  (4, 'Gestionar permanente la calidad', 'Consolidar un sistema integral de gestión de calidad que garantice la mejora continua en los procesos institucionales, promoviendo la excelencia, la transparencia, la sostenibilidad financiera y el cumplimiento de estándares nacionales e internacionales.', 'Dirección de Gestión de la Calidad'),
  (5, 'Incremento de la internacionalización institucional', 'Fortalecer la internacionalización de la institución mediante la promoción de alianzas estratégicas, la movilidad académica, la participación en redes internacionales y la incorporación de estándares globales en los procesos educativos, de investigación y vinculación.', 'Dirección de Gestión de la Calidad');

INSERT IGNORE INTO pei_acciones (linea_id, numero, nombre, recursos)
SELECT l.id, x.numero, x.nombre, x.recursos FROM (
  SELECT 1 AS numero, 'Mejorar de forma permanente las competencias de los docentes' AS nombre, 'Tecnológicos, espacio físico, disponibilidad de tiempo, financieros (programados en POA y gestión de becas)' AS recursos, 1 AS linea
  UNION ALL SELECT 2, 'Optimizar el desarrollo del proceso educativo', 'Tecnológicos, espacio físico, disponibilidad de tiempo, financieros (programados en POA y gestión de becas internas y externas)', 1
  UNION ALL SELECT 3, 'Fomentar continuamente una educación de calidad', 'Tecnológicos, espacio físico, disponibilidad de tiempo, financieros (programados en POA), transporte (vehículo), vuelos, viáticos (nacionales e internacionales)', 1
  UNION ALL SELECT 4, 'Adaptar los programas a la sociedad y a los avances tecnológicos', 'Tecnológicos, espacio físico, disponibilidad de tiempo, financieros (programados en POA), transporte (vehículo), viáticos', 1
  UNION ALL SELECT 5, 'Ampliar la oferta de posgrados, diplomados, talleres y cursos', 'Tecnológicos, espacio físico, disponibilidad de tiempo, financieros (programados en POA), transporte (vehículo', 1
  UNION ALL SELECT 6, 'Continuar con la inversión oportuna en referencias y recursos tecnológicos', 'Tecnológicos, espacio físico, disponibilidad de tiempo, financieros (programados en POA)', 1
  UNION ALL SELECT 7, 'Mejorar la educación no presencial', 'Tecnológicos, espacio físico, disponibilidad de tiempo, financieros (programados en POA)', 1
  UNION ALL SELECT 8, 'Mejorar la infraestructura de la investigación', 'Tecnológicos, espacio físico, disponibilidad de tiempo, financieros (programados en POA), transporte (vehículo), viáticos', 2
  UNION ALL SELECT 9, 'Formar al talento humano calificado (investigadores)', 'Tecnológicos, espacio físico, disponibilidad de tiempo, financieros (programados en POA y gestión de becas internas y externas)', 2
  UNION ALL SELECT 10, 'Incrementar las colaboraciones interdisciplinarias', 'Tecnológicos, espacio físico, disponibilidad de tiempo, financieros (programados en POA), transporte (vehículo), viáticos, vuelos', 2
  UNION ALL SELECT 11, 'Gestionar financiamiento para la investigación', 'Tecnológicos, espacio físico, disponibilidad de tiempo, financieros (programados en POA), transporte (vehículo), viáticos, vuelos', 2
  UNION ALL SELECT 12, 'Desarrollar programas y proyectos de vinculación en función del entono', 'Tecnológicos, espacio físico, disponibilidad de tiempo, financieros (programados en POA), transporte (vehículo), viáticos', 3
  UNION ALL SELECT 13, 'Generar alianzas estratégicas que propicien la sostenibilidad de la vinculación', 'Tecnológicos, espacio físico, disponibilidad de tiempo, financieros (programados en POA), transporte (vehículo), viáticos, vuelos', 3
  UNION ALL SELECT 14, 'Generar impacto social y productivo con los programas de vinculación', 'Tecnológicos, espacio físico, disponibilidad de tiempo, financieros (programados en POA), transporte (vehículo), viáticos', 3
  UNION ALL SELECT 15, 'Impulsar proyectos que favorezcan el reconocimiento institucional', 'Tecnológicos, espacio físico, disponibilidad de tiempo, financieros (programados en POA), transporte (vehículo), viáticos, vuelos', 3
  UNION ALL SELECT 16, 'Promover la innovación y la relación con el sector productivo', 'Tecnológicos, espacio físico, disponibilidad de tiempo, financieros (programados en POA), transporte (vehículo), viáticos, vuelos', 3
  UNION ALL SELECT 17, 'Implementar un sistema de gestión de calidad', 'Tecnológicos, espacio físico, disponibilidad de tiempo, financieros (programados en POA), transporte (vehículo), viáticos, vuelos', 4
  UNION ALL SELECT 18, 'Promover la cultura de mejora continua', 'Tecnológicos, espacio físico, disponibilidad de tiempo, financieros (programados en POA), transporte (vehículo), viáticos', 4
  UNION ALL SELECT 19, 'Promover la excelencia y transparencia institucional', 'Tecnológicos, espacio físico, disponibilidad de tiempo, financieros (programados en POA), transporte (vehículo), viáticos', 4
  UNION ALL SELECT 20, 'Gestionar la sostenibilidad financiera', 'Tecnológicos, espacio físico, disponibilidad de tiempo, financieros (programados en POA), transporte (vehículo), viáticos, vuelos', 4
  UNION ALL SELECT 21, 'Adaptar la estructura organizacional para el fortalecimiento de la gobernanza institucional', 'Tecnológicos, espacio físico, disponibilidad de tiempo, financieros (programados en POA)', 4
  UNION ALL SELECT 22, 'Fortalecer la cultura y evaluación organizacional, el trabajo colaborativo y la comunicación externa', 'Tecnológicos, espacio físico, disponibilidad de tiempo, financieros (programados en POA)', 4
  UNION ALL SELECT 23, 'Continuar con el mantenimiento y manejo oportuno e inclusivo de la infraestructura', 'Tecnológicos, espacio físico, disponibilidad de tiempo, financieros (POA)', 4
  UNION ALL SELECT 24, 'Fomentar las alianzas estratégicas internacionales', 'Tecnológicos, espacio físico, disponibilidad de tiempo, financieros (programados en POA), transporte (vehículo), viáticos, vuelos', 5
  UNION ALL SELECT 25, 'Gestionar iniciativas de movilidad académica', 'Tecnológicos, espacio físico, disponibilidad de tiempo, financieros (programados en POA), transporte (vehículo), viáticos, vuelos', 5
  UNION ALL SELECT 26, 'Promover la participación en Redes Académicas Internacionales', 'Tecnológicos, espacio físico, disponibilidad de tiempo, financieros (programados en POA), transporte (vehículo), viáticos, vuelos', 5
  UNION ALL SELECT 27, 'Gestionar la sostenibilidad de la internacionalización con estándares globales', 'Tecnológicos, espacio físico, disponibilidad de tiempo, financieros (programados en POA), transporte (vehículo), viáticos, vuelos', 5
) AS x JOIN pei_lineas l ON l.numero = x.linea;

INSERT IGNORE INTO pei_actividades (accion_id, numero, nombre, periodo_inicio, periodo_fin, indicador, fuente_verificacion)
SELECT a.id, x.numero, x.nombre, x.inicio, x.fin, x.indicador, x.fuente FROM (
  SELECT 1 AS numero, 'Participación en programas de formación continua (nacionales e internacionales)' AS nombre, 2026 AS inicio, 2030 AS fin, 'Porcentaje de docentes capacitados anualmente' AS indicador, 'Informe y programas' AS fuente, 1 AS accion
  UNION ALL SELECT 2, 'Generar oportunidades de desarrollo profesional (internacionalización)', 2026, 2030, 'Índice de satisfacción docente anualmente', 'Informe y fichas de registro', 1
  UNION ALL SELECT 3, 'Participación de docentes en maestrías y doctorados (nacionales e internacionales)', 2026, 2030, 'Porcentaje de docentes con maestría o doctorado', 'Informe y atestados', 1
  UNION ALL SELECT 4, 'Desarrollar estrategias de seguimiento a los estudiantes', 2026, 2030, 'Porcentaje de estudiantes que continúan sus estudios', 'Informe e índices de retención', 2
  UNION ALL SELECT 5, 'Evaluación y actualización de los programas educativos (carreras)', 2026, 2030, 'Porcentaje de programas evaluados y actualizados', 'Informes sobre la evaluación de programas', 2
  UNION ALL SELECT 6, 'Incrementar la adopción de tecnologías educativas (virtualidad)', 2026, 2030, 'Proporción de cursos que incorporan tecnologías educativas', 'Informes sobre incorporación de tecnologías educativa', 2
  UNION ALL SELECT 7, 'Desarrollar los ciclos académicos con estándares de calidad', 2026, 2030, 'Programación de los ciclos con las respectivas cargas académicas', 'Informes estadísticos', 3
  UNION ALL SELECT 8, 'Generar registros sobre los resultados de evaluaciones del aprendizaje', 2026, 2030, 'Promedio de los resultados de evaluación del aprendizaje', 'Informes estadísticos', 3
  UNION ALL SELECT 9, 'Dar seguimiento a la satisfacción estudiantil sobre la calidad de la educación', 2026, 2030, 'Promedio de satisfacción de los estudiantes respecto a la calidad de la educación', 'Informes estadísticos', 3
  UNION ALL SELECT 10, 'Consolidar un proceso de seguimiento a graduados', 2026, 2030, 'Número de graduados empleados en áreas relacionadas con su formación', 'Informes estadísticos', 3
  UNION ALL SELECT 11, 'Participar en procesos de acreditación de programas educativos o institucionales', 2028, 2030, 'Porcentaje de programas acreditados', 'Informes y atestados de acreditación', 3
  UNION ALL SELECT 12, 'Generar estudios socioeconómicos para los planes de carreras', 2026, 2030, 'Proporción de estudios socioeconómicas', 'Documentos con estudios', 4
  UNION ALL SELECT 13, 'Integrar las competencias digitales programas educativos)', 2026, 2030, 'Tasa de integración de competencias digitales', 'Informe y programas', 4
  UNION ALL SELECT 14, 'Desarrollar alianzas con sectores productivos o tecnológicos', 2026, 2030, 'Cantidad de convenios o colaboraciones formales', 'Informe y convenios', 4
  UNION ALL SELECT 15, 'Fortalecer la gestión de las actividades artísticas, culturales y deportivas', 2026, 2030, 'Número de actividades artísticas, culturales y deportivas', 'Informe de actividades institucionales y en colaboración', 4
  UNION ALL SELECT 16, 'Desarrollar estudios de mercado', 2026, 2030, 'Número de estudios de mercado', 'Informes estadísticos', 5
  UNION ALL SELECT 17, 'Ofertar nuevas maestrías, diplomados, talleres y cursos', 2027, 2030, 'Número de maestrías, diplomados, talleres y cursos', 'Informes estadísticos', 5
  UNION ALL SELECT 18, 'Presupuestar en los Planes Operativos Anuales', 2026, 2030, 'Proporción de estudios socioeconómicas', 'Documentos con estudios', 6
  UNION ALL SELECT 19, 'Generar las respectivas compras según lo programado en los POA', 2026, 2030, 'Tasa de integración de competencias digitales', 'Informe y programas', 6
  UNION ALL SELECT 20, 'Evaluar plataforma de aulas virtuales', 2026, 2030, 'Plataforma evaluada', 'Informe sobre la evaluación de la plataforma', 7
  UNION ALL SELECT 21, 'Actualizar las plataformas de aulas virtuales', 2026, 2030, 'Plataforma diseñada', 'Informe de plataformas actualizadas y plataformas', 7
  UNION ALL SELECT 22, 'Ampliar la formación para la enseñanza en ambientes virtuales', 2026, 2030, 'Número de docentes formados', 'Informe sobre docentes formados', 7
  UNION ALL SELECT 23, 'Incrementar la infraestructura para investigación', 2026, 2030, 'Incremento anual en laboratorios, equipos tecnológicos y espacios', 'Informes de inversión', 8
  UNION ALL SELECT 24, 'Desarrollar proyectos con fondos propios con apoyo de la infraestructura científica', 2026, 2030, 'Número de proyecto desarrollado con fondos propios', 'Informes de proyectos y artículos publicados', 8
  UNION ALL SELECT 25, 'Desarrollar proyectos de forma colaborativa con apoyo de la infraestructura científica', 2026, 2030, 'Número de proyecto desarrollado de forma colaborativa y convenios', 'Informes de proyectos y artículos publicados', 8
  UNION ALL SELECT 26, 'Formar investigadores con grado de maestría o doctorado', 2026, 2030, 'Cantidad de investigadores con maestría o doctorado', 'Informe de formación en pregrado y atestados', 9
  UNION ALL SELECT 27, 'Formación de investigadores en áreas clave para la institución', 2026, 2030, 'Cantidad de investigadores especializados', 'Informe de especializaciones y atestados', 9
  UNION ALL SELECT 28, 'Generar incentivos para la retención de investigadores', 2026, 2030, 'Porcentaje de investigadores retenidos', 'Informe estadístico', 9
  UNION ALL SELECT 29, 'Incremento de publicaciones en revistas externas indexadas', 2026, 2030, 'Número de publicaciones externas', 'Artículos publicados', 9
  UNION ALL SELECT 30, 'Fortalecer la gestión institucional de la investigación', 2026, 2030, 'Interacción con el entorno', 'Informe sobre trabajo desarrollado', 10
  UNION ALL SELECT 31, 'Desarrollar proyectos de investigación interdisciplinaria', 2027, 2030, 'Número de proyectos que involucran la colaboración entre diferentes disciplinas', 'Informes y proyectos desarrollados', 10
  UNION ALL SELECT 32, 'Generar publicaciones interdisciplinarias', 2028, 2030, 'Número de artículos científicos publicados que integran disciplinas', 'Informes y artículos publicados', 10
  UNION ALL SELECT 33, 'Participar en redes nacionales e internacionales de investigación', 2026, 2030, 'Porcentaje de investigadores vinculados a redes académica', 'Informe estadístico y convenios', 10
  UNION ALL SELECT 34, 'Incrementar la producción científica y tecnológica', 2026, 2030, 'Número de producciones científicas y tecnológicas', 'Informes y proyectos', 10
  UNION ALL SELECT 35, 'Coordinar la búsqueda de recursos externos para investigación', 2026, 2030, 'Cantidad de financiamiento recibido de fuentes externas', 'Informe de coordinaciones', 11
  UNION ALL SELECT 36, 'Desarrollar proyectos con financiamiento externo', 2027, 2030, 'Número de proyectos que obtienen recursos de organismos externos', 'Informes y proyectos desarrollados', 11
  UNION ALL SELECT 37, 'Coordinar la firma de convenios para el apoyo financiero de la investigación', 2027, 2030, 'Número de convenios firmados para el apoyo financiero', 'Informes y convenios firmados', 11
  UNION ALL SELECT 38, 'Desarrollar proyectos de vinculación en colaboración con sectores locales (productivo, social y gubernamental)', 2026, 2030, 'Número de proyectos desarrollados con el sector productivo, social y gubernamental', 'Proyectos e informes', 12
  UNION ALL SELECT 39, 'Generar proyectos de vinculación alineados con las necesidades del entorno', 2026, 2030, 'Número de proyectos diseñados en función de diagnósticos', 'Proyectos y diagnósticos de necesidades', 12
  UNION ALL SELECT 40, 'Generar una política de vinculación que le dé continuidad a los proyectos de vinculación', 2026, 2030, 'Política de vinculación funcionando', 'Política de vinculación', 12
  UNION ALL SELECT 41, 'Coordinar la firma de convenios con sectores externos (nacionales e internacionales)', 2026, 2030, 'Número de convenios firmados con sectores externos', 'Informe y convenios firmados', 13
  UNION ALL SELECT 42, 'Gestionar la participación del sector productivo, social y gubernamental en actividades institucionales', 2026, 2030, 'Numero de participaciones en actividades académicas o de investigación', 'Informe estadístico', 13
  UNION ALL SELECT 43, 'Generar una base de datos de los aliados estratégicos', 2026, 2030, 'Base de datos con aliados estratégicos', 'Informe estadístico', 13
  UNION ALL SELECT 44, 'Gestionar proyectos con financiamiento externo', 2026, 2030, 'Número de proyectos con financiamiento externo', 'Informe y convenios firmados', 13
  UNION ALL SELECT 45, 'Desarrollar programas de vinculación con impacto económico, ambiental y social', 2026, 2030, 'Número de beneficiarios directos, personas o comunidades', 'Informe estadístico / y proyectos', 14
  UNION ALL SELECT 46, 'Implementar programas de vinculación que impacten la economía de la zona', 2026, 2030, 'Valor económico estimado al sector productivos', 'Informes sobre el aporte económico y proyectos', 14
  UNION ALL SELECT 47, 'Implementar un proceso de seguimiento a graduados en el sector productivo o social', 2026, 2030, 'Porcentaje de egresados vinculados al sector productivo o social', 'Informe estadístico y proceso funcionando', 14
  UNION ALL SELECT 48, 'Generar proyectos de capacitación o actividades formativas para los sectores vinculados', 2026, 2030, 'Número de beneficiarios y proyectos', 'Informe estadístico y proyectos', 14
  UNION ALL SELECT 49, 'Fomentar la participación en eventos de reconocimiento para los proyectos de vinculación', 2026, 2030, 'Número de distinciones recibidas por la calidad o impacto', 'Informe y reconocimientos recibidos', 15
  UNION ALL SELECT 50, 'Organizar indicadores que faciliten la evaluación externa de la vinculación (nacionales/ internacionales)', 2026, 2030, 'Número de indicadores generados', 'Informe estadístico de indicadores', 15
  UNION ALL SELECT 51, 'Promover la visibilidad institucional con los proyectos de vinculación', 2026, 2030, 'Número de difusiones de los proyectos en medios de comunicación', 'Informe estadístico', 15
  UNION ALL SELECT 52, 'Desarrollar un plan de trabajo de con incubadoras y emprendimiento', 2026, 2030, 'Número de distinciones recibidas por la calidad o impacto', 'Informe y reconocimientos recibidos', 16
  UNION ALL SELECT 53, 'Sistematizar mecanismos de vinculación con el sector laboral y los graduados', 2026, 2030, 'Número de indicadores generados', 'Informe estadístico de indicadores', 16
  UNION ALL SELECT 54, 'Generar estudios de consulta con graduados y empleadores', 2026, 2030, 'Número de difusiones de los proyectos en medios de comunicación', 'Informe estadístico', 16
  UNION ALL SELECT 55, 'Desarrollar un sistema de gestión de calidad en función de la realidad institucional', 2026, 2030, 'Sistema de gestión de calidad funcionando', 'Informe y manual del sistema', 17
  UNION ALL SELECT 56, 'Participar en procesos de certificación de la calidad', 2028, 2030, 'Número y tipos de certificaciones', 'Informe y atesados de certificaciones', 17
  UNION ALL SELECT 57, 'Realizar auditorías internas anualmente a las unidades y facultades (POA)', 2026, 2030, 'Número de auditorías internas realizadas anualmente', 'Informes de auditorías anuales', 17
  UNION ALL SELECT 58, 'Medir los objetivos estratégicos', 2026, 2030, 'Nivel de cumplimiento de objetivos/metas', 'Informe de medición de objetivos', 17
  UNION ALL SELECT 59, 'Trabajar estándares nacionales e internacionales de calidad', 2026, 2030, 'Estándares aplicados', 'Informe sobre estándares', 17
  UNION ALL SELECT 60, 'Implementar reuniones de trabajo colaborativo sobre la mejora continua institucional', 2026, 2030, 'Número de reuniones de trabajo', 'Informes de reuniones', 18
  UNION ALL SELECT 61, 'Difundir el trabajo relacionado con la mejora continúa', 2026, 2030, 'Número de notas difundidas', 'Informe de notas difundidas', 18
  UNION ALL SELECT 62, 'Promocionar valores relacionados con la mejora continua con la comunidad académica', 2026, 2030, 'Número de iniciativas en las que se promuevan los valores', 'Informe sobre las iniciativas de valores promovidas', 18
  UNION ALL SELECT 63, 'Generar estudios satisfacción de usuarios internos y externos', 2026, 2030, 'Medias de satisfacción de usuarios', 'Informe de estudios realizados', 19
  UNION ALL SELECT 64, 'Proporcionar información de forma oportuna y completa a la comunidad universitaria', 2026, 2030, 'Número de reportes publicados en medios institucionales', 'Informe de reportes publicados', 19
  UNION ALL SELECT 65, 'Fomentar estrategias de respuesta rápida a solicitudes o trámites internos', 2026, 2030, 'Duración promedio para resolver solicitudes y trámites', 'Informe sobre respuestas a solicitudes o trámites', 19
  UNION ALL SELECT 66, 'Elaborar POA según las finanzas y los objetivos institucionales', 2026, 2030, 'Planes Operativos Anuales elaborados', 'Planes Operativos Anuales', 20
  UNION ALL SELECT 67, 'Asignar recursos financieros según la programación de los POA', 2026, 2030, 'Ejecución de presupuesto asignado a cada unidad', 'Informe de la ejecución de presupuesto', 20
  UNION ALL SELECT 68, 'Desarrollar procesos financieros acorde a las necesidades institucionales', 2026, 2030, 'Desarrollo de procesos', 'Informe de la ejecución de los procesos', 20
  UNION ALL SELECT 69, 'Gestionar ingresos provenientes de fuentes externas', 2026, 2030, 'Porcentaje del ingreso de fuentes externas', 'Informe sobre ingresos externos', 20
  UNION ALL SELECT 70, 'Incrementar de forma anual los fondos de reserva financiera', 2026, 2030, 'Porcentaje de incremento en los fondos de reserva anuales', 'Informe de fondos de reserva', 20
  UNION ALL SELECT 71, 'Diversificar los ingresos institucionales', 2027, 2030, 'Porcentaje de ingresos', 'Informes de ingresos', 20
  UNION ALL SELECT 72, 'Implementar la Política de asignación de fondos para la inversión y el desarrollo de la Universidad', 2026, 2030, 'Política aplicada por la institución', 'Informe sobre la aplicación de la política', 20
  UNION ALL SELECT 73, 'Actualizar la normativa y estructura organizacional', 2026, 2030, 'Número de normativas y estructura', 'Normativas y estructura organizacional', 21
  UNION ALL SELECT 74, 'Generar estrategias de difusión para la normativa y estructura institucional', 2026, 2030, 'Número y tipo de estrategias', 'Informe del desarrollo de las estrategias', 21
  UNION ALL SELECT 75, 'Sistematizar la difusión de la normativa y estructura institucional', 2026, 2030, 'Número de eventos de difusión registrados', 'Informes de eventos desarrollados', 21
  UNION ALL SELECT 76, 'Generar un proceso de comunicación efectiva', 2026, 2030, 'Proceso funcionado', 'Informe de registro de los eventos', 22
  UNION ALL SELECT 77, 'Promover el trabajo en equipo y colaborativo', 2026, 2030, 'Número de trabajos desarrollados', 'Informe de trabajos desarrollados', 22
  UNION ALL SELECT 78, 'Propiciar espacios para el trabajo relacionado con la toma de decisiones', 2026, 2030, 'Número de espacios promovidos', 'Informe sobre los espacios promovidas', 22
  UNION ALL SELECT 79, 'Sistematizar el proceso de evaluación y gestión de personal', 2026, 2030, 'Proceso sistematizado', 'Informes de trabajo', 22
  UNION ALL SELECT 80, 'Diseñar y trabajar el modelo para el trabajo colaborativo', 2026, 2030, 'Modelo de trabajo', 'Modelo de trabajo e informes', 22
  UNION ALL SELECT 81, 'Evaluación anual de la infraestructura', 2026, 2030, 'Evaluación anual', 'Informe de sobre la evaluación', 23
  UNION ALL SELECT 82, 'Elaboración de POA para mantenimiento de infraestructura institucional', 2026, 2030, 'POA institucional programado', 'POA', 23
  UNION ALL SELECT 83, 'Firmar convenios de colaboración internacional', 2026, 2030, 'Convenios firmados', 'Informe y convenios firmados', 24
  UNION ALL SELECT 84, 'Participar en programas académicos con alianzas internacionales', 2027, 2030, 'Número de programas académicos con colaboración', 'Informe de programas académicos', 24
  UNION ALL SELECT 85, 'Desarrollar proyectos de investigación con instituciones extranjeras', 2026, 2030, 'Número de proyectos de investigación desarrollados', 'Informe de proyectos y publicaciones', 24
  UNION ALL SELECT 86, 'Participar en eventos que transfieren conocimientos en el ámbito internacional', 2026, 2030, 'Numero de participación en eventos', 'Informes y fichas de registro', 24
  UNION ALL SELECT 87, 'Generar programas de movilidad internacional para estudiantes (nacionales e internacionales)', 2026, 2030, 'Cantidad de estudiantes que participan en programas', 'Informes sobre intercambio de estudiantes', 25
  UNION ALL SELECT 88, 'Generar programas de movilidad internacional para docentes e investigadores (nacionales e internacionales)', 2026, 2030, 'Cantidad de docentes e investigadores que participan en programas', 'Informes sobre intercambio de docentes e investigadores', 25
  UNION ALL SELECT 89, 'Participar en redes académicas y de investigación internacionales', 2026, 2030, 'Número de asociaciones en redes internacionales', 'Informe y membresías', 26
  UNION ALL SELECT 90, 'Colaborar en eventos internacionales (congresos, simposios, conferencias)', 2026, 2030, 'Número de eventos internacionales (educación, investigación, vinculación)', 'Informe de eventos internacionales', 26
  UNION ALL SELECT 91, 'Contribuir en publicaciones internacionales de investigadores', 2026, 2030, 'Numero de artículos, libros o capítulos de libro', 'Informe, artículos, libros o capítulos', 26
  UNION ALL SELECT 92, 'Renovar y expandir alianzas internacionales', 2026, 2030, 'Número de convenios internacionales renovados', 'Informe y convenios expandidos', 27
  UNION ALL SELECT 93, 'Destinar recursos a programas internacionales en los POA', 2026, 2030, 'Recursos financieros en los POA', 'Informe y POAS', 27
  UNION ALL SELECT 94, 'Promover programas académicos alineados con estándares internacionales de calidad', 2026, 2030, 'Número de programas con estándares internacionales', 'Informe de programas y convenios', 27
  UNION ALL SELECT 95, 'Impulsar cursos que incorporan competencias globales y transversales (idiomas, culturas, tecnología)', 2026, 2030, 'Número de cursos competencias globales y transversales', 'Informe de cursos y convenios', 27
  UNION ALL SELECT 96, 'Desarrollar investigaciones y proyectos vinculados a temas globales (desarrollo sostenible, cambio climático)', 2026, 2030, 'Número de proyectos de investigación con la participación internacionales', 'Informe de proyectos y artículos publicados', 27
) AS x JOIN pei_acciones a ON a.numero = x.accion;

-- ============================================================
--  ✓  Instalación completada
--  Verificación (ejecutar aparte):
--    SELECT (SELECT COUNT(*) FROM sgc_dimensiones) AS dimensiones,
--           (SELECT COUNT(*) FROM sgc_evidencias)  AS evidencias,
--           (SELECT COUNT(*) FROM users)           AS usuarios,
--           (SELECT COUNT(*) FROM pei_actividades) AS actividades_pei;
--  Debe dar 7 · 362 · 1 · 96
-- ============================================================
