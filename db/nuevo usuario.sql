CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO usuarios (nombre_usuario, correo, contrasena_hash)
VALUES (
  'gominsky',
  'gominsky@gmail.com',
  crypt('*******', gen_salt('bf'))
);