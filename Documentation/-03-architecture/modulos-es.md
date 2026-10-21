# Módulos ES en la interfaz

Qué son los módulos ES, por qué la interfaz pasó a ellos en la fase 8, cómo están organizados aquí y cómo trabajar con ellos sin romper nada. El registro técnico de la conversión está en [-03-architecture, sección 11](-03-architecture.md). Este documento es la guía para quien escribe código.

Las rutas `ui/…` son relativas a `src/adaptadores/entrada/`.

## 1. Qué es un módulo ES

Un **módulo ES** (*ECMAScript module*) es un archivo JavaScript con su **propio ámbito**:
- lo que declara no queda visible para otros archivos, salvo lo que **exporta**;
- para usar algo de otro archivo hay que **importarlo**.

```js
// ui/nucleo/estado.js
export const STATE = { … };
export function fijarEscribiendo(v){ ESCRIBIENDO=v; }

// ui/ventas/pedidos.js
import { STATE, escapeHtml, fijarEscribiendo, fmtMoney } from '../nucleo/estado.js';
```

El navegador los entiende sin herramientas extra (`<script type="module">` o `import()`), y siempre corren en **modo estricto**.

### 1.1 Lo que había antes: scripts clásicos

Hasta la fase 8, los 47 archivos eran **scripts clásicos**: todos compartían un único ámbito global (`window`). Una función declarada en `ventas/cobro.js` se podía llamar desde cualquier otro archivo o desde un `onclick="…"` escrito en el HTML. Era cómodo, pero:

| Problema de los scripts clásicos | Cómo lo resuelven los módulos |
|---|---|
| Nadie sabía qué archivo usaba qué: había que buscar el nombre en todo el proyecto | Cada archivo dice arriba exactamente qué usa y de dónde (`import`) |
| Dos archivos con una función del mismo nombre se pisaban sin aviso (gana el último que carga) | Cada archivo tiene su ámbito; además la prueba prohíbe nombres repetidos |
| Cualquiera podía cambiar cualquier variable de cualquier archivo | Lo importado es de **solo lectura**: para cambiar una variable de otro archivo hay que usar su función |
| Los archivos tenían que cargarse en un orden exacto | El navegador resuelve las dependencias por los `import` |
| Más de 400 nombres sueltos en `window`, alcanzables por código inyectado | Solo queda `window.WS`, y es de solo lectura |
| Obligaba a usar `onclick="…"` en línea, lo que impedía una CSP y causó el XSS S6 | Eventos delegados (`data-click`) que buscan solo funciones exportadas |

## 2. Cómo está organizado aquí

```
index.html
  └── <script type="module" src="src/arranque.js">          raíz de composición (el ÚNICO script de la página)
        ├── elegirEntorno(location)  ← firebase-config.js (módulo): producción, pruebas, emuladores o local
        ├── cargarSdkFirebase()      ← firebase-sdk.js: SDK MODULAR desde gstatic, solo si hay base (sección 8)
        ├── crea adaptadores (les pasa el SDK y el entorno), verifica puertos
        ├── instala el puente (window.misDatos, window.Dominio…)   ← los módulos aún lo usan
        └── import('./adaptadores/entrada/ui/manifiesto.js')
              └── cargarInterfaz()
                    ├── import() de los 47 módulos de ARCHIVOS_UI
                    ├── arma el espacio de nombres (nombre exportado → valor vivo)
                    ├── instalarEventosDelegados(espacio)          ← data-click
                    └── devuelve el espacio → arranque lo guarda en window.WS
                          └── WS.iniciarInterfaz()
```

| Pieza | Archivo | Qué hace |
|---|---|---|
| Lista de módulos | `ui/manifiesto.js` (`ARCHIVOS_UI`) | Todos los módulos de la interfaz. Se listan todos aunque cada uno importe lo suyo, porque hay pantallas a las que solo se llega por un `data-click` y nadie las importa |
| Cargador | `ui/manifiesto.js` (`cargarInterfaz`) | Importa la lista, arma el espacio de nombres e instala los eventos |
| Eventos delegados | `ui/nucleo/eventos.js` | Un escuchador por tipo de evento; interpreta `data-click="accion(args)"` y llama a la función **exportada** con ese nombre |
| Configuración | `firebase-config.js` (raíz) | Módulo: `elegirEntorno(location)` decide la base por dominio. Lo importan `src/arranque.js` y `prueba.js` |
| SDK de Firebase | `src/adaptadores/salida/firebase-sdk.js` | Importa el SDK modular de Firebase desde gstatic (sección 8) |
| Raíz de composición | `src/arranque.js` | Instala el puente **antes** de importar la interfaz, conecta los ganchos del adaptador de datos (`ui.refrescarSiSePuede()`…) y publica `window.WS` |
| Puente (temporal) | `ui/puente-legado.js` | Publica en `window` el dominio y los datos con los nombres de siempre (`misDatos`, `Dominio`, `DB`…). Los módulos los usan sin importarlos. Se retira cuando las fases 2–7 los cambien por imports |

## 3. Las reglas (y por qué)

Las vigila `tests/ui/estructura.test.mjs` en cada `npm test`.

| Regla | Por qué |
|---|---|
| **Importar lo que se usa**, con ruta relativa y extensión: `import { x } from '../nucleo/estado.js'` | Sin el import, el nombre no existe (`ReferenceError` al usarlo). Sin la extensión `.js`, el navegador no encuentra el archivo |
| **No renombrar al importar** (`import { x as y }` no) | Un nombre = una cosa en todo el proyecto: se busca fácil y coincide con lo que dice el `data-click` |
| **Nunca repetir un nombre entre módulos** ni tapar uno del puente (`Datos`, `Dominio`, `DB`, `misDatos`, `ROLES`…) | `window.WS` y los `data-click` buscan por nombre: un repetido sería ambiguo |
| **Al cargar, solo declarar**: el código de nivel superior no llama a nada importado | Hay **importaciones circulares** (navegación ↔ pantallas). En un ciclo, el otro módulo puede no haberse evaluado aún. Las funciones se llaman después, cuando ya cargó todo |
| **No asignar lo importado**: para cambiar una variable de otro módulo, usar su `fijarX(v)` | Un import es de solo lectura: asignarlo da `TypeError`. El dueño de la variable decide cómo se cambia |
| **Las acciones del HTML deben estar exportadas** (`export function buscarPedidos…`) | `eventos.js` solo encuentra funciones exportadas |
| **No usar `this` suelto ni variables sin declarar** | Los módulos corren en modo estricto: lo que antes fallaba en silencio ahora lanza error |

### 3.1 Las variables compartidas: `fijarX`

Cuando una variable de un módulo la cambiaba otro archivo, se resolvió con una función en el módulo dueño:

| Variable | Dueño | Función |
|---|---|---|
| `ESCRIBIENDO` (hay un pedido a medio armar) | `nucleo/estado.js` | `fijarEscribiendo(v)` |
| `_guardando` (evita doble clic al guardar) | `ventas/nueva-venta.js` | `fijarGuardando(v)` |
| `_facturaReservada` | `ventas/nueva-venta.js` | `fijarFacturaReservada(v)` |
| `_resumenNeg` | `reportes/resumen.js` | `fijarResumenNeg(v)` |
| `_configInicial` | `usuarios/sesion.js` | `fijarConfigInicial(v)` |
| Pedido cargado en Nueva Venta (`_carrito`, `_vTipo`, `_vCli`…) | `ventas/nueva-venta.js` | `cargarPedidoEnVenta(v, conItems)` (antes estaba repetido en cobro y en cuentas abiertas) |

Leer una variable importada sí se puede, y siempre da el valor **actual**: los imports son "vivos".

## 4. Cómo hacer lo de todos los días

### 4.1 Agregar una función a un módulo existente
```js
// ui/ventas/pedidos.js
export function exportarPedidos(){ … }        // export si la usa otro módulo o un data-click
```
En el archivo que la use: agregarla a su `import` desde `'../ventas/pedidos.js'`.

### 4.2 Un botón o campo que llama una acción
```js
`<button data-click="exportarPedidos()">Exportar</button>`
`<input class="busca" data-input="buscarPedidos(this.value)">`
`<button data-click="verPedido(this.dataset.id)" data-id="${escapeHtml(v.id)}">Ver</button>`
```
- Los argumentos solo pueden ser `'texto'`, números, `true/false/null`, `this`, `this.value`, `this.checked`, `this.dataset.x` y `event`. **Sin código.**
- Los textos del usuario van en `data-x="${escapeHtml(v)}"` y se leen con `this.dataset.x`, **nunca** dentro del texto de la acción ([seguridad-interfaz](seguridad-interfaz.md)).
- Eventos disponibles: `data-click`, `data-input`, `data-change`, `data-keydown`, `data-enter` (Enter en un campo), `data-focus`, `data-blur`, `data-mousedown`, `data-toggle` (`<details>`).
- **Nunca** `onclick="…"`: la prueba falla y la CSP lo bloquearía.

Antes y después, con un caso real (buscador de Pedidos):
```js
// antes (script clásico): código en línea y variable global
oninput="_pBusca=this.value;render()"
// ahora (módulo): una acción exportada con nombre
data-input="buscarPedidos(this.value)"
export function buscarPedidos(v){ _pBusca=v; render(); }
```

### 4.3 Un archivo nuevo de interfaz
1. Crearlo en su carpeta (`ui/<módulo>/<archivo>.js`) con el encabezado de los demás.
2. `export` en lo que usen otros; `import` de lo que use.
3. Agregarlo a `ARCHIVOS_UI` en `ui/manifiesto.js`.
4. `node scripts/mapa-interfaz.mjs` (actualiza el [mapa](mapa-interfaz.md)) y `npm test`.

### 4.4 Usar algo del dominio o de los datos
Hoy se usan por el puente, sin import (`misDatos('ventas')`, `Dominio.pagos.liquidarCobro(…)`). Una regla pura **nueva** va en `src/dominio/` con su prueba. Si la interfaz la usa por nombre, se publica en el puente. Cuando el puente se retire (fases 2–7), estos usos pasarán a ser imports.

## 5. Probar y depurar

- **Consola del navegador**: las funciones y el estado de la interfaz están en `WS`:
  - `WS.STATE` (estado);
  - `WS.render()` (redibujar);
  - `WS._carrito` (valor actual).

  Es de **solo lectura**: `WS.ESCRIBIENDO=true` da error; se usa `WS.fijarEscribiendo(true)`.
- **Pruebas de navegador** (`tests/navegador/`, `scripts/capturas.mjs`): el código que corre en la página usa `WS.` (p. ej. `WS.entrarComoNegocio('n2')`).
- **"No se pudo cargar la aplicación. Recarga con Ctrl+Shift+R."**: un módulo no cargó (error de sintaxis, un `import` de algo que no existe, un archivo mal escrito). La consola (F12) dice cuál; `npm test` también lo detecta.

### 5.1 Errores típicos

| Error | Causa | Arreglo |
|---|---|---|
| `ReferenceError: x is not defined` | Falta el `import` | Agregarlo; `npm test` lo marca antes ("identificadores sin declarar ni sin importar") |
| `SyntaxError: The requested module './a.js' does not provide an export named 'x'` | Se importa algo que ese módulo no exporta, o el nombre está mal escrito | `export` en el dueño o corregir el nombre (la prueba de imports lo marca) |
| `TypeError: Assignment to constant variable` | Se asignó una variable importada | Usar su `fijarX(v)` |
| `Cannot access 'x' before initialization` | Código de nivel superior que usa algo importado durante un ciclo | Moverlo dentro de una función (regla "al cargar, solo declarar") |
| `La acción "x" no existe` (en `reportarError`) | El `data-click` llama una función que no está exportada | `export` o corregir el nombre |
| El navegador no encuentra un módulo (404) | Ruta sin `.js` o mal escrita | Ruta relativa con extensión |

## 6. Caché y publicación

- Los módulos **no llevan `?v=`**: si el mismo módulo se pidiera con dos URL distintas, el navegador cargaría **dos copias**, cada una con su propio estado. Por eso:
  - en Render, `render.yaml` sirve `/src/*` con `Cache-Control: no-cache`;
  - en el sandbox, `firebase.hosting.json` sirve todo con `no-cache`.

  El navegador pregunta cada vez si el archivo cambió, recibe 304 si no, y nunca mezcla versiones viejas y nuevas.
- Los **estilos** sí llevan `?v=VERSION_UI` en `index.html`. Al publicar, subir `VERSION_UI` en `ui/manifiesto.js` **y** el `?v=` (la prueba exige que coincidan).
- No funciona con `file://`: siempre servir por HTTP (`npx serve`, Render, Hosting).

## 7. Lo que falta

Desde el 2026-10-11 **no queda ningún script clásico**: `index.html` carga solo `src/arranque.js`; `firebase-config.js` es un módulo; el logo está en `ui/nucleo/logo.js`; Firebase se usa con su SDK modular (sección 8). Lo único que queda es:

- **Retirar el puente**: que cada módulo importe del dominio o de un servicio de aplicación en vez de leer `window.misDatos`/`window.Dominio`. Va junto con sacar los casos de uso a `src/aplicacion/` (fases 2–7).
- Mientras tanto, el puente es la única puerta global que queda, y la prueba impide que un módulo la tape con un nombre propio.

## 8. Firebase con el SDK modular

Firebase tiene dos formas de usarse desde el navegador:

| | SDK *compat* (antes, hasta el 2026-10-11) | SDK **modular** (ahora) |
|---|---|---|
| Cómo se carga | Tres `<script src="…-compat.js">` en `index.html` | `import()` de `firebase-app.js`, `firebase-database.js` y `firebase-auth.js` (desde `src/adaptadores/salida/firebase-sdk.js`) |
| Cómo se usa | Un objeto global: `firebase.database().ref(r).once('value')` | Funciones: `get(ref(db, r))` |
| Global en `window` | Sí (`window.firebase`) | **No** |
| Para qué existe | Capa de transición para código viejo | La forma actual y la que Google sigue desarrollando |

### 8.1 Cómo está armado

- **`src/adaptadores/salida/firebase-sdk.js`**:
  - tiene la versión en un solo lugar (`VERSION_FIREBASE = '10.12.2'`);
  - `cargarSdkFirebase()` importa los tres módulos desde `https://www.gstatic.com/firebasejs/<versión>/` y devuelve `{app, database, auth}`, o `null` si no se pudieron descargar;
  - `sdkCargado()` devuelve lo ya cargado (para la consola y las pruebas).
- **`src/arranque.js`** solo descarga el SDK **si hay base configurada** (`entorno.config`). En modo local (`?local`, o sin proyecto) la app no pide nada a gstatic: arranca más rápido y funciona sin internet. Si la descarga falla, el SDK queda en `null` y la app sigue en modo local, como antes.
- **Los adaptadores reciben el SDK como parámetro** (`opc.sdk`), igual que antes recibían `window.firebase`:
  - en el navegador, el de `firebase-sdk.js`;
  - en las pruebas con Node (`tests/integracion/`), los paquetes de npm `firebase/app`, `firebase/database` y `firebase/auth`, que tienen las mismas funciones. Así la prueba usa el mismo código de los adaptadores que el navegador.
- **Solo dos archivos tocan Firebase**: `firebase-datos.js` y `firebase-cuentas.js` (más `prueba.js`, el diagnóstico). La interfaz y el dominio no saben que existe; los puertos lo garantizan. Por eso el cambio de SDK no tocó ninguna pantalla.

### 8.2 Equivalencias (para leer o escribir los adaptadores)

| Compat (antes) | Modular (ahora) |
|---|---|
| `firebase.initializeApp(cfg)` · `firebase.apps` | `app.initializeApp(cfg)` · `app.getApps()` / `app.getApp()` |
| `firebase.database()` · `.useEmulator(h, p)` | `database.getDatabase(app)` · `connectDatabaseEmulator(db, h, p)` |
| `db.ref(r).once('value')` | `get(ref(db, r))` |
| `ref.set(v)` · `ref.update(u)` | `set(ref(db, r), v)` · `update(ref(db, r), u)` (`ref(db)` = raíz) |
| `ref.transaction(fn)` | `runTransaction(ref(db, r), fn)` |
| `ref.on('value', fn)` … `ref.off('value')` | `const quitar = onValue(ref(db, r), fn)` … `quitar()` |
| `ref.on('child_added' / 'child_changed' / 'child_removed', fn)` | `onChildAdded` / `onChildChanged` / `onChildRemoved(ref, fn)` (también devuelven `quitar`) |
| `ref.limitToFirst(1)` | `query(ref(db, r), limitToFirst(1))` |
| `firebase.auth()` · `.useEmulator(url)` | `auth.getAuth(app)` · `connectAuthEmulator(auth, url)` |
| `auth.signInWithEmailAndPassword(c, p)` | `signInWithEmailAndPassword(auth, c, p)` (igual `createUser…`, `signOut(auth)`, `onAuthStateChanged(auth, fn)`) |
| `a.setPersistence(firebase.auth.Auth.Persistence.NONE)` | `initializeAuth(app, {persistence: inMemoryPersistence})` (sesión "altas" para crear cuentas de otros) |
| `user.reauthenticateWithCredential(c)` · `user.updatePassword(p)` | `reauthenticateWithCredential(user, c)` · `updatePassword(user, p)` |

Un cambio de comportamiento a favor: con el SDK modular cada escuchador devuelve **su** función para quitarlo. Antes, `ref.off('value')` quitaba todos los escuchadores de esa ruta.

### 8.3 Leer la base desde la consola del navegador

Ya no existe `window.firebase`. Para probar a mano (p. ej. que un empleado **no** pueda leer otro negocio), con la sesión iniciada:
```js
const {database:D, app:A}=(await import('/src/adaptadores/salida/firebase-sdk.js')).sdkCargado();
const leer=r=>D.get(D.ref(D.getDatabase(A.getApp()), r));
await leer('data/data_N2_ventas_r')   // debe fallar con "Permission denied"
```

### 8.4 Actualizar Firebase

1. Cambiar `VERSION_FIREBASE` en `firebase-sdk.js`.
2. `npm run test:firebase` (las pruebas de navegador usan esa versión desde gstatic; las de integración, el paquete `firebase` de npm).
3. Probar en el sandbox.

La CSP ya permite `https://www.gstatic.com` en `script-src`.

### 8.5 ¿Y el tamaño?

El SDK modular reduce mucho lo que se descarga **cuando se usa un empaquetador** (Vite, webpack), que deja solo las funciones usadas. Este proyecto no usa empaquetador (decisión del 2026-10-04): los tres módulos de gstatic se descargan completos, así que la diferencia de peso es pequeña. La ganancia es otra:
- no hay global;
- todo es módulo;
- se usa la forma que Google mantiene;
- **el modo local ya no descarga Firebase**.
