# "Olvidé mi contraseña"

> Diseño del 2026-10-12, **fase 1 aplicada el mismo día** (sección 8). Antes no existía: las cuentas usan un **correo interno inventado** (`u<aleatorio>@usuarios.wallace-system.app`) que nadie recibe, y el procedimiento de emergencia está en [conexion-firebase](../-00-execution-protocol/conexion-firebase.md), sección 5.

## 1. Restricciones (por qué no es el botón de siempre)

| Restricción | Consecuencia |
|---|---|
| El correo de cada cuenta es interno (S1, decisión del 2026-10-08) | El "restablecer por correo" de Firebase (`sendPasswordResetEmail`) no le llega a nadie |
| Plan B, sin servidor (Spark, sin Cloud Functions) | Nadie puede **cambiarle** la contraseña a otro: solo se puede **reemplazar su cuenta** por una nueva (\`reemplazarCuenta\`, lo que ya hace el super-admin) |
| \`login/<usuario>\` se lee sin sesión (hace falta para entrar) | Si guardáramos ahí un correo real, cualquiera que adivine un usuario vería su correo |

## 2. Opciones

| Opción | Cómo | A favor | En contra |
|---|---|---|---|
| **A. Recuperación asistida** (recomendada ahora) | La persona pide el cambio desde el login; el super-admin verifica que es ella (por teléfono) y le genera una **contraseña temporal**; al entrar, la app la obliga a poner una nueva | Funciona con el plan gratuito y sin correos; no expone datos; deja rastro | Depende de que alguien atienda la solicitud |
| B. Correo real opcional | La persona registra su correo real y la cuenta pasa a usarlo; "olvidé" envía el correo de Firebase | Autoservicio, gratis | El correo real queda legible en \`login/\` para cualquiera que adivine el usuario (habría que rediseñar el índice); hay que verificar el correo |
| C. Autoservicio con código (Plan A) | Una Cloud Function envía un código por SMS, WhatsApp o correo y cambia la contraseña con el Admin SDK | Lo más cómodo | Exige el plan Blaze y un proveedor de SMS o WhatsApp |

**Propuesta**: **A ahora**, con dos mejoras por fases (sección 6). B solo si se decide guardar correos reales, y C cuando haya plan Blaze.

## 3. El proceso (opción A)

### 3.1 Quien olvidó la contraseña
1. En el login: **"¿Olvidaste tu contraseña?"**.
2. Escribe su **usuario** y un **teléfono o WhatsApp** de contacto (opcional).
3. La app guarda la solicitud y responde siempre lo mismo: *"Listo. El administrador te contactará para darte una contraseña temporal."*. Así no confirma ni niega que el usuario existe.
4. Cuando le den la temporal, entra con ella y la app le pide **una nueva de inmediato**. No puede seguir sin cambiarla.

### 3.2 El super-admin (dueño o ayudante; el vendedor, solo la gente de sus negocios)
1. En el panel aparece la tarjeta **"🔑 Solicitudes de contraseña (N)"**: usuario, negocio, rol, contacto y hace cuánto.
2. **Verifica que es la persona** antes de hacer nada. La app lo recuerda con un texto fijo: *llama al dueño del negocio al número que tienes registrado, no al que dejó la solicitud.* Esto evita que alguien pida la cuenta de otro.
3. **"Generar contraseña temporal"**:
   - reemplaza la cuenta con una contraseña al azar de 10 caracteres (\`reemplazarCuenta\` + \`Cripto.claveAleatoria\`, lo mismo que las demos);
   - marca el perfil con \`debeCambiarPass: true\`;
   - muestra la temporal **una sola vez** para dictarla.
4. La solicitud queda **resuelta** (quién y cuándo) y una línea va a la auditoría del negocio: *"Se restableció la contraseña de Ana (por Roldán)"*. También se puede **descartar** si no era la persona.

### 3.3 Cambio obligatorio al entrar
- Con \`debeCambiarPass: true\` en el perfil, después del login se abre la ventana "Elige tu contraseña nueva" (mínimo 6 caracteres, dos veces).
- Al guardarla, \`Cuentas.cambiarMiPass(temporal, nueva)\` y \`debeCambiarPass: false\`.
- Hasta entonces no se puede usar ninguna pantalla.

## 4. Datos y reglas

\`recuperaciones/<claveUsuario>\` (en la raíz, como \`login\`):

| Campo | Tipo | Notas |
|---|---|---|
| \`usuario\` | texto | La clave del usuario (\`Dominio.cuentas.claveUsuario\`) |
| \`contacto\` | texto | Opcional, máx. 40 |
| \`fecha\` | número | Hora del servidor (\`now\`) |
| \`estado\` | texto | \`pendiente\` → \`resuelta\` / \`descartada\` |
| \`resueltaPor\`, \`resueltaEn\` | texto / número | Lo pone el super-admin |

Reglas (cerradas):
- **Crear sin sesión**, con límites:
  - solo si el usuario existe en \`login/\` (no hay basura con nombres al azar);
  - una por usuario: no existe o la anterior tiene más de 1 hora;
  - \`estado\` = \`pendiente\`;
  - \`fecha\` = \`now\`;
  - texto acotado.
- **Leer y cambiar**: el dueño y el ayudante; el vendedor, solo las de gente de sus negocios (como en la sección 12 de [01-super-admin-panel](../01-super-admin-panel/01-super-admin-panel.md)).
- \`perfiles/<uid>/debeCambiarPass\`: lo pone el super-admin; **la propia persona solo puede ponerlo en \`false\`**.

\`debeCambiarPass\` va a \`src/dominio/cuentas.js\` (la regla de \`CLAUDE.md\`: datos que leen las reglas se calculan en el dominio).

## 5. Riesgos y cómo se cubren

| Riesgo | Cubierto por |
|---|---|
| Alguien pide la cuenta de otro | La verificación por teléfono al número registrado; la temporal solo la recibe quien llamó el super-admin |
| Llenar la base de solicitudes | Solo usuarios que existen, una por hora, sin lectura pública |
| Saber si un usuario existe | La respuesta es siempre la misma (y \`login/\` ya permite consultarlo: no se abre nada nuevo) |
| La temporal queda en uso | Cambio obligatorio al entrar; la temporal se muestra una sola vez y no se guarda |
| Se olvida el **único** super-admin | No lo resuelve este proceso: tener **siempre dos super-admins**; si no, el procedimiento de consola (conexion-firebase, sección 5) |

## 6. Fases

1. **Fase 1 (Plan B, ya posible)**: secciones 3 y 4, resuelto por los super-admins.
2. **Fase 2**: que el **administrador de cada negocio** resuelva las de sus empleados, sin esperar al proveedor. Pide reglas como las del vendedor: crear y reemplazar cuentas solo de la gente de **su** negocio y nunca de un rol mayor.
3. **Fase 3 (si hay plan Blaze)**: autoservicio con código por SMS o WhatsApp (opción C), y el procedimiento asistido como respaldo.

## 7. Pruebas

- Reglas:
  - crear sin sesión: sí para un usuario real, no para uno inventado, no dos veces seguidas;
  - leer sin sesión: no;
  - el vendedor solo ve lo suyo;
  - la persona solo pone \`debeCambiarPass\` en \`false\`.
- Navegador con reglas cerradas: pedir, resolver (la temporal funciona y la vieja no) y cambio obligatorio al entrar.
- Dominio: \`debeCambiarPass\` en el perfil.

## 8. Lo aplicado (2026-10-12, fase 1)

| Pieza | Dónde |
|---|---|
| Reglas puras: `solicitudRecuperacion(usuario, contacto)`, `recuperacionesPendientes`, `debeCambiarPass(perfil)`, `RECUPERACION_ESPERA_MS`, `CONTACTO_MAX` | `src/dominio/cuentas.js` |
| `pedirRecuperacion` (sin sesión, hora del servidor), `escucharRecuperaciones`, `cerrarRecuperacion`, `quitarDebeCambiarPass` | Puerto `cuentas.js` + `firebase-cuentas.js` |
| Pantalla: "¿Olvidaste tu contraseña?" en el login, tarjeta "🔑 Solicitudes de contraseña" en el panel, "Generar temporal" / "Descartar", pantalla "Elige tu contraseña" | `ui/usuarios/recuperacion.js` (nuevo) + `usuarios/sesion.js`, `nucleo/navegacion.js`, `super-admin/panel.js` |
| Reglas `recuperaciones/` y `perfiles/<uid>/debeCambiarPass` | `database.rules.json` y `database.rules.transicion.json` |

**Diferencias con el diseño**:
- **Solo el dueño y el ayudante** ven y resuelven las solicitudes. El vendedor no: la solicitud no sabe de qué negocio es, así que no hay una consulta que las reglas puedan limitar a lo suyo. Si hace falta, sería parte de la fase 2.
- Si la persona acaba de escribir la temporal en el login, la pantalla de cambio no se la pide otra vez (se recuerda solo en memoria hasta usarla). Si entró con una sesión guardada, sí se pide.
- La nueva tiene que ser distinta de la temporal.
- En **modo local** (sin nube) el enlace dice que el administrador le cambie la contraseña en Usuarios, como siempre.
- `database.rules.transicion.json` se reescribió con formato JSON estándar (sin las líneas en blanco de antes), al agregarle los dos bloques.

**Probado**:
- `tests/dominio/cuentas.test.mjs`.
- `tests/reglas/reglas.test.mjs`, con las reglas cerradas:
  - sin sesión se pide para un usuario real, no para uno inventado, no dos veces seguidas, y no con otra hora, estado o campos;
  - la lista no la ve nadie sin sesión, ni un cajero, ni un vendedor; el dueño la ve y el ayudante la resuelve;
  - `debeCambiarPass`: la persona solo lo quita, no lo pone ni toca el de otro.

  Y con las de transición, crear y leer.
- `tests/navegador/s1-navegador.test.mjs` contra los emuladores: pedir desde el login, el dueño genera la temporal (queda en la auditoría del negocio y la solicitud queda resuelta), la contraseña vieja ya no entra, con la temporal aparece el cambio obligatorio, y con la nueva entra.

**Para el sandbox**: publicar las reglas (`npm.cmd run reglas:cerradas`). Sin eso las solicitudes se rechazan y la persona ve igual el mensaje de "solicitud enviada".

## 9. Super-admin con correo real (aplicado el 2026-10-12)

Resuelve que se olvide el **único** super-admin, mientras no se active "Entrar con Google" ([entrar-con-google](entrar-con-google.md), pendiente).

**Para qué**: la recuperación asistida (secciones 3 a 8) necesita que **otro** super-admin genere la temporal. El dueño del sistema que está solo no tiene a quién pedírsela. Con su correo de verdad, Firebase le manda el enlace para cambiar la contraseña, sin servidor y gratis.

**Cómo se usa** (dueño o ayudante, con la base en la nube):
1. Panel → **"📧 Mi correo"**: correo real, contraseña actual (se vuelve a verificar), y la contraseña con la que entrará (puede ser la misma).
2. La app crea una cuenta nueva de Authentication con ese correo y le manda el correo de **verificación**. El perfil pasa a la cuenta nueva (con `correoReal`) y la vieja queda sin perfil, es decir, sin acceso. Se cierra la sesión.
3. Desde ahí entra escribiendo **el correo** en "Usuario". Si escribe su usuario de antes, la app le dice: *"Esta cuenta entra con su correo electrónico"*.
4. **Olvidó la contraseña**: "¿Olvidaste tu contraseña?" con el correo envía el enlace de Firebase. La respuesta es la misma exista o no la cuenta. Elige la nueva en la página de Firebase y entra.

**Por qué el correo no queda expuesto**: el índice `login/<usuario>` se lee sin sesión (lo necesita el login). Si guardara el correo real, cualquiera que adivinara el usuario del dueño lo vería. Por eso, para estas cuentas, el índice guarda solo la marca `{correo:'@correo', uid}`: dice que la cuenta entra con correo, no cuál. El correo vive en Authentication y en `perfiles/<uid>.correoReal`, que solo leen la persona y los super-admins.

| Pieza | Dónde |
|---|---|
| `MARCA_SOLO_CORREO`, `esCorreo`, `esCorreoInterno`, `correoRealValido`, `entraConCorreo` | `src/dominio/cuentas.js` |
| Entrar con el correo (sin índice) y el aviso `usa_correo` | `src/aplicacion/servicios/sesion.js` |
| `restablecerPorCorreo`, `confirmarMiPass`, `crearCuentaConCorreo` (con verificación), `pasarCuentaACorreo`; error `correo_en_uso` | Puerto `cuentas.js` + `firebase-cuentas.js` |
| "📧 Mi correo" (`pasarAMiCorreo`) y "olvidé" con correo | `ui/usuarios/recuperacion.js`, `ui/super-admin/panel.js` |

**Límites**:
- **Solo dueño y ayudante.** El vendedor no puede escribir perfiles de super-admin (reglas); recupera la suya con la solicitud asistida.
- Si **otro** super-admin le restablece la contraseña (solicitud asistida o Administradores), la cuenta vuelve a usuario y contraseña. Puede volver a pasarla a su correo.
- Si escribe mal el correo, el enlace no le llegará: por eso se manda la verificación. Que la revise.
- Las reglas **no cambiaron**: el dueño o el ayudante ya podían escribir perfiles e índice.

**Probado**:
- Dominio (`tests/dominio/cuentas.test.mjs`).
- Servicio de sesión con dobles (`tests/aplicacion/sesion.test.mjs`): entra con el correo; con el usuario recibe `usa_correo`.
- Navegador contra los emuladores (`tests/navegador/s1-navegador.test.mjs`):
  - el dueño pasa a su correo y el índice público no lo contiene;
  - con el usuario ya no entra y con el correo sí;
  - "olvidé" manda la verificación y el enlace;
  - con el enlace cambia la contraseña y entra con la nueva.

## 10. Corrección del 2026-10-13: la propia cuenta

Un super-admin **no** puede generar una temporal para su propia cuenta. Hacerlo reemplazaba la cuenta de la sesión abierta, la app cerraba la sesión y la temporal se perdía (V7 en [-01](../-01-to-review/-01-to-review.md)). Para la suya: "🔑 Mi contraseña" si la recuerda, o "📧 Mi correo" para poder recuperarla sin depender de nadie. Además, ahora la temporal se muestra apenas se crea la cuenta, antes de los pasos que pueden fallar.
