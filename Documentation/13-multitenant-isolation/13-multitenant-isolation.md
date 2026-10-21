# 13 — Datos, sincronización y aislamiento por negocio (multitenant)

> **S1 (Plan B) implementado**: con cuentas de Firebase ya no se descargan tablas globales antes del login; `negocios` vive por registro en `data/negocios_r/<id>` (cada empleado lee solo el suyo), los usuarios en `data_<neg>_usuarios_r` y el aislamiento lo hacen las reglas (`database.rules.json`), no solo la app. `limpiarDatosAjenos` también borra del equipo `superadmins` y los usuarios de otros negocios. Modelo completo: [-00 → Estructura en la nube](../-00-execution-protocol/-00-execution-protocol.md#estructura-en-la-nube) y [-02 → S1](../-02-corrections/-02-corrections.md#s1--base-de-datos-sin-autenticación-ni-reglas--implementado-falta-desplegar).

## 1. Propósito

Capa de datos de todo el sistema. Define dónde vive cada dato, cómo se guarda en el navegador y en Firebase Realtime Database, cómo se sincroniza entre equipos y cómo se separa la información de cada negocio (tenant). También incluye el ciclo de arranque y el motor de render, porque ambos dependen del estado de la nube.

> **Ubicación del código (arquitectura hexagonal, fase 1):** la capa de datos ya no está en `app.js`. Es el adaptador de salida `src/adaptadores/salida/firebase-datos.js`, que cumple el puerto `src/aplicacion/puertos/datos.js`, y se usa como `Datos.*`. Los nombres de siempre (`misDatos`, `guardarMisDatos`, `DB.get`…) siguen funcionando a través del puente (ver [-03-architecture](../-03-architecture/-03-architecture.md#5-el-puente-de-migración-temporal)). La tabla de la sección 5 conserva esos nombres y señala dónde vive cada uno.

## 2. Alcance

**Incluye**
- Caché en memoria (`CACHE`) + persistencia en `localStorage` (prefijo `ws_`).
- Claves por negocio `data_<negocioId>_<tabla>`.
- Sincronización **por registro** (v2): un nodo por registro, subida de solo los campos cambiados, marcas de borrado (*tombstones*), cola offline.
- Migración automática del formato viejo (tabla completa) al formato por registro.
- Escucha selectiva: el empleado solo descarga su negocio; el super-admin escucha todo.
- Limpieza de datos de otros negocios al iniciar sesión.
- Refresco de pantalla protegido (no redibuja mientras el usuario escribe).
- Arranque (`initFirebase` → `cargarDeLaNube` → `seed` → `render`).

**No incluye**
- Autenticación real (no se usa Firebase Auth; ver [10-users-roles](../10-users-roles/10-users-roles.md)).
- Reglas de seguridad de la base (no están en el repositorio).
- Restauración de respaldos (solo descarga; ver [01-super-admin-panel](../01-super-admin-panel/01-super-admin-panel.md)).

## 3. Modelo de almacenamiento

### Tablas

| Constante | Tablas | Ámbito |
|---|---|---|
| `TABLAS_GLOBALES` (`adaptadores/salida/firebase-datos.js`) | `negocios`, `superadmins`, `usuarios` | Globales: un array por tabla en `data/<tabla>`. Se descargan **antes** del login. |
| `TABLAS` (`adaptadores/salida/firebase-datos.js`) | `usuarios`, `productos`, `insumos`, `ventas`, `clientes`, `cierres`, `caja_actual`, `movimientos`, `domiciliarios`, `citas`, `gastos_negocio`, `config`, `factura_seq`, `auditoria`, `conteos`, `conceptos_gasto` | Por negocio: `data_<negId>_<tabla>` |
| `TABLAS_UNICAS` (`adaptadores/salida/firebase-datos.js`) | `caja_actual`, `config`, `factura_seq`, `conceptos_gasto` | Por negocio, pero se guardan **enteras** (un solo valor), no por registro. `caja_actual` y `factura_seq` se escriben con transacciones. |

> `usuarios` aparece en ambas listas: la tabla que se usa realmente es la global; `data_<negId>_usuarios` se escucha pero ninguna función la lee ni la escribe.

### Formato en Firebase (nodo `data/`)

| Ruta | Contenido |
|---|---|
| `data/negocios`, `data/usuarios`, `data/superadmins` | Array completo (se sobrescribe entero con `DB.set`). |
| `data/data_<neg>_<tabla>_r/<id>` | Un registro. Se actualizan solo sus campos modificados. |
| `data/data_<neg>_<tabla>_x/<id>` | Marca de borrado (timestamp). Impide que un registro borrado "reviva" desde otro equipo. |
| `data/data_<neg>_<tabla>` | Formato viejo (array). Si aparece, se migra a `_r` y se elimina. |
| `data/data_<neg>_<tabla>_bk` | Copia del formato viejo tomada al migrar. |
| `data/data_<neg>_caja_actual`, `..._config`, `..._factura_seq`, `..._conceptos_gasto` | Valor completo. |

### En el navegador

- `CACHE[clave]` siempre contiene el **array** completo de la tabla (aunque en la nube esté partido por registro), ordenado por fecha descendente según `_campoOrden` (`ventas.fecha`, `cierres.cierre`, `movimientos.fecha`, `conteos.fecha`, `gastos_negocio.fecha`, `citas.fechaHora`, resto `creado`).
- `localStorage['ws_'+clave]` es el respaldo persistente de cada clave.
- `localStorage['ws_cola_reg']`: actualizaciones pendientes de subir (sin internet o con error).
- `localStorage['ws_suc_<negId>']`: última sucursal elegida.
- `REG_SRV[clave][id]`: JSON del último estado conocido en el servidor por registro (para calcular diferencias).
- `REG_BORRADOS[clave][id]`: marcas de borrado conocidas.

## 4. Flujos

### 4.1 Arranque (`src/arranque.js` → `ui/manifiesto.js` → `ui/nucleo/arranque.js`)

1. `initFirebase()` carga todo `ws_*` de `localStorage` al `CACHE` (arranque instantáneo) e intenta conectar. Activa el indicador de conexión con `.info/connected`.
2. Si hay nube: muestra "Conectando…", llama `cargarDeLaNube()` que baja **solo** `TABLAS_GLOBALES` (necesarias para validar el login) y empieza a escucharlas (`escucharGlobales`).
3. Si la nube no responde en 12 s, arranca igual en local.
4. `arrancar()` → `seed()` (solo si las tablas globales se **leyeron bien** de la nube, bandera `GLOBALES_LEIDAS`, para no pisar datos reales; migra contraseñas a hash) → `render()` (si no hay super-admins, muestra la configuración inicial).
5. Al iniciar sesión (`hacerLogin`):
   - Super-admin → `sincronizarTodo()` (escucha todo `data/`).
   - Empleado → `detenerSincTodo()`, `limpiarDatosAjenos(negId)` y `sincronizarNegocio(negId)`.

### 4.2 Sincronizar un negocio (`sincronizarNegocio`, `adaptadores/salida/firebase-datos.js:269`)

Para cada tabla de `TABLAS`:
1. Tablas únicas: escucha `value` del nodo completo.
2. Tablas por registro:
   1. Lee las marcas de borrado (`_x`).
   2. Lee los registros (`_r`), descarta los marcados y arma el array local.
   3. Si existe el formato viejo, lo migra (`migrarTablaVieja`).
   4. Se suscribe a `child_added`/`child_changed`/`child_removed` de `_r` y a `child_added` de `_x`.
   5. Se suscribe también al nodo viejo por si un equipo desactualizado escribe ahí.
3. Antes de todo sube la cola pendiente (`subirColaRegistros`).

### 4.3 Guardar (`guardarMisDatos(tabla, arr)`, `adaptadores/salida/firebase-datos.js:149`)

1. Tablas únicas → `DB.set` directo (así un cierre de caja deja `caja_actual` vacía para todos).
2. Tablas por registro:
   1. **Fusión por id**: parte de lo que hay en `CACHE` (incluido lo recién llegado de otros equipos), descarta los borrados y monta encima los registros de `arr`. Si `arr` trae un id repetido, gana el primero.
   2. Guarda el resultado solo en local (`_soloLocal`).
   3. `_subirRegistros` compara cada registro de `arr` con `REG_SRV` y envía a Firebase un único `update()` con **solo los campos que cambiaron** (`.../<id>/<campo>`), poniendo `null` en los campos eliminados. Registros nuevos se envían completos.
   4. Si falla o no hay conexión, la actualización se encola en `ws_cola_reg`.

> Consecuencia: `guardarMisDatos` **nunca borra** registros aunque `arr` traiga menos elementos. Para borrar se usa `eliminarMisDatos`. Para agregar registros basta pasar solo los nuevos (`guardarMisDatos(tabla, [nuevo])`).

### 4.3.1 Cambios concurrentes

- **Existencias**: `cambiarStock(tabla, id, fn)` aplica el cambio en el equipo y en una transacción sobre `data_<neg>_<tabla>_r/<id>` (ver [06](../06-inventory-recipes/06-inventory-recipes.md)).
- **Tablas únicas**: `transaccionUnica(tabla, fn)` para abrir/cerrar caja ([03](../03-cash-register/03-cash-register.md)).
- **Factura**: `reservarFactura()` sobre `factura_seq` ([02](../02-pos-catalog/02-pos-catalog.md)).

### 4.4 Borrar (`eliminarMisDatos(tabla, id)`, `adaptadores/salida/firebase-datos.js:161`)

Marca el id en `REG_BORRADOS`, lo quita del caché y envía `_r/<id> = null` + `_x/<id> = timestamp`. En tablas únicas filtra el array y hace `DB.set`.

### 4.5 Recibir cambios

- `_entraRegistro` (`adaptadores/salida/firebase-datos.js:123`): ignora registros sin id, marcados como borrados o idénticos al último recibido; si no, reemplaza o agrega en el array y reordena.
- `_saleRegistro` (`adaptadores/salida/firebase-datos.js:136`): quita el registro del array.
- `_aceptarDeNube` (`adaptadores/salida/firebase-datos.js:241`): para claves completas, acepta lo que llega si es distinto ("la nube manda").
- Tras cualquier cambio real se llama `refrescarSiSePuede()`.

### 4.6 Refresco protegido (`refrescarSiSePuede`, `ui/nucleo/estado.js`)

No redibuja si:
- hay un `input`/`textarea`/`select`/`contentEditable` enfocado (marca `_refrescoPendiente` y pinta al perder el foco, `focusout` + 150 ms);
- se está armando una venta (`ESCRIBIENDO && pageNeg==='ventas'`);
- hay un modal abierto.

### 4.7 Privacidad entre negocios

- `limpiarDatosAjenos(negId)` (`adaptadores/salida/firebase-datos.js:372`) borra de `localStorage` y del caché toda clave `ws_data_*` que no sea del negocio que inicia sesión.
- `sincronizarNegocio` solo se suscribe a las claves de ese negocio.
- **Límite importante**: las tablas globales (`negocios`, `usuarios`, `superadmins`) se descargan completas en todos los equipos, incluidos los hashes de contraseña de todos los usuarios. El aislamiento es de **datos operativos**, no de credenciales ni de configuración de otros negocios. Además no hay reglas de servidor que lo garanticen. Ver [-01-to-review](../-01-to-review/-01-to-review.md#seguridad).

### 4.8 Super-admin

`sincronizarTodo()` (`adaptadores/salida/firebase-datos.js:339`) escucha `value` sobre todo `data/`, guarda cada clave en el caché y `reconstruirDesdeRegistros()` rearma los arrays `data_<neg>_<tabla>` a partir de `_r`/`_x` para que el panel pueda leer arrays.

### 4.9 Actualizar manual (`refrescarDeLaNube`, `ui/nucleo/estado.js`)

Botón "🔄 Actualizar": vuelve a leer con `once('value')` lo que corresponda al usuario (todo, el negocio o solo globales) y redibuja.

## 5. Catálogo de funciones

| Función | Archivo | Alcance | Invocada por | Qué hace |
|---|---|---|---|---|
| `DB.get(k)` | adaptadores/salida/firebase-datos.js:62 | Servicio | Todo el sistema | Lee del caché; si no está, de `localStorage`. |
| `DB.set(k,v)` | adaptadores/salida/firebase-datos.js:68 | Servicio | Tablas globales, únicas, borrados masivos | Guarda en caché + `localStorage` y hace `set` del nodo completo en `data/<k>` (limpiando `undefined`). |
| `claveDe(neg,tabla)` | adaptadores/salida/firebase-datos.js:47 | Servicio | Todo | Devuelve `data_<neg>_<tabla>`. |
| `misDatos(tabla)` | adaptadores/salida/firebase-datos.js:83 | Servicio | Todas las pantallas del negocio | Array de la tabla del negocio activo (`[]` si no hay). |
| `datosDe(neg,tabla)` | adaptadores/salida/firebase-datos.js:84 | Servicio | Super-admin | Igual, para un negocio cualquiera. |
| `esTablaRegistros(t)` | adaptadores/salida/firebase-datos.js:46 | Interna | Capa de datos | `true` si la tabla se sincroniza por registro. |
| `claveReg` / `claveBorr` | adaptadores/salida/firebase-datos.js:48–49 | Interna | Capa de datos | Sufijos `_r` / `_x`. |
| `_limpiar(o)` | adaptadores/salida/firebase-datos.js:50 | Interna | Capa de datos | Clon JSON que elimina `undefined` (Firebase los rechaza). |
| `_campoOrden` / `_ordenar` | adaptadores/salida/firebase-datos.js:53 | Interna | Capa de datos | Orden descendente por el campo de fecha de cada tabla. |
| `_soloLocal(clave,valor)` | adaptadores/salida/firebase-datos.js:80 | Interna | Capa de datos | Guarda en caché y `localStorage` sin subir. |
| `_encolar(updates)` | adaptadores/salida/firebase-datos.js:87 | Interna | Capa de datos | Agrega actualizaciones a `ws_cola_reg`. |
| `subirColaRegistros()` | adaptadores/salida/firebase-datos.js:90 | Interna | `sincronizarNegocio` | Envía la cola pendiente con un `update()`. |
| `_subirRegistros(neg,tabla,lista)` | adaptadores/salida/firebase-datos.js:99 | Interna | `guardarMisDatos` | Calcula y envía solo los campos modificados. |
| `_entraRegistro` / `_saleRegistro` | adaptadores/salida/firebase-datos.js:123 | Interna | Listeners | Aplican altas/cambios/bajas que llegan de la nube. |
| `guardarMisDatos(tabla,arr)` | adaptadores/salida/firebase-datos.js:149 | Servicio | Todos los módulos de negocio | Guardado seguro con fusión por id (ver 4.3). |
| `eliminarMisDatos(tabla,id)` | adaptadores/salida/firebase-datos.js:161 | Servicio | Borrados puntuales | Borrado con marca (ver 4.4). |
| `initFirebase()` | adaptadores/salida/firebase-datos.js:222 | Interna | Arranque | Carga respaldo local y conecta. |
| `mostrarConexion(estado)` | `ui/nucleo/estado.js` | Interna (interfaz) | Gancho `alEstadoConexion` del adaptador | Pinta el punto `#fb-status` (ok/off/err). |
| `_guardarLocal` / `_aceptarDeNube` / `_escucharClave` | adaptadores/salida/firebase-datos.js:81 | Interna | Capa de datos | Recepción de claves completas. |
| `cargarDeLaNube(cb)` | adaptadores/salida/firebase-datos.js:249 | Interna | Arranque | Baja tablas globales y llama `cb`. |
| `escucharGlobales()` | adaptadores/salida/firebase-datos.js:262 | Interna | Arranque | Suscribe las tablas globales (una sola vez). |
| `sincronizarNegocio(negId)` | adaptadores/salida/firebase-datos.js:269 | Servicio | `hacerLogin` | Ver 4.2. |
| `migrarTablaVieja(neg,tabla,datos)` | adaptadores/salida/firebase-datos.js:308 | Interna | `sincronizarNegocio` | Convierte array viejo a registros, deja `_bk` y borra el viejo. |
| `detenerSincNegocio()` | adaptadores/salida/firebase-datos.js:326 | Interna | Login/Logout | Quita los listeners del negocio. |
| `sincronizarTodo()` | adaptadores/salida/firebase-datos.js:339 | Servicio | Login super-admin | Ver 4.8. |
| `reconstruirDesdeRegistros(data)` | adaptadores/salida/firebase-datos.js:354 | Interna | Super-admin | Rearma arrays desde `_r`/`_x`. |
| `detenerSincTodo()` | adaptadores/salida/firebase-datos.js:365 | Interna | Login/Logout | Quita el listener global. |
| `limpiarDatosAjenos(negId)` | adaptadores/salida/firebase-datos.js:372 | Interna | `hacerLogin` | Ver 4.7. |
| `refrescarSiSePuede()` | `ui/nucleo/estado.js` | Servicio | Listeners, temporizador de cocina | Ver 4.6. |
| `refrescarDeLaNube()` | `ui/nucleo/estado.js` | Acción UI | Botón "🔄 Actualizar" | Ver 4.9. |
| `uid()` / `now()` | adaptadores/salida/cripto-navegador.js:12 | Servicio | Todo | Id único (`id`+tiempo base36+aleatorio) / fecha ISO. |
| `seed()` | `ui/nucleo/arranque.js` | Interna | `arrancar` | Migra contraseñas a hash, crea listas vacías de negocios/usuarios si faltan y pone `creado` a negocios viejos. Ya no crea super-admins. |
| `cambiarStock(tabla,id,fn)` | adaptadores/salida/firebase-datos.js:180 | Servicio | Inventario | Cambio de existencias con transacción. |
| `transaccionUnica(tabla,fn)` / `cajaDe(v)` | adaptadores/salida/firebase-datos.js:211 | Servicio | Caja | Escritura con transacción de tablas únicas. |
| `render()` | `ui/nucleo/navegacion.js` | Servicio | Todo | Redibuja la app completa según `STATE` (login / panel super-admin / vista de negocio), aplica el tema y restaura el foco del buscador. |
| `renderContenido()` | `ui/nucleo/navegacion.js` | Servicio | `irA` | Redibuja solo el área central, el título y el ítem activo del menú (sin parpadeo). |
| `irA(pg)` | `ui/nucleo/navegacion.js` | Acción UI | Menú y botones | Cambia `STATE.pageNeg`; al entrar a inventario avisa vencimientos. |
| `prepararTablasMovil(raiz)` | `ui/nucleo/tablas-movil.js` | Interna | `MutationObserver` global | Convierte tablas de ≥4 columnas en tarjetas en celular (agrega `data-label`, oculta columnas secundarias según `TC_OCULTAR`). |
| `arrancar()` | `ui/nucleo/arranque.js` | Interna | IIFE final | `seed()` + `render()` con manejo de error. |

## 6. Estado global (`STATE`, `ui/nucleo/estado.js`)

| Campo | Significado |
|---|---|
| `user` | Usuario en sesión (objeto de `usuarios`, o sintético para super-admin/supervisor). |
| `negocio` | Negocio activo (copia del registro de `negocios`). |
| `esSuperAdmin` | `true` en el panel del dueño del sistema. |
| `modoSupervision` | `true` cuando el super-admin entró a un negocio. |
| `page` | Página del panel super-admin (`''`, `config:<id>`, `usuarios:<id>`, `superadmins`). |
| `pageNeg` | Pantalla dentro del negocio (`inicio`, `ventas`, `pedidos`, …). |
| `sucursal` | Sucursal seleccionada. |
| `editandoVentaId`, `agregandoCuentaId` | Modos especiales de Nueva Venta. |
| `buscaNegocio`, `filtroVendedor`, `_superUser` | Filtros del panel y super-admin original durante la supervisión. |

Variables globales relevantes: `ESCRIBIENDO` (bloquea refrescos mientras se arma una venta), `FB_READY`, `NUBE_LISTA`, `_guardando` (evita doble clic en guardados).

## 7. Reglas

- Ningún registro sin `id` se sincroniza.
- Un registro con marca de borrado nunca se vuelve a subir ni a aceptar.
- Los `undefined` se eliminan antes de enviar a Firebase (si no, Firebase rechaza el objeto entero).
- La fecha de negocio es **local** del equipo (`fechaLocal`), no UTC, para que el día no cambie a las 7 p. m. en Colombia.

## 8. Integración

Todos los módulos usan `misDatos`/`guardarMisDatos`/`eliminarMisDatos` para sus tablas y `DB.get/DB.set` para las globales. El cierre de caja ([03](../03-cash-register/03-cash-register.md)) depende de que `caja_actual` sea tabla única para vaciarse en todos los equipos.

## 9. Limitaciones conocidas

- Datos de todos los negocios y hashes de contraseñas en tablas globales descargadas por todos los equipos.
- No hay reglas de Firebase en el repositorio ni autenticación: cualquiera con la URL de la base puede leer/escribir.
- `auditoria`, `movimientos` y `conteos` conservan todo el historial y crecen con el tiempo (decisión de D3; archivar por mes si hiciera falta).
- Las correcciones de concurrencia (stock, factura, caja) requieren conexión; un equipo sin internet desde el inicio sigue usando su copia local.
- El super-admin escucha todo `data/`: con muchos negocios el volumen descargado crece en cada cambio.

Detalle y propuestas en [-01-to-review](../-01-to-review/-01-to-review.md); correcciones en [-02-corrections](../-02-corrections/-02-corrections.md).
