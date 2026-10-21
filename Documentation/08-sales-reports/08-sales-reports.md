# 08 — Dashboard, reportes e historial de ventas

> **Cambios del 2026-10-08:** fechas locales en gráficas y comparaciones (F2); más vendidos por producto (id) y propinas por quien atendió (F15); buscador del Historial (F3); cada negocio publica un **resumen** de ventas (`data_<neg>_resumen`, `ui/reportes/resumen.js`) que es lo único que lee el panel del super-admin (R1). Detalle en [-01-to-review](../-01-to-review/-01-to-review.md).

## 1. Propósito

Dar al negocio la lectura de sus ventas: un **Dashboard** de la jornada, **Reportes** de tendencia (7 días, 12 meses, horas pico, más y menos vendidos, propinas) y un **Historial** filtrable de todas las ventas.

## 2. Alcance

**Incluye**
- Dashboard (`inicio`): vendido en la jornada, por cobrar, últimos 7 días, mes; barras de 7 días; métodos de pago; alerta de cobros sin ajustar; pedidos por cobrar; últimas 10 ventas. Variante en **unidades** para logística.
- Reportes (`reportes`): resumen de hoy (propinas por mesero, más vendidos, domicilios), ticket promedio, comparación con el mismo día de la semana pasada, barras 7 días y 12 meses, horas pico (30 días), top y bottom 8 productos (30 días), impresión.
- Historial (`historial`): ventas por mes o todas, filtros por estado, búsqueda, reimpresión.

**No incluye**
- Utilidad, gastos y cierres → [09](../09-expenses-accounting/09-expenses-accounting.md).
- Informe mensual para el super-admin → [01](../01-super-admin-panel/01-super-admin-panel.md).

## 3. Actores y permisos

| Pantalla | Roles por defecto |
|---|---|
| `inicio` (Dashboard) | Todos los roles salvo cocina. Al entrar, cada usuario va a la primera pantalla que tenga permitida. |
| `reportes` | admin, dueño |
| `historial` | Se habilita con la pantalla `pedidos` |
| Reimprimir desde Historial | Permiso `imprimir` |

## 4. Configuración

`reportes` en `funciones` habilita Reportes; Historial aparece si hay `ventas` o `pedidos`. `esLogistica` cambia el Dashboard a unidades. `usaPropina` y `usaDomicilios` cambian las tarjetas del resumen del día.

## 5. Definiciones de métricas

| Métrica | Fórmula |
|---|---|
| Monto de una venta (Dashboard) | `subtotal` si existe, si no `total` |
| Monto de una venta (Reportes) | `subtotal` (productos − descuento; sin domicilio, propina ni recargo) |
| Vendido en la jornada | Ventas pagadas de `ventasJornada(true)` |
| Por cobrar | Ventas `abierta` de la jornada (usa `total`) |
| Últimos 7 días (Dashboard) | Ventas pagadas con `fecha` ≥ hoy − 7 días |
| Este mes | Ventas pagadas cuyo mes de jornada es el actual |
| Ticket promedio | Vendido hoy / número de ventas de hoy |
| vs. semana pasada | (hoy − mismo día hace 7) / mismo día hace 7 |
| Propina por mesero | Propinas de hoy / número de usuarios con rol `mesero` (mín. 1) |
| Horas pico | Suma de `subtotal` por hora local de `fecha`, últimos 30 días |
| Más/menos vendidos | Unidades por nombre de producto en ventas pagadas de los últimos 30 días |

## 6. Flujos

### 6.1 Dashboard (`inicio`, `ui/reportes/dashboard.js`)
Calcula las métricas, el gráfico de barras (altura proporcional al máximo, mínimo 4 px, etiqueta corta con `fmtCorto`), el reparto por método con `sumaPorMetodo`, y muestra la alerta de ventas con `pagoDescuadrado` y la tabla de pendientes con botón Cobrar.

### 6.2 Reportes (`reportes`, `ui/reportes/reportes.js`)
Calcula todas las series y guarda `window._repData` para `imprimirReporte()` (`ui/impresion/reportes.js`), que imprime en carta: vendido hoy, transacciones, ticket y más vendidos.

### 6.3 Historial (`historial`, `ui/reportes/historial.js`)
Selector de mes (meses con ventas + actual) o "Todo el historial"; filtros Todas / Pagadas / Por cobrar / Anuladas; búsqueda por factura, cliente o teléfono (el texto se guarda en `_hBusca` pero el campo no redibuja la tabla; ver limitaciones). Muestra hasta 200 filas con jornada (marca "madrugada" si la jornada difiere de la fecha) y total pagado del filtro.

## 7. Catálogo de funciones

| Función | Archivo | Alcance | Quién | Qué hace |
|---|---|---|---|---|
| `fmtMoney(n)` | `ui/nucleo/estado.js` | Servicio | Todo | `$ 1.234.567` (es-CO, redondeado). |
| `fmtCorto(n)` | `ui/nucleo/estado.js` | Servicio | Gráficas | `1.2M`, `950k`, `500`. |
| `fmtDate(f)` | `ui/nucleo/estado.js` | Servicio | Todo | Fecha y hora es-CO. |
| `fechaLocal(d)` / `today()` | dominio/fechas.js:8 | Servicio | Todo | Fecha local `AAAA-MM-DD`. |
| `inicio()` | `ui/reportes/dashboard.js` | Pantalla | `inicio` | Dashboard. |
| `tipoVentaLabel(t)` | `ui/reportes/dashboard.js` | Interna | Dashboard | Etiqueta del tipo de venta. |
| `reportes()` | `ui/reportes/reportes.js` | Pantalla | `reportes` | Reportes. |
| `imprimirReporte()` | `ui/impresion/reportes.js` | Acción UI | Reportes | Versión imprimible. |
| `historial()` | `ui/reportes/historial.js` | Pantalla | `historial` | Historial de ventas. |
| `metodoTexto(v)` / `detallePagos(v)` / `sumaPorMetodo` | dominio/pagos.js:35 | Servicio | Tablas | Ver [02](../02-pos-catalog/02-pos-catalog.md). |

## 8. Integración

Lee `ventas` ([02](../02-pos-catalog/02-pos-catalog.md)), la jornada de la caja ([03](../03-cash-register/03-cash-register.md)) y `usuarios` para contar meseros ([10](../10-users-roles/10-users-roles.md)).

## 9. Interfaz

`.stats/.stat`, `.grid2`, `.barras/.barra/.b-fill/.b-val/.b-lbl`, `.tabla`, `.cats`, `.linea/.total-linea`, `.tarjeta-pend`.

## 10. Limitaciones conocidas

- Las barras de 7 días (Dashboard y Reportes), el corte de 30 días y la comparación "hace 7 días" construyen la fecha con `toISOString()` (UTC). En Colombia (UTC−5), después de las 7 p. m. la barra de "hoy" queda con la fecha de mañana y muestra 0; la comparación semanal usa la fecha UTC de `v.fecha`.
- "Vendido hoy" en Reportes usa el día calendario (`jornadaDe(v)===today()`), mientras el Dashboard usa la caja abierta; pueden diferir en negocios nocturnos.
- "Total pagado" del Historial suma `total` (incluye domicilios, propinas y recargos), a diferencia del resto de reportes que usan `subtotal`.
- Más/menos vendidos agrupan por **nombre**: renombrar un producto parte su historial.
- El buscador del Historial (`ui/reportes/historial.js`) solo guarda el texto (`oninput="_hBusca=this.value"`) sin llamar `render()`: el filtro no se aplica hasta que otra acción redibuja la pantalla (cambiar filtro, mes o llegar datos). Lo mismo pasa en Pedidos (`ui/ventas/pedidos.js`) y en el conteo (`ui/inventario/conteo.js`).
- ~~Cocina aterrizaba en el Dashboard~~: corregido con `pantallaValida` ([-02](../-02-corrections/-02-corrections.md)).

Ver [-01-to-review](../-01-to-review/-01-to-review.md).

## Cambios del 2026-10-12
- **F21**: todas las pantallas suman la **venta del negocio** con `Dominio.ventas.ventaDelNegocio` (subtotal): Reportes, Dashboard, Contable, Historial y el resumen del panel. Propina, recargo del datáfono y domicilio son de terceros y se muestran aparte (Historial: "cobrado con propinas, recargos y domicilios").
