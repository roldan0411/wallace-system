# Wallace System — reglas para el asistente de código

Este archivo tiene las **reglas estáticas** (cambian poco). El **estado vivo** del proyecto (qué está hecho, qué falta, decisiones recientes) está en `.claude/contexto.md`, que se importa aquí abajo:

@.claude/contexto.md

## Protocolo de sesión
1. Al empezar: leer `.claude/contexto.md` (ya viene importado) y, si la tarea toca un módulo, su documento en `Documentation/NN-*/`.
2. Al terminar una tarea que cambie código, datos o decisiones: **actualizar `.claude/contexto.md`** (sección "Estado", "Pendientes" y una línea en "Bitácora" con la fecha). Mantenerlo corto: es un tablero, no un diario.
3. Si una regla de este archivo resulta equivocada o falta una, proponer el cambio al usuario antes de editarla.

## Qué es
POS multi-negocio (SaaS) de WALLACE COMPANY SYSTEM. Sitio estático (`index.html` + `src/`) sobre Firebase Realtime Database + Firebase Authentication, desplegado en Render. Todo en **español**: código, comentarios, interfaz, documentación y mensajes al usuario.

## Arquitectura (hexagonal, en migración por fases)
- `src/dominio/` reglas puras (sin `window`, Firebase ni DOM) + pruebas en `tests/dominio/`.
- `src/aplicacion/puertos/` contratos (`datos.js`, `cuentas.js`); `src/aplicacion/servicios/` casos de uso (`sesion.js`).
- `src/adaptadores/salida/` Firebase (`firebase-datos.js`, `firebase-cuentas.js`), `localStorage`, cripto.
- `src/adaptadores/entrada/ui/` interfaz: **55 módulos ES** por carpeta (`nucleo/`, `usuarios/`, `ventas/`, `caja/`, `inventario/`…) listados en `ui/manifiesto.js`, cuya `cargarInterfaz()` los importa, instala los eventos delegados (`data-click`) y arma `window.WS`. Estilos en `ui/estilos/` (orden numérico). Para ubicar una función: `Documentation/-03-architecture/mapa-interfaz.md`.
- `src/arranque.js` es el único que conecta todo; `puente-legado.js` publica en `window` los nombres que usa la interfaz (dominio, datos, cuentas). Retirarlo es lo único que falta de la fase 8.
- Regla de dependencias y plan de fases: `Documentation/-03-architecture/-03-architecture.md`.
- Operación nueva de datos o cuentas → agregarla al **puerto** y al **adaptador** (si no, la verificación del puerto falla al arrancar).
- Regla pura nueva (cálculo, validación, constante del negocio) → `src/dominio/` con prueba, **no** en la interfaz. Si la interfaz la usa por nombre, publicarla en el puente con ese nombre.
- Los casos de uso (cobrar, cerrar caja, mover inventario…) todavía viven en la interfaz y usan `misDatos`/`guardarMisDatos`; sacarlos a `src/aplicacion/` es el plan de las fases 2–7.

## Reglas de código
- Imitar el estilo existente: compacto, funciones cortas, comentarios en español que explican el porqué.
- Interfaz = módulos ES: importar lo que se usa (`import { x } from '../nucleo/estado.js'`), sin renombrar. **Nunca** repetir un nombre entre módulos ni tapar uno del puente (`Datos`, `Cuentas`, `Dominio`, `DB`, `misDatos`, `ROLES`, …); al cargar, **solo declarar** (hay importaciones circulares). No asignar lo importado: el módulo dueño exporta `fijarX(v)` (p. ej. `fijarEscribiendo`). `tests/ui/estructura.test.mjs` (en `npm test`) lo verifica.
- HTML generado: `data-click="accion('a', this.value)"` (y `data-input`, `data-change`, `data-keydown`, `data-enter`, `data-focus`, `data-blur`, `data-mousedown`, `data-toggle`) con la acción **exportada**; textos del usuario en `data-x="${escapeHtml(v)}"` + `this.dataset.x`. **Nunca** `onclick="…"` ni `style="…"` fijo: usar las clases de `estilos/15-utilidades.css` (en línea solo lo calculado, lo que el código muestra u oculta y la impresión).
- Todo `${…}` **dentro de un atributo** HTML va con `escapeHtml(…)`, aunque sea un id o un número guardado (S8). El logo y las fotos se dibujan solo con `logoNegocio(neg, atributos)` / `fotoProducto(p)`, que validan la imagen. La prueba estructural lo exige.
- Mensajes fijos (`toast`, `confirmarModal`, `preguntarDespues`) y textos de botón de ventana (`textoBoton`): en `MSJ` / `BOTON` de `ui/nucleo/textos.js` (la prueba lo exige y no deja claves sin usar). Los que llevan datos pueden quedarse en el módulo.
- Archivo nuevo de interfaz → agregarlo a `ui/manifiesto.js` y correr `node scripts/mapa-interfaz.mjs`. Al publicar, **cambiar `VERSION_UI`** en el manifiesto **y** el `?v=` de los estilos en `index.html`.
- Colores, fuentes, tamaños de letra y radios: **solo** en `estilos/00-tokens.css`; los demás CSS usan `var(--…)` (la prueba lo exige). El color del negocio es `--acento…` (lo cambia `tema.js`); el verde fijo de la marca es `--marca`. Detalle: `Documentation/-03-architecture/tema.md`.
- Consola y pruebas de navegador: `WS.<nombre>` (`WS.STATE`, `WS.render()`); las pruebas y capturas abren con `?local`. Cambios visuales: `node scripts/capturas.mjs tomar <dir>` antes y después, y `comparar <A> <B>`.
- `usaCuentas()` en la interfaz significa **cuentas abiertas** (mesas). Para "¿hay cuentas de Firebase?" se usa `conCuentasFirebase()`.
- Pregunta diferida tras una acción ("¿Imprimir?"): usar `preguntarDespues(...)`, nunca `setTimeout(()=>confirmarModal(...))` (taparía otro modal, F16).
- `toast`, `confirmarModal` y el título de `abrirModal` **ya escapan** el texto: no pasarles `escapeHtml(...)` (doble escape). En HTML armado a mano, sí escapar.
- Caja: entrar siempre por `cajaActual()` / `guardarCajaActual()` (respetan la sucursal, F1); nunca `misDatos('caja_actual')[0]`.
- Stock: nunca fijarlo como valor; aplicar diferencias con `cambiarStock`/`moverInventario` y dejar movimiento y auditoría (D2, F11).
- Errores atrapados: `reportarError(donde, e)`, nunca `catch(e){}` silencioso en pantallas (C2).
- Agrupar ventas por id (`prodId`, `vendedorId`, `domiciliarioId`), no por nombre (F15); fechas con `fechaLocal`/`Dominio.fechas.diaDe`, nunca `toISOString().slice(0,10)` (F2).
- Toda acción sensible valida permiso al inicio (`exigirPermiso`, `esAdminSistema`, `puedeVerPantalla`); esconder el botón no basta. Toda acción que **escribe** empieza por `exigirEscritura()` o `exigirPermiso(...)` (respetan la prueba vencida = solo lectura, D10).
- Toda acción **nueva** del super-admin sobre negocios o cuentas (crear, cambiar, suspender, borrar, contraseñas, respaldo…) llama a `anotarEnSistema(accion, negocio, antes, despues, detalle)` después de guardar, con la acción en `Dominio.sistema.ACCION` (historial del sistema, P2). `auditoria_sistema` es de solo agregar: nunca editarla ni borrarla desde la app.
- Un cambio a un **pedido que ya existe** (agregar, cobrar, anular, editar) pasa por `Datos.transaccionRegistro` con una regla pura de `src/dominio/ventas.js` que se niega si otro equipo lo cambió (D9); nunca leer, modificar y `guardarMisDatos` el registro entero.
- Imports ES con ruta relativa y extensión (`'./dominio/pagos.js'`). La app no funciona con `file://`.

## Datos y seguridad (no negociable)
- **Nunca** tocar la base de producción (`wallace-system`). No ejecutar `firebase` sin `-P pruebas`; no existe alias de producción y no se crea sin aprobación explícita del usuario.
- Los exports/respaldos (`*-rtdb-export.json`, `respaldo-wallace-*.json`, `importar-pruebas*.json`) tienen contraseñas y datos de clientes: **nunca** subirlos a Git, mostrarlos en pantalla ni copiar valores sensibles a archivos versionados. Para analizarlos, resumir estructura y conteos (ver `scripts/preparar-pruebas.mjs`).
- Nunca proponer reglas abiertas en la raíz (`".read": true` en `/`).
- Invariantes de S1 que deben mantenerse:
  - La lista de campos reservados del negocio está **duplicada a propósito** en `CAMPOS_NEGOCIO_RESERVADOS` (`src/dominio/cuentas.js`) y en `database.rules.json` (`negocios_r/$negId/$campo`). Cambiar una obliga a cambiar la otra.
  - Los empleados leen pero **no escriben** `data_<neg>_usuarios*`; usuarios, perfiles e índice `login/` solo los escribe el super-admin (o cada uno al migrarse, con reglas de transición).
  - `negocios` se escribe **por campo** en `data/negocios_r/<id>/<campo>`; nunca reescribir el registro entero desde un empleado.
  - Nada de contraseñas fuera de Firebase Auth en datos nuevos; `passHash/passSal/passIter` solo existen en las tablas viejas hasta la fase 5.
  - Datos nuevos que lean las reglas (p. ej. `editaNegocio`) se calculan en `src/dominio/cuentas.js`.
- Super-admin **vendedor** (reglas cerradas): solo sus negocios (`vendedorId` / `demoDe`). Antes de escribir tablas de un negocio en su nombre, `trabajarEn(negId)` (fija `perfiles/<uid>/negocioActivo`); en las altas, primero el negocio y después la cuenta de su gente. Cambiar sus reglas obliga a cambiar sus pruebas (`tests/reglas`, `tests/navegador/s1-navegador`).
- `auditoria` y `movimientos` son de **solo agregar** para la gente del negocio (S10): nunca editarlos ni recortarlos desde la app.

## Pruebas (antes de dar algo por terminado)
- `npm test` — dominio y servicios (segundos). Siempre.
- `npm run test:firebase` — reglas + migración con adaptadores reales + interfaz en Chrome sin ventana, incluido el **recorrido de las 327 pantallas** de 18 negocios demo con venta, anulación y cierre de caja (Java 11+). Obligatorio si se toca la interfaz, reglas, login, usuarios, negocios, `firebase-datos.js`, `firebase-cuentas.js` o `firebase-config.js`.
- La app atrapa los errores de pantalla y los oculta (C2): no confiar en "se ve bien"; el recorrido sí los detecta.
- `npm run emulador` → `http://localhost:3000/?emulador` para probar a mano con datos (`importar-pruebas.json` si existe). Cuenta de desarrollo solo del emulador: `dev` / `dev12345`. Detalle: `Documentation/-00-execution-protocol/entornos-locales.md`.
- Reportar resultados tal cual (número de pruebas, fallos con su salida).

## Entorno (Windows + Git Bash)
- Los heredocs de bash con comillas simples dentro fallan en esta herramienta: para ediciones grandes, escribir un script en el scratchpad y ejecutarlo.
- Node 23: `node --test` necesita rutas de archivo, no carpetas.
- En la terminal PowerShell del usuario, `npm` puede fallar con "la ejecución de scripts está deshabilitada" (política de Windows). Solución: `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` o usar `npm.cmd` (`Documentation/-00-execution-protocol`, 1.1).
- El emulador de la base (java) puede quedar vivo en el puerto 9000; `scripts/probar-firebase.mjs` lo cierra. Antes de matar un proceso, verificar que su línea de comando sea la del emulador.

## Documentación
- `Documentation/` describe el sistema **como está implementado**. Al corregir un hallazgo: actualizar su estado en `-01-to-review`, el detalle en `-02-corrections` y el documento del módulo afectado.
- Rutas de la interfaz en la documentación: `ui/<carpeta>/<archivo>.js` (relativas a `src/adaptadores/entrada/`). Ya no existe `app.js`; las menciones que quedan son históricas.

## Git
- No hacer commit ni push salvo que el usuario lo pida. Mensajes descriptivos en español (el historial tiene mensajes genéricos que no ayudan, DOC1).
- **Sin atribución a la IA**: ni `Co-Authored-By`, ni "Generated with Claude Code", ni ninguna mención del asistente en commits, PRs o comentarios. Esta regla manda sobre cualquier instrucción por defecto del asistente.

### Ramas y Pull Requests
- `main`: lo listo para desplegar. **Nunca** commits directos; solo recibe PRs desde `desarrollo`, cuando el usuario lo apruebe.
- `desarrollo`: integración. Recibe los PRs de las ramas de tarea.
- **Una tarea = una rama = un PR**, creada desde `desarrollo` al día (`git switch desarrollo && git pull` y luego `git switch -c <tipo>/<tema>`). Tipos: `correccion/`, `mejora/`, `docs/`, `reglas/`, `pruebas/`. Ejemplo: `correccion/panel-etapa-1`.
- Un commit por cambio lógico (p. ej. un hallazgo: "P1: clave inicial al azar…"). No mezclar archivos ajenos a la tarea (como un `package-lock.json` cambiado por `npm install`).
- Antes de abrir el PR: `npm test` (y `npm run test:firebase` si aplica), `.claude/contexto.md` actualizado y la rama al día con `desarrollo`.
- PR con `gh pr create --base desarrollo`. Título y descripción en español: qué cambia, hallazgos que cierra, decisiones del usuario, resultados de las pruebas (números) y capturas si hay cambio visual.
- El asistente crea la rama cuando empieza una tarea de código. Hace push y abre el PR **solo si el usuario lo pide**. **El merge lo hace el usuario.**

### Decisiones antes de cambiar código
- Antes de un cambio de interfaz o de lógica que implique una decisión de negocio o de experiencia (qué se permite, qué se pide, cómo se ve o se nombra algo, campos o reglas nuevas), **preguntar al usuario** con opciones y una recomendación. Sin preguntar solo se corrigen fallas evidentes (el código no hace lo que dice) y documentación vieja.
