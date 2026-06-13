import axios from 'axios';

// En desarrollo: usa el proxy de Vite → '/api'
// En producción: usa la URL del backend desplegado → VITE_API_URL/api
const BACKEND_ORIGIN = import.meta.env.VITE_API_URL || '';
const BASE = BACKEND_ORIGIN ? `${BACKEND_ORIGIN}/api` : '/api';

// Construye la URL absoluta de un archivo adjunto
export const getUploadUrl = (category, filepath) =>
  `${BACKEND_ORIGIN}/uploads/${category}/${filepath}`;

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
  changePassword: (data) => api.put('/auth/change-password', data),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (data) => api.post('/auth/reset-password', data),
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
};

// Tasks
export const tasksAPI = {
  getByProject: (projectId, params) => api.get(`/projects/${projectId}/tasks`, { params }),
  getById: (projectId, id) => api.get(`/projects/${projectId}/tasks/${id}`),
  create: (projectId, data) => api.post(`/projects/${projectId}/tasks`, data),
  update: (projectId, id, data) => api.put(`/projects/${projectId}/tasks/${id}`, data),
  delete: (projectId, id) => api.delete(`/projects/${projectId}/tasks/${id}`),
  updatePositions: (projectId, tasks) => api.patch(`/projects/${projectId}/tasks/positions`, { tasks }),
  addComment: (projectId, id, content) => api.post(`/projects/${projectId}/tasks/${id}/comments`, { content }),
  deleteComment: (projectId, id, commentId) => api.delete(`/projects/${projectId}/tasks/${id}/comments/${commentId}`),
  uploadAttachment: (projectId, id, formData) =>
    api.post(`/projects/${projectId}/tasks/${id}/attachments`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteAttachment: (projectId, id, attachmentId) =>
    api.delete(`/projects/${projectId}/tasks/${id}/attachments/${attachmentId}`),
  uploadSGCAttachment: (projectId, id, formData) =>
    api.post(`/projects/${projectId}/tasks/${id}/sgc-attachments`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteSGCAttachment: (projectId, id, attachmentId) =>
    api.delete(`/projects/${projectId}/tasks/${id}/sgc-attachments/${attachmentId}`),
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
export const sgcAPI = {
  getAll:         ()         => api.get('/sgc'),
  getAllWithTasks: ()         => api.get('/sgc/with-tasks'),
  create:         (data)     => api.post('/sgc', data),
  update:         (id, data) => api.put(`/sgc/${id}`, data),
  delete:         (id)       => api.delete(`/sgc/${id}`),
};

// My Tasks (tareas del usuario autenticado en todos los proyectos)
export const myTasksAPI = {
  getAll: (params) => api.get('/my-tasks', { params }),
};

export default api;
