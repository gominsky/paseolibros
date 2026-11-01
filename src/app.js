// src/app.js
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import compression from 'compression';
import { servirBundle } from './bundle.js';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// Rate limiter simple en memoria para login, registro y recuperación de contraseña
const loginAttempts = new Map();
function loginRateLimiter(req, res, next) {
  // con 'trust proxy' req.ip es la IP real del cliente; contador separado por ruta
  const ip = `${req.ip || 'unknown'}|${req.baseUrl}`;
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
      error: `Demasiados intentos. Espera ${Math.ceil(retryAfter / 60)} minutos.`
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
import pool from './bd.js';
import portadasRutas from './rutas/portadas.js';
import librosRecibidosRutas from './rutas/libros_recibidos.js';

dotenv.config();
if (!process.env.JWT_SECRETO) {
  throw new Error('Falta JWT_SECRETO en variables de entorno');
}

const app = express();

// Render (y casi cualquier hosting) pone un proxy delante: sin esto req.ip es
// la IP del proxy y el límite de intentos de login se comparte entre TODOS.
app.set('trust proxy', 1);

// Comprime JS/CSS/HTML/JSON (main.js pasa de ~180 KB a ~40 KB por la red)
app.use(compression());

const uploadsDir = path.join(process.cwd(), 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
// Solo se publican IMÁGENES de /uploads (los audios van por /api, con permisos).
// Cada portada subida tiene un nombre único → se puede cachear "para siempre".
app.use('/uploads', (req, res, next) => {
  if (!/^\/[\w.-]+\.(jpe?g|png|webp|gif)$/i.test(req.path)) return res.status(404).end();
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
}, express.static(uploadsDir, { maxAge: '30d', immutable: true, index: false }));

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
app.use(morgan(process.env.NODE_ENV === 'production' ? 'tiny' : 'dev'));
app.use(express.json({ limit: '200kb' }));
// Cabeceras de seguridad básicas (sin helmet completo para no romper fuentes/CDN)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});

// Servir frontend estático desde /public (si lo estás usando así)
// main.js y styles.css se generan uniendo public/js/ y public/css/ (ver src/bundle.js)
const publicDir = path.join(__dirname, '..', 'public');
app.get('/main.js', servirBundle(path.join(publicDir, 'js'), 'application/javascript; charset=utf-8'));
app.get('/styles.css', servirBundle(path.join(publicDir, 'css'), 'text/css; charset=utf-8'));
// Las piezas sueltas no se publican (evita servir código a medias)
app.use(['/js', '/css'], (req, res) => res.status(404).end());

// El HTML/JS/CSS se revalida (ETag) para que las actualizaciones lleguen;
// iconos e imágenes se cachean una semana.
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders(res, filePath) {
    if (/\.(png|jpe?g|webp|svg|ico)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800');
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

// Servir SW y manifest con cabeceras correctas para PWA
app.get('/service-worker.js', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.setHeader('Service-Worker-Allowed', '/');
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, '..', 'public', 'service-worker.js'));
});
app.get('/manifest.json', (req, res) => {
  res.setHeader('Content-Type', 'application/manifest+json');
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(__dirname, '..', 'public', 'manifest.json'));
});

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
app.use('/api/auth/register', loginRateLimiter);
app.use('/api/auth/forgot-password', loginRateLimiter);
app.use('/api/auth/reset-password', loginRateLimiter);
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
app.use('/api', librosRecibidosRutas);
// Endpoint de salud
app.get('/api/health', (req, res) => {
  res.json({ ok: true, mensaje: 'PaseoLibros API viva 😄' });
});

// (Eliminado /api/admin/limpiar-portadas-rotas: tenía la clave escrita en el código,
//  que es público en GitHub. Si se necesita, hacerlo con SQL desde la consola de Render.)
app.use((err, req, res, next) => {
  console.error('🔥 Unhandled error:', err);
  res.status(500).json({ error: 'Error interno' });
});

export default app;
