// src/app.js
import express from 'express';
import dotenv from 'dotenv';
import pool from './bd.js';

import usuariosRouter from './rutas/usuarios.js';
import lecturasRouter from './rutas/lecturas.js';
import prestamosRouter from './rutas/prestamos.js';
import ejemplaresRouter from './rutas/ejemplares.js';

dotenv.config();

const app = express();
app.use(express.json());

// 👉 Servir archivos estáticos de la carpeta "public"
app.use(express.static('public'));

// ----------- Rutas básicas -----------

// Deja solo /salud como endpoint "técnico"
app.get('/salud', async (req, res) => {
  try {
    const resultado = await pool.query('SELECT NOW()');
    res.json({ estado: 'ok', hora_bd: resultado.rows[0].now });
  } catch (error) {
    console.error(error);
    res.status(500).json({ estado: 'error', error: 'No se pudo conectar a la base de datos' });
  }
});

// ----------- Montaje de rutas de la API -----------

app.use('/api/usuarios', usuariosRouter);
app.use('/api', lecturasRouter);
app.use('/api', prestamosRouter);
app.use('/api/ejemplares', ejemplaresRouter);

export default app;
