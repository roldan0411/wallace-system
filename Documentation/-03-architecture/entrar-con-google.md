# "Entrar con Google" para los super-admins (pendiente)

> Decisión del 2026-10-12: es la forma recomendada de que los super-admins entren y recuperen su acceso. **Pendiente**. Mientras tanto se usa el **correo real** con el enlace de Firebase ([recuperar-contrasena](recuperar-contrasena.md), sección 9).

## 1. Por qué

| Lo que resuelve | Cómo |
|---|---|
| Que se olvide la contraseña, incluso el **único** super-admin | No hay contraseña nuestra: la recuperación la hace Google (correo alterno, teléfono…) |
| Verificación en dos pasos (TOTP / OTP) | La pone Google en la cuenta del dueño (Google Authenticator o SMS), sin costo y sin código nuestro. Hacerlo con Firebase exige Identity Platform y el plan Blaze |
| No exponer datos | No hace falta el índice público \`login/\`: el perfil sigue en \`perfiles/<uid>\` (solo lo leen la persona y los super-admins) |
| Costo | El proveedor Google de Firebase Authentication es gratis en el plan Spark |

Los **empleados** siguen con usuario y contraseña, porque muchos no tienen cuenta de Google o comparten el equipo, y con la recuperación asistida.

## 2. Lo que hay que hacer

### 2.1 En la consola de Firebase (lo hace el dueño del proyecto)
1. **Authentication → Método de acceso → Google → Activar** (correo de soporte del proyecto).
2. **Authentication → Configuración → Dominios autorizados**: agregar el dominio del sitio (Render o \`*.web.app\`). \`localhost\` ya viene.
3. Repetirlo en el proyecto de producción cuando se pase (\`paso-a-produccion.md\`).

### 2.2 En el código
| Pieza | Dónde |
|---|---|
| \`entrarConGoogle()\` (\`signInWithPopup\` con \`GoogleAuthProvider\`; \`signInWithRedirect\` en celulares, donde las ventanas emergentes fallan) | Adaptador \`firebase-cuentas.js\` + puerto \`cuentas.js\` |
| \`vincularGoogle()\` (\`linkWithPopup\`): un super-admin **ya en sesión** suma Google a su cuenta, con el mismo uid, el mismo perfil y sin tocar las reglas | Ídem |
| Botón "Entrar con Google" en el login (solo lleva a un perfil de super-admin; si la cuenta de Google no tiene perfil, "sin permisos") | \`ui/usuarios/sesion.js\` |
| "Vincular mi cuenta de Google" en el panel del dueño y el ayudante (al lado de "📧 Mi correo") | \`ui/usuarios/recuperacion.js\` o un módulo propio |
| Opcional: quitar la contraseña cuando Google ya está vinculado (\`unlink\` del proveedor de correo), para que solo se entre con Google | Ídem |
| La CSP: la ventana de Google sale del \`authDomain\` (\`*.firebaseapp.com\`, ya permitido en \`frame-src\`); comprobar con \`node scripts/probar-csp.mjs\` y en \`Report-Only\` en el sandbox que no haga falta \`apis.google.com\` | \`scripts/csp-politica.mjs\` |

### 2.3 Lo que no cambia
- Las **reglas**: miran \`perfiles/<auth.uid>\`, y vincular Google conserva el uid.
- El **vendedor**: también puede vincular su cuenta de Google; sus límites siguen siendo los de las reglas.

## 3. Cómo encaja con lo que ya existe

- Un super-admin que ya pasó a su **correo real** (sección 9 de recuperar-contrasena) y usa Gmail puede vincular Google sin perder nada: es la misma cuenta.
- El índice \`login/<usuario>\` sigue con la marca \`@correo\` ("entra con su correo"); con Google, ni lo usa.
- **Mantener dos super-admins** sigue siendo la mejor práctica: si alguien pierde también el acceso a su cuenta de Google, otro lo restablece.

## 4. Pruebas a agregar

- El emulador de Authentication simula Google (\`signInWithPopup\` abre una pantalla falsa del emulador): una prueba de navegador que vincule, salga y entre con Google.
- Una cuenta de Google **sin perfil** no entra a nada: "sin permisos" y la sesión se cierra.
- \`node scripts/probar-csp.mjs\` sin violaciones con el botón de Google.

## 5. Estado

| Paso | Estado |
|---|---|
| Decisión | ✅ 2026-10-12 |
| Activar Google en la consola (sandbox y producción) | ⏳ Pendiente (dueño del proyecto) |
| Código, CSP y pruebas | ⏳ Pendiente |
| Mientras tanto | ✅ Correo real con el enlace de Firebase ([recuperar-contrasena](recuperar-contrasena.md), sección 9) |
