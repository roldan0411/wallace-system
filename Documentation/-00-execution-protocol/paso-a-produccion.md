# Paso a producción: referencias a Firebase y Render, la base de la empresa y las cuentas

Qué apunta a dónde (Firebase y Render), qué hay que cambiar antes de llevar el código al repositorio original, qué hacer con la base de datos de la empresa y cómo pasar sus cuentas a Firebase Authentication. Complementa [union-con-original](union-con-original.md) (la parte de Git) y [conexion-firebase](conexion-firebase.md) (los pasos en Firebase).

## 1. Firebase: la referencia NO se cambia antes del commit

`firebase-config.js` ya tiene **las dos** configuraciones y elige una **al cargar la página, según el dominio**:

```
export const PRODUCCION = { … projectId: "wallace-system" … };            // la base de la empresa
export const PRUEBAS    = { … projectId: "wallacesys-dev-sandbox" … };     // el proyecto de simulación
export const HOSTS_PRODUCCION = [];                                       // ← lo único que falta

dominio en HOSTS_PRODUCCION      → PRODUCCION
localhost / el fork / otro       → PRUEBAS
?local · ?emulador (localhost)   → sin nube · emuladores
```

**Por qué así y no "cambiar la referencia antes del commit"**: el mismo código sirve en todos lados y no hay que acordarse de nada.
- **Con cambio manual**, si alguien olvida volver a cambiarla, el desarrollo escribiría en la base real, o producción quedaría apuntando al sandbox.
- **Por dominio**, `localhost` y el fork **nunca** pueden tocar producción, y el dominio de la empresa **siempre** usa su base.

### 1.1 Lo que hay que hacer (una sola vez, antes del Pull Request)

| # | Qué | Dónde | Detalle |
|---|---|---|---|
| 1 | **Llenar `HOSTS_PRODUCCION`** con el o los dominios públicos de la empresa | `firebase-config.js` | Solo el nombre, sin `https://` ni rutas: `['wallace-system.onrender.com']`, y si tiene dominio propio, también `'app.empresa.com'`. Sin esto, el sitio de la empresa usaría el sandbox. |
| 2 | Revisar que el bloque `PRODUCCION` sea el del proyecto actual de la empresa | `firebase-config.js` | Viene del repositorio original (`wallace-system`). Confirmarlo en la consola de Firebase de la empresa → ⚙ *Configuración del proyecto* → *Tus apps* → *Web*. |
| 3 | Decidir qué hacer con el bloque `PRUEBAS` | `firebase-config.js` | Hoy apunta al sandbox **personal** del desarrollador. En el repositorio de la empresa conviene que la empresa tenga **su propio** proyecto de pruebas y poner aquí su configuración. Mientras no exista, se puede dejar el sandbox: la configuración web no es secreta. Pero entonces cualquiera que abra el código en `localhost` usará ese proyecto. |
| 4 | Agregar en Authentication de la empresa los dominios del paso 1, si lo pide | Consola de Firebase de la empresa → *Authentication* → *Configuración* → *Dominios autorizados* | Necesario si el inicio de sesión responde `auth/unauthorized-domain`. |

**Comprobar el entorno**: abrir `https://<dominio>/prueba.html`. Debe decir "Entorno: producción" en el dominio de la empresa y "pruebas" en el fork o en `localhost`. La pantalla de login también lo avisa cuando **no** es producción.

### 1.2 La CLI de Firebase (`.firebaserc`)

Es otra referencia, solo para **comandos** (publicar reglas, importar o exportar datos), no para la app:
- Hoy solo existe el alias `pruebas` → `wallacesys-dev-sandbox`. Todos los comandos del repositorio llevan `-P pruebas`: **ninguno puede tocar la empresa**.
- El alias `produccion` se agrega **solo en el momento de desplegar** y **con aprobación del responsable**: `npx.cmd firebase use --add` → proyecto de la empresa → nombre `produccion`.
- Requisito: la cuenta de Google de quien despliega debe tener acceso al proyecto de la empresa. El dueño lo da en la consola → ⚙ → *Usuarios y permisos*.

## 2. Render: el código no apunta a Render

No hay ninguna dirección de Render en el código. Es al revés: **cada servicio de Render apunta a un repositorio y una rama de GitHub** y publica lo que haya ahí.

| Servicio | Repositorio y rama | Base que usa |
|---|---|---|
| El de la empresa (ya existe) | `roldan0411/wallace-system` → `main` | La de la empresa, **solo** si su dominio está en `HOSTS_PRODUCCION` |
| El de pruebas del fork (por crear, [conexion-firebase](conexion-firebase.md) paso 5) | `Danielvt914/wallace-system` → `s1-y-correcciones` | El sandbox (su dominio no está en `HOSTS_PRODUCCION`) |

Así que "cambiar la referencia a Render" no es editar código. Es:
1. **Poner el dominio del servicio de la empresa en `HOSTS_PRODUCCION`** (sección 1.1). Ese es el único lazo entre Render y Firebase.
2. **Revisar el servicio de la empresa en el panel de Render** antes de unir:
   - ***Auto-Deploy***: si está activo, aceptar el Pull Request **publica de inmediato**. Desactivarlo hasta tener listo Firebase (sección 3), o unir solo en ese momento.
   - **Cómo se creó el servicio**:
     - si fue con *Blueprint*, toma `render.yaml`: la regla de reescritura y los encabezados (`Cache-Control: no-cache` en `/src/*`, y la CSP cuando se active);
     - si se creó a mano, **`render.yaml` no se aplica**: los encabezados hay que ponerlos en *Settings* → *Headers*, y la reescritura en *Redirects/Rewrites*.
   - **Dominio propio**: si la empresa usa uno (*Settings* → *Custom Domains*), ese también va en `HOSTS_PRODUCCION`.
3. **Comprobar después de publicar**: `curl -I https://<dominio>/src/arranque.js` debe mostrar `cache-control: no-cache`, y `/prueba.html` debe decir "producción".

## 3. ¿Borrar la base de datos de la empresa? **No**

**Opinión: no hay que borrarla. Al contrario, hay que conservarla con respaldo.** Tiene la operación real (export del 07/10):
- 6 negocios;
- sus ventas, cajas, inventario, clientes y gastos;
- 9 usuarios de negocio y 8 super-admins.

Borrarla es perder el historial contable de clientes que pagan.

S1 se diseñó para trabajar **sobre la base existente**:
- **Las tablas viejas** (formato array, contraseñas en `usuarios`) las convierte **el primer ingreso** con la versión nueva, una sola vez (`data/migracion_s1`).
- **Las reglas de transición** permiten esa conversión y la migración de cuentas. Las reglas cerradas se publican cuando todos migraron.
- **Antes de cada fase va un respaldo**: export completo desde la consola. Si algo sale mal, se restaura.

**Sí se puede limpiar después**, con respaldo, cuando todo funcione con las reglas cerradas: los nodos sin uso de la raíz (`posu`, `prueba_conexion`) y los respaldos internos viejos (`_bk`, 12 en el export). Ya no aportan nada, y con las reglas cerradas nadie los lee. Es opcional.

**Lo único que va "desde cero"** es el sandbox, que ya se creó así a propósito.

## 4. ¿Rescatar las contraseñas actuales para migrar las cuentas en lote?

Las contraseñas de la base de la empresa están en **texto plano** (17, en el export). Técnicamente se podrían leer y crear con ellas, de una vez, las cuentas de Firebase Authentication. **Opinión: no conviene. Es mejor la migración que ya está hecha.**

### 4.1 Las opciones

| Opción | Cómo funciona | Ventajas | Problemas |
|---|---|---|---|
| **A. Migración al primer ingreso** (ya implementada y probada; **recomendada**) | Cada usuario entra como siempre. La app comprueba su contraseña vieja, le crea la cuenta de Authentication y **borra la contraseña vieja** de la tabla. | Nadie manipula contraseñas ajenas. Ya está probada en emuladores y en el sandbox. A quien tiene menos de 6 caracteres le pide una nueva. | Hay que esperar a que todos entren al menos una vez. Mientras tanto siguen las reglas de transición. |
| **B. El super-admin crea la cuenta con una contraseña temporal** (ya implementada: Panel → 🔐 Cuentas → "Crear cuenta" / "Restablecer contraseña") | Para quien no entró en el plazo o ya no trabaja ahí: se le crea la cuenta con una contraseña nueva que se le entrega aparte. | No usa las contraseñas viejas. Permite cerrar las reglas en una fecha fija. | Hay que comunicar la contraseña temporal a cada persona. |
| **C. Importar en lote las contraseñas en texto plano** (no implementada; **no recomendada**) | Un script lee el export y crea todas las cuentas con `firebase auth:import`, con las contraseñas pasadas por un hash. | Todos quedan migrados el mismo día. | Ver 4.2. |

### 4.2 Por qué no la opción C

1. **Exige manipular las contraseñas de personas reales**, en un archivo y en un script. Las reglas del proyecto (`CLAUDE.md`) prohíben mostrarlas o copiarlas, justamente por eso.
2. **Esas contraseñas ya están expuestas**: durante años viajaron en texto plano a todos los equipos (hallazgo S2). Pasarlas tal cual a Firebase conserva contraseñas que hay que considerar conocidas.
3. **Saltaría la validación de 6 caracteres**: 3 usuarios tienen contraseñas más cortas, y una importación con hash las aceptaría.
4. **Es código nuevo**, sin pruebas, para algo que hoy ya hacen A y B.

### 4.3 Recomendación

1. Publicar con las reglas de **transición** y avisar a todos que entren en un plazo (p. ej. una semana). Ese plazo es una de las decisiones pendientes del responsable.
2. Seguir el avance en Panel → 🔐 Cuentas: migrado, pendiente, por revisar.
3. Al vencer el plazo, a los pendientes: **opción B** (contraseña temporal) o desactivarlos si ya no trabajan ahí.
4. Publicar las reglas **cerradas** (fase 4) y hacer la limpieza (fase 5: quitar `passHash`/`passSal`/`passIter` de las tablas viejas).
5. **Recomendado**: después de migrar, pedir a todos que **cambien su contraseña**: los usuarios de negocio en Usuarios → "🔑 Cambiar mi contraseña" en su propia fila, y los super-admins con "🔑 Mi contraseña" en Administradores, porque las viejas estuvieron expuestas. Se puede exigir a los super-admins primero, que son los que ven todo.

Si aun así se decide la opción C, que sea con un script que **no muestre ni guarde** las contraseñas en ningún archivo nuevo, que corra contra el emulador primero, y seguida del paso 5.

## 5. Lista de chequeo del paso a producción

| # | Paso | Hecho |
|---|---|---|
| 1 | Original al día en el fork, sin commits sin portar ([union-con-original](union-con-original.md)) | ☐ |
| 2 | `HOSTS_PRODUCCION` con los dominios de la empresa; bloque `PRODUCCION` confirmado; decisión sobre `PRUEBAS` | ☐ |
| 3 | Servicio de Render de la empresa revisado: Auto-Deploy, Blueprint o manual, encabezados, dominio propio | ☐ |
| 4 | Pruebas con Firebase real hechas en el sandbox ([conexion-firebase](conexion-firebase.md)) | ☐ |
| 5 | Decisiones del responsable: plazo de migración y contenido del respaldo (lo del vendedor ya se decidió) | ☐ |
| 6 | Acceso de quien despliega al proyecto de Firebase de la empresa; alias `produccion` agregado (con aprobación) | ☐ |
| 7 | **Respaldo** completo de la base de la empresa | ☐ |
| 8 | Authentication (correo y contraseña) activo en la empresa; reglas de **transición** publicadas | ☐ |
| 9 | Pull Request aceptado → publicado → `/prueba.html` dice "producción" → el primer super-admin entra y migra | ☐ |
| 10 | Plazo de migración → pendientes con opción B → reglas **cerradas** → limpieza (fase 5) → cambio de contraseñas | ☐ |

Detalle de las fases de S1: [-02 → B.8](../-02-corrections/-02-corrections.md#b8-fases-de-despliegue-con-lista-de-chequeo). Cómo hacerlo sin arriesgar la operación (ensayo con copia real, ventana planeada y vuelta atrás): sección 6.

## 6. Plan de salida por etapas (2026-10-13)

Objetivo: probar la versión nueva **antes** de que la usen todos, sin arriesgar la operación de los negocios.

### 6.1 Por qué no se puede un piloto sobre la base real

La idea natural sería: unos pocos con la versión nueva sobre la base de la empresa y los demás con la vieja. **Con esta migración no funciona**, porque la versión nueva deja la base en un formato que la vieja no lee:

| Qué hace la versión nueva al entrar | Dónde (código) | Efecto en la versión vieja |
|---|---|---|
| Pasa la lista de negocios a `negocios_r/<id>` y retira `negocios` (queda copia en `negocios_bk`). Lo hace el primer ingreso de **cualquiera** | `migrarTablasGlobales` (`src/adaptadores/salida/firebase-datos.js`, `u['negocios']=null`) | La app vieja lee `data/negocios`: **deja de funcionar el ingreso para todos**, no solo para el piloto |
| Pasa las tablas de cada negocio (ventas, productos…) al formato por registro (`data_<neg>_<tabla>_r`) y retira la vieja | `migrarTablaVieja` (`u[clave]=null`) | Un equipo con la versión vieja en ese negocio ve sus ventas y productos **vacíos** |

La versión nueva sí entiende lo que escribe la vieja (lo vuelve a migrar), pero no al revés.

### 6.2 Etapa 1 — Ensayo general en el sandbox, con una copia real

Es la etapa que realmente evita fallas: se ensaya **la migración completa sobre los datos de verdad**, sin tocar a ningún usuario.

| # | Paso | Hecho |
|---|---|---|
| 1 | Export reciente de la base de la empresa (consola de Firebase → Realtime Database → ⋮ → Exportar JSON). Guardarlo en la raíz del proyecto: `*-rtdb-export.json` está en `.gitignore` | ☐ |
| 2 | `node scripts/preparar-pruebas.mjs <export>`: informe (sin contraseñas ni datos de clientes) y `importar-pruebas.json` | ☐ |
| 3 | Sandbox con las reglas de **transición**: `npm.cmd run reglas:transicion` | ☐ |
| 4 | Importar la copia: `npx.cmd firebase database:import / importar-pruebas.json -P pruebas` (reemplaza los datos del sandbox) | ☐ |
| 5 | Publicar la versión: `npm.cmd run publicar:sandbox`; abrir `wallacesys-dev-sandbox.web.app` y recargar sin caché | ☐ |
| 6 | Entrar como super-admin: la migración de tablas globales corre (aviso "Migración: N negocios y M usuarios…") | ☐ |
| 7 | Entrar con un usuario de **cada rol** de cada negocio (sus cuentas se migran al primer ingreso; las contraseñas cortas piden una nueva) | ☐ |
| 8 | Probar la operación: vender, cobrar, cuentas abiertas, abrir y cerrar caja, anular, inventario, citas, domicilios, gastos, reportes; **dos equipos a la vez**; **sin internet** un rato; celular; impresora térmica; lector de código de barras | ☐ |
| 9 | Revisar que las cifras coincidan con las de la versión vieja (Reportes, Contable, cierres de caja del export) | ☐ |
| 10 | Pantalla 🔐 Cuentas: todas migradas o con su plan (pendientes con contraseña temporal) | ☐ |
| 11 | Reglas **cerradas**: `npm.cmd run reglas:cerradas`, y repetir lo principal de los pasos 7 y 8 | ☐ |
| 12 | Opcional: 1 o 2 usuarios de confianza usan el sitio del sandbox **sabiendo que es una copia** (lo que vendan ahí no cuenta) y cuentan qué les resulta raro | ☐ |
| 13 | Anotar los problemas, corregirlos y **repetir** desde el paso 3 con un export nuevo hasta que salga limpio | ☐ |

Guía de pruebas con Firebase real: [conexion-firebase](conexion-firebase.md). Al terminar, el sandbox se puede volver a datos de prueba importando otra vez o borrando los nodos.

### 6.3 Etapa 2 — Cambio en producción, todos a la vez, en una ventana planeada

Cuando la etapa 1 salió limpia.

**Antes (días previos)**

| # | Paso | Hecho |
|---|---|---|
| 1 | Lista de chequeo de la sección 5 completa: `HOSTS_PRODUCCION`, Render revisado, unión con el original, decisiones | ☐ |
| 2 | Elegir la **ventana**: un momento en que ningún negocio esté vendiendo (de noche, o el día y la hora con menos movimiento) | ☐ |
| 3 | Avisar a los negocios: a qué hora, que cierren la app antes y que al volver recarguen; que su primer ingreso les puede pedir una contraseña nueva (si la tenían corta) | ☐ |
| 4 | Tener a mano el procedimiento para volver atrás (6.4) y saber quién decide | ☐ |

**En la ventana**

| # | Paso | Hecho |
|---|---|---|
| 1 | Confirmar que nadie está vendiendo (cerrar las cajas abiertas, o anotar cuáles quedan abiertas) | ☐ |
| 2 | **Respaldo completo** de la base de la empresa (export desde la consola). Guardarlo fuera de Git. Guardar también una copia de las **reglas** que tiene publicadas | ☐ |
| 3 | Authentication activo en el proyecto de la empresa; reglas de **transición** publicadas (alias `produccion` solo con aprobación) | ☐ |
| 4 | Publicar la versión nueva en el Render de la empresa (Pull Request aceptado y desplegado) | ☐ |
| 5 | Abrir el sitio de la empresa y `/prueba.html`: debe decir **producción** | ☐ |
| 6 | Tú entras primero como super-admin: se migran las tablas globales. Revisar el panel: negocios, usuarios, cifras | ☐ |
| 7 | Entrar a un negocio (supervisión): ventas, caja e inventario se ven completos | ☐ |
| 8 | Una venta de prueba en un negocio, y anularla. Verificar que la caja y el inventario queden bien | ☐ |
| 9 | Dar la señal a los negocios: recargar (Ctrl+Shift+R en computador; cerrar y abrir en celular) y entrar | ☐ |

**La primera hora**: estar disponible. Revisar la Auditoría (errores del sistema), que cada negocio haya podido entrar y vender, y el punto de conexión (verde). **Si algo grave falla, decidir dentro de esa hora** (6.4).

**Después**: cuando todas las cuentas hayan migrado (pantalla 🔐 Cuentas) o venza el plazo, los pendientes con contraseña temporal; luego reglas **cerradas** y la limpieza de la fase 5 ([-02 → B.8](../-02-corrections/-02-corrections.md#b8-fases-de-despliegue-con-lista-de-chequeo)).

Equipos que quedaron abiertos con la versión vieja: tienen que recargar. Mientras no lo hagan, lo que escriban en tablas viejas la versión nueva lo vuelve a migrar, pero lo que **lean** puede verse vacío.

### 6.4 Etapa 3 — Volver atrás (decidido antes de empezar)

| # | Paso |
|---|---|
| 1 | **Quién decide** y con qué criterio (por ejemplo: no se puede vender, se pierden datos, las cifras no cuadran) |
| 2 | Render → el servicio → *Deploys* → **Rollback** al despliegue anterior |
| 3 | Reglas de la base: volver a publicar las que había antes del cambio (la copia del paso 2 de la ventana) |
| 4 | Restaurar el **respaldo** del paso 2 de la ventana (consola de Firebase → Importar JSON en la raíz de la base) |
| 5 | Avisar a los negocios que recarguen |

⚠️ Restaurar el respaldo **borra lo registrado después del cambio**: la versión vieja no entiende el formato nuevo de las tablas, así que no se puede "volver" conservando lo nuevo. Por eso la ventana es en un momento sin ventas y la decisión se toma en la primera hora. Lo que se haya vendido entre el cambio y la vuelta atrás hay que anotarlo a mano (Historial e impresiones) para volver a cargarlo.

### 6.5 Alternativa descartada: piloto real con las dos versiones

Se podría cambiar la migración para que, durante la transición, **conserve también las listas y tablas viejas y las mantenga al día**, y así tener un piloto real sobre la base de la empresa. No se recomienda:
- es bastante trabajo en el adaptador de datos (escribir siempre en los dos formatos);
- arriesga que las dos copias de los datos queden distintas (dos verdades para el dinero y el inventario);
- para 6 negocios, el ensayo con la copia (6.2) más un cambio planeado (6.3) da la misma seguridad con menos riesgo.

Si en el futuro hay muchos más negocios y hace falta un piloto, se puede retomar como un proyecto aparte.
