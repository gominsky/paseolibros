// src/rutas/libros_recibidos.js
// Libros ajenos que me han prestado — para no olvidar devolverlos

import { Router } from 'express';
import pool from '../bd.js';

const router = Router();

function requireAuth(req, res, next) {
  if (!req.usuario?.id) return res.status(401).json({ error: 'No autenticado' });
  next();
}

// ── GET /api/libros-recibidos ─────────────────────────────
// Lista de libros que me han prestado (pendientes de devolver primero)
router.get('/libros-recibidos', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM libros_recibidos
       WHERE usuario_id = $1
       ORDER BY devuelto ASC, fecha_devolver ASC NULLS LAST, creado_en DESC`,
      [req.usuario.id]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error obteniendo libros recibidos' });
  }
});

// ── POST /api/libros-recibidos ────────────────────────────
// Registrar un libro que me han prestado
router.post('/libros-recibidos', requireAuth, async (req, res) => {
  const { titulo, autores, prestador, fecha_recibido, fecha_devolver, notas } = req.body;

  if (!titulo?.trim()) return res.status(400).json({ error: 'El título es obligatorio' });
  if (!prestador?.trim()) return res.status(400).json({ error: 'Indica quién te lo prestó' });

  try {
    const { rows } = await pool.query(
      `INSERT INTO libros_recibidos
         (usuario_id, titulo, autores, prestador, fecha_recibido, fecha_devolver, notas)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        req.usuario.id,
        titulo.trim(),
        autores?.trim() || null,
        prestador.trim(),
        fecha_recibido || null,
        fecha_devolver || null,
        notas?.trim() || null,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error registrando libro recibido' });
  }
});

// ── PUT /api/libros-recibidos/:id ─────────────────────────
// Editar un registro
router.put('/libros-recibidos/:id', requireAuth, async (req, res) => {
  const { titulo, autores, prestador, fecha_recibido, fecha_devolver, notas } = req.body;

  try {
    const { rows } = await pool.query(
      `UPDATE libros_recibidos
       SET titulo = $1, autores = $2, prestador = $3,
           fecha_recibido = $4, fecha_devolver = $5, notas = $6
       WHERE id = $7 AND usuario_id = $8
       RETURNING *`,
      [
        titulo?.trim(), autores?.trim() || null, prestador?.trim(),
        fecha_recibido || null, fecha_devolver || null, notas?.trim() || null,
        req.params.id, req.usuario.id,
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error actualizando registro' });
  }
});

// ── POST /api/libros-recibidos/:id/devolver ───────────────
// Marcar como devuelto
router.post('/libros-recibidos/:id/devolver', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `UPDATE libros_recibidos
       SET devuelto = TRUE, fecha_devuelto = CURRENT_DATE
       WHERE id = $1 AND usuario_id = $2
       RETURNING *`,
      [req.params.id, req.usuario.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error marcando como devuelto' });
  }
});

// ── DELETE /api/libros-recibidos/:id ─────────────────────
// Eliminar un registro
router.delete('/libros-recibidos/:id', requireAuth, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM libros_recibidos WHERE id = $1 AND usuario_id = $2',
      [req.params.id, req.usuario.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error eliminando registro' });
  }
});

export default router;
