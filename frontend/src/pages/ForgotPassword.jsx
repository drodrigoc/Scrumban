import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { authAPI } from '../services/api';
import { ArrowLeft, Mail, KeyRound, Eye, EyeOff } from 'lucide-react';
import logo from '../assets/logousocompleto.png';

// Una sola página con dos modos: pedir el enlace, o —si se llega desde
// el enlace del correo, con ?token=— escribir la contraseña nueva
export default function ForgotPassword() {
  const [params] = useSearchParams();
  const token = params.get('token');

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-900 via-primary-800 to-primary-600 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <img src={logo} alt="USO Projects" className="h-16 w-auto object-contain drop-shadow-lg" />
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 border border-transparent dark:border-gray-700">
          {token ? <NuevaContrasena token={token} /> : <PedirEnlace />}
        </div>
      </div>
    </div>
  );
}

function PedirEnlace() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authAPI.forgotPassword(email);
      setSent(true);
    } catch {
      toast.error('Error al procesar la solicitud');
    } finally {
      setLoading(false);
    }
  };

  if (sent) return (
    <div className="text-center">
      <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
        <Mail className="w-8 h-8 text-green-600 dark:text-green-400" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Revisa tu correo</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Si el correo está registrado, te llegará un enlace para crear una contraseña nueva. Vale por una hora.
      </p>
      <Link to="/login" className="btn-primary w-full justify-center">Volver al inicio de sesión</Link>
    </div>
  );

  return (
    <>
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">Recuperar contraseña</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Ingresa tu email y te enviaremos un enlace.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Correo electrónico</label>
          <input type="email" className="input" placeholder="tu@email.com" value={email} onChange={e => setEmail(e.target.value)} required />
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
          {loading
            ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : 'Enviar enlace'
          }
        </button>
      </form>
      <VolverLogin />
    </>
  );
}

function NuevaContrasena({ token }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({ nueva: '', confirmar: '' });
  const [ver, setVer] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.nueva.length < 8) { toast.error('La contraseña debe tener al menos 8 caracteres'); return; }
    if (form.nueva !== form.confirmar) { toast.error('Las contraseñas no coinciden'); return; }

    setLoading(true);
    try {
      await authAPI.resetPassword({ token, newPassword: form.nueva });
      toast.success('Contraseña actualizada. Ya puedes iniciar sesión.');
      navigate('/login', { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.message === 'Token inválido o expirado'
        ? 'El enlace venció o ya se usó. Pide uno nuevo.'
        : (err.response?.data?.message || 'No se pudo cambiar la contraseña'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="w-12 h-12 bg-primary-100 dark:bg-primary-900/40 rounded-full flex items-center justify-center mb-4">
        <KeyRound className="w-6 h-6 text-primary-600 dark:text-primary-400" />
      </div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">Crea una contraseña nueva</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Mínimo 8 caracteres.</p>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="label">Contraseña nueva</label>
          <div className="relative">
            <input
              type={ver ? 'text' : 'password'} className="input pr-10" autoComplete="new-password"
              value={form.nueva} onChange={e => setForm({ ...form, nueva: e.target.value })} required
            />
            <button type="button" onClick={() => setVer(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
              {ver ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
        <div>
          <label className="label">Repite la contraseña</label>
          <input
            type={ver ? 'text' : 'password'} className="input" autoComplete="new-password"
            value={form.confirmar} onChange={e => setForm({ ...form, confirmar: e.target.value })} required
          />
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
          {loading
            ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : 'Guardar contraseña'
          }
        </button>
      </form>
      <div className="mt-4 text-center">
        <Link to="/forgot-password" className="text-sm text-primary-600 dark:text-primary-400 hover:underline">
          Pedir un enlace nuevo
        </Link>
      </div>
    </>
  );
}

function VolverLogin() {
  return (
    <div className="mt-4 text-center">
      <Link to="/login" className="flex items-center justify-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
        <ArrowLeft className="w-3.5 h-3.5" /> Volver al inicio de sesión
      </Link>
    </div>
  );
}
