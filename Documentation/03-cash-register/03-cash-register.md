# 03 — Caja

> **Cambios del 2026-10-08:** con sucursales, **cada sede tiene su propia caja, base y cierre** (F1); la interfaz entra a la caja solo por `cajaActual()`/`guardarCajaActual()` (`ui/nucleo/permisos.js`), con las reglas en `dominio/caja.js`. Los gastos de caja se guardan con el día de la jornada y no se borran desde Gastos (F2, F13). Detalle en [-01-to-review](../-01-to-review/-01-to-review.md).

## 1. Propósito

Controlar el efectivo del negocio por **jornada**: abrir la caja con una base, registrar gastos, retiros y entradas, cerrarla contando el cajón, detectar descuadres y dejar la base exacta para el día siguiente. Es también el reloj contable del sistema: la jornada de las ventas la define la caja.

## 2. Alcance

**Incluye**
- Una sola caja por negocio (compartida por todos los equipos y usuarios).
- Apertura con base automática (la que quedó al cierre anterior) o manual la primera vez.
- Movimientos de caja: gasto, retiro, entrada.
- Resumen por método de pago y fórmula del efectivo esperado.
- Cierre con conteo, diferencia, base para mañana y retiro del jefe; tirilla de cierre de 80 mm y reporte de descuadre.
- Retiros y corrección de base con la caja cerrada.
- Verificación de transferencias.
- Concepto de **jornada** (negocios que cierran de madrugada).

**No incluye**
- Ventas y cobros → [02](../02-pos-catalog/02-pos-catalog.md).
- Análisis mensual de cierres y gastos → [09](../09-expenses-accounting/09-expenses-accounting.md).
- Caja por sucursal: la configuración de sucursales existe pero la caja **no** se separa por sucursal (ver limitaciones).

## 3. Actores y permisos

| Acción | Control |
|---|---|
| Abrir / cerrar caja | Permiso `abrircaja` (admin, cajero) |
| Gasto / retiro / entrada con caja abierta | Permiso `abrircaja` o jefe (`puedeRetirarJefe`) |
| Ver desglose de diagnóstico | `rol==='admin'` o supervisor |
| Retirar con caja cerrada / corregir base | `puedeRetirarJefe()`: admin, dueño o supervisor |
| Verificar transferencia | Permiso `cobrar` o `cambiarpago` |

Pantallas por rol: `caja` está en admin, cajero y dueño.

## 4. Conceptos clave

### Jornada
- `jornadaActual()` (`ui/nucleo/estado.js`): si hay caja abierta, es la fecha **local** de su apertura; si no, hoy.
- Cada venta guarda `jornada` al crearse. Así, lo vendido a la 1 a. m. pertenece al día en que se abrió la caja y los informes no parten la noche en dos.
- `ventasJornada()` (en [02](../02-pos-catalog/02-pos-catalog.md)): ventas de la caja abierta (por `cajaId` o fecha ≥ apertura); sin caja, las de hoy.

### Fórmula del efectivo esperado (`efectivoEsperado`, `dominio/caja.js:22`)

```
esperado = base
         + efectivo recibido por ventas (incluye la parte en efectivo de propinas, domicilios y recargos)
         + entradas
         − gastos
         − retiros
         − propinas y domicilios que entraron por banco/tarjeta (se pagan en efectivo a su dueño)
```

Es la **única** fórmula usada por la pantalla, el cierre y el diagnóstico.

### Dinero de terceros
Propinas (del personal), domicilios (del domiciliario) y recargos de datáfono (del banco) se muestran aparte en "No son ingreso del negocio". Las "ventas reales" usan `subtotal`.

## 5. Flujos

### 5.1 Pantalla de caja cerrada (`caja`, `ui/caja/caja.js`)
- Primera apertura (no hay `baseSiguiente`): pide la base inicial.
- Siguientes: muestra la base guardada y **no permite cambiarla** al abrir.
- Si el usuario es jefe: botones "Retirar dinero" y "Corregir base" y los últimos 5 retiros con caja cerrada.

### 5.2 Abrir (`abrirCaja`, `ui/caja/caja.js`)
Valida permiso y crea `caja_actual = [{id, base, apertura, cajero, movimientos:[]}]` con una **transacción** (`transaccionUnica`): solo se escribe si en la nube no hay caja abierta; si otro equipo se adelantó, avisa y no toca nada. Audita "Abrió caja".

### 5.3 Pantalla de caja abierta
- Tarjetas de efectivo, banco y tarjeta (solo `subtotal` repartido por método).
- Alerta de transferencias sin verificar con botón por factura.
- Resumen: jornada (avisa si sigue abierta desde ayer), apertura, base, ventas reales, entradas, gastos, retiros y **Efectivo en Caja**.
- Desglose de diagnóstico para admin.
- Tarjeta de terceros (propinas, domicilios, recargos) según el negocio.
- Tabla de movimientos del día.

### 5.4 Movimientos (`movimientoCaja(tipo)`, `ui/caja/caja.js`)
Concepto* y valor* (>0). Se agrega a `caja_actual.movimientos`. Un **gasto** además crea un registro en `gastos_negocio` con `origen:'caja'` y categoría "Caja". Audita.

### 5.5 Cerrar (`cerrarCaja`, `ui/caja/caja.js`)
1. Bloquea el cierre si hay ventas de la jornada con `pagoDescuadrado` (ofrece ajustarlas).
2. Modal: efectivo contado (sugerido = esperado) y base para mañana (sugerida = `baseFija` del negocio o la base actual). Avisa transferencias sin verificar.
3. Muestra en vivo "Se lleva el jefe" = contado − base. No permite base > contado.
4. Al guardar, primero vacía `caja_actual` con una **transacción** que solo procede si en la nube sigue abierta esa misma caja (si otro equipo ya cerró, avisa y no hay segundo cierre). Luego `terminarCierre` crea el **cierre** en `cierres` con la caja tal como estaba en el servidor (movimientos de todos los equipos), guarda `baseSiguiente` en `config` y audita cierre y retiro.
5. Imprime la tirilla (`imprimirCierre`) y, si hubo diferencia, abre `reporteDescuadre` para registrar el motivo.

### 5.6 Caja cerrada: retiro y corrección
- `retiroCajaCerrada` (`ui/caja/caja.js`): baja la base de mañana; no puede superar la base. Guarda el historial en `config.retirosCerrada` (últimos 30). Audita.
- `cambiarBaseApertura` (`ui/caja/caja.js`): fija una base distinta con motivo obligatorio. Audita.

### 5.7 Verificar transferencias
- `exigeVerificarBanco()` (`ui/ventas/cobro.js`): bandera `verificarBanco` del negocio.
- Al cobrar con banco queda `bancoVerificado:false`; `bancoPendiente(v)` la detecta.
- `marcarVerificada(id)` (`ui/ventas/cobro.js`) confirma que llegó (guarda quién y cuándo) y audita.

## 6. Modelo de datos

> Diccionario completo de todas las tablas (formatos, campos nuevos y viejos): [modelo-de-datos](../-03-architecture/modelo-de-datos.md).

### `caja_actual` (tabla única) — array con 0 o 1 elemento
`{id, base, apertura, cajero, movimientos:[{id, tipo:'gasto'|'retiro'|'entrada', concepto, valor, por, fecha}]}`

### `cierres` (por registro)
Todo lo de la caja +
`cierre`, `jornada`, `cerradaPor`, `totalVentas`, `efVenta`, `gastos`, `retiros`, `entradas`, `propEf`, `domEf`, `esperado`, `contado`, `diferencia` (contado − esperado), `motivoDescuadre`, `baseManana`, `retiroJefe`, `retiroPor`.

### `config` (tabla única)
`baseSiguiente`, `retirosCerrada[]{monto, por, motivo, fecha, baseAntes, baseDespues}`.

### Negocio
`baseFija` (base sugerida al cerrar), `verificarBanco`, `usaPropina`, `usaDomicilios`, `pctDatafono`.

## 7. Catálogo de funciones

| Función | Archivo | Alcance | Quién / permiso | Qué hace |
|---|---|---|---|---|
| `jornadaActual()` | `ui/nucleo/estado.js` | Servicio | `armarVenta`, citas | Día contable vigente. |
| `jornadaDe(v)` / `mesDeJornada(v)` / `jornadaCierre(c)` | dominio/fechas.js:22 | Servicio | Reportes, contable | Jornada de una venta/cierre. |
| `exigeVerificarBanco()` / `bancoPendiente(v)` / `ventasPorVerificar(l)` | 2385–2386 | Servicio | Caja, pedidos | Estado de transferencias. |
| `marcarVerificada(id)` | `ui/ventas/cobro.js` | Acción UI | `cobrar` o `cambiarpago` | Confirma una transferencia. |
| `efectivoRecibido(v)` / `tercerosNoEfectivo(v)` / `efectivoEsperado(c,v)` | dominio/pagos.js:53 | Servicio | Caja | Fórmula del efectivo. |
| `caja()` | `ui/caja/caja.js` | Pantalla | Pantalla `caja` | Vista cerrada/abierta. |
| `abrirCaja()` | `ui/caja/caja.js` | Acción UI | `abrircaja` | Abre la caja. |
| `movimientoCaja(tipo)` | `ui/caja/caja.js` | Acción UI | Pantalla caja | Gasto/retiro/entrada. |
| `cerrarCaja()` | `ui/caja/caja.js` | Acción UI | `abrircaja` | Cierre con cuadre. |
| `imprimirCierre(c)` | `ui/caja/caja.js` | Servicio | Cierre, contable | Tirilla 80 mm del cierre. |
| `reporteDescuadre(c)` | `ui/caja/caja.js` | Interna | Cierre | Muestra y registra motivo de descuadre. |
| `cfgCaja()` / `guardarCfgCaja(obj)` | 3525 / 3529 | Interna | Caja | Lee/escribe `config`. |
| `baseSiguiente()` | `ui/caja/caja.js` | Interna | Caja | Base guardada o `null`. |
| `baseFija()` | `ui/caja/caja.js` | Interna | Cierre | Base fija del negocio o `null`. |
| `puedeRetirarJefe()` | `ui/caja/caja.js` | Interna | Caja cerrada | admin/dueño/supervisor. |
| `retiroCajaCerrada()` | `ui/caja/caja.js` | Acción UI | Jefe | Retiro sobre la base. |
| `cambiarBaseApertura()` | `ui/caja/caja.js` | Acción UI | Jefe | Corrige la base. |
| `claveCajaActual()` | `(eliminada)` | Interna | Cierre | Clave de `caja_actual`. |
| `reimprimirCierre(id)` | `ui/gastos/contable.js` | Acción UI | Contable | Reimprime una tirilla. |

## 8. Reglas de negocio

- Una sola caja abierta por negocio.
- La base de apertura no se escribe a mano (salvo la primera vez o con "Corregir base" auditado).
- No se cierra con cobros sin ajustar.
- Un gasto de caja siempre queda también como gasto del negocio (origen caja).
- Ventas pagadas de una caja cerrada no se editan.
- Las diferencias quedan en el cierre y se resumen mes a mes en Contable.

## 9. Integración

- [02](../02-pos-catalog/02-pos-catalog.md): Nueva Venta exige caja abierta; ventas guardan `cajaId` y `jornada`.
- [09](../09-expenses-accounting/09-expenses-accounting.md): gastos de caja y cierres alimentan el registro contable.
- [07](../07-customers-delivery/07-customers-delivery.md): domicilios por banco se pagan del cajón.
- [12](../12-invoice-printing/12-invoice-printing.md): mismo mecanismo de impresión (ventana + `print()`).
- [13](../13-multitenant-isolation/13-multitenant-isolation.md): `caja_actual` y `config` son tablas únicas para que el cierre llegue a todos.

## 10. Interfaz

`.centro-msg`, `.stats/.stat`, `.grid2`, `.linea/.total-linea`, `.tarjeta.alerta`, `.cobro-caja`, `.botones-fila`, `details` del diagnóstico.

## 11. Limitaciones conocidas

- La interfaz de sucursales dice que cada sede tiene su caja, pero `caja_actual` es única por negocio y `TABLAS_POR_SUCURSAL` no se usa.
- ~~Apertura/cierre simultáneos~~: corregido con transacciones ([-02](../-02-corrections/-02-corrections.md)). Si el navegador bloquea la ventana emergente por la espera de la nube, la tirilla se reimprime desde Contable.
- `imprimirCierre` declara variables que no usa (`porMet`, `ventasCierre`, `metodos`).
- Una cita cobrada sin caja abierta crea una venta con `cajaId:null` ([05](../05-appointments-shifts/05-appointments-shifts.md)).

Ver [-01-to-review](../-01-to-review/-01-to-review.md).

## Cambios del 2026-10-12 (segunda revisión)
- **D6**: un pedido se cuenta en la caja abierta **al cobrarlo** (`cajaId`), y con caja no se cobra sin caja abierta.
- **F19**: los pedidos y cuentas sin cobrar de turnos anteriores siguen en Pedidos y Cuentas, y el cierre avisa cuántos quedan.
- **D7**: gastos, retiros y entradas se guardan con transacción (`agregarMovimientoCaja`).
- **F20**: anular una venta de una caja cerrada (solo admin o dueño) registra un retiro "Devolución por anulación" en la caja abierta.
Detalle: [-01-to-review](../-01-to-review/-01-to-review.md), segunda revisión.

## Avisos entre equipos (2026-10-12, portado del original `5425800`)

- **Otro equipo abre o cierra la caja de esta sede**: aviso "✅ Ana abrió la caja · ya puedes vender" (con sonido) o "🔒 Se cerró la caja", y la pantalla se redibuja de una vez (aunque haya un campo enfocado; con una ventana abierta, al cerrarla). Solo la caja **de la sede del equipo** (F1). Un gasto o una entrada no avisan.
- **Otro equipo toma un pedido**: "🔔 Nuevo Pedido F-77 · Otro · $ 12.000" con sonido. No se avisa lo propio (`vendedorId`, F15), lo de otra sede ni lo que llega al cargar.
- **Nueva Venta** ya no congela el refresco si no hay pedido a medio armar (antes, con la caja cerrada, el equipo no se enteraba de que otro la abrió).
- **Gasto de caja**: la copia en Gastos del Negocio lleva `movId` y solo se guarda si el movimiento entró en la caja. El Contable suma los movimientos y, además, las copias cuyo movimiento no aparece (`Dominio.gastos.copiasSinMovimiento`), sin contar nada dos veces.
- Código: `ui/nucleo/avisos-nube.js` (avisos), ganchos `alRegistroNuevo` / `alCambiarTabla` de `firebase-datos.js`, `ui/nucleo/estado.js` (`campoDelicado`, `refrescarSiSePuede(forzar)`, revisión cada 20 s). Detalle: [union-con-original](../-00-execution-protocol/union-con-original.md), 3.2.
