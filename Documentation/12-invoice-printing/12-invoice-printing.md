# 12 — Facturas e impresión

## 1. Propósito

Generar los documentos impresos que entrega el negocio: factura de venta (o cuenta de cobro si aún no está pagada) en tres tamaños, remisión de entrega para logística, y ofrecer un **Centro de Impresión** para reimprimir lo de la caja actual. Comparte el mecanismo con las comandas ([04](../04-kitchen-kds/04-kitchen-kds.md)), los cierres ([03](../03-cash-register/03-cash-register.md)) y los informes ([08](../08-sales-reports/08-sales-reports.md), [09](../09-expenses-accounting/09-expenses-accounting.md), [01](../01-super-admin-panel/01-super-admin-panel.md)).

## 2. Alcance

**Incluye**
- Factura POS (tirilla 80 mm), media hoja y hoja completa.
- Cuenta de cobro ("*** COBRO PENDIENTE ***") para ventas abiertas.
- Remisión de entrega sin valores (logística).
- Pantalla Reimpresiones.
- Ofrecimiento de impresión al cobrar.

**No incluye**
- Facturación electrónica DIAN, resolución de facturación, impuestos (IVA/INC), CUFE ni QR. Los documentos son **no tributarios**.
- Impresión directa a impresora térmica (ESC/POS): se usa el diálogo del navegador.

## 3. Actores y permisos

| Acción | Control |
|---|---|
| Reimprimir factura desde Pedidos, Cuentas e Historial | Permiso `imprimir` |
| Pantalla Reimpresiones | Se habilita con la pantalla `pedidos`; dentro no valida `imprimir` |
| Ofrecer impresión al cobrar | Solo si `funciones` incluye `facturas` |

## 4. Configuración

- `tipoFactura`: `pos` (defecto), `media`, `carta` (en Configuración y Mi Negocio).
- Encabezado: `logo`, `nombre`, `eslogan`, `nit`, `dir`, `tel` del negocio.
- `esLogistica` o `v.esSalida` → remisión en lugar de factura (solo en formato POS).

## 5. Mecanismo de impresión

Todas las impresiones siguen el mismo patrón:
1. Generar HTML con estilos en línea (sin depender del CSS de la app).
2. `window.open('', '_blank', 'width=…')`; si el navegador lo bloquea: toast "Permite las ventanas emergentes para imprimir".
3. Escribir el documento con `@page` (80 mm × auto, carta con márgenes) y `print-color-adjust:exact`.
4. `setTimeout(() => w.print(), 400)`.

## 6. Documentos

### 6.1 Factura POS (`facturaPOS`, `ui/impresion/facturas.js`)
Ancho 72 mm. Logo, nombre, eslogan, NIT, dirección, teléfono; "FACTURA DE VENTA", número y tipo (MESA / DOMICILIO / PARA LLEVAR / ENVÍO NACIONAL); fecha, atendió, mesa y datos del cliente (`datosCliente`); ítems `qty × nombre` y valor; subtotal (bruto), descuento, domicilio/envío, propina, recargo; **TOTAL**; pagos por método y cambio (si está pagada) o recuadro "COBRO PENDIENTE"; observaciones; "¡GRACIAS POR SU COMPRA!" o "CUENTA DE COBRO"; pie "Software por WALLACE COMPANY SYSTEM".

### 6.2 Remisión de entrega (logística, dentro de `facturaPOS`)
"REMISIÓN DE ENTREGA · N° … (No es factura de venta · sin valor comercial)", fecha, despachó, cliente, tabla CANTIDAD/PRODUCTO, TOTAL UNIDADES, observaciones y línea de **firma de quien recibe**.

### 6.3 Media hoja (`facturaMedia`, `ui/impresion/facturas.js`)
Diseño con franjas azul marino (`#132d46`): título FACTURA, fecha/número/tipo, logo, datos del negocio y del cliente ("Consumidor final" si no hay), tabla CANT/CONCEPTO/PRECIO/IMPORTE con filas alternas, totales, observaciones y pie. Página carta con margen 10 mm.

### 6.4 Hoja completa (`facturaCarta`, `ui/impresion/facturas.js`)
Reutiliza la media hoja con letra 13 px y margen 14 mm. No muestra pagos ni cambio (tampoco la media hoja).

### 6.5 Centro de Impresión (`reimpresiones`, `ui/impresion/reimpresiones.js`)
Ventas no anuladas de la **jornada actual** (se reinicia al cerrar caja), más recientes primero, máximo 60, con búsqueda por factura, cliente o mesa. Botón "🧾 Factura" (pagada) o "🧾 Cuenta" (por cobrar) y, si hay cocina, "👨‍🍳" para la comanda.

### 6.6 Puntos donde se ofrece imprimir
| Momento | Documento |
|---|---|
| Cobrar (`abrirCobro`) | "¿Imprimir factura?" si `facturas` está habilitado |
| Registrar salida (logística) | "¿Imprimir remisión de entrega?" (siempre) |
| Cobrar entrega de cita | "¿Imprimir factura?" si `facturas` |
| Confirmar pedido / abrir cuenta / agregar a cuenta | Comanda automática si `usaCocina` |
| Cerrar caja | Tirilla de cierre automática |

## 7. Catálogo de funciones

| Función | Archivo | Alcance | Quién | Qué hace |
|---|---|---|---|---|
| `imprimirFactura(id)` | `ui/impresion/facturas.js` | Servicio / Acción UI | Cobros, Pedidos, Cuentas, Historial, Reimpresiones | Elige formato según `tipoFactura`, abre e imprime. |
| `datosCliente(v)` | `ui/impresion/facturas.js` | Interna | Facturas | Pares etiqueta/valor del cliente presentes. |
| `tipoTexto(t)` | `ui/impresion/facturas.js` | Interna | Facturas | Mesa / Domicilio / Para llevar / Envío nacional / Venta. |
| `facturaPOS(v,neg)` | `ui/impresion/facturas.js` | Interna | `imprimirFactura` | Tirilla de factura o remisión. |
| `facturaMedia(v,neg)` | `ui/impresion/facturas.js` | Interna | `imprimirFactura` | Media hoja. |
| `facturaCarta(v,neg)` | `ui/impresion/facturas.js` | Interna | `imprimirFactura` | Hoja completa. |
| `reimpresiones()` | `ui/impresion/reimpresiones.js` | Pantalla | `reimpresiones` | Centro de Impresión. |
| `imprimirComanda(v)` | `ui/cocina/comanda.js` | Servicio | Ver [04](../04-kitchen-kds/04-kitchen-kds.md) | Comanda de cocina. |
| `imprimirCierre(c)` | `ui/caja/caja.js` | Servicio | Ver [03](../03-cash-register/03-cash-register.md) | Tirilla de cierre. |
| `imprimirReporte()` / `imprimirContable()` / `imprimirReporteNegocio()` | 5470 / 5497 / 5799 | Acción UI | Ver [08](../08-sales-reports/08-sales-reports.md), [09](../09-expenses-accounting/09-expenses-accounting.md), [01](../01-super-admin-panel/01-super-admin-panel.md) | Informes en carta. |

## 8. Reglas

- Si la venta no está pagada, el documento es una **cuenta de cobro**, no una factura.
- El número impreso es el de la venta (`F-00001`), sin prefijo de resolución.
- Logística nunca imprime valores.

## 9. Limitaciones conocidas

- Documentos no válidos como factura electrónica en Colombia (no hay integración DIAN). Si el negocio está obligado a facturar electrónicamente, debe hacerlo por otro medio.
- Media hoja y hoja completa no muestran forma de pago, cambio ni el aviso de cobro pendiente; la remisión solo existe en formato POS.
- Los números de factura ya no se repiten entre equipos con conexión (reserva en la nube), pero puede haber saltos ([-02](../-02-corrections/-02-corrections.md)).
- Reimpresiones no filtra por permiso `imprimir`.

Ver [-01-to-review](../-01-to-review/-01-to-review.md).
