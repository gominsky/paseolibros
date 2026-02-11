// src/app.js
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import authRutas from './rutas/auth.js';
import usuariosRutas from './rutas/usuarios.js';
import ejemplaresRutas from './rutas/ejemplares.js';
import librosRutas from './rutas/libros.js';
import lecturasRutas from './rutas/lecturas.js';
import prestamosRutas from './rutas/prestamos.js';
import deseosRouter from './rutas/deseos.js';
import colaRouter from './rutas/cola.js'
import shareRutas from './rutas/share.js';
import readerRoutes from "./rutas/reader.js";

const app = express();

const uploadsDir = path.join(process.cwd(), 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Middlewares básicos
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Servir frontend estático desde /public (si lo estás usando así)
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Middleware para sacar el usuario del JWT (si lo hay)
app.use((req, res, next) => {
  const auth = req.headers.authorization || '';
  const [tipo, token] = auth.split(' ');

  if (tipo === 'Bearer' && token) {
    try {
      const payload = jwt.verify(
        token,
        process.env.JWT_SECRETO || 'paseolibros_JWT_$9fK2!xQmA7zR'
      );
      req.usuario = { id: payload.id, nombre_usuario: payload.nombre_usuario };
    } catch (e) {
      req.usuario = null;
    }
  }

  next();
});

// Rutas API
app.use('/api/auth', authRutas);
app.use('/api/usuarios', usuariosRutas);
app.use('/api/ejemplares', ejemplaresRutas);
app.use('/api/libros', librosRutas);
app.use('/api', lecturasRutas);   // /api/usuarios/:id/lecturas-abiertas, etc.
app.use('/api', prestamosRutas);  // /api/usuarios/:id/prestamos-activos, etc.
app.use('/api', deseosRouter);
app.use('/api', shareRutas);
app.use('/api', colaRouter);
app.use("/api", readerRoutes);
// Endpoint de salud
app.get('/api/health', (req, res) => {
  res.json({ ok: true, mensaje: 'PaseoLibros API viva 😄' });
});
app.use((err, req, res, next) => {
  console.error('🔥 Unhandled error:', err);
  res.status(500).json({ error: 'Error interno' });
});

export default app;
