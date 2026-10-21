# 06 — Inventario, lotes, insumos, recetas y conteo

> **Cambios del 2026-10-08:** editar el stock de un producto o insumo aplica la diferencia con transacción y deja movimiento `ajuste` y auditoría (F11); los productos tienen **costo** y el inventario y el conteo se valoran a costo (F14); el buscador del Conteo filtra al escribir (F3); el texto de la receta vacía ya se interpola (F5). Detalle en [-01-to-review](../-01-to-review/-01-to-review.md).

## 1. Propósito

Mantener las existencias correctas: un único **motor de inventario** por el que pasan ventas, anulaciones, ediciones, mermas y ajustes; control por **lotes con vencimiento (FEFO)**; inventario de **insumos** de restaurante descontados por **receta**; y **conteo físico** periódico para detectar faltantes.

## 2. Alcance

**Incluye**
- Pantalla Inventario (tiendas) o Menú (restaurantes) con indicadores y alertas.
- Entradas, salidas sin venta (daño, vencido, consumo interno, cortesía, faltante) y movimientos.
- Lotes con fecha de vencimiento, salida FEFO, alertas y retiro de lotes.
- Insumos con unidad, costo, mínimo, entradas.
- Recetas por plato.
- Conteo de inventario con diferencias valorizadas y ajuste opcional.
- Alertas de stock bajo/agotado al vender.

**No incluye**
- Alta/edición de productos y combos (formulario compartido) → [02](../02-pos-catalog/02-pos-catalog.md).
- Compras a proveedores, costos promedio, órdenes de compra.

## 3. Actores y permisos

| Acción | Permiso | Roles por defecto |
|---|---|---|
| Crear/editar/borrar productos e insumos | `editarprod` | admin, dueño |
| Entradas, salidas, lotes, ajuste por conteo | `editarstock` | admin, dueño (el cajero **no** toca stock a propósito) |
| Hacer conteo (sin ajustar) | `conteo` | admin, dueño |

Pantallas: `catalogo` agrupa Inventario/Menú, Insumos, Combos y Conteo en el menú.

## 4. Configuración

| Bandera | Efecto |
|---|---|
| `funciones` incluye `inventario` (`usaInventario()`) | Activa el control de existencias. Sin ella no se pide stock, no se descuenta ni hay alertas. El admin puede encenderla/apagarla en Mi Negocio. |
| `usaRecetas` | Modo restaurante: el plato no tiene stock propio; se descuentan insumos por receta. Aparece la pantalla Insumos. |
| `alertaStock` | Modal de alerta al vender si algo queda bajo o agotado. |
| `alertaVence`, `diasAvisoVence` (defecto 7) | Alertas de vencimiento al entrar a Inventario. |
| `descontarAlPedir` | Momento del descuento (ver [02](../02-pos-catalog/02-pos-catalog.md)). |

## 5. Motor de inventario (`ui/inventario/motor.js`)

Toda variación de stock por ventas pasa por aquí:

1. **`requerimientos(items)`** convierte ítems vendidos en unidades reales: `{prod:{id:cant}, ins:{id:cant}}`.
   - Combo → suma sus componentes con stock.
   - Plato con receta (y negocio con recetas) → suma insumos.
   - Producto con `stock!=null` → suma el producto.
2. **`difRequerimientos(antes, después)`** obtiene el delta al editar un pedido.
3. **`faltantesPara(req)`** valida que alcance y devuelve mensajes "X (piden N, hay M)".
4. **`moverInventario(req, signo, motivo, registra)`** aplica el cambio: con lotes descuenta FEFO o reingresa; nunca deja stock negativo; si `registra`, crea movimientos (`salida`/`entrada`/`salida-insumo`/`entrada-insumo`) con `registrarMovimientos`; devuelve los que se agotaron.
5. **`cambiarStock(tabla, id, fn)`**: todo cambio de existencias se aplica en el equipo y además dentro de una **transacción** de Firebase sobre el registro, que lo reaplica sobre el valor real del servidor. Así dos equipos vendiendo a la vez no se pisan ([-02](../-02-corrections/-02-corrections.md)).

Operaciones de ventas:

| Operación | Función | Registra movimiento | Marca |
|---|---|---|---|
| Vender | `descontarStock(venta)` (`ui/inventario/motor.js`) | No (la venta es el registro) | `stockAplicado=true`; no repite |
| Anular / eliminar / cancelar cuenta | `devolverStock(venta, motivo)` (`ui/inventario/motor.js`) | Sí | `stockAplicado=false`; no repite |
| Editar | `ajustarStockPorEdicion(antes, después, factura)` (`ui/inventario/motor.js`) | Sí | — |

`avisarStockBajo(venta)` (`ui/inventario/motor.js`) revisa los productos e insumos de la venta y abre un modal "SE AGOTARON / QUEDAN POCOS" con sonido de alerta.

## 6. Flujos

### 6.1 Pantalla Inventario (`inventario`, `ui/inventario/catalogo.js`)
- **Modo restaurante** (`usaRecetas`): menú de platos con indicadores (platos, con receta, insumos), filtro por categoría, tarjetas con cantidad de insumos de la receta y botones "Receta" y "×".
- **Modo normal**: indicadores (productos y unidades, valor a precio de venta, quedan pocos, agotados o lotes con alerta), últimos 8 movimientos, alertas de stock y vencimiento, tarjetas con insignias AGOTADO / SIN STOCK / POCOS, píldora del lote más próximo a vencer y botones "+ Stock", "− Salida", "📦 Lotes", "Agotado" / "✓ Disponible", "Editar", "×".
- **Agotado** (`alternarAgotado`, permiso `editarprod`): oculta el producto de Nueva Venta **sin tocar el stock** (p. ej. se acabó el plato del día) y deja una línea en la auditoría. El mismo botón lo vuelve a ofrecer.
- **Foto** (formulario del producto, "📷 Foto" / "Quitar"): `reducirImagen` (`ui/nucleo/componentes.js`) la lleva a 200 px JPEG y se guarda en `imagen`. Todas las pantallas la dibujan con `fotoProducto(p)`, que solo acepta una imagen `data:` válida (`Dominio.inventario.imagenValida`, máx. ~60 KB); si no, muestra el ícono.
- Los combos no aparecen aquí (van en Menú y Combos).

### 6.2 Entrada de stock (`entradaStock`, `ui/inventario/catalogo.js`)
Cantidad, motivo (defecto "Compra") y fecha de vencimiento opcional. Si el producto no usaba lotes y se da fecha, se activa `usaLotes` y el stock previo pasa a un lote sin fecha. Registra movimiento `entrada`.

### 6.3 Salida sin venta (`salidaStock`, `ui/inventario/catalogo.js`)
Cantidad (≤ stock), motivo de una lista y detalle. Usa `moverInventario` con registro. Audita "Salida de inventario".

### 6.4 Lotes (FEFO)
- Estructura `p.lotes=[{id, cantidad, vence:'AAAA-MM-DD'|'' , ingresado, motivo}]`; `p.stock` = suma de lotes.
- `ordenarLotes`: primero el que vence antes; sin fecha al final.
- `descontarDeLotes`: saca del más próximo a vencer y elimina lotes en 0.
- `reingresarALotes`: devuelve al más próximo a vencer (o crea uno sin fecha).
- `lotesAlerta()`: lotes con cantidad > 0 que vencen dentro de `diasAvisoVence` o ya vencieron.
- `avisarVencimientos()` (al entrar a Inventario/Catálogo con `irA`): modal "YA VENCIERON / POR VENCER", con sonido si hay vencidos.
- `verLotes(id)` y `retirarLote(prodId, loteId)`: ver y sacar un lote completo (movimiento `retiro_lote`).

### 6.5 Insumos (`pantallaInsumos`, `ui/inventario/insumos.js`)
Indicadores (insumos, valor en bodega a costo, quedan pocos, agotados), alertas y tabla con existencias, unidad, costo, mínimo. `editarInsumo` (nombre*, unidad, existencias, costo, mínimo), `entradaInsumo` (movimiento `entrada-insumo`), `eliminarInsumo` (avisa cuántos platos lo usan y lo quita de sus recetas).

### 6.6 Recetas
En el modal del plato (`recetaEditorHTML`): seleccionar insumo + cantidad por plato, "+ Añadir" (si ya existe, actualiza la cantidad), quitar. Se guardan solo filas con insumo y cantidad > 0. Al agregar al carrito se valida que los insumos alcancen; al vender se descuentan por el motor.

### 6.7 Conteo físico (`conteo`, `ui/inventario/conteo.js`)
1. Pantalla normal: alerta si nunca se ha contado o el último fue hace ≥7 días; indicadores (para contar, último conteo, faltante y sobrante del último en dinero); historial con detalle (`verConteo`).
2. `iniciarConteo()` arma la lista (`itemsParaContar`): productos con stock e insumos (si hay recetas), con existencias del sistema y costo (para productos, el **precio de venta**; para insumos, el costo).
3. Se escribe lo contado por fila (`contarItem`) sin redibujar; la diferencia y los totales se pintan al momento. "✓ Lo demás está igual" completa lo vacío con lo del sistema.
4. `guardarConteo(false)`: solo deja el registro. `guardarConteo(true)` (requiere `editarstock`, con confirmación): aplica la **diferencia** contada (contado − sistema al iniciar el conteo; si alguien vendió mientras se contaba, esa venta no se pierde), respetando lotes; crea movimientos `ajuste` con `conteoId` y audita.

## 7. Modelo de datos

> Diccionario completo de todas las tablas (formatos, campos nuevos y viejos): [modelo-de-datos](../-03-architecture/modelo-de-datos.md).

### `productos` (campos de inventario)
`stock` (`null` = no lleva inventario), `stockMin`, `usaLotes`, `lotes[]`, `receta[]{insumoId, cantidad}`, `esCombo`, `componentes[]{prodId, cantidad}`, `agotado` (bandera manual; botón en la tarjeta), `imagen` (foto `data:` JPEG de 200 px o vacío).

### `insumos`
`id`, `nombre`, `unidad`, `stock`, `costo`, `stockMin`, `creado`.

### `movimientos`
`id`, `productoId` o `insumoId`, `nombre`, `tipo` (`entrada`, `salida`, `entrada-insumo`, `salida-insumo`, `ajuste`, `retiro_lote`), `cantidad` (en `ajuste` con signo), `motivo`, `por`, `fecha`, `conteoId?`.

### `conteos`
`id`, `fecha`, `por`, `rol`, `items[]{tipo, id, nombre, unidad, sistema, contado, dif, costo}`, `revisados`, `totalItems`, `cuadran`, `faltantes`, `sobrantes`, `valorFalta`, `valorSobra`, `ajustado`.

## 8. Catálogo de funciones

| Función | Archivo | Alcance | Quién / permiso | Qué hace |
|---|---|---|---|---|
| `usaInventario(neg)` | `ui/nucleo/permisos.js` | Servicio | Todo | ¿El negocio lleva existencias? |
| `ordenarLotes` / `sumaLotes` / `descontarDeLotes` / `reingresarALotes` | dominio/inventario.js:11 | Servicio | Motor, citas, conteo | Lógica FEFO. |
| `diasHasta(f)` / `diasAvisoVence()` / `lotesAlerta()` / `fmtSoloFecha(f)` | dominio/fechas.js:32 | Servicio | Inventario | Vencimientos. |
| `avisarVencimientos()` | `ui/inventario/motor.js` | Servicio | `irA('inventario'|'catalogo')` | Modal de alertas de vencimiento. |
| `requerimientos(items)` | `ui/inventario/motor.js` | Servicio | Ventas | Unidades reales a mover. |
| `difRequerimientos(a,b)` | dominio/inventario.js:133 | Servicio | Edición | Delta de unidades. |
| `moverInventario(req,signo,motivo,registra)` | `ui/inventario/motor.js` | Servicio | Todo movimiento | Aplica el cambio. |
| `faltantesPara(req)` | `ui/inventario/motor.js` | Servicio | Ventas | Validación de existencias. |
| `descontarStock(v)` / `devolverStock(v,m)` / `ajustarStockPorEdicion(a,b,f)` | 2906–2922 | Servicio | [02](../02-pos-catalog/02-pos-catalog.md) | Operaciones de venta. |
| `avisarStockBajo(v)` | `ui/inventario/motor.js` | Servicio | Cobro, salida | Alerta de stock. |
| `inventario()` | `ui/inventario/catalogo.js` | Pantalla | `inventario` | Inventario/Menú. |
| `recetaEditorHTML` / `recetaFilasHTML` / `agregarInsumoReceta` / `quitarInsumoReceta` | 3841–3884 | Interna / Acción UI | `editarprod` | Editor de recetas. |
| `salidaStock(id)` | `ui/inventario/catalogo.js` | Acción UI | `editarstock` | Salida sin venta. |
| `entradaStock(id)` | `ui/inventario/catalogo.js` | Acción UI | `editarstock` | Entrada (con lote opcional). |
| `lotesDetalleHTML(p)` / `verLotes(id)` / `retirarLote(p,l)` | 3966–4010 | Interna / Acción UI | `editarstock` para retirar | Lotes. |
| `pantallaInsumos()` | `ui/inventario/insumos.js` | Pantalla | `insumos` | Insumos. |
| `editarInsumo` / `eliminarInsumo` / `entradaInsumo` | 4260–4300 | Acción UI | `editarprod` / `editarstock` | CRUD y entradas de insumos. |
| `diasDesde` / `itemsParaContar` | dominio/fechas.js:39 | Interna | Conteo | Utilidades. |
| `iniciarConteo` / `cancelarConteo` / `contarItem` / `conteoTodoBien` / `guardarConteo` | 4345–4416 | Acción UI | `conteo` / `editarstock` | Proceso de conteo. |
| `difDe` / `pintarFilaConteo` / `resumenConteo` / `pintarTotalesConteo` | 4366–4394 | Interna | Conteo | Cálculo y pintado sin redibujar. |
| `verConteo(id)` | `ui/inventario/conteo.js` | Acción UI | Historial | Detalle de un conteo. |
| `conteo()` | `ui/inventario/conteo.js` | Pantalla | `conteo` | Historial o conteo en curso. |

## 9. Reglas

- Nunca stock negativo.
- Toda salida/entrada fuera de una venta deja movimiento; las ventas no (se ven en Pedidos/Historial).
- Al vender se saca primero lo que vence antes.
- El cajero no edita stock por defecto (control antifraude).

## 10. Integración

[02](../02-pos-catalog/02-pos-catalog.md) (ventas, combos, edición), [05](../05-appointments-shifts/05-appointments-shifts.md) (apartados), [10](../10-users-roles/10-users-roles.md) (auditoría), [11](../11-business-settings/11-business-settings.md) (banderas).

## 11. Interfaz

`.prods.inv`, `.prod.off`, `.badge-off(.amarillo)`, `.prod-stock(.poco/.sin)`, `.prod-acc`, `.tarjeta.alerta`, `.tarjeta-pend`, `.tabla-cards` (conteo), `.pill-*`.

## 12. Limitaciones conocidas

- En el editor de recetas, el texto vacío muestra literalmente `${pProd()}` (plantilla dentro de comillas simples, `recetaFilasHTML` en `ui/inventario/catalogo.js`).
- Editar un producto cambia `stock` sin movimiento ni auditoría.
- `entradaStock`, `entradaInsumo` y `retirarLote` no auditan; tampoco los apartados de citas.
- El valor del inventario y de las diferencias del conteo de productos se calcula a **precio de venta**, no a costo.
- ~~Stock como valor absoluto~~: corregido con `cambiarStock` ([-02](../-02-corrections/-02-corrections.md)); editar el producto desde su formulario sí fija el valor.
- El buscador del conteo en curso no filtra al escribir (no redibuja).

Ver [-01-to-review](../-01-to-review/-01-to-review.md).

## Cambios del 2026-10-12
- **D8**: en el conteo físico, cada ítem se compara con el stock del momento en que se escribe su cantidad. Lo vendido mientras se cuenta ya no se resta dos veces.

## Inventario apagado después de vender (2026-10-12)

`moverInventario(req, signo, motivo, registra, forzar)`: con `forzar`, mueve aunque el negocio haya apagado el inventario. `devolverStock` lo usa cuando la venta **sí** descontó (`stockAplicado===true`): anular o cancelar una cuenta devuelve lo vendido y la venta queda `stockAplicado:false` (antes no volvía nada y quedaba "descontada" para siempre). Igual con los apartados de citas.

## Importar desde Excel o CSV (pendiente)

Hoy los productos se crean uno por uno. Está diseñada la importación en lote: plantilla CSV, vista previa con errores fila por fila, decidir qué hacer con los que ya existen, y al confirmar se crean con movimiento de "Inventario inicial (importado)" y auditoría. Detalle: [importar-inventario](../-03-architecture/importar-inventario.md).
