// src/rutas/libros.js
import { Router } from 'express';
import pool from '../bd.js';
import multer from 'multer';
import path from 'path';

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
const uploadsDir = path.join(process.cwd(), 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
    cb(null, `libro_${req.params.id}_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 6 * 1024 * 1024 }, // 6MB
});

// Subir portada y guardar su URL en libros.url_portada
// POST /api/libros/:id/portada
router.post('/:id/portada', upload.single('portada'), async (req, res) => {
  const libroId = Number(req.params.id);
  if (!libroId) return res.status(400).json({ error: 'ID de libro no válido' });

  if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });

  try {
    const urlPortada = `/uploads/${req.file.filename}`;

    const result = await pool.query(
      `UPDATE libros
       SET url_portada = $1
       WHERE id = $2
       RETURNING id, url_portada`,
      [urlPortada, libroId]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error guardando portada' });
  }
});

export default router;
