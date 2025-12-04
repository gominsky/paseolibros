// src/servidor.js
import dotenv from 'dotenv';
import app from './app.js';

dotenv.config();

const puerto = process.env.PUERTO || 3011;

app.listen(puerto, () => {
  console.log(`Servidor escuchando en el puerto ${puerto}`);
});
