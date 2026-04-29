// src/rutas/biblioteca_compartida.js
// Compartir biblioteca entre usuarios registrados (solo lectura)
//
// TABLA SQL necesaria (ejecutar una vez):
// ------------------------------------------------------------
// CREATE TABLE biblioteca_compartida (
//   id            SERIAL PRIMARY KEY,
//   propietario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
//   invitado_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
//   creado_en      TIMESTAMPTZ DEFAULT NOW(),
//   UNIQUE (propietario_id, invitado_id)
// );
// CREATE INDEX ON biblioteca_compartida(invitado_id);
// ------------------------------------------------------------

import { Router } from 'express';
import pool from '../bd.js';

const router = Router();

// Middleware: requiere sesión
function requireAuth(req, res, next) {
  if (!req.usuario?.id) return res.status(401).json({ error: 'No autenticado' });
  next();
}

// ── GET /api/biblioteca-compartida/conmigo
// Bibliotecas que otros han compartido con el usuario logueado
router.get('/biblioteca-compartida/conmigo', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT bc.id, bc.creado_en,
              u.id AS propietario_id, u.nombre_usuario AS propietario
       FROM biblioteca_compartida bc
       JOIN usuarios u ON u.id = bc.propietario_id
       WHERE bc.invitado_id = $1
       ORDER BY bc.creado_en DESC`,
      [req.usuario.id]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error obteniendo bibliotecas compartidas' });
  }
});

// ── GET /api/biblioteca-compartida/compartidas
// Usuarios con los que el logueado ha compartido su biblioteca
router.get('/biblioteca-compartida/compartidas', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT bc.id, bc.creado_en,
              u.id AS invitado_id, u.nombre_usuario AS invitado
       FROM biblioteca_compartida bc
       JOIN usuarios u ON u.id = bc.invitado_id
       WHERE bc.propietario_id = $1
       ORDER BY bc.creado_en DESC`,
      [req.usuario.id]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error obteniendo lista de compartidos' });
  }
});

// ── POST /api/biblioteca-compartida
// Compartir biblioteca con otro usuario { nombre_usuario }
router.post('/biblioteca-compartida', requireAuth, async (req, res) => {
  const { nombre_usuario } = req.body;
  if (!nombre_usuario?.trim()) {
    return res.status(400).json({ error: 'Indica el nombre de usuario' });
  }

  if (nombre_usuario.trim() === req.usuario.nombre_usuario) {
    return res.status(400).json({ error: 'No puedes compartir contigo mismo' });
  }

  try {
    // Buscar el usuario invitado
    const { rows: found } = await pool.query(
      'SELECT id, nombre_usuario FROM usuarios WHERE nombre_usuario = $1',
      [nombre_usuario.trim()]
    );
    if (!found.length) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    const invitado = found[0];

    // Insertar (ignorar si ya existe)
    await pool.query(
      `INSERT INTO biblioteca_compartida (propietario_id, invitado_id)
       VALUES ($1, $2)
       ON CONFLICT (propietario_id, invitado_id) DO NOTHING`,
      [req.usuario.id, invitado.id]
    );

    res.status(201).json({
      ok: true,
      mensaje: `Biblioteca compartida con ${invitado.nombre_usuario}`,
      invitado: { id: invitado.id, nombre_usuario: invitado.nombre_usuario }
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error compartiendo biblioteca' });
  }
});

// ── DELETE /api/biblioteca-compartida/:id
// Revocar acceso (solo el propietario puede revocar)
router.delete('/biblioteca-compartida/:id', requireAuth, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      `DELETE FROM biblioteca_compartida
       WHERE id = $1 AND propietario_id = $2`,
      [req.params.id, req.usuario.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Acceso no encontrado' });
    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error revocando acceso' });
  }
});

// ── GET /api/biblioteca-compartida/ver/:propietario_id
// Ver la biblioteca de otro usuario (solo si te la han compartido)
router.get('/biblioteca-compartida/ver/:propietario_id', requireAuth, async (req, res) => {
  const propietarioId = Number(req.params.propietario_id);

  try {
    // Verificar que el propietario ha compartido con el invitado
    const { rows: acceso } = await pool.query(
      `SELECT id FROM biblioteca_compartida
       WHERE propietario_id = $1 AND invitado_id = $2`,
      [propietarioId, req.usuario.id]
    );
    if (!acceso.length) {
      return res.status(403).json({ error: 'No tienes acceso a esta biblioteca' });
    }

    // Datos del propietario
    const { rows: propRows } = await pool.query(
      'SELECT id, nombre_usuario FROM usuarios WHERE id = $1',
      [propietarioId]
    );
    if (!propRows.length) return res.status(404).json({ error: 'Usuario no encontrado' });

    // Ejemplares del propietario
    const { rows: ejemplares } = await pool.query(
      `SELECT ej.id AS ejemplar_id, ej.estado, ej.ubicacion, ej.notas, ej.tipo,
              l.id AS libro_id, l.titulo, l.autores, l.isbn,
              l.editorial, l.fecha_publicacion, l.numero_paginas,
              l.url_portada
       FROM ejemplares ej
       JOIN libros l ON l.id = ej.libro_id
       WHERE ej.usuario_id = $1
       ORDER BY l.titulo ASC`,
      [propietarioId]
    );

    res.json({
      propietario: propRows[0],
      total: ejemplares.length,
      ejemplares
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error cargando biblioteca compartida' });
  }
});

export default router;
