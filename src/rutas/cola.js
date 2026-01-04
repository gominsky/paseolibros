import { Router } from 'express';
import pool from '../bd.js';
import { verificarToken } from '../middlewares/auth.js';

const router = Router();

// GET /api/usuarios/:usuarioId/cola?q=&order=
router.get('/usuarios/:usuarioId/cola', verificarToken, async (req, res) => {
  const { usuarioId } = req.params;
  const q = String(req.query.q || '').trim();
  const order = String(req.query.order || 'pos_asc').trim();

  if (Number(req.usuario.id) !== Number(usuarioId)) {
    return res.status(403).json({ error: 'No puedes ver la cola de otro usuario' });
  }

  let orderSql = 'c.posicion ASC, c.creado_en DESC';
  if (order === 'creado_desc') orderSql = 'c.creado_en DESC';

  try {
    const sql = `
      SELECT
        c.id,
        c.usuario_id,
        c.ejemplar_id,
        c.posicion,
        c.notas,
        c.creado_en,
        e.libro_id,
        e.estado,
        e.ubicacion,
        l.titulo,
        l.autores,
        l.isbn,
        l.url_portada
      FROM cola_lecturas c
      JOIN ejemplares e ON e.id = c.ejemplar_id
      JOIN libros l ON l.id = e.libro_id
      WHERE c.usuario_id = $1
        AND (
          $2 = '' OR
          lower(unaccent(l.titulo)) ILIKE '%' || lower(unaccent($2)) || '%' OR
          lower(unaccent(l.autores)) ILIKE '%' || lower(unaccent($2)) || '%' OR
          l.isbn ILIKE '%' || $2 || '%'
        )
      ORDER BY ${orderSql}
    `;
    const r = await pool.query(sql, [usuarioId, q]);
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error obteniendo cola de lecturas' });
  }
});

// POST /api/cola  { ejemplar_id, notas?, posicion? }
router.post('/cola', verificarToken, async (req, res) => {
  const usuario_id = req.usuario?.id;
  if (!usuario_id) return res.status(401).json({ error: 'Usuario no autenticado' });

  const ejemplar_id = Number(req.body?.ejemplar_id);
  const notas = req.body?.notas ? String(req.body.notas).trim() : null;
  const posicion = Number.isFinite(Number(req.body?.posicion)) ? Number(req.body.posicion) : 999999;

  if (!ejemplar_id) return res.status(400).json({ error: 'ejemplar_id es obligatorio' });

  try {
    // Verifica que el ejemplar exista (y opcionalmente que sea del usuario, si tu modelo lo exige)
    const ex = await pool.query(`SELECT id FROM ejemplares WHERE id = $1`, [ejemplar_id]);
    if (ex.rowCount === 0) return res.status(404).json({ error: 'Ejemplar no existe' });

    const r = await pool.query(
      `INSERT INTO cola_lecturas (usuario_id, ejemplar_id, notas, posicion)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [usuario_id, ejemplar_id, notas, posicion]
    );

    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === '23505') return res.status(400).json({ error: 'Ese ejemplar ya está en tu cola' });
    res.status(500).json({ error: 'Error añadiendo a cola' });
  }
});

// PATCH /api/cola/:id  { notas?, posicion? }
router.patch('/cola/:id', verificarToken, async (req, res) => {
  const usuario_id = req.usuario?.id;
  if (!usuario_id) return res.status(401).json({ error: 'Usuario no autenticado' });

  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID no válido' });

  const notas = req.body?.notas !== undefined ? (req.body.notas ? String(req.body.notas).trim() : null) : undefined;
  const posicion = req.body?.posicion !== undefined && Number.isFinite(Number(req.body.posicion))
    ? Number(req.body.posicion)
    : undefined;

  try {
    const r = await pool.query(
      `UPDATE cola_lecturas
       SET
         notas = COALESCE($1, notas),
         posicion = COALESCE($2, posicion)
       WHERE id = $3 AND usuario_id = $4
       RETURNING *`,
      [notas ?? null, posicion ?? null, id, usuario_id]
    );

    if (r.rowCount === 0) return res.status(404).json({ error: 'Elemento de cola no encontrado' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error actualizando cola' });
  }
});

// DELETE /api/cola/:id
router.delete('/cola/:id', verificarToken, async (req, res) => {
  const usuario_id = req.usuario?.id;
  if (!usuario_id) return res.status(401).json({ error: 'Usuario no autenticado' });

  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID no válido' });

  try {
    const r = await pool.query(`DELETE FROM cola_lecturas WHERE id=$1 AND usuario_id=$2`, [id, usuario_id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Elemento de cola no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error eliminando de cola' });
  }
});

export default router;
