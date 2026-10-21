# Números de factura sin conexión

> Diseño del 2026-10-12 para el riesgo residual de D1 (*un equipo sin conexión desde el arranque puede repetir un número de factura*). **Aplicado el mismo día**: ver la sección 7.

## 1. Cómo funcionaba antes

- `src/dominio/facturas.js` → `elegirNumero(reservada, local, seq)`:
  - con conexión, cada equipo **reserva** su próximo número con una transacción sobre `data_<negocio>_factura_seq` (`reservarFactura`, `ui/ventas/nueva-venta.js`);
  - sin reserva, usa "el mayor número que conozco + 1".
- **El hueco**: dos equipos que arrancan sin internet (o uno que se queda sin internet varias ventas seguidas) conocen el mismo "mayor número" y emiten el mismo `F-00124`.
- Con conexión no hay repetidos. Ya puede haber **saltos**: un equipo que se cierra con un número reservado y sin usar.

## 2. Opciones

| Opción | Cómo | A favor | En contra |
|---|---|---|---|
| A. Bloques por equipo | Con conexión, cada equipo reserva un **bloque** (p. ej. 20 números) en una sola transacción y los gasta sin internet | Números normales, consecutivos dentro del bloque, únicos por construcción | Si el equipo pasa mucho tiempo sin internet, el bloque se acaba; los números que no use quedan como saltos |
| B. Prefijo por equipo | Cada equipo tiene un código corto (A, B, C…) y numera sin conexión con él: `F-B-0007` | Nunca se repite, aunque el equipo **nunca** se haya conectado | Dos series en los reportes; hay que explicar el prefijo |
| C. Número provisional y definitivo | Sin conexión: `P-…` provisional; al reconectar se le asigna el definitivo | La serie definitiva queda sin repetidos ni prefijos | El tiquete impreso tiene el provisional (hay que reimprimir o aceptar las dos referencias) |
| D. Solo detectar | Aviso en el panel y en Historial cuando dos ventas tienen el mismo número | Muy simple | No lo evita |

## 3. Propuesta: A + C + D

1. **Bloque reservado** (opción A), la forma normal:
   - al entrar al negocio con conexión, el equipo reserva un bloque: `factura_seq += 20` en una transacción, y guarda `{desde, hasta, siguiente}` en el equipo (`localStorage`, por negocio);
   - cada venta toma el siguiente del bloque, con o sin internet;
   - cuando quedan menos de 5 y hay conexión, reserva otro bloque.

   Con esto, un equipo que se cae a media jornada sigue numerando sin riesgo durante 20 ventas.
2. **Provisional** (opción C), solo si no hay bloque: el equipo nunca se conectó o se le acabó sin internet.
   - La venta sale con `P-<equipo>-<n>`: código del equipo al azar, 4 letras, guardado en el equipo. Queda marcada con `facturaProvisional: true`.
   - El tiquete dice "Número provisional".
   - Al reconectar, la app le asigna a cada provisional un número definitivo de un bloque nuevo y conserva el provisional (`facturaProvisional`) para buscarla.
   - Deja una línea en la auditoría y una lista "Reimprimir con el número definitivo" en Reimpresiones.
3. **Detector** (opción D), como red de seguridad para lo viejo: un aviso en el panel y en Historial si dos ventas comparten número (p. ej. datos de antes del cambio).

**Por qué no solo el prefijo (B)**: deja dos series para siempre. Con bloques, el caso sin conexión es raro, y el provisional cubre el resto sin ensuciar la numeración definitiva.

## 4. Dónde va cada cosa

| Pieza | Archivo |
|---|---|
| Reglas puras: `tomarDelBloque(bloque)`, `necesitaBloque(bloque, minimo)`, `numeroProvisional(equipo, n)`, `esProvisional(factura)`, `repetidas(ventas)` | `src/dominio/facturas.js` (+ pruebas) |
| Reservar un bloque: `reservarBloque(negId, tamaño)` (transacción que suma `tamaño`) | Puerto `datos.js` + `firebase-datos.js` |
| Bloque y código de equipo guardados en el equipo | `ui/ventas/nueva-venta.js` (`siguienteFactura`, `reservarFactura`) |
| Asignar definitivos al reconectar | Gancho de conexión del adaptador → interfaz (transacción por venta, D9) |
| Aviso de repetidos | Panel (R1) e Historial |

## 5. Pruebas

- Dominio: bloques, provisionales y detector.
- Integración contra el emulador: dos equipos reservan bloques a la vez y no se pisan.
- Recorrido:
  - sin conexión, se vende con el bloque;
  - sin bloque, sale un provisional;
  - al "reconectar", recibe un definitivo y no se repite ninguno.

## 6. Si el negocio factura ante la DIAN

La numeración legal la da la **resolución de numeración**: prefijo y rango autorizados, normalmente **por punto de venta**. Este diseño encaja: el bloque saldría del rango autorizado de esa caja y el prefijo sería el de la resolución. Si se llega a facturación electrónica, el número lo valida el proveedor tecnológico y el provisional no debería imprimirse como factura. Revisarlo con el contador antes de usarlo para eso.

## 7. Lo aplicado (2026-10-12)

Se aplicó la propuesta de la sección 3. Para el provisional se usó un número **por fecha y hora** (más el código del equipo), que no se repite y dice cuándo se hizo la venta.

| Pieza | Dónde |
|---|---|
| Reglas puras: `TAMANO_BLOQUE` (20), `MINIMO_BLOQUE` (5), `quedanEnBloque`, `necesitaBloque`, `agregarRango`, `tomarDelBloque`, `numeroProvisional(equipo, ms)` → `P-K7Q2-261012143052`, `esProvisional`, `equipoDeProvisional`, `repetidas` | `src/dominio/facturas.js` |
| `numeroDe` ignora los provisionales (sus dígitos son fecha y hora, no un consecutivo) | Ídem |
| `reservarConsecutivo(negId, minimoLocal, cuantos)`: aparta un bloque en una transacción y devuelve el último número | Puerto `datos.js` + `firebase-datos.js` |
| `reservarFactura` (aparta un bloque si quedan menos de 5), `siguienteFactura` (bloque → provisional), `codigoEquipo` (4 caracteres al azar, en el equipo), `asignarDefinitivas` | `ui/ventas/nueva-venta.js` |
| Tiquetes: "Número provisional (sin internet)" o "Antes: P-…" | `ui/impresion/facturas.js` |
| Reimpresiones: marca "provisional" o "antes P-…", y busca también por el provisional | `ui/impresion/reimpresiones.js` |
| Aviso "Números de factura repetidos" | Dashboard del negocio (`ui/reportes/dashboard.js`) |

**Cómo se comporta**:
- **Con la base en la nube**, al entrar al negocio (y cada vez que quedan menos de 5) el equipo aparta 20 números. Se guardan en el equipo (`localStorage` → `ws_bloque_<negocio>`) y valen aunque se cierre la sesión.
- **Sin bloque**: el número sale provisional (`P-<equipo>-<AAMMDDhhmmss>`). Si dos ventas caen en el mismo segundo, la segunda lleva `-2`.
- **Al reconectar** (otra reserva), las ventas provisionales de **este** equipo reciben el número definitivo, cada una con una transacción (D9), y conservan `facturaProvisional`. Queda una línea en la auditoría y un aviso.
- **Modo local** (un solo equipo, sin nube): igual que antes, el mayor número + 1.
- Un equipo con la **versión anterior** comparte el mismo contador: no choca con los bloques.

**Probado**:
- `tests/dominio/dominio.test.mjs`: bloques, provisional, `numeroDe` y repetidos.
- `tests/integracion/s1-migracion.test.mjs`: dos equipos apartan bloques a la vez contra el emulador y no se cruzan.
- `tests/navegador/s1-navegador.test.mjs`, con la base en la nube:
  - el bloque se aparta al entrar y la venta toma su número;
  - sin bloque, sale un provisional que no se repite;
  - al reconectar, la venta recibe el definitivo, también en la base, y no queda ningún número repetido.
- Capturas: 121 idénticas.
