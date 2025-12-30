// src/rutas/deseos.js
import { Router } from 'express';
import pool from '../bd.js';
import { verificarToken } from '../middlewares/auth.js';
const router = Router();

// Helper: normaliza con Postgres unaccent+lower (lo hacemos en SQL, no aquí)

// GET /api/usuarios/:usuarioId/deseos?q=&tipo=&ubicacion=&order=
router.get('/usuarios/:usuarioId/deseos', verificarToken, async (req, res) => {
  const { usuarioId } = req.params;
  const q = String(req.query.q || '').trim();
  const tipo = String(req.query.tipo || '').trim();
  const ubicacion = String(req.query.ubicacion || '').trim();
  const order = String(req.query.order || 'creado_desc').trim();

  // ✅ seguridad: solo el propio usuario (si quieres)
  // Si prefieres permitir admin, aquí lo amplías
  if (Number(req.usuario.id) !== Number(usuarioId)) {
    return res.status(403).json({ error: 'No puedes ver los deseos de otro usuario' });
  }

  let orderSql = 'd.creado_en DESC';
  if (order === 'prioridad_desc') orderSql = 'd.prioridad DESC, d.creado_en DESC';
  if (order === 'titulo_asc') orderSql = 'd.titulo_norm ASC, d.creado_en DESC';

  try {
    const params = [usuarioId, q, tipo, ubicacion];

    const sql = `
      SELECT
        d.id,
        d.usuario_id,
        d.titulo,
        d.autores,
        d.isbn,
        d.tipo,
        d.ubicacion,
        d.prioridad,
        d.notas,
        d.url_portada,
        d.creado_en,
        d.actualizado_en
      FROM deseos d
      WHERE d.usuario_id = $1
        AND (
          $2 = '' OR
          d.titulo_norm ILIKE '%' || lower(unaccent($2)) || '%' OR
          d.autores_norm ILIKE '%' || lower(unaccent($2)) || '%'
        )
        AND ($3 = '' OR d.tipo = $3)
        AND (
          $4 = '' OR
          d.ubicacion_norm ILIKE '%' || lower(unaccent($4)) || '%'
        )
      ORDER BY ${orderSql}
    `;

    const r = await pool.query(sql, params);
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error obteniendo deseos' });
  }
});

// POST /api/deseos  (usuario viene del token, igual que en ejemplares.js)
router.post('/deseos', verificarToken, async (req, res) => {
  const usuario_id = req.usuario?.id;
  if (!usuario_id) return res.status(401).json({ error: 'Usuario no autenticado' });

  const {
    titulo,
    autores,
    isbn,
    tipo,
    ubicacion,
    prioridad,
    notas,
    url_portada,
  } = req.body;

  if (!titulo || !String(titulo).trim()) {
    return res.status(400).json({ error: 'titulo es obligatorio' });
  }

  try {
    const r = await pool.query(
      `INSERT INTO deseos (
         usuario_id, titulo, autores, isbn, tipo, ubicacion, prioridad, notas, url_portada
       )
       VALUES ($1,$2,$3,$4,COALESCE($5,'libro'),$6,COALESCE($7,2),$8,$9)
       RETURNING *`,
      [
        usuario_id,
        String(titulo).trim(),
        autores ? String(autores).trim() : null,
        isbn ? String(isbn).trim() : null,
        tipo ? String(tipo).trim() : null,
        ubicacion ? String(ubicacion).trim() : null,
        Number.isFinite(Number(prioridad)) ? Number(prioridad) : null,
        notas ? String(notas).trim() : null,
        url_portada ? String(url_portada).trim() : null,
      ]
    );

    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error(err);
    // índice único parcial por ISBN si lo creaste
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Ya tienes un deseo con ese ISBN' });
    }
    res.status(500).json({ error: 'Error creando deseo' });
  }
});

// PATCH /api/deseos/:id
router.patch('/deseos/:id', verificarToken, async (req, res) => {
  const usuario_id = req.usuario?.id;
  if (!usuario_id) return res.status(401).json({ error: 'Usuario no autenticado' });

  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID no válido' });

  const { titulo, autores, isbn, tipo, ubicacion, prioridad, notas, url_portada } = req.body;

  try {
    const r = await pool.query(
      `UPDATE deseos
       SET
         titulo = COALESCE($1, titulo),
         autores = COALESCE($2, autores),
         isbn = COALESCE($3, isbn),
         tipo = COALESCE($4, tipo),
         ubicacion = COALESCE($5, ubicacion),
         prioridad = COALESCE($6, prioridad),
         notas = COALESCE($7, notas),
         url_portada = COALESCE($8, url_portada)
       WHERE id = $9 AND usuario_id = $10
       RETURNING *`,
      [
        titulo ?? null,
        autores ?? null,
        isbn ?? null,
        tipo ?? null,
        ubicacion ?? null,
        Number.isFinite(Number(prioridad)) ? Number(prioridad) : null,
        notas ?? null,
        url_portada ?? null,
        id,
        usuario_id,
      ]
    );

    if (r.rowCount === 0) return res.status(404).json({ error: 'Deseo no encontrado' });
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error actualizando deseo' });
  }
});

// DELETE /api/deseos/:id
router.delete('/deseos/:id', verificarToken, async (req, res) => { 
  const usuario_id = req.usuario?.id;
  if (!usuario_id) return res.status(401).json({ error: 'Usuario no autenticado' });

  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID no válido' });

  try {
    const r = await pool.query(
      `DELETE FROM deseos WHERE id = $1 AND usuario_id = $2`,
      [id, usuario_id]
    );

    if (r.rowCount === 0) return res.status(404).json({ error: 'Deseo no encontrado' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error eliminando deseo' });
  }
});

export default router;
