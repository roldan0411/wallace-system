# 09 — Gastos del negocio y registro contable mensual

> **Cambios del 2026-10-08:** los gastos de caja se guardan con el día de la jornada y los viejos (hora UTC) se leen con su día local (F2); no se borran desde Gastos (F13); el catálogo de conceptos se arma una vez por pantalla (R2); Contable suma las cajas abiertas de todas las sedes (F1). Detalle en [-01-to-review](../-01-to-review/-01-to-review.md).

## 1. Propósito

Registrar todo lo que sale de dinero (lo que paga el dueño aparte y lo que sale del cajón) con conceptos normalizados, y consolidar cada mes un **registro contable de gestión**: ventas, egresos por concepto, utilidad estimada, dinero de terceros y control de cierres de caja.

> Es un informe **interno de gestión**. No es contabilidad tributaria ni tiene relación con la DIAN (así lo indica la propia pantalla).

## 2. Alcance

**Incluye**
- Gastos del negocio (`gastosneg`): registro, eliminación, filtro por mes, comparación con el mes anterior, peso sobre las ventas, distribución por concepto.
- Catálogo de conceptos de gasto (base + personalizados) sin duplicados por mayúsculas, tildes o espacios.
- Registro contable (`contable`): ventas por método, egresos de caja y del negocio, utilidad, terceros, más vendidos, días de mayor venta, cierres del mes y reimpresión, versión imprimible.

**No incluye**
- Movimientos de caja del día y cierre → [03](../03-cash-register/03-cash-register.md).
- Impuestos, cuentas por pagar/cobrar, costo de ventas.

## 3. Actores y permisos

Pantallas `contable` y `gastosneg`: admin y dueño. Registrar o eliminar gastos no tiene permiso de acción propio.

## 4. Configuración

`funciones` incluye `contable` y/o `gastosneg` (no están en los perfiles de logística).

## 5. Flujos

### 5.1 Conceptos de gasto
- Base (`CONCEPTOS_BASE`, `dominio/gastos.js`): Arriendo, Servicios públicos, Recibo de luz, Recibo de agua, Recibo de gas, Internet / Teléfono, Mercancía / Proveedores, Insumos, Nómina, Mantenimiento, Impuestos, Publicidad, Transporte, Aseo, Otros.
- Mientras el negocio no guarde su propia lista, se usa la base + los conceptos ya usados en gastos.
- `claveConcepto` normaliza (minúsculas, sin tildes, espacios simples) para no duplicar; `acumConcepto` agrupa siempre con el nombre "oficial" del catálogo.
- Agregar desde el modal de gasto ("+ Agregar concepto nuevo") o administrar/quitar en "Conceptos" (quitar no borra los gastos existentes). Se auditan altas y bajas.

### 5.2 Registrar gasto (`nuevoGasto`, `ui/gastos/gastos.js`)
Concepto (obligatorio, de la lista), valor*, fecha (hoy por defecto), pagado con (Efectivo/Banco/Tarjeta) y nota. Se guarda en `gastos_negocio` con `por` y `creado`. Audita "Registró gasto".

Los **gastos de caja** se crean solos desde Caja ([03](../03-cash-register/03-cash-register.md)) con `origen:'caja'`.

### 5.3 Pantalla Gastos (`gastosneg`, `ui/gastos/gastos.js`)
- Indicadores del mes: total (con diferencia vs. mes anterior), peso sobre las ventas (`gastos / ventas pagadas del mes`), de la caja diaria, pagados aparte.
- "En qué se fue la plata": barras por concepto con porcentaje y "Ver N conceptos más".
- Detalle del mes con origen y botón eliminar. Eliminar un gasto de caja advierte que la caja de ese día quedará descuadrada.

### 5.4 Registro contable (`contable`, `ui/gastos/contable.js`)

| Concepto | Cálculo |
|---|---|
| Ventas del mes | Suma de `subtotal` de ventas pagadas cuya jornada cae en el mes |
| Variación | vs. mes anterior en % |
| Ventas por método | `sumaPorMetodo(delMes, subtotal)` (respeta pago dividido) |
| Gastos de caja | Movimientos `gasto` de los **cierres** del mes + de la caja abierta si su apertura es del mes |
| Gastos del negocio | `gastos_negocio` del mes con `origen !== 'caja'` (evita duplicar los de caja) |
| Egresos | Gastos de caja + gastos del negocio (sin retiros) |
| Utilidad estimada | Ventas − egresos, y % sobre ventas |
| Terceros | Propinas, domicilios, recargos y retiros del dueño (informativos, no restan) |
| Cierres | Esperado, contado, base dejada, retirado y resultado; suma de diferencias del mes |

También: top 10 productos del mes, top 5 días. Selector de mes con todos los meses con ventas o gastos. `imprimirContable()` (`ui/impresion/reportes.js`) imprime el resumen y los egresos por concepto; `reimprimirCierre(id)` reimprime una tirilla.

## 6. Modelo de datos

> Diccionario completo de todas las tablas (formatos, campos nuevos y viejos): [modelo-de-datos](../-03-architecture/modelo-de-datos.md).

### `gastos_negocio`
`id`, `concepto`, `valor`, `fecha` (`AAAA-MM-DD` para los del negocio; ISO completa para los de caja), `metodo`, `nota`, `por`, `creado`, `categoria` (`'Caja'` en los de caja), `origen` (`'caja'` o ausente).

### `conceptos_gasto` (clave `data_<neg>_conceptos_gasto`, valor completo)
Array de nombres.

### Lecturas
`ventas` pagadas, `cierres`, `caja_actual`.

## 7. Catálogo de funciones

| Función | Archivo | Alcance | Quién | Qué hace |
|---|---|---|---|---|
| `contable()` | `ui/gastos/contable.js` | Pantalla | `contable` | Registro contable mensual. |
| `reimprimirCierre(id)` | `ui/gastos/contable.js` | Acción UI | Contable | Reimprime un cierre. |
| `nombreMes(m)` | `ui/gastos/contable.js` | Servicio | Contable, gastos, informes | `"marzo de 2026"`. |
| `normConcepto` / `claveConcepto` | 5084–5085 | Servicio | Gastos | Normalización. |
| `getConceptosGasto()` / `guardarConceptos(l)` | 5086 / 5093 | Servicio | Gastos | Catálogo de conceptos. |
| `acumConcepto(obj,nombre,monto)` | `ui/gastos/gastos.js` | Servicio | Contable, gastos | Suma agrupando sin duplicar. |
| `conceptosCompactoHTML(obj,opts)` | `ui/gastos/gastos.js` | Interna | Contable, gastos | Lista con barras y %. |
| `opcionesConcepto(lista,sel)` | `ui/gastos/gastos.js` | Interna | Modal de gasto | `<option>` de conceptos. |
| `agregarConceptoGasto()` / `toggleNuevoConcepto()` | 5132 / 5145 | Acción UI | Modal de gasto | Concepto nuevo. |
| `administrarConceptos()` / `quitarConcepto(n)` | 5151 / 5161 | Acción UI | Botón "Conceptos" | Gestiona la lista. |
| `gastosneg()` | `ui/gastos/gastos.js` | Pantalla | `gastosneg` | Gastos del negocio. |
| `nuevoGasto()` / `eliminarGasto(id)` | 5239 / 5270 | Acción UI | Gastos | Alta/baja de gastos. |
| `imprimirContable()` | `ui/impresion/reportes.js` | Acción UI | Contable | Versión imprimible. |

## 8. Reglas

- Retiros del dueño no son gasto.
- Propinas, domicilios y recargos no son ingreso.
- Un gasto de caja se cuenta una sola vez (desde los movimientos reales del cajón).

## 9. Integración

[03](../03-cash-register/03-cash-register.md) (gastos de caja y cierres), [02](../02-pos-catalog/02-pos-catalog.md) (ventas), [01](../01-super-admin-panel/01-super-admin-panel.md) (el informe mensual usa la misma lógica), [10](../10-users-roles/10-users-roles.md) (auditoría).

## 10. Interfaz

`.cc-sec`, `.cc-list`, `.cc-row/.cc-top/.cc-name/.cc-val/.cc-bar`, `.cc-more` (`details`), `.cc-scroll`, `.stats`, `.grid2`, `.tabla`.

## 11. Limitaciones conocidas

- La pantalla Gastos suma **todos** los gastos del mes (incluidos los de caja) leyendo `gastos_negocio`, mientras Contable toma los de caja desde los cierres: si se elimina un gasto de caja en Gastos, las dos pantallas dejan de coincidir.
- ~~`conceptos_gasto` sin sincronizar~~: corregido, ahora es tabla del negocio ([-02](../-02-corrections/-02-corrections.md)).
- Las dos agregaciones de "conceptos" del informe imprimible pueden repetir un mismo concepto (una vez de caja y otra del negocio).
- No hay edición de gastos (solo eliminar y volver a crear).

Ver [-01-to-review](../-01-to-review/-01-to-review.md).
