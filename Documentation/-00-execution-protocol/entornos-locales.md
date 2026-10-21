# Entornos locales: emuladores de Firebase y modo local

Complemento de [-00-execution-protocol](-00-execution-protocol.md). Explica cómo corre Wallace System **en tu propio equipo** sin tocar la base de producción ni necesitar una cuenta de Google: qué se instaló, cómo se conecta la app a los emuladores, qué credenciales usar y cómo funciona el modo local.

## 1. Resumen

| Forma | Comando | Dirección | Datos | Login | Necesita |
|---|---|---|---|---|---|
| **Emuladores de Firebase** (recomendada) | `npm run emulador` | `http://localhost:3000/?emulador` | En memoria; se cargan de `importar-pruebas.json` si existe. Se borran al cerrar. | Firebase Authentication emulado (S1 completo: migración de cuentas, reglas) | Node 20+, Java 11+ |
| **Modo local** (sin nube) | `npx serve -s . -l 3000` | `http://localhost:3000/?local` | En el `localStorage` de ese navegador. Persisten hasta borrar los datos del sitio. | Usuarios y contraseñas con hash guardados en el navegador (sin Firebase) | Solo Node |
| **Proyecto de pruebas real** (`wallacesys-dev-sandbox`, listo) | `npx serve -s . -l 3000` | `http://localhost:3000/` | Firebase real, compartidos entre equipos | Firebase Authentication real (dueño `Admn-Wallacesys`) | Nada más: `PRUEBAS` ya está lleno. Siguientes pasos: [conexion-firebase](conexion-firebase.md) |

### Enlaces y credenciales (resumen)

En PowerShell, `npm.cmd`/`npx.cmd`. El servidor de la app se cierra con Ctrl+C.

| Para | Arrancar | Abrir | Entrar con |
|---|---|---|---|
| Firebase real de pruebas (sandbox) | `npx.cmd serve -s . -l 3000` | http://localhost:3000/ | `Admn-Wallacesys` + la contraseña que se creó en la configuración inicial (no está escrita en ningún archivo; si se olvida: [conexion-firebase, sección 5](conexion-firebase.md#5-recuperar-el-acceso-de-un-super-admin-que-olvidó-su-contraseña)) |
| Emuladores (Firebase simulado, se borra al cerrar) | `npm.cmd run emulador` | http://localhost:3000/?emulador | `dev` / `dev12345` (o los usuarios reales si existe `importar-pruebas.json`) |
| Modo local (sin nube, en el navegador) | `npx.cmd serve -s . -l 3000` | http://localhost:3000/?local | La primera vez se crea el dueño (configuración inicial). Los demos creados desde el panel: `demo`, `demo2`… con una contraseña al azar que se muestra al crearlos |
| Diagnóstico de conexión | el mismo servidor | http://localhost:3000/prueba.html | Opcional (prueba un inicio de sesión) |

**`localhost` nunca usa producción.** `firebase-config.js` solo usa producción en los dominios de `HOSTS_PRODUCCION` (vacío hasta que se defina el dominio público).

La pantalla de login dice siempre en qué entorno estás: "🧪 Emuladores locales de Firebase", "💻 Modo local: los datos solo quedan en este navegador" o "🧪 Entorno de PRUEBAS". En producción no muestra nada.

## 2. Qué se instaló y dónde

No se instaló nada global en Windows ni se usó ninguna cuenta de Google. Todo queda dentro de la carpeta del proyecto o en la caché de tu usuario.

### 2.1 Dependencias de desarrollo (npm)

Declaradas en `package.json` → `devDependencies`. Se instalan con `npm install` en `node_modules/` (que está en `.gitignore`). Render **no** las instala: el sitio publicado es estático y no las usa.

| Paquete | Para qué |
|---|---|
| `firebase-tools` | La CLI oficial de Firebase (`npx firebase …`). Arranca los emuladores y, más adelante, publica las reglas en el proyecto de pruebas. Trae el emulador de **Authentication** (en Node). |
| `firebase` | El SDK de JavaScript de Firebase para Node. Lo usan las pruebas de integración para hablar con los emuladores igual que el navegador. |
| `@firebase/rules-unit-testing` | Librería oficial para probar reglas de seguridad contra el emulador (`tests/reglas/`). |
| `puppeteer-core` | Controla Chrome sin ventana para probar la interfaz real (`tests/navegador/`). La versión `-core` no descarga ningún navegador: usa el Chrome que ya tienes. |
| `acorn`, `acorn-walk` | Analizador de JavaScript. La prueba estructural de la interfaz (`tests/ui/`) y `scripts/mapa-interfaz.mjs` lo usan para revisar nombres repetidos, identificadores sin declarar y `onclick` rotos. |

### 2.2 Descargado automáticamente por la CLI de Firebase

| Qué | Dónde | Cuándo |
|---|---|---|
| `firebase-database-emulator-v4.11.2.jar` (emulador de Realtime Database, programa Java) | `C:\Users\<tu usuario>\.cache\firebase\emulators\` | La primera vez que se arrancó un emulador de la base. Se reutiliza en adelante. |

### 2.3 Programas que ya estaban en el equipo

| Programa | Para qué |
|---|---|
| **Java** (Oracle JDK 23, `C:\Program Files\Common Files\Oracle\Java\javapath\java.exe`) | Ejecuta el emulador de la base de datos (el `.jar`). Hace falta Java 11 o superior. |
| **Google Chrome** (`C:\Program Files\Google\Chrome\Application\chrome.exe`) | Las pruebas de interfaz lo abren sin ventana. Si no está, sirve Edge, o la ruta en la variable `CHROME_PATH`. |
| **Node.js** (v23) | Ejecuta npm, los scripts y las pruebas. |

## 3. ¿Cómo se "conectó" a Firebase sin una cuenta?

**No se conectó a Firebase.** Todo lo que se probó corrió contra los **emuladores**: programas oficiales de Google que imitan Authentication y Realtime Database en tu equipo, sin internet ni cuenta.

### 3.1 El proyecto `demo-wallace`

Los emuladores se arrancan con `--project demo-wallace`. Firebase reserva el prefijo **`demo-`** para proyectos ficticios: la CLI sabe que no existen en Google, no pide iniciar sesión y bloquea cualquier intento de llegar a un servicio real. Por eso la CLI dice al arrancar: *"Detected demo project ID … attempts to access non-emulated services for this project will fail"*.

Puedes comprobar que no hay ninguna cuenta conectada:

```bash
npx firebase login:list      # → "No authorized accounts"
```

Tu cuenta de Google solo se usará cuando tú ejecutes `npx firebase login` (para el proyecto de pruebas real).

### 3.2 Puertos de los emuladores

Definidos en `firebase.json` → `emulators`. Solo escuchan en tu equipo (`127.0.0.1`).

| Puerto | Qué |
|---|---|
| 9000 | Realtime Database (Java) |
| 9099 | Authentication (Node) |
| 4400 / 4500 / 9150 | Coordinación interna de la CLI (hub, registros, websocket) |
| 3000 | La app (servidor web `npx serve`) — cambiable con `--puerto` |

La interfaz web de los emuladores (Emulator UI) está desactivada (`"ui": {"enabled": false}`) para no descargar nada más.

### 3.3 Cómo la app se conecta al emulador en vez de a la nube

1. Abres `http://localhost:3000/?emulador`.
2. `src/arranque.js` llama `elegirEntorno(location)` de `firebase-config.js`, que ve `localhost` + `?emulador` y devuelve:
   - `entorno: 'emulador'`
   - `config` con el proyecto `demo-wallace` (la clave `demo-key` no es real)
   - `emuladores: { database:'127.0.0.1:9000', auth:'127.0.0.1:9099' }`
3. `src/arranque.js` carga el SDK modular de Firebase y pasa `emuladores` a los dos adaptadores.
4. `src/adaptadores/salida/firebase-datos.js` → `iniciar()` llama `connectDatabaseEmulator(db, '127.0.0.1', 9000)` antes de cualquier lectura.
5. `src/adaptadores/salida/firebase-cuentas.js` → `iniciar()` llama `connectAuthEmulator(auth, 'http://127.0.0.1:9099')`; también la sesión secundaria "altas" con la que el super-admin crea cuentas.

Desde ahí la app funciona exactamente igual que con Firebase real: mismo SDK, mismas reglas de seguridad, mismo inicio de sesión. Lo único distinto es a qué dirección se conecta.

### 3.4 Cómo se cargan los datos y las reglas

El emulador acepta un **token de administrador local** (`Authorization: Bearer owner`) que salta las reglas. Solo existe en el emulador; en Firebase real no sirve. `scripts/emulador.mjs` lo usa por la API REST del emulador para:

- publicar las reglas: `PUT /.settings/rules.json` con `database.rules.transicion.json` (o `database.rules.json` con `--reglas cerradas`);
- cargar los datos: `PUT /.json` con el contenido de `importar-pruebas.json` bajo `data`;
- crear la **cuenta de desarrollo** (sección 4.3) con la API del emulador de Authentication (`accounts:signUp`).

## 4. Emuladores paso a paso (`npm run emulador`)

### 4.1 Preparar los datos (opcional, una vez)

```bash
node scripts/preparar-pruebas.mjs wallace-system-default-rtdb-export.json
```

Lee el export de la consola de Firebase (o un respaldo de la app), muestra un diagnóstico **sin contraseñas ni datos de clientes** y escribe `importar-pruebas.json` solo con el nodo `data`. Los dos archivos tienen datos reales: están en `.gitignore` y **nunca** deben subirse a Git ni compartirse.

Sin `importar-pruebas.json` el emulador arranca vacío.

### 4.2 Arrancar

```bash
npm run emulador                          # reglas de transición, datos de importar-pruebas.json
npm run emulador -- --reglas cerradas     # con las reglas finales
npm run emulador -- --puerto 3001         # si el 3000 está ocupado
npm run emulador -- --datos otro.json     # con otro archivo de datos
npm run emulador -- --sin-dev             # sin la cuenta de desarrollo
```

Qué hace, en orden (`scripts/emulador.mjs`):

1. Revisa que el puerto de la app esté libre. Si no, avisa y se detiene: suele ser otro `npx serve` abierto.
2. Cierra emuladores que hayan quedado vivos de una corrida anterior. Solo procesos de Firebase en los puertos del emulador; nunca otros programas.
3. Arranca `npx firebase emulators:start --only database,auth --project demo-wallace` y espera a que respondan.
4. Publica las reglas y carga los datos (3.4).
5. Crea la cuenta de desarrollo (4.3).
6. Arranca el servidor web y espera a que responda.
7. Muestra:
   ```
   ✅ Emuladores listos · reglas: database.rules.transicion.json · datos: importar-pruebas.json
      Cuenta de desarrollo:  usuario dev  ·  contraseña dev12345  (solo existe en este emulador)
      Abre  http://localhost:3000/?emulador     (Ctrl+C para terminar)
   ```

### 4.3 Credenciales para entrar

| Quién | Usuario | Contraseña | Notas |
|---|---|---|---|
| **Cuenta de desarrollo** (super-admin dueño) | `dev` | `dev12345` | La crea `scripts/emulador.mjs` **solo dentro del emulador**, en memoria. Ya está migrada (cuenta de Authentication + perfil + índice `login/`), así que entra con las reglas de transición y con las cerradas. No existe en producción ni en pruebas. Se omite con `--sin-dev`. |
| Usuarios reales (con `importar-pruebas.json`) | El de producción | La de producción | Son las cuentas del export. La primera vez cada una **migra** a Firebase Authentication. Quien tenga contraseña de menos de 6 caracteres debe elegir una nueva (solo en el emulador). Con `--reglas cerradas` las cuentas no migradas no entran: es el comportamiento real de la fase 4. |
| Sin datos (`importar-pruebas.json` no existe) | `dev` | `dev12345` | Desde el panel se crean negocios y demos (`demo`, `demo2`… con `demo123`). Con `--sin-dev` y sin datos aparece la configuración inicial para crear el dueño. |

**Para entrar a cualquier negocio sin conocer contraseñas:** entra como `dev` y en el panel usa **"Entrar"** (modo supervisión) en el negocio que quieras.

### 4.4 Qué se guarda

**Nada.** Los emuladores tienen todo en memoria: al cerrar, las cuentas creadas, las ventas de prueba y las migraciones desaparecen. Cada `npm run emulador` empieza de nuevo desde `importar-pruebas.json`.

El navegador sí recuerda la sesión (Firebase Authentication la guarda en el navegador). Al reiniciar el emulador esa sesión ya no existe y la app vuelve al login.

### 4.5 Terminar

**Ctrl+C** en la terminal. El script cierra el servidor web y los emuladores (en Windows también el proceso Java, que suele quedar vivo). Si algo quedó abierto, la siguiente corrida lo cierra al arrancar (paso 2).

### 4.6 Problemas comunes

| Mensaje | Causa | Qué hacer |
|---|---|---|
| `El puerto 3000 está ocupado` | Otro `npx serve` u otra app en el 3000 | Cerrarlo, o `npm run emulador -- --puerto 3001` |
| `Los emuladores no arrancaron (¿Java 11+ instalado?…)` | Falta Java, o algo que no es Firebase ocupa el 9000/9099 | `java -version`; revisar qué usa el puerto: `netstat -ano | findstr :9000` |
| `npm : No se puede cargar el archivo …npm.ps1` | Política de scripts de PowerShell | [-00, sección 1.1](-00-execution-protocol.md#11-windows-la-ejecución-de-scripts-está-deshabilitada) |
| El login muestra "💻 Modo local" | Se abrió con `?local` (o sin `?emulador` y con `PRUEBAS` vacío) | Abrir `http://localhost:3000/?emulador` |
| "No se pudo cargar la aplicación" | Un módulo de la interfaz no cargó (error de sintaxis o de `import`) | Ver la consola (F12); correr `npm test` (la prueba estructural dice qué import falla) |
| "Usuario o contraseña incorrectos" con un usuario real y `--reglas cerradas` | Ese usuario no migró: con las reglas finales ya no hay migración | Usar las reglas de transición, o entrar como `dev` → 🔐 Cuentas → "Crear cuenta" |

## 5. Modo local (sin nube)

### 5.1 Cuándo se activa

`elegirEntorno` (`firebase-config.js`) devuelve `config: null` y `entorno: 'local'` en dos casos:

- se abre con **`?local`** (`http://localhost:3000/?local`): fuerza el modo local aunque haya proyecto de pruebas. Es lo que usan las pruebas de navegador y `scripts/capturas.mjs`, para no escribir nunca en el proyecto de pruebas real;
- el dominio no es de producción, no se pidió `?emulador` y `PRUEBAS` está vacío.

Como `PRUEBAS` ya tiene el proyecto `wallacesys-dev-sandbox`, `http://localhost:3000/` sin nada **usa ese proyecto**, no el modo local.

En la consola del navegador, las funciones y el estado de la interfaz están en `WS` (`WS.STATE`, `WS.render()`); el dominio y los datos, en `Dominio`, `Datos`, `misDatos`… (puente).

### 5.2 Cómo funciona

- `Datos.iniciar()` (`firebase-datos.js`) ve que no hay configuración y **no conecta nada**. Todas las tablas viven en el `localStorage` del navegador con prefijo `ws_` (`src/adaptadores/salida/almacen-local.js`): `ws_negocios`, `ws_superadmins`, `ws_usuarios`, `ws_data_<negocio>_ventas`…
- No hay Firebase Authentication: el login compara la contraseña con el **hash con sal** guardado en el navegador (`dominio/contrasenas.js`), como antes de S1.
- La primera vez no hay super-admins: aparece la **configuración inicial** para crear el dueño del sistema (contraseña de 8 o más caracteres).
- Desde el panel se crean negocios y demos (usuario `demo`, `demo2`…; la contraseña al azar se muestra al crearlos).
- No hay sincronización: lo que hagas en un navegador no lo ve otro.

### 5.3 Dónde quedan los datos y cómo borrarlos

En el navegador, **por origen**: `http://localhost:3000` y `http://localhost:3001` son bases separadas, y Chrome y Edge también. Persisten al cerrar.

Para empezar de cero: herramientas de desarrollo (F12) → *Application* → *Storage* → **Clear site data**, o una ventana de incógnito.

Ningún dato del modo local sale del navegador.

## 6. Las pruebas automáticas usan lo mismo

`npm run test:firebase` (`scripts/probar-firebase.mjs`) arranca los mismos emuladores (`demo-wallace`, puertos 9000/9099), pero con **datos sintéticos** escritos en cada prueba, no con tu export. Corre:

- `tests/reglas/` (reglas de seguridad);
- `tests/integracion/` (migración S1 con los adaptadores reales);
- `tests/navegador/` (la app real en Chrome sin ventana, incluido un recorrido de todas las pantallas en modo local).

Al terminar los apaga. `npm test` no usa emuladores ni navegador.

## 7. Qué es seguro y qué no

| Seguro (no toca nada real) | Cuidado |
|---|---|
| `npm install`, `npm test`, `npm run test:firebase`, `npm run emulador`, `npx serve` | `npm run reglas:transicion` / `reglas:cerradas`: publican en el proyecto de **pruebas** real (cuando exista y hayas hecho `firebase login`) |
| Abrir `localhost` con o sin `?emulador` | `wallace-system-default-rtdb-export.json` e `importar-pruebas.json`: datos reales; no compartir ni subir |
| La cuenta `dev` / `dev12345` (solo existe en el emulador) | Llenar `HOSTS_PRODUCCION` o unir el código al repositorio original: a partir de ahí la app sí usa producción en ese dominio |
