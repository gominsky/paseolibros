// src/app.js
import express from 'express';
import dotenv from 'dotenv';
import pool from './bd.js';

import usuariosRouter from './rutas/usuarios.js';
import lecturasRouter from './rutas/lecturas.js';
import prestamosRouter from './rutas/prestamos.js';
import ejemplaresRouter from './rutas/ejemplares.js';
import authRouter from './rutas/auth.js';
import { verificarToken } from './middlewares/auth.js';
import librosRouter from './rutas/libros.js';

dotenv.config();

const app = express();

app.use(express.json());
app.use(express.static('public'));

// Ruta de salud (sin proteger)
app.get('/salud', async (req, res) => {
  try {
    const resultado = await pool.query('SELECT NOW()');
    res.json({ estado: 'ok', hora_bd: resultado.rows[0].now });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ estado: 'error', error: 'No se pudo conectar a la base de datos' });
  }
});

// 🔓 Rutas públicas
app.use('/api/auth', authRouter);

// 🔒 Rutas protegidas (todas pasan por verificarToken)
app.use('/api/ejemplares', verificarToken, ejemplaresRouter);
app.use('/api/usuarios', verificarToken, usuariosRouter);
app.use('/api/libros', verificarToken, librosRouter);
app.use('/api', verificarToken, lecturasRouter);
app.use('/api', verificarToken, prestamosRouter);

export default app;
