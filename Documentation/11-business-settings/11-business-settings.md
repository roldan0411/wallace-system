# 11 — Configuración del negocio

## 1. Propósito

Adaptar el mismo sistema a cada tipo de negocio: perfil inicial por rubro, ventanas habilitadas, forma de cobro, tipos de entrega, banderas de operación, vocabulario, identidad visual, facturación y sucursales. Hay dos niveles: lo que configura el **super-admin** (todo) y lo que ajusta el **propio negocio** en "Mi Negocio" (datos, apariencia y preferencias operativas).

## 2. Alcance

**Incluye**
- Perfiles por tipo (`PERFILES`).
- Configuración del super-admin por pestañas: Datos, Plan y vendedor, Cómo opera, Ventanas habilitadas, Sucursales.
- Plantilla de ventanas por plan.
- Mi Negocio (admin del negocio).
- Logo (redimensionado a 300 px), tema oscuro/claro y color principal.
- Vocabulario dinámico (Plato/Producto/Artículo/Servicio…).
- Sonidos.

**No incluye**
- Creación del negocio → [01](../01-super-admin-panel/01-super-admin-panel.md).
- Usuarios y permisos → [10](../10-users-roles/10-users-roles.md).

## 3. Perfiles por tipo (`PERFILES`, `dominio/negocio.js`)

| Tipo | Producto / Pedido / Personal | Mesas | Cocina | Recetas | Citas | Flujo | Entregas | Funciones extra |
|---|---|:-:|:-:|:-:|:-:|---|---|---|
| Restaurante | Plato / Pedido / Mesero | ✔ | ✔ | ✔ | | dos_pasos | mesa, llevar, domicilio | cocina, domicilios |
| Cafetería | Producto / Pedido / Mesero | ✔ | ✔ | ✔ | | dos_pasos | mesa, llevar, domicilio | cocina, domicilios |
| Tienda / Accesorios | Artículo / Venta / Vendedor | | | | | directo | llevar, domicilio, envio | domicilios |
| Barbería / Salón | Servicio / Cita / Profesional | | | | ✔ | directo | llevar | citas |
| Panadería | Producto / Pedido / Vendedor | | ✔ | ✔ | | directo | llevar, domicilio | domicilios |
| Ferretería | Producto / Venta / Vendedor | | | | | directo | llevar, domicilio, envio | domicilios |
| Logística / Bodega | Producto / Despacho / Operario | | | | | directo | entrega, despacho | sin caja ni dinero (`usaCaja:false`, `esLogistica:true`) |
| Otro | Producto / Pedido / Personal | | | | | directo | llevar, domicilio | — |

Todos incluyen `ventas, catalogo, clientes, inventario, reportes`; salvo Logística, también `caja, facturas, contable, gastosneg`.

## 4. Configuración del super-admin (`pantallaConfig`, `ui/configuracion/config-negocio.js`)

Se abre con "Configurar" en el panel. Cada pestaña guarda **solo sus campos** (`guardarConfig`, `ui/configuracion/config-negocio.js`, detecta qué campos existen en el DOM), así una pestaña no borra lo de otra.

### Datos del negocio
Nombre, tipo, NIT/cédula, teléfono, dirección, ciudad, eslogan, logo, tema (oscuro neón / claro), color principal, tamaño de factura (POS 80 mm / media hoja / hoja completa), recargo del datáfono (%).

### Plan y vendedor
Plan (Básico/Profesional/Empresarial), precio mensual, día de pago, estado (solo lectura), vendedor asignado, notas comerciales, historia del cliente (creación, antigüedad, usuarios, ventas registradas, facturado estimado) y botón de informe mensual.

### Cómo opera
- Flujo de cobro (`flujoPedido`): directo / dos pasos.
- Al editar un pedido cobrado (`ajusteCobro`): diferencia / total.
- Tipos de entrega (`tiposEntrega`): mesa, para llevar, domicilio, envío nacional (si no marca ninguno queda `llevar`).
- Banderas: `usaMesas`, `usaCocina`, `usaRecetas`, `usaCitas`, `usaCuentas`, `descontarAlPedir`, `usaPropina`, `usaDomicilios`, `esLogistica`, `usaClienteFijo`, `usaCodBarras`, `verificarBanco`, `sonidos`, `alertaStock`.
- Cliente y teléfono predeterminados (venta rápida).
- Vocabulario: producto (singular/plural), pedido/venta, personal.

### Ventanas habilitadas (`funciones`)
| Grupo | Clave → Ventana |
|---|---|
| Ventas y pedidos | `ventas` Nueva Venta · `facturas` Facturas e impresión |
| Catálogo e inventario | `catalogo` Menú/Inventario/Combos · `inventario` Control de stock y conteos |
| Dinero | `caja` Caja · `contable` Registro Contable · `gastosneg` Gastos |
| Operación | `cocina` KDS · `domicilios` Domicilios y cuadre · `citas` Agenda |
| Clientes y reportes | `clientes` · `reportes` |

Lo que se desmarca no lo ve nadie, ni el admin del negocio. Botones: marcar todo, quitar todo, aplicar plantilla del plan (`VENTANAS_POR_PLAN`, `dominio/negocio.js`):
- Básico: ventas, facturas, catalogo, inventario, caja, clientes.
- Profesional y Empresarial: todo lo anterior + cocina, domicilios, reportes, contable, gastosneg, citas.

### Sucursales
Lista editable de sedes (`agregarSucursal`, `quitarSucursal`, `ui/configuracion/config-negocio.js`/`6489`). Al agregar la primera se crea también "Principal". Si quedan ≤1, se borran todas (un solo punto de venta).

## 5. Mi Negocio (`minegocio`, `ui/configuracion/mi-negocio.js` / `guardarMiNegocio`, `ui/configuracion/mi-negocio.js`)

Para el admin del negocio (o quien tenga la pantalla `config`, p. ej. el dueño):
- Datos: nombre, NIT, teléfono, dirección, ciudad, eslogan.
- Logo (subir/quitar; `cargarLogo` reduce a 300 px de ancho y guarda PNG en base64; máx. 5 MB de archivo).
- Preferencias: tema, color, tamaño de factura, recargo del datáfono, modo de ajuste de cobro, **base fija del cajón** (`baseFija`).
- Casillas: sonidos, avisar stock agotado, avisar por vencer, **llevar control de inventario** (agrega/quita `inventario` de `funciones`), exigir verificar transferencias, cuentas abiertas, descontar al pedir.
- Días de aviso de vencimiento (`diasAvisoVence`, defecto 7).
- "🔊 Probar sonido".
Los cambios se guardan en el registro global del negocio y llegan a todos los equipos.

## 6. Tema (`aplicarTema`, `ui/nucleo/tema.js`)

- Solo dentro del negocio (login y panel super-admin usan la marca Wallace: `quitarTema`).
- `tema:'claro'` agrega `body.tema-claro`.
- Con `colorTema` calcula `--verde`, `--verde-c` (más oscuro en claro, más claro en oscuro), `--verde-o`, `--acc-rgb` y `--acc-txt` (texto oscuro si el color es claro). Si el color es casi blanco (luminancia > 0,82) lo oscurece 35 % para que se lea.

## 7. Vocabulario y sonidos

- `pProd(cap)`, `pProds`, `pPedido`, `pPedidos` (plural: vocal → +s, consonante → +es), `pPersonal` (`ui/nucleo/componentes.js`) devuelven la palabra configurada y se usan en todos los textos.
- Sonidos (Web Audio): `sonidoVenta` (dos campanas), `sonidoPedido` (tres), `sonidoAlerta` (dos pitidos), `sonidoError` (uno grave). Se apagan con `sonidos:false`.

## 8. Sucursales (`ui/nucleo/permisos.js`; reglas en `dominio/negocio.js`)

`sucursalesDe(neg)` (lista o `[Principal]`), `usaSucursales(neg)` (>1), `sucursalActual()`, `puedeVerSucursal(id)`, `cambiarSucursal(id)` (guarda en `ws_suc_<negId>`). En la vista del negocio aparece un selector 📍 en la barra superior y un aviso en Nueva Venta.

## 9. Catálogo de funciones

| Función | Archivo | Alcance | Quién | Qué hace |
|---|---|---|---|---|
| `usaInventario(neg)` | `ui/nucleo/permisos.js` | Servicio | Todo | Inventario activo. |
| `sucursalesDe` / `usaSucursales` / `sucursalActual` / `puedeVerSucursal` | 279–289 | Servicio | Vista de negocio | Sucursales. |
| `beep` / `campana` / `sonidosOn` / `sonido*` | 301–337 | Servicio | Todo | Sonidos. |
| `ic(n)` | `ui/nucleo/componentes.js` | Servicio | Todo | Ícono SVG de `ICONS`. |
| `pProd` / `pProds` / `pPedido` / `pPedidos` / `pPersonal` | 363–373 | Servicio | Todo | Vocabulario. |
| `configNegocio(id)` | `ui/configuracion/config-negocio.js` | Acción UI | Super-admin | Abre la configuración. |
| `cfgTab(t)` | `ui/configuracion/config-negocio.js` | Acción UI | Configuración | Cambia de pestaña. |
| `pantallaConfig(negId)` | `ui/configuracion/config-negocio.js` | Pantalla | Super-admin | Pestañas de configuración. |
| `aplicarPlantillaPlan(negId)` | `ui/configuracion/config-negocio.js` | Acción UI | Ventanas | Marca las del plan **guardado** del negocio (P8: antes siempre Profesional). |
| `aplicarVentanasDelPlan(negId)` | `ui/configuracion/config-negocio.js` | Acción UI | Pregunta al guardar | Al guardar un plan distinto se pregunta si se aplican sus ventanas (P8). |
| `guardarConfig(negId)` | `ui/configuracion/config-negocio.js` | Acción UI | Super-admin | Guarda la pestaña abierta. |
| `agregarSucursal` / `quitarSucursal` | 5918 / 5934 | Acción UI | Super-admin | Sedes. |
| `minegocio()` | `ui/configuracion/mi-negocio.js` | Pantalla | `minegocio` (permiso `config`) | Mi Negocio. |
| `cargarLogo(input)` / `quitarLogo()` | 6326 / 6351 | Acción UI | Configuración y Mi Negocio | Prepara el logo (se aplica al guardar). |
| `guardarMiNegocio()` | `ui/configuracion/mi-negocio.js` | Acción UI | Mi Negocio | Guarda preferencias. |
| `_hexRgb` / `_rgbHex` / `_aclarar` / `_oscurecer` | 7144–7156 | Interna | Tema | Utilidades de color. |
| `aplicarTema(neg)` / `quitarTema()` | 7157 / 7174 | Servicio | `render` | Aplica/quita el tema. |
| `vistaNegocio()` | `ui/nucleo/navegacion.js` | Pantalla | `render` | Layout del negocio: sidebar (logo o inicial, nombre, tipo, menú, usuario, estado de conexión), banner de supervisión, barra superior y contenido. |

## 10. Modelo de datos (campos de `negocios` configurables)

> Diccionario completo de todas las tablas (formatos, campos nuevos y viejos): [modelo-de-datos](../-03-architecture/modelo-de-datos.md).

`nombre, tipo, nit, tel, dir, ciudad, eslogan, logo, tema, colorTema, tipoFactura, pctDatafono, plan, precioMes, diaPago, vendedorId, vendedorNombre, notasComerciales, flujoPedido, ajusteCobro, tiposEntrega[], usaMesas, usaCocina, usaRecetas, usaCitas, usaCuentas, descontarAlPedir, usaPropina, usaDomicilios, esLogistica, usaCaja, usaClienteFijo, clienteFijoNombre, clienteFijoTel, usaCodBarras, verificarBanco, sonidos, alertaStock, alertaVence, diasAvisoVence, baseFija, palabraProducto, palabraProductos, palabraPedido, palabraPersonal, funciones[], sucursales[]{id,nombre}`.

## 11. Limitaciones conocidas

- **Sucursales incompletas**: la pantalla promete caja, pedidos y cierres separados por sede, pero las ventas, la caja y los cierres no se separan (`TABLAS_POR_SUCURSAL` no se usa); el selector solo cambia un indicador.
- Planes inconsistentes: Premium (al crear) vs. Empresarial (configuración); un negocio Premium no queda seleccionado en el selector.
- `usaCaja` se define en el perfil pero ninguna pantalla lo lee; lo que oculta la caja es `funciones`.
- Mi Negocio permite al admin del negocio volver a activar `inventario` aunque el super-admin lo haya quitado de las ventanas.
- El logo en base64 viaja dentro de la tabla global `negocios` que descargan todos los equipos.

Ver [-01-to-review](../-01-to-review/-01-to-review.md).
