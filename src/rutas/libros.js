// src/rutas/libros.js
import { Router } from 'express';
import pool from '../bd.js';

const router = Router();

// Obtener un libro por ID (solo si el usuario tiene algún ejemplar de ese libro)
router.get('/:id', async (req, res) => {
  const libroId = Number(req.params.id);
  if (!libroId) {
    return res.status(400).json({ error: 'ID de libro no válido' });
  }

  try {
    // comprobamos que el usuario tiene al menos un ejemplar de este libro
    const tieneEjemplar = await pool.query(
      `SELECT 1
       FROM ejemplares
       WHERE libro_id = $1
         AND usuario_id = $2
         AND activo = TRUE
       LIMIT 1`,
      [libroId, req.usuario.id]
    );

    if (tieneEjemplar.rowCount === 0) {
      return res
        .status(403)
        .json({ error: 'No puedes ver este libro (no tienes ejemplares suyos)' });
    }

    const resultado = await pool.query(
      'SELECT * FROM libros WHERE id = $1',
      [libroId]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({ error: 'Libro no encontrado' });
    }

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error obteniendo libro' });
  }
});

// Actualizar datos del libro
router.put('/:id', async (req, res) => {
  const libroId = Number(req.params.id);
  if (!libroId) {
    return res.status(400).json({ error: 'ID de libro no válido' });
  }

  const {
    titulo,
    autores,
    editorial,
    fecha_publicacion,
    numero_paginas,
    descripcion,
    url_portada,
  } = req.body;

  try {
    // de nuevo, sólo si el usuario tiene ejemplares de este libro
    const tieneEjemplar = await pool.query(
      `SELECT 1
       FROM ejemplares
       WHERE libro_id = $1
         AND usuario_id = $2
         AND activo = TRUE
       LIMIT 1`,
      [libroId, req.usuario.id]
    );

    if (tieneEjemplar.rowCount === 0) {
      return res
        .status(403)
        .json({ error: 'No puedes editar un libro del que no tienes ejemplares' });
    }

   const resultado = await pool.query(
  `UPDATE libros
   SET
     titulo = COALESCE($1, titulo),
     autores = COALESCE($2, autores),
     editorial = COALESCE($3, editorial),
     fecha_publicacion = COALESCE($4, fecha_publicacion),
     numero_paginas = COALESCE($5, numero_paginas),
     descripcion = COALESCE($6, descripcion),
     url_portada = COALESCE($7, url_portada)
   WHERE id = $8
   RETURNING *`,
  [
    titulo,
    autores,
    editorial,
    fecha_publicacion,
    numero_paginas,
    descripcion,
    url_portada,
    libroId,
  ]
);

    if (resultado.rowCount === 0) {
      return res.status(404).json({ error: 'Libro no encontrado' });
    }

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error actualizando libro' });
  }
});

export default router;
