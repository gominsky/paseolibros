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

---

# Segunda tanda — noviembre 2026

## ⚠️ Antes de desplegar

1. **Ejecutar en la base de datos de Render** (no borra nada; se puede repetir):
   `psql "<External Database URL de Render>" -f db/add3.sql`
   Crea las tablas `biblioteca_compartida` y `libros_recibidos` si faltaran, y un índice para el listado.
2. **Borrar los ficheros antiguos** (ahora se generan desde `public/js/` y `public/css/`):
   `git rm public/main.js public/styles.css`
3. Para que funcione «He olvidado mi contraseña» hay que configurar en Render
   `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` y `APP_URL`.
   Antes el enlace **nunca se enviaba**: solo se escribía en el log (con el token).

## ➕ Vista previa y aviso de duplicado al dar de alta

- Al escribir o escanear un ISBN aparece debajo una tarjeta con portada, título, autor, editorial, año y páginas.
- Si ya lo tienes: «⚠️ Ya lo tienes (2 ejemplares): Salón, Dormitorio» con botón **Ver ficha**.
- Si el número tiene el dígito de control mal, lo dice antes de buscar. Si nadie lo conoce, avisa de que se creará como «Libro desconocido».
- Al pulsar **Crear ejemplar** sobre un libro que ya tienes, pide confirmación. La importación CSV cuenta aparte los que ya tenías.
- Servidor: `GET /api/ejemplares/consulta/:isbn`. El libro consultado queda en el catálogo, así el alta posterior es instantánea.

## 🔒 Seguridad (rutas que faltaban)

| Fallo | Riesgo | Corrección |
|---|---|---|
| Subir portada sin sesión, a cualquier libro y de cualquier tipo | Subir un `.html` a `/uploads` = página maliciosa dentro de tu dominio | Sesión + ser dueño + solo JPG/PNG/WebP/GIF |
| Audios publicados en `/uploads/audios/` | Cualquiera podía oír tus notas de voz; también admitía `.html` | Ya no son públicos; solo por la API y solo audio |
| `url_portada` admitía `/uploads/../src/app.js` | Al «quitar portada» se borraba ese fichero del servidor | Validación + borrado limitado a `uploads/` |
| «Portada por URL» consultaba cualquier dirección | El servidor podía usarse para sondear su red interna | Bloqueadas IPs privadas/locales y redirecciones |
| Cola y deseos de otro usuario visibles cambiando el número | Fuga de datos | Solo los propios |
| Meter en tu cola ejemplares ajenos; buscar portada de libros ajenos | Manipulación | Comprobación de propiedad |
| Recuperar contraseña: el enlace con el token se escribía en el log | Quien viera los logs podía cambiar contraseñas | Se envía por correo; no se registra en producción |
| Sin límite de intentos en registro y recuperación | Abuso / spam | Mismo límite que el login |
| Contraseñas de cualquier longitud | Cuentas débiles | Mínimo 8 caracteres |
| Secretos JWT de respaldo escritos en el código | Si faltaba la variable, sesiones falsificables | Eliminados |

Verificado con 46 pruebas automáticas (dos usuarios intentando acceder a lo del otro, subidas trampa, etc.).

## 🗄️ schema.sql completo

`schema.sql` crea ahora las **14 tablas** en una base vacía (antes 7: faltaban deseos normalizados, cola, favoritos,
etiquetas, notas, audios, biblioteca compartida y libros recibidos). Probado en PostgreSQL 17 desde cero.
Scripts: `npm run bd:init` (base nueva) y `npm run bd:actualizar` (base existente).

## 🧹 Código ordenado

`main.js` (4.900 líneas) y `styles.css` (3.400) se han dividido por secciones:

```
public/js/   core · ejemplares · vista-previa · lecturas · prestamos · ficha · cola-deseos · init ·
             lector · compartir · portadas · estadisticas · ayuda · estanteria · voz · libros-recibidos
public/css/  base · componentes · escaner · modales · movil · auth · estetica · ficha · compartir ·
             portadas · estadisticas · ayuda · ficha-movil · estanteria · libros-recibidos · escaner-isbn · vista-previa
```

- El orden de carga está en `js/orden.json` y `css/orden.json`. **Un fichero nuevo hay que añadirlo ahí.**
- El servidor (`src/bundle.js`) los une al vuelo en `/main.js` y `/styles.css`: el móvil sigue haciendo una sola descarga.
  En desarrollo se regenera en cada recarga; en producción se cachea con ETag.
- Comprobado que la unión es idéntica al original y que la app se ve **píxel a píxel igual** (capturas antes/después).
- Eliminadas 22 reglas CSS que ya no se usaban (80 líneas) y separadores con caracteres corruptos.

## Otros arreglos

- Iconos 📝 y 🎙️ de las insignias (se habían perdido; salía «⭐ 1 1 Título»).
- Estadísticas: si Chart.js no carga (sin conexión), se muestran las cifras igualmente.

## Pendiente

- Portadas en Render: siguen perdiéndose en cada despliegue (disco efímero).
- Escaneo en ráfaga e ISBN-10 → 13 (puntos 1 y 4 de la lista de mejoras).

---

# Tercera tanda — login obligatorio

**Problema:** la app se abría «como si hubiera sesión» sin estarlo. Causas:
1. La versión anterior del servidor no comprobaba la sesión: con un token caducado seguía devolviendo los libros.
2. La app daba por buena la sesión guardada en el móvil sin mirar si había caducado. Con Render dormido (hasta ~1 min)
   o sin conexión, se quedaba así todo ese tiempo.
3. Al cerrar o caducar la sesión, los libros quedaban pintados detrás del login, que era semitransparente.
4. Algunas partes de la app no reaccionaban cuando el servidor respondía «sesión no válida» (401).

**Solución:**
- Al arrancar, un token caducado se descarta al instante (sin esperar al servidor) → login directo.
- Después se confirma con el servidor (`GET /api/auth/sesion`): token de otro secreto o usuario borrado → login.
- Cualquier respuesta 401 de la API, desde cualquier parte de la app, cierra la sesión y muestra el login.
- Si la sesión caduca con la app abierta, o al volver a ella tras tenerla en segundo plano, se pide login.
- Cerrar sesión en una pestaña la cierra en las demás.
- Pantalla de login opaca y por encima de todo; al cerrar sesión se borran de pantalla y de memoria los datos.

Probado: token válido, sin sesión, caducado, de otro secreto, usuario borrado, login, logout y caducidad con la app abierta.

### Ajuste (10/11): la app no se muestra hasta confirmar la sesión

Seguía apareciendo la pantalla principal cuando el móvil tenía guardada una sesión **sin caducar pero que el servidor
ya no acepta** (por ejemplo, tras cambiar `JWT_SECRETO`). La app se enseñaba mientras esperaba la respuesta del
servidor, y con Render dormido eso podía durar hasta un minuto.

Ahora:
- Con sesión guardada, el cuadro de login muestra «Comprobando tu sesión…» y la app sigue oculta hasta que el servidor responde.
- A los 4 s avisa: «El servidor se está despertando, puede tardar hasta un minuto…».
- Si el servidor no acepta la sesión → formulario de login. Si la acepta → la app.
- Sin conexión: «No se puede conectar con el servidor» con botones **Reintentar** y **Entrar con otra cuenta**.

---

# Cuarta tanda — nuevo aspecto (10/11)

- **Paleta verde tinta** (#2F5D50) con detalles dorados (#B8913A) sobre papel; tema oscuro a juego.
  Botones lisos sin degradado, sombras más suaves, sin el marco de color alrededor de la página.
  Los colores están en `css/base.css` (variables `--accent`, `--gold`, `--on-accent`…).
- **Portadas tipográficas generadas** (`js/tapas.js`): si un libro no tiene portada, o la imagen no carga,
  se dibuja una tapa de tela con el título y el autor. El color sale del título (siempre el mismo para cada libro).
- **Cuadrícula de portadas grandes**, por defecto en el móvil (3 por fila). Insignias ⭐/📝 en la esquina.
- **Tarjetas de lista limpias**: portada, título, autor y solo los datos rellenos. Fuera las pastillas «—» y el ISBN.
  La antigua «✕» de las tarjetas (en realidad abría la ficha) es ahora una flecha; toda la tarjeta abre la ficha.
- **Pestañas inferiores en el móvil** (`js/navegacion.js`): Biblioteca · Leyendo · + · Préstamos · Estadísticas,
  con el número de lecturas en curso y préstamos activos. Recuerda la pestaña al recargar.
- **Escritorio**: cabecera más baja con el buscador dentro; «Préstamos activos» ya no se sale por la derecha;
  cabeceras de tabla uniformes; filas alineadas.
- Estilos nuevos en `css/nuevo-look.css` (último de `css/orden.json`).
