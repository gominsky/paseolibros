// src/rutas/prestamos.js
import { Router } from 'express';
import pool from '../bd.js';
import { requiereUsuario, soloPropio } from '../middlewares/acceso.js';

const router = Router();

// Histórico de préstamos de un libro:
// GET /api/libros/:libroId/prestamos
router.get('/libros/:libroId/prestamos', requiereUsuario, async (req, res) => {
  const { libroId } = req.params;

  try {
    const resultado = await pool.query(
      `SELECT 
         p.id,
         p.ejemplar_id,
         p.usuario_prestador_id,
         prestador.nombre_usuario AS nombre_prestador,
         p.usuario_receptor_id,
         receptor.nombre_usuario AS nombre_receptor_usuario,
         p.nombre_receptor,
         p.fecha_prestamo,
         p.fecha_limite,
         p.fecha_devolucion,
         p.estado,
         p.notas
       FROM prestamos p
       JOIN ejemplares e ON e.id = p.ejemplar_id
       JOIN libros l ON l.id = e.libro_id
       JOIN usuarios prestador ON prestador.id = p.usuario_prestador_id
       LEFT JOIN usuarios receptor ON receptor.id = p.usuario_receptor_id
       WHERE l.id = $1
         AND (p.usuario_prestador_id = $2 OR p.usuario_receptor_id = $2)
       ORDER BY p.fecha_prestamo DESC`,
      [libroId, req.usuario.id]
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error obteniendo histórico de préstamos' });
  }
});

// Crear un préstamo:
// POST /api/prestamos
router.post('/prestamos', requiereUsuario, async (req, res) => {
  // Quien presta es siempre el usuario autenticado
  const usuario_prestador_id = req.usuario.id;
  const {
    ejemplar_id,
    usuario_receptor_id,
    nombre_receptor,
    fecha_limite,
    notas
  } = req.body;

  if (!ejemplar_id || !usuario_prestador_id) {
    return res.status(400).json({ error: 'ejemplar_id y usuario_prestador_id son obligatorios' });
  }

  try {
    // Solo se pueden prestar ejemplares propios
    const propio = await pool.query(
      'SELECT 1 FROM ejemplares WHERE id = $1 AND usuario_id = $2',
      [ejemplar_id, usuario_prestador_id]
    );
    if (!propio.rowCount) {
      return res.status(403).json({ error: 'Ese ejemplar no es tuyo' });
    }

    const resultado = await pool.query(
      `INSERT INTO prestamos (
         ejemplar_id,
         usuario_prestador_id,
         usuario_receptor_id,
         nombre_receptor,
         fecha_limite,
         notas
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        ejemplar_id,
        usuario_prestador_id,
        usuario_receptor_id || null,
        nombre_receptor || null,
        fecha_limite || null,
        notas || null
      ]
    );

    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error creando préstamo' });
  }
});

// Devolver un préstamo:
// PATCH /api/prestamos/:id/devolver
router.patch('/prestamos/:id/devolver', requiereUsuario, async (req, res) => {
  const { id } = req.params;
  const { notas } = req.body;

  try {
    const resultado = await pool.query(
      `UPDATE prestamos
       SET estado = 'devuelto',
           fecha_devolucion = NOW(),
           notas = COALESCE($1, notas)
       WHERE id = $2
         AND (usuario_prestador_id = $3 OR usuario_receptor_id = $3)
       RETURNING *`,
      [notas || null, id, req.usuario.id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Préstamo no encontrado' });
    }

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error actualizando préstamo' });
  }
});
// Préstamos activos de un usuario
// GET /api/usuarios/:usuarioId/prestamos-activos
router.get('/usuarios/:usuarioId/prestamos-activos', soloPropio('usuarioId'), async (req, res) => {
  const { usuarioId } = req.params;

  try {
    const resultado = await pool.query(
      `SELECT
         p.id,
         p.ejemplar_id,
         p.usuario_prestador_id,
         prestador.nombre_usuario AS nombre_prestador,
         p.usuario_receptor_id,
         receptor.nombre_usuario AS nombre_receptor_usuario,
         p.nombre_receptor,
         p.fecha_prestamo,
         p.fecha_limite,
         p.fecha_devolucion,
         p.estado,
         p.notas,
         l.id AS libro_id,
         l.titulo,
         l.autores,
         l.isbn
       FROM prestamos p
       JOIN ejemplares e ON e.id = p.ejemplar_id
       JOIN libros l ON l.id = e.libro_id
       JOIN usuarios prestador ON prestador.id = p.usuario_prestador_id
       LEFT JOIN usuarios receptor ON receptor.id = p.usuario_receptor_id
       WHERE
         (p.usuario_prestador_id = $1 OR p.usuario_receptor_id = $1)
         AND p.estado <> 'devuelto'
       ORDER BY
         COALESCE(p.fecha_limite, p.fecha_prestamo) ASC,
         p.fecha_prestamo DESC`,
      [usuarioId]
    );

    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: 'Error obteniendo préstamos activos del usuario' });
  }
});

export default router;
