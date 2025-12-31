// src/rutas/share.js
import { Router } from 'express';
import crypto from 'crypto';
import pool from '../bd.js';
import { verificarToken } from '../middlewares/auth.js';
import jwt from 'jsonwebtoken';
const router = Router();

router.post('/share', verificarToken, (req, res) => {
  const usuario_id = req.usuario.id;
  const { tipo } = req.body;

  const token = jwt.sign(
    { usuario_id, tipo, scope: 'share' },
    process.env.JWT_SECRET,
    { expiresIn: '30d' }  // por ejemplo
  );

  res.json({ url: `${req.protocol}://${req.get('host')}/share.html?t=${token}` });
});


/* =========================
   GET /api/share/:token
   =========================
   Público · solo lectura
*/
router.get('/share/:token', async (req, res) => {
  let payload;
  try {
    payload = jwt.verify(req.params.token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Enlace no válido o caducado' });
  }

    const { usuario_id, tipo, nombre_usuario } = r.rows[0];

    let items = [];

    if (tipo === 'deseos') {
      const d = await pool.query(
        `SELECT
           titulo,
           autores,
           tipo,
           ubicacion,
           url_portada
         FROM deseos
         WHERE usuario_id = $1
         ORDER BY creado_en DESC`,
        [usuario_id]
      );
      items = d.rows;
    } else {
      const e = await pool.query(
        `SELECT
           titulo,
           autores,
           estado,
           ubicacion,
           url_portada
         FROM ejemplares
         WHERE usuario_id = $1
         ORDER BY creado_en DESC`,
        [usuario_id]
      );
      items = e.rows;
    }

    res.json({
      tipo,
      owner_name: nombre_usuario,
      items
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error obteniendo lista compartida' });
  }
});

export default router;
