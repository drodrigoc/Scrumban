import axios from 'axios';

// En desarrollo: usa el proxy de Vite → '/api'
// En producción: usa la URL del backend desplegado → VITE_API_URL/api
const BACKEND_ORIGIN = import.meta.env.VITE_API_URL || '';
const BASE = BACKEND_ORIGIN ? `${BACKEND_ORIGIN}/api` : '/api';

const api = axios.create({
  baseURL: BASE,
  headers: { 'Content-Type': 'application/json' },
});

// Inyectar token JWT en cada petición
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Manejar errores globalmente
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth
export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  getMe: () => api.get('/auth/me'),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (data) => api.post('/auth/reset-password', data),
};

// Configuración del sistema (solo administradores)
export const settingsAPI = {
  getEmail:        ()     => api.get('/settings/email'),
  updateEmail:     (data) => api.put('/settings/email', data),
  connectEmail:    ()     => api.post('/settings/email/oauth/start'),
  disconnectEmail: ()     => api.delete('/settings/email'),
  testEmail:       (para) => api.post('/settings/email/test', { para }),
  retryEmails:     ()     => api.post('/settings/email/retry'),
};

// Users
export const usersAPI = {
  getAll: () => api.get('/users'),
  getById: (id) => api.get(`/users/${id}`),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  toggleStatus: (id) => api.patch(`/users/${id}/toggle-status`),
  resetPassword: (id, newPassword) => api.patch(`/users/${id}/reset-password`, { newPassword }),
  getStats: () => api.get('/users/stats'),
  getTeamOverview: () => api.get('/users/team-overview'),
};

// Units
export const unitsAPI = {
  getAll:  ()         => api.get('/units'),
  create:  (data)     => api.post('/units', data),
  update:  (id, data) => api.put(`/units/${id}`, data),
  delete:  (id)       => api.delete(`/units/${id}`),
};

// Projects
export const projectsAPI = {
  getAll: () => api.get('/projects'),
  getById: (id) => api.get(`/projects/${id}`),
  create: (data) => api.post('/projects', data),
  update: (id, data) => api.put(`/projects/${id}`, data),
  delete: (id) => api.delete(`/projects/${id}`),
  addMember: (id, data) => api.post(`/projects/${id}/members`, data),
  updateMemberRole: (id, userId, role) => api.patch(`/projects/${id}/members/${userId}/role`, { role }),
  removeMember: (id, userId) => api.delete(`/projects/${id}/members/${userId}`),
  getLabels: (id) => api.get(`/projects/${id}/labels`),
  createLabel: (id, data) => api.post(`/projects/${id}/labels`, data),
  // Columnas del tablero Kanban (compartidas por todo el equipo)
  getColumns: (id) => api.get(`/projects/${id}/columns`),
  saveColumns: (id, columns) => api.put(`/projects/${id}/columns`, { columns }),
};

// Presupuesto — partidas de costos fijos y variables
export const budgetAPI = {
  getAll: (projectId) => api.get(`/projects/${projectId}/budget`),
  create: (projectId, data) => api.post(`/projects/${projectId}/budget`, data),
  update: (projectId, itemId, data) => api.put(`/projects/${projectId}/budget/${itemId}`, data),
  delete: (projectId, itemId) => api.delete(`/projects/${projectId}/budget/${itemId}`),
};

// Fases — cronograma macro del proyecto
export const phasesAPI = {
  getAll: (projectId) => api.get(`/projects/${projectId}/phases`),
  create: (projectId, data) => api.post(`/projects/${projectId}/phases`, data),
  update: (projectId, phaseId, data) => api.put(`/projects/${projectId}/phases/${phaseId}`, data),
  delete: (projectId, phaseId) => api.delete(`/projects/${projectId}/phases/${phaseId}`),
};

// Tasks
export const tasksAPI = {
  getByProject: (projectId, params) => api.get(`/projects/${projectId}/tasks`, { params }),
  getById: (projectId, id) => api.get(`/projects/${projectId}/tasks/${id}`),
  create: (projectId, data) => api.post(`/projects/${projectId}/tasks`, data),
  update: (projectId, id, data) => api.put(`/projects/${projectId}/tasks/${id}`, data),
  delete: (projectId, id) => api.delete(`/projects/${projectId}/tasks/${id}`),
  // Archivado
  archive: (projectId, id) => api.patch(`/projects/${projectId}/tasks/${id}/archive`),
  unarchive: (projectId, id) => api.patch(`/projects/${projectId}/tasks/${id}/unarchive`),
  archiveCompleted: (projectId, olderThanDays) =>
    api.post(`/projects/${projectId}/tasks/archive-completed`, { older_than_days: olderThanDays }),
  getArchived: (projectId, params) =>
    api.get(`/projects/${projectId}/tasks`, { params: { ...params, archived: 1 } }),
  getArchivedCount: (projectId) => api.get(`/projects/${projectId}/tasks/archived-count`),
  addComment: (projectId, id, content) => api.post(`/projects/${projectId}/tasks/${id}/comments`, { content }),
  deleteComment: (projectId, id, commentId) => api.delete(`/projects/${projectId}/tasks/${id}/comments/${commentId}`),
  // onUploadProgress recibe el avance de la transferencia al backend
  uploadAttachment: (projectId, id, formData, onUploadProgress) =>
    api.post(`/projects/${projectId}/tasks/${id}/attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
    }),
  deleteAttachment: (projectId, id, attachmentId) =>
    api.delete(`/projects/${projectId}/tasks/${id}/attachments/${attachmentId}`),
  // Descarga con sesión — necesaria para los archivos de Google Drive,
  // que no tienen URL pública
  downloadAttachment: (projectId, id, attachmentId) =>
    api.get(`/projects/${projectId}/tasks/${id}/attachments/${attachmentId}/download`, {
      responseType: 'blob',
    }),
  uploadSGCAttachment: (projectId, id, formData, onUploadProgress) =>
    api.post(`/projects/${projectId}/tasks/${id}/sgc-attachments`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress,
    }),
  deleteSGCAttachment: (projectId, id, attachmentId) =>
    api.delete(`/projects/${projectId}/tasks/${id}/sgc-attachments/${attachmentId}`),
  // Corrige a qué evidencia pertenece un archivo ya subido
  reassignSGCAttachment: (projectId, id, attachmentId, evidenciaId) =>
    api.patch(`/projects/${projectId}/tasks/${id}/sgc-attachments/${attachmentId}`, {
      evidencia_id: evidenciaId,
    }),
  // Checklist
  getChecklist: (projectId, taskId) =>
    api.get(`/projects/${projectId}/tasks/${taskId}/checklist`),
  addChecklistItem: (projectId, taskId, text) =>
    api.post(`/projects/${projectId}/tasks/${taskId}/checklist`, { text }),
  updateChecklistItem: (projectId, taskId, itemId, data) =>
    api.patch(`/projects/${projectId}/tasks/${taskId}/checklist/${itemId}`, data),
  deleteChecklistItem: (projectId, taskId, itemId) =>
    api.delete(`/projects/${projectId}/tasks/${taskId}/checklist/${itemId}`),
};

// Notifications
export const notificationsAPI = {
  getAll: () => api.get('/notifications'),
  getUnreadCount: () => api.get('/notifications/unread-count'),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/mark-all-read'),
};

// Dashboard
export const dashboardAPI = {
  getStats: () => api.get('/dashboard/stats'),
};

// SGC - Sistema de Gestión de Calidad
// Catálogo en cuatro niveles: dimensión → criterio → indicador → evidencia
export const sgcAPI = {
  getAll:          ()         => api.get('/sgc'),
  getArbol:        ()         => api.get('/sgc/arbol'),
  getAllWithTasks: ()         => api.get('/sgc/with-tasks'),
  // Bitácora de archivos: { usuario, accion, desde, hasta, q, pagina }
  getActividad:    (params)   => api.get('/sgc/actividad', { params }),
  // Reporte para auditoría: { dimension, criterio, indicador }
  descargarReporte: (params)  => api.get('/sgc/reporte.xlsx', { params, responseType: 'blob' }),
  // Evidencias (nivel 4)
  create:          (data)     => api.post('/sgc', data),
  update:          (id, data) => api.put(`/sgc/${id}`, data),
  delete:          (id)       => api.delete(`/sgc/${id}`),
  // Niveles 1 a 3: nivel = 'dimensiones' | 'criterios' | 'indicadores'
  createNivel:     (nivel, data)     => api.post(`/sgc/${nivel}`, data),
  updateNivel:     (nivel, id, data) => api.put(`/sgc/${nivel}/${id}`, data),
  deleteNivel:     (nivel, id)       => api.delete(`/sgc/${nivel}/${id}`),
};

// My Tasks (tareas del usuario autenticado en todos los proyectos)
export const myTasksAPI = {
  getAll: (params) => api.get('/my-tasks', { params }),
};

export default api;
