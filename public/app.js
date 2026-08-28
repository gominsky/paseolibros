// src/app.js
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Rate limiter simple en memoria para /api/auth/login
const loginAttempts = new Map();
function loginRateLimiter(req, res, next) {
  const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutos
  const maxAttempts = 15;

  const entry = loginAttempts.get(ip) || { count: 0, resetAt: now + windowMs };

  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
  }

  entry.count++;
  loginAttempts.set(ip, entry);

  if (entry.count > maxAttempts) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    res.setHeader('Retry-After', retryAfter);
    return res.status(429).json({
      error: `Demasiados intentos de login. Espera ${Math.ceil(retryAfter / 60)} minutos.`
    });
  }
  next();
}

// Limpieza periódica para evitar memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts.entries()) {
    if (now > entry.resetAt) loginAttempts.delete(ip);
  }
}, 10 * 60 * 1000);
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
import bcRutas from './rutas/biblioteca_compartida.js';
import portadasRutas from './rutas/portadas.js';

dotenv.config();
if (!process.env.JWT_SECRETO) {
  throw new Error('Falta JWT_SECRETO en variables de entorno');
}

const app = express();

const uploadsDir = path.join(process.cwd(), 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
app.use('/uploads', express.static(uploadsDir));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Middlewares básicos
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: function(origin, cb) {
    // Permite requests sin origin (curl, server-to-server)
    if (!origin) return cb(null, true);
    if (allowedOrigins.length === 0) return cb(null, true); // si aún no lo configuras
    return cb(null, allowedOrigins.includes(origin));
  },
  credentials: false,
}));
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
        process.env.JWT_SECRETO
      );
      req.usuario = { id: payload.id, nombre_usuario: payload.nombre_usuario };
    } catch (e) {
      req.usuario = null;
    }
  }

  next();
});

// Rutas API
app.use('/api/auth/login', loginRateLimiter);
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
app.use('/api', bcRutas);
app.use('/api', portadasRutas);
// Endpoint de salud
app.get('/api/health', (req, res) => {
  res.json({ ok: true, mensaje: 'PaseoLibros API viva 😄' });
});
app.use((err, req, res, next) => {
  console.error('🔥 Unhandled error:', err);
  res.status(500).json({ error: 'Error interno' });
});

export default app;
