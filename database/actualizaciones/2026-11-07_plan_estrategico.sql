-- ============================================================
--  Actualización 2026-11-07 — Plan Estratégico Institucional
-- ============================================================
--  Solo para bases que ya existían antes de esta fecha (sandbox,
--  Railway). Una instalación nueva con instalacion.sql ya lo trae.
--
--  Crea el catálogo del plan estratégico 2026-2030 (5 líneas con su
--  objetivo, 27 acciones y 96 actividades con indicador y fuente de
--  verificación) y la tabla que vincula cada proyecto con las
--  actividades a las que responde, con su control de cumplimiento.
--
--  CÓMO EJECUTARLO (desde la carpeta backend)
--      node scripts/migrate.js ../database/actualizaciones/2026-11-07_plan_estrategico.sql "mysql://usuario:clave@host:3306/base"
--  Es seguro repetirlo: lo ya aplicado se informa como "ya aplicado"
--  y los datos del catálogo no se duplican ni se sobrescriben.
-- ============================================================

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

-- Catálogo inicial, tomado del documento del plan
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
