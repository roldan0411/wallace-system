# 04 — Cocina (KDS) y tiempos de entrega

## 1. Propósito

Pantalla de cocina (*Kitchen Display System*) para restaurantes, cafeterías y similares: muestra los pedidos por preparar ordenados por tiempo de espera, con cronómetro y colores, permite marcar su avance y genera las comandas impresas. Incluye la pantalla **Tiempos de Entrega**, que estima cuánto decirle al cliente.

## 2. Alcance

**Incluye**
- Ciclo de vida del pedido en cocina: `pendiente → preparando → listo → entregado`.
- Tarjetas con cronómetro y semáforo, sonido al entrar pedidos nuevos, refresco automático cada 30 s.
- Comanda de cocina en tirilla 80 mm (al confirmar, al editar, al agregar a cuentas, reimpresión).
- Tiempo estimado para el cliente y promedios por tipo de entrega.

**No incluye**
- Creación/edición del pedido → [02](../02-pos-catalog/02-pos-catalog.md).
- Descuento de insumos por receta → [06](../06-inventory-recipes/06-inventory-recipes.md).

## 3. Actores y permisos

| Elemento | Control |
|---|---|
| Pantalla `cocina` y `tiempos` | Rol `cocina` (pantallas `cocina`, `pedidos`) y admin. En el menú, Tiempos se habilita con el permiso de pantalla `cocina`. |
| Marcar estados | Cualquiera que vea la pantalla. |
| Reimprimir comanda desde Pedidos/Reimpresiones | Permiso `comanda` (admin, cajero, mesero, cocina). |

## 4. Configuración

Aparece si `funciones` incluye `cocina` **y** `usaCocina=true` (perfiles Restaurante, Cafetería, Panadería). Solo las ventas creadas mientras `usaCocina` está activo tienen `estadoCocina`.

## 5. Flujos

### 5.1 Entrada de pedidos
`armarVenta` pone `estadoCocina:'pendiente'` en negocios con cocina. Al confirmar un pedido, abrir una cuenta o agregar a una cuenta se imprime la comanda automáticamente.

### 5.2 Pantalla de cocina (`cocina`, `ui/cocina/cocina.js`)
1. Toma las ventas de la jornada no anuladas con `estadoCocina` distinto de `entregado`, ordenadas de la más antigua a la más nueva.
2. Si el número de pendientes/preparando aumentó respecto al último render, suena `sonidoPedido()`.
3. Sección **En preparación** (pendiente + preparando): tarjeta con factura, minutos de espera, tipo/mesa/cliente, dirección y teléfono si es domicilio, ítems con observaciones (⚠ en rojo), nota general y botones.
   - Semáforo: verde < 15 min, ámbar < 25 min, rojo ≥ 25 min.
4. Sección **Listos para entregar** con "✓ Entregado" y "← Volver" (a pendiente).
5. Un `setInterval` de 30 s (`ui/nucleo/arranque.js`) llama `refrescarSiSePuede()` cuando la pantalla activa es cocina, para que el cronómetro avance.

### 5.3 Cambiar estado (`marcarCocina`, `ui/cocina/cocina.js`)
| Estado | Marca de tiempo | Extra |
|---|---|---|
| `preparando` | `horaPreparando` (solo la primera vez) | — |
| `listo` | `horaListo` (solo la primera vez) | Suena |
| `entregado` | `horaEntregado` | Sale de la pantalla |
| `pendiente` | — | Vuelve a la cola |

En Pedidos, marcar el pedido como **Entregado** (`setEstadoPedido`) también pone `estadoCocina='entregado'`. Editar un pedido o agregar a una cuenta devuelve el estado a `pendiente` si no estaba entregado.

### 5.4 Comanda (`comandaHTML`, `ui/cocina/comanda.js` / `imprimirComanda`, `ui/cocina/comanda.js`)
Tirilla 80 mm en Courier: `*** COCINA ***`, número de factura grande, recuadro con MESA X / DOMICILIO / ENVÍO / PARA LLEVAR, datos de domicilio (cliente, dirección, barrio, teléfono, mensajero), fecha, ítems `qty x nombre` con observación por ítem, nota general y línea de corte. Se abre en ventana nueva y lanza `print()` a los 400 ms.
- Al agregar a una cuenta se imprime solo lo nuevo con la nota `AGREGADO A <cuenta>`.
- `reimprimirComanda(id)` (`ui/ventas/cobro.js`) valida el permiso `comanda`.

### 5.5 Tiempos de entrega (`tiempos`, `ui/cocina/tiempos.js`)
1. Toma todas las ventas con `fecha` y `horaListo`, calcula minutos de preparación y descarta valores ≤0 o ≥240.
2. **Promedio en vivo**: últimos 5 (si hay ≥3) o últimos 3.
3. **Estimado para el cliente**: promedio redondeado hacia arriba a múltiplos de 5, rango `estimado – estimado+10` min. Requiere al menos un dato; el texto pide 3 pedidos.
4. Aviso si hay ≥4 pedidos en cocina.
5. Promedio por tipo (mesa, llevar, domicilio; últimos 5 de cada uno) y últimos 10 pedidos (rojo >25, ámbar >15).

## 6. Modelo de datos (campos en `ventas`)

> Diccionario completo de todas las tablas (formatos, campos nuevos y viejos): [modelo-de-datos](../-03-architecture/modelo-de-datos.md).

`estadoCocina` (`''`/`pendiente`/`preparando`/`listo`/`entregado`), `horaPreparando`, `horaListo`, `horaEntregado`, `items[].obs`, `obs`, `tipo`, `mesa`, `cliNombre`, `cliDir`, `cliTel`, `domiciliario`.

## 7. Catálogo de funciones

| Función | Archivo | Alcance | Quién / permiso | Qué hace |
|---|---|---|---|---|
| `comandaHTML(v)` | `ui/cocina/comanda.js` | Interna | `imprimirComanda` | HTML de la comanda. |
| `imprimirComanda(v)` | `ui/cocina/comanda.js` | Servicio | Confirmar pedido, cuentas, edición, cocina | Abre e imprime la comanda. |
| `reimprimirComanda(id)` | `ui/ventas/cobro.js` | Acción UI | Permiso `comanda` | Reimpresión desde Pedidos/Reimpresiones. |
| `cocina()` | `ui/cocina/cocina.js` | Pantalla | Pantalla `cocina` | Tablero KDS. |
| `marcarCocina(id,estado)` | `ui/cocina/cocina.js` | Acción UI | Tarjetas KDS | Cambia estado y registra horas. |
| `tiempos()` | `ui/cocina/tiempos.js` | Pantalla | Pantalla `tiempos` | Estimados y promedios. |
| `sonidoPedido()` | `ui/nucleo/sonidos.js` | Servicio | Cocina, ventas | Campana de tres notas (respeta `sonidos`). |

## 8. Reglas

- La cocina ve solo la jornada actual.
- Los tiempos miden desde la creación del pedido (`fecha`) hasta `horaListo`, no desde "preparando".
- El sonido de pedido nuevo depende de que la pantalla se redibuje (sincronización o temporizador).

## 9. Interfaz

`.kds-grid`, `.kds-card` con `.krono-verde/.krono-amar/.krono-rojo`, `.kds-top`, `.kds-ref`, `.kds-krono`, `.kds-tipo`, `.kds-items/.kds-item`, `.kds-nota`, `.kds-acc`, `.stat-grande` (tiempo estimado).

## 10. Limitaciones conocidas

- `_ultimoCountCocina` es por equipo: si dos pantallas de cocina están abiertas, ambas suenan.
- La comanda se imprime en el equipo que confirma el pedido, no en uno dedicado a cocina.
- Tiempos usa todas las ventas históricas (no solo la jornada) y puede mezclar periodos.

Ver [-01-to-review](../-01-to-review/-01-to-review.md).

## Cambios del 2026-10-12
- **C3**: si la comanda no se puede imprimir, `imprimirComandaSegura` avisa ("reimprímela desde Pedidos") y el error queda en la auditoría. Antes se perdía en silencio y la cocina no se enteraba del pedido.
