# Realtime Database vs. Cloud Storage

Dos servicios de Firebase que suelen confundirse porque los dos "guardan cosas en la nube". Hacen trabajos distintos: **Realtime Database guarda datos** (registros que la app lee, filtra y sincroniza) y **Cloud Storage guarda archivos** (imágenes, PDF, respaldos). Wallace System hoy solo usa Realtime Database. La comparación con la otra base de Firebase, Cloud Firestore, está en [-03-architecture, sección 9](-03-architecture.md).

## 1. La diferencia en una frase

| | Realtime Database | Cloud Storage |
|---|---|---|
| Guarda | **Datos**: un árbol JSON de textos, números y booleanos | **Archivos**: cualquier tipo, de bytes a gigas |
| Piensa en | Una hoja de cálculo compartida que se actualiza sola en todos los equipos | Una carpeta de Google Drive con permisos |
| Ejemplo en un POS | Ventas, productos, caja, usuarios | Logos, fotos de productos, facturas en PDF, respaldos |

## 2. Diferencias en detalle

| Aspecto | Realtime Database (en uso) | Cloud Storage |
|---|---|---|
| Unidad | Un nodo del árbol (`data/data_n1_ventas_r/<id>`) | Un archivo con su ruta (`logos/n1.png`) |
| Tiempo real | **Sí**: los equipos escuchan un nodo y reciben cada cambio al instante. Así se ve una venta en todas las cajas | **No**: se sube y se descarga cuando se pide. No avisa de cambios |
| Consultas | Lee nodos y filtra de forma limitada | No hay consultas: se pide un archivo por su ruta (o se lista una carpeta) |
| Tamaño típico | Registros pequeños (KB). Todo lo que se escucha se descarga entero | Archivos de cualquier tamaño, hasta varios GB cada uno |
| Cómo llega al navegador | La librería sincroniza el JSON | Una **URL de descarga** que se usa como cualquier imagen o enlace (`<img src="…">`) |
| Seguridad | Reglas en JSON (`database.rules.json`) | Reglas propias de Storage (`storage.rules`), con otro lenguaje, parecido al de Firestore |
| Transacciones | Sí, sobre un nodo (stock, caja, consecutivos) | No; se reemplaza el archivo entero |
| Sin conexión | La app guarda su copia local (la del SDK web no persiste) | No; hay que tener conexión para subir o bajar |
| Cómo cobra | Por GB guardados y GB descargados | Por GB guardados, GB descargados y número de operaciones |
| Plan gratuito (Spark) | Incluido (1 GB guardado, 10 GB al mes de descarga, 100 conexiones simultáneas) | Según la política de Firebase desde finales de 2024, **un proyecto nuevo necesita el plan de pago (Blaze)** para crear su bucket, aunque el uso pequeño siga sin costo. **Confirmar en la página de precios antes de decidir** |

Las cifras de planes cambian: confirmarlas en la página de precios de Firebase.

## 3. Cómo lo usa Wallace System hoy

- **Todo está en Realtime Database**, incluidas las imágenes. Mi Negocio (`ui/configuracion/mi-negocio.js`) reduce el logo a **300 px de ancho**, lo convierte en texto (`data:image/png;base64,…`) y lo guarda dentro del registro del negocio (campo `logo`). Los productos guardan su foto igual (campo `imagen`, desde 2026-10-12): se reduce a **200 px** en JPEG (unos 10–30 KB) y se rechaza si pasa de ~60 KB. Ojo: la tabla de productos baja entera a cada equipo, así que 100 productos con foto suman 1–3 MB; si un negocio necesita muchas fotos grandes, ese es el momento de pasar a Storage.
- **Cloud Storage no se usa.** El campo `storageBucket` de `firebase-config.js` viene en la configuración web que entrega Firebase, pero ningún código lo usa.
- **Los respaldos** del panel se descargan al equipo del super-admin como un archivo JSON, sin pasar por Storage.

### 3.1 ¿Está bien guardar los logos en la base?

**A esta escala, sí.** En el export de producción, los logos de los 6 negocios suman unos **188 KB**. Tiene una ventaja real: el logo llega con el negocio, sin otra descarga ni otras reglas, y funciona sin conexión con la copia local.

**Empieza a ser un problema si**:
- crece el número de negocios con logo: el panel del super-admin descarga todos los negocios y, con ellos, todos los logos;
- se quieren **fotos de productos** de verdad (decenas o cientos por negocio): cada foto engordaría la tabla `productos`, que todos los equipos del negocio escuchan y descargan entera;
- se quieren guardar **archivos grandes**: facturas en PDF, respaldos automáticos en la nube, soportes de gastos (fotos de recibos).

## 4. Cuándo convendría usar Cloud Storage

| Necesidad | Con Cloud Storage |
|---|---|
| Fotos de productos | Se sube cada foto a `negocios/<id>/productos/<prodId>.jpg` y en la base solo se guarda su URL (un texto corto) |
| Logos con muchos negocios | Igual: `negocios/<id>/logo.png` y la URL en el registro |
| Soportes de gastos (foto del recibo) | `negocios/<id>/gastos/<gastoId>.jpg` |
| Respaldos automáticos | Un archivo por día, sin depender del equipo del super-admin |

### 4.1 Qué costaría implementarlo

1. **Plan**: probablemente pasar el proyecto a **Blaze** (pago por uso), que S1 evitó a propósito (decisión del 2026-10-04, Plan B). Con poco uso el costo suele ser cero, pero exige tarjeta registrada y conviene poner **alertas de presupuesto**.
2. **Reglas de Storage** que repliquen el aislamiento por negocio de S1, con un archivo `storage.rules` aparte. Las reglas de Storage pueden leer el perfil del usuario solo de forma limitada, así que habría que diseñarlas.
3. **Código**: agregar el módulo `firebase-storage.js` a `src/adaptadores/salida/firebase-sdk.js` y crear un **puerto y un adaptador nuevos** (p. ej. `aplicacion/puertos/archivos.js` y `adaptadores/salida/firebase-archivos.js`), según la arquitectura hexagonal. Además, una migración que pase los logos actuales de la base a Storage.
4. **CSP**: agregar el dominio de Storage (`https://firebasestorage.googleapis.com`) a `img-src` y `connect-src` en `scripts/csp-politica.mjs`.
5. **Sin conexión**: las imágenes en Storage no se ven si el equipo no tiene internet y el navegador no las guardó antes.

## 5. Recomendación

**Seguir con todo en Realtime Database por ahora.** Hoy no hay ninguna necesidad que lo justifique: los logos son pocos y pequeños, y no hay fotos de productos ni archivos.

**Señales para reconsiderarlo**:
- se piden fotos de productos o soportes de gastos;
- el panel del super-admin se vuelve lento por el peso de los negocios (logos);
- se quieren respaldos automáticos en la nube;
- de todas formas se pasa a Blaze por otra razón (p. ej. Cloud Functions, el Plan A de S1).

Si se hace, va como una fase propia: puerto y adaptador de archivos, reglas de Storage, migración de logos y pruebas en el sandbox.
