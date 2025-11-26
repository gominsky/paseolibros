// src/rutas/usuarios.js
import { Router } from 'express';
import pool from '../bd.js';
import bcrypt from 'bcryptjs';
const router = Router();

// Listar usuarios: GET /api/usuarios
router.get('/', async (req, res) => {
  try {
    const resultado = await pool.query(
      'SELECT id, nombre_usuario, correo, creado_en FROM usuarios ORDER BY id'
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error obteniendo usuarios' });
  }
});

// Crear usuario: POST /api/usuarios
// Crear usuario: POST /api/usuarios
router.post('/', async (req, res) => {
  const { nombre_usuario, correo, contrasena } = req.body;

  if (!nombre_usuario || !contrasena) {
    return res.status(400).json({ error: 'nombre_usuario y contrasena son obligatorios' });
  }

  try {
    // generar hash seguro
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(contrasena, salt);

    const resultado = await pool.query(
      `INSERT INTO usuarios (nombre_usuario, correo, contrasena_hash)
       VALUES ($1, $2, $3)
       RETURNING id, nombre_usuario, correo, creado_en`,
      [nombre_usuario, correo || null, hash]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    if (error.code === '23505') {
      return res.status(400).json({ error: 'El nombre de usuario ya está en uso' });
    }
    res.status(500).json({ error: 'Error creando usuario' });
  }
});

// Listar ejemplares de un usuario: GET /api/usuarios/:usuarioId/ejemplares
router.get('/:usuarioId/ejemplares', async (req, res) => {
  const { usuarioId } = req.params;

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
         e.creado_en
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
