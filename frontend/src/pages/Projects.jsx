import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { projectsAPI, usersAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Plus, Search, FolderKanban, Calendar, Users, MoreVertical, Edit, Trash2, Archive, ArchiveRestore } from 'lucide-react';
import Modal from '../components/common/Modal';
import ProjectForm from '../components/projects/ProjectForm';
import { useArchivoProyecto } from '../components/projects/AccionesArchivo';
import { diaLocal } from '../utils/fechas';

const statusConfig = {
  active:    { label: 'Activo',     color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  paused:    { label: 'Pausado',    color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  completed: { label: 'Completado', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  cancelled: { label: 'Cancelado',  color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

export default function Projects() {
  const { user } = useAuth();
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [openMenu, setOpenMenu] = useState(null);
  const [verArchivados, setVerArchivados] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([projectsAPI.getAll(verArchivados), usersAPI.getAll()])
      .then(([p, u]) => { setProjects(p.data); setUsers(u.data); })
      .catch(() => toast.error('Error al cargar proyectos'))
      .finally(() => setLoading(false));
  }, [verArchivados]);

  // El menú se cierra al hacer clic fuera de él
  useEffect(() => {
    if (openMenu === null) return;
    const cerrar = () => setOpenMenu(null);
    document.addEventListener('click', cerrar);
    return () => document.removeEventListener('click', cerrar);
  }, [openMenu]);

  // Archivar, restaurar o eliminar sacan el proyecto de la vista actual
  const quitarDeLaLista = (p) => setProjects(prev => prev.filter(x => x.id !== p.id));
  const archivo = useArchivoProyecto({
    onArchivado: quitarDeLaLista, onRestaurado: quitarDeLaLista, onEliminado: quitarDeLaLista,
  });

  const handleSave = async (data) => {
    try {
      if (editing) {
        const { data: updated } = await projectsAPI.update(editing.id, data);
        setProjects(prev => prev.map(p => p.id === editing.id ? { ...p, ...updated } : p));
        toast.success('Proyecto actualizado');
      } else {
        const { data: created } = await projectsAPI.create(data);
        setProjects(prev => [created, ...prev]);
        toast.success('Proyecto creado');
      }
      setShowModal(false);
      setEditing(null);
    } catch (err) {
      // Si el servidor dice qué campo corregir, el formulario lo muestra
      // junto al campo; si no, se avisa aquí
      if (!err.response?.data?.campo) {
        toast.error(err.response?.data?.message || 'No se pudo guardar el proyecto. Intenta de nuevo.');
      }
      throw err;
    }
  };

  const filtered = projects.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || p.status === filterStatus;
    return matchSearch && matchStatus;
  });

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Proyectos</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {projects.length} {verArchivados ? 'archivados' : 'proyectos activos'}
          </p>
        </div>
        {!verArchivados && (user?.role === 'admin' || user?.role === 'coordinator') && (
          <button onClick={() => { setEditing(null); setShowModal(true); }} className="btn-primary">
            <Plus className="w-4 h-4" /> Nuevo Proyecto
          </button>
        )}
      </div>

      <div className="flex border-b border-gray-200 dark:border-gray-700 gap-1">
        {[{ id: false, label: 'Activos' }, { id: true, label: 'Archivados' }].map(t => (
          <button
            key={t.label}
            onClick={() => { setVerArchivados(t.id); setOpenMenu(null); }}
            className={`pb-2.5 px-4 text-sm font-medium border-b-2 transition-colors ${
              verArchivados === t.id
                ? 'border-primary-600 text-primary-600 dark:text-primary-400 dark:border-primary-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input type="text" placeholder="Buscar proyectos..." value={search} onChange={e => setSearch(e.target.value)} className="input pl-9" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="input w-auto">
          <option value="all">Todos los estados</option>
          <option value="active">Activo</option>
          <option value="paused">Pausado</option>
          <option value="completed">Completado</option>
          <option value="cancelled">Cancelado</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <FolderKanban className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 font-medium">No hay proyectos</p>
          <p className="text-sm text-gray-400 dark:text-gray-500">
            {verArchivados
              ? 'Aquí aparecen los proyectos archivados.'
              : 'Crea el primero haciendo clic en "Nuevo Proyecto"'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(p => {
            const st = statusConfig[p.status] || statusConfig.active;
            const progress = p.progress ?? 0;
            return (
              <div key={p.id} className="card p-5 hover:shadow-md dark:hover:shadow-gray-900/50 transition-shadow group relative">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">{p.name}</h3>
                  </div>
                  <div className="relative z-10 flex items-center gap-1 ml-2 flex-shrink-0">
                    <span className={`badge ${st.color}`}>{st.label}</span>
                    {(p.puede_editar || p.puede_archivar) && (
                      <div className="relative">
                        <button
                          onClick={e => { e.stopPropagation(); e.preventDefault(); setOpenMenu(openMenu === p.id ? null : p.id); }}
                          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                          aria-label="Opciones del proyecto" aria-expanded={openMenu === p.id}
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                        {openMenu === p.id && (
                          <div className="absolute right-0 top-full mt-1 w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg dark:shadow-gray-900/50 z-20 py-1">
                            {p.puede_editar && (
                              <button
                                onClick={() => { setEditing(p); setShowModal(true); setOpenMenu(null); }}
                                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                              >
                                <Edit className="w-3.5 h-3.5" /> Editar
                              </button>
                            )}
                            {p.puede_archivar && !p.archived_at && (
                              <button
                                onClick={() => { setOpenMenu(null); archivo.archivar(p); }}
                                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                              >
                                <Archive className="w-3.5 h-3.5" /> Archivar
                              </button>
                            )}
                            {p.puede_archivar && p.archived_at && (
                              <button
                                onClick={() => { setOpenMenu(null); archivo.restaurar(p); }}
                                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                              >
                                <ArchiveRestore className="w-3.5 h-3.5" /> Restaurar
                              </button>
                            )}
                            {p.puede_eliminar && (
                              <button
                                onClick={() => { setOpenMenu(null); archivo.eliminar(p); }}
                                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> Eliminar
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {p.archived_at && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-2 flex items-center gap-1">
                    <Archive className="w-3 h-3" />
                    Archivado el {new Date(p.archived_at).toLocaleDateString('es-SV', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {p.archived_by_name ? ` por ${p.archived_by_name}` : ''}
                  </p>
                )}

                {p.description && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">{p.description}</p>
                )}

                <div className="mb-3">
                  <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                    <span>Progreso</span>
                    <span className="font-medium">{progress}%</span>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2">
                    <div className="h-2 rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: p.color }} />
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-gray-400 dark:text-gray-500">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {p.member_count || 0}</span>
                    <span className="flex items-center gap-1"><FolderKanban className="w-3 h-3" /> {p.total_tasks || 0} tareas</span>
                  </div>
                  {p.end_date && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {diaLocal(p.end_date).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
                    </span>
                  )}
                </div>

                <Link to={`/projects/${p.id}`} className="absolute inset-0 rounded-xl"
                  onClick={e => openMenu === p.id && e.preventDefault()} />
              </div>
            );
          })}
        </div>
      )}

      {archivo.modal}

      {showModal && (
        <Modal title={editing ? 'Editar Proyecto' : 'Nuevo Proyecto'} onClose={() => { setShowModal(false); setEditing(null); }}>
          <ProjectForm project={editing} users={users} onSave={handleSave} onCancel={() => { setShowModal(false); setEditing(null); }} />
        </Modal>
      )}
    </div>
  );
}
