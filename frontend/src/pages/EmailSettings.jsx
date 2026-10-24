import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-toastify';
import { settingsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  Mail, CheckCircle2, AlertTriangle, Send, Unplug, RefreshCw, KeyRound, Clock, XCircle,
} from 'lucide-react';

const fmtFecha = (v) => (v ? new Date(v).toLocaleString('es-SV', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

export default function EmailSettings() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [estado, setEstado]   = useState(null);
  const [error, setError]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [ocupado, setOcupado] = useState(null); // acción en curso
  const [form, setForm]       = useState({ nombre: '', remitente: '' });
  const [destinoPrueba, setDestinoPrueba] = useState(user?.email || '');

  const cargar = async () => {
    try {
      const { data } = await settingsAPI.getEmail();
      setEstado(data);
      setForm({ nombre: data.nombre || '', remitente: data.remitente || '' });
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo cargar la configuración de correo');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { cargar(); }, []);

  // Resultado de la vuelta desde Google
  useEffect(() => {
    const resultado = params.get('resultado');
    if (!resultado) return;
    if (resultado === 'conectado') toast.success(`Cuenta conectada: ${params.get('cuenta')}`);
    else toast.error(params.get('detalle') || 'No se pudo conectar la cuenta', { autoClose: 8000 });
    setParams({}, { replace: true });
  }, [params, setParams]);

  const accion = async (nombre, fn) => {
    setOcupado(nombre);
    try { await fn(); } finally { setOcupado(null); }
  };

  const conectar = () => accion('conectar', async () => {
    try {
      const { data } = await settingsAPI.connectEmail();
      window.location.href = data.url; // Google pide iniciar sesión y vuelve a esta pantalla
    } catch (err) {
      toast.error(err.response?.data?.message || 'No se pudo iniciar la conexión');
    }
  });

  const desconectar = () => accion('desconectar', async () => {
    if (!confirm(`¿Desconectar ${estado.cuenta}?\n\nDejarán de enviarse correos hasta que se conecte otra cuenta.`)) return;
    try {
      await settingsAPI.disconnectEmail();
      toast.success('Cuenta desconectada');
      await cargar();
    } catch {
      toast.error('No se pudo desconectar la cuenta');
    }
  });

  const guardar = () => accion('guardar', async () => {
    try {
      await settingsAPI.updateEmail({ nombre: form.nombre, remitente: form.remitente });
      toast.success('Remitente guardado');
      await cargar();
    } catch (err) {
      toast.error(err.response?.data?.message || 'No se pudo guardar');
    }
  });

  const alternarEnvio = () => accion('activar', async () => {
    try {
      await settingsAPI.updateEmail({ activo: !estado.activo });
      toast.success(estado.activo ? 'Envío de correos pausado' : 'Envío de correos activado');
      await cargar();
    } catch {
      toast.error('No se pudo cambiar el estado del envío');
    }
  });

  const probar = () => accion('probar', async () => {
    try {
      const { data } = await settingsAPI.testEmail(destinoPrueba);
      toast.success(data.message);
    } catch (err) {
      toast.error(err.response?.data?.message || 'No se pudo enviar el correo de prueba', { autoClose: 8000 });
    }
    await cargar();
  });

  const reintentar = () => accion('reintentar', async () => {
    try {
      const { data } = await settingsAPI.retryEmails();
      toast.success(data.message);
      await cargar();
    } catch {
      toast.error('No se pudieron reintentar los correos');
    }
  });

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-8 h-8 border-4 border-primary-600 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error) return (
    <div className="max-w-3xl space-y-4 animate-fade-in">
      <Encabezado />
      <div className="card p-5 flex items-start gap-3 border-amber-200 dark:border-amber-700/40">
        <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-gray-700 dark:text-gray-300">{error}</p>
      </div>
    </div>
  );

  const aliasDistinto = estado.conectado && estado.remitente && estado.remitente !== estado.cuenta;

  return (
    <div className="max-w-3xl space-y-5 animate-fade-in">
      <Encabezado />

      {/* Credenciales del servidor */}
      {!estado.cliente_configurado && (
        <div className="card p-5 space-y-2 border-amber-200 dark:border-amber-700/40">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-amber-500" />
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Faltan las credenciales de Google en el servidor</h2>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Antes de conectar una cuenta hay que crear un cliente OAuth de tipo <b>Aplicación web</b> en el
            proyecto de Google Cloud y poner su JSON en las variables del servidor.
          </p>
          <ul className="text-sm space-y-1">
            <Requisito ok={estado.cliente.client_id}     texto="ID de cliente (GOOGLE_OAUTH_CLIENT_JSON)" />
            <Requisito ok={estado.cliente.client_secret} texto="Secreto del cliente (GOOGLE_OAUTH_CLIENT_JSON)" />
            <Requisito ok={!!estado.cliente.redirect_uri} texto="URI de redirección (GOOGLE_OAUTH_REDIRECT_URI)" />
          </ul>
        </div>
      )}

      {/* Cuenta conectada */}
      <div className="card p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Cuenta que envía los correos</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Usa una cuenta institucional del sistema, no la de una persona: si esa persona se va,
              las notificaciones dejarían de salir.
            </p>
          </div>
          {estado.conectado && (
            <span className={`badge ${estado.activo
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
              {estado.activo ? 'Enviando' : 'En pausa'}
            </span>
          )}
        </div>

        {estado.conectado ? (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
            <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{estado.cuenta}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">Conectada el {fmtFecha(estado.conectado_en)}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No hay una cuenta conectada. Mientras tanto, las notificaciones solo aparecen dentro del sistema
            y la recuperación de contraseña no puede enviar el enlace.
          </p>
        )}

        {estado.ultimo_error && (
          <div className="flex items-start gap-2 p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
            <XCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-300">{estado.ultimo_error}</p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={conectar}
            disabled={!estado.cliente_configurado || !!ocupado}
            className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Mail className="w-4 h-4" />
            {estado.conectado ? 'Cambiar de cuenta' : 'Conectar cuenta de Google'}
          </button>
          {estado.conectado && (
            <>
              <button onClick={alternarEnvio} disabled={!!ocupado} className="btn-secondary text-sm">
                {estado.activo ? 'Pausar envío' : 'Reanudar envío'}
              </button>
              <button onClick={desconectar} disabled={!!ocupado} className="btn-secondary text-sm text-red-600 dark:text-red-400">
                <Unplug className="w-4 h-4" /> Desconectar
              </button>
            </>
          )}
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Al conectar, Google pedirá iniciar sesión con la cuenta y autorizar solo el envío de correos.
          El sistema no puede leer su bandeja de entrada.
        </p>
      </div>

      {/* Remitente */}
      {estado.conectado && (
        <div className="card p-5 space-y-4">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Cómo aparece el remitente</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Nombre</label>
              <input className="input" value={form.nombre} maxLength={100}
                onChange={e => setForm({ ...form, nombre: e.target.value })} />
            </div>
            <div>
              <label className="label">Dirección</label>
              <input className="input" type="email" value={form.remitente}
                onChange={e => setForm({ ...form, remitente: e.target.value })} />
            </div>
          </div>
          {aliasDistinto && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Para enviar como <b>{estado.remitente}</b>, esa dirección debe estar configurada en
              <b> {estado.cuenta}</b> como "Enviar como" en la configuración de Gmail. Si no lo está,
              Gmail enviará desde {estado.cuenta}.
            </p>
          )}
          <div className="flex justify-end">
            <button onClick={guardar} disabled={!!ocupado} className="btn-primary text-sm">Guardar</button>
          </div>
        </div>
      )}

      {/* Prueba */}
      {estado.conectado && (
        <div className="card p-5 space-y-3">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Enviar un correo de prueba</h2>
          <div className="flex gap-2 flex-wrap">
            <input className="input flex-1 min-w-56" type="email" value={destinoPrueba}
              onChange={e => setDestinoPrueba(e.target.value)} />
            <button onClick={probar} disabled={!!ocupado || !destinoPrueba} className="btn-secondary text-sm">
              {ocupado === 'probar'
                ? <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                : <Send className="w-4 h-4" />}
              Enviar prueba
            </button>
          </div>
        </div>
      )}

      {/* Cola */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Envíos</h2>
          {estado.cola.fallidos_7d > 0 && (
            <button onClick={reintentar} disabled={!!ocupado || !estado.conectado} className="btn-secondary text-xs py-1.5 px-3">
              <RefreshCw className="w-3.5 h-3.5" /> Reintentar fallidos
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Indicador icono={Clock}        valor={estado.cola.pendientes}   etiqueta="En cola" />
          <Indicador icono={CheckCircle2} valor={estado.cola.enviados_24h} etiqueta="Enviados (24 h)" />
          <Indicador icono={XCircle}      valor={estado.cola.fallidos_7d}  etiqueta="Fallidos (7 días)" alerta={estado.cola.fallidos_7d > 0} />
        </div>

        {estado.cola.fallidos.length > 0 && (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-700">
                  <th className="py-2 px-2 font-medium">Para</th>
                  <th className="py-2 px-2 font-medium">Asunto</th>
                  <th className="py-2 px-2 font-medium">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {estado.cola.fallidos.map(f => (
                  <tr key={f.id} className="border-b border-gray-50 dark:border-gray-800 align-top">
                    <td className="py-2 px-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">{f.to_email}</td>
                    <td className="py-2 px-2 text-gray-600 dark:text-gray-400">{f.subject}</td>
                    <td className="py-2 px-2 text-xs text-red-600 dark:text-red-400">{f.last_error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Encabezado() {
  return (
    <div>
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
        <Mail className="w-5 h-5 text-primary-500" /> Correo del sistema
      </h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
        La cuenta de Google desde la que salen las notificaciones de tareas, proyectos y recuperación de contraseña.
      </p>
    </div>
  );
}

function Requisito({ ok, texto }) {
  return (
    <li className="flex items-center gap-2">
      {ok
        ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
        : <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
      <span className={ok ? 'text-gray-600 dark:text-gray-400' : 'text-gray-800 dark:text-gray-200'}>{texto}</span>
    </li>
  );
}

function Indicador({ icono: Icono, valor, etiqueta, alerta }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center">
      <Icono className={`w-4 h-4 mx-auto mb-1 ${alerta ? 'text-red-500' : 'text-gray-400'}`} />
      <p className={`text-xl font-bold tabular-nums ${alerta ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>{valor}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{etiqueta}</p>
    </div>
  );
}
