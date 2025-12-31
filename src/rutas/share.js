// src/rutas/share.js
import { Router } from 'express';
import pool from '../bd.js';
import { verificarToken } from '../middlewares/auth.js';
import jwt from 'jsonwebtoken';

const router = Router();

// OJO: usa el mismo secreto que app.js
const JWT_SECRET = process.env.JWT_SECRETO || 'paseolibros_JWT_$9fK2!xQmA7zR';

// POST /api/share  (requiere login)
router.post('/share', verificarToken, (req, res) => {
  const usuario_id = req.usuario?.id;
  const { tipo } = req.body || {};

  if (!usuario_id) return res.status(401).json({ error: 'Usuario no autenticado' });
  if (tipo !== 'deseos' && tipo !== 'ejemplares') {
    return res.status(400).json({ error: 'tipo inválido' });
  }

  const token = jwt.sign(
    { usuario_id, tipo, scope: 'share' },
    JWT_SECRET,
    { expiresIn: '30d' }
  );

  res.json({ token, url: `${req.protocol}://${req.get('host')}/share.html?t=${encodeURIComponent(token)}` });
});

// GET /api/share/:token  (público, solo lectura)
router.get('/share/:token', async (req, res) => {
  let payload;
  try {
    payload = jwt.verify(req.params.token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Enlace no válido o caducado' });
  }

  // Seguridad básica: solo aceptamos tokens de share
  if (payload?.scope !== 'share') {
    return res.status(401).json({ error: 'Token no válido' });
  }

  const { usuario_id, tipo } = payload;

  try {
    // owner_name para el título bonito
    const u = await pool.query(
      `SELECT nombre_usuario FROM usuarios WHERE id = $1 LIMIT 1`,
      [usuario_id]
    );
    const owner_name = u.rows[0]?.nombre_usuario || '';

    let items = [];

    if (tipo === 'deseos') {
      const d = await pool.query(
        `SELECT titulo, autores, tipo, ubicacion, url_portada
         FROM deseos
         WHERE usuario_id = $1
         ORDER BY creado_en DESC`,
        [usuario_id]
      );
      items = d.rows;
    } else if (tipo === 'ejemplares') {
      const e = await pool.query(
        `SELECT
           e.id        AS ejemplar_id,
           e.libro_id  AS libro_id,
           l.titulo    AS titulo,
           l.autores   AS autores,
           l.isbn      AS isbn,
           e.estado    AS estado,
           e.ubicacion AS ubicacion,
           e.notas     AS notas,
           l.url_portada AS url_portada
         FROM ejemplares e
         JOIN libros l ON l.id = e.libro_id
         WHERE e.usuario_id = $1
         ORDER BY e.creado_en DESC`,
        [usuario_id]
      );
      items = e.rows;
        
    } else {
      return res.status(400).json({ error: 'tipo inválido en token' });
    }

    return res.json({ tipo, owner_name, items });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error obteniendo lista compartida' });
  }
});

export default router;
