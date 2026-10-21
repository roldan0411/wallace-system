# 03 — Arquitectura hexagonal y plan de migración

Cómo está organizado el código, qué va en cada carpeta, cómo se conectan las piezas y en qué fase va la migración desde el archivo único `app.js` (partido en módulos el 2026-10-08, ver [sección 10](#10-partición-de-la-interfaz-2026-10-08)).

## 1. Por qué

Hasta ahora todo el sistema vivía en un solo `app.js` de ~8.000 líneas donde se mezclaban, a veces en la misma función, tres cosas:

- **reglas del negocio** (cuánto efectivo debe haber en el cajón, qué lote sale primero, qué número de factura sigue);
- **interfaz** (el HTML de cada pantalla, los botones, los avisos);
- **infraestructura** (Firebase, `localStorage`, impresión).

Con arquitectura hexagonal (*puertos y adaptadores*) las reglas quedan en un **núcleo** que no sabe nada de Firebase ni del HTML. Ventajas concretas para este proyecto:

- **Revisar es más fácil**: un cambio en la fórmula de la caja está en `src/dominio/caja.js` (31 líneas), no perdido entre pantallas.
- **Las reglas se prueban en milisegundos**, sin navegador ni base de datos (`npm test`).
- **Cambiar de tecnología no toca las reglas**: el inicio de sesión con Firebase (S1, Plan B) será un adaptador nuevo; mañana podría ser otra base de datos.

## 2. La regla de dependencias

```
            ┌───────────────────────────────────────────────┐
            │  adaptadores/entrada/ui   (pantallas, eventos) │
            └──────────────────────┬────────────────────────┘
                                   │ usa
            ┌──────────────────────▼────────────────────────┐
            │  aplicacion/   casos de uso + PUERTOS          │
            └──────────┬───────────────────────────┬────────┘
                       │ usa                       │ define el contrato que cumplen
            ┌──────────▼──────────┐     ┌──────────▼────────────────────────┐
            │  dominio/  (reglas) │     │ adaptadores/salida (Firebase, …)   │
            └─────────────────────┘     └────────────────────────────────────┘
```

| Capa | Puede importar | NO puede importar |
|---|---|---|
| `dominio/` | Solo otros archivos de `dominio/` | `window`, `document`, Firebase, `localStorage`, HTML, adaptadores |
| `aplicacion/` | `dominio/` y los puertos | Adaptadores concretos (los recibe ya creados) |
| `adaptadores/salida/` | Su tecnología (Firebase, `localStorage`…) y los puertos que implementa | La interfaz |
| `adaptadores/entrada/` | `aplicacion/`, `dominio/` | Adaptadores de salida directamente (los recibe por el arranque) |
| `arranque.js` | Todo | — (es el único que conoce todas las piezas) |

Si una regla del negocio necesita un dato externo (la fecha de hoy, un id nuevo, una sal aleatoria), lo **recibe como parámetro**; no lo busca.

## 3. Estructura

```
index.html                          Página única: enlaza los estilos de ui/estilos/ y carga src/arranque.js (único script)
firebase-config.js                  Módulo: elegirEntorno() decide la base por dominio (producción, pruebas, emuladores, local)
src/
  arranque.js                       RAÍZ DE COMPOSICIÓN: crea adaptadores, verifica puertos, publica el puente, importa la UI
  dominio/                          NÚCLEO: reglas puras, probadas con npm test
    fechas.js                       fecha local, jornada, días hasta / desde
    pagos.js                        pago dividido, reparto, método, liquidación del cobro (cambio)
    caja.js                         caja abierta por sucursal, movimientos, efectivo esperado, liquidación del cierre
    inventario.js                   lotes FEFO, cambio de stock, combos, requerimientos, faltantes
    facturas.js                     consecutivo: número, mayor, formato, elección
    contrasenas.js                  SHA-256, hash con sal, verificación, migración
    cuentas.js                      S1: clave del índice login/, correo interno, perfiles, estado de la migración
    permisos.js                     roles, pantallas y acciones por rol; ¿puede este usuario…?; sucursales permitidas
    negocio.js                      perfiles por tipo de negocio, planes, ventanas por plan, inventario (F12), sucursales
    gastos.js                       conceptos de gasto sin repetidos (mayúsculas, tildes, espacios)
    ventas.js                       estadísticas por producto y persona (por id) y resumen de ventas del panel (R1)
    prueba.js                       periodo de prueba y vencimiento de demos (estado, extender, pasar a pago, quién puede)
    ejemplos.js                     datos de ejemplo de los 18 tipos de negocio y armado de una demo
  aplicacion/
    puertos/datos.js                PUERTO DE SALIDA de datos: contrato + verificación al arrancar
    puertos/cuentas.js              PUERTO DE SALIDA de cuentas (S1): autenticar y administrar cuentas
    servicios/sesion.js             CASO DE USO: inicio de sesión + migración automática de cuentas viejas (S1)
    servicios/pruebas.js            CASOS DE USO: periodo de prueba (iniciar, extender, pasar a pago, ejemplos); aún sin pantalla
  adaptadores/
    salida/
      firebase-datos.js             Implementa el puerto de datos: Firebase + respaldo local, sync por registro, transacciones,
                                    negocios_r y usuarios por negocio (S1)
      firebase-cuentas.js           Implementa el puerto de cuentas: Firebase Authentication + login/ + perfiles/
      almacen-local.js              localStorage con prefijo ws_
      cripto-navegador.js           ids y sales aleatorias
      firebase-sdk.js               Carga el SDK MODULAR de Firebase desde gstatic (solo si hay base)
    entrada/ui/                     INTERFAZ (módulos ES; el HTML generado llama acciones con data-click)
      manifiesto.js                 Lista de los módulos + cargarInterfaz() (los importa y arma window.WS) + VERSION_UI
      puente-legado.js              PUENTE TEMPORAL: publica dominio, datos y cuentas con los nombres de siempre
      estilos/                      CSS en 16 archivos: 00-tokens (TODOS los colores, fuentes, tamaños y radios), 01-base … 14-responsive, 15-utilidades; en ese orden
      nucleo/                       estado, permisos, componentes (modales, avisos, iconos), eventos delegados,
                                    sonidos, tema, tablas en celular, navegación/render, arranque de la interfaz
      usuarios/                     sesión (login), cuentas S1, auditoría, usuarios (super-admin y negocio), migración de cuentas
      super-admin/                  panel, administradores, negocios, demos, informe mensual
      ventas/                       nueva venta, cuentas abiertas, pedidos, cobro (pago dividido, anular, editar)
      caja/  cocina/  citas/        caja · comanda, KDS, tiempos · agenda
      inventario/                   motor de inventario, catálogo, combos, insumos, conteo
      clientes/  reportes/  gastos/ clientes y domicilios · dashboard, reportes, historial · contable y gastos
      configuracion/  impresion/    configuración (super-admin) y Mi Negocio · facturas, reportes impresos, reimpresiones
tests/
  dominio/                          Pruebas del núcleo (npm test)
  aplicacion/sesion.test.mjs        Servicio de sesión con dobles de los puertos (npm test)
  ui/estructura.test.mjs            Interfaz: imports/exports, nombres repetidos o sin declarar, data-click rotos, estilos (npm test)
  reglas/                           Reglas de la base en el emulador (npm run test:firebase)
  integracion/                      Migración S1 con los adaptadores reales en los emuladores (npm run test:firebase)
  navegador/                        La interfaz real en Chrome sin ventana: S1 y recorrido de TODAS las pantallas (npm run test:firebase)
scripts/                            emulador.mjs, probar-firebase.mjs, preparar-pruebas.mjs (ver -00), mapa-interfaz.mjs, capturas.mjs, probar-csp.mjs
database.rules.json                 Reglas finales (cerradas) · database.rules.transicion.json: durante la migración
firebase.json, firebase.transicion.json, .firebaserc   Configuración de la CLI (solo alias "pruebas")
```

## 4. Cómo se conectan (flujo de una venta cobrada)

1. **Adaptador de entrada** — el cajero pulsa "Confirmar cobro"; `abrirCobro` (en `ui/ventas/cobro.js`) lee los montos del formulario.
2. **Dominio** — `pagos.liquidarCobro`, `caja.efectivoEsperado`, `inventario.requerimientos` / `aplicarCambioStock` deciden: si alcanza, cuánto es el cambio, qué sale del inventario y de qué lote.
3. **Puerto de salida** — la interfaz pide "guarda esta venta" y "resta este stock" (`Datos.guardar`, `Datos.modificarRegistro`), sin saber cómo.
4. **Adaptador de salida** — `firebase-datos.js` lo traduce a Firebase: sube solo los campos cambiados, usa una transacción para el stock y guarda la copia local.
5. **Efecto** — la venta queda en la nube y los demás equipos la reciben.

El arranque (`arranque.js`) es el que crea `firebase-datos.js`, verifica que cumple `puertos/datos.js` y se lo entrega a la interfaz: es el "endpoint" del documento de arquitectura.

## 5. El puente de migración (temporal)

La interfaz (`src/adaptadores/entrada/ui/`, antes `app.js`) ya son módulos ES (fase 8, sección 11), pero su código sigue usando el dominio y los datos con los nombres globales de siempre (`misDatos`, `pagosDe`, `ROLES`…). Para no reescribir todo de una vez:

- `puente-legado.js` publica en `window` el dominio y el adaptador **con los nombres que la interfaz ya usa** (`misDatos`, `guardarMisDatos`, `pagosDe`, `cajaDe`…). También publica los espacios de nombres explícitos `Datos`, `Dominio` y `Cripto`, que es lo que debe usar el código nuevo.
- La interfaz **no debe declarar** funciones con esos nombres: las taparía y volvería a usar código viejo. `tests/ui/estructura.test.mjs` lo verifica en cada `npm test`.
- Cada fase saca los casos de uso de un grupo de pantallas a `src/aplicacion/`; esos módulos importan lo que usan (del dominio o del servicio) en vez de leerlo de `window`, y los nombres que ya no se necesiten se borran del puente. Cuando nadie lo use, el puente desaparece.

Equivalencias de los nombres de siempre:

| Nombre que usa la interfaz | Ahora vive en |
|---|---|
| `DB.get/DB.set`, `misDatos`, `datosDe`, `claveDe` | `Datos` (`adaptadores/salida/firebase-datos.js`) |
| `guardarMisDatos`, `eliminarMisDatos` | `Datos.guardar`, `Datos.eliminar` |
| `cambiarStock`, `transaccionUnica` | `Datos.modificarRegistro`, `Datos.transaccionUnica` |
| `sincronizarNegocio/Todo`, `detenerSinc…`, `limpiarDatosAjenos`, `refrescarDeLaNube` (datos) | `Datos.*`, `Datos.recargar` |
| `fechaLocal`, `today`, `jornadaDe`, `mesDeJornada`, `jornadaCierre`, `diasHasta`, `diasDesde` | `Dominio.fechas` |
| `pagosDe`, `reparte`, `metodoPrincipal`, `metodoTexto`, `sumaPorMetodo`, `efectivoRecibido`, `tercerosNoEfectivo`, `bancoPendiente` | `Dominio.pagos` |
| `cajaDe`, `efectivoEsperado` | `Dominio.caja` |
| `ordenarLotes`, `sumaLotes`, `descontarDeLotes`, `difRequerimientos`, `esCombo` | `Dominio.inventario` |
| `requerimientos`, `faltantesPara`, `disponiblesCombo`, `faltantesParaAgregar`, `precioSuelto`, `lotesAlerta`, `reingresarALotes` | Envolturas en la interfaz que llaman a `Dominio.inventario` con los datos del negocio |
| `verificarPass`, `hashPass`, `sha256Hex` | `Dominio.contrasenas` (`ponerPass` es envoltura en `ui/usuarios/sesion.js` con `Cripto.nuevaSal`) |
| `uid` | `Cripto.nuevoId` |
| `ROLES`, `PANTALLAS_POR_ROL`, `ACCIONES`, `PERMISOS_POR_ROL` | `Dominio.permisos` (`tienePermiso`, `puedeVerSucursal` son envolturas en `ui/nucleo/permisos.js`) |
| `PERFILES`, `PLANES`, `planDe`, `VENTANAS_POR_PLAN`, `inventarioHabilitado`, `sucursalesDe`, `usaSucursales` | `Dominio.negocio` (`usaInventario`, `diasAvisoVence` son envolturas) |
| `CONCEPTOS_BASE`, `normConcepto`, `claveConcepto` | `Dominio.gastos` (`getConceptosGasto`, `acumConcepto` son envolturas en `ui/gastos/gastos.js`) |
| (nuevo, S1) inicio de sesión con Firebase, migración de cuentas | `ServicioSesion.crear(PANTALLAS_POR_ROL)` → `iniciarSesion`, `restaurar` (`aplicacion/servicios/sesion.js`) |
| (nuevo, S1) crear/reemplazar/borrar cuentas, perfiles, índice | `Cuentas` (`adaptadores/salida/firebase-cuentas.js`); envolturas en `ui/usuarios/cuentas.js`: `crearCuentaPara`, `reemplazarCuenta`, `sincronizarPerfil`, `borrarCuentaDe` |
| `maxFacturaLocal`, `reservarFactura`, `siguienteFactura` | Envolturas en `ui/ventas/nueva-venta.js` sobre `Dominio.facturas` + `Datos.reservarConsecutivo` |

## 6. Plan de fases

Cada fase deja la app funcionando, pasa `npm test` y las pruebas de navegador, y se revisa antes de seguir.

| Fase | Contenido | Estado |
|---|---|---|
| **1** | Estructura de carpetas; dominio de fechas, pagos, caja, inventario, facturas y contraseñas con pruebas; puerto de datos; adaptadores de Firebase, almacenamiento local y cripto; raíz de composición; puente. | ✅ Hecha |
| **1.5** | Interfaz partida en 46 archivos por módulo + manifiesto de carga; permisos, negocio y gastos al dominio; prueba estructural y recorrido completo en navegador (sección 10). | ✅ Hecha (2026-10-08) |
| 2 | **Caja**: casos de uso `abrirCaja`, `registrarMovimiento`, `cerrarCaja`, `retirarConCajaCerrada` en `aplicacion/caja.js`; pantalla de caja e impresión del cierre como módulos de UI. | Pendiente |
| 3 | **Ventas**: carrito, cobro (usar `pagos.liquidarCobro`), pedidos, edición y ajuste de cobro, cuentas abiertas. | Pendiente |
| 4 | **Inventario**: catálogo, combos, insumos, recetas, lotes, conteo. | Pendiente |
| 5 | **Operación**: clientes, domicilios y cuadre, citas, cocina, tiempos. | Pendiente |
| 6 | **Gestión**: dashboard, reportes, historial, contable, gastos, impresión (adaptador de impresión). | Pendiente |
| 7 | **Administración**: login, usuarios, permisos, super-admin, configuración, Mi Negocio. **S1 (Plan B) ya se adelantó**: puerto y adaptador de cuentas + servicio de sesión. Falta mover las pantallas de usuarios y super-admin a módulos. | Parcial (S1 ✅) |
| **8** | **Cierre**: estilos de `index.html` a `ui/estilos/`; `style="…"` de las plantillas a clases; `onclick` → eventos delegados (`data-click`); scripts clásicos → módulos ES (sección 11). Falta solo **retirar el puente**, que depende de las fases 2–7. | ✅ Hecha (2026-10-09), salvo el puente |

## 7. Cómo agregar o cambiar algo

| Quiero… | Dónde |
|---|---|
| Cambiar una regla (fórmula, validación, cálculo) | `src/dominio/…` + su prueba en `tests/dominio/` |
| Agregar una operación de la app (un "caso de uso") | `src/aplicacion/…` (desde la fase 2) |
| Necesito algo nuevo de la base de datos | Agregarlo al puerto `aplicacion/puertos/datos.js` **y** a `adaptadores/salida/firebase-datos.js` (si falta, `verificarPuertoDatos` avisa al arrancar) |
| Una pantalla o botón | El archivo de su módulo en `src/adaptadores/entrada/ui/<módulo>/` (buscar la función en [mapa-interfaz.md](mapa-interfaz.md)) |
| Un archivo nuevo de interfaz | Crearlo en su carpeta como módulo (`export function …`, `import { … } from '../nucleo/estado.js'`) y **agregarlo a `ui/manifiesto.js`**; al cargar solo declarar (no ejecutar código importado). `npm test` revisa la estructura; luego `node scripts/mapa-interfaz.mjs` |
| Un botón o campo que llama una acción | `data-click="accion('texto', 3, this.value)"` (también `data-input`, `data-change`, `data-keydown`, `data-enter`, `data-focus`, `data-blur`, `data-mousedown`, `data-toggle`). La acción debe estar **exportada**. Textos del usuario: `data-x="${escapeHtml(v)}"` y `this.dataset.x`. Nunca `onclick="…"` ni `style="…"` fijo (usar las clases de `estilos/15-utilidades.css`) |
| Cambiar una variable de otro módulo | No se puede asignar lo importado: el módulo dueño exporta `fijarX(v)` (p. ej. `fijarEscribiendo`) |
| Una regla que hoy está en la interfaz | Moverla a `src/dominio/`, publicarla en el puente con el mismo nombre si la interfaz la usa por nombre, y dejar en la interfaz solo la envoltura que le pasa `STATE` |
| Conectar una pieza nueva | `src/arranque.js` |

## 8. Cómo se verificó la fase 1

- `npm test`: 21 pruebas del dominio.
- Navegador sin interfaz (Chromium) contra una copia del proyecto servida por HTTP, con Firebase simulado en memoria y en modo local:
  - las 44 comprobaciones de seguridad y datos de [-02-corrections](../-02-corrections/-02-corrections.md) siguen pasando;
  - recorrido completo: 18 negocios demo (uno por plantilla), las 23 pantallas de cada uno (414 vistas), las 5 pestañas de configuración, usuarios y administradores, y una venta cobrada por negocio. Sin errores de JavaScript.
- No se probó contra Firebase real ni en móviles.

## 9. Realtime Database vs. Cloud Firestore

> La diferencia con **Cloud Storage** (archivos: logos, fotos, respaldos) está en [realtime-vs-storage](realtime-vs-storage.md).

Firebase ofrece dos bases de datos. Wallace System usa **Realtime Database**. Esta sección explica la diferencia, qué ganaría el sistema con **Cloud Firestore** y por qué la recomendación es no cambiar todavía.

### 9.1 Diferencias

| Aspecto | Realtime Database (actual) | Cloud Firestore |
|---|---|---|
| Modelo de datos | Un solo árbol JSON gigante. | Colecciones de documentos (`negocios/{id}/ventas/{id}`), con subcolecciones. |
| Consultas | Muy limitadas: un solo orden o filtro por consulta. Para "ventas de marzo del negocio N1 pagadas con tarjeta" hay que bajar todo y filtrar en el navegador. | Filtros combinados, orden, paginación y agregaciones (`count`, `sum`, `average`) en el servidor. |
| Qué se descarga | Al escuchar un nodo se baja **todo su contenido**. Hoy el panel del super-admin baja la base completa en cada cambio. | Solo los documentos que pide la consulta. |
| Funcionamiento sin internet (web) | El SDK web **no guarda** datos entre recargas. Por eso la app tiene su propio respaldo en `localStorage` y su cola de cambios pendientes. | El SDK web trae persistencia en el navegador (IndexedDB) y cola de escrituras pendientes. |
| Transacciones | Sobre un solo nodo. | Sobre varios documentos a la vez, y escrituras en lote (hasta 500 operaciones). |
| Reglas de seguridad | JSON en cascada; difíciles de leer cuando crecen (ver las reglas del Plan B). | Lenguaje propio con funciones y validación por documento; el modelo multi-negocio (`negocios/{negId}/…`) se expresa de forma más natural. |
| Latencia | Muy baja; ideal para estado en vivo (presencia, `.info/connected`). | Algo mayor, suficiente para un punto de venta. |
| Límite de escrituras | Alto (del orden de 1.000 escrituras por segundo por base). | **~1 escritura por segundo sostenida por documento.** Afecta documentos "calientes" como un contador de facturas o la caja abierta. |
| Tamaño máximo | 256 MB por escritura. | 1 MiB por documento (alcanza para un negocio con su logo). |
| Cómo se cobra | Por **GB guardados y GB descargados**. | Por **número de lecturas, escrituras y borrados** de documentos, más almacenamiento. |
| Plan gratuito (Spark), aproximado | 1 GB guardado, 10 GB descargados al mes, **100 conexiones simultáneas**. | 1 GiB guardado, ~50.000 lecturas, ~20.000 escrituras y ~20.000 borrados **por día**; sin el límite de 100 conexiones. |

Las cifras de planes y límites cambian; confirmarlas en la página de precios de Firebase antes de decidir.

### 9.2 Qué ganaría Wallace System con Firestore

- **Panel del super-admin y reportes sin bajar toda la base**: totales del mes, ventas por negocio o por día calculados en el servidor con consultas y agregaciones.
- **Menos código propio**: buena parte de `adaptadores/salida/firebase-datos.js` (respaldo local, cola sin internet, sincronización por registro, marcas de borrado) existe porque Realtime Database no lo trae para web; Firestore sí.
- **Más de 100 equipos conectados a la vez** sin pasar a pago.
- **Reglas multi-negocio más claras** para S1 (`match /negocios/{negId}/{doc=**}`).
- **Transacciones de varios documentos**: cobrar (venta + stock + cliente) podría ser una sola operación atómica.

### 9.3 Qué costaría

- **Reescribir el adaptador de datos** completo (`firebase-datos.js`) y **migrar los datos** de producción a la nueva estructura. Gracias a la arquitectura hexagonal el resto de la app no cambia: el nuevo adaptador cumple el mismo puerto (`aplicacion/puertos/datos.js`).
- **Cambiar la forma de leer**: hoy cada equipo escucha tablas completas (`ventas`). En Firestore cada documento leído cuenta. Con varios equipos abriendo la app y escuchando todo el historial, las 50.000 lecturas diarias gratuitas se pueden agotar. Habría que leer solo lo necesario (la jornada actual, el mes del reporte).
- **Documentos calientes**: el consecutivo de facturas y la caja abierta reciben muchas escrituras seguidas; habría que diseñarlos para el límite de ~1 escritura por segundo por documento (en un negocio pequeño normalmente alcanza).
- **Rehacer S1** sobre las reglas de Firestore, si se migra antes.

### 9.4 Recomendación

**Seguir con Realtime Database por ahora** y terminar primero S1 y las fases de la reorganización:
- Los problemas urgentes (seguridad, concurrencia) ya tienen solución sobre Realtime Database.
- Cambiar de base y de modelo de datos a la vez que se reorganiza el código suma riesgo sin necesidad.
- Cuando la reorganización termine, el cambio se reduce a escribir un **adaptador nuevo** (`firestore-datos.js`) que cumpla el puerto, probarlo en el proyecto de pruebas y migrar los datos.

**Señales para reconsiderar Firestore:**
- el panel del super-admin o los reportes se vuelven lentos por la cantidad de datos;
- se acercan las 100 conexiones simultáneas o los 10 GB de descarga mensual del plan gratuito;
- se necesitan reportes históricos con filtros que hoy obligarían a bajar todo;
- se quiere un funcionamiento sin internet más robusto sin mantener código propio.

## 10. Partición de la interfaz (2026-10-08)

El `app.js` de 7.700 líneas se partió en **46 archivos** (45 al partirlo + `reportes/resumen.js` de R1) por módulo dentro de `src/adaptadores/entrada/ui/`, y las reglas puras que todavía vivían en la interfaz pasaron al dominio.

### 10.1 Cómo se hizo sin romper nada

- **Al partirla quedaron scripts clásicos** (ámbito global compartido: una función de `ventas/cobro.js` se llamaba igual desde `ventas/pedidos.js` o desde un `onclick`). La fase 8 (sección 11) los volvió módulos ES.
- **El corte lo hizo un analizador (acorn), no a mano.** Cada sentencia de primer nivel, con sus comentarios, fue al archivo de su sección; la suma de los fragmentos tiene exactamente los mismos caracteres que el original. Antes se verificó que **ninguna sentencia que se ejecuta al cargar usa algo de otra parte del archivo** (solo hay declaraciones, dos `setInterval`, un `addEventListener` y un observador de tablas), así que el orden de carga no puede romper nada.
- **Carga (hasta la fase 8):** `src/arranque.js` insertaba los archivos de `ui/manifiesto.js` con `async=false` y `?v=VERSION_UI`. Hoy los importa como módulos (sección 11.3).

### 10.2 Qué pasó al dominio

| Antes en la interfaz | Ahora | La interfaz conserva |
|---|---|---|
| `ROLES`, `PANTALLAS_POR_ROL`, `ACCIONES`, `PERMISOS_POR_ROL`, lógica de `tienePermiso`, `puedeVerSucursal`, pantallas del rol en `armarMenu` | `dominio/permisos.js` (`puede`, `pantallasDe`, `puedeVerSucursal`) | `tienePermiso(accion)` y `puedeVerSucursal(id)` como envolturas que pasan `STATE.user` |
| `PERFILES`, `PLANES`, `planDe`, `VENTANAS_POR_PLAN`, `inventarioHabilitado`, `usaInventario`, `diasAvisoVence`, `sucursalesDe`, `usaSucursales` | `dominio/negocio.js` | `usaInventario(neg)` y `diasAvisoVence()` con el negocio de la sesión por defecto |
| `CONCEPTOS_BASE`, `normConcepto`, `claveConcepto`, deduplicación y suma por concepto | `dominio/gastos.js` (`conceptosUnicos`, `acumularConcepto`) | `getConceptosGasto()` y `acumConcepto()` leen los datos y delegan |
| `difDe` (diferencia del conteo) | `dominio/inventario.js` → `diferenciaConteo` | `difDe` como envoltura |

El puente publica las constantes y funciones puras con su nombre de siempre, así que el resto de la interfaz no cambió. `PANTALLAS_POR_ROL` ya no viaja de la interfaz al servicio de sesión: el arranque se la pasa directamente desde el dominio.

### 10.3 Pruebas que lo cuidan

| Prueba | Qué detecta |
|---|---|
| `tests/ui/estructura.test.mjs` (`npm test`) | Archivo fuera del manifiesto; nombre repetido entre módulos o que tapa uno del puente; `import` de un nombre que ese módulo no exporta, de más o renombrado; asignación a algo importado; código que al cargar usa algo importado; identificador sin declarar ni importar (sería `ReferenceError`); `data-click`/`data-input`/… que llama una acción no exportada o con argumentos no permitidos; `onclick="…"` en una plantilla; nombres que `arranque.js` usa de la interfaz; estilos de `index.html` (sección 11). Se comprobó metiendo errores a propósito. |
| `tests/navegador/recorrido.test.mjs` (`npm run test:firebase`) | Modo local en Chrome sin ventana: crea los 18 demos, dibuja las pantallas del super-admin (incluidas las 5 pestañas de configuración de cada negocio) y **todas** las pantallas del menú de cada negocio (más de 300), y en cada negocio con caja hace una venta con pago dividido, la anula (el stock vuelve, queda en auditoría) y cierra la caja. Falla también con los errores que la app atrapa y oculta ("Error en pantalla"). |
| `tests/dominio/negocio.test.mjs` | Las reglas movidas al dominio. |

### 10.4 Lo que falta para que la interfaz sea "hexagonal" del todo

- **Los casos de uso siguen en la interfaz** (cobrar, anular, abrir y cerrar caja, mover inventario…): leen y escriben datos con `misDatos`/`guardarMisDatos` directamente. Sacarlos a `src/aplicacion/` es el contenido de las fases 2 a 7; ahora cada uno está en un archivo chico y con su prueba de recorrido, lo que hace ese trabajo mucho más seguro.
- **El puente sigue publicando en `window`** el dominio y los datos con sus nombres de siempre; los módulos de la interfaz los usan sin importarlos. Se retira cuando las fases 2–7 los cambien por imports.
- Mapa función → archivo: [mapa-interfaz.md](mapa-interfaz.md) (generado con `node scripts/mapa-interfaz.mjs`).

## 11. Fase 8: estilos, eventos delegados y módulos ES (2026-10-09)

> Guía para trabajar con los módulos (qué son, reglas, cómo agregar funciones, acciones y archivos, errores típicos): [modulos-es](modulos-es.md).

Se hizo en tres pasos, cada uno verificado con `npm test`, `npm run test:firebase` y **121 capturas de pantalla idénticas píxel a píxel** a las de antes (`scripts/capturas.mjs`, sección 11.5). El rediseño visual quedó para después, a pedido del usuario.

### 11.1 Estilos fuera de `index.html`

- El bloque `<style>` de `index.html` pasó, en el mismo orden, a `src/adaptadores/entrada/ui/estilos/01-base.css` … `14-responsive.css`. **El orden importa** (reglas posteriores ganan): los números lo fijan e `index.html` los enlaza en ese orden con `?v=VERSION_UI`.
- 221 `style="…"` fijos de las plantillas pasaron a 101 clases de utilidad en `15-utilidades.css` (`.mt-8`, `.d-flex`, `.fw-800`, `.oculto`…). Llevan `!important` para conservar la prioridad que tenía el estilo en línea.
- Quedaron en línea, a propósito: los estilos calculados (alto de barras, anchos), los de elementos que el código muestra u oculta por `style.display` (`r-prop`, `r-rec`, `g-boxconcepto`, `c-nota`: con una clase `!important` el código ya no podría cambiarlos) y las plantillas de **impresión**, que se abren en otra ventana sin estos CSS.

### 11.2 Eventos delegados

- El HTML generado ya no lleva `onclick="…"`: lleva `data-click="accion(args)"` (y `data-input`, `data-change`, `data-keydown`, `data-enter`, `data-focus`, `data-blur`, `data-mousedown`, `data-toggle`). Eran 250 manejadores; los 64 que tenían varias sentencias se volvieron funciones con nombre (`buscarEnVenta`, `elegirCategoriaVenta`, `datoCliente`, `irPanel`…).
- `ui/nucleo/eventos.js` pone **un escuchador por tipo de evento** en el documento. Busca el atributo en el elemento (y en sus ancestros para clic, teclado y cambios), y llama la acción. `stopPropagation()` sigue cortando la búsqueda.
- **Sin `eval`**: el texto se interpreta como una sola llamada con argumentos simples (`'texto'`, números, `true/false/null`, `this`, `this.value`, `this.checked`, `this.dataset.x`, `event`). Otra cosa es un error que se reporta con `reportarError`.
- Las acciones salen **solo** de lo que exportan los módulos de la interfaz (no de `window`).
- De paso se corrigió un fallo de seguridad (**S6**): el nombre de una categoría quedaba dentro de un `onclick` y podía ejecutar código; uno inocente con apóstrofo (`Niño's`) solo rompía el botón. Ahora el nombre va en `data-cat` escapado y la acción lo lee de `this.dataset.cat`. Ataques posibles con código en línea y riesgo que queda: [seguridad-interfaz](seguridad-interfaz.md); la CSP que ahora se puede activar: [csp.md](csp.md).

### 11.3 Módulos ES

- Los 47 archivos de `ui/` son módulos: cada uno **exporta** sus declaraciones de nivel superior e **importa** lo que usa de los otros (588 nombres importados). La conversión la hizo un script con acorn, con análisis de ámbitos (un nombre local que tapa uno de otro archivo no se importa).
- **Un módulo no puede asignar lo que importa.** Las 12 variables que otro archivo cambiaba se resolvieron así:
  - el pedido que se carga en Nueva Venta (`_carrito`, `_vTipo`, `_vCli`… desde cobro y cuentas abiertas, código repetido) → `cargarPedidoEnVenta(v, conItems)` en `ventas/nueva-venta.js`;
  - el resto → una función `fijarX(v)` en el módulo dueño: `fijarEscribiendo`, `fijarGuardando`, `fijarFacturaReservada`, `fijarResumenNeg`, `fijarConfigInicial`.
- **Carga**: `src/arranque.js` instala el puente y luego hace `import()` de `ui/manifiesto.js`, cuya `cargarInterfaz()` importa todos los módulos de la lista, arma su **espacio de nombres** (nombre exportado → valor vivo), instala los eventos delegados y lo devuelve. El arranque lo usa para los ganchos del adaptador de datos (`ui.refrescarSiSePuede()`…) y llama `ui.iniciarInterfaz()`.
- **Importaciones circulares**: hay muchas (navegación ↔ pantallas). Son seguras porque al cargar ningún módulo ejecuta código importado (solo declara). La prueba estructural lo vigila.
- **`window.WS`**: el espacio de nombres queda en `window.WS` para la consola y las pruebas (`WS.STATE`, `WS.render()`, `WS._carrito`). Es de solo lectura: para cambiar una variable se usa su función.
- **Caché**: los módulos **no llevan `?v=`**, porque un mismo módulo con dos URL serían dos copias con estado distinto. En su lugar `render.yaml` pone `Cache-Control: no-cache` en `/src/*`: el navegador pregunta cada vez si cambió (respuesta 304 si no) y nunca mezcla versiones. Esto cubre también los módulos de `src/dominio/`, que ya estaban así. `VERSION_UI` sigue en el `?v=` de los estilos: **cambiarla en cada publicación**.

### 11.4 Lo que no cambió

- Las pantallas, textos, datos y reglas. Las capturas antes y después son idénticas.
- El puente (`puente-legado.js`): los módulos siguen usando `misDatos`, `Dominio`, `DB`… desde `window` (sección 5).

### 11.5 Cómo se verificó

| Herramienta | Qué hace |
|---|---|
| `node scripts/capturas.mjs tomar <carpeta>` y `comparar <A> <B>` | Toma 121 capturas deterministas en modo local (azar con semilla, fecha fija, sin reloj ni avisos): pantallas del super-admin y de cada negocio, celular, pestañas de configuración y modales. `comparar` dice cuáles cambiaron y dónde. Con `CAPTURAS_RAIZ` sirve otra copia del proyecto (p. ej. un `git worktree` del commit anterior). Las capturas van en `capturas/` (en `.gitignore`). |
| `tests/ui/estructura.test.mjs` | Ver 10.3. |
| `tests/navegador/recorrido.test.mjs` | Además de lo de 10.3, revisa en el HTML ya dibujado de las 327 pantallas que no quede ningún `on…=` y que cada `data-*` (unas 10.500) llame una acción existente con argumentos válidos. También hace clics y escritura **reales** (menú, categoría con apóstrofo, producto, quitar del carrito, búsqueda). |

### 11.6 Reglas para trabajar en la interfaz (en `CLAUDE.md` desde el 2026-10-09)

Al cerrar la fase 8 se actualizaron las reglas estáticas de `CLAUDE.md`:

- **Arquitectura**: la interfaz son **52 módulos ES** (47 en la fase 8; antes "45 scripts clásicos"). `ui/manifiesto.js` los lista y su `cargarInterfaz()` los importa, instala los eventos delegados (`data-click`) y arma `window.WS`. Los estilos están en `ui/estilos/`, en orden numérico. Retirar el puente es lo único que falta de la fase 8.
- **Módulos**: importar lo que se usa, sin renombrar (`import { x } from '../nucleo/estado.js'`). No repetir nombres entre módulos ni tapar uno del puente. Al cargar, solo declarar, porque hay importaciones circulares. Para cambiar una variable de otro archivo, usar su `fijarX(v)`.
- **HTML generado**: acciones con `data-click` (y `data-input`, `data-change`…), siempre **exportadas**. Los textos del usuario van en `data-x` + `this.dataset.x`. Nada de `onclick` ni `style` fijos: se usan las clases de `estilos/15-utilidades.css`. El porqué está en [seguridad-interfaz](seguridad-interfaz.md).
- **Archivo nuevo de interfaz**: agregarlo a `ui/manifiesto.js` y correr `node scripts/mapa-interfaz.mjs`.
- **Publicar**: subir `VERSION_UI` junto con el `?v=` de los estilos en `index.html` (la prueba exige que coincidan).
- **Consola y pruebas**: usar `WS.<nombre>` (`WS.STATE`, `WS.render()`). Las pruebas y capturas abren con `?local`. Los cambios visuales se comprueban con `node scripts/capturas.mjs tomar <dir>` antes y después, y `comparar <A> <B>`.

#### Carpetas de `capturas/`

Cada `tomar <carpeta>` crea una carpeta con las fotos numeradas (`001-config-inicial.png`, `002-config-inicial-movil.png`…). Ocupan unos 31 MB cada una y no van a Git (`capturas/` está en `.gitignore`).

**Hay una sola carpeta que se guarda: `capturas/referencia`**, la foto de la versión actual (2026-10-12, después de la cuarta revisión). Las carpetas de referencias anteriores (fase 8, tema, SDK modular, demos, segunda revisión…) se borraron el 2026-10-12. Ya no servían para comparar, porque los datos de las demos y varias pantallas cambiaron desde entonces, y el resultado de cada comparación quedó escrito en las secciones de cada cambio.

**Para un cambio visual**:
1. Hacer el cambio.
2. `node scripts/capturas.mjs tomar capturas/despues`.
3. `node scripts/capturas.mjs comparar capturas/referencia capturas/despues`: revisar cada captura distinta.
4. Si los cambios son los esperados, `capturas/despues` pasa a ser la nueva `capturas/referencia` (borrar la vieja y renombrar). Así siempre queda **una**.

**Si `referencia` se borra o no coincide con el código**: se rehace con `tomar capturas/referencia` sobre la versión que se quiera usar (para una versión anterior, desde un `git worktree` de ese commit con `CAPTURAS_RAIZ`).

**Semilla de los datos**: el tool fija el azar con una semilla y la **vuelve a fijar justo antes de crear los demos** (`window.__semilla`). Así los datos no dependen de cuántos números al azar gasten las librerías al cargar. Se agregó el 2026-10-11, porque las librerías *compat* de Firebase gastaban uno y, al quitarlas, el primer demo salía con una venta más. Por eso hay una referencia nueva, `capturas/modular` (sección 11.7). Si `base` se borra, se rehace tomando las fotos de la versión que se quiera usar de referencia. Para un cambio nuevo, la costumbre es: `tomar capturas/antes` → hacer el cambio → `tomar capturas/despues` → `comparar capturas/antes capturas/despues`.

### 11.7 Sin scripts clásicos: Firebase modular, configuración y logo como módulos (2026-10-11)

Quedaban tres scripts clásicos en `index.html`: las librerías *compat* de Firebase (que dejaban el global `window.firebase`), `logo.js` y `firebase-config.js` (que dejaban `window.WALLACE_LOGO`, `window.FIREBASE_CONFIG`…). Se convirtieron:

| Antes | Ahora |
|---|---|
| `firebase-app-compat.js`, `-database-compat.js`, `-auth-compat.js` en `index.html`; adaptadores con `firebase.database().ref(r).once()` | SDK **modular** que importa `src/adaptadores/salida/firebase-sdk.js` **solo si hay base**; adaptadores con `get(ref(db, r))`, `onValue`, `runTransaction`… ([modulos-es](modulos-es.md), sección 8) |
| `firebase-config.js` script clásico con `window.FIREBASE_*` | Módulo con `elegirEntorno(location)`, probado en `tests/configuracion/firebase-config.test.mjs` (ningún dominio fuera de `HOSTS_PRODUCCION` usa producción; `?local`/`?emulador` solo en localhost) |
| `logo.js` con `window.WALLACE_LOGO` | `ui/nucleo/logo.js` (`export const WALLACE_LOGO`) |
| La interfaz leía `window.FIREBASE_ENTORNO` | `Datos.entorno`: el arranque se lo pasa al adaptador de datos |
| `prueba.js` con el global `firebase` | Módulo con `elegirEntorno` y el SDK modular |

**Resultado**: `index.html` tiene **un solo** `<script type="module" src="src/arranque.js">`, y no queda ningún global propio salvo `window.WS` y el puente. **En modo local la app ya no descarga Firebase.** La interfaz no cambió: solo cambiaron los dos adaptadores de salida, gracias a los puertos.

**Cómo se verificó**:
- `npm test`: 76, incluidas las nuevas pruebas de `elegirEntorno` y una que exige un solo script en `index.html` y ningún global viejo.
- `npm run test:firebase`: 36, incluida la integración, que pasa a los adaptadores los paquetes modulares de npm, y el login y la migración en Chrome contra los emuladores.
- Carga real contra el sandbox: pide `firebase-app.js`, `-database.js` y `-auth.js`; no existe `window.firebase`; conecta.
- `node scripts/probar-csp.mjs`: 0 violaciones.
- Capturas de la versión anterior (`e2f41bc`, servida desde un `git worktree`) y la nueva, con la misma semilla: **121 de 121 idénticas** (`capturas/antes-modular` vs `capturas/modular`).
- La herramienta de capturas se detuvo 2 veces de unas 8, al final (modales del tercer negocio), sin poder reproducirlo en 4 repeticiones seguidas. La app no tenía errores: las pruebas pasan y las corridas completas son idénticas. Desde ahora, si vuelve a pasar, dice en qué captura se detuvo y por qué (y termina con error).

### 11.8 Tema centralizado en tokens (2026-10-11)

Todos los colores (72 distintos, 211 usos), fuentes, tamaños de letra (26) y radios (16) pasaron a variables en `ui/estilos/00-tokens.css`. Los demás CSS solo usan `var(--…)`, y `tests/ui/estructura.test.mjs` lo exige. Además, el acento de cada negocio dejó de llamarse `--verde…`/`--acc-…` (`--acento…`), y el verde fijo de la marca tiene su propio token (`--marca`). Capturas antes y después: **121 de 121 idénticas** (tema oscuro y claro). Detalle, reglas y lo que queda para el rediseño (modo claro por componente, `--linea`/`--glow` que no siguen al negocio, escala de tamaños, textos): [tema.md](tema.md).
