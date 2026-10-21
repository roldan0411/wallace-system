# 05 — Agenda: citas, turnos y apartados

> **Cambios del 2026-10-08:** los apartados pasan por el motor de inventario (Movimientos y Auditoría, F8) y la entrega se cobra con el cobro normal: pago dividido, caja abierta obligatoria y permiso `cobrar` (F9, F10). Detalle en [-01-to-review](../-01-to-review/-01-to-review.md).

## 1. Propósito

Agendar citas o turnos (barberías, salones, veterinarias) y entregas programadas (apartar productos para que un cliente los recoja). Si el negocio lleva inventario, los productos apartados se reservan restándolos del stock y, al entregarse, se cobran como una venta normal.

## 2. Alcance

**Incluye**
- Lista de agendamientos ordenada por fecha y hora, con estado.
- Crear agendamiento: cliente, teléfono, fecha, hora, detalle (servicio), encargado.
- Apartar productos con stock (opcional) y reservarlos.
- Marcar atendida/entregada (cobrando lo apartado), no se recogió (devuelve stock), cancelada, eliminar.

**No incluye**
- Agenda por profesional, disponibilidad de horarios, recordatorios o choques de horario.
- Cobro de servicios sin productos apartados (se cobran desde Nueva Venta).

## 3. Actores y permisos

Pantalla `citas` ("Agendar"). No está en las pantallas por defecto de ningún rol salvo admin; el jefe puede habilitarla por usuario. Las acciones no tienen permiso propio.

## 4. Configuración

Visible si `funciones` incluye `citas` **y** `usaCitas=true` (perfil Barbería / Salón). Los apartados solo aparecen si `funciones` incluye `inventario`. Si `palabraProducto==='Servicio'`, el campo detalle se llama "Servicio" y propone "Corte".

## 5. Flujos

### 5.1 Pantalla (`citas`, `ui/citas/citas.js`)
Indicadores: agendado hoy, pendientes, productos apartados (o total agendado si no hay inventario). Tabla: fecha y hora, cliente/teléfono, detalle, apartado (con estado Reservado / Entregado / Entregado y cobrado / Devuelto al stock), encargado, estado y acciones.

### 5.2 Crear (`nuevaCita`, `ui/citas/citas.js`)
1. Modal con los datos y, si hay inventario, editor de apartados (`apartadoEditorHTML`): seleccionar producto con stock, cantidad, "+ Apartar". No deja apartar más que el stock.
2. Al guardar revalida el stock de todo lo apartado.
3. Crea la cita `pendiente` con `fechaHora = fecha + 'T' + hora + ':00'`.
4. Si hay apartados, `descontarApartado` resta del stock (usando lotes FEFO si aplica) y marca `stockDescontado:true`.

### 5.3 Cambiar estado (`marcarCita`, `ui/citas/citas.js`)
| Acción | Condición | Efecto |
|---|---|---|
| ✓ / ✓ Entregado | Sin apartados | `estado:'atendida'`, `cerrada` |
| ✓ Entregado | Con apartados y sin venta | Abre `cobrarCitaEntregada` |
| ↩ No se recogió | Con apartados | Devuelve el stock, `estado:'no_recogio'` |
| ✕ Cancelar | Sin apartados | `estado:'cancelada'` (si tuviera apartados descontados, también los devuelve) |

### 5.4 Cobrar la entrega (`cobrarCitaEntregada`, `ui/citas/citas.js`)
1. Modal con los ítems apartados, total y método de pago (efectivo/banco/tarjeta; un solo método).
2. Crea una venta `pagada`: factura consecutiva, `tipo:'llevar'`, `cajaId` de la caja abierta (o `null`), `jornada` actual, `obs:'Entrega de agendamiento · …'`, `origenCita`.
3. **No** llama `descontarStock` (el stock ya salió al apartar).
4. Registra el cliente (`guardarClienteAuto`), marca la cita `atendida` con `ventaId` y ofrece imprimir factura.

### 5.5 Eliminar (`eliminarCita`, `ui/citas/citas.js`)
Si tenía apartados descontados y no se convirtió en venta, los devuelve al stock antes de borrar.

## 6. Modelo de datos — `citas` (`data_<neg>_citas`)

> Diccionario completo de todas las tablas (formatos, campos nuevos y viejos): [modelo-de-datos](../-03-architecture/modelo-de-datos.md).

| Campo | Descripción |
|---|---|
| `id`, `creado`, `por` | Identificación y autor |
| `cliente`, `tel` | Cliente |
| `fechaHora` (`AAAA-MM-DDTHH:MM:00`, hora local sin zona) | Momento agendado |
| `detalle`, `encargado` | Servicio/detalle y responsable |
| `apartados[]` `{prodId, nombre, cantidad, precio}` | Productos reservados (precio al momento de apartar) |
| `stockDescontado` | `true` mientras lo apartado está fuera del stock |
| `estado` | `pendiente` / `atendida` / `no_recogio` / `cancelada` |
| `cerrada`, `ventaId` | Cierre y venta generada |

## 7. Catálogo de funciones

| Función | Archivo | Alcance | Quién | Qué hace |
|---|---|---|---|---|
| `citas()` | `ui/citas/citas.js` | Pantalla | Pantalla `citas` | Lista y estadísticas. |
| `nuevaCita()` | `ui/citas/citas.js` | Acción UI | Botón "+ Nuevo agendamiento" | Crea la cita y aparta stock. |
| `apartadoEditorHTML()` / `apartadoFilasHTML()` | 6578 / 6598 | Interna | Modal | Editor de apartados. |
| `agregarProdApartado()` / `quitarProdApartado(idx)` | 6606 / 6620 | Acción UI | Modal | Edita la lista temporal `_apartTmp`. |
| `descontarApartado(apartados)` | `ui/citas/citas.js` | Servicio | Crear cita | Resta stock (lotes FEFO). |
| `devolverApartado(apartados)` | `ui/citas/citas.js` | Servicio | No se recogió, cancelar, eliminar | Devuelve stock. |
| `marcarCita(id,estado)` | `ui/citas/citas.js` | Acción UI | Botones de la tabla | Cambia el estado. |
| `cobrarCitaEntregada(cita)` | `ui/citas/citas.js` | Interna | `marcarCita` | Cobra y crea la venta. |
| `eliminarCita(id)` | `ui/citas/citas.js` | Acción UI | Botón 🗑 | Borra y devuelve stock si aplica. |

## 8. Reglas

- Lo apartado sale del stock al agendar, no al entregar.
- La venta de una entrega no vuelve a descontar inventario.
- Una cita con venta generada no devuelve stock al eliminarse.

## 9. Integración

Inventario ([06](../06-inventory-recipes/06-inventory-recipes.md)) para descontar/devolver (lotes); Ventas ([02](../02-pos-catalog/02-pos-catalog.md)) y Caja ([03](../03-cash-register/03-cash-register.md)) al cobrar; Clientes ([07](../07-customers-delivery/07-customers-delivery.md)); Impresión ([12](../12-invoice-printing/12-invoice-printing.md)).

## 10. Limitaciones conocidas

- Los movimientos de apartar/devolver **no** quedan en la tabla `movimientos` ni en auditoría (a diferencia del resto del inventario), y no usan el motor `moverInventario`.
- El cobro de la entrega no usa el modal de pago dividido ni valida que haya caja abierta.
- El título del modal de cobro escapa el nombre dos veces (`escapeHtml` antes de `abrirModal`), por lo que caracteres como `&` se ven como `&amp;`.
- No hay validación de horarios ocupados ni vista de calendario.

Ver [-01-to-review](../-01-to-review/-01-to-review.md).

## Cambios del 2026-10-12
- **F22**: anular la venta de una entrega devuelve la cita a **pendiente**, sin `ventaId`. Si la anulación devolvió los apartados, quedan sin apartar (al cobrarla otra vez se descuentan).

## Editar una cita (2026-10-12)

Las citas **pendientes** tienen ✏️ (`editarCita`): cliente, teléfono, fecha, hora, detalle, encargado y productos apartados. Si cambian los apartados, el inventario se ajusta **solo por la diferencia** (`Dominio.inventario.difApartados`), con movimiento "Cambio de apartado"; lo de más tiene que alcanzar. Queda en la auditoría ("Editó cita").

La **entrega** de una cita toma el número de factura al confirmar el cobro (si se cancela, no gasta uno). Los apartados que sí se descontaron se devuelven aunque después se apague el inventario.
