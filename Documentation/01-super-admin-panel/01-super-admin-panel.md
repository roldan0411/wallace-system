# 01 — Panel de super-admin

> **Cambios del 2026-10-08 (R1):** con cuentas de Firebase el panel ya no descarga toda la base: lee negocios, administradores, usuarios y el resumen de ventas de cada negocio; los datos completos se leen al supervisar o al sacar el informe mensual. Botón "📊 Calcular cifras" para negocios sin resumen. Detalle en [-01-to-review](../-01-to-review/-01-to-review.md).

## 1. Propósito

Panel del dueño del sistema (Wallace Company) y de su equipo. Desde aquí se crean y configuran los negocios clientes, se controla quién está activo (pago), se asignan vendedores, se crean negocios de demostración, se descarga el respaldo y se generan informes mensuales por negocio.

## 2. Alcance

**Incluye**
- Métricas globales: negocios activos, ingreso mensual (suma de planes), suspendidos, usuarios, ventas de hoy e históricas, negocio con más ventas, cartera por vendedor.
- Lista de negocios con búsqueda (nombre, tipo, ciudad, vendedor) y filtro por vendedor.
- Crear, activar/suspender y eliminar negocios.
- Entrar a un negocio en **modo supervisión**.
- Gestión de administradores del sistema (dueño, ayudante, vendedor).
- Negocios demo con datos de ejemplo (18 plantillas).
- Respaldo JSON de toda la base.
- Informe mensual PDF por negocio.
- Panel reducido para el rol **vendedor**.

**No incluye** (documentado en otros módulos)
- Pestañas de configuración de cada negocio → [11-business-settings](../11-business-settings/11-business-settings.md).
- Usuarios de cada negocio → [10-users-roles](../10-users-roles/10-users-roles.md).
- Restauración de respaldos (no existe en la app; ver [-00-execution-protocol](../-00-execution-protocol/-00-execution-protocol.md#6-respaldo-y-restauración)).

## 3. Actores y permisos

Los super-admins viven en la tabla global `superadmins` con un campo `rolSuper`:

| `rolSuper` | Puede | No puede |
|---|---|---|
| `dueno` | Todo: crear/eliminar negocios, gestionar administradores, respaldo, informes | Eliminarse a sí mismo; dejar el sistema sin ningún dueño |
| `ayudante` | Panel completo, crear/configurar/suspender negocios, respaldo, informes | Ver "👥 Administradores", eliminar negocios |
| `vendedor` | Panel de ventas: crear/entrar/pausar/borrar **sus** demos, crear negocios **a prueba** (quedan a su nombre), dar más días a sus pruebas, ver sus clientes reales (solo lectura) | Crear negocios sin prueba, pasar a pago, entrar a negocios reales (`entrarComoNegocio` lo bloquea), borrar demos de otros vendedores |

Las restricciones se aplican en el cliente (se ocultan botones y las funciones validan `rolSuper` al ejecutarse) y, desde el 2026-10-12, **las del vendedor también en las reglas de la base** (sección 12).

## 4. Flujos principales

### 4.1 Crear negocio (`nuevoNegocio`, `ui/super-admin/negocios.js`)
1. Modal: nombre*, tipo (perfil), ciudad, plan (Básico/Profesional/Premium), precio mensual (por defecto 149.900), usuario* del administrador, vendedor a cargo y flujo de cobro (directo / confirmar y luego cobrar). **No pide contraseña** (P1, 2026-10-24): se crea al azar (`Cripto.claveAleatoria(10)`).
2. Valida que el usuario no exista ni en `usuarios` ni en `superadmins`.
3. Copia el perfil del tipo (`PERFILES`, ver [11](../11-business-settings/11-business-settings.md)) al negocio: vocabulario, `usaMesas/usaCocina/usaRecetas/usaCitas`, `tiposEntrega`, `funciones`, `usaCaja`, `esLogistica`.
4. Valores por defecto: `tipoFactura:'pos'`, `pctDatafono:0`, `sonidos:true`, `tema:'claro'`, `sucursales:[]`, `activo:true`.
5. Crea el usuario `rol:'admin'` del negocio. Con cuentas de Firebase, su perfil nace con `debeCambiarPass:true` (`crearCuentaPara(rec, clave, false, {debeCambiarPass:true})`): al primer ingreso elige su propia contraseña.
5b. Al terminar, `mostrarAccesoNegocio` muestra usuario y contraseña **una sola vez** (no se guarda legible en ningún lado), como las demos.
6. **Periodo de prueba** (campos del final del formulario, sección 11): "A prueba" o "Sin prueba (ya paga)", días (30 por defecto) y "Cargar productos de ejemplo". Si queda a prueba, después de guardar llama a `Pruebas.iniciar`. El vendedor no ve "Sin prueba" ni "Vendedor a cargo": el negocio queda a prueba y a su nombre.

### 4.2 Suspender / activar (`toggleNegocio`, `ui/super-admin/negocios.js`)
- **Suspender un cliente** (P3, 2026-10-24): `suspenderNegocio` pide confirmación con **motivo** (Falta de pago · Solicitud del cliente · Otro, con detalle obligatorio en "Otro"; `Dominio.negocio.suspension`). Guarda `activo:false`, `suspendidoDesde` y `motivoSuspension`; la tabla del panel muestra desde cuándo y por qué.
- **Activar**: sin confirmación; borra `suspendidoDesde` y `motivoSuspension`.
- **Demos**: se pausan y activan sin motivo (el vendedor, solo las suyas).

Un negocio suspendido no deja iniciar sesión a sus usuarios ("Este negocio está suspendido. Contacta al proveedor."). Los usuarios ya conectados siguen dentro hasta salir.

### 4.3 Eliminar negocio (`eliminarNegocio`, `ui/super-admin/negocios.js`) — solo `dueno`
Doble confirmación (aviso + escribir el nombre exacto). Borra el registro del negocio, sus usuarios y, para cada tabla de `TABLAS`, las claves `''`, `_r`, `_x`, `_bk` (local y nube), además de cualquier clave `data_<id>_*` presente en el caché. Irreversible.

### 4.4 Supervisar un negocio (`entrarComoNegocio`, `ui/super-admin/negocios.js`)
Guarda el super-admin en `STATE._superUser` (si ya supervisaba otro negocio, conserva el que había) y entra con un usuario sintético `{nombre:'Supervisor: <nombre real>', rol:'admin', esSupervisor:true}` (todos los permisos; P15, 2026-10-24). El banner dice "Supervisando <negocio> como <nombre>" con "← Volver al panel" (`volverSuperAdmin`, `ui/super-admin/negocios.js`), que restaura el usuario original con su `rolSuper`. Un vendedor solo puede supervisar demos.

`rastroSupervision` deja en la **auditoría del negocio** "Entró a supervisar" (después de fijar el negocio activo) y "Salió de supervisar" (al volver o al salir de la sesión), con el nombre y el rol del super-admin.

### 4.5 Demos

Organización (desde el 2026-10-12):

| Pieza | Archivo | Qué hace |
|---|---|---|
| Datos de ejemplo | `src/dominio/ejemplos.js` (`PLANTILLAS`) | Los 18 catálogos de ejemplo: productos `[nombre, precio, categoría, stock]` y clientes. Es un archivo **solo de datos y reglas**, separado de la pantalla; también lo usa el periodo de prueba (sección 11) |
| Armado | `src/dominio/ejemplos.js` (`armarDemo`) | Arma el negocio, su administrador, productos, clientes, caja abierta, ventas de los últimos 10 días y movimientos, **sin guardar**. Recibe el azar y los ids como parámetros: con el mismo azar da los mismos datos (lo usan las pruebas y las capturas) |
| Pantalla | `ui/super-admin/demos.js` | `crearNegocioDemo` (elegir plantilla), `crearVariosDemos` (5 de una vez), `crearDemoDeTipo` (guardar), `mostrarAccesosDemo`, `eliminarDemoVendedor` |

- **Qué crea** `crearDemoDeTipo`:
  - un negocio `esDemo:true` con `demoDe` = id de quien lo creó, ciudad Bucaramanga y plan Premium;
  - un usuario admin `demo`, `demo2`…;
  - productos (marcados `ejemplo:true`) y clientes de la plantilla;
  - una **caja abierta** con base 50.000 (misma forma que `abrirCaja`);
  - ventas pagadas al azar de los últimos 10 días (3–6 diarias entre semana, 5–8 los fines de semana, 1–3 ítems, con predominio de efectivo), con `vendedorId` y `sucursalId`;
  - movimientos de inventario de entrada escalonados.
- **Contraseña propia al azar** (10 caracteres sin letras que se confundan, `Cripto.claveAleatoria`). Se muestra **una sola vez** en una ventana (`mostrarAccesosDemo`) para que el vendedor la anote y se la dé al cliente. Antes todas las demos usaban `demo123`, y cualquiera que lo supiera entraba a cualquier demo.
- **Vencen en 15 días** (`Dominio.prueba.DIAS_DEMO`, campo `pruebaHasta`): después quedan en **solo lectura**, con el mismo mecanismo del periodo de prueba (sección 11). El aviso en el panel para borrarlas llega con la pantalla del periodo de prueba.
- **Se guarda registro por registro** (`Datos.guardarEn`), como el resto de la app. Antes escribía cada tabla entera (formato viejo): con Firebase, la app la convertía después y dejaba copias `_bk` sin uso en la base.
- Los demos **no cuentan** en las métricas reales del panel.
- **Quién**: dueño y ayudante crean y borran cualquiera; un vendedor crea las suyas y solo borra las suyas (`Dominio.prueba.puedeGestionarAlta`).

Plantillas disponibles (`Dominio.ejemplos.PLANTILLAS`; la interfaz las expone como `DEMO_PLANTILLAS`): Restaurante, Tienda / Accesorios, Barbería / Salón, Cafetería, Panadería, Ferretería, Logística / Bodega, Papelería, Droguería / Farmacia, Miscelánea / Variedades, Heladería, Pizzería, Boutique / Ropa, Tecnología / Celulares, Licorera, Fruver / Verdulería, Veterinaria / Mascotas, Floristería. Cada una mapea a un perfil base de `PERFILES` (`tipo`).

### 4.6 Asignar vendedor (`asignarVendedor`, `ui/super-admin/negocios.js`)
Guarda `vendedorId`, `vendedorNombre` y `notasComerciales` en el negocio. Alimenta la tarjeta "Cartera por vendedor" (negocios, activos y facturación mensual por vendedor) y el filtro del listado.

### 4.7 Administradores del sistema (`pantallaSuperAdmins`, `ui/super-admin/administradores.js`) — solo `dueno`
Crear/editar (`editarSuperAdmin`): nombre, usuario, contraseña (mín. 5 caracteres), rol. Usuario único entre `superadmins` y `usuarios`. Siempre debe quedar al menos un dueño. Eliminar (`eliminarSuperAdmin`) con confirmación; no se puede eliminar a uno mismo.

### 4.8 Cambiar mi contraseña (`cambiarMiPassSuper`, `ui/super-admin/administradores.js`)
Pide la actual, la nueva (mín. 5) y su confirmación.

### 4.9 Respaldo (`descargarRespaldo`, `ui/super-admin/panel.js`)
Lee todo `data/` (o el caché local sin nube) y descarga `respaldo-wallace-AAAA-MM-DD.json` con `{sistema:'Wallace System', fecha, datos}`.

### 4.10 Informe mensual del negocio (`reporteMensualNegocio`, `ui/super-admin/reporte-mensual.js` → `imprimirReporteNegocio`, `ui/super-admin/reporte-mensual.js`)
Selector de mes y ventana imprimible (carta) con: ventas del mes (usa `subtotal`, sin domicilio/propina/recargo), reparto por forma de pago respetando pagos divididos, egresos (gastos de caja tomados de los movimientos de los cierres del mes + gastos del negocio no originados en caja) por concepto, utilidad, ticket promedio, top 10 productos por valor, cierres y su resultado, ventas anuladas, usuarios y sucursales. Encabezado con datos del negocio, plan y vendedor.

## 5. Modelo de datos

> Diccionario completo de todas las tablas (formatos, campos nuevos y viejos): [modelo-de-datos](../-03-architecture/modelo-de-datos.md).

### `negocios` (global)
| Campo | Descripción |
|---|---|
| `id`, `nombre`, `tipo`, `ciudad`, `nit`, `tel`, `dir`, `eslogan`, `logo` (data URL PNG) | Identificación |
| `plan`, `precioMes`, `diaPago`, `activo`, `creado` | Comercial y estado |
| `suspendidoDesde` (ISO), `motivoSuspension` | Solo mientras está suspendido (P3). Reservados: solo los escribe el super-admin |
| `vendedorId`, `vendedorNombre`, `notasComerciales` | Comercial |
| `esDemo`, `demoDe` | Demo y su creador |
| `funciones[]` | Ventanas habilitadas (ver [11](../11-business-settings/11-business-settings.md)) |
| Resto de banderas operativas | `flujoPedido`, `tiposEntrega`, `usaMesas`, `usaCocina`, … ver [11](../11-business-settings/11-business-settings.md) |

### `superadmins` (global)
`id`, `nombre`, `usuario`, `passHash` + `passSal` + `passIter` (contraseña con hash), `rolSuper` (`dueno`/`ayudante`/`vendedor`), `creado`. El primer dueño se crea en la pantalla de configuración inicial ([10](../10-users-roles/10-users-roles.md)).

### Lecturas
Ventas pagadas de cada negocio (`data_<id>_ventas` y, por compatibilidad, `data_<id>_ventas-<sucursal>`), usuarios por negocio, cierres y gastos para el informe.

## 6. Catálogo de funciones

| Función | Archivo | Alcance | Quién / permiso | Qué hace |
|---|---|---|---|---|
| `panelSuperAdmin()` | `ui/super-admin/panel.js` | Pantalla | Super-admin | Calcula métricas (excluye demos) y dibuja el panel; si `rolSuper==='vendedor'` dibuja el panel de ventas. |
| `descargarRespaldo()` | `ui/super-admin/panel.js` | Acción UI | Dueño/ayudante | Descarga el JSON completo. |
| `pantallaSuperAdmins()` | `ui/super-admin/administradores.js` | Pantalla | Dueño | Tabla de administradores del sistema. |
| `editarSuperAdmin(id)` | `ui/super-admin/administradores.js` | Acción UI | Dueño (valida) | Crear/editar administrador. |
| `eliminarSuperAdmin(id)` | `ui/super-admin/administradores.js` | Acción UI | Dueño (valida) | Eliminar administrador. |
| `cambiarMiPassSuper()` | `ui/super-admin/administradores.js` | Acción UI | Cualquier super-admin | Cambia su propia contraseña. |
| `nuevoNegocio()` | `ui/super-admin/negocios.js` | Acción UI | Dueño/ayudante (bloquea vendedor) | Crear negocio + admin. |
| `crearNegocioDemo()` | `ui/super-admin/demos.js` | Acción UI | Todos | Modal de plantilla demo. |
| `crearVariosDemos()` | `ui/super-admin/demos.js` | Acción UI | Todos | Crea 5 demos. |
| `crearDemoDeTipo(tipo, cerrar)` | `ui/super-admin/demos.js` | Servicio | Las dos anteriores | Lógica de creación de un demo lleno. Devuelve `true` si lo creó. |
| `asignarVendedor(id)` | `ui/super-admin/negocios.js` | Acción UI | Dueño/ayudante | Vendedor y notas comerciales. |
| `toggleNegocio(id)` | `ui/super-admin/negocios.js` | Acción UI | Todos (vendedor solo ve sus demos) | Activa; un cliente activo pasa a `suspenderNegocio`; las demos se pausan directo. |
| `suspenderNegocio(id)` | `ui/super-admin/negocios.js` | Acción UI | Dueño/ayudante | Suspende con motivo (P3). |
| `mostrarAccesoNegocio(nombre, usuario, clave)` | `ui/super-admin/negocios.js` | Interna | `nuevoNegocio` | Muestra el acceso inicial una vez (P1). |
| `rastroSupervision(negId, accion, superUser)` | `ui/super-admin/negocios.js` | Interna | Supervisión, `logout` | Entrada y salida en la auditoría del negocio (P15). |
| `eliminarNegocio(id)` | `ui/super-admin/negocios.js` | Acción UI | Dueño (valida) | Borrado total del negocio. |
| `eliminarDemoVendedor(id)` | `ui/super-admin/demos.js` | Acción UI | Vendedor/admins | Borra un demo. |
| `entrarComoNegocio(id)` | `ui/super-admin/negocios.js` | Acción UI | Todos (vendedor solo demos) | Modo supervisión. |
| `volverSuperAdmin()` | `ui/super-admin/negocios.js` | Acción UI | Supervisor | Regresa al panel. |
| `configNegocio(id)` / `usuariosNegocio(id)` | 5533–5537 | Acción UI | Dueño/ayudante | Navegan a configuración / usuarios del negocio. |
| `reporteMensualNegocio(id)` | `ui/super-admin/reporte-mensual.js` | Acción UI | Dueño/ayudante | Selector de mes del informe. |
| `imprimirReporteNegocio(id, mes)` | `ui/super-admin/reporte-mensual.js` | Interna | `reporteMensualNegocio` | Arma e imprime el informe. |

## 7. Reglas de negocio

- Usuario único global: no puede repetirse entre empleados y super-admins.
- Los negocios demo no suman a ingresos, ventas ni usuarios del panel.
- "Ventas hoy (todos)" usa la jornada de la venta (`v.jornada` o fecha local).
- "Facturado desde que entró" (pestaña comercial) = `precioMes × max(1, ceil(días/30))`, estimado, no lleva registro real de pagos.

## 8. Integración

- Crea negocios a partir de `PERFILES` ([11](../11-business-settings/11-business-settings.md)).
- Supervisión usa la vista normal del negocio con permisos completos ([10](../10-users-roles/10-users-roles.md)).
- Lee datos de ventas, cierres y gastos ([02](../02-pos-catalog/02-pos-catalog.md), [03](../03-cash-register/03-cash-register.md), [09](../09-expenses-accounting/09-expenses-accounting.md)).
- Sincroniza todo con `sincronizarTodo` ([13](../13-multitenant-isolation/13-multitenant-isolation.md)).

## 9. Interfaz

Clases de `index.html`: `.topbar`, `.sa-emblema`, `.sa-marca`, `.stats/.stat` (variantes `gold`, `verde`, `azul`, `naranja`, `rojo`), `.tarjeta`, `.tabla`/`.tabla-cards`, `.pill-*`, `.banner-sup` (banner de supervisión). El panel no usa el tema del negocio (`quitarTema`).

## 10. Limitaciones conocidas

- ~~No existe control de pagos real~~: cobro mensual (P6, sección 16). La suspensión sigue siendo manual, por decisión.
- ~~Lo que hace un super-admin sobre un negocio no dejaba rastro~~: historial del sistema (P2, sección 14).
- ~~Las listas de planes difieren (Premium / Empresarial)~~: hoy son Básico, Profesional y Premium en todas partes; un `Empresarial` viejo se lee como Premium (`planDe`).
- ~~`toggleNegocio` no validaba rol~~: corregido; un vendedor solo pausa sus demos y las funciones de gestión validan `esAdminSistema()` ([-02](../-02-corrections/-02-corrections.md)).
- ~~No hay restauración de respaldo desde la app~~: existe, sección 13.
- ~~Todos los negocios nuevos nacían con la clave `admin123`~~: clave al azar mostrada una vez (P1, 2026-10-24).

Ver [-01-to-review](../-01-to-review/-01-to-review.md). Revisión para reestructurar el panel (flujos incompletos y UI/UX, sin implementar): [revision-panel](revision-panel.md).

## 11. Periodo de prueba (2026-10-12)

Un negocio **real** que el cliente usa con sus datos por un tiempo limitado. Al vencer queda en **solo lectura** hasta que pague (pasa a pago) o le den más días. Es distinto de la demo (sección 4.5), que tiene datos inventados para mostrar.

**Decisiones (2026-10-12)**:
- 30 días por defecto, cambiables por negocio (1 a 365);
- al vencer, solo lectura;
- lo crean el dueño, el ayudante y los vendedores (estos, solo las suyas);
- quien la crea elige si empieza con productos de ejemplo de su tipo, que se pueden borrar después con un botón.

| Pieza | Archivo | Qué hace |
|---|---|---|
| Reglas | `src/dominio/prueba.js` | `nuevaPrueba`, `estadoPrueba` (días restantes, vencida, demo o prueba), `extenderPrueba`, `camposConvertirAPago`, `soloLectura`, `puedeGestionarAlta`, `puedeBorrarEjemplos`, `porVencer`. Constantes: `DIAS_PRUEBA` = 30, `DIAS_DEMO` = 15, `MAX_DIAS` = 365 |
| Casos de uso | `src/aplicacion/servicios/pruebas.js` (en la interfaz: `Pruebas`) | `iniciar(negId, {dias, conEjemplos})`, `extender(negId, dias)`, `convertirAPago(negId)`, `borrarEjemplos(negId)`, `estado(negId)`, `porVencer(dias)`. Devuelven `{ok:true, …}` o `{ok:false, motivo}` (`permiso`, `no_existe`, `dias`, `es_demo`, `no_es_prueba`) |
| Bloqueo | `database.rules.json` | Con `pruebaHasta` vencido (hora del servidor, `now`), nadie del negocio escribe sus tablas ni los datos del negocio. **Leer sí**. El super-admin sí puede (para extender o pasar a pago) |
| Datos | `negocios_r/<id>` | `pruebaDesde`, `pruebaHasta` (milisegundos). **Campos reservados**: están en `CAMPOS_NEGOCIO_RESERVADOS` y en las reglas, y una prueba exige que las dos listas coincidan |

**Pantalla** (`ui/super-admin/pruebas.js`):

| Dónde | Qué se ve | Función |
|---|---|---|
| Crear negocio (panel; el vendedor tiene "Negocio a prueba") | "Periodo de prueba", días, "Cargar productos de ejemplo" | `camposPruebaHTML`, `leerCamposPrueba`, `iniciarPruebaDe` |
| Lista de negocios del panel y del vendedor | Pastilla "PRUEBA · N días" (roja si quedan 3 o menos) o "VENCIDA"; en demos, "N días" | `pillPrueba` |
| Arriba del panel (dueño, ayudante y vendedor) | Tarjeta "⏳ Pruebas y demos por vencer" (próximos 7 días o vencidas) con "+ Días", "Pasar a pago" (no el vendedor) y 🗑️ para demos | `tarjetaPorVencer`, `darMasDias`, `pasarAPago`, `borrarDemoVencida` |
| Dentro del negocio, bajo la barra de supervisión | "⏳ Periodo de prueba: te quedan N días (hasta …)"; vencida: "🔒 … solo lectura" | `bannerPrueba` (en `nucleo/navegacion.js`) |
| Inventario del negocio | "Tienes N productos de ejemplo" + "Borrar ejemplos y empezar con los míos" (quien tenga permiso `eliminar`) | `avisoEjemplos`, `borrarEjemplos` (con auditoría) |

Las demos usan lo mismo: vencen a los 15 días, muestran el aviso y aparecen en "por vencer" para darles más días o borrarlas.

**Solo lectura** (D10, 2026-10-12): la app lo **aplica**, no solo lo avisa. Con la prueba o la demo vencida, la gente del negocio:
- no ve los botones que escriben (`tienePermiso` devuelve `false` salvo imprimir);
- recibe "solo lectura" en cualquier acción que guarda (`exigirEscritura`);
- y el adaptador de datos no escribe nada de ese negocio (gancho `soloLectura`), ni en la nube ni en el equipo.

El super-admin y la supervisión sí escriben. Con Firebase, las reglas cerradas lo bloquean además en el servidor, y si la base rechaza algo, la app lo avisa (`alEscrituraNegada`).

**Límites**:
- **Con las reglas de transición no hay bloqueo**: durante la migración de cuentas, `data` está abierto. El bloqueo funciona con las reglas finales.
- **El cliente no puede registrarse solo**: crear negocios y cuentas exige ser super-admin (Plan B, sin servidor). El autoregistro necesitaría Cloud Functions (plan Blaze).
- **Que un vendedor vea solo lo suyo lo controla hoy la app** (`puedeGestionarAlta`), no las reglas: el super-admin vendedor todavía puede leer todo `data` (decisión pendiente, -01).

**Pruebas**:
- `tests/dominio/prueba.test.mjs` (reglas, datos de ejemplo y las dos listas de campos reservados);
- `tests/aplicacion/pruebas.test.mjs` (casos de uso con un doble del puerto);
- `tests/reglas/reglas.test.mjs` (vigente escribe; vencida solo lee; los campos de prueba solo el super-admin; el super-admin la reactiva);
- `tests/navegador/recorrido.test.mjs` → "periodo de prueba": crea un negocio a prueba con ejemplos desde el formulario, pastilla en el panel, aviso de días, borrar ejemplos, más días, vencida (tarjeta y aviso de solo lectura) y pasar a pago.

## 12. Super-admin vendedor: solo sus negocios (2026-10-12)

**Decisión**: el vendedor ve y toca **solo sus negocios**: los que tienen `vendedorId` = su id (sus clientes y negocios a prueba) y sus demos (`demoDe` = su id). Antes las reglas le dejaban leer y escribir todo `data`, `perfiles` y `login`, como al dueño; la app solo escondía botones.

**Reglas** (`database.rules.json`; en las de **transición** `data` sigue abierto, como el bloqueo de pruebas vencidas):

| Qué | Dueño y ayudante | Vendedor |
|---|---|---|
| `data` completo, tablas globales (`superadmins`, `usuarios`…), `perfiles` y `login` completos | Leen y escriben | Nada |
| Lista de negocios | `data/negocios_r` entero | Solo con la consulta `orderByChild('vendedorId' o 'demoDe').equalTo(<su id>)` (índices `.indexOn`) |
| Un negocio `negocios_r/<id>` | Todo | Leer y escribir si es suyo. Crear: a su nombre y **con vencimiento** (`pruebaHasta`, máx. 1 año); no puede quitar la prueba (pasar a pago), cambiar el vendedor ni volverlo demo o real. Borrar: sus demos, o un negocio suyo creado hace menos de 1 hora (deshacer un alta que falló) |
| Tablas del negocio `data_<id>_*` | Todas | Solo las de su **negocio activo** (`perfiles/<su uid>/negocioActivo`), y solo si ese negocio es suyo. Lo fija él mismo antes de escribir (`Cuentas.fijarNegocioActivo`); un negocio a la vez |
| Cuentas (`perfiles/<uid>` + `login/<usuario>`) | Todas | Crear y borrar las de la gente de sus negocios; nunca super-admins, su propio perfil (salvo `negocioActivo`) ni entradas de `login` que ya existan |

Sin `rolSuper` en el perfil se trata como dueño (perfiles anteriores). El rango sale de `perfiles/<uid>/rolSuper`, que solo escriben el dueño y el ayudante.

**En la app**:
- `Datos.configurarSesion({…, vendedor:<su id>})`: el panel escucha las dos consultas en vez de todo (`escucharNegociosVendedor`, `firebase-datos.js`); no carga usuarios, resúmenes ni `superadmins`, ni hace la migración de tablas o contraseñas viejas.
- `trabajarEn(negId)` (`ui/usuarios/cuentas.js`) fija el negocio activo antes de escribir: al entrar a una demo, al crear una demo o un negocio a prueba (con sus ejemplos) y al borrar una demo. Para el dueño y el ayudante no hace nada.
- Orden de las altas: **primero el negocio**, después la cuenta de su administrador (las reglas piden que el negocio exista y sea suyo). Si la cuenta falla, el negocio se borra.
- Bajas de demos: primero sus datos y cuentas, **al final** el negocio.
- Demos del vendedor: usuario `demo-xxxxx` al azar (no ve los usuarios de los demás para elegir uno libre).
- Sigue sin poder entrar a los negocios **reales** de sus clientes (`entrarComoNegocio`), aunque las reglas se lo permitirían fijándolos como negocio activo.

**Pruebas**: `tests/reglas/reglas.test.mjs` (5 casos del vendedor: lectura, negocio activo, altas con vencimiento, bajas, cuentas) y `tests/navegador/s1-navegador.test.mjs` → "vendedor con reglas cerradas" (panel solo con lo suyo, negocio a prueba con ejemplos y su administrador, entrar y borrar su demo, **ninguna operación negada**).

**Para el sandbox**: `npm run reglas:cerradas` publica las reglas nuevas. Los perfiles de vendedor ya tienen `rolSuper:'vendedor'` (`perfilDesdeSuperAdmin`).

## 13. Respaldo y restauración (2026-10-12)

- **Respaldo** (`descargarRespaldo`): si no se puede leer la base, pregunta y baja un archivo `respaldo-wallace-PARCIAL-<fecha>.json` (con `parcial:true`): con cuentas, el panel casi no tiene datos de los negocios. Antes bajaba esa copia con el nombre de un respaldo completo.
- **Restaurar un negocio** ("♻️ Restaurar", **solo el dueño del sistema**): se elige el archivo, el negocio y se confirma escribiendo su nombre. `Datos.restaurarNegocio(negId, datos)` (puerto + adaptador) reemplaza su registro (`negocios_r/<id>`) y **todas** sus tablas por las del respaldo (lo que no esté, se borra), en una sola escritura; lo que las reglas rechazarían (logo, ids: S8) se limpia antes. Las cuentas de acceso (`perfiles`, `login`) no se tocan. Sirve con respaldos de la nube y con los parciales (formato del equipo).
- Pruebas: integración contra el emulador (vuelve todo como estaba, limpia lo inválido, rechaza un negocio que no está) y recorrido en modo local.

## 14. Historial del sistema (P2, 2026-10-24)

Lo que hace cada super-admin sobre negocios y cuentas queda en `auditoria_sistema` ([modelo de datos](../-03-architecture/modelo-de-datos.md), 3.6). Decisiones del usuario: lo ve **solo el dueño**, se anota **todo lo de negocios y cuentas** con antes y después, y se ve en el botón **"🕘 Historial"** del panel.

- **Anotar**: `anotarEnSistema(accion, negocio, antes, despues, detalle)` (`ui/super-admin/historial-sistema.js`) arma la entrada con `Dominio.sistema.entrada` (quién es el super-admin, aunque esté supervisando) y la guarda con `Datos.registrarSistema` (puerto + adaptador; la fecha la pone el servidor). Si no se guarda, `reportarError`.
- **Qué se anota** (`Dominio.sistema.ACCION`): crear, configurar (solo si algo cambió), aplicar el plan, suspender/activar/pausar, eliminar, vendedor, sucursales, prueba (iniciar, más días, pasar a pago), demos, entrar/salir de supervisión, usuarios del negocio (crear, editar, desactivar, eliminar), administradores, contraseña temporal, descartar solicitud, mi contraseña, mi correo (se anota **antes** de mover el perfil), migrar o borrar cuentas, respaldo y restaurar.
- **Pantalla** (`pantallaHistorialSistema`, `STATE.page='historial'`): las últimas 500 (`Datos.leerHistorialSistema`), la más nueva primero, con filtros por negocio, persona, acción y texto (`Dominio.sistema.filtrar`) y los cambios "campo: antes → después". El ayudante no ve el botón y, si entra a la página, ve el candado.
- **Pruebas**: dominio (`tests/dominio/sistema.test.mjs`), reglas cerradas y de transición (a su nombre, fecha del servidor, sin editar ni borrar, solo el dueño lee) y recorrido ("panel, etapa 2").
- **Falta**: mostrarlo en la ficha de cada negocio cuando exista (U3).

## 15. Panel rediseñado: menús, pestañas y ficha del negocio (etapa 3, 2026-10-24)

Decisiones del usuario: **ficha con secciones** al tocar un negocio y **una fila de 4 cifras**. El panel del vendedor no cambia (U12, pendiente).

- **Barra superior (U1)**: estado de conexión, hora y dos menús `<details class="menu-sa">` (sin JavaScript, se cierran al volver a dibujar):
  - **⚙ Sistema**: Descargar respaldo, Restaurar un negocio (dueño), Calcular cifras (con un punto rojo con el número de negocios sin cifras), Administradores y Historial (dueño), 🔐 Cuentas (con Firebase).
  - **👤 <nombre>**: el rol, Mi contraseña, Mi correo (con Firebase) y Salir.
- **Cifras (U4)**: Clientes activos (de cuántos y cuántos a prueba), Ingreso del mes (suma de planes activos, como antes), Ventas de hoy (sin demos) y **Por atender** (pruebas o demos por vencer + solicitudes de contraseña; `cuantasPorVencer`, `cuantasRecuperaciones`). Se quitaron Suspendidos, Usuarios totales, Ventas históricas y Negocio con más ventas.
- **Pestañas (U2)**: Clientes · A prueba · Demos · Suspendidos, cada una con su número (`Dominio.negocio.grupoPanel` / `contarPorGrupo`: una demo pausada sigue en Demos; un suspendido a prueba va a Suspendidos). Por defecto Clientes; se recuerda en `STATE.tabNegocios` (`verTabNegocios`). Al crear un negocio o una demo, el panel salta a su pestaña. Cada pestaña vacía explica qué hacer.
- **Fila de la tabla (U3)**: el nombre abre la ficha; acciones **Entrar** y **⋯** (Abrir ficha, Configurar, Usuarios, Informe mensual, Vendedor, Suspender/Pausar/Activar y, para el dueño, Eliminar en rojo al final). El ⋯ se abre dentro de la celda (la tabla corta lo que sobresale). Columnas: Negocio, Tipo, Vendedor, Plan, Precio/mes, Estado, Acciones.
- **Ficha del negocio** (`ui/super-admin/ficha-negocio.js`, `STATE.page='negocio:<id>'`): cabecera común `cabeceraFicha` (nombre, DEMO, estado, días de prueba, "← Volver al panel") y secciones **Resumen · Configurar · Usuarios · Historial**:
  - **Resumen**: ventas de hoy y del mes (del resumen que publica cada negocio, R1), actividad ("Vendió hoy", "Última venta hace N días", `Dominio.ventas.ultimoDiaConVentas`), usuarios, plan y cuenta, aviso de suspensión con motivo, y acciones (Entrar, Informe, Vendedor, + Días y Pasar a pago si está a prueba, Suspender/Activar; Eliminar solo el dueño, separado).
  - **Configurar** y **Usuarios**: las pantallas de siempre con la cabecera de la ficha.
  - **Historial** (`historialneg:<id>`, solo el dueño): las entradas del historial del sistema de ese negocio (`tablaHistorial`, compartida con la pantalla general).
  - Eliminar desde la ficha vuelve al panel.
- **Pruebas**: dominio (pestañas y actividad) y recorrido ("panel, etapa 3"; además la ficha y su historial se dibujan para los 18 negocios). Capturas nuevas al final: `panel-demos`, `panel-menus`, `panel-menu-negocio`, `ficha-negocio` (y móvil).
- **Pendiente de la revisión**: U5 (bandeja única "Por atender"), U6 (filtros y orden), U7 (fechas legibles), U8–U11, U12 (panel del vendedor), U13–U14.

## 16. Cobro mensual a los clientes (etapa 4, P6 y P7, 2026-10-26)

Decisiones del usuario: cada pago guarda **mes, valor y medio**; **5 días de gracia**; en mora el sistema **avisa y sugiere suspender** (no suspende solo); registran pagos **el dueño y el ayudante**.

- **Reglas puras** (`src/dominio/cobros.js`): cada mes vence el **día de pago** (`diaPago`; el 31 en un mes corto es su último día). Estados de `estadoPago(neg, hoy)`:
  - `no_aplica`: demos, pruebas y negocios sin precio;
  - `sin_iniciar`: negocios de antes del control, que empieza con el primer pago que se registre;
  - `al_dia`: el próximo mes aún no vence;
  - `por_pagar`: venció hace 5 días o menos (`DIAS_GRACIA`);
  - `en_mora`: los días se cuentan desde el vencimiento del mes más viejo sin pagar, y se dice cuántos meses debe.
- **Campos del negocio** (reservados en el dominio y en `database.rules.json`): `cobroDesde` (primer mes que se cobra) y `pagadoHasta` (último mes pagado **sin huecos**: pagar noviembre no tapa la deuda de octubre). Al crear un negocio sin prueba y al pasar una prueba a pago (`inicioDeCobro`) se fija el día de pago (el de ese día, máximo 28; o el que ya tenía) y el primer mes: paga al empezar.
- **Pagos**: `data/pagos/<negId>/<id>` `{id, negocioId, mes, valor, medio, fecha, registrado, quien, nota?, anulado?, anuladoEn?, anuladoPor?}`. Los leen y escriben solo el dueño y el ayudante (la gente del negocio y el vendedor no). Las reglas validan id, negocio, mes, valor > 0 y medio. Puerto + adaptador: `guardarPago` y `leerPagos` (bajo demanda; el panel usa solo los campos del negocio).
- **Interfaz** (`ui/super-admin/cobros.js`):
  - **"💰 Cobros del mes"**: tarjeta del panel con los clientes en mora, por pagar o sin pagos, y los botones "Registrar pago" y (en mora) "Suspender".
  - La mora suma en **"Por atender"** (desde la etapa 5, la cifra cuenta todo lo de la bandeja: también "por pagar" y "sin pagos registrados").
  - El estado de pago aparece en la tabla (también en "Tus clientes" del vendedor, que lo ve pero no registra).
  - **Ficha → Cobros**: estado, día de pago, desde cuándo se cobra, pagado hasta, **total pagado de verdad** (P7) y la lista de pagos con "Anular". Un pago anulado se queda en la lista marcado y ese mes vuelve a deberse.
  - "Registrar pago" sugiere el primer mes que falta y el precio del plan.
- **Historial**: "Registró un pago" y "Anuló un pago", con el antes y el después de `pagadoHasta`.
- **P7**: en Configurar → Plan y vendedor, "Facturado desde que entró" queda marcado como estimado; lo pagado de verdad está en la ficha → Cobros.
- **Pruebas**: dominio (`tests/dominio/cobros.test.mjs`), reglas (quién lee y escribe, validación, campos reservados) y recorrido ("panel, etapa 4": alta → por pagar → registrar → al día → anular → mora en "Por atender" → pasar a pago inicia el cobro).

## 17. Lo que quedaba del panel (etapa 5, 2026-10-26)

Decisiones del usuario: archivar **30 días** antes de poder borrar; el vendedor puede **"Avisar que ya pagó"**; en el alta se piden **teléfono del negocio, nombre y teléfono del dueño, y día de pago**. Los **precios sugeridos por plan** los dirá el usuario: mientras tanto `Dominio.negocio.PRECIO_SUGERIDO` tiene 149.900 en los tres (como antes).

- **Bandeja "Por atender" (U5)**: avisos de pago de los vendedores, solicitudes de contraseña, pruebas por vencer y cobros del mes quedan en UNA tarjeta (`bandejaPorAtender`); cada parte conserva sus botones. Sin pendientes: "✓ Todo al día".
- **Filtros y orden (U6)**: además de buscar y vendedor, **plan** y **ciudad**; orden por nombre, más recientes, mayor precio o "los que más deben" (`Dominio.negocio.ordenarPanel`, `gravedadCobro`). Se recuerdan durante la sesión; al salir se limpian.
- **Fechas legibles (U7)**: en la ficha, "8 oct 2026 · hace 18 días" (`Dominio.fechas.haceTexto`) para "Cliente desde" y la suspensión.
- **Archivar antes de eliminar (P4)**: "Eliminar" un cliente lo **archiva** (`archivado`, `archivadoDesde`, reservados): queda suspendido y en la pestaña **Archivados**; "♻ Sacar del archivo" lo devuelve activo. Pasados `DIAS_ARCHIVO` (30) días se puede **eliminar definitivamente**: antes se baja su **respaldo** (`Datos.exportarNegocio` + `bajarArchivoRespaldo`, el mismo formato que "Restaurar un negocio"); si el respaldo falla, no se borra nada. Las demos se borran directo. Los archivados no cuentan en las cifras.
- **Avisos de pago del vendedor (P17)**: en "Tus clientes" el vendedor ve el estado de pago y "Avisar que pagó" (mes, valor, medio, fecha, nota). El aviso va a `avisos_pago/<id>` (raíz): el vendedor solo crea avisos **pendientes**, a su nombre y de **sus** clientes; el dueño y el ayudante los ven en la bandeja y los **confirman** (queda el pago, con la nota "Aviso de …") o **rechazan**. Se escuchan en vivo (`Datos.escucharAvisosPago`), también en modo local. Historial: "Avisó que su cliente pagó", "Rechazó un aviso de pago".
- **Crear negocio en 3 pasos (P5/U9)**: la misma ventana con secciones **1 · El negocio** (nombre, tipo, ciudad, teléfono, cómo cobra), **2 · El dueño y su acceso** (nombre, teléfono, usuario; el administrador lleva el nombre del dueño) y **3 · Plan, cobro y prueba** (al elegir el plan se pone su precio sugerido, `sugerirPrecioPlan`; día de pago 1–28 o vacío). Al terminar, además de la clave: "⚙ Configurar ahora" y "Entrar al negocio" (`despuesDelAlta`). La ficha muestra el dueño y el teléfono. `abrirModal` admite `tipo:'seccion'` (título) y `cambio` en los select.
- **Pruebas**: dominio (archivo, orden, ciudad, fechas, precio y día de pago, avisos), reglas (avisos de pago; campos reservados) y recorrido ("panel, etapa 5" ×2 y el borrado de la etapa 3, ahora con archivo y respaldo).
