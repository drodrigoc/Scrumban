import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import { projectsAPI, usersAPI, unitsAPI, poaAPI } from '../services/api';
import { Kanban, CalendarDays, GanttChartSquare, List, Archive, ArchiveRestore, ArrowLeft, Edit, Users, Plus, Trash2, Building2, UserCog, Lock, Unlock, Wallet } from 'lucide-react';
import Modal from '../components/common/Modal';
import ProjectForm from '../components/projects/ProjectForm';
import BudgetPanel from '../components/projects/BudgetPanel';
import PhasesPanel from '../components/projects/PhasesPanel';
import AlineacionPanel from '../components/projects/AlineacionPanel';
import { useAuth } from '../context/AuthContext';
import { useArchivoProyecto } from '../components/projects/AccionesArchivo';
import { separarObjetivos } from '../utils/objetivos';

const ROL_PROYECTO = { coordinator: 'Coordinador', member: 'Miembro', viewer: 'Visor' };
// Roles del sistema que ya ven los costos fijos (no necesitan que se los deleguen)
const ROLES_VEN_FIJOS = ['admin', 'coordinator', 'superViewer'];

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

  // Tras archivar o restaurar se recarga: cambia lo que se puede hacer
  const recargar = () => projectsAPI.getById(id).then(({ data }) => setProject(data)).catch(() => {});
  const archivo = useArchivoProyecto({
    onArchivado: recargar,
    onRestaurado: recargar,
    onEliminado: () => navigate('/projects'),
  });

  const handleUpdate = async (data) => {
    try {
      const { data: updated } = await projectsAPI.update(id, data);
      setProject(prev => ({ ...prev, ...updated }));
      setShowEditModal(false);
      toast.success('Proyecto actualizado');
    } catch (err) {
      if (!err.response?.data?.campo) {
        toast.error(err.response?.data?.message || 'No se pudo actualizar el proyecto. Intenta de nuevo.');
      }
      throw err; // el formulario muestra el error junto al campo
    }
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
        // Si deja de ser coordinador, pierde los costos fijos delegados
        members: prev.members.map(m => m.id === userId
          ? { ...m, project_role: newRole, ver_costos_fijos: newRole === 'coordinator' ? m.ver_costos_fijos : false }
          : m),
      }));
      setEditingRoleId(null);
      toast.success('Rol actualizado');
    } catch { toast.error('Error al actualizar rol'); }
  };

  // El administrador o el coordinador del sistema permiten que un
  // coordinador del proyecto vea y maneje los costos fijos
  const handleCostosFijos = async (m) => {
    const habilitar = !m.ver_costos_fijos;
    if (habilitar && !confirm(`¿Permitir que ${m.name} vea y maneje los costos fijos (salarios y prestaciones) de este proyecto?`)) return;
    try {
      await projectsAPI.delegarCostosFijos(id, m.id, habilitar);
      setProject(prev => ({
        ...prev,
        members: prev.members.map(x => x.id === m.id ? { ...x, ver_costos_fijos: habilitar } : x),
      }));
      toast.success(habilitar ? `${m.name} ya puede ver los costos fijos` : `${m.name} ya no ve los costos fijos`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'No se pudo cambiar el acceso a los costos fijos');
    }
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
  const completedTasks = taskStats.find(s => s.status === 'completed')?.count || 0;
  const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
  // Editar el proyecto, sus miembros, presupuesto y fases: lo decide el
  // servidor según el rol en el proyecto (mi_acceso.gestion)
  const canEdit = Boolean(project.mi_acceso?.gestion);
  // Planificación (datos, alineación, cronograma, partidas): se cierra si la
  // administración bloqueó este proyecto POA. El administrador puede siempre.
  const canPlan   = Boolean(project.mi_acceso?.planificacion);
  const bloqueado = Boolean(project.mi_acceso?.bloqueado);
  const esAdmin   = user?.role === 'admin';
  const puedeBloquear = esAdmin && Boolean(project.es_poa) && !project.archived_at;

  const cambiarBloqueo = async (bloquear) => {
    if (bloquear && !confirm('¿Bloquear la planificación de este proyecto POA?\n\n'
      + 'Su dueño y sus coordinadores ya no podrán cambiar los datos, la alineación estratégica, '
      + 'el cronograma ni las partidas del presupuesto. Las tareas y la ejecución siguen abiertas.')) return;
    try {
      await poaAPI.bloqueo(project.id, bloquear);
      await recargar();
      toast.success(bloquear ? 'Planificación bloqueada' : 'Planificación desbloqueada');
    } catch (err) {
      toast.error(err.response?.data?.message || 'No se pudo cambiar el bloqueo');
    }
  };

  const views = [
    { to: `/projects/${id}/backlog`,   icon: List,             label: 'Backlog' },
    { to: `/projects/${id}/kanban`,    icon: Kanban,           label: 'Tablero Kanban' },
    { to: `/projects/${id}/calendar`,  icon: CalendarDays,     label: 'Calendario' },
    { to: `/projects/${id}/gantt`,     icon: GanttChartSquare, label: 'Cronograma' },
    { to: `/projects/${id}/archive`,   icon: Archive,          label: 'Archivo' },
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
              {/* El bloqueo se indica con un candado en la etiqueta, sin aviso
                  grande: el detalle aparece al pasar el mouse */}
              {Boolean(project.es_poa) && (
                <span
                  className="badge bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 inline-flex items-center gap-1"
                  title={bloqueado
                    ? ['Planificación bloqueada',
                        project.bloqueo?.bloqueada_at && `el ${new Date(project.bloqueo.bloqueada_at).toLocaleDateString('es-SV', { day: 'numeric', month: 'long', year: 'numeric' })}`,
                        project.bloqueo?.bloqueada_por_nombre && `por ${project.bloqueo.bloqueada_por_nombre}`,
                      ].filter(Boolean).join(' ')
                    : 'Viene del POA'}
                >
                  {bloqueado && <Lock className="w-3 h-3" />}POA
                </span>
              )}
            </div>
            {project.description && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-2xl">{project.description}</p>
            )}
            {Boolean(project.es_poa) && project.poa_aprobacion && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-2xl">
                <span className="font-medium">Aprobación del POA:</span> {project.poa_aprobacion}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {puedeBloquear && (bloqueado ? (
            <button onClick={() => cambiarBloqueo(false)} className="btn-secondary"
              title="Permite de nuevo cambiar la planificación de este proyecto POA">
              <Unlock className="w-4 h-4" /> Desbloquear planificación
            </button>
          ) : (
            <button onClick={() => cambiarBloqueo(true)} className="btn-secondary"
              title="Congela la planificación de este proyecto POA">
              <Lock className="w-4 h-4" /> Bloquear planificación
            </button>
          ))}
          {canEdit && (
            <button onClick={() => setShowEditModal(true)} className="btn-secondary">
              <Edit className="w-4 h-4" /> {canPlan ? 'Editar' : 'Cambiar estado'}
            </button>
          )}
        </div>
      </div>

      {project.archived_at && (
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg border border-amber-200 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-900/20">
          <Archive className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <p className="flex-1 text-sm text-amber-800 dark:text-amber-300">
            Proyecto archivado el {new Date(project.archived_at).toLocaleDateString('es-SV', { day: 'numeric', month: 'long', year: 'numeric' })}.
            Se puede consultar, pero no modificar.
          </p>
          {project.mi_acceso?.archivar && (
            <button onClick={() => archivo.restaurar(project)} className="btn-secondary text-sm py-1.5">
              <ArchiveRestore className="w-4 h-4" /> Restaurar
            </button>
          )}
        </div>
      )}

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
          { label: 'Completadas', value: completedTasks },
          { label: 'Miembros', value: project.members?.length || 0 },
        ].map(s => (
          <div key={s.label} className="card p-4 text-center">
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{s.value}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Objetivos del proyecto, numerados */}
      {separarObjetivos(project.objectives).length > 0 && (
        <div className="card p-5">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
            Objetivo{separarObjetivos(project.objectives).length === 1 ? '' : 's'} del proyecto
          </h2>
          <ol className="space-y-2">
            {separarObjetivos(project.objectives).map((o, i) => (
              <li key={i} className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
                <span className="w-6 h-6 flex-shrink-0 rounded-full bg-primary-100 dark:bg-primary-900/50 text-primary-700 dark:text-primary-300 text-xs font-semibold flex items-center justify-center">
                  {i + 1}
                </span>
                <span className="pt-0.5 leading-relaxed">{o}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Views */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">Vistas</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
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

      {/* Alineación con el Plan Estratégico Institucional: a qué actividades
          del plan responde el proyecto y si ya se cumplieron */}
      <AlineacionPanel projectId={id} canEdit={canEdit} canPlanificar={canPlan} />

      {/* Cronograma macro — fases del proyecto */}
      <PhasesPanel
        projectId={id}
        canEdit={canPlan}
        projectStart={project.start_date}
        projectEnd={project.end_date}
      />

      {/* Presupuesto: partidas, ejecutado y disponible (reemplaza al antiguo
          "Control de Gastos", que usaba un monto escrito al crear el proyecto) */}
      <BudgetPanel projectId={id} canEdit={canPlan} soloEjecucion={canEdit && !canPlan} />

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
                    <p className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1.5 flex-wrap">
                      {ROL_PROYECTO[m.project_role] || m.project_role}
                      {m.project_role === 'coordinator' && m.ver_costos_fijos && !ROLES_VEN_FIJOS.includes(m.system_role) && (
                        <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400"
                          title="Puede ver y manejar los costos fijos de este proyecto">
                          <Wallet className="w-3 h-3" /> Costos fijos
                        </span>
                      )}
                    </p>
                  )}
                </div>
              </div>
              {canEdit && m.id !== user?.id && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  {project.mi_acceso?.delegarFijos && m.project_role === 'coordinator' && !ROLES_VEN_FIJOS.includes(m.system_role) && (
                    <button
                      onClick={() => handleCostosFijos(m)}
                      title={m.ver_costos_fijos ? 'Quitar acceso a los costos fijos' : 'Permitir ver los costos fijos'}
                      aria-pressed={Boolean(m.ver_costos_fijos)}
                      className={`p-1 rounded transition-colors ${m.ver_costos_fijos
                        ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30'
                        : 'text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400'}`}
                    >
                      <Wallet className="w-3.5 h-3.5" />
                    </button>
                  )}
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

      {project.mi_acceso?.archivar && (
        <div className="card p-5 border-red-200 dark:border-red-900/50">
          <h2 className="font-semibold text-red-600 dark:text-red-400 mb-1">Zona de peligro</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Archivar saca el proyecto de la lista y lo deja de solo lectura; se puede restaurar.
            Eliminar es definitivo y solo se permite con proyectos archivados y sin pruebas SGC.
          </p>
          <div className="flex flex-wrap gap-2">
            {!project.archived_at ? (
              <button onClick={() => archivo.archivar(project)} className="btn-secondary text-sm">
                <Archive className="w-4 h-4" /> Archivar proyecto
              </button>
            ) : (
              <button onClick={() => archivo.eliminar(project)} className="btn-danger text-sm">
                <Trash2 className="w-4 h-4" /> Eliminar proyecto
              </button>
            )}
          </div>
        </div>
      )}

      {archivo.modal}

      {showEditModal && (
        <Modal title={canPlan ? 'Editar Proyecto' : 'Cambiar estado'} onClose={() => setShowEditModal(false)} size={canPlan ? 'lg' : 'md'}>
          <ProjectForm project={project} users={allUsers} soloEstado={!canPlan}
            onSave={handleUpdate} onCancel={() => setShowEditModal(false)} />
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
