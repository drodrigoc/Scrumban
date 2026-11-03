# ProjectFlow - Sistema de Gestión de Proyectos

Sistema web completo tipo Trello/Jira con React + Node.js + MySQL.

## Requisitos previos

- Node.js >= 20
- MySQL >= 8.0
- npm >= 9

## Instalación rápida

### 1. Base de datos

Crear una base vacía y ejecutar el instalador, que crea las tablas, el usuario
inicial y el catálogo SGC:

```sql
CREATE DATABASE scrumban CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

```bash
cd backend
node scripts/migrate.js ../database/instalacion.sql "mysql://usuario:clave@host:3306/scrumban"
```

También se puede abrir `database/instalacion.sql` y ejecutarlo completo en
MySQL Workbench, DBeaver o TablePlus.

### 2. Backend

```bash
cd backend
npm install
# Editar .env con tus credenciales de MySQL
npm run dev
```

El servidor corre en `http://localhost:5000`

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

La app corre en `http://localhost:5173`

## Usuario inicial

El instalador crea un administrador: `admin@projectflow.com` / `Admin1234`.
Esa clave es pública: al entrar, crea tu propio administrador desde Control de
Accesos y deshabilita este. En producción, cambia también el `JWT_SECRET` del `.env`.

## Estructura del proyecto

```
Scrumban/
├── backend/
│   ├── src/
│   │   ├── app.js                    # Entry point
│   │   ├── config/database.js        # Conexión MySQL
│   │   ├── controllers/              # Lógica de negocio
│   │   ├── middleware/               # Auth JWT, upload
│   │   └── routes/                   # Endpoints REST
│   ├── uploads/                      # Archivos adjuntos
│   └── .env                          # Variables de entorno
├── frontend/
│   └── src/
│       ├── pages/                    # Páginas principales
│       ├── components/               # Componentes reutilizables
│       ├── context/AuthContext.jsx   # Estado global de auth
│       └── services/api.js           # Cliente HTTP (axios)
└── database/
    └── instalacion.sql               # Tablas, usuario inicial y catálogo SGC
```

## Endpoints API

| Método | Ruta                                    | Descripción                  |
|--------|-----------------------------------------|------------------------------|
| POST   | /api/auth/login                         | Iniciar sesión                |
| GET    | /api/auth/me                            | Perfil del usuario actual     |
| GET    | /api/users                              | Listar usuarios               |
| POST   | /api/users                              | Crear usuario (admin)         |
| GET    | /api/projects                           | Listar proyectos              |
| POST   | /api/projects                           | Crear proyecto                |
| GET    | /api/projects/:id/tasks                 | Tareas por proyecto           |
| POST   | /api/projects/:id/tasks                 | Crear tarea                   |
| PUT    | /api/projects/:id/tasks/:tid            | Actualizar tarea              |
| POST   | /api/projects/:id/tasks/:tid/comments   | Agregar comentario            |
| GET    | /api/notifications                      | Notificaciones del usuario    |
| GET    | /api/dashboard/stats                    | Estadísticas generales        |

## Funcionalidades

- ✅ Autenticación JWT con roles (admin, coordinator, member, viewer)
- ✅ Dashboard con KPIs, progreso y actividad reciente
- ✅ CRUD completo de proyectos con colores y estados
- ✅ CRUD completo de tareas con prioridades, etiquetas y responsables
- ✅ Tablero Kanban con drag & drop (dnd-kit)
- ✅ Vista Calendario mensual con eventos por fecha
- ✅ Cronograma tipo Gantt con barras de progreso
- ✅ Comentarios en tareas con notificaciones
- ✅ Historial de cambios por tarea
- ✅ Adjuntar archivos a tareas
- ✅ Sistema de notificaciones en tiempo real (polling)
- ✅ Panel de control de usuarios (solo admin)
- ✅ Interfaz responsive con Tailwind CSS
