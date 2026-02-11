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

