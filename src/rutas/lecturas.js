// src/rutas/lecturas.js
import { Router } from 'express';
import pool from '../bd.js';

const router = Router();

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


export default router;
