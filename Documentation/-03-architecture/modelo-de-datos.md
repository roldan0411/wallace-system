# Modelo de datos (diccionario completo)

Todas las tablas de Wallace System con sus campos, en un solo lugar: cómo se guardan en Firebase, qué significa cada campo, quién lo escribe y qué cambió respecto a lo que hay hoy en producción. Los documentos de cada módulo explican el **comportamiento**; este explica los **datos**.

> **Cómo se armó (2026-10-10)**: Realtime Database no tiene esquema, así que no hay un archivo que declare los campos: son los que pone el código al guardar. Este diccionario sale de tres fuentes:
> 1. la estructura real de la versión actual (recorrido completo con los 18 demos, venta, anulación, cierre, sucursales, citas, ajuste de stock);
> 2. la estructura del export de producción del 07/10, **solo nombres de campos y conteos, sin valores**;
> 3. el código que crea cada registro.
>
> Al agregar o renombrar un campo, actualizar este documento y el del módulo.

## 1. Cómo se guarda

### 1.1 El árbol de Firebase

```
/ (raíz)
├── login/<claveUsuario>       índice usuario → cuenta (S1)             { correo, uid }
├── perfiles/<uid>             negocio, rol y permisos de cada cuenta  { usuario, rol, negocioId, … }
├── auditoria_sistema/<id>     historial del sistema (P2): qué hizo cada super-admin   (ver 3.6)
└── data/
    ├── pagos/<negId>/<id>                 pagos mensuales de cada cliente (P6, ver 3.7)
    ├── negocios_r/<negId>                 un negocio por nodo (S1)
    ├── superadmins                        lista de administradores del sistema
    ├── usuarios                           tabla VIEJA de usuarios (con contraseñas) — solo para migrar
    ├── migracion_s1                       marca de la migración de tablas globales
    └── data_<negId>_<tabla>[_r | _x | _bk]   las tablas de cada negocio
```

- **`<negId>`**: id del negocio (p. ej. `n1`, `N1`). Ningún id lleva `_`, porque el `_` separa el negocio de la tabla.
- **`<claveUsuario>`**: el nombre de usuario codificado (`encodeURIComponent` y `.` → `%2E`), porque Firebase no admite `. $ # [ ] /` en las claves. Respeta mayúsculas.
- En **modo local** (sin nube) todo vive en el `localStorage` del navegador, con el prefijo `ws_`: `ws_negocios`, `ws_data_n1_ventas`… Está en `src/adaptadores/salida/almacen-local.js`.
- Las listas de tablas están en `src/adaptadores/salida/firebase-datos.js`: `TABLAS`, `TABLAS_UNICAS` y `TABLAS_GLOBALES`.

### 1.2 Los formatos de una tabla (sufijos)

Una misma tabla puede aparecer con varios sufijos. En el navegador la app siempre la ve como **un arreglo completo** (`misDatos('ventas')`); el adaptador la arma y la reparte.

| Clave | Qué es | Quién la escribe |
|---|---|---|
| `data_<neg>_<tabla>_r/<id>` | **Formato actual**: un nodo por registro. Solo se suben los campos que cambiaron. | El adaptador de datos, en cada guardado |
| `data_<neg>_<tabla>_x/<id>` | **Marca de borrado**: evita que un registro borrado "reviva" desde otro equipo que todavía lo tenía. | El adaptador, al borrar |
| `data_<neg>_<tabla>` (sin sufijo) | **Formato viejo**: la tabla entera como un arreglo. La primera vez que un equipo con la versión nueva lee una tabla así, la pasa a `_r` y borra esta clave. | La versión original; el adaptador la retira |
| `data_<neg>_<tabla>_bk` | **Respaldo** del formato viejo, guardado al convertirlo a `_r` por si hiciera falta volver. | El adaptador, una vez. Se puede borrar cuando todo funcione (con respaldo general antes) |
| `data_<neg>_<tabla>` en las **tablas únicas** | Un solo valor guardado entero (no por registro): `caja_actual`, `config`, `factura_seq`, `conceptos_gasto`, `resumen`. | El adaptador; los cambios simultáneos van con **transacciones** |

En el export de producción conviven los cuatro formatos (p. ej. `ventas`, `ventas_r`, `ventas_bk`, `ventas_x`): la tabla quedó a medio convertir por equipos con versiones distintas. Antes del cambio por registro había además tablas de ventas por sucursal (`data_<neg>_ventas-<sucursal>`), que el panel todavía lee por compatibilidad.

### 1.3 Convenciones de los campos

| Tipo de valor | Formato |
|---|---|
| `id` | Texto aleatorio que genera la app (`Cripto.nuevoId`). Nunca se reutiliza. |
| Momento (`fecha`, `creado`, `cobrado`, `apertura`, `cierre`, `anulada`…) | Texto ISO completo con hora (`2026-10-08T15:30:00.000Z`). |
| Día contable (`jornada`) | `AAAA-MM-DD` en hora local (`dominio/fechas.js`, nunca `toISOString().slice(0,10)`, F2). |
| Dinero | Número en pesos, sin decimales en la práctica. |
| Personas en registros viejos | Por **nombre** (`vendedor`, `cajero`, `por`). Los nuevos llevan además el **id** (`vendedorId`, `domiciliarioId`) para agrupar bien (F15). |
| Booleanos ausentes | Se leen como `false` (o como "sí" cuando el campo es negativo, p. ej. `activo!==false`). |

## 2. Índice de tablas

| Tabla | Alcance | Formato | Qué guarda | Módulo |
|---|---|---|---|---|
| [`negocios`](#31-negocios) | Global | `negocios_r/<id>` | Cada negocio: datos, plan, funciones y configuración | [01](../01-super-admin-panel/01-super-admin-panel.md), [11](../11-business-settings/11-business-settings.md) |
| [`superadmins`](#32-superadmins) | Global | Lista | Administradores del sistema | [01](../01-super-admin-panel/01-super-admin-panel.md) |
| [`usuarios`](#33-usuarios-y-usuarios_r) | Por negocio (`usuarios_r`) + global vieja | Por registro | Empleados de cada negocio | [10](../10-users-roles/10-users-roles.md) |
| [`login`, `perfiles`](#34-login-y-perfiles-s1) | Raíz | Por clave / uid | Cuentas de Firebase Authentication (S1) | [-02 → S1](../-02-corrections/-02-corrections.md) |
| [`migracion_s1`](#35-migracion_s1) | Global | Valor | Marca de la migración | [-02 → S1](../-02-corrections/-02-corrections.md) |
| [`ventas`](#41-ventas) | Negocio | Por registro | Ventas, pedidos y cuentas abiertas | [02](../02-pos-catalog/02-pos-catalog.md), [04](../04-kitchen-kds/04-kitchen-kds.md), [07](../07-customers-delivery/07-customers-delivery.md) |
| [`productos`](#42-productos) | Negocio | Por registro | Catálogo, stock, lotes, recetas y combos | [02](../02-pos-catalog/02-pos-catalog.md), [06](../06-inventory-recipes/06-inventory-recipes.md) |
| [`insumos`](#43-insumos) | Negocio | Por registro | Materias primas de las recetas | [06](../06-inventory-recipes/06-inventory-recipes.md) |
| [`movimientos`](#44-movimientos) | Negocio | Por registro | Historial de entradas, salidas y ajustes de inventario | [06](../06-inventory-recipes/06-inventory-recipes.md) |
| [`conteos`](#45-conteos) | Negocio | Por registro | Conteos físicos de inventario | [06](../06-inventory-recipes/06-inventory-recipes.md) |
| [`caja_actual`](#46-caja_actual) | Negocio | **Única** | Caja(s) abierta(s) ahora | [03](../03-cash-register/03-cash-register.md) |
| [`cierres`](#47-cierres) | Negocio | Por registro | Cajas cerradas con su cuadre | [03](../03-cash-register/03-cash-register.md) |
| [`config`](#48-config) | Negocio | **Única** | Base del día siguiente y retiros con la caja cerrada | [03](../03-cash-register/03-cash-register.md) |
| [`factura_seq`](#49-factura_seq) | Negocio | **Única** | Último número de factura reservado | [02](../02-pos-catalog/02-pos-catalog.md) |
| [`clientes`](#410-clientes) | Negocio | Por registro | Clientes (se crean solos al vender) | [07](../07-customers-delivery/07-customers-delivery.md) |
| [`domiciliarios`](#411-domiciliarios) | Negocio | Por registro | Repartidores | [07](../07-customers-delivery/07-customers-delivery.md) |
| [`citas`](#412-citas) | Negocio | Por registro | Agenda y productos apartados | [05](../05-appointments-shifts/05-appointments-shifts.md) |
| [`gastos_negocio`](#413-gastos_negocio) | Negocio | Por registro | Gastos del negocio y de caja | [09](../09-expenses-accounting/09-expenses-accounting.md) |
| [`conceptos_gasto`](#414-conceptos_gasto) | Negocio | **Única** | Nombres de conceptos de gasto | [09](../09-expenses-accounting/09-expenses-accounting.md) |
| [`auditoria`](#415-auditoria) | Negocio | Por registro | Quién hizo qué y cuándo | [10](../10-users-roles/10-users-roles.md) |
| [`resumen`](#416-resumen) | Negocio | **Única** | Cifras de ventas para el panel (R1) | [08](../08-sales-reports/08-sales-reports.md) |

Quién puede leer y escribir cada una: `database.rules.json` (reglas finales) y [-02 → B.4](../-02-corrections/-02-corrections.md).

## 3. Tablas globales

### 3.1 `negocios`
Antes era un arreglo en `data/negocios`. Con S1 cada negocio vive en `data/negocios_r/<id>`: cada empleado lee solo el suyo, y se escribe **por campo**, nunca el registro entero desde un empleado. El arreglo viejo queda en `negocios_bk`.

| Campo | Tipo | Descripción |
|---|---|---|
| `id` 🔒 | texto | Identificador (sin `_`) |
| `nombre`, `tipo` | texto | Nombre y tipo (plantilla: restaurante, barbería, tienda…) |
| `nit`, `tel`, `dir`, `ciudad`, `eslogan` | texto | Datos que salen en la factura |
| `logo` | texto | Imagen como `data:` URL (PNG, o JPEG si pesa mucho), ≤ 400.000 caracteres. Es lo que más pesa del registro. **Las reglas solo aceptan** `data:image/(png|jpeg|webp);base64,…` o vacío, y la app solo dibuja uno válido (`logoNegocio`, S8) |
| `activo` 🔒 | booleano | `false` = suspendido (control de pago) |
| `plan` 🔒, `precioMes` 🔒, `diaPago` 🔒 | texto / número | Plan comercial (Básico, Profesional, Premium) |
| `vendedorId` 🔒, `vendedorNombre` 🔒, `notasComerciales` 🔒 | texto | Super-admin vendedor que lo trajo |
| `esDemo` 🔒, `demoDe` 🔒 | booleano / texto | Negocio de demostración y quién lo creó |
| `creado` 🔒 | momento | Alta |
| `funciones` 🔒 | arreglo de texto | Ventanas habilitadas (`ventas`, `caja`, `inventario`, `citas`…) |
| `sucursales` 🔒 | arreglo `{id, nombre}` | Sedes (F1). Vacío o una sola = sin sucursales |
| `pruebaDesde` 🔒, `pruebaHasta` 🔒 | número (ms) | Periodo de prueba, o vencimiento de una demo (`dominio/prueba.js`). Con `pruebaHasta` vencido el negocio queda en solo lectura (reglas). Sin estos campos = negocio pagado |
| `flujoPedido` | texto | `directo` (cobrar al vender) o `dos_pasos` (pedido y luego cobro) |
| `tiposEntrega` | arreglo de texto | `mesa`, `llevar`, `domicilio`, `envio` |
| `usaMesas`, `usaCocina`, `usaRecetas`, `usaCitas`, `usaCuentas`, `usaCaja`, `usaPropina`, `usaDomicilios`, `usaCodBarras`, `usaClienteFijo`, `esLogistica`, `descontarAlPedir`, `verificarBanco` | booleano | Funciones operativas (ver [11](../11-business-settings/11-business-settings.md)) |
| `ajusteCobro` | texto | Cómo se ajusta un cobro al editar un pedido pagado |
| `clienteFijoNombre`, `clienteFijoTel` | texto | Cliente por defecto (venta rápida) |
| `tipoFactura` | texto | Formato de impresión (POS, media carta, carta) |
| `pctDatafono` | número | Recargo por pago con tarjeta (%) |
| `baseFija` | número | Base sugerida al cerrar la caja |
| `tema`, `colorTema` | texto | Apariencia |
| `sonidos`, `alertaStock`, `alertaVence` | booleano | Avisos |
| `diasAvisoVence` | número | Días antes del vencimiento de un lote para avisar |
| `palabraProducto`, `palabraProductos`, `palabraPedido`, `palabraPersonal` | texto | Vocabulario del negocio ("servicio", "turno"…) |

🔒 = **campo reservado**: solo lo escribe el super-admin. La lista está duplicada a propósito en `CAMPOS_NEGOCIO_RESERVADOS` (`src/dominio/cuentas.js`) y en `database.rules.json` (`negocios_r/$negId/$campo`). Cambiar una obliga a cambiar la otra.

### 3.2 `superadmins`
Lista en `data/superadmins`.

| Campo | Tipo | Descripción |
|---|---|---|
| `id`, `nombre`, `usuario` | texto | Identificación |
| `rolSuper` | texto | `dueno`, `ayudante` o `vendedor` |
| `activo` | booleano | Ausente = activo |
| `creado` | momento | Alta |
| `passHash`, `passSal`, `passIter` | texto / número | **Viejo**: contraseña con hash (S2). Solo existe hasta migrar a Firebase Authentication; al migrar se borra. En modo local sigue siendo la forma de entrar |
| `pass` | texto | **Producción original**: contraseña en **texto plano**. La versión nueva la convierte o la borra al migrar |

### 3.3 `usuarios` y `usuarios_r`
- **`data/usuarios`** (global, vieja): todos los empleados de todos los negocios, **con contraseña**. Solo la lee el super-admin para migrar cuentas, y cada usuario sale de ahí al migrar.
- **`data_<neg>_usuarios_r/<id>`** (por negocio, nueva): los empleados de ese negocio, **sin contraseñas**. Los empleados la leen; solo el super-admin la escribe.

| Campo | Tipo | Descripción |
|---|---|---|
| `id`, `negocioId` | texto | Identificación y negocio |
| `nombre`, `usuario` | texto | Nombre para mostrar y nombre de inicio de sesión |
| `rol` | texto | `admin`, `dueno`, `cajero`, `mesero`, `cocina`, `vendedor` (permisos por defecto en `src/dominio/permisos.js`) |
| `pantallas`, `permisos` | arreglo de texto | Personalización; vacío = los del rol |
| `sucursales` | arreglo de texto | Sedes permitidas; vacío = todas |
| `activo` | booleano | `false` = no puede entrar |
| `creado` | momento | Alta |
| `uid` | texto | Cuenta de Firebase Authentication (al migrar) |
| `passHash`, `passSal`, `passIter` / `pass` | — | Solo en la tabla vieja (ver 3.2) |

### 3.4 `login` y `perfiles` (S1)

**`login/<claveUsuario>`**: `{correo, uid}`. Para un super-admin que pasó a su correo real, `{correo:'@correo', uid}`: la marca dice que entra con su correo, sin mostrarlo. Lleva del nombre de usuario a la cuenta. `correo` es interno e inventado (`u<aleatorio>@usuarios.wallace-system.app`): no recibe correos, y por eso no hay "olvidé mi contraseña" ([conexion-firebase](../-00-execution-protocol/conexion-firebase.md), sección 5).

**`perfiles/<uid>`**: lo único que una cuenta puede leer antes de saber su negocio. Es lo que miran las reglas para dar acceso.

| Campo | Tipo | Descripción |
|---|---|---|
| `usuario`, `nombre` | texto | Copia del registro |
| `rol` | texto | Rol de negocio o `superadmin` |
| `rolSuper` | texto | Solo super-admins: `dueno`, `ayudante`, `vendedor` |
| `negocioId` | texto | Negocio al que pertenece (`null` en super-admins) |
| `usuarioId`, `superId` | texto | Id del registro en `usuarios` o en `superadmins` |
| `activo` | booleano | `false` = las reglas le niegan todo |
| `pantallas`, `permisos`, `sucursales` | arreglo | Copia de la personalización |
| `editaNegocio` | booleano | Puede editar los datos de su negocio (Mi Negocio). Se calcula en `src/dominio/cuentas.js` |
| `migradoEn`, `reemplazadaEn` | momento | Cuándo se creó o se reemplazó la cuenta |
| `creadoPor` | texto | uid del super-admin que la creó |
| `correoReal` | texto | Solo dueño o ayudante que pasó su cuenta a su correo ("📧 Mi correo"): entra con ese correo y lo recupera con el enlace de Firebase |
| `debeCambiarPass` | booleano | Entró con una contraseña temporal: no puede usar la app hasta elegir una nueva. Lo pone el super-admin; la persona solo lo pone en `false` ([recuperar-contrasena](recuperar-contrasena.md)) |
| `negocioActivo` | texto | Solo super-admin **vendedor**: el negocio suyo cuyas tablas puede usar en este momento (lo escribe él mismo al entrar a una demo, crear un negocio o borrar una demo; las reglas exigen que sea suyo). Ver [01-super-admin-panel](../01-super-admin-panel/01-super-admin-panel.md), sección 12 |

### 3.5 `migracion_s1`
`{negocios, usuarios, negociosCopiados, usuariosCopiados}`: momento y cantidad de la conversión de las tablas globales. La hace **el primer ingreso de cualquiera** con la versión nueva, una sola vez.

### 3.6 `auditoria_sistema` (P2, 2026-10-24)
Historial de lo que hacen los super-admins sobre negocios y cuentas. Está en la **raíz**, fuera de `data/`, para que solo el dueño del sistema lo lea (el ayudante sí lee `data/`).

| Campo | Tipo | Qué es |
|---|---|---|
| `id` | texto | El mismo de la clave |
| `fecha` | número (ms) | La pone el **servidor** (`serverTimestamp`; las reglas exigen `now`) |
| `accion` | texto ≤ 80 | De `Dominio.sistema.ACCION` ("Suspendió el negocio", "Creó un usuario"…) |
| `negocioId`, `negocioNombre` | texto | El negocio afectado (no está en acciones del sistema, como el respaldo) |
| `quien`, `quienUsuario`, `quienUid`, `rolSuper` | texto | El super-admin. Las reglas exigen `quienUid === auth.uid` |
| `detalle` | texto ≤ 200 | Dato corto (motivo, usuario afectado, días…) |
| `cambios` | objeto | `{campo:{antes, despues}}`, solo lo que cambió; logos, fotos y contraseñas no se copian ("(cambió)") |

Reglas: lo escribe cualquier super-admin activo (también el vendedor), **solo agregar** (no se edita ni se borra); lo lee solo el `dueno`. No entra en el respaldo (que copia `data/`).

### 3.7 `pagos` y el cobro del negocio (P6, 2026-10-26)
`data/pagos/<negId>/<id>`: `{id, negocioId, mes:'AAAA-MM', valor (> 0), medio (Efectivo · Transferencia · Nequi · Daviplata · Otro), fecha:'AAAA-MM-DD', registrado (ISO), quien, nota?, anulado?, anuladoEn?, anuladoPor?}`. Solo el dueño y el ayudante del sistema (por `data/`). No se borran: se anulan.

En el negocio (`negocios_r/<id>`, campos reservados): `diaPago` (1–31), `cobroDesde` ('AAAA-MM', primer mes que se cobra) y `pagadoHasta` ('AAAA-MM', último mes pagado sin huecos). Reglas: `src/dominio/cobros.js`.

## 4. Tablas de cada negocio

### 4.1 `ventas`
Ventas, pedidos y cuentas abiertas. La crea `armarVenta` (`ui/ventas/nueva-venta.js`); la completan el cobro, la cocina, la anulación y la edición.

| Campo | Tipo | Descripción |
|---|---|---|
| `id`, `factura` | texto | Identificación; `factura` = `F-00001` (consecutivo de `factura_seq`, de un bloque de 20 por equipo) o `P-<equipo>-<AAMMDDhhmmss>` si salió **sin bloque** (provisional, hasta reconectar) |
| `facturaProvisional` | texto | Si la venta salió provisional, ese número (ya tiene el definitivo en `factura`) |
| `fecha` | momento | Creación |
| `jornada` | día | Día contable de la caja (F2) |
| `estado` | texto | `abierta` (pedido o cuenta sin cobrar), `pagada`, `anulada` |
| `items[]` | arreglo | `{prodId, nombre, precio, qty, obs?}`. Precio congelado al vender |
| `subtotalBruto`, `descuento`, `descMotivo`, `subtotal` | número / texto | Valor de los productos y descuento (nunca mayor que `subtotalBruto`, F26) |
| `descPct` | número | Si el descuento fue en %, el porcentaje: se recalcula al editar el pedido (F26). 0 = valor fijo |
| `valorDom`, `propina`, `recargo`, `total` | número | Domicilio, propina, recargo por tarjeta y total cobrado |
| `pagos` | objeto | `{efectivo, banco, tarjeta}`: pago dividido |
| `metodo`, `cambio` | texto / número | Método principal y vueltas |
| `cobrado`, `cobradoPor` | momento / texto | Cuándo y quién cobró |
| `bancoVerificado`, `verificadoPor`, `verificadoEn` | booleano / texto / momento | Verificación de transferencias |
| `pagoDescuadrado`, `pagoEditadoPor`, `pagoEditadoEn` | booleano / texto / momento | Ajustes de cobro al editar un pedido ya pagado |
| `stockAplicado` | booleano | El inventario ya se descontó (evita descontar o devolver dos veces) |
| `tipo`, `mesa`, `obs` | texto | Tipo de entrega (`mesa`, `llevar`, `domicilio`, `envio`), mesa y observaciones |
| `cliNombre`, `cliTel`, `cliDir`, `cliBarrio`, `cliCiudad`, `cliDepto` | texto | Cliente de esa venta |
| `transportadora` | texto | Envíos nacionales |
| `domiciliario`, `domiciliarioId` | texto | Repartidor (nombre e **id**, F15) |
| `vendedor`, `vendedorId` | texto | Quién vendió (nombre e **id**, F15) |
| `sucursalId` | texto | Sede donde se vendió (F1) |
| `cajaId` | texto | Caja en la que se registró |
| `editadoPor`, `editadoEn`, `agregadoPor`, `agregadoEn` | texto / momento | Ediciones y productos agregados a una cuenta |
| `estadoCocina` | texto | `''`, `pendiente`, `preparando`, `listo`, `entregado` |
| `horaPreparando`, `horaListo`, `horaEntregado` | momento | Tiempos de cocina |
| `estadoPedido` | texto | Estado del pedido en la pantalla de pedidos |
| `esCuenta` | booleano | Es una cuenta abierta (mesa) |
| `esSalida` | booleano | Salida de mercancía (negocios de logística) |
| `origenCita` | texto | Cita de la que salió esta venta (F8) |
| `anulada`, `anuladaPor`, `motivoAnulacion` | momento / texto | Anulación (`motivoAnulacion` solo lo pone la cancelación de una cuenta abierta) |

**Respecto a producción**: los registros viejos no tienen `vendedorId`, `domiciliarioId` ni `sucursalId`, y muchos tampoco `jornada`. La app los agrupa por nombre y calcula la jornada desde la fecha.

### 4.2 `productos`

| Campo | Tipo | Descripción |
|---|---|---|
| `id`, `nombre`, `categoria` | texto | Identificación (sin categoría = `General`) |
| `precio` | número | Precio de venta |
| `costo` | número | Costo (opcional) |
| `codBarras` | texto | Código de barras |
| `imagen` | texto | Foto `data:image/jpeg;base64,…` de 200 px (unos 10–30 KB), subida desde el formulario del producto. Vacía = ícono. Solo se dibuja si pasa `Dominio.inventario.imagenValida` |
| `agotado` | booleano | Oculto en Nueva Venta (bandera manual) |
| `ejemplo` | booleano | Producto de ejemplo (demos y periodo de prueba); `Pruebas.borrarEjemplos` los quita de una vez |
| `creado` | momento | Alta |
| `stock` | número o `null` | `null` = no lleva inventario. **Nunca se fija como valor**: se cambia con `cambiarStock`/`moverInventario`, que dejan movimiento y auditoría (D2, F11) |
| `stockMin` | número o `null` | Aviso de stock bajo |
| `usaLotes`, `lotes[]` | booleano / arreglo | Lotes con vencimiento: `{id, cantidad, vence, ingresado, motivo}`. Se descuentan por FEFO (primero el que vence antes) |
| `receta[]` | arreglo | `{insumoId, cantidad}`: insumos que consume al venderse |
| `esCombo`, `componentes[]` | booleano / arreglo | Combo: `{prodId, cantidad}` de los productos que lo forman |

### 4.3 `insumos`
`id`, `nombre`, `unidad` (texto: kg, und, ml…), `stock` (número), `stockMin`, `costo` (por unidad), `creado`.

### 4.4 `movimientos`

| Campo | Tipo | Descripción |
|---|---|---|
| `id`, `fecha`, `por` | texto / momento | Identificación, cuándo y quién |
| `productoId` o `insumoId`, `nombre` | texto | Qué se movió |
| `tipo` | texto | `entrada`, `salida`, `entrada-insumo`, `salida-insumo`, `ajuste`, `retiro_lote` |
| `cantidad` | número | Cantidad (en `ajuste`, con signo) |
| `motivo` | texto | Venta, anulación, apartado de cita, conteo, ajuste manual… |
| `conteoId` | texto | Conteo que lo originó |

### 4.5 `conteos`
`id`, `fecha`, `por`, `rol`, `items[]` `{tipo, id, nombre, unidad, sistema, contado, dif, costo}`, `revisados`, `totalItems`, `cuadran`, `faltantes`, `sobrantes`, `valorFalta`, `valorSobra`, `ajustado` (si ya se aplicó el ajuste al stock).

### 4.6 `caja_actual`
Tabla **única**: un solo valor que se reemplaza entero y se cambia con transacción (dos equipos no pueden abrir la misma caja, D5).

- **Sin sucursales**: un arreglo con 0 o 1 caja (forma heredada).
- **Con sucursales** (F1): `{cajas: {<sucursalId>: caja}}`, con una caja por sede.

Siempre se lee con `cajaActual()` / `cajaDe(lista, sucursal)`, nunca `[0]`.

Cada caja: `id`, `base` (efectivo inicial), `apertura` (momento), `cajero` (nombre de quien la abrió), `movimientos[]` `{id, tipo: 'gasto'|'retiro'|'entrada', concepto, valor, por, fecha}`. La sede no va dentro de la caja: es su clave en `cajas`. Algunos registros viejos traen `abiertaPor`.

### 4.7 `cierres`
Todo lo de la caja al cerrarla, más:

| Campo | Tipo | Descripción |
|---|---|---|
| `cierre`, `jornada`, `cerradaPor` | momento / día / texto | Cuándo, de qué día y quién |
| `sucursalId` | texto | Sede (F1); se agrega al cerrar |
| `totalVentas`, `efVenta` | número | Ventas del turno y parte en efectivo |
| `gastos`, `retiros`, `entradas` | número | Movimientos de la caja |
| `propEf`, `domEf` | número | Propinas y domicilios en efectivo (de terceros) |
| `esperado`, `contado`, `diferencia` | número | Cuadre: `diferencia = contado − esperado` |
| `motivoDescuadre` | texto | Explicación si no cuadró |
| `baseManana`, `retiroJefe`, `retiroPor` | número / texto | Base que queda para el día siguiente y retiro del dueño |

### 4.8 `config`
Tabla **única**: `baseSiguiente` (número), `basesSucursal` (`{<sucursalId>: número}`, F1), `retirosCerrada[]` `{monto, por, motivo, fecha, baseAntes, baseDespues, sucursalId}` (retiros hechos con la caja cerrada).

### 4.9 `factura_seq`
Tabla **única**: un número, el último consecutivo reservado. Cada equipo aparta un **bloque de 20** con una transacción (lo suma de una vez) y los gasta con o sin internet; sin bloque, la venta sale con un número provisional que recibe el definitivo al reconectar ([facturas-sin-conexion](facturas-sin-conexion.md)). Nunca se repite; pueden quedar saltos (números de un bloque que no se usaron).

### 4.10 `clientes`
Se crean y actualizan solos al vender con datos de cliente.

`id`, `nombre`, `tel`, `dir`, `barrio`, `ciudad`, `pedidos` (cantidad), `totalComprado`, `ultimoPedido` (momento), `creado`. Los demos crean además `total: 0` (sin uso).

### 4.11 `domiciliarios`
`id`, `nombre`, `tel`, `creado`.

### 4.12 `citas`

| Campo | Tipo | Descripción |
|---|---|---|
| `id`, `creado`, `por` | texto / momento | Identificación y autor |
| `cliente`, `tel` | texto | Cliente |
| `fechaHora` | texto | `AAAA-MM-DDTHH:MM:00`, hora local sin zona |
| `detalle`, `encargado` | texto | Servicio y responsable |
| `apartados[]` | arreglo | `{prodId, nombre, cantidad, precio}`: productos reservados |
| `stockDescontado` | booleano | Lo apartado está fuera del stock |
| `estado` | texto | `pendiente`, `atendida`, `no_recogio`, `cancelada` |
| `cerrada`, `ventaId` | momento / texto | Cierre y venta generada al cobrar (F8) |

### 4.13 `gastos_negocio`
`id`, `concepto`, `valor`, `fecha` (`AAAA-MM-DD` en los del negocio; momento completo en los de caja), `metodo`, `nota`, `por`, `creado`, `categoria` (`'Caja'` en los de caja), `origen` (`'caja'` o ausente).

### 4.14 `conceptos_gasto`
Tabla **única**: arreglo de nombres de conceptos. Sin repetidos por mayúsculas, tildes o espacios (`dominio/gastos.js`, D4).

### 4.15 `auditoria`

**De solo agregar** (S10, reglas cerradas): la gente del negocio crea registros pero no los cambia ni borra; lo mismo `movimientos`.
`id`, `fecha`, `usuario` (nombre), `rol`, `accion` (p. ej. "Abrió caja", "Anuló pedido", "Ajustó stock al editar", "Cambió contraseña", "Verificó transferencia", "Error del sistema"), `detalle`. Crece sin límite, a propósito: no se pierde historia (D3).

### 4.16 `resumen`
Tabla **única**, la publica cada equipo con las ventas completas (R1): `{total, pagadas, dias: {AAAA-MM-DD: total}, meses: {AAAA-MM: total}}`. Solo cuenta ventas pagadas; los días cubren un periodo reciente. El panel del super-admin la lee en vez de descargar las ventas de todos los negocios.

## 5. Lo que hay en producción y no usa la versión nueva

Del export del 07/10, solo estructura:

| Qué | Dónde | Qué pasa |
|---|---|---|
| Contraseñas en texto plano (`pass`) | `superadmins`, `usuarios` | Se convierten o retiran al migrar cada cuenta (S1, S2) |
| Tablas en formato viejo y a medio convertir | `data_<neg>_<tabla>` junto a `_r` | La versión nueva las termina de convertir al leerlas |
| Respaldos `_bk` (12) | `data_<neg>_<tabla>_bk`, `negocios_bk` | Se pueden borrar al final, con respaldo general ([paso-a-produccion](../-00-execution-protocol/paso-a-produccion.md), sección 3) |
| Nodos sin uso | `posu`, `prueba_conexion` (raíz) | Ídem |
| Ventas por sucursal del formato anterior | `data_<neg>_ventas-<sucursal>` | El panel las sigue leyendo por compatibilidad |

### `recuperaciones/<claveUsuario>` (raíz, 2026-10-12)

Solicitudes de "olvidé mi contraseña". Sin sesión solo se **crean**: un usuario que existe en `login/`, una por hora, con la hora del servidor. Las leen y resuelven el dueño y el ayudante del sistema.

| Campo | Tipo | Descripción |
|---|---|---|
| `usuario` | texto | La clave del usuario (igual a la llave del nodo) |
| `contacto` | texto | Teléfono o WhatsApp que dejó (opcional, máx. 40) |
| `fecha` | número | Hora del servidor |
| `estado` | texto | `pendiente`, `resuelta` o `descartada` |
| `resueltaPor`, `resueltaEn` | texto / número | uid del super-admin y hora |

Detalle: [recuperar-contrasena](recuperar-contrasena.md).
