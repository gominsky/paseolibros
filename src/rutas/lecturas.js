import { Router } from 'express';
import pool from '../bd.js';

const router = Router();

// 🔢 estadísticas
// 🔢 estadisticas
router.get('/usuarios/:id/lecturas/estadisticas', async (req, res) => {
  try {
    const usuarioId = Number(req.params.id);

    const sql = `
      SELECT
        anio,
        SUM(empezadas)  AS empezadas,
        SUM(terminadas) AS terminadas
      FROM (
        -- lecturas empezadas por año
        SELECT
          EXTRACT(YEAR FROM inicio)::int AS anio,
          COUNT(*) AS empezadas,
          0        AS terminadas
        FROM lecturas
        WHERE usuario_id = $1
          AND inicio IS NOT NULL
        GROUP BY anio

        UNION ALL

        -- lecturas terminadas por año
        SELECT
          EXTRACT(YEAR FROM fin)::int AS anio,
          0        AS empezadas,
          COUNT(*) AS terminadas
        FROM lecturas
        WHERE usuario_id = $1
          AND fin IS NOT NULL
        GROUP BY anio
      ) t
      GROUP BY anio
      ORDER BY anio DESC;
    `;

    const { rows } = await pool.query(sql, [usuarioId]);
    res.json(rows);
  } catch (err) {
    console.error('Error al obtener estadísticas de lecturas:', err);
    res.status(500).json({ error: 'Error al obtener estadísticas de lecturas.' });
  }
});

router.get('/usuarios/:id/lecturas/estadisticas/:anio', async (req, res) => {
  try {
    const usuarioId = Number(req.params.id);
    const anio = Number(req.params.anio);

    if (!Number.isFinite(usuarioId) || !Number.isFinite(anio)) {
      return res.status(400).json({ error: 'Parámetros inválidos.' });
    }

    const sql = `
      SELECT
        le.id,
        le.libro_id,
        le.ejemplar_id,
        l.titulo,
        l.autores,
        le.inicio,
        le.fin,
        (le.inicio IS NOT NULL AND EXTRACT(YEAR FROM le.inicio)::int = $2) AS empezada_en_anio,
        (le.fin    IS NOT NULL AND EXTRACT(YEAR FROM le.fin)::int    = $2) AS terminada_en_anio
      FROM lecturas le
      JOIN libros l ON l.id = le.libro_id
      WHERE le.usuario_id = $1
        AND (
          (le.inicio IS NOT NULL AND EXTRACT(YEAR FROM le.inicio)::int = $2)
          OR
          (le.fin    IS NOT NULL AND EXTRACT(YEAR FROM le.fin)::int    = $2)
        )
      ORDER BY COALESCE(le.fin, le.inicio) DESC, l.titulo;
    `;

    const { rows } = await pool.query(sql, [usuarioId, anio]);

    const empezadas = rows
      .filter(r => r.empezada_en_anio)
      .map(r => ({
        id: r.id,
        libro_id: r.libro_id,
        ejemplar_id: r.ejemplar_id,
        titulo: r.titulo,
        autores: r.autores,
        inicio: r.inicio,
      }));

    const terminadas = rows
      .filter(r => r.terminada_en_anio)
      .map(r => ({
        id: r.id,
        libro_id: r.libro_id,
        ejemplar_id: r.ejemplar_id,
        titulo: r.titulo,
        autores: r.autores,
        fin: r.fin,
      }));

    res.json({ anio, empezadas, terminadas });
  } catch (err) {
    console.error('Error al obtener detalle de estadísticas de lecturas:', err);
    res.status(500).json({ error: 'Error al obtener detalle de estadísticas de lecturas.' });
  }
});


// Histórico de lecturas de un libro:
// GET /api/libros/:libroId/lecturas
router.get('/libros/:libroId/lecturas', async (req, res) => {
  const { libroId } = req.params;

  try {
    const resultado = await pool.query(
      `SELECT 
         le.id,
         le.usuario_id,
         u.nombre_usuario,
         le.libro_id,
         le.ejemplar_id,
         le.estado,
         le.inicio,
         le.fin,
         le.pagina_actual,
         le.valoracion,
         le.notas
       FROM lecturas le
       JOIN usuarios u ON u.id = le.usuario_id
       WHERE le.libro_id = $1
       ORDER BY le.inicio DESC`,
      [libroId]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error obteniendo histórico de lecturas' });
  }
});

// Crear una nueva lectura (empezar a leer):
// POST /api/lecturas
router.post('/lecturas', async (req, res) => {
  const { usuario_id, libro_id, ejemplar_id, estado, pagina_actual, notas } = req.body;

  if (!usuario_id || !libro_id) {
    return res.status(400).json({ error: 'usuario_id y libro_id son obligatorios' });
  }

  try {
    const resultado = await pool.query(
      `INSERT INTO lecturas (
         usuario_id, libro_id, ejemplar_id, estado, pagina_actual, notas
       )
       VALUES ($1, $2, $3, COALESCE($4, 'leyendo'), $5, $6)
       RETURNING *`,
      [
        usuario_id,
        libro_id,
        ejemplar_id || null,
        estado,
        pagina_actual || null,
        notas || null
      ]
    );

    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error creando lectura' });
  }
});

// Finalizar una lectura:
// PATCH /api/lecturas/:id/finalizar
router.patch('/lecturas/:id/finalizar', async (req, res) => {
  const { id } = req.params;
  const { pagina_actual, valoracion, notas } = req.body;

  try {
    const resultado = await pool.query(
      `UPDATE lecturas
       SET estado = 'terminado',
           fin = NOW(),
           pagina_actual = COALESCE($1, pagina_actual),
           valoracion = COALESCE($2, valoracion),
           notas = COALESCE($3, notas)
       WHERE id = $4
       RETURNING *`,
      [pagina_actual || null, valoracion || null, notas || null, id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Lectura no encontrada' });
    }

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error actualizando lectura' });
  }
});
// Lecturas abiertas de un usuario (no terminadas)
router.get('/usuarios/:usuarioId/lecturas-abiertas', async (req, res) => {
  const { usuarioId } = req.params;

  try {
    const resultado = await pool.query(
      `SELECT
         le.id,
         le.usuario_id,
         le.libro_id,
         le.ejemplar_id,
         le.estado,
         le.inicio,
         le.pagina_actual,
         le.notas,
         l.titulo,
         l.autores,
         l.isbn
       FROM lecturas le
       JOIN libros l ON l.id = le.libro_id
       WHERE le.usuario_id = $1
         AND (le.estado IS NULL OR le.estado <> 'terminado')
       ORDER BY le.inicio DESC`,
      [usuarioId]
    );

    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error obteniendo lecturas abiertas del usuario' });
  }
});
// Actualizar marca-páginas (pagina_actual):
// PATCH /api/lecturas/:id/pagina
router.patch('/lecturas/:id/pagina', async (req, res) => {
  const { id } = req.params;
  const { pagina_actual } = req.body;

  // permite null para “vaciar”
  const pagina = (pagina_actual === null || pagina_actual === undefined || pagina_actual === '')
    ? null
    : Number(pagina_actual);

  if (pagina !== null && (!Number.isFinite(pagina) || pagina < 0)) {
    return res.status(400).json({ error: 'pagina_actual debe ser un número >= 0 o null' });
  }

  try {
    const resultado = await pool.query(
      `UPDATE lecturas
       SET pagina_actual = $1
       WHERE id = $2
       RETURNING *`,
      [pagina, id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Lectura no encontrada' });
    }

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error actualizando página actual' });
  }
});


export default router;
