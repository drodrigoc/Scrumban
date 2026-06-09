import { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { usersAPI, unitsAPI } from '../services/api';
import { Plus, Search, Edit, UserX, UserCheck, Key, Building2 } from 'lucide-react';
import Modal from '../components/common/Modal';

export const roleConfig = {
  admin:       { label: 'Administrador', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
  coordinator: { label: 'Coordinador',   color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
  member:      { label: 'Miembro',       color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  superViewer: { label: 'Super Visor',   color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
};

export default function Users() {
  const [users, setUsers]           = useState([]);
  const [units, setUnits]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [filterUnit, setFilterUnit] = useState('all');
  const [showModal, setShowModal]   = useState(false);
  const [showPassModal, setShowPassModal] = useState(false);
  const [editing, setEditing]       = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);

  useEffect(() => {
    Promise.all([usersAPI.getAll(), unitsAPI.getAll()])
      .then(([u, un]) => { setUsers(u.data); setUnits(un.data); })
      .catch(() => toast.error('Error al cargar datos'))
      .finally(() => setLoading(false));
  }, []);

  const unitNames = units.map(u => u.name);

  const handleSave = async (data) => {
    try {
      if (editing) {
        const { data: updated } = await usersAPI.update(editing.id, data);
        setUsers(prev => prev.map(u => u.id === editing.id ? { ...u, ...updated } : u));
        toast.success('Usuario actualizado');
      } else {
        const { data: created } = await usersAPI.create(data);
        setUsers(prev => [...prev, created]);
        toast.success('Usuario creado');
      }
      setShowModal(false);
      setEditing(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error al guardar');
    }
  };

  const handleToggle = async (user) => {
    try {
      const { data: updated } = await usersAPI.toggleStatus(user.id);
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, is_active: updated.is_active } : u));
      toast.success(`Usuario ${updated.is_active ? 'habilitado' : 'deshabilitado'}`);
    } catch {
      toast.error('Error al cambiar estado');
    }
  };

  const handleResetPassword = async (userId, newPassword) => {
    try {
      await usersAPI.resetPassword(userId, newPassword);
      toast.success('Contraseña restablecida');
      setShowPassModal(false);
      setSelectedUser(null);
    } catch {
      toast.error('Error al restablecer contraseña');
    }
  };

  const filtered = users.filter(u => {
    const matchSearch = u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase());
    const matchRole = filterRole === 'all' || u.role === filterRole;
    const matchUnit = filterUnit === 'all' || u.unit === filterUnit;
    return matchSearch && matchRole && matchUnit;
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Control de Accesos</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{users.length} usuarios registrados</p>
        </div>
        <button onClick={() => { setEditing(null); setShowModal(true); }} className="btn-primary">
          <Plus className="w-4 h-4" /> Nuevo Usuario
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text" placeholder="Buscar usuarios..."
            value={search} onChange={e => setSearch(e.target.value)}
            className="input pl-9"
          />
        </div>
        <select value={filterRole} onChange={e => setFilterRole(e.target.value)} className="input w-auto">
          <option value="all">Todos los roles</option>
          <option value="admin">Administrador</option>
          <option value="coordinator">Coordinador</option>
          <option value="member">Miembro</option>
          <option value="superViewer">Super Visor</option>
        </select>
<select value={filterUnit} onChange={e => setFilterUnit(e.target.value)} className="input w-auto">
          <option value="all">Todas las unidades</option>
          {unitNames.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">Usuario</th>
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">Unidad</th>
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">Rol</th>
                <th className="text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">Estado</th>
                <th className="text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {filtered.length === 0 ? (
                <tr><td colSpan={5} className="text-center text-gray-400 dark:text-gray-500 py-8">No hay usuarios</td></tr>
              ) : filtered.map(u => {
                const roleInfo = roleConfig[u.role] || roleConfig.member;
                return (
                  <tr key={u.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center text-primary-700 dark:text-primary-300 font-semibold text-sm flex-shrink-0">
                          {u.name?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-gray-800 dark:text-gray-200">{u.name}</p>
                          <p className="text-xs text-gray-400 dark:text-gray-500">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {u.unit ? (
                        <span className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400">
                          <Building2 className="w-3.5 h-3.5 text-gray-400" />{u.unit}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${roleInfo.color}`}>{roleInfo.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`badge ${u.is_active
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                      }`}>
                        {u.is_active ? 'Activo' : 'Deshabilitado'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => { setEditing(u); setShowModal(true); }}
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => { setSelectedUser(u); setShowPassModal(true); }}
                          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-amber-500 dark:hover:text-amber-400"
                          title="Restablecer contraseña"
                        >
                          <Key className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleToggle(u)}
                          className={`p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 ${
                            u.is_active
                              ? 'text-gray-400 hover:text-red-500 dark:hover:text-red-400'
                              : 'text-gray-400 hover:text-green-500 dark:hover:text-green-400'
                          }`}
                          title={u.is_active ? 'Deshabilitar' : 'Habilitar'}
                        >
                          {u.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <Modal
          title={editing ? 'Editar Usuario' : 'Nuevo Usuario'}
          onClose={() => { setShowModal(false); setEditing(null); }}
          size="sm"
        >
          <UserForm user={editing} units={units} onSave={handleSave} onCancel={() => { setShowModal(false); setEditing(null); }} />
        </Modal>
      )}

      {showPassModal && selectedUser && (
        <Modal title="Restablecer Contraseña" onClose={() => { setShowPassModal(false); setSelectedUser(null); }} size="sm">
          <ResetPasswordForm user={selectedUser} onSave={handleResetPassword} onCancel={() => { setShowPassModal(false); setSelectedUser(null); }} />
        </Modal>
      )}
    </div>
  );
}

export function UserForm({ user, units = [], onSave, onCancel }) {
  const [form, setForm] = useState({
    name:     user?.name  || '',
    email:    user?.email || '',
    password: '',
    role:     user?.role  || 'member',
    unit:     user?.unit  || '',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = { ...form, unit: form.unit || null };
      if (!data.password && user) delete data.password;
      await onSave(data);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">Nombre completo</label>
        <input type="text" className="input" value={form.name}
          onChange={e => setForm({ ...form, name: e.target.value })} required autoFocus />
      </div>
      <div>
        <label className="label">Correo electrónico</label>
        <input type="email" className="input" value={form.email}
          onChange={e => setForm({ ...form, email: e.target.value })} required />
      </div>
      {!user && (
        <div>
          <label className="label">Contraseña</label>
          <input type="password" className="input" value={form.password}
            onChange={e => setForm({ ...form, password: e.target.value })} required minLength={8} />
        </div>
      )}
      <div>
        <label className="label">Rol</label>
        <select className="input" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
          <option value="admin">Administrador</option>
          <option value="coordinator">Coordinador</option>
          <option value="member">Miembro</option>
          <option value="superViewer">Super Visor</option>
        </select>
      </div>
      <div>
        <label className="label flex items-center justify-between">
          <span>Unidad</span>
          {units.length === 0 && (
            <a href="/units" className="text-xs text-primary-600 dark:text-primary-400 hover:underline font-normal">
              Gestionar unidades →
            </a>
          )}
        </label>
        {units.length > 0 ? (
          <select
            className="input"
            value={form.unit}
            onChange={e => setForm({ ...form, unit: e.target.value })}
          >
            <option value="">— Sin unidad —</option>
            {units.map(u => (
              <option key={u.id} value={u.name}>{u.name}</option>
            ))}
          </select>
        ) : (
          <div className="input bg-gray-50 dark:bg-gray-800/50 text-gray-400 dark:text-gray-500 text-sm cursor-default">
            No hay unidades creadas aún
          </div>
        )}
      </div>
      <div className="flex gap-2 pt-1">
        <button type="button" className="btn-secondary flex-1" onClick={onCancel}>Cancelar</button>
        <button type="submit" disabled={saving} className="btn-primary flex-1">
          {saving
            ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : user ? 'Actualizar' : 'Crear Usuario'
          }
        </button>
      </div>
    </form>
  );
}

function ResetPasswordForm({ user, onSave, onCancel }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (password !== confirm) { toast.error('Las contraseñas no coinciden'); return; }
    onSave(user.id, password);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Restablecer contraseña para <strong className="text-gray-700 dark:text-gray-300">{user.name}</strong>
      </p>
      <div>
        <label className="label">Nueva contraseña</label>
        <input type="password" className="input" value={password}
          onChange={e => setPassword(e.target.value)} required minLength={8} />
      </div>
      <div>
        <label className="label">Confirmar contraseña</label>
        <input type="password" className="input" value={confirm}
          onChange={e => setConfirm(e.target.value)} required />
      </div>
      <div className="flex gap-2 pt-2">
        <button type="button" className="btn-secondary flex-1" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn-primary flex-1">Restablecer</button>
      </div>
    </form>
  );
}
