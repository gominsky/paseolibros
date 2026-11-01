// src/middlewares/acceso.js
// Comprobaciones de acceso reutilizables.
// app.js ya decodifica el JWT (si viene) y deja req.usuario = { id, nombre_usuario }.

// Exige sesión iniciada
export function requiereUsuario(req, res, next) {
  if (!req.usuario?.id) {
    return res.status(401).json({ error: 'No has iniciado sesión' });
  }
  next();
}

// Exige sesión y que el :param de la URL sea el propio usuario
// (evita leer datos de otro cambiando el número en la URL)
export function soloPropio(param = 'usuarioId') {
  return (req, res, next) => {
    if (!req.usuario?.id) {
      return res.status(401).json({ error: 'No has iniciado sesión' });
    }
    if (Number(req.params[param]) !== Number(req.usuario.id)) {
      return res.status(403).json({ error: 'No tienes acceso a los datos de otro usuario' });
    }
    next();
  };
}
