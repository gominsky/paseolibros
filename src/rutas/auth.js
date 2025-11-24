// src/rutas/auth.js
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../bd.js';

const router = Router();

// Opcional: más adelante podríamos añadir /registro aquí también

// Login: POST /api/auth/login
router.post('/login', async (req, res) => {
  const { nombre_usuario, contrasena } = req.body;

  if (!nombre_usuario || !contrasena) {
    return res.status(400).json({ error: 'nombre_usuario y contrasena son obligatorios' });
  }

  try {
    const resultado = await pool.query(
      'SELECT * FROM usuarios WHERE nombre_usuario = $1',
      [nombre_usuario]
    );

    if (resultado.rows.length === 0) {
      return res.status(400).json({ error: 'Usuario o contraseña incorrectos' });
    }

    const usuario = resultado.rows[0];

    const ok = await bcrypt.compare(contrasena, usuario.contrasena_hash);
    if (!ok) {
      return res.status(400).json({ error: 'Usuario o contraseña incorrectos' });
    }

    const token = jwt.sign(
      { id: usuario.id, nombre_usuario: usuario.nombre_usuario },
      process.env.JWT_SECRETO || 'cambia_esto_en_.env',
      { expiresIn: process.env.JWT_EXPIRACION || '7d' }
    );

    const { contrasena_hash, ...usuarioSinHash } = usuario;

    res.json({ usuario: usuarioSinHash, token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error en el login' });
  }
});

export default router;
