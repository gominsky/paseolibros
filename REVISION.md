# Revisión a fondo de PaseoLibros — noviembre 2026

## ⚠️ Acciones manuales urgentes (no se pueden hacer desde el código)

1. **Clave SSH `sshdani` publicada.** El repositorio es público y contenía la clave privada.
   Aunque tiene contraseña, hay que darla por comprometida:
   - Borrarla de GitHub → Settings → SSH and GPG keys (y de cualquier servidor donde esté autorizada).
   - Generar una nueva: `ssh-keygen -t ed25519 -C "gominsky@gmail.com"` y guardarla en `~/.ssh/`, nunca dentro del proyecto.
   - Este cambio la quita del repo, pero sigue en el historial de Git. Para borrarla del todo: `git filter-repo --path sshdani --path sshdani.pub --invert-paths` y `git push --force`, o hacer el repositorio privado.
2. **Cambiar `JWT_SECRETO` en Render.** En el historial aparece un antiguo valor por defecto
   (`paseolibros_JWT_...`). Si en Render se usa ese mismo valor, cualquiera puede fabricar sesiones.
   Poner uno nuevo y largo (`openssl rand -hex 32`). Todos tendréis que volver a iniciar sesión.
3. **Portadas subidas en Render se pierden.** El disco de Render es efímero: en cada despliegue o reinicio
   se borra `uploads/` (por eso existía el endpoint de "limpiar portadas rotas"). Opciones: añadir un
   *Persistent Disk* en Render, guardar la imagen en PostgreSQL (bytea) o usar solo URLs externas.

## 📷 Escáner ISBN (móvil)

Había **dos escáneres** (`scanner.js` y otro dentro de `main.js`); se usaba el de `main.js`. Problemas:

| Problema | Efecto | Solución |
|---|---|---|
| Linterna encendida siempre | Reflejos en portadas brillantes → no lee | Apagada; botón 💡 si la cámara la tiene |
| `facingMode: environment` a secas | En móviles con varias cámaras abría el gran angular, que no enfoca de cerca | Elige la cámara trasera principal y la recuerda |
| Analizaba 1080p en cada fotograma (60/s) | Móvil caliente, lento, batería | ~10 análisis/s sobre la franja central reducida |
| Aceptaba cualquier código de 13 dígitos | Lecturas falsas | Solo 978/979 con dígito de control válido y 2 lecturas iguales |
| ZXing cargado desde unpkg al abrir la página | Bloqueaba la carga; si fallaba, **toda la app dejaba de funcionar** | Se carga solo al escanear y solo si no hay lector nativo (iPhone) |
| En móvil no había forma de cerrar el escáner | — | Botón Cancelar, Escape, se cierra al cambiar de app |

Además: zoom 1,5× si la cámara lo permite (deja separar el móvil, donde sí enfoca), marco guía, vibración
al leer y el foco salta a "Ubicación".

## 🐢 Rendimiento

| Causa | Antes (400 libros, móvil) | Ahora |
|---|---|---|
| `?t=Date.now()` en cada portada | Se descargaban **todas** en cada repintado: 2.906 descargas al escribir una búsqueda | Caché normal; solo se fuerza al cambiar una portada |
| Una petición por libro para favorito/notas (N+1, 5 consultas SQL cada una) | 400 peticiones extra al abrir | 0: vienen en el listado |
| Tabla de escritorio rellena también en móvil (oculta) | Doble DOM y doble descarga | Solo se pinta la vista visible |
| Sin `loading="lazy"` | Se pedían 400 portadas al cargar | Solo las visibles (13) |
| Sin compresión gzip | main.js 175 KB | 38 KB |
| logo.png | 694 KB (1697 px) | 39 KB |
| Fuentes: Poppins (sin usar) + Fraunces + `@import` bloqueante | 3 peticiones encadenadas | 1 |
| Buscador sin espera | Repintaba en cada tecla | Espera 180 ms |
| Service worker cache-first | Los cambios no llegaban al móvil sin cambiar la versión | Stale-while-revalidate |
| Consultas a Google/Open Library sin límite de tiempo | Alta de libro colgada si tardaban | 6 s máximo |

Medido en navegador móvil simulado: carga 9,2 s → 2,8 s.

## 🔒 Seguridad (corregido en el código)

- `GET /api/usuarios` devolvía todos los usuarios **con su correo** sin pedir sesión.
- `GET /api/ejemplares` devolvía los libros de todos; `/api/usuarios/:id/ejemplares` los de cualquiera cambiando el número.
- Lecturas y préstamos no comprobaban la sesión: se podían crear/terminar/devolver en nombre de otro.
  Ahora el usuario sale siempre del token y solo se ven/modifican los propios.
- `POST /api/usuarios` creaba cuentas sin control (el alta va por `/api/auth/register`).
- Endpoint `/api/admin/limpiar-portadas-rotas` con la clave escrita en el código público: eliminado.
- `trust proxy`: en Render el límite de intentos de login era compartido por todos los usuarios.
- `main.js` escribía el token en la consola; autores/editorial se pintaban sin escapar (XSS).

## Otros arreglos

- Mensaje "Lectura iniciada" salía con código roto (`libro?.titulo ? ...`).
- Las insignias (⭐, notas) se actualizan al marcar favorito o añadir notas.
- Eliminada la dependencia `bcrypt` (nativa, no se usaba; acelera el despliegue). Añadida `compression`.

## Pendiente recomendado (no tocado)

- `main.js` tiene 5.000 líneas y `styles.css` ha vuelto a 3.300 (había quedado en ~550). Conviene dividirlo por módulos.
- `schema.sql` no incluye las tablas `biblioteca_compartida` ni `libros_recibidos`.
- `helmet` y `express-rate-limit` están instalados pero no se usan.
