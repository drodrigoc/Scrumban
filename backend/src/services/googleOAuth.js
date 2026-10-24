/**
 * Autorización OAuth 2.0 de Google para la cuenta de correo del sistema.
 *
 * Usa el cliente OAuth creado en el proyecto de Google Cloud (el JSON que
 * se descarga al crear un "ID de cliente de OAuth" de tipo aplicación web).
 * Un administrador inicia sesión una vez con la cuenta que enviará los
 * correos; Google entrega un refresh token que permite enviar en nombre
 * de esa cuenta y de ninguna otra.
 *
 * A diferencia de la cuenta de servicio con delegación de dominio, este
 * permiso no alcanza al resto de las cuentas de la institución.
 */

const AUTH_URL   = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL  = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';

// gmail.send permite enviar, no leer el buzón. openid + email sirven para
// saber qué cuenta se conectó.
const SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/gmail.send'];

// Acepta el JSON completo del cliente (GOOGLE_OAUTH_CLIENT_JSON) o las
// dos variables sueltas.
function leerCliente() {
  let clientId     = process.env.GOOGLE_OAUTH_CLIENT_ID;
  let clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  let redirectUri  = process.env.GOOGLE_OAUTH_REDIRECT_URI;

  if (process.env.GOOGLE_OAUTH_CLIENT_JSON) {
    try {
      const json = JSON.parse(process.env.GOOGLE_OAUTH_CLIENT_JSON);
      const datos = json.web || json.installed || json;
      clientId     = clientId     || datos.client_id;
      clientSecret = clientSecret || datos.client_secret;
      redirectUri  = redirectUri  || datos.redirect_uris?.[0];
    } catch {
      // JSON mal pegado: se reporta como "no configurado" en la pantalla
    }
  }

  return { clientId, clientSecret, redirectUri };
}

function estaConfigurado() {
  const { clientId, clientSecret, redirectUri } = leerCliente();
  return Boolean(clientId && clientSecret && redirectUri);
}

// Para la pantalla de configuración: qué falta, sin exponer secretos
function diagnostico() {
  const { clientId, clientSecret, redirectUri } = leerCliente();
  return {
    client_id:    Boolean(clientId),
    client_secret: Boolean(clientSecret),
    redirect_uri: redirectUri || null,
  };
}

function urlAutorizacion(state) {
  const { clientId, redirectUri } = leerCliente();
  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         SCOPES.join(' '),
    access_type:   'offline',   // para recibir refresh token
    prompt:        'consent',   // fuerza a Google a entregarlo aunque ya se haya autorizado antes
    state,
  });
  return `${AUTH_URL}?${params}`;
}

async function pedirToken(parametros) {
  const { clientId, clientSecret } = leerCliente();
  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, ...parametros }),
  });
  const data = await res.json();
  if (!res.ok) {
    const error = new Error(data.error_description || data.error || `Google respondió ${res.status}`);
    error.codigo = data.error; // 'invalid_grant' = la autorización fue revocada o expiró
    throw error;
  }
  return data;
}

// Cambia el código que Google devuelve tras el inicio de sesión por los tokens
async function canjearCodigo(code) {
  const { redirectUri } = leerCliente();
  const data = await pedirToken({ code, redirect_uri: redirectUri, grant_type: 'authorization_code' });

  // El id_token llega directo del endpoint de Google por HTTPS, así que
  // basta con leer su contenido para saber qué cuenta se conectó.
  const payload = JSON.parse(Buffer.from(data.id_token.split('.')[1], 'base64url').toString('utf8'));

  return {
    refreshToken: data.refresh_token,
    email:        payload.email,
    verificado:   payload.email_verified,
  };
}

async function renovarAcceso(refreshToken) {
  const data = await pedirToken({ refresh_token: refreshToken, grant_type: 'refresh_token' });
  return { accessToken: data.access_token, expiraEn: data.expires_in };
}

async function revocar(token) {
  // Si falla no importa: igual se borra el token de nuestro lado
  await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => {});
}

module.exports = {
  estaConfigurado,
  diagnostico,
  urlAutorizacion,
  canjearCodigo,
  renovarAcceso,
  revocar,
};
