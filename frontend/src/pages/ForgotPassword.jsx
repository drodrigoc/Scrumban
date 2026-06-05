import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import { authAPI } from '../services/api';
import { ArrowLeft, Mail } from 'lucide-react';
import logo from '../assets/logousocompleto.png';

export default function ForgotPassword() {
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-900 via-primary-800 to-primary-600 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <img src={logo} alt="USO Projects" className="h-16 w-auto object-contain drop-shadow-lg" />
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 border border-transparent dark:border-gray-700">
          {sent ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <Mail className="w-8 h-8 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Revisa tu correo</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Si el correo existe, recibirás instrucciones para restablecer tu contraseña.
              </p>
              <Link to="/login" className="btn-primary w-full justify-center">Volver al inicio de sesión</Link>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-1">Recuperar contraseña</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Ingresa tu email y te enviaremos instrucciones.</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="label">Correo electrónico</label>
                  <input type="email" className="input" placeholder="tu@email.com" value={email} onChange={e => setEmail(e.target.value)} required />
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full justify-center py-2.5">
                  {loading
                    ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : 'Enviar instrucciones'
                  }
                </button>
              </form>
              <div className="mt-4 text-center">
                <Link to="/login" className="flex items-center justify-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                  <ArrowLeft className="w-3.5 h-3.5" /> Volver al inicio de sesión
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
