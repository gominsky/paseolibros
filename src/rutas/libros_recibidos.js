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

// ── POST /api/libros-recibidos/:id/leido ──────────────────
// Marcar (o desmarcar) como leído. Cuenta en las estadísticas de lectura
// como libro terminado en la fecha indicada (por defecto, hoy).
router.post('/libros-recibidos/:id/leido', requireAuth, async (req, res) => {
  const leido = req.body?.leido !== false;
  const fecha = req.body?.fecha_leido || null;
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return res.status(400).json({ error: 'Fecha no válida (AAAA-MM-DD)' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE libros_recibidos
       SET leido = $1,
           fecha_leido = CASE WHEN $1 THEN COALESCE($2::date, fecha_leido, CURRENT_DATE) ELSE NULL END,
           leyendo = CASE WHEN $1 THEN FALSE ELSE leyendo END   -- terminarlo lo saca de «Leyendo»
       WHERE id = $3 AND usuario_id = $4
       RETURNING *`,
      [leido, fecha, req.params.id, req.usuario.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error marcando como leído' });
  }
});

// ── POST /api/libros-recibidos/:id/lectura  { accion: 'empezar' | 'dejar' } ──
// Empezar a leer un libro prestado (aparece en «Leyendo») o dejarlo sin terminar
router.post('/libros-recibidos/:id/lectura', requireAuth, async (req, res) => {
  const accion = req.body?.accion;
  if (!['empezar', 'dejar'].includes(accion)) {
    return res.status(400).json({ error: "accion debe ser 'empezar' o 'dejar'" });
  }
  try {
    const { rows } = await pool.query(
      accion === 'empezar'
        ? `UPDATE libros_recibidos
           SET leyendo = TRUE, leido = FALSE, fecha_leido = NULL,
               fecha_inicio_lectura = COALESCE(fecha_inicio_lectura, CURRENT_DATE)
           WHERE id = $1 AND usuario_id = $2 RETURNING *`
        : `UPDATE libros_recibidos
           SET leyendo = FALSE, fecha_inicio_lectura = NULL, pagina_actual = NULL
           WHERE id = $1 AND usuario_id = $2 RETURNING *`,
      [req.params.id, req.usuario.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Registro no encontrado' });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error actualizando la lectura' });
  }
});

// ── PATCH /api/libros-recibidos/:id/pagina  { pagina_actual } ─
// Marcapáginas de un libro prestado que estoy leyendo
router.patch('/libros-recibidos/:id/pagina', requireAuth, async (req, res) => {
  const pagina = req.body?.pagina_actual;
  if (pagina !== null && pagina !== undefined && (!Number.isInteger(Number(pagina)) || Number(pagina) < 0)) {
    return res.status(400).json({ error: 'Página no válida' });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE libros_recibidos SET pagina_actual = $1
       WHERE id = $2 AND usuario_id = $3 AND leyendo = TRUE RETURNING *`,
      [pagina === '' || pagina == null ? null : Number(pagina), req.params.id, req.usuario.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'No lo estás leyendo' });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error guardando la página' });
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
