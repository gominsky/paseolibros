// src/migraciones.js
// Aplica las migraciones de db/ al arrancar el servidor.
// Todas son idempotentes (IF NOT EXISTS), así que se pueden ejecutar en cada arranque.
// Así no hace falta conectarse con psql a la base de datos de Render.
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './bd.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'db');

// Añade aquí los ficheros nuevos, en orden
const MIGRACIONES = ['add3.sql', 'add4.sql'];

export async function aplicarMigraciones() {
  const cliente = await pool.connect();
  try {
    // Evita que dos instancias migren a la vez
    await cliente.query('SELECT pg_advisory_lock(727011)');
    for (const fichero of MIGRACIONES) {
      const sql = await fs.readFile(path.join(dir, fichero), 'utf8');
      await cliente.query(sql);
      console.log(`[migraciones] ${fichero} aplicada`);
    }
  } finally {
    await cliente.query('SELECT pg_advisory_unlock(727011)').catch(() => {});
    cliente.release();
  }
}
