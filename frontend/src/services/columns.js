import { projectsAPI } from './api';

// Columnas base de un tablero nuevo. Se usan como respaldo si el proyecto
// todavía no tiene configuración propia o si falla la petición.
export const DEFAULT_KANBAN_COLUMNS = [
  { id: 'pending',     label: 'Pendiente',   color: 'bg-gray-400',  ring: 'ring-gray-400'  },
  { id: 'in_progress', label: 'En Proceso',  color: 'bg-blue-500',  ring: 'ring-blue-400'  },
  { id: 'in_review',   label: 'En Revisión', color: 'bg-amber-500', ring: 'ring-amber-400' },
  { id: 'completed',   label: 'Completado',  color: 'bg-green-500', ring: 'ring-green-400' },
];

// Columnas del tablero de un proyecto, normalizadas a { id, label, color, ring }.
// La BD guarda column_key; las vistas trabajan con id.
export async function fetchKanbanColumns(projectId) {
  const { data } = await projectsAPI.getColumns(projectId);
  return data.columns.map(c => ({
    id:    c.column_key,
    label: c.label,
    color: c.color,
    ring:  c.ring,
  }));
}
