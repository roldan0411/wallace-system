# Importar inventario desde Excel o CSV (diseño, pendiente)

> Propuesta del 2026-10-13. **Hoy no existe**: los productos se crean uno por uno (Inventario → "+ Agregar"). Sirve para negocios nuevos que traen su catálogo de otro sistema o de una hoja de cálculo.

## 1. Opciones

| Opción | Cómo | A favor | En contra |
|---|---|---|---|
| A mano | Inventario → "+ Agregar", producto por producto | Cada uno queda bien: validaciones, movimiento de inventario inicial, auditoría | Inviable con cientos de productos |
| Carga técnica | Un JSON importado con la CLI de Firebase en `data_<negocio>_productos_r` | Rápido | **No recomendada**: se salta las validaciones (precios negativos, códigos repetidos, ids), el stock aparece **sin movimiento ni auditoría** (contra la regla de stock de `CLAUDE.md`), y un error de formato daña el inventario de un negocio. Solo un desarrollador, como último recurso |
| **Importar desde la app** (recomendada) | Plantilla → el cliente la llena → vista previa con errores → confirmar | Mismas validaciones y rastro que la pantalla normal; lo puede hacer el propio negocio o el super-admin al darlo de alta | Hay que programarla |

## 2. El flujo (opción recomendada)

1. **Plantilla**: en Inventario, "⬇ Plantilla" descarga un CSV con estas columnas (los nombres que ve el negocio y el campo que llenan):

   | Columna | Campo (`productos`) | Obligatoria | Regla |
   |---|---|---|---|
   | Nombre | `nombre` | Sí | Sin quedar en blanco |
   | Precio | `precio` | Sí | Número ≥ 0 (`Dominio.pagos.montoValido`) |
   | Costo | `costo` | No | Número ≥ 0 |
   | Categoría | `categoria` | No | Vacía = `General` |
   | Código de barras | `codBarras` | No | Sin repetirse ni en el archivo ni con los productos que ya hay (`Dominio.inventario.codigoRepetido`) |
   | Stock | `stock` | No | Vacío = **no lleva inventario** (`null`); si no, número ≥ 0 (`cantidadValida`) |
   | Mínimo | `stockMin` | No | Número ≥ 0 |
   | Vencimiento | lote en `lotes[]` | No | `AAAA-MM-DD` o `DD/MM/AAAA`; con stock, crea el producto con un lote (como el formulario) |

2. **El cliente la llena**: copia desde su sistema anterior o desde su Excel, y guarda como CSV. Se aceptan:
   - separador `,` o `;` (Excel en español usa `;`);
   - coma o punto decimal, y miles con punto (`12.500` o `12500`);
   - archivo con o sin BOM (UTF-8) y en ANSI (Windows-1252), por las tildes y la ñ;
   - columnas en otro orden, si traen el encabezado.
3. **Vista previa** (nada se guarda todavía): una tabla fila por fila, con ✓ o el motivo del error (nombre vacío, precio negativo, código repetido…). Arriba, el resumen: *N nuevos, M ya existen, K con errores*.
   - **Ya existe** = mismo código de barras, o sin código y mismo nombre (sin distinguir mayúsculas). Para esas filas se elige: **saltar** (por defecto) o **actualizar** precio, costo, categoría y mínimo. El stock de un producto que ya existe **no se pisa**: si viene distinto, se ofrece un ajuste con movimiento, como en el conteo.
   - Las filas con error no se importan; se puede descargar un CSV solo con ellas para corregirlas y volver a cargarlas.
4. **Confirmar**: se crean por el mismo camino que el formulario.
   - Cada producto nuevo con stock deja un movimiento **"Inventario inicial (importado)"**.
   - Una línea en la auditoría: *"Importó N productos desde <archivo>"*.
   - Se guarda en tandas, para no congelar la pantalla con miles de filas.

**Permisos**: `editarprod` (crear y actualizar) y `editarstock` (stock inicial y ajustes); respeta la prueba vencida (`exigirEscritura`). El super-admin lo puede hacer por el cliente desde la supervisión del negocio, al darlo de alta.

## 3. Dónde va cada cosa

| Pieza | Archivo |
|---|---|
| Leer el CSV en filas (separador, comillas, BOM, decimales) y validar cada fila contra los productos existentes: `leerCSV(texto)`, `filasDeImportacion(filas, existentes)` → `{nuevos, existentes, errores}` | `src/dominio/inventario.js`, con pruebas en `tests/dominio/` (casos de Excel en español, tildes, duplicados) |
| Plantilla, elegir el archivo (`FileReader`, como el logo), la vista previa y confirmar | `ui/inventario/importar.js` (nuevo; agregarlo a `ui/manifiesto.js`) |
| Guardar productos y movimientos | Lo de siempre: `guardarMisDatos('productos', …)`, `registrarMovimientos`, `logAudit` |
| Textos | `MSJ` / `BOTON` en `ui/nucleo/textos.js` |
| Prueba de punta a punta | Recorrido: importar un CSV con filas buenas, repetidas y con error; comprobar productos, stock, movimientos y auditoría |

**Excel nativo (`.xlsx`)**: necesitaría una librería de terceros (unos cientos de KB, y la CSP solo permite scripts propios y de Firebase). La primera versión pide CSV, y "Guardar como → CSV" está en cualquier Excel. Se puede sumar `.xlsx` después si hace falta.

## 4. Fuera de la primera versión

- **Recetas e insumos** (restaurantes): relacionan productos con insumos por id; sería una segunda plantilla (insumos) y una tercera (recetas: producto, insumo, cantidad).
- **Combos**: lo mismo, por sus componentes.
- **Fotos**: se agregan después desde el formulario de cada producto (la foto va en la base, reducida).
- **Clientes** desde otro sistema: el mismo patrón serviría (plantilla, vista previa y confirmar).

## 5. Estado

| Paso | Estado |
|---|---|
| Diseño | ✅ 2026-10-13 |
| Implementación | ⏳ Pendiente (cuando se pida) |
