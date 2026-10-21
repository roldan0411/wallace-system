# 00 — Protocolo de ejecución

Cómo poner a correr Wallace System, configurarlo contra Firebase, desplegarlo, respaldarlo, verificar que funciona después de un cambio y montar el entorno de pruebas (sección 9).

## 1. Requisitos

| Necesidad | Detalle |
|---|---|
| Navegador | Chrome/Edge/Firefox recientes. Usa `localStorage`, `AudioContext`, `FileReader`, `canvas`, `window.open` + `print()`. |
| Servidor estático | Cualquiera. El proyecto trae `npx serve` (`package.json`) y `render.yaml` para Render. |
| Internet | Para Google Fonts y el SDK **modular** de Firebase (`gstatic.com`, v10.12.2; `src/adaptadores/salida/firebase-sdk.js`). Solo se descarga si hay base configurada: en modo local la app no lo necesita. |
| Firebase (opcional) | Proyecto con **Realtime Database** y **Authentication (correo y contraseña)**. Se usan `firebase-app-compat`, `firebase-database-compat` y `firebase-auth-compat` (no Firestore, no Storage). |
| Ventanas emergentes | Deben estar permitidas: facturas, comandas, cierres e informes se imprimen abriendo una ventana nueva. |

No hay paso de compilación, dependencias de npm en tiempo de ejecución ni variables de entorno (salvo `$PORT` para `serve`). Para las pruebas automáticas hace falta **Node 20 o superior** (`npm test`); para las de Firebase, además **Java 11+** y Chrome o Edge (`npm run test:firebase`). Las dependencias de desarrollo (`firebase-tools`, `@firebase/rules-unit-testing`, `firebase`, `puppeteer-core`, `acorn`) se instalan con `npm install` y no se publican.

### 1.1 Windows: "la ejecución de scripts está deshabilitada"

En Windows, la terminal de VS Code suele ser **PowerShell**, que por defecto no ejecuta scripts `.ps1`. Como `npm` y `npx` se lanzan con `npm.ps1` / `npx.ps1`, el primer `npm install` falla con:

```
npm : No se puede cargar el archivo C:\Program Files\nodejs\npm.ps1 porque la ejecución de scripts está deshabilitada en este sistema.
```

No es un error del proyecto. Cualquiera de estas opciones lo resuelve:

| Opción | Cómo | Nota |
|---|---|---|
| Permitir scripts para tu usuario (**recomendada**, una sola vez) | `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`, responder `S` y abrir una terminal nueva | Es lo que recomienda Microsoft para desarrollo: permite los scripts locales (npm) y exige firma a los descargados. Solo afecta a tu usuario; no necesita administrador. |
| Usar las versiones `.cmd` | `npm.cmd install`, `npm.cmd test`, `npx.cmd firebase login` | No cambia nada del sistema; hay que escribir `.cmd` siempre. |
| Usar otra terminal | En VS Code: flecha junto al **+** de la terminal → **Command Prompt** o **Git Bash** | Ahí `npm` funciona tal cual. |

Para ver la configuración actual: `Get-ExecutionPolicy -List`.

## 2. Ejecución local

```bash
# Opción A: servidor del proyecto
npm install
PORT=3000 npm start          # npx serve -s . -l $PORT

# Opción B: cualquier servidor estático
npx serve -s . -l 3000
python -m http.server 3000
```

Abrir `http://localhost:3000`.

> **Ya no funciona abrir `index.html` con doble clic (`file://`).** Desde la reorganización en módulos (ver 2.1), el navegador bloquea la carga de módulos desde `file://`. Siempre hay que servir la carpeta por HTTP con cualquiera de los comandos de arriba.

### 2.1 Cómo se cargan los módulos del código

El código está organizado en arquitectura hexagonal dentro de `src/` (detalle en [-03-architecture](../-03-architecture/-03-architecture.md)). Hay dos formas de que el navegador junte esos archivos. **Se usa la opción 1**; la opción 2 queda documentada por si se necesita más adelante.

| | Opción 1 — Módulos ES nativos ✅ en uso | Opción 2 — Empaquetador (Vite) |
|---|---|---|
| Cómo funciona | `index.html` carga `<script type="module" src="src/arranque.js">`. Cada archivo declara lo que usa de otros (`import … from './dominio/pagos.js'`) y el navegador los descarga y conecta solo. | Una herramienta (Vite) junta todos los archivos en uno o pocos archivos optimizados dentro de `dist/` antes de publicar. |
| Paso de compilación | Ninguno. Lo que hay en la carpeta es lo que corre. | `npm run build` antes de cada publicación. |
| Publicar | Igual que siempre: `git push` → Render sirve los archivos. | Render debe ejecutar `npm install && npm run build` y publicar la carpeta `dist/`. |
| Qué instalar | Nada nuevo. | Node y las dependencias de desarrollo (`vite`). |
| A favor | Simple, sin pasos extra, fácil de revisar y depurar. | Menos archivos que descargar, código minificado, recarga instantánea al desarrollar, fácil de sumar pruebas de interfaz (Vitest). |
| En contra | El navegador descarga una docena de archivos pequeños en vez de uno (no se nota con este tamaño). No funciona con `file://`. | Una pieza más que puede fallar al publicar; lo que corre no es exactamente lo que está en la carpeta. |

#### Opción 1 (en uso): qué tener en cuenta
- Servir siempre por HTTP (local o Render). Los tipos MIME deben ser correctos (`text/javascript` para `.js`); `serve`, `python -m http.server` y Render ya lo hacen.
- Rutas de `import` **relativas y con extensión** (`'./dominio/pagos.js'`, nunca `'./dominio/pagos'`).
- `index.html` carga **un solo** script, el módulo `src/arranque.js`, que importa todo lo demás: `firebase-config.js` (elige la base por dominio), el SDK modular de Firebase (solo si hay base), los módulos de dominio, adaptadores y puente; al final `arranque.js` importa `src/adaptadores/entrada/ui/manifiesto.js`, cuya `cargarInterfaz()` importa los 47 módulos de la interfaz, y llama `iniciarInterfaz()` (`-03-architecture`, sección 11.3).
- Caché: `render.yaml` sirve `/src/*` con `Cache-Control: no-cache` (el navegador revalida cada módulo y recibe 304 si no cambió), así no se mezclan módulos viejos y nuevos tras publicar. Los módulos **no** llevan `?v=` (un módulo con dos URL serían dos copias). Los estilos sí: `?v=VERSION_UI` en `index.html`.

#### Opción 2 (documentada, no activa): cómo migrar si se decide
1. Instalar: `npm install --save-dev vite`.
2. En `package.json`:
   ```json
   "scripts": {
     "dev": "vite",
     "build": "vite build",
     "preview": "vite preview",
     "start": "npx serve -s dist -l $PORT",
     "test": "node --test \"tests/**/*.test.mjs\""
   }
   ```
3. `index.html` no cambia: Vite entiende `<script type="module" src="src/arranque.js">`. Ya no hay scripts clásicos (desde el 2026-10-11 `firebase-config.js` es un módulo y el logo está en `ui/nucleo/logo.js`). El SDK de Firebase podría pasar a instalarse con npm (`firebase`) en vez de bajarse de gstatic.
4. La interfaz ya son módulos ES, pero `cargarInterfaz()` los importa con `import('./'+archivo)` (rutas calculadas): con Vite hay que cambiarlo por `import.meta.glob('./**/*.js')` o importaciones fijas.
5. En `render.yaml`: `buildCommand: npm install && npm run build` y `staticPublishPath: dist`.
6. Desarrollo local: `npm run dev` (recarga automática). Verificar el resultado final con `npm run build && npm run preview`.

### 2.2 Pruebas automáticas

```bash
npm test          # = node --test "tests/**/*.test.mjs"
```

Prueban las reglas del dominio (`src/dominio/`) sin navegador ni Firebase: fechas y jornada, pagos divididos, caja, inventario y lotes, combos, consecutivo de facturas, contraseñas y cuentas (S1); y el servicio de inicio de sesión con dobles de los puertos. Se ejecutan en segundos. Deben pasar antes de cada publicación.

```bash
npm run test:firebase   # emuladores de Auth + Database (proyecto demo-wallace, en memoria)
```

Levanta los emuladores, corre `tests/reglas/` (reglas cerradas y de transición), `tests/integracion/` (migración S1 con los adaptadores reales) y `tests/navegador/` (la app real en Chrome sin ventana, incluido el modo local) y los apaga. Obligatorio antes de publicar cambios en reglas, login, usuarios o `firebase-datos.js`.

### 2.3 La app completa con emuladores (sin nube)

```bash
node scripts/preparar-pruebas.mjs <export>.json   # opcional: datos reales → importar-pruebas.json (no va a Git)
npm run emulador                                   # reglas de transición; --reglas cerradas para las finales
```

Abrir `http://localhost:3000/?emulador`. Todo corre en el equipo: cuentas, base y reglas. Al cerrar (Ctrl+C) no queda nada. Sirve para ensayar la migración con los datos reales sin crear todavía el proyecto de pruebas.

Cuenta de desarrollo (solo existe en el emulador): **`dev` / `dev12345`**. Cómo funcionan los emuladores y el modo local, qué se instaló y qué credenciales usar: **[entornos-locales.md](entornos-locales.md)**.

### Modos de funcionamiento

| Modo | Cuándo ocurre | Comportamiento |
|---|---|---|
| **Nube** | `firebase-config.js` tiene `databaseURL` válido y el SDK cargó | Lee las tablas globales, sincroniza en tiempo real, indicador verde "Sincronizado". |
| **Local** | Sin configuración, `apiKey==='TU_API_KEY'`, o el SDK no cargó | Todo vive en `localStorage` con prefijo `ws_`. Ideal para pruebas; los datos no salen del navegador. |
| **Nube lenta** | La nube no responde en 12 s | Arranca con el respaldo local (`iniciarInterfaz` en `ui/nucleo/arranque.js`) y sigue intentando sincronizar. |

Secuencia de arranque: `index.html` → `src/arranque.js` (elige la base con `firebase-config.js`, carga el SDK modular si hay base, crea los adaptadores y el puente) → importa los módulos de `ui/manifiesto.js` → `iniciarInterfaz()` → `Datos.iniciar()` → con cuentas de Firebase: sesión guardada o login (`arrancarCuentas`); sin ellas: `Datos.cargarGlobales()` → `arrancar()` → `seed()` + `render()`.

## 3. Configurar Firebase

1. Crear un proyecto en Firebase y habilitar **Realtime Database**.
2. Copiar la configuración web en `firebase-config.js`, en el bloque que corresponda (`PRUEBAS` para un proyecto de pruebas; `PRODUCCION` solo el de la empresa):
   ```js
   export const PRUEBAS = { apiKey, authDomain, databaseURL, projectId, storageBucket, messagingSenderId, appId };
   ```
   `databaseURL` es obligatorio; sin él el sistema se queda en modo local.
   `firebase-config.js` elige la base según el dominio: producción solo en `HOSTS_PRODUCCION`, el resto usa `PRUEBAS` (o modo local si está vacío). Activar también *Authentication → Email/Password*.
3. Publicar las **reglas de seguridad** (S1): `database.rules.transicion.json` mientras se migran las cuentas y `database.rules.json` al final (`npm run reglas:transicion` / `npm run reglas:cerradas`, o pegarlas en *Realtime Database → Reglas*). Orden y motivos en [-02-corrections → S1](../-02-corrections/-02-corrections.md#s1--base-de-datos-sin-autenticación-ni-reglas--implementado-falta-desplegar). Nunca publicar reglas abiertas en la raíz.
4. Abrir `prueba.html` en el mismo host: dice si cargaron las librerías, el entorno elegido, si hay conexión, qué reglas están publicadas (transición o cerradas) y si la migración de tablas ya se hizo; permite probar un inicio de sesión. No escribe nada.

### 3.1 Qué significa "cerrar la base"

Publicar las reglas finales (`npm run reglas:cerradas`) **no bloquea la base ni la deja inutilizable**: cambia **quién puede entrar a los datos**.

| | Reglas de transición (`database.rules.transicion.json`) | Reglas cerradas (`database.rules.json`) |
|---|---|---|
| La app | Funciona | Funciona igual: se inicia sesión, se vende, se abre caja… |
| Acceso a `data` sin sesión | **Abierto**: cualquiera con la URL lee y escribe | **Negado** ("Permission denied") |
| Un empleado | Técnicamente podría leer otros negocios | Solo ve su negocio; el super-admin ve todo |
| `login/` y `perfiles/` | Cada cuenta crea solo los suyos; el super-admin administra | Solo el super-admin los escribe |
| Migración automática de cuentas viejas | Sí (lee `data/usuarios` sin sesión) | **No**: quien no migró entra solo si el super-admin le crea la cuenta (🔐 Cuentas) |
| Configuración inicial (base vacía, crear el dueño) | Sí | **No** aparece: la app no puede saber que la base está vacía |

**Las reglas se cambian cuando se quiera**, en segundos y sin tocar los datos:
- volver a las de transición: `npm run reglas:transicion`;
- publicar las cerradas: `npm run reglas:cerradas`;
- en una emergencia, editarlas en la consola (*Realtime Database → Reglas*) y llevar el cambio al repositorio enseguida: Git es la fuente; un despliegue posterior sobrescribe lo editado en la consola.

**Orden con una base nueva (vacía):** reglas de transición → configuración inicial (crear el dueño) → reglas cerradas. Si se cerraron antes de crear el dueño: volver a las de transición, crearlo y cerrar otra vez. Con datos del esquema viejo, el orden es el del [Plan B](../-02-corrections/-02-corrections.md#b8-fases-de-despliegue-con-lista-de-chequeo): cerrar cuando 🔐 Cuentas muestre 0 pendientes y 0 por revisar.

**La consola de Firebase no pasa por estas reglas.** Desde ella el dueño del proyecto siempre ve y edita los datos. Desde la app, en cambio, nadie (ni el dueño de la cuenta de Google) ve datos sin iniciar sesión.

Para saber qué reglas están publicadas: `prueba.html` dice "de TRANSICIÓN" o "CERRADAS ✓"; o se abre `https://<proyecto>-default-rtdb.firebaseio.com/data.json`: con las cerradas responde `"Permission denied"`.

### Estructura en la nube

Con S1, además de `data/` hay dos nodos de cuentas (detalle en [-02 → B.3](../-02-corrections/-02-corrections.md#b3-modelo-de-datos-nuevo)):

```
login/<usuario>               {correo interno, uid}   índice para iniciar sesión
perfiles/<uid>                negocio, rol, permisos, activo, editaNegocio
data/
  negocios_r/<negId>          un nodo por negocio (antes: array data/negocios → queda en negocios_bk)
  migracion_s1                marca de la migración de tablas globales (una sola vez)
  usuarios            (array del esquema viejo, con hash; solo para migrar cuentas pendientes)
  superadmins         (array global)
  data_<negId>_usuarios_r/<id>  usuarios del negocio SIN contraseñas
  data_<negId>_caja_actual      (objeto/array completo)
  data_<negId>_config           (objeto completo)
  data_<negId>_conceptos_gasto  (array completo)
  data_<negId>_<tabla>_r/<id>   (un nodo por registro: ventas, productos, …)
  data_<negId>_<tabla>_x/<id>   (marca de borrado = timestamp)
  data_<negId>_<tabla>_bk       (respaldo del formato viejo tras migrar)
```

Detalle completo en [13-multitenant-isolation](../13-multitenant-isolation/13-multitenant-isolation.md).

## 4. Primer ingreso y credenciales

- En el primer arranque con la nube vacía, la app muestra la **pantalla de configuración inicial** para crear el super-admin dueño (contraseña de mínimo 8 caracteres). `seed()` (`ui/nucleo/arranque.js`) solo crea las listas vacías de negocios y usuarios y convierte a hash cualquier contraseña antigua en texto plano.
- Las contraseñas se guardan con hash y sal (`passHash`, `passSal`, `passIter`). No hay forma de "ver" una contraseña: si alguien la olvida, el super-admin le pone una nueva.
- El README raíz menciona `superadmin / super123` y `admin / admin123`; **no coinciden** con lo que crea el código (ver [-01-to-review](../-01-to-review/-01-to-review.md)). Al crear un negocio, la contraseña del admin propuesta por defecto es `admin123`; los demos usan `demo`, `demo2`… con `demo123`.

## 5. Despliegue

### Render (recomendado por el proyecto)

`render.yaml` define un servicio `runtime: static`, sin build, publicando la raíz y reescribiendo `/*` → `/index.html`.

```bash
git add . && git commit -m "mensaje" && git push   # Render despliega solo
```

### Otro hosting estático

Subir `index.html`, la carpeta `src/` completa y `firebase-config.js` (y opcionalmente `prueba.html` + `prueba.js`). No requiere backend. El servidor debe entregar los `.js` con tipo `text/javascript`.

### Caché del navegador

Los navegadores pueden quedarse con archivos viejos. Los de la interfaz llevan `?v=VERSION_UI` (`ui/manifiesto.js`): **cambiar `VERSION_UI` en cada publicación** para que no se mezclen viejos y nuevos. Los módulos de `src/` (dominio, adaptadores) no llevan versión: tras desplegar, pedir recarga forzada (Ctrl+Shift+R). **Importante**: desde la versión con contraseñas en hash, un equipo con la interfaz anterior no puede iniciar sesión hasta recargar, y volver a publicar la versión anterior deja a todos sin acceso (ver [-02-corrections](../-02-corrections/-02-corrections.md)). La sincronización por registro es compatible con equipos que aún usan el formato viejo de tabla completa (`migrarTablaVieja`, `adaptadores/salida/firebase-datos.js`).

## 6. Respaldo y restauración

- **Respaldo**: Panel super-admin → "💾 Respaldo" (`descargarRespaldo`, `ui/super-admin/panel.js`). Descarga `respaldo-wallace-AAAA-MM-DD.json` con todo el nodo `data` (o el caché local si no hay nube). Formato: `{ sistema, fecha, datos }`.
- **Restauración**: no existe en la app. Se hace importando `datos` en la consola de Firebase (Realtime Database → Importar JSON) sobre el nodo `data`. Probarlo primero en un proyecto aparte.
- **Datos locales**: claves `ws_*` en `localStorage` del navegador. Borrarlas obliga a bajar todo de nuevo de la nube.

## 7. Protocolo de verificación (smoke test)

Ejecutar después de cada cambio en la interfaz (`src/adaptadores/entrada/ui/`); el recorrido automático (`npm run test:firebase`) cubre las pantallas y una venta por negocio, pero no la sincronización entre dos equipos, idealmente con un negocio demo (Panel → "✨ Crear demo") y dos navegadores abiertos con el mismo negocio para comprobar sincronización.

| # | Módulo | Paso | Resultado esperado |
|---|---|---|---|
| 0 | Pruebas automáticas | `npm test` y `npm run test:firebase` | Todas pasan (dominio, estructura de la interfaz, reglas, migración y recorrido de todas las pantallas) |
| 1 | Login | Entrar como super-admin y como admin de un demo | Panel correcto; usuario de negocio suspendido recibe "negocio suspendido" |
| 2 | Super-admin | Crear negocio, configurar pestañas, suspender/activar, informe mensual | Cambios persisten tras recargar |
| 3 | Caja | Abrir caja (primera vez pide base) | Nueva Venta deja de mostrar "Caja cerrada" en los dos navegadores |
| 4 | Venta directa | Agregar productos, descuento, cobrar con pago dividido y cambio | Venta "Pagada", stock descontado, cliente creado, pregunta por imprimir |
| 5 | Venta dos pasos | Negocio restaurante: confirmar pedido → cobrar desde Pedidos | Comanda impresa, pedido aparece en Cocina |
| 6 | Edición | Editar un pedido ya cobrado cambiando el total | Marca "Revisar pago"; el ajuste (diferencia o total) lo deja cuadrado |
| 7 | Anular/eliminar | Anular un pedido cobrado | Stock devuelto y registrado en Movimientos; aparece en Auditoría |
| 8 | Cuentas abiertas | Activarlas en Mi Negocio, abrir, agregar, cobrar | Total acumulado correcto; comanda solo de lo nuevo |
| 9 | Inventario | Entrada con fecha de vencimiento, salida por daño, retirar lote | Lotes FEFO, alertas de vencimiento, movimientos registrados |
| 10 | Conteo | Iniciar, contar con diferencias, guardar y ajustar | Stock igual a lo contado; registro en Conteo y Movimientos |
| 11 | Cocina | Preparando → Listo → Entregado | Cronómetro y colores; Tiempos de Entrega calcula promedio tras 3 pedidos |
| 12 | Citas | Agendar con productos apartados → Entregado (cobra) / No se recogió | Venta creada sin doble descuento / stock devuelto |
| 13 | Caja | Gasto, retiro, entrada; cerrar con diferencia | Tirilla de cierre, reporte de descuadre, base de mañana guardada |
| 14 | Contable/Gastos | Registrar gasto con concepto nuevo | Aparece en Gastos y en Contable del mes |
| 15 | Reportes | Revisar Dashboard, Reportes, Historial | Totales coinciden con las ventas pagadas |
| 16 | Permisos | Usuario cajero/mesero/cocina | Menú filtrado; botones sin permiso ocultos |
| 17 | Sincronización | Vender en A y mirar Pedidos en B; desconectar internet en A, vender, reconectar | B recibe la venta; la cola offline (`ws_cola_reg`) se sube al volver |
| 18 | Móvil | Ancho < 760 px | Tablas convertidas en tarjetas, menú lateral deslizable |

## 8. Solución de problemas

| Síntoma | Causa probable | Acción |
|---|---|---|
| "El inicio de sesión no está activado en Firebase…" (antes: "No se pudo iniciar sesión") al crear el dueño o entrar | Firebase responde `CONFIGURATION_NOT_FOUND` u `OPERATION_NOT_ALLOWED`: en ese proyecto no se pulsó **Authentication → Comenzar** o no está activo **Correo electrónico/contraseña** | Activarlo en la consola y reintentar; no queda nada escrito a medias |
| `npm : No se puede cargar el archivo …\npm.ps1 porque la ejecución de scripts está deshabilitada` | PowerShell de Windows bloquea scripts `.ps1` por defecto | Ver [1.1](#11-windows-la-ejecución-de-scripts-está-deshabilitada): `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`, o usar `npm.cmd` |
| Punto rojo "Sin conexión" | Sin internet o `databaseURL` vacío | Revisar `firebase-config.js` y `prueba.html` |
| En la consola: `WebSocket connection to 'wss://…firebaseio.com/.ws…' failed: Page entered Back-Forward Cache` | **Normal.** Al salir de la página (otra dirección, `prueba.html`, otro sitio), Chrome la congela para volver al instante con "Atrás" y cierra su conexión en tiempo real | Nada: al volver, Firebase se reconecta solo en 1–2 s y sincroniza lo pendiente. Ver 8.1 |
| Punto naranja parpadeando "Error de nube" | Firebase rechazó una escritura (reglas) | Revisar reglas (`prueba.html`). Lo que la red no pudo subir queda en la cola local; lo que las reglas negaron se descarta (no bloquea la cola) |
| "Usuario o contraseña incorrectos" para alguien que nunca entró a la versión nueva | Reglas cerradas antes de que migrara | Super-admin → 🔐 Cuentas → "Crear cuenta" con una contraseña nueva |
| "Esta cuenta ya fue activada…" | Otra persona creó primero la cuenta de ese usuario (reglas de transición) | Super-admin → 🔐 Cuentas → "Reemplazar cuenta"; revisar la fila ⚠️ |
| "Tu usuario fue desactivado o su contraseña se restableció" | El super-admin lo desactivó o le puso contraseña nueva (la cuenta vieja queda sin perfil) | Entrar con la contraseña nueva |
| "No se pudo cargar Firebase" en la consola | No se descargó el SDK modular de `gstatic.com` (`src/adaptadores/salida/firebase-sdk.js`) | Revisar internet o bloqueadores; la app sigue en modo local con lo guardado en el equipo |
| En el login aparece "Modo local" o "Entorno de PRUEBAS" en el dominio público | El dominio no está en `HOSTS_PRODUCCION` de `firebase-config.js` | Agregarlo y publicar |
| "Nube lenta: modo local" en consola | La nube no respondió en 12 s | Esperar; la app sigue sincronizando cuando conecte |
| Un equipo no ve lo que hizo otro | Pantalla con un campo enfocado o modal abierto (no se refresca a propósito) | Salir del campo o usar "🔄 Actualizar" |
| No imprime | Ventanas emergentes bloqueadas | Permitirlas para el dominio |
| "Error al cargar. Recarga con Ctrl+Shift+R" | Excepción en `render()` | Revisar consola del navegador |
| Pantalla en blanco y en la consola "Failed to load module script" o un error de CORS | Se abrió con `file://` o el servidor entrega los `.js` con un tipo incorrecto | Servir por HTTP (sección 2) |
| "No se pudo cargar la aplicación" | Falta un archivo de `ui/manifiesto.js` en el servidor (la consola dice cuál: "No cargó la interfaz: …") | Subir la carpeta `src/` completa |
| "El adaptador de datos no cumple el puerto…" en la consola | Se cambió `firebase-datos.js` y le falta una operación del puerto | Ver `src/aplicacion/puertos/datos.js` |

### 8.1 Mensajes de la consola que son normales

La consola del navegador (F12) muestra a veces errores que **no** son fallas de la app:

| Mensaje | Qué significa | Cuándo preocuparse |
|---|---|---|
| `WebSocket connection to 'wss://<base>.firebaseio.com/.ws?…' failed: Page entered Back-Forward Cache` | La app mantiene un WebSocket con Firebase para recibir cambios al instante. Al salir de la página, Chrome la guarda congelada (*Back-Forward Cache*) para mostrarla sin recargar si se vuelve con "Atrás", y para eso cierra el WebSocket. Al volver, la librería de Firebase se reconecta sola; mientras tanto la app usa su copia local, y no se pierde nada | Si el indicador se queda en "Sin conexión" después de volver, o si salen errores de WebSocket **sin** "Back-Forward Cache" mientras se usa la página. Causas posibles: red o bloqueador, clave web restringida sin ese dominio ([conexion-firebase](conexion-firebase.md), paso 4), o la CSP ([csp.md](../-03-architecture/csp.md)) |
| `Failed to load resource: … 404` en `/favicon.ico` | El sitio no tiene ícono de pestaña; el navegador lo pide igual | Nunca: es solo el ícono |
| `[Report Only] Refused to …` | La CSP en modo "solo informar" avisa lo que **bloquearía** si estuviera activa. No bloquea nada | Sí, cuando se va a activar la CSP: cada aviso es algo que dejaría de funcionar ([csp.md](../-03-architecture/csp.md), sección 7) |

Para comprobar que la conexión está bien: recargar (F5), usar la app sin salir de la pestaña y ver que el error no vuelva, y que el indicador de conexión quede en verde. Para revisar `prueba.html` sin congelar la app, abrirla en **otra pestaña**.

## 9. Entorno de pruebas en Firebase

El fork (y cualquier desarrollo) **no debe usar la base de datos de producción** (`wallace-system`). La versión con correcciones convierte las contraseñas a hash al primer arranque y es irreversible: si corre contra producción, el sistema original deja de dejar entrar a todos ([-02-corrections → Antes de desplegar](../-02-corrections/-02-corrections.md)). Además, cualquier venta, cierre o demo de prueba quedaría mezclado con los datos reales.

La solución es un **proyecto de Firebase de pruebas** (gratuito), con su propia base de datos y su propio inicio de sesión. Ahí se prueba todo (la reorganización por fases, S1, migraciones) y a producción solo llega lo ya ensayado.

### 9.1 Qué no hay que crear

Realtime Database **no tiene tablas ni esquema**: es un único árbol JSON y cada nodo (`data/negocios`, `data/data_<negocio>_ventas_r/…`) aparece solo la primera vez que la app escribe en él. Hay dos maneras de llenar la base de pruebas:
- **Importar una copia de producción** (recomendado): quedan todos los negocios, usuarios y ventas reales para probar.
- **Empezar vacía**: al abrir la app aparece la pantalla de configuración inicial para crear el dueño; desde ahí se crean negocios y demos.

> Al crear la base en la consola, elegir **Realtime Database**, no **Cloud Firestore** (aparece primero en *Bases de datos y almacenamiento*). La app usa Realtime Database; la diferencia está en [-03-architecture → Realtime Database vs. Cloud Firestore](../-03-architecture/-03-architecture.md#9-realtime-database-vs-cloud-firestore).

### 9.2 Lo que hace el responsable del proyecto (requiere su cuenta de Google)

| # | Paso | Dónde |
|---|---|---|
| 1 | Crear el proyecto `wallace-system-pruebas`, **sin** Google Analytics. Queda en plan Spark (gratuito, sin tarjeta). | Consola de Firebase → Crear un proyecto |
| 2 | Comprobar en el selector de proyecto (arriba a la izquierda) que **no** se está trabajando en `wallace-system` (producción). | Consola |
| 3 | Crear la base: ubicación **us-central1** (la misma de producción), reglas en **modo de prueba** (abiertas; vencen a los 30 días, antes se reemplazan). | Bases de datos y almacenamiento → Realtime Database → Crear base de datos |
| 4 | Activar el inicio de sesión con correo y contraseña (solo el primer interruptor, no "vínculo de correo"). Necesario para S1. | Seguridad → Authentication → Comenzar → Método de acceso |
| 5 | Instalar la herramienta de Firebase e iniciar sesión **en la terminal del proyecto**: `npm install -g firebase-tools` y `firebase login` (abre el navegador). | Terminal de VS Code |
| 6 | Copiar el **ID del proyecto** (p. ej. `wallace-system-pruebas-a1b2c`; no es el nombre visible). | ⚙️ Configuración del proyecto → General |
| 7 | Descargar un respaldo de producción y dejarlo en la carpeta del proyecto. **Nunca subirlo a Git**: tiene datos de clientes y contraseñas. | Sistema original → Panel super-admin → 💾 Respaldo |

### 9.3 Lo que hace desarrollo con la herramienta de Firebase

Con la sesión del paso 5, desde la terminal del proyecto:

1. **Registrar el proyecto solo como alias `pruebas`**: `.firebaserc` y `firebase.json` ya están en el repositorio; solo hay que reemplazar `wallace-system-pruebas-cambiar` por el ID real. La CLI se instala con `npm install` (se usa con `npx firebase …`). Todos los comandos llevan `-P pruebas`. **Ningún comando se ejecuta contra `wallace-system`**, aunque la cuenta tenga acceso, y cada comando se muestra antes de ejecutarlo.
2. **Registrar la app web y obtener su configuración**:
   ```
   firebase apps:create WEB wallace-fork -P pruebas
   firebase apps:sdkconfig WEB <id-de-la-app> -P pruebas
   ```
3. **Configurar el fork para que no pueda tocar producción**: `firebase-config.js` elige la configuración según el dominio. Producción solo desde el dominio público; `localhost` y cualquier otro dominio usan pruebas.
4. **Importar la copia de producción**: el respaldo guarda el contenido del nodo `data`, así que se convierte a `{ "data": … }` y se carga con
   ```
   firebase database:import / importar-pruebas.json -P pruebas
   ```
   (o desde la consola: Realtime Database → Datos → ⋮ → Importar JSON). `node scripts/preparar-pruebas.mjs <export>.json` genera ese archivo desde el export de la consola o el respaldo de la app, y muestra un diagnóstico sin datos sensibles. Los dos archivos ya están en `.gitignore`.
5. **Publicar las reglas**: `npm run reglas:transicion` (data abierto + cuentas protegidas). Cuando la pantalla 🔐 Cuentas muestre 0 pendientes y 0 por revisar: `npm run reglas:cerradas`.
6. **Comprobar**: `npx serve -s . -l 3000` → `http://localhost:3000`. Verificar que el indicador de conexión está en verde, que los datos son los de la copia y que la migración de contraseñas corrió **en pruebas** (en `data/usuarios` aparece `passHash` en lugar de `pass`).

### 9.4 Cómo probar el fork

| Forma | Cómo | Para qué |
|---|---|---|
| Local | `npx serve -s . -l 3000` → `http://localhost:3000` | Desarrollo y pruebas diarias |
| Desplegado aparte | Un servicio de Render (o Netlify / GitHub Pages) conectado al **fork**, con su propia URL | Probar desde el celular o con otras personas |
| Sin nube | Abrir con `?local` (`http://localhost:3000/?local`) | Pruebas rápidas sin Firebase (todo en el navegador) |

El dominio público de producción sirve el repositorio **original**, no el fork: los cambios del fork no aparecen ahí hasta que se unan al original. Si el fork se despliega aparte, su dominio debe agregarse en *Authentication → Settings → Authorized domains* del proyecto de pruebas (para S1).

### 9.5 Paso a producción (más adelante)

Lo probado en pruebas se lleva a producción **por fases**, no de una vez:
- Las reglas son el mismo archivo para los dos proyectos: `firebase deploy --only database -P pruebas` y, cuando esté aprobado, `-P produccion` (alias que se agrega solo en ese momento).
- S1 exige el orden del [Plan B](../-02-corrections/-02-corrections.md): activar el inicio de sesión → publicar la app con reglas abiertas → esperar la migración de usuarios → cerrar las reglas.
- Antes de cada paso en producción: respaldo.
