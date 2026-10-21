# Documentación técnica — Wallace System

Sistema POS multi-negocio (SaaS) de **WALLACE COMPANY SYSTEM**. Una sola aplicación web estática (`index.html` + módulos en `src/`) que sirve a muchos negocios a la vez; cada negocio ve solo su información y un super-admin administra el conjunto. El código está en migración a **arquitectura hexagonal** (ver [-03-architecture](-03-architecture/-03-architecture.md)).

Esta carpeta documenta el sistema **por módulo**, tal como está implementado en el código (no como se desea que funcione). Cada módulo tiene un archivo con el mismo nombre de su carpeta (por ejemplo `04-kitchen-kds/04-kitchen-kds.md`) y la misma estructura:

1. Propósito y alcance (qué cubre y qué no)
2. Actores, roles y permisos
3. Configuración que lo activa
4. Flujos principales paso a paso
5. Modelo de datos (tablas y campos que lee/escribe)
6. Catálogo de funciones: archivo, alcance, quién la invoca y qué hace
7. Reglas de negocio y validaciones
8. Integración con otros módulos
9. Interfaz (clases CSS de `index.html`)
10. Limitaciones conocidas (detalle en [-01-to-review](-01-to-review/-01-to-review.md))

## Índice

| Carpeta | Módulo | Contenido principal |
|---|---|---|
| [-00-execution-protocol](-00-execution-protocol/-00-execution-protocol.md) | Protocolo de ejecución | Cómo correr, configurar, desplegar, respaldar y probar el sistema; entorno de pruebas en Firebase |
| [-00 → entornos-locales](-00-execution-protocol/entornos-locales.md) | Entornos locales | Enlaces y credenciales para probar en local; emuladores de Firebase y modo local: qué se instaló, cómo se conecta |
| [-00 → conexion-firebase](-00-execution-protocol/conexion-firebase.md) | Conexión con Firebase | Qué está hecho en el proyecto de pruebas y los pasos para seguir hasta el proyecto de la empresa |
| [-00 → union-con-original](-00-execution-protocol/union-con-original.md) | Unir con el original | Cómo traer los cambios del repositorio original al fork (conflicto de `app.js`), portarlos a los módulos y qué revisar antes del Pull Request |
| [-00 → ci-cd](-00-execution-protocol/ci-cd.md) | Pruebas automáticas y despliegue (pendiente) | GitHub Actions para correr las pruebas en cada push, Render solo con pruebas en verde, publicar el sandbox con un botón; producción nunca automática |
| [-00 → paso-a-produccion](-00-execution-protocol/paso-a-produccion.md) | Paso a producción | Cómo se elige Firebase (por dominio, `HOSTS_PRODUCCION`), qué revisar en Render, por qué no borrar la base de la empresa y cómo migrar sus cuentas; lista de chequeo |
| [-01-to-review](-01-to-review/-01-to-review.md) | Hallazgos para revisar | Bugs, riesgos de seguridad e inconsistencias encontradas al documentar, con su estado |
| [-02-corrections](-02-corrections/-02-corrections.md) | Correcciones aplicadas | Qué se corrigió de seguridad y datos, dónde, cómo se probó y qué queda pendiente |
| [-03-architecture](-03-architecture/-03-architecture.md) | Arquitectura | Estructura hexagonal (dominio, puertos, adaptadores), regla de dependencias, plan de fases de la migración, fase 8 (módulos, eventos delegados, estilos, capturas) y comparación Realtime Database vs. Cloud Firestore |
| [-03 → modulos-es](-03-architecture/modulos-es.md) | Módulos ES | Qué son, cómo está organizada la interfaz (manifiesto, `cargarInterfaz`, `window.WS`), reglas, cómo agregar funciones, acciones y archivos, errores típicos |
| [-03 → realtime-vs-storage](-03-architecture/realtime-vs-storage.md) | Realtime Database vs. Cloud Storage | Datos vs. archivos, cómo guarda hoy los logos, cuándo convendría Cloud Storage y qué costaría |
| [-03 → tema](-03-architecture/tema.md) | Tema y textos | Tokens de color, fuente, tamaño y radio en `estilos/00-tokens.css`; color por negocio y modo claro; qué queda para el rediseño; estado de los textos |
| [-03 → modelo-de-datos](-03-architecture/modelo-de-datos.md) | Modelo de datos | Todas las tablas con sus campos en un solo lugar: árbol de Firebase, formatos (`_r`, `_x`, `_bk`), qué escribe cada módulo y qué cambió respecto a producción |
| [-03 → seguridad-interfaz](-03-architecture/seguridad-interfaz.md) | Seguridad de la interfaz | Ataques posibles con código en línea (`onclick`, `style`), el caso real S6 y el riesgo que queda |
| [-03 → csp](-03-architecture/csp.md) | Content-Security-Policy | Política propuesta, cómo se probó, cómo activarla en Render y qué hacer si bloquea algo |
| [-03 → facturas-sin-conexion](-03-architecture/facturas-sin-conexion.md) | Números de factura | Bloques por equipo, número provisional sin internet y definitivo al reconectar |
| [-03 → recuperar-contrasena](-03-architecture/recuperar-contrasena.md) | Olvidé mi contraseña | Recuperación asistida con contraseña temporal; dueño o ayudante con correo real y enlace de Firebase |
| [-03 → entrar-con-google](-03-architecture/entrar-con-google.md) | Entrar con Google (pendiente) | Para super-admins: recuperación y verificación en dos pasos de Google; qué hay que hacer |
| [-03 → importar-inventario](-03-architecture/importar-inventario.md) | Importar inventario (pendiente) | Cargar productos desde Excel o CSV: plantilla, vista previa con errores, existentes, stock inicial con movimiento |
| [01-super-admin-panel](01-super-admin-panel/01-super-admin-panel.md) | Panel super-admin | Negocios, planes, vendedores, demos, respaldo, informe mensual |
| [02-pos-catalog](02-pos-catalog/02-pos-catalog.md) | Venta, pedidos y catálogo | Nueva Venta, carrito, cobro, pago dividido, pedidos, cuentas abiertas, productos y combos |
| [03-cash-register](03-cash-register/03-cash-register.md) | Caja | Apertura, movimientos, cierre con cuadre, base del día siguiente, verificación de transferencias |
| [04-kitchen-kds](04-kitchen-kds/04-kitchen-kds.md) | Cocina / KDS | Pantalla de cocina, comandas, tiempos de entrega |
| [05-appointments-shifts](05-appointments-shifts/05-appointments-shifts.md) | Agenda / citas | Citas y turnos, productos apartados, cobro de la entrega |
| [06-inventory-recipes](06-inventory-recipes/06-inventory-recipes.md) | Inventario y recetas | Motor de inventario, stock, lotes FEFO, insumos, recetas, conteo físico |
| [07-customers-delivery](07-customers-delivery/07-customers-delivery.md) | Clientes y domicilios | Clientes automáticos, autocompletado, domiciliarios y su cuadre |
| [08-sales-reports](08-sales-reports/08-sales-reports.md) | Reportes de ventas | Dashboard, reportes, historial |
| [09-expenses-accounting](09-expenses-accounting/09-expenses-accounting.md) | Gastos y contable | Gastos del negocio, conceptos, registro contable mensual |
| [10-users-roles](10-users-roles/10-users-roles.md) | Usuarios, roles y auditoría | Login, roles, pantallas, permisos de acción, contraseñas, auditoría |
| [11-business-settings](11-business-settings/11-business-settings.md) | Configuración del negocio | Perfiles por tipo, configuración del super-admin, Mi Negocio, sucursales, tema, vocabulario |
| [12-invoice-printing](12-invoice-printing/12-invoice-printing.md) | Impresión | Facturas POS/media/carta, remisión, reimpresiones |
| [13-multitenant-isolation](13-multitenant-isolation/13-multitenant-isolation.md) | Datos y aislamiento | Almacenamiento, sincronización con Firebase, aislamiento por negocio, arranque y render |

## Archivos del proyecto

### Raíz

| Archivo | Para qué sirve | ¿En Git? |
|---|---|---|
| `index.html` | Única página de la app. Enlaza los 16 CSS de `ui/estilos/` (el primero, `00-tokens.css`, con todos los colores y tamaños) (con `?v=VERSION_UI`) y carga **un solo** script, el módulo `src/arranque.js`, que importa todo lo demás. El cuerpo solo tiene `#app`, `#modal-container` y `#toasts`. | Sí |
| `firebase-config.js` | Decide **a qué base se conecta la app** según la dirección: `?local` → modo local; `?emulador` → emuladores; dominios de `HOSTS_PRODUCCION` (vacío hasta definir el dominio) → producción; cualquier otro (`localhost`, el fork en Render) → el proyecto de pruebas `wallacesys-dev-sandbox`. Es un **módulo**: exporta `elegirEntorno(location)`, que usan `src/arranque.js` y `prueba.js` (ya no deja variables en `window`). | Sí (la configuración web no es secreta) |
| `prueba.html` + `prueba.js` | **Diagnóstico de conexión**: entorno, si Firebase responde, qué reglas están publicadas y, opcionalmente, un inicio de sesión de prueba. **No escribe nada.** El código está en `prueba.js` (módulo, con el SDK modular de Firebase) para que funcione con la CSP. Se abre en `/prueba.html`. | Sí |
| `.firebaserc` | Proyectos que conoce la CLI de Firebase: solo el alias `pruebas` → `wallacesys-dev-sandbox`. No hay alias de producción (se crea solo con aprobación). | Sí |
| `firebase.json` | Configuración de la CLI: reglas a publicar (`database.rules.json`, las cerradas) y puertos de los emuladores (base 9000, Authentication 9099). | Sí |
| `firebase.transicion.json` | Igual que `firebase.json` pero con las reglas de transición. Lo usa `npm run reglas:transicion` (`--config`). | Sí |
| `database.rules.json` | **Reglas finales (cerradas)** de la base: cada sesión solo lee y escribe lo de su negocio según su rol (S1). Las publica `npm run reglas:cerradas`. | Sí |
| `database.rules.transicion.json` | **Reglas de transición**: las finales más permisos temporales para que las cuentas viejas migren en su primer ingreso. Solo mientras dura la migración. | Sí |
| `firebase.hosting.json` | Publicación del sitio en **Firebase Hosting del sandbox** (opción A de [conexion-firebase](-00-execution-protocol/conexion-firebase.md), paso 5): publica solo `.publicar/`, con `Cache-Control: no-cache` y la CSP en modo `Report-Only`. Lo usa `npm run publicar:sandbox`. | Sí |
| `render.yaml` | Despliegue en Render: sitio estático desde la raíz, toda ruta a `index.html`, `Cache-Control: no-cache` en `/src/*`. Ahí iría la CSP ([csp.md](-03-architecture/csp.md)). | Sí |
| `package.json` | Comandos (`npm test`, `test:firebase`, `emulador`, `reglas:transicion`, `reglas:cerradas`, `start`) y herramientas de desarrollo (`firebase-tools`, `puppeteer-core`, `acorn`…). Render no las instala: el sitio es estático. | Sí |
| `package-lock.json` | Versiones exactas de esas herramientas, para que `npm install` instale lo mismo en cualquier equipo. No se edita a mano. | Sí |
| `README.md` | Presentación del producto (qué es, super-admin y negocios, tipos de negocio). Lo técnico está en `Documentation/`. | Sí |
| `CLAUDE.md`, `.claude/contexto.md` | Contexto del asistente de código: reglas estáticas (`CLAUDE.md`) y estado vivo (`contexto.md`, que `CLAUDE.md` importa). | Sí |
| `.gitignore` | Lo que nunca se sube: exports y respaldos con datos, `importar-pruebas*.json`, logs de los emuladores, `capturas/`, `node_modules/`. | Sí |
| `importar-pruebas.json` | Copia del export de producción preparada por `scripts/preparar-pruebas.mjs` (solo el nodo `data`); el emulador la carga para probar con datos reales. **Tiene contraseñas y datos de clientes**: no subir ni compartir. | **No** (`.gitignore`) |
| `perfil.json` | Archivo **temporal** de la recuperación de acceso de un super-admin: copia de su perfil para pasarlo a la cuenta nueva ([conexion-firebase](-00-execution-protocol/conexion-firebase.md), sección 5). Se borra al terminar el paso 6. | **No** (`.gitignore`) |
| `database-debug.log` | Registro que escribe el emulador de la base al correr. No se usa; se puede borrar. | **No** (`.gitignore`) |
| `.publicar/` | Copia de **solo** los archivos de la app que se suben a Firebase Hosting; la arma `scripts/publicar-sandbox.mjs` con una lista blanca (así nunca se suben datos). Se rehace en cada publicación. | **No** (`.gitignore`) |
| `capturas/` | Fotos de `scripts/capturas.mjs` (regresión visual, ver [-03 → 11.5](-03-architecture/-03-architecture.md)). | **No** (`.gitignore`) |

### Código, pruebas y herramientas

| Carpeta | Rol |
|---|---|
| `src/arranque.js` | Raíz de composición: crea los adaptadores, verifica los puertos, publica el puente e importa la interfaz. |
| `src/dominio/` | Reglas puras del negocio (fechas, pagos, caja, inventario, facturas, contraseñas, cuentas, permisos, negocio, gastos, ventas). Probadas con `npm test`. |
| `src/aplicacion/puertos/` | Contratos que deben cumplir los adaptadores (datos y cuentas). |
| `src/aplicacion/servicios/` | Casos de uso (hoy: inicio de sesión y migración de cuentas, S1). |
| `src/adaptadores/salida/` | Firebase + respaldo local (sincronización y transacciones), cuentas con Firebase Authentication, `localStorage`, aleatoriedad; `firebase-sdk.js` carga el SDK **modular** de Firebase desde gstatic (solo si hay base). |
| `src/adaptadores/entrada/ui/` | Interfaz: 52 módulos ES por carpeta (`nucleo/`, `ventas/`, `caja/`, `inventario/`…) listados en `manifiesto.js`, más `estilos/` (CSS); el logo de la marca está en `nucleo/logo.js`. Mapa función → archivo: [mapa-interfaz](-03-architecture/mapa-interfaz.md). |
| `src/adaptadores/entrada/ui/puente-legado.js` | Puente temporal: publica en `window` el dominio y los datos con los nombres de siempre. |
| `tests/` | `npm test` (dominio, servicios, estructura de la interfaz) y `npm run test:firebase` (reglas, migración e interfaz en emuladores y Chrome). |
| `scripts/` | `emulador.mjs` (app completa en emuladores), `probar-firebase.mjs` (corre `test:firebase`), `preparar-pruebas.mjs` (diagnóstico del export sin datos sensibles), `mapa-interfaz.mjs` (genera el mapa), `capturas.mjs` (regresión visual), `csp-politica.mjs` (la CSP del proyecto, en un solo lugar), `probar-csp.mjs` (prueba la CSP), `publicar-sandbox.mjs` (prepara `.publicar/` para Firebase Hosting del sandbox). |

## Convenciones de esta documentación

- Las rutas `ui/<carpeta>/<archivo>.js` son relativas a `src/adaptadores/entrada/` (la interfaz) y las demás (`dominio/pagos.js`, `adaptadores/salida/firebase-datos.js`) a `src/`. Hasta el 2026-10-08 la interfaz era un solo `app.js` y la documentación citaba `app.js:NNN`; esas referencias se pasaron al archivo nuevo buscando la función por nombre. Para ubicar cualquier función: [mapa-interfaz](-03-architecture/mapa-interfaz.md).
- **Alcance de una función**:
  - **Pantalla**: devuelve HTML de una vista y la invoca `renderContenido()`/`vistaNegocio()`/`render()`.
  - **Acción UI**: se llama desde un `data-click`/`data-input`/… del HTML generado (eventos delegados, `ui/nucleo/eventos.js`); debe estar exportada.
  - **Servicio**: lógica reutilizada por varios módulos.
  - **Interna**: ayudante usado solo dentro del módulo.
- Las funciones de la interfaz son módulos ES y se ven en la consola del navegador como `WS.<nombre>`; las del dominio y los datos se publican en `window` mediante el puente. Así que técnicamente se pueden invocar desde la consola. Dentro de cada negocio, los permisos de rol son **del lado del cliente**; el aislamiento entre negocios lo hacen las reglas de S1.
- "Negocio" = tenant. "Jornada" = periodo contable de una caja (ver [03-cash-register](03-cash-register/03-cash-register.md)).
