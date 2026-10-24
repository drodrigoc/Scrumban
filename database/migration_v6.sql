-- ============================================================
--  Scrumban — Migración v6
-- ============================================================
--  Catálogo SGC en cuatro niveles:
--
--      Dimensión  1
--      └── Criterio  1.1
--          └── Indicador  1.1.1
--              └── Evidencia  1.1.1.1   ← aquí se adjuntan las pruebas
--
--  Antes, cada evidencia guardaba su dimensión y su criterio como texto
--  repetido, y no existía el nivel de indicador. Ahora cada nivel es una
--  tabla con su código y su nombre.
--
--  Las evidencias que ya existen se conservan con sus tareas y archivos.
--  Como no se sabe a qué indicador pertenece cada una, quedan en un
--  indicador provisional "Por clasificar" (código <criterio>.0) para que
--  el administrador las mueva al indicador correcto.
--
--  CÓMO EJECUTARLA
--  ───────────────
--  Recomendado (los pasos 9 y 10 no funcionan en la consola web de
--  Railway, que agrega LIMIT al final):
--      cd backend
--      node scripts/migrate.js ../database/migration_v6.sql "mysql://usuario:clave@host:puerto/base"
--
--  Es seguro repetirla: los pasos ya aplicados responden "already exists"
--  o "Duplicate", y los de datos no duplican nada.
-- ============================================================


-- ── PASO 1 ── Nivel 1: dimensiones ──────────────────────────
CREATE TABLE IF NOT EXISTS sgc_dimensiones (
  id          INT PRIMARY KEY AUTO_INCREMENT,
  codigo      VARCHAR(20)  NOT NULL,
  nombre      VARCHAR(600) NOT NULL,
  descripcion TEXT         DEFAULT NULL,
  created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_dimension_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ── PASO 2 ── Nivel 2: criterios ────────────────────────────
-- RESTRICT: no se puede borrar una dimensión que todavía tiene criterios
CREATE TABLE IF NOT EXISTS sgc_criterios (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  dimension_id INT          NOT NULL,
  codigo       VARCHAR(20)  NOT NULL,
  nombre       VARCHAR(600) NOT NULL,
  descripcion  TEXT         DEFAULT NULL,
  created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_criterio_codigo (codigo),
  FOREIGN KEY (dimension_id) REFERENCES sgc_dimensiones(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ── PASO 3 ── Nivel 3: indicadores ──────────────────────────
CREATE TABLE IF NOT EXISTS sgc_indicadores (
  id           INT PRIMARY KEY AUTO_INCREMENT,
  criterio_id  INT          NOT NULL,
  codigo       VARCHAR(30)  NOT NULL,
  nombre       VARCHAR(600) NOT NULL,
  descripcion  TEXT         DEFAULT NULL,
  created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_indicador_codigo (codigo),
  FOREIGN KEY (criterio_id) REFERENCES sgc_criterios(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ── PASO 4 ── Nivel 4: las evidencias cuelgan de un indicador ─
ALTER TABLE sgc_evidencias
  ADD COLUMN indicador_id INT NULL DEFAULT NULL;


-- ── PASO 5 ──────────────────────────────────────────────────
ALTER TABLE sgc_evidencias
  ADD CONSTRAINT fk_evidencias_indicador
  FOREIGN KEY (indicador_id) REFERENCES sgc_indicadores(id) ON DELETE RESTRICT;


-- ── PASO 6 ── Dimensiones a partir de las evidencias actuales ─
-- El nombre queda provisional ("Dimensión 1"): se edita desde el panel SGC
INSERT IGNORE INTO sgc_dimensiones (codigo, nombre)
SELECT DISTINCT TRIM(dimension), CONCAT('Dimensión ', TRIM(dimension))
  FROM sgc_evidencias
 WHERE dimension IS NOT NULL AND TRIM(dimension) <> '';


-- ── PASO 7 ── Criterios a partir de las evidencias actuales ──
INSERT IGNORE INTO sgc_criterios (dimension_id, codigo, nombre)
SELECT DISTINCT d.id, TRIM(e.criterio), CONCAT('Criterio ', TRIM(e.criterio))
  FROM sgc_evidencias e
  JOIN sgc_dimensiones d ON d.codigo = TRIM(e.dimension)
 WHERE e.criterio IS NOT NULL AND TRIM(e.criterio) <> '';


-- ── PASO 8 ── Indicador provisional por criterio ─────────────
INSERT IGNORE INTO sgc_indicadores (criterio_id, codigo, nombre, descripcion)
SELECT DISTINCT c.id, CONCAT(c.codigo, '.0'), 'Por clasificar',
       'Indicador provisional creado por la migración. Mueve sus evidencias al indicador que corresponda.'
  FROM sgc_criterios c
  JOIN sgc_evidencias e ON TRIM(e.criterio) = c.codigo;


-- ── PASO 9 ── Cada evidencia actual a su indicador provisional ─
UPDATE sgc_evidencias e
  JOIN sgc_criterios   c ON c.codigo = TRIM(e.criterio)
  JOIN sgc_indicadores i ON i.codigo = CONCAT(c.codigo, '.0')
   SET e.indicador_id = i.id
 WHERE e.indicador_id IS NULL;


-- ── PASO 10 ── Los textos viejos dejan de ser obligatorios ───
-- Ya no se escriben: la dimensión y el criterio salen del indicador.
-- Se conservan por ahora como respaldo y se eliminarán más adelante.
-- El nombre se amplía a 600: hay evidencias del modelo de acreditación
-- con nombres de más de 400 caracteres.
ALTER TABLE sgc_evidencias
  MODIFY dimension        VARCHAR(255) NULL DEFAULT NULL,
  MODIFY criterio         VARCHAR(255) NULL DEFAULT NULL,
  MODIFY nombre_evidencia VARCHAR(600) NOT NULL;


-- ============================================================
--  ✓  Migración v6 completada
-- ============================================================
