import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { projectsAPI, usersAPI, unitsAPI } from '../services/api';
import { Kanban, CalendarDays, GanttChartSquare, List, ArrowLeft, Edit, Users, Plus, Trash2, Building2, DollarSign, UserCog } from 'lucide-react';
import Modal from '../components/common/Modal';
import ProjectForm from '../components/projects/ProjectForm';
import { useAuth } from '../context/AuthContext';

const statusConfig = {
  active:    { label: 'Activo',     color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  paused:    { label: 'Pausado',    color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  completed: { label: 'Completado', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  cancelled: { label: 'Cancelado',  color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

export default function ProjectDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [project, setProject] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [units, setUnits]       = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showEditModal, setShowEditModal]       = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [editingRoleId, setEditingRoleId]       = useState(null); // id del miembro cuyo rol se edita

  useEffect(() => {
    Promise.all([projectsAPI.getById(id), usersAPI.getAll(), unitsAPI.getAll()])
      .then(([p, u, un]) => { setProject(p.data); setAllUsers(u.data); setUnits(un.data); })
      .catch(() => { toast.error('Error al cargar proyecto'); navigate('/projects'); })
      .finally(() => setLoading(false));
  }, [id]);

  const handleUpdate = async (data) => {
    try {
      const { data: updated } = await projectsAPI.update(id, data);
      setProject(prev => ({ ...prev, ...updated }));
      setShowEditModal(false);
      toast.success('Proyecto actualizado');
    } catch { toast.error('Error al actualizar'); }
  };

  const handleAddMember = async (userId, role) => {
    try {
      await projectsAPI.addMember(id, { user_id: userId, role });
      const { data } = await projectsAPI.getById(id);
      setProject(data);
      toast.success('Miembro agregado');
    } catch (err) { toast.error(err.response?.data?.message || 'Error al agregar miembro'); }
  };

  const handleRemoveMember = async (userId) => {
    if (!confirm('¿Eliminar este miembro del proyecto?')) return;
    try {
      await projectsAPI.removeMember(id, userId);
      setProject(prev => ({ ...prev, members: prev.members.filter(m => m.id !== userId) }));
      toast.success('Miembro eliminado');
    } catch { toast.error('Error al eliminar miembro'); }
  };

  const handleUpdateRole = async (userId, newRole) => {
    try {
      await projectsAPI.updateMemberRole(id, userId, newRole);
      setProject(prev => ({
        ...prev,
        members: prev.members.map(m => m.id === userId ? { ...m, project_role: newRole } : m),
      }));
      setEditingRoleId(null);
      toast.success('Rol actualizado');
    } catch { toast.error('Error al actualizar rol'); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!project) return null;

  const st = statusConfig[project.status] || statusConfig.active;
  const taskStats = project.taskStats || [];
  const totalTasks = taskStats.reduce((sum, s) => sum + s.count, 0);
  const progress = project.avg_progress ?? 0;
  const myProjectRole = project.members?.find(m => m.id === user?.id)?.project_role;
  const canEdit = user?.role === 'admin'
    || user?.role === 'coordinator'
    || project.owner_id === user?.id
    || myProjectRole === 'coordinator';

  const presupuesto  = project.presupuesto  != null ? parseFloat(project.presupuesto)  : null;
  const totalCosto   = project.total_costo  != null ? parseFloat(project.total_costo)  : 0;
  const disponible   = presupuesto != null ? presupuesto - totalCosto : null;
  const budgetPct    = presupuesto > 0 ? Math.min(100, Math.round((totalCosto / presupuesto) * 100)) : 0;
  const fmt          = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

  const views = [
    { to: `/projects/${id}/backlog`,   icon: List,             label: 'Backlog' },
    { to: `/projects/${id}/kanban`,    icon: Kanban,           label: 'Tablero Kanban' },
    { to: `/projects/${id}/calendar`,  icon: CalendarDays,     label: 'Calendario' },
    { to: `/projects/${id}/gantt`,     icon: GanttChartSquare, label: 'Cronograma' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <Link to="/projects" className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 mt-0.5">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: project.color }} />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{project.name}</h1>
              <span className={`badge ${st.color}`}>{st.label}</span>
            </div>
            {project.description && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-2xl">{project.description}</p>
            )}
          </div>
        </div>
        {canEdit && (
          <button onClick={() => setShowEditModal(true)} className="btn-secondary">
            <Edit className="w-4 h-4" /> Editar
          </button>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{progress}%</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Progreso</p>
          <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-1.5 mt-2">
            <div className="h-1.5 rounded-full bg-primary-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
        {[
          { label: 'Total Tareas', value: totalTasks },
          { label: 'Progreso', value: `${progress}%` },
          { label: 'Miembros', value: project.members?.length || 0 },
        ].map(s => (
          <div key={s.label} className="card p-4 text-center">
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{s.value}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Financial Summary */}
      {(presupuesto != null || totalCosto > 0) && (
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2 mb-4">
            <DollarSign className="w-4 h-4 text-green-500" />
            Control de Gastos
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            {presupuesto != null && (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Presupuesto</p>
                <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{fmt(presupuesto)}</p>
              </div>
            )}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Gastado</p>
              <p className={`text-lg font-bold ${disponible != null && disponible < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
                {fmt(totalCosto)}
              </p>
            </div>
            {disponible != null && (
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Disponible</p>
                <p className={`text-lg font-bold ${disponible < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                  {fmt(disponible)}
                </p>
              </div>
            )}
          </div>
          {presupuesto != null && presupuesto > 0 && (
            <div>
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                <span>Ejecución presupuestaria</span>
                <span className={budgetPct >= 100 ? 'text-red-500 font-semibold' : ''}>{budgetPct}%</span>
              </div>
              <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${budgetPct >= 100 ? 'bg-red-500' : budgetPct >= 80 ? 'bg-amber-500' : 'bg-green-500'}`}
                  style={{ width: `${budgetPct}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Views */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Vistas</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {views.map(({ to, icon: Icon, label }) => (
            <Link key={to} to={to}
              className="card p-4 flex items-center gap-3 hover:shadow-md dark:hover:shadow-gray-900/50 hover:border-primary-200 dark:hover:border-primary-700 transition-all group">
              <div className="w-10 h-10 rounded-xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center group-hover:bg-primary-100 dark:group-hover:bg-primary-900/50 transition-colors">
                <Icon className="w-5 h-5 text-primary-600 dark:text-primary-400" />
              </div>
              <span className="font-medium text-gray-700 dark:text-gray-300 group-hover:text-primary-700 dark:group-hover:text-primary-400">
                {label}
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* Members */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 flex items-center gap-2">
            <Users className="w-4 h-4 text-primary-500" />
            Miembros del Equipo ({project.members?.length || 0})
          </h2>
          {canEdit && (
            <button onClick={() => setShowMembersModal(true)} className="btn-secondary text-xs py-1.5 px-3">
              <Plus className="w-3.5 h-3.5" /> Agregar
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {project.members?.map(m => (
            <div key={m.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center text-primary-700 dark:text-primary-300 font-semibold text-sm flex-shrink-0">
                  {m.name?.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">{m.name}</p>
                  {/* Rol: selector inline si se está editando, etiqueta si no */}
                  {canEdit && m.id !== user?.id && editingRoleId === m.id ? (
                    <div className="flex items-center gap-1 mt-0.5">
                      <select
                        autoFocus
                        defaultValue={m.project_role}
                        onChange={e => handleUpdateRole(m.id, e.target.value)}
                        onBlur={() => setEditingRoleId(null)}
                        className="text-xs border border-primary-400 rounded px-1 py-0.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 focus:outline-none"
                      >
                        <option value="coordinator">Coordinador</option>
                        <option value="member">Miembro</option>
                        <option value="viewer">Visor</option>
                      </select>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400 dark:text-gray-500 capitalize">{m.project_role}</p>
                  )}
                </div>
              </div>
              {canEdit && m.id !== user?.id && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => setEditingRoleId(editingRoleId === m.id ? null : m.id)}
                    title="Cambiar rol"
                    className="p-1 text-gray-400 hover:text-primary-500 dark:hover:text-primary-400 transition-colors"
                  >
                    <UserCog className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleRemoveMember(m.id)}
                    title="Eliminar miembro"
                    className="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {showEditModal && (
        <Modal title="Editar Proyecto" onClose={() => setShowEditModal(false)}>
          <ProjectForm project={project} users={allUsers} onSave={handleUpdate} onCancel={() => setShowEditModal(false)} />
        </Modal>
      )}

      {showMembersModal && (
        <Modal title="Agregar Miembro" onClose={() => setShowMembersModal(false)} size="sm">
          <AddMemberForm
            allUsers={allUsers}
            units={units}
            currentMembers={project.members || []}
            onAdd={handleAddMember}
            onClose={() => setShowMembersModal(false)}
          />
        </Modal>
      )}
    </div>
  );
}

function AddMemberForm({ allUsers, units, currentMembers, onAdd, onClose }) {
  const [selectedUnit, setSelectedUnit] = useState('');
  const [userId, setUserId]             = useState('');
  const [role, setRole]                 = useState('member');

  // Users not yet in the project
  const available = allUsers.filter(u => u.is_active && !currentMembers.find(m => m.id === u.id));

  // Users filtered by the chosen unit (or all if no unit selected yet)
  const filteredUsers = selectedUnit === '__none__'
    ? available.filter(u => !u.unit)
    : selectedUnit
      ? available.filter(u => u.unit === selectedUnit)
      : [];

  const handleUnitChange = (val) => {
    setSelectedUnit(val);
    setUserId(''); // reset user when unit changes
  };

  const handleSubmit = () => {
    if (!userId) return;
    onAdd(parseInt(userId), role);
    onClose();
  };

  // Determine which unit names actually have available users (+ special "no unit" bucket)
  const unitsWithUsers = units.filter(un => available.some(u => u.unit === un.name));
  const hasUsersWithNoUnit = available.some(u => !u.unit);

  return (
    <div className="space-y-4">

      {/* Step 1 — Unit */}
      <div>
        <label className="label">
          <Building2 className="inline w-3.5 h-3.5 mr-1 text-gray-400" />
          Unidad organizacional
        </label>
        <select
          value={selectedUnit}
          onChange={e => handleUnitChange(e.target.value)}
          className="input"
        >
          <option value="">Seleccionar unidad...</option>
          {unitsWithUsers.map(un => (
            <option key={un.id} value={un.name}>{un.name}</option>
          ))}
          {hasUsersWithNoUnit && (
            <option value="__none__">Sin unidad asignada</option>
          )}
        </select>
      </div>

      {/* Step 2 — User (only shown once a unit is picked) */}
      {selectedUnit && (
        <div>
          <label className="label">Usuario</label>
          {filteredUsers.length === 0 ? (
            <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/40 rounded-lg">
              <Users className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <p className="text-sm text-amber-700 dark:text-amber-300">
                No hay usuarios disponibles en esta unidad.
              </p>
            </div>
          ) : (
            <select
              value={userId}
              onChange={e => setUserId(e.target.value)}
              className="input"
              autoFocus
            >
              <option value="">Seleccionar usuario...</option>
              {filteredUsers.map(u => (
                <option key={u.id} value={u.id}>{u.name} — {u.email}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Step 3 — Role (only shown once a user is picked) */}
      {userId && (
        <div>
          <label className="label">Rol en el proyecto</label>
          <select value={role} onChange={e => setRole(e.target.value)} className="input">
            <option value="coordinator">Coordinador</option>
            <option value="member">Miembro</option>
          </select>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <button className="btn-secondary flex-1" onClick={onClose}>Cancelar</button>
        <button
          className="btn-primary flex-1"
          disabled={!userId}
          onClick={handleSubmit}
        >
          Agregar
        </button>
      </div>
    </div>
  );
}
