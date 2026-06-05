# ProjectFlow - Sistema de Gestión de Proyectos

Sistema web completo tipo Trello/Jira con React + Node.js + MySQL.

## Requisitos previos

- Node.js >= 18
- MySQL >= 8.0
- npm >= 9

## Instalación rápida

### 1. Base de datos

Abrir MySQL y ejecutar:

```sql
mysql -u root -p < database/schema.sql
mysql -u root -p project_manager < database/seed.sql
```

O desde MySQL Workbench: importar `database/schema.sql` y luego `database/seed.sql`.

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

## Credenciales de prueba

| Rol           | Email                          | Contraseña |
|---------------|--------------------------------|------------|
| Administrador | admin@projectmanager.com       | password   |
| Coordinador   | carlos@projectmanager.com      | password   |
| Miembro       | ana@projectmanager.com         | password   |
| Visor         | maria@projectmanager.com       | password   |

> **Nota:** En producción, cambiar todas las contraseñas y el `JWT_SECRET` en `.env`.

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
    ├── schema.sql                    # Crear tablas
    └── seed.sql                      # Datos de prueba
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
