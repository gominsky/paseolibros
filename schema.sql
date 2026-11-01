-- ============================================================
-- PaseoLibros — esquema COMPLETO de la base de datos
-- Crea todo desde cero en una base vacía:
--   psql -U postgres -d paseolibros -f schema.sql
--
-- Contiene: el volcado original de producción + db/add1.sql (deseos, cola)
-- + db/add2.sql (favoritos, etiquetas, notas, audios)
-- + db/add3.sql (biblioteca compartida, libros recibidos, índices).
-- Para una base YA existente basta con ejecutar db/add3.sql.
-- ============================================================

--
-- PostgreSQL database dump
--

-- Dumped from database version 17.5
-- Dumped by pg_dump version 17.5

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: unaccent; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;


--
-- Name: EXTENSION unaccent; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION unaccent IS 'text search dictionary that removes accents';


--
-- Name: deseos_set_norm(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.deseos_set_norm() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.titulo_norm :=
    regexp_replace(lower(unaccent(coalesce(NEW.titulo,''))), '\s+', ' ', 'g');

  NEW.autores_norm :=
    regexp_replace(lower(unaccent(coalesce(NEW.autores,''))), '\s+', ' ', 'g');

  NEW.ubicacion_norm :=
    regexp_replace(lower(unaccent(coalesce(NEW.ubicacion,''))), '\s+', ' ', 'g');

  NEW.actualizado_en := now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION public.deseos_set_norm() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: auth_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.auth_tokens (
    id bigint NOT NULL,
    usuario_id integer NOT NULL,
    tipo text NOT NULL,
    token_hash text NOT NULL,
    expira_en timestamp with time zone NOT NULL,
    usado_en timestamp with time zone,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT auth_tokens_tipo_check CHECK ((tipo = ANY (ARRAY['reset_password'::text, 'verify_email'::text])))
);


ALTER TABLE public.auth_tokens OWNER TO postgres;

--
-- Name: auth_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.auth_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.auth_tokens_id_seq OWNER TO postgres;

--
-- Name: auth_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.auth_tokens_id_seq OWNED BY public.auth_tokens.id;


--
-- Name: deseos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.deseos (
    id bigint NOT NULL,
    usuario_id bigint NOT NULL,
    titulo text NOT NULL,
    autores text,
    isbn text,
    tipo text DEFAULT 'libro'::text,
    ubicacion text,
    prioridad integer DEFAULT 2 NOT NULL,
    notas text,
    url_portada text,
    titulo_norm text DEFAULT ''::text NOT NULL,
    autores_norm text DEFAULT ''::text NOT NULL,
    ubicacion_norm text DEFAULT ''::text NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT deseos_prioridad_check CHECK (((prioridad >= 1) AND (prioridad <= 3)))
);


ALTER TABLE public.deseos OWNER TO postgres;

--
-- Name: deseos_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.deseos_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.deseos_id_seq OWNER TO postgres;

--
-- Name: deseos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.deseos_id_seq OWNED BY public.deseos.id;


--
-- Name: ejemplares; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ejemplares (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    libro_id integer NOT NULL,
    estado character varying(20),
    ubicacion character varying(100),
    notas text,
    creado_en timestamp without time zone DEFAULT now(),
    activo boolean DEFAULT true NOT NULL,
    tipo text DEFAULT 'libro'::text
);


ALTER TABLE public.ejemplares OWNER TO postgres;

--
-- Name: ejemplares_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.ejemplares_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ejemplares_id_seq OWNER TO postgres;

--
-- Name: ejemplares_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.ejemplares_id_seq OWNED BY public.ejemplares.id;


--
-- Name: lecturas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.lecturas (
    id integer NOT NULL,
    usuario_id integer NOT NULL,
    libro_id integer NOT NULL,
    ejemplar_id integer,
    estado character varying(20) NOT NULL,
    inicio timestamp without time zone DEFAULT now() NOT NULL,
    fin timestamp without time zone,
    pagina_actual integer,
    valoracion integer,
    notas text,
    CONSTRAINT lecturas_valoracion_check CHECK (((valoracion >= 1) AND (valoracion <= 5)))
);


ALTER TABLE public.lecturas OWNER TO postgres;

--
-- Name: lecturas_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.lecturas_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.lecturas_id_seq OWNER TO postgres;

--
-- Name: lecturas_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.lecturas_id_seq OWNED BY public.lecturas.id;


--
-- Name: libros; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.libros (
    id integer NOT NULL,
    isbn character varying(20) NOT NULL,
    titulo text NOT NULL,
    autores text,
    editorial text,
    fecha_publicacion character varying(20),
    numero_paginas integer,
    descripcion text,
    url_portada text,
    creado_en timestamp without time zone DEFAULT now()
);


ALTER TABLE public.libros OWNER TO postgres;

--
-- Name: libros_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.libros_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.libros_id_seq OWNER TO postgres;

--
-- Name: libros_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.libros_id_seq OWNED BY public.libros.id;


--
-- Name: prestamos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.prestamos (
    id integer NOT NULL,
    ejemplar_id integer NOT NULL,
    usuario_prestador_id integer NOT NULL,
    usuario_receptor_id integer,
    nombre_receptor character varying(100),
    fecha_prestamo timestamp without time zone DEFAULT now() NOT NULL,
    fecha_limite date,
    fecha_devolucion timestamp without time zone,
    estado character varying(20) DEFAULT 'activo'::character varying NOT NULL,
    notas text
);


ALTER TABLE public.prestamos OWNER TO postgres;

--
-- Name: prestamos_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.prestamos_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.prestamos_id_seq OWNER TO postgres;

--
-- Name: prestamos_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.prestamos_id_seq OWNED BY public.prestamos.id;


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.usuarios (
    id integer NOT NULL,
    nombre_usuario character varying(50) NOT NULL,
    correo character varying(100),
    contrasena_hash text NOT NULL,
    creado_en timestamp without time zone DEFAULT now()
);


ALTER TABLE public.usuarios OWNER TO postgres;

--
-- Name: usuarios_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.usuarios_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.usuarios_id_seq OWNER TO postgres;

--
-- Name: usuarios_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.usuarios_id_seq OWNED BY public.usuarios.id;


--
-- Name: auth_tokens id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.auth_tokens ALTER COLUMN id SET DEFAULT nextval('public.auth_tokens_id_seq'::regclass);


--
-- Name: deseos id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deseos ALTER COLUMN id SET DEFAULT nextval('public.deseos_id_seq'::regclass);


--
-- Name: ejemplares id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ejemplares ALTER COLUMN id SET DEFAULT nextval('public.ejemplares_id_seq'::regclass);


--
-- Name: lecturas id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lecturas ALTER COLUMN id SET DEFAULT nextval('public.lecturas_id_seq'::regclass);


--
-- Name: libros id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.libros ALTER COLUMN id SET DEFAULT nextval('public.libros_id_seq'::regclass);


--
-- Name: prestamos id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.prestamos ALTER COLUMN id SET DEFAULT nextval('public.prestamos_id_seq'::regclass);


--
-- Name: usuarios id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuarios ALTER COLUMN id SET DEFAULT nextval('public.usuarios_id_seq'::regclass);


--
-- Name: auth_tokens auth_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.auth_tokens
    ADD CONSTRAINT auth_tokens_pkey PRIMARY KEY (id);


--
-- Name: deseos deseos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deseos
    ADD CONSTRAINT deseos_pkey PRIMARY KEY (id);


--
-- Name: ejemplares ejemplares_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ejemplares
    ADD CONSTRAINT ejemplares_pkey PRIMARY KEY (id);


--
-- Name: lecturas lecturas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lecturas
    ADD CONSTRAINT lecturas_pkey PRIMARY KEY (id);


--
-- Name: libros libros_isbn_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.libros
    ADD CONSTRAINT libros_isbn_key UNIQUE (isbn);


--
-- Name: libros libros_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.libros
    ADD CONSTRAINT libros_pkey PRIMARY KEY (id);


--
-- Name: prestamos prestamos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.prestamos
    ADD CONSTRAINT prestamos_pkey PRIMARY KEY (id);


--
-- Name: usuarios usuarios_nombre_usuario_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_nombre_usuario_key UNIQUE (nombre_usuario);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: auth_tokens_token_hash_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX auth_tokens_token_hash_idx ON public.auth_tokens USING btree (token_hash);


--
-- Name: auth_tokens_usuario_tipo_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX auth_tokens_usuario_tipo_idx ON public.auth_tokens USING btree (usuario_id, tipo);


--
-- Name: idx_deseos_autores_trgm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deseos_autores_trgm ON public.deseos USING gin (autores_norm public.gin_trgm_ops) WHERE (autores_norm <> ''::text);


--
-- Name: idx_deseos_titulo_trgm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deseos_titulo_trgm ON public.deseos USING gin (titulo_norm public.gin_trgm_ops) WHERE (titulo_norm <> ''::text);


--
-- Name: idx_deseos_ubicacion_trgm; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deseos_ubicacion_trgm ON public.deseos USING gin (ubicacion_norm public.gin_trgm_ops) WHERE (ubicacion_norm <> ''::text);


--
-- Name: idx_deseos_usuario_creado; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deseos_usuario_creado ON public.deseos USING btree (usuario_id, creado_en DESC);


--
-- Name: idx_deseos_usuario_tipo; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_deseos_usuario_tipo ON public.deseos USING btree (usuario_id, tipo);


--
-- Name: idx_ejemplares_libro_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ejemplares_libro_id ON public.ejemplares USING btree (libro_id);


--
-- Name: idx_ejemplares_usuario_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ejemplares_usuario_id ON public.ejemplares USING btree (usuario_id);


--
-- Name: idx_lecturas_libro_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lecturas_libro_id ON public.lecturas USING btree (libro_id);


--
-- Name: idx_lecturas_usuario_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_lecturas_usuario_id ON public.lecturas USING btree (usuario_id);


--
-- Name: idx_prestamos_prestador_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_prestamos_prestador_id ON public.prestamos USING btree (usuario_prestador_id);


--
-- Name: idx_prestamos_receptor_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_prestamos_receptor_id ON public.prestamos USING btree (usuario_receptor_id);


--
-- Name: uq_deseos_usuario_isbn; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uq_deseos_usuario_isbn ON public.deseos USING btree (usuario_id, isbn) WHERE ((isbn IS NOT NULL) AND (length(TRIM(BOTH FROM isbn)) > 0));


--
-- Name: deseos trg_deseos_set_norm; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER trg_deseos_set_norm BEFORE INSERT OR UPDATE OF titulo, autores, isbn, tipo, ubicacion, prioridad, notas, url_portada ON public.deseos FOR EACH ROW EXECUTE FUNCTION public.deseos_set_norm();


--
-- Name: auth_tokens auth_tokens_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.auth_tokens
    ADD CONSTRAINT auth_tokens_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: deseos deseos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.deseos
    ADD CONSTRAINT deseos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: ejemplares ejemplares_libro_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ejemplares
    ADD CONSTRAINT ejemplares_libro_id_fkey FOREIGN KEY (libro_id) REFERENCES public.libros(id) ON DELETE CASCADE;


--
-- Name: ejemplares ejemplares_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ejemplares
    ADD CONSTRAINT ejemplares_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: lecturas lecturas_ejemplar_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lecturas
    ADD CONSTRAINT lecturas_ejemplar_id_fkey FOREIGN KEY (ejemplar_id) REFERENCES public.ejemplares(id) ON DELETE SET NULL;


--
-- Name: lecturas lecturas_libro_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lecturas
    ADD CONSTRAINT lecturas_libro_id_fkey FOREIGN KEY (libro_id) REFERENCES public.libros(id) ON DELETE CASCADE;


--
-- Name: lecturas lecturas_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.lecturas
    ADD CONSTRAINT lecturas_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: prestamos prestamos_ejemplar_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.prestamos
    ADD CONSTRAINT prestamos_ejemplar_id_fkey FOREIGN KEY (ejemplar_id) REFERENCES public.ejemplares(id) ON DELETE CASCADE;


--
-- Name: prestamos prestamos_usuario_prestador_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.prestamos
    ADD CONSTRAINT prestamos_usuario_prestador_id_fkey FOREIGN KEY (usuario_prestador_id) REFERENCES public.usuarios(id) ON DELETE CASCADE;


--
-- Name: prestamos prestamos_usuario_receptor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.prestamos
    ADD CONSTRAINT prestamos_usuario_receptor_id_fkey FOREIGN KEY (usuario_receptor_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--


-- ============================================================
-- db/add1.sql — Lista de deseos (normalización) y cola de lectura
-- ============================================================
SET search_path = public;

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE ejemplares
  ADD COLUMN IF NOT EXISTS tipo TEXT;

ALTER TABLE ejemplares
  ALTER COLUMN tipo SET DEFAULT 'libro';

CREATE TABLE IF NOT EXISTS deseos (
  id            BIGSERIAL PRIMARY KEY,
  usuario_id    BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,

  titulo        TEXT NOT NULL,
  autores       TEXT,
  isbn          TEXT,

  tipo          TEXT DEFAULT 'libro',
  ubicacion     TEXT,   -- ← aquí guardas “Salón - Estantería 1”, etc.

  prioridad     INT  NOT NULL DEFAULT 2 CHECK (prioridad BETWEEN 1 AND 3),
  notas         TEXT,
  url_portada   TEXT,

  titulo_norm   TEXT NOT NULL DEFAULT '',
  autores_norm  TEXT NOT NULL DEFAULT '',
  ubicacion_norm TEXT NOT NULL DEFAULT '',

  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION deseos_set_norm()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.titulo_norm :=
    regexp_replace(lower(unaccent(coalesce(NEW.titulo,''))), '\s+', ' ', 'g');

  NEW.autores_norm :=
    regexp_replace(lower(unaccent(coalesce(NEW.autores,''))), '\s+', ' ', 'g');

  NEW.ubicacion_norm :=
    regexp_replace(lower(unaccent(coalesce(NEW.ubicacion,''))), '\s+', ' ', 'g');

  NEW.actualizado_en := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_deseos_set_norm ON deseos;

CREATE TRIGGER trg_deseos_set_norm
BEFORE INSERT OR UPDATE OF titulo, autores, isbn, tipo, ubicacion, prioridad, notas, url_portada
ON deseos
FOR EACH ROW
EXECUTE FUNCTION deseos_set_norm();
CREATE INDEX IF NOT EXISTS idx_deseos_usuario_creado
  ON deseos (usuario_id, creado_en DESC);

CREATE INDEX IF NOT EXISTS idx_deseos_titulo_trgm
  ON deseos USING gin (titulo_norm gin_trgm_ops)
  WHERE titulo_norm <> '';

CREATE INDEX IF NOT EXISTS idx_deseos_autores_trgm
  ON deseos USING gin (autores_norm gin_trgm_ops)
  WHERE autores_norm <> '';

CREATE INDEX IF NOT EXISTS idx_deseos_ubicacion_trgm
  ON deseos USING gin (ubicacion_norm gin_trgm_ops)
  WHERE ubicacion_norm <> '';

CREATE INDEX IF NOT EXISTS idx_deseos_usuario_tipo
  ON deseos (usuario_id, tipo);

-- Evitar duplicados si hay ISBN
CREATE UNIQUE INDEX IF NOT EXISTS uq_deseos_usuario_isbn
  ON deseos (usuario_id, isbn)
  WHERE isbn IS NOT NULL AND length(trim(isbn)) > 0;

CREATE TABLE cola_lecturas (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  ejemplar_id INTEGER NOT NULL REFERENCES ejemplares(id) ON DELETE CASCADE,
  posicion INTEGER NOT NULL DEFAULT 999999,
  notas TEXT,
  creado_en TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Evita duplicados del mismo ejemplar en la cola de un usuario
CREATE UNIQUE INDEX cola_lecturas_usuario_ejemplar_uq
  ON cola_lecturas(usuario_id, ejemplar_id);

-- Para ordenar rápido
CREATE INDEX cola_lecturas_usuario_posicion_idx
  ON cola_lecturas(usuario_id, posicion, creado_en DESC);

-- ============================================================
-- db/add2.sql — Panel del lector: favoritos, etiquetas, notas y audios
-- ============================================================
SET search_path = public;

BEGIN;

-- 1) Favoritos (1 fila por usuario+libro)
CREATE TABLE IF NOT EXISTS public.libro_favoritos (
  usuario_id integer NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  libro_id   integer NOT NULL REFERENCES public.libros(id)   ON DELETE CASCADE,
  creado_en  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (usuario_id, libro_id)
);

-- 2) Etiquetas (tags) (varias filas por usuario+libro)
CREATE TABLE IF NOT EXISTS public.libro_tags (
  id         bigserial PRIMARY KEY,
  usuario_id integer NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  libro_id   integer NOT NULL REFERENCES public.libros(id)   ON DELETE CASCADE,
  tag        text NOT NULL,
  creado_en  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT libro_tags_tag_len CHECK (length(btrim(tag)) > 0)
);

-- Evita duplicados del mismo tag en el mismo libro para el mismo usuario
CREATE UNIQUE INDEX IF NOT EXISTS uq_libro_tags_usuario_libro_tag
  ON public.libro_tags (usuario_id, libro_id, lower(tag));

CREATE INDEX IF NOT EXISTS idx_libro_tags_usuario_libro
  ON public.libro_tags (usuario_id, libro_id);

-- 3) Notas de texto (historial por libro)
CREATE TABLE IF NOT EXISTS public.libro_notas (
  id            bigserial PRIMARY KEY,
  usuario_id    integer NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  libro_id      integer NOT NULL REFERENCES public.libros(id)   ON DELETE CASCADE,
  texto         text NOT NULL,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT libro_notas_texto_len CHECK (length(btrim(texto)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_libro_notas_usuario_libro
  ON public.libro_notas (usuario_id, libro_id, creado_en DESC);

-- Trigger para actualizar actualizado_en
CREATE OR REPLACE FUNCTION public.set_actualizado_en()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.actualizado_en := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_libro_notas_actualizado ON public.libro_notas;
CREATE TRIGGER trg_libro_notas_actualizado
BEFORE UPDATE OF texto ON public.libro_notas
FOR EACH ROW EXECUTE FUNCTION public.set_actualizado_en();

-- 4) Audios (metadata en BD; el archivo va a disco o S3)
CREATE TABLE IF NOT EXISTS public.libro_audios (
  id          bigserial PRIMARY KEY,
  usuario_id  integer NOT NULL REFERENCES public.usuarios(id) ON DELETE CASCADE,
  libro_id    integer NOT NULL REFERENCES public.libros(id)   ON DELETE CASCADE,
  storage     text NOT NULL DEFAULT 'local',   -- 'local' o 's3'
  path        text NOT NULL,                  -- ruta local o key/url
  mime        text NOT NULL,
  bytes       bigint NOT NULL,
  duracion_ms integer,
  creado_en   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_libro_audios_usuario_libro
  ON public.libro_audios (usuario_id, libro_id, creado_en DESC);

COMMIT;

-- ============================================================
-- db/add3.sql — Biblioteca compartida, libros recibidos e índices
-- ============================================================
SET search_path = public;

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
