-- db/add3.sql
-- Tablas que usaba la aplicación pero no estaban en schema.sql
-- (biblioteca compartida y libros que me prestan) + índices de rendimiento.
-- Se puede ejecutar varias veces sin problema.

CREATE TABLE IF NOT EXISTS public.biblioteca_compartida (
  id             SERIAL PRIMARY KEY,
  propietario_id INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  invitado_id    INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (propietario_id, invitado_id)
);
CREATE INDEX IF NOT EXISTS idx_bc_invitado ON public.biblioteca_compartida (invitado_id);

CREATE TABLE IF NOT EXISTS public.libros_recibidos (
  id             SERIAL PRIMARY KEY,
  usuario_id     INTEGER NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  titulo         TEXT NOT NULL,
  autores        TEXT,
  prestador      TEXT NOT NULL,
  fecha_recibido DATE DEFAULT CURRENT_DATE,
  fecha_devolver DATE,
  notas          TEXT,
  devuelto       BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_devuelto DATE,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lr_usuario ON public.libros_recibidos (usuario_id, devuelto);

-- Rendimiento: listado de ejemplares del usuario y comprobaciones de acceso
CREATE INDEX IF NOT EXISTS idx_ejemplares_usuario_activo
  ON public.ejemplares (usuario_id, libro_id) WHERE activo = TRUE;
