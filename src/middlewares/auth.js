// src/middlewares/auth.js
import jwt from 'jsonwebtoken';

export function verificarToken(req, res, next) {
  const cabecera = req.headers['authorization'];
  const token = cabecera && cabecera.split(' ')[1]; // "Bearer xxx"

  if (!token) {
    // aquí se quedaría si el frontend no manda Authorization
    return res.status(401).json({ error: 'Token requerido' });
  }

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRETO || 'cambia_esto_en_.env'
    );

    // guardamos los datos del usuario en la request
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
