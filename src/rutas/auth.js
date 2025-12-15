// src/rutas/auth.js
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../bd.js';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
const router = Router();
const ROUNDS = Number(process.env.BCRYPT_ROUNDS || 12);

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}
function generarToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Email (si no hay SMTP, lo “simulamos” en consola)
const transporter = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

async function enviarEmail({ to, subject, text }) {
  if (!transporter) {
    console.log('📧 Email simulado a:', to);
    console.log(subject);
    console.log(text);
    return;
  }
  await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    text,
  });
}

router.post('/register', async (req, res) => {
  const { nombre_usuario, correo, contrasena } = req.body || {};
  if (!nombre_usuario || !correo || !contrasena) {
    return res.status(400).json({ error: 'Faltan campos.' });
  }

  try {
    const hash = await bcrypt.hash(contrasena, ROUNDS);

    await pool.query(
      `INSERT INTO usuarios (nombre_usuario, correo, contrasena_hash)
       VALUES ($1,$2,$3)`,
      [nombre_usuario.trim(), correo.trim().toLowerCase(), hash]
    );

    return res.status(201).json({ ok: true });
  } catch (e) {
    if (e?.code === '23505') return res.status(409).json({ error: 'Usuario o correo ya existe.' });
    console.error(e);
    return res.status(500).json({ error: 'Error en el registro.' });
  }
});


/* =========================
   FORGOT PASSWORD
   POST /api/auth/forgot-password
   body: { correo }
   -> siempre devuelve ok
   ========================= */
router.post('/forgot-password', async (req, res) => {
  const { correo } = req.body || {};
  if (!correo) return res.status(400).json({ error: 'Correo requerido.' });

  try {
    const r = await pool.query(
      `SELECT id, correo FROM usuarios WHERE correo=$1 LIMIT 1`,
      [correo.trim().toLowerCase()]
    );

    // Respuesta neutra por defecto
    if (r.rowCount === 0) return res.json({ ok: true });

    const usuarioId = r.rows[0].id;

    // invalida tokens anteriores
    await pool.query(
      `UPDATE auth_tokens SET usado_en=now()
       WHERE usuario_id=$1 AND tipo='reset_password' AND usado_en IS NULL`,
      [usuarioId]
    );

    const token = generarToken();
    const tokenHash = sha256(token);

    await pool.query(
      `INSERT INTO auth_tokens (usuario_id, tipo, token_hash, expira_en)
       VALUES ($1,'reset_password',$2, now() + interval '30 minutes')`,
      [usuarioId, tokenHash]
    );

    const appUrl = process.env.APP_URL || 'http://localhost:3011';
    const link = `${appUrl}/?reset=${token}`;

    console.log('🔗 [DEV] Reset link:', link);

    if (process.env.NODE_ENV === 'development') {
      return res.json({ ok: true, dev_reset_link: link });
    }
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.json({ ok: true }); // neutro
  }
});


/* =========================
   RESET PASSWORD
   POST /api/auth/reset-password
   body: { token, nuevaContrasena }
   ========================= */
router.post('/reset-password', async (req, res) => {
  const { token, nuevaContrasena } = req.body || {};
  if (!token || !nuevaContrasena) return res.status(400).json({ error: 'Faltan campos.' });

  try {
    const tokenHash = sha256(token);

    const r = await pool.query(
      `SELECT id, usuario_id FROM auth_tokens
       WHERE tipo='reset_password'
         AND token_hash=$1
         AND usado_en IS NULL
         AND expira_en > now()
       LIMIT 1`,
      [tokenHash]
    );

    if (r.rowCount === 0) return res.status(400).json({ error: 'Token inválido o caducado.' });

    const hash = await bcrypt.hash(nuevaContrasena, ROUNDS);

    await pool.query(`UPDATE usuarios SET contrasena_hash=$1 WHERE id=$2`, [hash, r.rows[0].usuario_id]);
    await pool.query(`UPDATE auth_tokens SET usado_en=now() WHERE id=$1`, [r.rows[0].id]);

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Error al cambiar la contraseña.' });
  }
});


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
