// src/rutas/usuarios.js
import { Router } from 'express';
import pool from '../bd.js';
import { requiereUsuario, soloPropio } from '../middlewares/acceso.js';

const router = Router();

// Listar usuarios (para elegir a quién se presta un libro): GET /api/usuarios
// Requiere sesión y ya no devuelve correos.
router.get('/', requiereUsuario, async (req, res) => {
  try {
    const resultado = await pool.query(
      'SELECT id, nombre_usuario FROM usuarios ORDER BY nombre_usuario'
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error obteniendo usuarios' });
  }
});

// (Eliminado POST /api/usuarios: creaba cuentas sin control de abusos.
//  El alta se hace por POST /api/auth/register.)

// Ejemplares del usuario: GET /api/usuarios/:usuarioId/ejemplares
// Incluye las insignias del lector (favorito, nº de notas, audios y etiquetas)
// para que el navegador no tenga que hacer una petición por cada libro.
router.get('/:usuarioId/ejemplares', soloPropio('usuarioId'), async (req, res) => {
  const usuarioId = Number(req.params.usuarioId);

  try {
    const resultado = await pool.query(
      `SELECT
         e.id AS ejemplar_id,
         l.id AS libro_id,
         l.isbn,
         l.titulo,
         l.autores,
         l.editorial,
         l.fecha_publicacion,
         l.numero_paginas,
         l.url_portada,
         e.estado,
         e.ubicacion,
         e.notas,
         e.creado_en,
         EXISTS (SELECT 1 FROM libro_favoritos f
                  WHERE f.usuario_id = $1 AND f.libro_id = l.id)            AS rm_favorito,
         (SELECT COUNT(*)::int FROM libro_notas n
           WHERE n.usuario_id = $1 AND n.libro_id = l.id)                  AS rm_notas,
         (SELECT COUNT(*)::int FROM libro_audios a
           WHERE a.usuario_id = $1 AND a.libro_id = l.id)                  AS rm_audios,
         (SELECT COUNT(*)::int FROM libro_tags t
           WHERE t.usuario_id = $1 AND t.libro_id = l.id)                  AS rm_tags
       FROM ejemplares e
       JOIN libros l ON l.id = e.libro_id
       WHERE e.usuario_id = $1
         AND e.activo = TRUE
       ORDER BY e.creado_en DESC`,
      [usuarioId]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error obteniendo ejemplares del usuario' });
  }
});

export default router;
