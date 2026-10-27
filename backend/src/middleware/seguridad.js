/*
 * Cabeceras de seguridad y límite de intentos.
 *
 * Están escritas a mano, sin helmet ni express-rate-limit, para no sumar
 * dependencias: la API solo responde JSON y descargas, así que basta con
 * pocas cabeceras, y el límite vive en memoria porque corre una sola
 * instancia del backend.
 */

// La API nunca sirve páginas: nada se ejecuta ni se incrusta en un marco
function cabecerasSeguridad(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (req.secure) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  next();
}

/**
 * Corta las peticiones de una misma clave (IP, correo…) que pasan de
 * `maximo` dentro de `ventanaMs`. Responde 429 con el tiempo de espera.
 *
 * @param {object}   o
 * @param {number}   o.ventanaMs
 * @param {number}   o.maximo
 * @param {Function} o.clave     (req) => string
 * @param {string}   o.mensaje
 */
function limitarIntentos({ ventanaMs, maximo, clave, mensaje }) {
  const registros = new Map(); // clave → { cuenta, vence }

  // Limpieza periódica para que el mapa no crezca sin fin
  setInterval(() => {
    const ahora = Date.now();
    for (const [k, r] of registros) if (r.vence <= ahora) registros.delete(k);
  }, ventanaMs).unref();

  return (req, res, next) => {
    const k = clave(req);
    const ahora = Date.now();
    let registro = registros.get(k);
    if (!registro || registro.vence <= ahora) {
      registro = { cuenta: 0, vence: ahora + ventanaMs };
      registros.set(k, registro);
    }

    registro.cuenta++;
    if (registro.cuenta > maximo) {
      const segundos = Math.ceil((registro.vence - ahora) / 1000);
      res.setHeader('Retry-After', String(segundos));
      return res.status(429).json({
        message: `${mensaje} Vuelve a intentarlo en ${Math.ceil(segundos / 60)} minuto(s).`,
      });
    }
    next();
  };
}

const correoDe = (req) => String(req.body?.email || '').toLowerCase().trim();
const QUINCE_MIN = 15 * 60 * 1000;
const UNA_HORA   = 60 * 60 * 1000;

// Inicio de sesión: por cuenta (frena adivinar una contraseña) y por IP
// (frena probar muchas cuentas desde el mismo lugar)
const limiteLoginCuenta = limitarIntentos({
  ventanaMs: QUINCE_MIN, maximo: 10,
  clave: (req) => `${req.ip}|${correoDe(req)}`,
  mensaje: 'Demasiados intentos de inicio de sesión.',
});
// Tope por correo desde cualquier IP. Es más alto para que un tercero no
// pueda bloquear fácilmente la cuenta de otra persona
const limiteLoginCorreo = limitarIntentos({
  ventanaMs: QUINCE_MIN, maximo: 30,
  clave: (req) => `correo|${correoDe(req)}`,
  mensaje: 'Demasiados intentos de inicio de sesión para esta cuenta.',
});
const limiteLoginIP = limitarIntentos({
  ventanaMs: QUINCE_MIN, maximo: 50,
  clave: (req) => req.ip,
  mensaje: 'Demasiados intentos de inicio de sesión desde esta red.',
});

// Recuperación: cada pedido manda un correo
const limiteRecuperacion = limitarIntentos({
  ventanaMs: UNA_HORA, maximo: 5,
  clave: (req) => `${req.ip}|${correoDe(req)}`,
  mensaje: 'Ya se enviaron varios correos de recuperación.',
});
const limiteRestablecer = limitarIntentos({
  ventanaMs: QUINCE_MIN, maximo: 10,
  clave: (req) => req.ip,
  mensaje: 'Demasiados intentos de restablecer la contraseña.',
});

module.exports = {
  cabecerasSeguridad,
  limitarIntentos,
  limiteLoginCuenta,
  limiteLoginCorreo,
  limiteLoginIP,
  limiteRecuperacion,
  limiteRestablecer,
};
