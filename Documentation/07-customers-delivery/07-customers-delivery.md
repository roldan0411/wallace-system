# 07 — Clientes y domicilios

> **Cambios del 2026-10-08:** Domicilios reparte el valor del domicilio según el pago (también dividido), igual que el Cuadre (F4); las ventas guardan `domiciliarioId` y se agrupan por id (F15). Detalle en [-01-to-review](../-01-to-review/-01-to-review.md).

## 1. Propósito

Mantener la base de clientes del negocio (se alimenta sola con cada venta) para autocompletar pedidos, y controlar los domicilios: quién los entrega, cuánto cobró cada mensajero y cuánto debe entregar en el cajón.

## 2. Alcance

**Incluye**
- Registro automático de clientes al vender y gestión manual (crear, editar, eliminar).
- Autocompletado de clientes al tomar el pedido.
- Domiciliarios (alta y baja), asignación a pedidos, resumen de domicilios de la jornada.
- **Cuadre de domiciliarios** con pago dividido.

**No incluye**
- Historial de compras por cliente (solo totales acumulados), fidelización, crédito/cartera.
- Seguimiento en mapa o tiempos de domicilio (los tiempos de cocina están en [04](../04-kitchen-kds/04-kitchen-kds.md)).

## 3. Actores y permisos

- Pantalla `clientes`: admin, cajero, mesero, vendedor.
- Pantallas `domicilios` y `cuadredomi`: admin y cajero (`domicilios`).
- Las acciones de clientes y domiciliarios no tienen permiso de acción propio.

## 4. Configuración

- `funciones` incluye `clientes` → pantalla Clientes.
- `funciones` incluye `domicilios` → pantallas Domicilios y Cuadre Domi.
- `tiposEntrega` con `domicilio` / `envio` → campos del cliente en Nueva Venta.
- `usaDomicilios` → columnas y tarjetas de domicilio en Pedidos y Caja (por defecto: si `domicilio` está en `tiposEntrega`).

## 5. Flujos

### 5.1 Cliente automático (`guardarClienteAuto`, `ui/clientes/clientes.js`)
Se ejecuta al cobrar, registrar salida de logística y cobrar entrega de cita. Si la venta tiene nombre o teléfono:
1. Busca por teléfono exacto; si no, por nombre (sin distinguir mayúsculas).
2. Si existe: suma 1 a `pedidos`, suma `total` a `totalComprado`, actualiza nombre/teléfono/dirección/barrio/ciudad y `ultimoPedido`.
3. Si no existe: lo crea con `pedidos:1`.

Con **venta rápida** el cliente predeterminado (p. ej. "Consumidor Final / 0000000") también acumula como un cliente más.

### 5.2 Autocompletar (`sugerirClientes`, `ui/ventas/nueva-venta.js`)
Al escribir ≥2 caracteres en nombre o teléfono, muestra hasta 6 clientes que coinciden, ordenados por número de pedidos, con teléfono, dirección y pedidos. `elegirClienteSugerido` rellena nombre, teléfono, dirección, barrio, ciudad y departamento.

### 5.3 Pantalla Clientes (`clientes`, `ui/clientes/clientes.js`)
Indicadores (registrados y con compras, total comprado, cliente top) y tabla ordenada por pedidos, con búsqueda por nombre, teléfono o barrio. `editarCliente` (nombre*, teléfono, dirección, barrio, ciudad) y `eliminarCliente`.

### 5.4 Domiciliarios (`domicilios`, `ui/clientes/domicilios.js`)
- Indicadores de la jornada: número y valor de domicilios, cobrados en efectivo, entrados por banco.
- Tabla de domiciliarios con entregas y valor cobrado; alta (`editarDomiciliario`: nombre*, teléfono) y baja.
- Tabla de domicilios de la jornada con cómo entró el valor.
- Asignación: en Nueva Venta (selector) o en Pedidos (`asignarDomiciliario`, `ui/ventas/pedidos.js`, auditado).

### 5.5 Cuadre de domiciliarios (`cuadreDomi`, `ui/clientes/domicilios.js`)
Agrupa los domicilios **pagados** de la jornada por domiciliario (o "(sin asignar)") y, usando `reparte()` para respetar pagos divididos, calcula por cada uno:

```
Debe entregar en el cajón  = valor de los productos cobrado en efectivo
Se queda con               = domicilios cobrados en efectivo
ENTREGA NETA               = debe entregar − se queda con
Además se le paga del cajón = domicilios que entraron por banco/tarjeta
```

Totales generales: productos en efectivo, productos por banco, domicilios (efectivo y banco) y número de entregas.

## 6. Modelo de datos

> Diccionario completo de todas las tablas (formatos, campos nuevos y viejos): [modelo-de-datos](../-03-architecture/modelo-de-datos.md).

### `clientes`
`id`, `nombre`, `tel`, `dir`, `barrio`, `ciudad`, `pedidos`, `totalComprado`, `creado`, `ultimoPedido`. (Los demos crean además `total:0`.)

### `domiciliarios`
`id`, `nombre`, `tel`, `creado`.

### Campos de `ventas` usados
`tipo`, `valorDom`, `domiciliario`, `cliNombre`, `cliTel`, `cliDir`, `cliBarrio`, `cliCiudad`, `cliDepto`, `transportadora`, `pagos`, `subtotal`.

## 7. Catálogo de funciones

| Función | Archivo | Alcance | Quién | Qué hace |
|---|---|---|---|---|
| `sugerirClientes(texto)` | `ui/ventas/nueva-venta.js` | Acción UI | Campos nombre/teléfono | Muestra sugerencias. |
| `ocultarSugerenciasCliente()` | `ui/ventas/nueva-venta.js` | Acción UI | `onblur` | Oculta la lista. |
| `elegirClienteSugerido(id)` | `ui/ventas/nueva-venta.js` | Acción UI | Clic en sugerencia | Rellena los datos del pedido. |
| `asignarDomiciliario(id,nombre)` | `ui/ventas/pedidos.js` | Acción UI | Pedidos | Asigna mensajero y audita. |
| `guardarClienteAuto(venta)` | `ui/clientes/clientes.js` | Servicio | Cobro, salida, cita | Crea/actualiza cliente. |
| `clientes()` | `ui/clientes/clientes.js` | Pantalla | `clientes` | Lista de clientes. |
| `editarCliente(id)` / `eliminarCliente(id)` | 4634 / 4652 | Acción UI | Clientes | CRUD. |
| `cuadreDomi()` | `ui/clientes/domicilios.js` | Pantalla | `cuadredomi` | Cuadre por mensajero. |
| `domicilios()` | `ui/clientes/domicilios.js` | Pantalla | `domicilios` | Domiciliarios y domicilios de la jornada. |
| `editarDomiciliario()` / `eliminarDomiciliario(id)` | 4785 / 4797 | Acción UI | Domicilios | Alta/baja. |

## 8. Reglas

- Teléfono obligatorio en para llevar, domicilio y envío para que el cliente quede registrado.
- El valor del domicilio pertenece al domiciliario, no al negocio.
- El cuadre solo cuenta domicilios ya cobrados de la jornada actual.

## 9. Integración

[02](../02-pos-catalog/02-pos-catalog.md) (datos del cliente y pagos), [03](../03-cash-register/03-cash-register.md) (domicilios por banco salen del cajón: `tercerosNoEfectivo`), [10](../10-users-roles/10-users-roles.md) (auditoría de asignación).

## 10. Limitaciones conocidas

- La pantalla Domicilios clasifica "efectivo/banco" con `v.domPorBanco || v.metodo==='banco'`, sin respetar pagos divididos; el Cuadre sí los respeta, así que pueden mostrar cifras distintas.
- El texto de Clientes dice que se guardan "cuando cobras un domicilio o envío", pero se guardan con cualquier venta que tenga nombre o teléfono.
- El domiciliario se guarda por **nombre**; renombrarlo o tener dos con el mismo nombre rompe la relación.
- No hay edición de domiciliarios (el modal siempre crea uno nuevo).
- Las ediciones/eliminaciones de clientes no se auditan.

Ver [-01-to-review](../-01-to-review/-01-to-review.md).

## Pago al domiciliario (2026-10-12)

En el **Cuadre**, cada domiciliario con domicilios que entraron por banco tiene "💵 Pagarle $X del cajón". Requiere el permiso `abrircaja` o ser jefe, y la caja abierta. Queda como un **retiro** de la caja (`pagoDomi` = su clave en el cuadre), así el cierre cuadra. La tarjeta muestra lo ya pagado y "✓ Pagado"; no deja pagar dos veces lo mismo (`Dominio.caja.pagadoADomiciliario`). Antes la pantalla decía "se le deben pagar…" pero no había cómo registrarlo.
