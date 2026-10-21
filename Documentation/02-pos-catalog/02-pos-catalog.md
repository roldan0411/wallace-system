# 02 — Punto de venta, pedidos y catálogo

> **Cambios del 2026-10-08:** las ventas guardan `sucursalId`, `vendedorId` y `domiciliarioId` (F1, F15); el buscador de Pedidos filtra al escribir (F3); `abrirCobro(v, esNuevo, opc)` también cobra entregas de citas (F9); la pregunta "¿Imprimir?" no tapa otro modal (F16). Detalle en [-01-to-review](../-01-to-review/-01-to-review.md).

## 1. Propósito

Es el corazón operativo: armar una venta en un carrito, cobrarla (con pago dividido, propina y recargo de datáfono), manejar los pedidos de la jornada, las cuentas abiertas de bares y licoreras, y mantener el catálogo de productos y combos que se venden.

## 2. Alcance

**Incluye**
- Pantalla **Nueva Venta** (`ventas`): buscador, categorías, lector de código de barras, carrito, tipos de entrega, datos del cliente, descuento.
- Tres flujos de cierre: **cobro directo**, **confirmar y cobrar después** (dos pasos) y **salida de logística** (sin dinero).
- **Pedidos** (`pedidos`): lista de la jornada, estados, cobrar, editar, anular, eliminar, cambiar forma de pago, asignar domiciliario.
- **Cobro** con pago dividido (efectivo/banco/tarjeta), cambio, propina y recargo.
- **Edición de pedidos** ya confirmados o cobrados y ajuste del cobro.
- **Cuentas abiertas** (`cuentas`).
- **Catálogo**: alta/edición/baja de productos (pantalla Inventario/Menú) y **Combos** (`combos`).

**No incluye**
- Movimiento interno del stock, lotes, insumos, recetas y conteos → [06-inventory-recipes](../06-inventory-recipes/06-inventory-recipes.md).
- Apertura/cierre y cuadre de caja → [03-cash-register](../03-cash-register/03-cash-register.md).
- Impresión de factura y comanda → [12](../12-invoice-printing/12-invoice-printing.md), [04](../04-kitchen-kds/04-kitchen-kds.md).
- Registro de clientes → [07-customers-delivery](../07-customers-delivery/07-customers-delivery.md).

## 3. Actores y permisos

| Acción | Permiso (`ACCIONES`) | Roles por defecto |
|---|---|---|
| Vender / confirmar pedido | (pantalla `ventas`) | admin, cajero, mesero, vendedor |
| Cobrar | `cobrar` | admin, cajero, vendedor |
| Editar pedido | `editar` | admin, cajero, mesero, vendedor |
| Anular | `anular` | admin, dueño |
| Cambiar forma de pago | `cambiarpago` | admin, cajero |
| Reimprimir factura | `imprimir` | admin, cajero, vendedor, dueño |
| Reimprimir comanda | `comanda` | admin, cajero, mesero, cocina |
| Eliminar definitivamente | `eliminar` | admin, dueño |
| Descuentos | `descuento` | admin, vendedor (ver nota) |
| Crear/editar/borrar productos y combos | `editarprod` | admin, dueño |

Cada acción valida su permiso al ejecutarse, no solo ocultando el botón (`exigirPermiso`). Un usuario sin `cobrar` no puede usar "💵 Cobrar ahora" en negocios de cobro directo, y el botón de descuento solo aparece con el permiso `descuento`.

## 4. Configuración que lo afecta

| Bandera del negocio | Efecto |
|---|---|
| `funciones` incluye `ventas` / `catalogo` | Muestra Nueva Venta / Inventario-Menú. Combos aparece si hay `ventas` o `catalogo`. |
| `funciones` incluye `caja` | Sin caja abierta, Nueva Venta muestra "Caja cerrada". |
| `flujoPedido` | `directo` → botón "💵 Cobrar ahora"; `dos_pasos` → "✓ Confirmar pedido". |
| `tiposEntrega` | Botones mesa / para llevar / domicilio / envío (logística: entrega / despacho). |
| `esLogistica` | Botón "📦 Registrar salida", sin precios en carrito ni cobro. |
| `usaClienteFijo` (+ `clienteFijoNombre/Tel`) | Venta rápida: no pide datos del cliente salvo en domicilio/envío. |
| `usaCodBarras` | Muestra campo de escáner y pide código en el producto. |
| `usaCuentas` | Activa Cuentas Abiertas y el botón "Dejar como cuenta abierta" (solo flujo directo). |
| `descontarAlPedir` | El stock baja al confirmar/abrir cuenta en vez de al cobrar (por defecto sí cuando hay pedidos sin cobrar). |
| `usaPropina` | Campo de propina en el cobro (por defecto = `usaCocina`). |
| `pctDatafono` | Sugiere el recargo al escribir un valor con tarjeta. |
| `verificarBanco` | Los pagos por banco quedan "sin verificar" (ver [03](../03-cash-register/03-cash-register.md)). |
| `ajusteCobro` | `diferencia` (defecto) o `total` al editar un pedido cobrado. |
| `usaCocina` | Al confirmar se imprime comanda y el pedido entra a Cocina con `estadoCocina:'pendiente'`. |
| `usaRecetas` | Valida insumos de la receta al agregar al carrito. |

## 5. Flujos principales

### 5.1 Armar la venta (`nuevaVenta`, `ui/ventas/nueva-venta.js`)
1. Marca `ESCRIBIENDO=true` para que la sincronización no redibuje el carrito.
2. Si el negocio usa caja y no hay una abierta, bloquea la venta.
3. Lista productos no agotados; los combos sin unidades suficientes van al final. Filtra por categoría y búsqueda.
4. **Agregar** (`agregarAlCarrito`, `ui/ventas/nueva-venta.js`):
   - Con inventario: `faltantesParaAgregar` revisa el stock real sumando todo el carrito (sueltos + componentes de combos).
   - Sin inventario: bloquea si `stock<=0`.
   - Con recetas: revisa que los insumos alcancen para una unidad más.
5. Cantidades con `cambiarQty`, `quitarItemCarrito`, `vaciarCarrito`.
6. Descuento (`abrirDescuento`): valor fijo o porcentaje, no puede superar el subtotal; queda `_desc` y `_descMot`.
7. Cliente (`camposCliente`, `ui/ventas/nueva-venta.js`) según el tipo: mesa (número), domicilio (nombre, teléfono, dirección, barrio, valor, domiciliario), envío (además ciudad, departamento, transportadora), para llevar (teléfono obligatorio). Autocompletado desde Clientes ([07](../07-customers-delivery/07-customers-delivery.md)).
8. El total en pantalla se actualiza sin redibujar al escribir el valor del domicilio (`actualizarTotalVenta`).

### 5.2 Construir el registro (`armarVenta`, `ui/ventas/nueva-venta.js`)
- Número de factura: `F-` + 5 dígitos, tomado de `siguienteFactura()`: un número **reservado en la nube** por este equipo (transacción sobre `factura_seq`) o, sin conexión, el mayor conocido + 1. Puede haber saltos, no repetidos mientras haya conexión ([-02](../-02-corrections/-02-corrections.md)).
- `jornada` = día de apertura de la caja (`jornadaActual`).
- `subtotal` = bruto − descuento; `total` = subtotal + domicilio + propina + recargo.
- `cajaId` = caja abierta.
- En edición, **conserva** todos los campos del original (pagos, cobro, horas) y solo reemplaza lo editable.
- `estadoCocina:'pendiente'` si el negocio usa cocina.

### 5.3 Validar cliente (`validarClientePedido`, `ui/ventas/nueva-venta.js`)
Teléfono obligatorio (≥7 dígitos) en para llevar, domicilio y envío; dirección obligatoria en domicilio. Venta rápida omite la validación salvo domicilio/envío.

### 5.4 Flujo directo (`cobrarDirecto`, `ui/ventas/nueva-venta.js`)
Arma la venta como `abierta` y abre el modal de cobro (`abrirCobro(venta, true)`). Solo se guarda cuando se confirma el cobro.

### 5.5 Flujo dos pasos (`confirmarPedido`, `ui/ventas/nueva-venta.js`)
1. Si descuenta al pedir, valida inventario.
2. Guarda la venta `abierta`; si descuenta al pedir, `descontarStock`.
3. Imprime comanda si usa cocina.
4. Va a Pedidos. Luego se cobra con `cobrarPedido`.

### 5.6 Logística (`registrarSalida`, `ui/ventas/nueva-venta.js`)
Guarda la venta como `pagada` con `esSalida:true`, `metodo:'—'`, descuenta stock, registra cliente y auditoría, avisa stock bajo y ofrece imprimir la **remisión**.

### 5.7 Cobro (`abrirCobro`, `ui/ventas/cobro.js`)
1. Muestra productos, descuento, domicilio, propina (si aplica), recargo y total.
2. Captura pagos por efectivo/banco/tarjeta con atajos ("Todo en efectivo", "Todo por banco", "Todo con tarjeta", "Mitad y mitad") y muestra "Exacto / Faltan / Cambio" (`pintarEstadoPago`).
3. Al confirmar:
   - Si falta dinero, no deja cobrar.
   - Si sobra, el exceso es **cambio** y se descuenta del efectivo; si el efectivo no alcanza para dar el cambio, no deja cobrar.
   - Guarda `pagos{efectivo,banco,tarjeta}`, `metodo` (`efectivo`/`banco`/`tarjeta`/`mixto`), `propina`, `recargo`, `total`, `cambio`, `cobrado`, `cobradoPor`, `estado:'pagada'`.
   - Con `verificarBanco` y pago por banco: `bancoVerificado:false`.
   - `descontarStock` (no descuenta dos veces), guarda, crea/actualiza cliente, suena, avisa stock bajo y ofrece imprimir factura si `facturas` está habilitado.

### 5.8 Editar pedido (`editarPedido`, `ui/ventas/cobro.js`)
- No permite editar anulados, ni pagados de una caja **ya cerrada** ("anúlalo y haz uno nuevo"), ni pagados si no hay caja abierta.
- Carga el pedido al carrito y marca `STATE.editandoVentaId`.
- Guardar (`guardarEdicionPedido`, `ui/ventas/nueva-venta.js`, o `confirmarPedido` en edición):
  - Si ya había descontado stock, valida y aplica **solo la diferencia** (`ajustarStockPorEdicion`).
  - Si cambiaron los ítems y la cocina no lo entregó, vuelve a `pendiente` y ofrece reimprimir comanda.
  - Si estaba pagado y el total cambió, marca `pagoDescuadrado:true` y abre el ajuste.
  - Audita "Editó pedido" con total y unidades antes → después.

### 5.9 Ajustar cobro tras editar (`ajustarPagoVenta`, `ui/ventas/cobro.js`)
- **Modo diferencia**: registra solo lo que el cliente debe o lo que se le devuelve; no se puede devolver por un método más de lo pagado por él.
- **Modo total**: se vuelve a repartir el total completo, reemplazando el pago anterior.
- Se puede saltar de un modo al otro desde el modal. `guardarAjusteCobro` limpia `pagoDescuadrado` y audita.
- La caja no deja cerrar mientras haya pedidos con `pagoDescuadrado` ([03](../03-cash-register/03-cash-register.md)).

### 5.10 Cambiar forma de pago (`cambiarFormaPago`, `ui/ventas/cobro.js`)
Reparte el mismo total entre métodos (debe sumar exacto). Audita antes → después.

### 5.11 Anular (`anularPedido`, `ui/ventas/cobro.js`)
`estado:'anulada'`, `anulada`, `anuladaPor`. Si el stock ya se había descontado, lo devuelve con movimiento registrado. La venta sigue existiendo (sale en Historial como anulada).

### 5.12 Eliminar definitivamente (`eliminarDefinitivo`, `ui/ventas/cobro.js`)
Devuelve stock si aplica y borra el registro con marca (`eliminarMisDatos`). Desaparece de caja y reportes.

### 5.13 Pedidos (`pedidos`, `ui/ventas/pedidos.js`)
- Muestra las ventas **de la jornada** (`ventasJornada`): las de la caja abierta o con fecha ≥ apertura; sin caja, las de hoy. Excluye anuladas. Máximo 100 filas.
- Búsqueda por factura, cliente, teléfono, domiciliario o mesa.
- Columnas dinámicas según el negocio: tipo (si hay >1), mesa, total o unidades (logística), cobro y método, cocina, estado (Activo/Entregado), domiciliario.
- Etiquetas: "Revisar pago" (`pagoDescuadrado`), "Transferencia sin verificar".
- `setEstadoPedido` (`ui/ventas/pedidos.js`): Activo/Entregado; al entregar también cierra el estado de cocina.

### 5.14 Cuentas abiertas
- `abrirCuentaNueva` (`ui/ventas/cuentas-abiertas.js`): guarda el carrito como venta `abierta` con `esCuenta:true`; descuenta stock si corresponde; imprime comanda si hay cocina.
- `cuentas` (`ui/ventas/cuentas-abiertas.js`): tarjetas con nombre (mesa o cliente), total, tiempo abierta (verde <1 h, ámbar <3 h, rojo ≥3 h), primeros 6 ítems y acciones.
- `irAgregarACuenta` → `agregarACuenta` (`ui/ventas/cuentas-abiertas.js`): **suma** lo del carrito a la cuenta (agrupa por producto, precio y observación), recalcula totales, imprime comanda **solo de lo nuevo**.
- `renombrarCuenta`, `cancelarCuenta` (permiso `anular`; devuelve stock si estaba descontado, la deja `anulada` con motivo "Cuenta cancelada"), `nuevaCuentaDesdeCero`.
- Se cobran con el mismo `cobrarPedido`.

### 5.15 Catálogo de productos (pantalla en [06](../06-inventory-recipes/06-inventory-recipes.md))
- `editarProducto` (`ui/inventario/catalogo.js`): nombre*, precio*, categoría (por defecto "General"), código de barras (si aplica). Con inventario y sin recetas: stock (vacío = no lleva inventario), stock mínimo de aviso (defecto 5) y, si es nuevo, fecha de vencimiento (crea el primer lote). En restaurante: editor de receta, sin stock propio.
- `eliminarProducto` (`ui/inventario/catalogo.js`): borra con confirmación.

### 5.16 Combos (`combos`, `ui/inventario/combos.js`)
- Un combo es un producto con `esCombo:true`, `componentes:[{prodId,cantidad}]` y `stock:null`.
- `disponiblesCombo` calcula cuántos alcanzan con el stock de sus componentes (`null` si ningún componente lleva stock).
- Muestra ahorro vs. precio suelto (`precioSuelto`) y la tabla de qué descuenta del inventario.
- `editarCombo` (`ui/inventario/combos.js`) con editor de componentes (`agregarAComboTmp`, `quitarDeComboTmp`, `pintarResumenCombo`). Requiere al menos un componente. Audita.
- Al vender, el motor de inventario descuenta los componentes, no el combo ([06](../06-inventory-recipes/06-inventory-recipes.md)).

## 6. Modelo de datos — `ventas` (`data_<neg>_ventas`)

> Diccionario completo de todas las tablas (formatos, campos nuevos y viejos): [modelo-de-datos](../-03-architecture/modelo-de-datos.md).

| Campo | Descripción |
|---|---|
| `id`, `factura` (`F-00001`) | Identificación |
| `fecha`, `jornada` (AAAA-MM-DD) | Creación y día contable |
| `items[]` `{prodId, nombre, precio, qty, obs?}` | Detalle (precio congelado al vender) |
| `subtotalBruto`, `descuento`, `descMotivo`, `subtotal` | Valor de productos |
| `valorDom`, `propina`, `recargo`, `total` | Terceros y total cobrado |
| `estado` | `abierta` / `pagada` / `anulada` |
| `pagos{efectivo,banco,tarjeta}`, `metodo`, `cambio` | Cobro |
| `cobrado`, `cobradoPor`, `bancoVerificado`, `verificadoPor`, `verificadoEn` | Trazabilidad del cobro |
| `pagoDescuadrado`, `pagoEditadoPor`, `pagoEditadoEn` | Ajustes tras editar |
| `tipo` (`mesa`/`llevar`/`domicilio`/`envio`/…), `mesa`, `obs` | Entrega |
| `cliNombre`, `cliTel`, `cliDir`, `cliBarrio`, `cliCiudad`, `cliDepto`, `transportadora`, `domiciliario` | Cliente |
| `vendedor`, `editadoPor`, `editadoEn`, `agregadoPor`, `agregadoEn` | Personal |
| `cajaId` | Caja en la que se registró |
| `stockAplicado` | `true` si el inventario ya se descontó (evita doble descuento/devolución) |
| `estadoCocina`, `horaPreparando`, `horaListo`, `horaEntregado`, `estadoPedido` | Cocina y entrega |
| `esCuenta`, `esSalida`, `origenCita` | Variantes |
| `anulada`, `anuladaPor`, `motivoAnulacion` | Anulación |

`productos` (campos de catálogo): `id`, `nombre`, `precio`, `categoria`, `codBarras`, `imagen`, `agotado`, `creado`, `stock`, `stockMin`, `usaLotes`, `lotes[]`, `receta[]`, `esCombo`, `componentes[]`.

## 7. Catálogo de funciones

| Función | Archivo | Alcance | Quién / permiso | Qué hace |
|---|---|---|---|---|
| `nuevaVenta()` | `ui/ventas/nueva-venta.js` | Pantalla | Pantalla `ventas` | Vista de venta y carrito. |
| `camposCliente()` | `ui/ventas/nueva-venta.js` | Interna | `nuevaVenta` | Campos del cliente según tipo de entrega. |
| `actualizarTotalVenta()` | `ui/ventas/nueva-venta.js` | Acción UI | Input valor domicilio | Refresca el total sin redibujar. |
| `escanearProducto(codigo)` | `ui/ventas/nueva-venta.js` | Acción UI | Campo escáner (Enter) | Busca por `codBarras` y agrega; mantiene el foco. |
| `agregarAlCarrito(id)` | `ui/ventas/nueva-venta.js` | Acción UI | Clic en producto | Valida stock/insumos y suma 1. |
| `cambiarQty(idx,delta)` / `quitarItemCarrito(idx)` / `vaciarCarrito()` | 1640–1651 | Acción UI | Carrito | Edición del carrito. |
| `limpiarPedido()` | `ui/ventas/nueva-venta.js` | Servicio | Tras guardar/cancelar | Reinicia carrito, cliente (o cliente fijo), descuento y modos. |
| `abrirDescuento()` / `quitarDescuento()` | 1664 / 1681 | Acción UI | Carrito | Descuento valor o %. |
| `cancelarEdicionPedido()` | `ui/ventas/nueva-venta.js` | Acción UI | Banner de edición | Sale sin guardar. |
| `buscarCliente()` | `(eliminada)` | Interna | (sin uso actual) | Autocompletaba por teléfono exacto. Código muerto. |
| `armarVenta(estado)` | `ui/ventas/nueva-venta.js` | Servicio | Flujos de guardado | Construye el registro de venta. |
| `validarClientePedido()` | `ui/ventas/nueva-venta.js` | Servicio | Flujos de guardado | Validación de datos mínimos. |
| `registrarSalida()` | `ui/ventas/nueva-venta.js` | Acción UI | Logística | Guarda salida sin dinero. |
| `guardarEdicionPedido()` | `ui/ventas/nueva-venta.js` | Acción UI | Edición | Guarda cambios de un pedido. |
| `confirmarPedido()` | `ui/ventas/nueva-venta.js` | Acción UI | Flujo dos pasos | Guarda pedido abierto (o edición). |
| `cobrarDirecto()` | `ui/ventas/nueva-venta.js` | Acción UI | Flujo directo | Abre el cobro de la venta nueva. |
| `bloquearBoton(id,texto)` | `ui/ventas/nueva-venta.js` | Interna | Guardados | Evita doble clic visual. |
| `descuentaAlPedir()` / `usaCuentas()` / `hayPedidosAbiertos()` | 2015–2028 | Servicio | Venta, cuentas, inventario | Reglas de cuándo baja el stock y si hay cuentas. |
| `cuentasAbiertas()` / `nombreCuenta(v)` / `minutosAbierta(v)` / `tiempoTxt(min)` | 2032–2045 | Interna | Cuentas | Lista y formateo. |
| `abrirCuentaNueva()` | `ui/ventas/cuentas-abiertas.js` | Acción UI | Nueva Venta | Abre cuenta con el carrito. |
| `irAgregarACuenta(id)` / `salirDeCuenta()` / `agregarACuenta()` | 2077–2098 | Acción UI | Cuentas | Agregar productos a una cuenta. |
| `renombrarCuenta(id)` | `ui/ventas/cuentas-abiertas.js` | Acción UI | Cuentas | Cambia mesa/nombre. |
| `cuentas()` | `ui/ventas/cuentas-abiertas.js` | Pantalla | `cuentas` | Tablero de cuentas. |
| `cancelarCuenta(id)` | `ui/ventas/cuentas-abiertas.js` | Acción UI | Permiso `anular` | Cancela y devuelve stock. |
| `nuevaCuentaDesdeCero()` | `ui/ventas/cuentas-abiertas.js` | Acción UI | Cuentas | Lleva a Nueva Venta limpia. |
| `ventasJornada(soloPagadas)` | `ui/ventas/pedidos.js` | Servicio | Pedidos, caja, cocina, dashboard, domicilios | Ventas de la jornada actual. |
| `pedidos()` | `ui/ventas/pedidos.js` | Pantalla | `pedidos` | Lista de pedidos de la jornada. |
| `setEstadoPedido(id,estado)` | `ui/ventas/pedidos.js` | Acción UI | Pedidos | Activo/Entregado. |
| `pagosDe(v)` | dominio/pagos.js:10 | Servicio | Caja, reportes, contable | Pagos por método (ventas viejas: todo a su único método). |
| `reparte(v,monto)` | dominio/pagos.js:22 | Servicio | Caja, domicilios | Reparte un monto en proporción a cómo pagó el cliente. |
| `metodoTexto(v)` / `detallePagos(v)` | dominio/pagos.js:35 | Servicio | Tablas | Etiqueta "Mixto" y detalle. |
| `sumaPorMetodo(ventas,fn)` | dominio/pagos.js:43 | Servicio | Caja, dashboard, contable | Suma por método de un monto repartido. |
| `cobrarPedido(id)` | `ui/ventas/cobro.js` | Acción UI | Pedidos, cuentas, dashboard | Abre el cobro de un pedido abierto. |
| `abrirCobro(v,esNuevo)` | `ui/ventas/cobro.js` | Servicio | Cobros | Modal de cobro y guardado. |
| `leerPagos()` / `metodoPrincipal(p)` / `pintarEstadoPago()` / `pagoRapido(tipo)` | 2536–2556 | Interna | Modales de cobro | Captura, método principal, faltante/cambio, atajos. |
| `anularPedido(id)` | `ui/ventas/cobro.js` | Acción UI | Botón 🚫 (permiso `anular`) | Anula y devuelve stock. |
| `editarPedido(id)` | `ui/ventas/cobro.js` | Acción UI | Permiso `editar` | Carga el pedido en el carrito. |
| `modoAjusteCobro()` | `ui/ventas/cobro.js` | Interna | Ajuste | `diferencia` o `total`. |
| `ajustarPagoVenta(id,modo)` | `ui/ventas/cobro.js` | Acción UI | Tras editar / caja / dashboard | Modal de ajuste. |
| `guardarAjusteCobro(id,pagos,detalle)` | `ui/ventas/cobro.js` | Interna | Ajuste | Guarda pagos ajustados. |
| `cambiarFormaPago(id)` | `ui/ventas/cobro.js` | Acción UI | Permiso `cambiarpago` | Redistribuye el total. |
| `eliminarDefinitivo(id)` | `ui/ventas/cobro.js` | Acción UI | Permiso `eliminar` | Borra la venta. |
| `editarProducto(id)` / `eliminarProducto(id)` | 3741 / 3889 | Acción UI | Permiso `editarprod` | Alta/edición/baja de productos. |
| `esCombo` / `disponiblesCombo` / `unidadesPedidas` / `faltantesParaAgregar` / `precioSuelto` | dominio/inventario.js:65 | Servicio | Venta, combos | Cálculos de combos y stock del carrito. |
| `combos()` | `ui/inventario/combos.js` | Pantalla | `combos` | Menú y combos. |
| `editarCombo(id)` y editor (`comboEditorHTML`, `comboFilasHTML`, `pintarResumenCombo`, `agregarAComboTmp`, `quitarDeComboTmp`) | 4121–4198 | Acción UI / Interna | Permiso `editarprod` | Alta/edición de combos. |

## 8. Reglas de negocio

- Una venta nunca descuenta inventario dos veces ni lo devuelve dos veces (`stockAplicado`).
- No se puede cobrar menos del total; el cambio solo sale del efectivo.
- Propina, domicilio y recargo **no son ingreso** del negocio: se suman al total cobrado pero las ventas reales usan `subtotal`.
- Un pedido cobrado de una caja cerrada no se edita.
- Cancelar/anular deja traza en Movimientos y Auditoría.

## 9. Integración

Inventario ([06](../06-inventory-recipes/06-inventory-recipes.md)) vía `requerimientos`/`descontarStock`/`devolverStock`/`ajustarStockPorEdicion`; Caja ([03](../03-cash-register/03-cash-register.md)) por `cajaId`/jornada; Cocina ([04](../04-kitchen-kds/04-kitchen-kds.md)) por `estadoCocina` y comandas; Clientes ([07](../07-customers-delivery/07-customers-delivery.md)) con `guardarClienteAuto`; Impresión ([12](../12-invoice-printing/12-invoice-printing.md)); Auditoría ([10](../10-users-roles/10-users-roles.md)).

## 10. Interfaz

`.venta-grid`, `.venta-izq`, `.carrito`, `.carrito-cab/.carrito-pie`, `.items/.item/.item-qty`, `.prods/.prod/.prod-stock(.poco/.sin)`, `.cats/.cat.on`, `.tipos/.tipo.on`, `.cli-fijo`, `.cli-sugerencias`, `.cobro-caja`, `.c-row/.c-total/.c-nota`, `.kds-grid/.kds-card` (cuentas), `.fila-pend`, `.caja-aviso`. Responsive: bajo 1000 px el carrito pasa debajo de los productos.

## 11. Limitaciones conocidas

- Consecutivo de factura: corregido con reserva en la nube; un equipo sin conexión desde el inicio aún podría repetir un número ([-02](../-02-corrections/-02-corrections.md)).
- El stock al editar un producto existente se sobrescribe sin movimiento registrado.
- El buscador de Pedidos solo guarda el texto en `_pBusca` y no redibuja: el filtro no se aplica al escribir.
- La propina por defecto depende de `usaCocina` si el negocio no definió `usaPropina`.

Ver [-01-to-review](../-01-to-review/-01-to-review.md).

## Cambios del 2026-10-12
- **D6**: con caja, no se cobra sin caja abierta, y el cobro queda en la caja abierta al cobrar.
- **F20**: anular una venta de una caja ya cerrada exige admin o dueño y registra la devolución del efectivo en la caja abierta.
- **F22**: anular una venta cobrada resta del cliente el pedido y su monto.
- **S7**: guardar la edición de un pedido exige el permiso `editar`; abrir, agregar y renombrar cuentas exigen acceso a Ventas o Cuentas.

## Cambios del 2026-10-12 (tercera revisión)

- **Varios equipos con el mismo pedido (D9)**: agregar a una cuenta, cobrar un pedido existente, anular, cancelar una cuenta y guardar una edición pasan por `Datos.transaccionRegistro` y las reglas puras de `src/dominio/ventas.js`.
  - Lo agregado por otro mesero no se pierde.
  - No se cobra a ciegas un pedido que otro equipo cambió o ya cobró: aviso "Otro equipo cambió este pedido…".
  - Sin internet, se guarda como antes y viaja en la cola.
- **Montos (S9)**: ninguna forma de pago, propina, recargo, domicilio ni precio puede ser negativo (`Dominio.pagos.montoValido`).
- **Eliminar definitivamente (F24)**: solo pedidos ya anulados. **Cambiar forma de pago**: no en ventas de una caja cerrada.
- **Agotado (F25)**: tampoco lo agrega el escáner.
- **Descuento (F26)**: el de % se recalcula con el subtotal (`descPct`) y ningún descuento supera el subtotal.
- **Confirmar pedido en edición (S11)**: exige el permiso `editar`.
- **Ventanas diferidas (F27)**: "¿Imprimir factura?" y la alerta de stock esperan su turno (`cuandoNoHayaVentana`); antes una tapaba a la otra.
- Detalle: [-01-to-review](../-01-to-review/-01-to-review.md#tercera-revisión-2026-10-12).

- **Número de factura** (2026-10-12): el cobro directo lo toma al **confirmar** el cobro, no al abrirlo (`armarVenta(estado, {sinFactura:true})`); un cobro cancelado ya no deja un salto. Mientras, la ventana dice "Cobrar (nueva venta)".
- **Números de factura sin conexión** (2026-10-12):
  - cada equipo aparta un bloque de 20 números y los gasta con o sin internet;
  - sin bloque, sale un número provisional `P-<equipo>-<fecha y hora>`, que recibe el definitivo al reconectar;
  - el Dashboard avisa si hay números repetidos.

  Detalle: [facturas-sin-conexion](../-03-architecture/facturas-sin-conexion.md).
