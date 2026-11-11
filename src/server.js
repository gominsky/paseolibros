// src/servidor.js
import dotenv from 'dotenv';
import app from './app.js';
import { aplicarMigraciones } from './migraciones.js';

dotenv.config();

const puerto = process.env.PUERTO || 3011;

// Pone la base de datos al día (columnas y tablas nuevas) antes de atender peticiones.
// Si falla, se avisa en el log pero el servidor arranca igualmente.
try {
  await aplicarMigraciones();
} catch (err) {
  console.error('[migraciones] Error al aplicar migraciones:', err.message);
}

app.listen(puerto, () => {
  console.log(`Servidor escuchando en el puerto ${puerto}`);
});
