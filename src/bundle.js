// src/bundle.js
// Une los ficheros fuente del frontend en una sola respuesta, sin herramientas
// de compilación:
//   public/js/*.js   (orden en public/js/orden.json)   → GET /main.js
//   public/css/*.css (orden en public/css/orden.json)  → GET /styles.css
//
// Así el código está repartido por secciones para mantenerlo, pero el móvil
// sigue descargando un único fichero de cada tipo.
// En producción se construye una vez y se cachea en memoria (con ETag);
// en desarrollo se reconstruye en cada petición para ver los cambios al instante.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const PRODUCCION = process.env.NODE_ENV === 'production';

function construir(dir) {
  const orden = JSON.parse(fs.readFileSync(path.join(dir, 'orden.json'), 'utf8'));
  const cuerpo = orden
    .map((item) => fs.readFileSync(path.join(dir, item.fichero), 'utf8'))
    .join('\n');
  const etag = '"' + crypto.createHash('sha1').update(cuerpo).digest('base64url').slice(0, 20) + '"';
  return { cuerpo, etag };
}

export function servirBundle(dir, contentType) {
  let cache = null;
  return (req, res, next) => {
    try {
      if (!cache || !PRODUCCION) cache = construir(dir);
    } catch (e) {
      return next(e);
    }
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-cache'); // revalida con ETag: 304 si no ha cambiado
    res.setHeader('ETag', cache.etag);
    if (req.headers['if-none-match'] === cache.etag) return res.status(304).end();
    res.send(cache.cuerpo);
  };
}
