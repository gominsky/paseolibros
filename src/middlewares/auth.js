// src/middlewares/auth.js
import jwt from 'jsonwebtoken';

export function verificarToken(req, res, next) {
  // Bearer token (Authorization: Bearer xxx)
  const auth = req.headers.authorization || '';
  const [tipo, bearerToken] = auth.split(' ');

  // Alternativos (por compatibilidad con tu frontend actual)
  const headerToken =
    req.headers['x-access-token'] ||
    req.headers['authorization-token'] ||
    '';

  const token = (tipo === 'Bearer' && bearerToken) ? bearerToken : headerToken;

  if (!token) {
    return res.status(401).json({ error: 'Token requerido' });
  }

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRETO || 'cambia_esto_en_.env'
    );

    req.usuario = {
      id: payload.id,
      nombre_usuario: payload.nombre_usuario,
    };

    next();
  } catch (err) {
    console.error('Error verificando token:', err);
    return res.status(403).json({ error: 'Token inválido o caducado' });
  }
}
