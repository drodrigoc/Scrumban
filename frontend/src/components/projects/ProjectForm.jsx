import { useState } from 'react';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#14B8A6'];

export default function ProjectForm({ project, users, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: project?.name || '',
    description: project?.description || '',
    objectives: project?.objectives || '',
    start_date: project?.start_date ? project.start_date.split('T')[0] : '',
    end_date: project?.end_date ? project.end_date.split('T')[0] : '',
    status: project?.status || 'active',
    color: project?.color || '#3B82F6',
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Nombre del proyecto *</label>
        <input type="text" className="input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
      </div>

      <div>
        <label className="label">Descripción</label>
        <textarea className="input resize-none" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} />
      </div>

      <div>
        <label className="label">Objetivos</label>
        <textarea className="input resize-none" value={form.objectives} onChange={e => setForm({ ...form, objectives: e.target.value })} rows={2} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Fecha inicio</label>
          <input type="date" className="input" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} />
        </div>
        <div>
          <label className="label">Fecha fin</label>
          <input type="date" className="input" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} />
        </div>
      </div>

      <div>
        <label className="label">Estado</label>
        <select className="input" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
          <option value="active">Activo</option>
          <option value="paused">Pausado</option>
          <option value="completed">Completado</option>
          <option value="cancelled">Cancelado</option>
        </select>
      </div>

      <div>
        <label className="label">Color del proyecto</label>
        <div className="flex gap-2 flex-wrap mt-1">
          {COLORS.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setForm({ ...form, color: c })}
              className={`w-7 h-7 rounded-full transition-transform hover:scale-110 ${
                form.color === c ? 'ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-gray-900 scale-110' : ''
              }`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button type="button" className="btn-secondary flex-1" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn-primary flex-1">{project ? 'Actualizar' : 'Crear Proyecto'}</button>
      </div>
    </form>
  );
}
