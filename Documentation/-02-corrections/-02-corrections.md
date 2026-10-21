# 02 — Correcciones de seguridad y datos

Registro de las correcciones aplicadas a `app.js` para los hallazgos de **seguridad (S)** y **datos (D)** listados en [-01-to-review](../-01-to-review/-01-to-review.md). Cada sección indica el error original, qué se cambió, dónde, cómo se comporta ahora, cómo se probó y lo que queda pendiente.

- Versión base: commit `15b243d`. Cambios sin commit en `app.js` (+446 / −116 líneas).
- Las rutas `ui/…` son de la interfaz en `src/adaptadores/entrada/` (hasta el 2026-10-08 era un solo `app.js`); las demás rutas son relativas a `src/` (ver [-03-architecture](../-03-architecture/-03-architecture.md) y su [mapa de la interfaz](../-03-architecture/mapa-interfaz.md)).

## Resumen

| ID | Error original | Estado | Dónde |
|---|---|---|---|
| S1 | Base de datos sin autenticación ni reglas | 🟡 **Implementado (Plan B) y probado en emuladores**; falta configurar Firebase y desplegar por fases | `dominio/cuentas.js`, `aplicacion/servicios/sesion.js`, `adaptadores/salida/firebase-cuentas.js`, `firebase-datos.js`, `database.rules*.json` |
| S2 | Contraseñas en texto plano, descargadas a todos los equipos y visibles en el panel | ✅ Corregido (con alcance limitado, ver residual) | `dominio/contrasenas.js` (reglas) y `ui/usuarios/sesion.js` (`ponerPass`, `migrarContrasenas`), `login`, formularios de usuario |
| S3 | Contraseña inicial del super-admin escrita en `app.js` | ✅ Corregido | `seed` (`ui/nucleo/arranque.js`), configuración inicial (`ui/usuarios/sesion.js`) |
| S4 | Permisos validados solo ocultando botones | ✅ Corregido | `exigirPermiso`, `esAdminSistema`, `puedeVerPantalla` (768–799) y más de 25 funciones |
| S5 | Todos los roles aterrizaban en el Dashboard | ✅ Corregido | `pantallaValida` (794), `login` |
| S6 | El nombre de una categoría ejecutaba código dentro de un `onclick` (XSS almacenado) | ✅ Corregido (fase 8, 2026-10-09) | `ui/ventas/nueva-venta.js`, `ui/inventario/catalogo.js`, `ui/nucleo/eventos.js` |
| S8 | El logo del negocio y otros datos dentro de atributos HTML sin validar ni escapar (XSS almacenado con escalada al super-admin) | ✅ Corregido (2026-10-12) | `logoNegocio` (`ui/nucleo/componentes.js`), `Dominio.negocio.logoValido`, 151 atributos con `escapeHtml`, `database.rules*.json` |
| D1 | Consecutivo de factura repetible entre equipos | ✅ Corregido | `reservarFactura` / `siguienteFactura` (2256–2290) |
| D2 | Stock "última escritura gana" | ✅ Corregido | `cambiarStock` (3581) y todos los que mueven stock |
| D3 | Recortes de historial que no recortaban | ✅ Corregido | `logAudit`, `moverInventario`, `guardarConteo` |
| D4 | `conceptos_gasto` sin sincronizar | ✅ Corregido | `TABLAS` / `TABLAS_UNICAS` (22, 73) |
| D5 | Apertura de caja simultánea | ✅ Corregido (también el cierre) | `abrirCaja`, `cerrarCaja`, `transaccionUnica` (4024–4180) |
| D6 | Pedido de otro turno (o cobrado sin caja) fuera de todo cierre | ✅ Corregido (2026-10-12) | `abrirCobro` (`ui/ventas/cobro.js`), `ventasJornada` (`ui/ventas/pedidos.js`) |
| D7 | Movimientos de caja sin transacción | ✅ Corregido (2026-10-12) | `agregarMovimientoCaja` (`ui/caja/caja.js`) |
| D8 | Conteo: lo vendido durante el conteo se restaba dos veces | ✅ Corregido (2026-10-12) | `contarItem`, `stockActualDe` (`ui/inventario/conteo.js`) |
| D9 | Dos equipos con el mismo pedido o cuenta se pisaban (productos perdidos, cobros a ciegas, doble stock) | ✅ Corregido (2026-10-12) | `Datos.transaccionRegistro`, `Dominio.ventas.agregarACuenta/cobrarSiSigueIgual/anularSiSigueIgual/editarSiSigueIgual` |
| D10 | Lo que la base rechazaba (prueba vencida) se perdía en silencio | ✅ Corregido (2026-10-12) | `negocioSoloLectura`, `exigirEscritura` (`ui/nucleo/permisos.js`), ganchos `soloLectura` / `alEscrituraNegada` |
| S9 | Montos negativos aceptados (sacar efectivo cuadrando la caja) | ✅ Corregido (2026-10-12) | `Dominio.pagos.montoValido/pagosValidos`, cobro, ajuste, forma de pago, precios |
| S10 | Auditoría y movimientos borrables por empleados | ✅ Corregido (2026-10-12) | `database.rules.json` (solo agregar) |
| F24–F28, S11, C4 | Eliminar/cambiar pago en cajas cerradas, agotado en el escáner, descuentos, ventanas diferidas, borrar productos de combos, permiso al confirmar edición, errores tragados | ✅ Corregido (2026-10-12) | Detalle en [-01](../-01-to-review/-01-to-review.md#tercera-revisión-2026-10-12) |

Además, como parte de S2, se agregó la casilla **"Usuario activo"** al formulario de usuarios (hallazgo F7).

## ⚠️ Antes de desplegar

1. **Descargar un respaldo** (Panel super-admin → "💾 Respaldo"). Al primer arranque, la versión nueva convierte **todas** las contraseñas a hash y borra el texto plano de la nube. Es irreversible: si después se vuelve a publicar el `app.js` anterior, **nadie podrá iniciar sesión** (el código viejo compara contra `pass`, que ya no existe). Para volver atrás habría que restaurar el respaldo.
2. **Pedir recarga forzada** (Ctrl+Shift+R) en todos los equipos. Un equipo con el `app.js` viejo en caché no podrá iniciar sesión hasta recargar.
3. Las contraseñas **no cambian** para los usuarios: entran con la misma de siempre.
4. Si la base de datos de producción está vacía de super-admins (no debería), el primer navegador que abra la app verá la pantalla de configuración inicial.

---

## S1 — Base de datos sin autenticación ni reglas 🟡 Implementado, falta desplegar

**Error**: la app no usa Firebase Authentication; las reglas de Realtime Database tienen que estar abiertas para que funcione, así que cualquiera con la URL de la base puede leer y modificar todo.

### Implementación (Plan B) — qué hay en el repositorio

| Pieza | Archivo | Qué hace |
|---|---|---|
| Dominio | `src/dominio/cuentas.js` | `claveUsuario` (clave válida para Firebase), `correoInterno` (aleatorio), `perfilDesdeUsuario` / `perfilDesdeSuperAdmin`, `usuarioDesdePerfil`, `estadoMigracion` y `resumenMigracion` (pantalla de migración), lista de campos reservados del negocio. |
| Puerto | `src/aplicacion/puertos/cuentas.js` | Contrato de cuentas (entrar, salir, crear propia/ajena, perfiles, índice, leer tablas viejas). Pasar al Plan A solo cambia el adaptador. |
| Caso de uso | `src/aplicacion/servicios/sesion.js` | `iniciarSesion` (B.5.1 + migración B.6 con pedido de contraseña nueva si tenía < 6) y `restaurar` (sesión guardada). Retira la clave vieja al migrar. |
| Adaptador | `src/adaptadores/salida/firebase-cuentas.js` | Firebase Auth + `login/` + `perfiles/`; instancia secundaria "altas" (en cola) para crear cuentas de otros sin cerrar la sesión. |
| Adaptador de datos | `src/adaptadores/salida/firebase-datos.js` | Con `estado.cuentas`: `negocios` ↔ `data/negocios_r/<id>` (por campo; el empleado nunca envía campos reservados), `usuarios` ↔ `data_<neg>_usuarios_r` sin contraseñas, `cargarNegocioPropio`, `migrarTablasGlobales` (una sola vez), `modificarUsuariosLegado`. Una ruta negada ya no bloquea la cola offline. |
| Interfaz | `ui/usuarios/sesion.js`, `cuentas.js`, `migracion-cuentas.js` | Login con cuentas (`hacerLoginCuentas`, `entrarConPerfil`, sesión guardada al recargar, perfil y negocio escuchados en vivo: desactivar o suspender saca a la persona). Gestión de cuentas del super-admin (`crearCuentaPara`, `reemplazarCuenta`, `sincronizarPerfil`, `borrarCuentaDe`), "Mi contraseña" con Firebase, pantalla **🔐 Cuentas** (migración). Sin nube, todo sigue como antes (modo local). |
| Reglas | `database.rules.json` (finales) y `database.rules.transicion.json` (fases 0–3) | Ver B.4; diferencias abajo. |
| CLI | `firebase.json`, `firebase.transicion.json`, `.firebaserc` | Solo existe el alias `pruebas`. `npm run reglas:transicion` / `npm run reglas:cerradas`. |
| Entornos | `firebase-config.js` | Producción solo en `HOSTS_PRODUCCION`; `localhost` y otros dominios → pruebas (o modo local si no está configurado); `?emulador` → emuladores. La pantalla de login dice el entorno si no es producción. |

**Cambios frente al diseño de B.4** (encontrados al implementar y probar):
- El admin del negocio edita Mi Negocio si su perfil tiene `editaNegocio: true` (rol `admin` **o** pantalla `config`, igual que el menú). En producción hay usuarios con rol `dueno` que usan Mi Negocio; con `rol === 'admin'` habrían quedado bloqueados.
- Los empleados **leen** `data_<neg>_usuarios_*` pero no lo escriben (si no, un cajero podría cambiarse el rol en la lista del negocio).
- Reglas de transición: `data` sigue abierto, pero cada cuenta solo **crea** su propio perfil y su entrada del índice (no puede cambiarlos después ni tocar los de otros).
- Al migrar, la contraseña vieja se retira (el empleado sale de `data/usuarios`; al super-admin se le borra el hash). Así una contraseña vieja no da el aviso falso de "cuenta ya activada".
- La migración de tablas globales (`negocios` → `negocios_r`, usuarios → por negocio) la hace **el primer ingreso de cualquiera** con las reglas de transición, en una sola escritura atómica marcada en `data/migracion_s1`. El array viejo queda en `data/negocios_bk`.

### Cómo se probó

| Comando | Qué cubre | Resultado |
|---|---|---|
| `npm test` | Dominio de cuentas y servicio de sesión con dobles (migración, contraseña corta, cancelar, inactivo, reglas cerradas, cuenta tomada, sin perfil) | 40/40 |
| `npm run test:firebase` → `tests/reglas/` | Reglas cerradas y de transición en el emulador oficial: aislamiento, prefijos (`N1` no ve `N10`), suspendido, inactivo, cuenta sin perfil, campos reservados, update multi-ruta, transacción de factura | 15/15 |
| → `tests/integracion/` | Adaptadores reales contra emuladores de Auth y Database: fase 2 (dueño y empleados migran, tablas globales), fase 4 (reglas cerradas), cuenta creada por el super-admin, desactivación | 5/5 |
| → `tests/navegador/` | `index.html` + la interfaz en Chrome sin ventana: login con aviso de entorno, migración, contraseña corta, Mi Negocio, recarga con reglas cerradas, pantalla 🔐 Cuentas, modo local (configuración inicial, crear negocio, F6, F12), sin errores de JavaScript | 7/7 |

No se probó contra un proyecto real de Firebase (no existe todavía el de pruebas) ni en celulares.

### Despliegue paso a paso

**Fase 0 — Proyecto de pruebas** (responsable del proyecto en la consola, ver [-00 → 9.2](../-00-execution-protocol/-00-execution-protocol.md#92-lo-que-hace-el-responsable-del-proyecto-requiere-su-cuenta-de-google)):
1. Crear `wallace-system-pruebas`, Realtime Database (us-central1) y *Authentication → Email/Password*.
2. Poner su ID en `.firebaserc` (reemplazar `wallace-system-pruebas-cambiar`) y su configuración web en `PRUEBAS` de `firebase-config.js` (`npx firebase apps:sdkconfig WEB <id> -P pruebas`).
3. `node scripts/preparar-pruebas.mjs <export>.json` → `npx firebase database:import / importar-pruebas.json -P pruebas`.
4. `npm run reglas:transicion` → probar en `http://localhost:3000` (`npm start` o `npx serve`) con el [protocolo de verificación](../-00-execution-protocol/-00-execution-protocol.md#7-protocolo-de-verificación-smoke-test) → entrar primero como dueño del sistema, luego un usuario de cada rol.
5. `npm run reglas:cerradas` → repetir las pruebas 1–15 de B.9.

**Fases 1–5 en producción**: igual que B.8. Para producción hay que agregar el alias (`npx firebase use --add` → `produccion`) solo en ese momento, llenar `HOSTS_PRODUCCION` en `firebase-config.js` antes de publicar, y desplegar con `--config firebase.transicion.json -P produccion` (fase 2) y luego sin `--config` (fase 4).

**Pendiente de decidir**: plazo de migración; si el respaldo debe incluir `perfiles/` y `login/` (hoy solo `data`). **Decidido (2026-10-12)**: el super-admin vendedor ve y toca solo sus negocios y sus demos ([01-super-admin-panel](../01-super-admin-panel/01-super-admin-panel.md), sección 12).

### Diseño original

**Por qué no se aplicó antes**: no se puede resolver solo con código.
- Hay que activar Firebase Authentication en la consola del proyecto y crear una cuenta de Firebase por cada usuario existente (se necesita el Admin SDK o un proceso de migración en el login).
- Las reglas de seguridad nuevas exigirían autenticación: si se publican antes de que la app la use, **la app deja de funcionar para todos**.
- Implica decidir el modelo de cuentas (correo vs. usuario, quién crea las cuentas, recuperación de contraseña).

**Base común de los dos planes** (detalle de reglas, código y pruebas en [-01-to-review → Cómo resolver S1](../-01-to-review/-01-to-review.md#cómo-resolver-s1)):
1. Activar *Email/Password* en Firebase Authentication. Cada usuario entra con un correo interno derivado de su usuario (`cajero1` → `cajero1@usuarios.wallace-system.app`) que nunca ve.
2. Nodo `perfiles/<uid>` con `negocioId` y rol, escrito solo por el super-admin.
3. Reglas (`database.rules.json`) que limitan `data/data_<negId>_*` al negocio del usuario y el resto al super-admin.
4. Desplegar por fases: app nueva con reglas abiertas → esperar a que todos migren → cerrar reglas.

La diferencia entre los planes está en **quién crea las cuentas y cambia contraseñas**: un servidor de Firebase (Plan A, de pago por uso) o el propio navegador del super-admin con algunos rodeos (Plan B, gratis).

> **Decisión actual: Plan B** (sin pago por uso). El Plan A queda documentado para cuando se active Blaze. Los dos usan las mismas reglas y el mismo nodo `perfiles`, así que pasar de B a A después no obliga a rehacer nada: solo se agregan las funciones y se simplifica la app.

### Plan A — Con Cloud Functions (plan Blaze, pago por uso)

**Qué es**: pequeñas funciones que corren en servidores de Google con el **Admin SDK**, que puede hacer lo que el navegador no puede: crear cualquier cuenta, cambiarle la contraseña a otro usuario, desactivarlo. La app las llama con `firebase.functions().httpsCallable('nombre')`; Firebase le pasa a la función quién la está llamando (`req.auth.uid`), así que la función verifica el rol antes de hacer nada.

**Requisitos**
- Plan **Blaze** en el proyecto (pide medio de pago). El nivel gratuito de Cloud Functions incluye del orden de 2 millones de invocaciones al mes (verificar en la página de precios de Firebase); este sistema usaría unas pocas por día (altas y cambios de contraseña).
- Configurar una **alerta de presupuesto** en Google Cloud (p. ej. 5 USD) para enterarse de cualquier consumo inesperado.
- `firebase-tools` instalado y la carpeta `functions/` (Node 20) en el repositorio.

**Funciones**

| Función | Quién puede llamarla | Qué hace |
|---|---|---|
| `gestionarUsuario({accion:'crear', usuario, pass, negocioId, rol, nombre})` | Super-admin (opcional: admin del mismo negocio) | Crea la cuenta en Firebase Auth y su `perfiles/<uid>`. Rechaza usuarios repetidos. |
| `gestionarUsuario({accion:'cambiarPass', usuario, pass})` | Super-admin; admin del negocio para sus empleados | Cambia la contraseña de otra persona. |
| `gestionarUsuario({accion:'desactivar'\|'activar', usuario})` | Super-admin; admin del negocio | `disabled:true/false` en Auth: no puede iniciar sesión. |
| `gestionarUsuario({accion:'eliminar', usuario})` | Super-admin | Borra la cuenta y su perfil. |
| `migrarCuenta({usuario, pass})` | Cualquiera (sin sesión) | Busca el usuario en `data/usuarios` o `data/superadmins`, compara la contraseña **en el servidor** con su `passHash` (misma fórmula que `hashPass` de `app.js`) y, si coincide y la cuenta aún no existe, crea la cuenta con esa contraseña y su perfil. Limitar intentos por usuario (p. ej. 5 por hora) para frenar fuerza bruta. |
| `crearDemo({tipo})` (opcional) | Super-admin y vendedor | Crea el negocio demo y su usuario admin en el servidor. |

Cada función: (1) rechaza llamadas sin sesión salvo `migrarCuenta`; (2) lee `perfiles/<req.auth.uid>` y verifica el rol; (3) valida los datos (usuario único, contraseña mínima); (4) escribe en Auth y en `perfiles`; (5) deja un registro en `auditoria` del negocio.

**Cambios en la app**
- Login: `signInWithEmailAndPassword`; si la cuenta no existe, llama `migrarCuenta` y reintenta. El usuario no nota nada.
- Formularios de usuarios (`editarUsuario`, `cambiarPassNeg`, `eliminarUsuario`, `nuevoNegocio`, `crearDemoDeTipo`) llaman `gestionarUsuario` en lugar de escribir en `data/usuarios`.
- "Mi contraseña": `user.updatePassword()` (no necesita función).

**Fases**
1. Proyecto de prueba con copia de los datos; desplegar funciones y app nueva; probar.
2. Producción: activar Blaze + alerta; desplegar funciones.
3. Publicar la app nueva (reglas aún abiertas). Cada usuario migra al entrar.
4. A quien no haya entrado en el plazo acordado, el super-admin le pone contraseña nueva con `gestionarUsuario`.
5. Publicar las reglas cerradas. Borrar `passHash`/`passSal` de `data/usuarios`.

**Ventajas**: todo se gestiona desde la app; la migración verifica contraseñas en el servidor; el admin del negocio puede administrar a sus empleados de forma segura; no quedan cuentas huérfanas.
**Desventajas**: requiere medio de pago y vigilar el presupuesto; una pieza más que desplegar (`functions/`).

### Plan B — Sin pago por uso (plan Spark, gratuito) ✅ elegido de momento

#### B.1 Resumen

Todo lo hace el navegador con Firebase Authentication (gratuito) y reglas de Realtime Database (gratuitas). No hay servidor propio ni Cloud Functions. El resultado final protege los datos igual que el Plan A: base cerrada, cada negocio aislado, contraseñas fuera de los navegadores. Lo que cambia es **cómo se administran las cuentas**, porque el navegador no puede tocar la cuenta de otra persona; para eso se usan los rodeos de B.5.

**Qué cambia para cada persona**

| Persona | Antes | Después |
|---|---|---|
| Empleado | Entra con usuario y contraseña. | Igual. El primer ingreso después del cambio crea su cuenta de Firebase sin que lo note. Si su contraseña tiene menos de 6 caracteres, ese día se le pide una nueva (B.6). |
| Empleado en un equipo nuevo | Entraba incluso sin internet. | El **primer** ingreso en cada equipo necesita internet. Después la sesión queda guardada y funciona sin conexión como hoy. |
| Admin del negocio | Cambia contraseñas de sus empleados. | Cambia solo **su propia** contraseña. Las de los empleados las cambia el super-admin (B.12). |
| Super-admin | Crea negocios y usuarios. | Igual, desde el mismo panel. Tiene una pantalla nueva de **Migración de cuentas** durante la transición. |
| Negocio suspendido | La app no lo dejaba entrar (control en el navegador). | Además **la base de datos** le niega los datos aunque alguien manipule la app. |

#### B.2 Glosario

- **Firebase Authentication (Auth)**: servicio de Google que guarda cuentas (correo + contraseña) y las verifica en sus servidores. Cada cuenta tiene un identificador fijo, el **uid**.
- **Correo interno**: correo inventado que identifica la cuenta en Auth (p. ej. `u7k2m9xq@usuarios.wallace-system.app`). Nadie lo ve ni lo recibe; el usuario sigue escribiendo su nombre de usuario.
- **Índice de login**: tabla `login/<usuario>` que dice qué correo interno corresponde a cada nombre de usuario.
- **Perfil**: `perfiles/<uid>`, dice a qué negocio pertenece la cuenta, su rol y sus permisos. Es lo que leen las reglas.
- **Reglas**: archivo `database.rules.json` que Firebase evalúa en cada lectura y escritura.
- **Instancia secundaria**: una segunda conexión de Firebase dentro de la misma página, usada solo para crear cuentas sin cerrar la sesión del super-admin.

#### B.3 Modelo de datos nuevo

```
login/
  <claveUsuario>: { correo: "u7k2m9xq@usuarios.wallace-system.app", uid: "<uid>" }

perfiles/
  <uid>: {
    usuario: "cajero1", nombre: "Ana",
    rol: "cajero",                 // admin | cajero | mesero | cocina | vendedor | dueno | superadmin
    rolSuper: null,                // solo super-admins: dueno | ayudante | vendedor
    negocioId: "N1",               // null para super-admins
    activo: true,
    pantallas: [...], permisos: [...], sucursales: [...],
    migradoEn: "2026-11-02T14:00:00Z", creadoPor: "<uid del super-admin>"
  }

data/
  negocios_r/<negId>: { ...mismo registro de hoy... }          // antes: data/negocios (un array)
  data_<negId>_usuarios_r/<id>: { id, nombre, usuario, rol, pantallas, permisos,
                                  sucursales, activo, uid }    // antes: data/usuarios (global, con contraseñas)
  superadmins: [...]                                           // sigue global, sin contraseñas al final
  data_<negId>_<tabla>_r/...                                   // sin cambios
```

Decisiones de diseño:
- **El correo interno es aleatorio**, no derivado del nombre de usuario. Así no hay problemas con usuarios con tildes, ñ, espacios o mayúsculas (que no son válidos en un correo), y "cambiar contraseña de otro" puede crear una cuenta nueva con otro correo.
- **`claveUsuario`**: Firebase no permite `. $ # [ ] /` en las claves. Se codifica el nombre de usuario (p. ej. `encodeURIComponent` + reemplazar `.` por `%2E`). Se conserva la distinción entre mayúsculas y minúsculas, como hoy.
- **`negocios` por registro**: las reglas no pueden dar acceso a "solo el elemento 3 de un array", por eso cada negocio pasa a su propio nodo.
- **Usuarios por negocio**: la tabla `data_<negId>_usuarios` ya existe en `TABLAS` sin uso; se aprovecha. Así el admin de un negocio puede ver la lista de sus empleados sin ver los de otros.
- **Pantallas y permisos se copian al perfil** para que el usuario los lea al entrar (el perfil es lo único que puede leer antes de saber su negocio).

#### B.4 Reglas de seguridad completas

Archivo `database.rules.json` en la raíz del repositorio:

```json
{
  "rules": {
    ".read": false,
    ".write": false,

    "login": {
      "$usuario": {
        ".read": true,
        ".write": "root.child('perfiles/' + auth.uid + '/rol').val() === 'superadmin'"
      }
    },

    "perfiles": {
      "$uid": {
        ".read": "auth != null && (auth.uid === $uid || root.child('perfiles/' + auth.uid + '/rol').val() === 'superadmin')",
        ".write": "root.child('perfiles/' + auth.uid + '/rol').val() === 'superadmin'"
      }
    },

    "data": {
      ".read":  "root.child('perfiles/' + auth.uid + '/rol').val() === 'superadmin'",
      ".write": "root.child('perfiles/' + auth.uid + '/rol').val() === 'superadmin'",

      "negocios_r": {
        "$negId": {
          ".read": "auth != null && root.child('perfiles/' + auth.uid + '/negocioId').val() === $negId && root.child('perfiles/' + auth.uid + '/activo').val() !== false",
          "$campo": {
            ".write": "auth != null && root.child('perfiles/' + auth.uid + '/negocioId').val() === $negId && root.child('perfiles/' + auth.uid + '/rol').val() === 'admin' && root.child('perfiles/' + auth.uid + '/activo').val() !== false && $campo !== 'activo' && $campo !== 'plan' && $campo !== 'precioMes' && $campo !== 'diaPago' && $campo !== 'funciones' && $campo !== 'vendedorId' && $campo !== 'vendedorNombre' && $campo !== 'notasComerciales' && $campo !== 'esDemo' && $campo !== 'demoDe' && $campo !== 'id' && $campo !== 'creado' && $campo !== 'sucursales'"
          }
        }
      },

      "$clave": {
        ".read":  "auth != null && root.child('perfiles/' + auth.uid + '/activo').val() !== false && root.child('data/negocios_r/' + root.child('perfiles/' + auth.uid + '/negocioId').val() + '/activo').val() === true && $clave.beginsWith('data_' + root.child('perfiles/' + auth.uid + '/negocioId').val() + '_')",
        ".write": "auth != null && root.child('perfiles/' + auth.uid + '/activo').val() !== false && root.child('data/negocios_r/' + root.child('perfiles/' + auth.uid + '/negocioId').val() + '/activo').val() === true && $clave.beginsWith('data_' + root.child('perfiles/' + auth.uid + '/negocioId').val() + '_')"
      }
    }
  }
}
```

Qué garantiza cada bloque:

| Bloque | Garantía |
|---|---|
| Raíz `false` | Todo lo que no esté permitido explícitamente queda cerrado. |
| `login/<usuario>` | Cualquiera puede consultar **un** usuario conocido (necesario para iniciar sesión), pero no listar el índice. Solo el super-admin lo escribe. |
| `perfiles/<uid>` | Cada uno lee solo su perfil; nadie puede subirse de rol ni cambiarse de negocio. Solo el super-admin escribe perfiles. |
| `data` (raíz) | El super-admin lee y escribe todo (panel, respaldo, supervisión). |
| `negocios_r/<negId>` | Un usuario lee solo su negocio. El admin del negocio puede editar los datos de "Mi Negocio" (nombre, logo, preferencias), pero **no** su estado (`activo`), plan, precio, ventanas habilitadas, vendedor ni sucursales: eso solo lo cambia el super-admin. |
| `data_<negId>_*` | Un usuario solo toca las tablas de su negocio, solo si su perfil está activo y **solo si el negocio está activo**: suspender un negocio corta el acceso en la base, no solo en la app. |

Notas:
- Las escrituras de varias rutas a la vez (`update()` sobre `data`, que usa `guardarMisDatos`) se evalúan ruta por ruta, así que siguen funcionando para empleados.
- Las reglas no limitan **qué** puede escribir un cajero dentro de su negocio (p. ej. borrar ventas); eso lo siguen controlando los permisos de la app. Es una mejora posible para después (reglas de validación por tabla).
- **Super-admin vendedor**: con estas reglas tiene rol `superadmin` y ve todo, igual que hoy. Si se decide limitarlo a sus demos, se le asigna `rol:'vendedor'` y se agregan reglas para negocios con `demoDe` igual a su uid (decisión pendiente).

#### B.5 Flujos de cuentas (sin servidor)

> Los fragmentos de código de esta sección son del diseño original, con el SDK *compat* (`firebase.auth()`, `FB.ref()`). El flujo es el mismo; desde el 2026-10-11 los adaptadores lo hacen con el SDK **modular** (equivalencias en [modulos-es](../-03-architecture/modulos-es.md), sección 8.2).

##### B.5.1 Iniciar sesión
1. El usuario escribe usuario y contraseña.
2. La app lee `login/<claveUsuario>` (permitido sin sesión).
   - Si no existe y las reglas están **abiertas** (transición): flujo de migración (B.6).
   - Si no existe y las reglas están **cerradas**: "Usuario o contraseña incorrectos".
3. `firebase.auth().signInWithEmailAndPassword(correo, contraseña)`. Firebase verifica en sus servidores.
4. Lee `perfiles/<uid>`. Si no existe o `activo === false` → cierra sesión y muestra "Usuario desactivado".
5. Super-admin → panel y `sincronizarTodo()`. Empleado → lee `data/negocios_r/<negocioId>`; si `activo !== true` → "Este negocio está suspendido"; si no, `sincronizarNegocio()`.
6. La sesión queda guardada en el equipo (`Persistence.LOCAL`). Al recargar, `onAuthStateChanged` la recupera sin pedir contraseña.

Para equipos compartidos se puede ofrecer una casilla "No recordar en este equipo" (`Persistence.SESSION`).

##### B.5.2 Cerrar sesión
`firebase.auth().signOut()` + lo que hace hoy `logout` (detener sincronización, limpiar estado).

##### B.5.3 Crear un usuario (super-admin)
1. Validar: el nombre de usuario no existe en `login/` (se consulta la clave), contraseña de **6 o más** caracteres (mínimo de Firebase).
2. Crear la cuenta en la **instancia secundaria**, para no cerrar la sesión del super-admin:
   ```js
   const altas = firebase.apps.find(a => a.name === 'altas') || firebase.initializeApp(window.FIREBASE_CONFIG, 'altas');
   await altas.auth().setPersistence(firebase.auth.Auth.Persistence.NONE);
   const correo = 'u' + uid() + '@usuarios.wallace-system.app';
   const cred = await altas.auth().createUserWithEmailAndPassword(correo, pass);
   await altas.auth().signOut();
   ```
3. Con la sesión del super-admin, en un solo `update()`:
   - `perfiles/<cred.user.uid>` con negocio, rol, pantallas, permisos, `activo:true`, `creadoPor`;
   - `login/<claveUsuario>` = `{correo, uid}`;
   - `data/data_<negId>_usuarios_r/<id>` con los datos visibles del usuario.
4. Auditar "Creó usuario".

Si el paso 3 falla, la cuenta de Auth queda sin perfil: no puede hacer nada; se reintenta o se borra en la consola.

Lo mismo aplica a **crear negocio** (su usuario admin) y a **crear demo** (usuario `demoN`).

##### B.5.4 Cambiar la contraseña de otro usuario (olvido)
Firebase no deja cambiar la contraseña de una cuenta ajena desde el navegador. En su lugar se **reemplaza la cuenta**:
1. Crear una cuenta nueva con otro correo interno aleatorio y la contraseña nueva (instancia secundaria, como en B.5.3).
2. En un solo `update()`: copiar el perfil a `perfiles/<uid nuevo>`, borrar `perfiles/<uid viejo>`, apuntar `login/<claveUsuario>` al correo y uid nuevos, y guardar el uid nuevo en `data_<negId>_usuarios_r/<id>`.
3. La cuenta vieja queda sin perfil: las reglas le niegan todo. Si alguien tenía esa sesión abierta, pierde el acceso en su siguiente lectura.
4. Auditar "Restableció contraseña".

El historial (ventas, auditoría) no se pierde: está guardado por nombre de usuario y por negocio, no por uid.

##### B.5.5 Cambiar mi propia contraseña
1. Pedir la contraseña actual y la nueva (6+).
2. `reauthenticateWithCredential` con la actual (Firebase lo exige para cambios sensibles).
3. `user.updatePassword(nueva)`.

##### B.5.6 Desactivar, reactivar y eliminar
- Desactivar: `perfiles/<uid>/activo = false` (y el mismo campo en `data_<negId>_usuarios_r/<id>`). Las reglas le niegan todo; el login lo rechaza.
- Reactivar: `activo = true`.
- Eliminar: borrar `perfiles/<uid>`, `login/<claveUsuario>` y el registro del negocio. La cuenta de Auth queda huérfana (sin acceso). Se puede borrar en la consola de Firebase (*Authentication → Users*) cuando se quiera limpiar.

##### B.5.7 Suspender un negocio
Igual que hoy (`toggleNegocio`), pero ahora sobre `data/negocios_r/<negId>/activo`. Las reglas usan ese campo: los empleados de un negocio suspendido dejan de leer y escribir sus datos en el siguiente acceso, aunque tengan la app abierta.

##### B.5.8 Primer super-admin en una instalación nueva
Las reglas solo dejan escribir perfiles a un super-admin, así que el primero se crea a mano una sola vez:
1. Consola de Firebase → *Authentication → Users → Add user*: correo interno y contraseña.
2. *Realtime Database → Datos*: crear `perfiles/<uid>` con `{rol:'superadmin', rolSuper:'dueno', usuario, nombre, activo:true}` y `login/<usuario>` con `{correo, uid}`.

En la instalación actual no hace falta: el dueño existente migra en la fase 2 como cualquier usuario.

#### B.6 Migración de las cuentas existentes

Se hace con las reglas **todavía abiertas** (fases 2 y 3), porque la app necesita leer el `passHash` de cada usuario para verificar su contraseña.

**Flujo al iniciar sesión, si `login/<usuario>` no existe:**
1. Buscar el usuario en `data/usuarios` (o `data/superadmins`).
2. Verificar la contraseña escrita con `verificarPass` (hash local, como hoy). Si no coincide → "Usuario o contraseña incorrectos".
3. Si la contraseña tiene **menos de 6 caracteres** (la app hoy permite 4 o 5), pedir una nueva de 6+ en ese momento; si no, usar la misma.
4. Crear su cuenta con `createUserWithEmailAndPassword` (correo interno aleatorio). Aquí no hace falta la instancia secundaria: es la propia sesión del usuario.
5. Escribir `perfiles/<uid>` (copiando negocio, rol, pantallas, permisos y sucursales de su registro), `login/<claveUsuario>`, el registro en `data_<negId>_usuarios_r/<id>` con `uid`, y `migradoEn`.
6. Continuar el login normal (B.5.1, paso 4).

**Datos que se migran una sola vez** (los hace el super-admin con un botón en la pantalla de migración, o automáticamente cuando él migra):
- `data/negocios` (array) → `data/negocios_r/<negId>`.
- `data/usuarios` → `data/data_<negId>_usuarios_r/<id>` (sin contraseñas).
La app lee ambos formatos durante la transición.

**Pantalla "Migración de cuentas"** (panel super-admin):

| Columna | Contenido |
|---|---|
| Usuario / negocio / rol | Del registro actual |
| Estado | ✅ Migrado (fecha) · ⏳ Pendiente · ⚠️ Revisar |
| Acciones | "Crear cuenta" (con contraseña nueva, para pendientes), "Reemplazar cuenta" (B.5.4), "Borrar perfil" |

Se marca ⚠️ **Revisar** cuando:
- existe un perfil cuyo `usuario` no corresponde a ningún usuario real;
- el uid de `login/<usuario>` no coincide con el uid guardado en el registro del usuario;
- un usuario reporta "tu cuenta ya existe" sin haber migrado (ver riesgo).

Encabezado con el conteo: *"42 de 57 cuentas migradas · 15 pendientes · 0 por revisar"*. El cierre de reglas (fase 4) se hace cuando pendientes y por revisar estén en cero, o cuando el super-admin haya creado manualmente las cuentas que falten.

**Riesgo de la transición y cómo se controla**: mientras las reglas están abiertas, alguien con conocimientos podría crear antes la cuenta de un usuario que aún no migró.
- Si pasa, el usuario real ve al entrar: *"Esta cuenta ya fue activada. Si no fuiste tú, avisa al administrador."* y la pantalla de migración la marca ⚠️.
- El super-admin la reemplaza (B.5.4): la cuenta del intruso queda sin perfil y sin acceso.
- Plazo corto de migración (p. ej. 7 días) y aviso previo a los negocios.
- Este riesgo no es nuevo: hoy, con la base abierta, se puede hacer eso y mucho más.

#### B.7 Cambios en el código

> Diseño original con el SDK *compat*. Desde el 2026-10-11 el SDK es el **modular**: `index.html` ya no carga librerías de Firebase; las carga `src/adaptadores/salida/firebase-sdk.js` ([modulos-es](../-03-architecture/modulos-es.md), sección 8).

| Archivo / función | Cambio |
|---|---|
| `index.html` | Agregar `<script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js">`. |
| `TABLAS_GLOBALES`, `cargarDeLaNube`, `escucharGlobales` | Dejar de descargar `usuarios` y `superadmins` antes del login. Durante la transición se leen solo para migrar al usuario que inicia sesión. |
| `initFirebase` | Inicializar Auth y escuchar `onAuthStateChanged` para recuperar la sesión. |
| `login`, `hacerLogin`, `logout` | Flujos B.5.1, B.5.2 y B.6. |
| `seed`, `necesitaConfigInicial`, `crearDuenoInicial` | Ya no crean super-admins con la base cerrada; la instalación nueva sigue B.5.8. |
| `sincronizarNegocio` | Escuchar también `data/negocios_r/<negId>` (cambios de "Mi Negocio" y suspensión en vivo). |
| `sincronizarTodo`, `reconstruirDesdeRegistros` | Rearmar el array `negocios` desde `negocios_r` para el panel. |
| `refrescarDeLaNube` | Leer el negocio propio en lugar de las tablas globales. |
| `DB.get('negocios')` (23 usos) | Seguir funcionando: el caché `negocios` se arma desde `negocios_r` (completo para el super-admin, solo el propio para empleados). |
| `guardarMiNegocio` | Escribir campo por campo (`update`) en `negocios_r/<negId>`, sin tocar los campos reservados al super-admin. |
| `guardarConfig`, `toggleNegocio`, `asignarVendedor`, `agregarSucursal`, `quitarSucursal`, `nuevoNegocio`, `eliminarNegocio`, `crearDemoDeTipo`, `eliminarDemoVendedor` | Escribir en `negocios_r/<negId>`; las que crean usuarios usan B.5.3. |
| `editarUsuario`, `eliminarUsuario`, `pantallaUsuarios` | Crear con B.5.3, contraseña con B.5.4, activo con B.5.6; leer de `data_<negId>_usuarios_r`. |
| `usuariosNeg`, `cambiarPassNeg` | El admin del negocio ve la lista de sus empleados; "cambiar contraseña" solo para su propia cuenta (B.5.5). Para los demás muestra "Pídelo al administrador del sistema". |
| `editarSuperAdmin`, `eliminarSuperAdmin`, `cambiarMiPassSuper` | Igual que usuarios (B.5.3 a B.5.6), con `rol:'superadmin'`. |
| Nuevas | `claveUsuario`, `crearCuentaAuth` (instancia secundaria), `reemplazarCuenta`, `migrarMiCuenta`, `pantallaMigracion`, `migrarTablasGlobales`. |
| `hashPass`, `verificarPass`, `migrarContrasenas` | Se usan solo durante la migración; se eliminan en la fase 5. |
| `prueba.html` | Probar lectura sobre `login/` y un inicio de sesión de prueba, en vez del nodo `posu`. |
| `database.rules.json`, `firebase.json` | Nuevos en el repositorio. `firebase.json` declara `"database": {"rules": "database.rules.json"}`. |

#### B.8 Fases de despliegue con lista de chequeo

**Fase 0 — Proyecto de prueba** (sin tocar producción)
- [ ] Dueño: crear proyecto Firebase de prueba (plan Spark), activar Realtime Database y *Authentication → Email/Password*.
- [ ] Dueño: pasar la configuración web y un respaldo reciente de producción.
- [ ] Importar el respaldo en la base de prueba (*Realtime Database → ⋮ → Importar JSON* sobre `data`).
- [ ] Desarrollar los cambios de B.7 y probar con la lista de B.9 sobre la base de prueba, primero con reglas abiertas y luego cerradas.

**Fase 1 — Preparar producción** (no cambia nada para los usuarios)
- [ ] Dueño: en producción, activar *Email/Password*.
- [ ] Dueño: en *Authentication → Settings → Authorized domains*, dejar solo el dominio de producción (y `localhost` si se prueba local).
- [ ] Descargar respaldo de producción.

**Fase 2 — Publicar la app nueva** (reglas abiertas, como hoy)
- [ ] Avisar a los negocios: "a partir de X, al entrar por primera vez quizá te pida una contraseña nueva de 6 caracteres".
- [ ] Publicar la app (`git push` → Render). Pedir recarga forzada en los equipos.
- [ ] El super-admin entra primero (migra su cuenta y ejecuta "Migrar tablas globales").
- [ ] Revisar a diario la pantalla de migración.

**Fase 3 — Cerrar la migración** (reglas abiertas)
- [ ] Al vencer el plazo: crear desde la pantalla de migración las cuentas pendientes con contraseña nueva y entregarlas.
- [ ] Resolver todo lo marcado ⚠️.
- [ ] Pendientes = 0 y por revisar = 0.

**Fase 4 — Cerrar la base**
- [ ] Respaldo.
- [ ] Publicar `database.rules.json` (`firebase deploy --only database`, o pegarlo en *Realtime Database → Reglas*).
- [ ] Ejecutar en producción las pruebas 1 a 6 de B.9.
- [ ] Probar con un equipo de cada rol que el trabajo diario funciona (vender, cobrar, caja, cocina).
- [ ] Si algo falla: volver a publicar las reglas anteriores desde la consola (segundos) y revisar.

**Fase 5 — Limpieza** (una o dos semanas después)
- [ ] Borrar `passHash`, `passSal`, `passIter` de `superadmins` y del antiguo `data/usuarios`; borrar el array viejo `data/negocios`.
- [ ] Quitar del código la migración y las funciones de hash.
- [ ] Opcional: borrar en la consola las cuentas de Auth sin perfil.

#### B.9 Pruebas de aceptación

> **Lector para la consola** (desde el 2026-10-11 no existe el objeto global `firebase`):
> ```js
> // En la consola (F12), con la sesión iniciada: el mismo SDK que cargó la app
> const {database:D, app:A}=(await import('/src/adaptadores/salida/firebase-sdk.js')).sdkCargado();
> const leer=r=>D.get(D.ref(D.getDatabase(A.getApp()), r));
> ```

| # | Prueba | Resultado esperado |
|---|---|---|
| 1 | Abrir `https://<proyecto>-default-rtdb.firebaseio.com/data.json` sin sesión | `"Permission denied"` |
| 2 | Empleado de N1, en la consola del navegador: `await leer('data/data_N2_ventas_r')` (el lector `leer` se prepara como dice la nota de abajo) | Falla con *permission denied* |
| 3 | Empleado: leer `data/superadmins` o `perfiles` de otro | Falla |
| 4 | Empleado: escribir `perfiles/<su uid>/rol = 'superadmin'` | Falla |
| 5 | Admin del negocio: cambiar `negocios_r/<su neg>/activo` o `plan` | Falla; cambiar `nombre` o `logo` funciona |
| 6 | Suspender N1 con un cajero conectado | El cajero deja de poder leer/escribir datos de N1 |
| 7 | Migración: usuario con contraseña de 8 caracteres | Entra con la misma contraseña, sin pasos extra |
| 8 | Migración: usuario con contraseña de 4 caracteres | Se le pide una nueva de 6+; luego entra con la nueva |
| 9 | Super-admin crea usuario | Sigue con su sesión; el usuario nuevo entra |
| 10 | Super-admin restablece contraseña | Entra con la nueva; la vieja ya no sirve; la sesión vieja pierde acceso |
| 11 | Desactivar usuario con sesión abierta | Pierde acceso en la siguiente lectura; no puede volver a entrar |
| 12 | Cambiar mi contraseña | Pide la actual; entra con la nueva |
| 13 | Recargar la página | No pide contraseña (sesión guardada) |
| 14 | Equipo sin internet con sesión guardada | Abre y trabaja como hoy; sincroniza al volver |
| 15 | Protocolo de verificación completo ([-00](../-00-execution-protocol/-00-execution-protocol.md#7-protocolo-de-verificación-smoke-test)) con cada rol | Todo como antes |

Las reglas también se pueden probar en el **simulador** de la consola (*Realtime Database → Reglas → Simulador*) o en el emulador local de Firebase (requiere Java 11+).

#### B.10 Límites del plan gratuito (Spark)

Son los mismos que ya aplican hoy; S1 no los cambia:
- **Realtime Database**: 100 conexiones simultáneas, 1 GB guardado, 10 GB descargados al mes. Cada equipo con la app abierta es una conexión. El panel del super-admin descarga todo `data`, así que es el que más consume.
- **Authentication con correo y contraseña**: sin costo. Crear muchas cuentas seguidas desde la misma red puede toparse con un límite de creación por hora; si se crean en lote, hacerlo por tandas.
- Revisar el uso en *Realtime Database → Uso*. Si se acerca a los límites, la solución es el plan Blaze (que además habilita el Plan A).

#### B.11 Plan de reversa

| Si falla en… | Qué hacer |
|---|---|
| Fase 2 (app nueva) | Volver a publicar la versión anterior de `app.js`. Las cuentas de Auth creadas no molestan; las contraseñas de `data/usuarios` siguen ahí (aún no se borraron). |
| Fase 4 (reglas) | Publicar de nuevo las reglas abiertas desde la consola. Todo vuelve a funcionar como en la fase 3. |
| Fase 5 (limpieza) | Restaurar el respaldo tomado antes de la fase 4. Por eso la limpieza se hace una o dos semanas después. |

#### B.12 Limitaciones frente al Plan A

- **Cambiar contraseña de otro** reemplaza la cuenta y deja cuentas viejas sin perfil en Auth (inofensivas; limpieza manual ocasional).
- **El admin del negocio no gestiona empleados**: crear usuarios o cambiar contraseñas de otros exige poder escribir perfiles, y dárselo le permitiría crear un super-admin. En este plan queda solo para el super-admin.
- **La migración verifica la contraseña en el navegador** y tiene el riesgo de transición descrito en B.6.
- **El primer ingreso en un equipo necesita internet.**
- Las reglas aíslan negocios, pero dentro de un negocio no limitan qué puede borrar cada rol (eso sigue en la app).

Todas se resuelven si más adelante se activa Blaze y se agregan las Cloud Functions del Plan A, sin rehacer las reglas ni los perfiles.

#### B.13 Lo que hace falta para empezar

1. Un proyecto de Firebase de prueba con Realtime Database y Email/Password activados, y su configuración web.
2. Un respaldo actual de producción.
3. `npm install -g firebase-tools` y `firebase login` en la terminal (el login lo hace el dueño con su cuenta de Google).
4. El dominio o dominios de producción.
5. Decidir: qué ve el super-admin vendedor (B.4) y el plazo de migración (B.6).
6. Opcional: Java 11+ para probar las reglas en el emulador local.

Mientras S1 no se aplique, **todas** las demás protecciones siguen dependiendo del navegador.

---

## S2 — Contraseñas en texto plano ✅

**Error**: `usuarios` y `superadmins` guardaban `pass` en texto plano; las tablas se descargaban a cualquier navegador antes del login, quedaban en `localStorage` y el panel mostraba una columna "Contraseña".

**Corrección**
- **Hash con sal** (`dominio/contrasenas.js` (reglas) y `ui/usuarios/sesion.js` (`ponerPass`, `migrarContrasenas`)): `sha256Hex` (SHA-256 en JavaScript puro, síncrono, sin depender de HTTPS), `hashPass` (SHA-256 iterado 3.000 veces sobre `sal|contraseña`), `nuevaSal` (16 bytes de `crypto.getRandomValues`), `ponerPass(rec, pass)` y `verificarPass(rec, pass)`.
- **Formato nuevo del registro**: `passHash`, `passSal`, `passIter`. El campo `pass` desaparece.
- **Migración automática** (`migrarContrasenas`, llamada desde `seed`): al primer arranque convierte toda contraseña en texto plano y reescribe las tablas en la nube. Solo corre si las tablas globales se leyeron bien de la nube (ver S3) o en modo local.
- **Login** (`login`, `ui/usuarios/sesion.js`): compara con `verificarPass`; acepta registros aún no migrados.
- **Escrituras de contraseña** que ahora usan `ponerPass`: crear/editar super-admin (`editarSuperAdmin`), cambiar mi contraseña (`cambiarMiPassSuper`, que valida la actual con `verificarPass`), crear negocio (admin), crear demo (`demo123`), crear/editar usuario (`editarUsuario`), cambiar contraseña desde el negocio (`cambiarPassNeg`).
- **Interfaz**: la tabla de usuarios del super-admin ya no tiene columna de contraseña; en editar usuario/administrador el campo es de tipo contraseña, viene vacío y "vacío = no cambiar".
- **Extra (F7)**: casilla "Usuario activo" en el formulario; un usuario desactivado no puede entrar.

**Probado**: el SHA-256 coincide con el de Node para cadenas vacías, UTF-8, y en los límites de bloque (55, 56, 64 y 1.000 caracteres). Un hash tarda ~20 ms. En navegador: migración en la nube y en local, login con la contraseña antigua, rechazo de contraseña incorrecta, tabla sin contraseñas, edición sin precargar la contraseña, usuario desactivado sin acceso.

**Residual**: los hashes siguen descargándose a todos los equipos (hasta S1). Una contraseña corta puede adivinarse probando combinaciones contra el hash; el iterado lo hace más lento, no imposible. Con todo, nadie puede **leer** las contraseñas reales, y quienes las reutilizan en otros servicios quedan protegidos.

---

## S3 — Contraseña inicial embebida ✅

**Error**: `seed()` creaba el super-admin dueño con un usuario y una contraseña escritos en `app.js`, que cualquier visitante puede leer.

**Corrección**
- `seed` (`ui/nucleo/arranque.js`) ya no crea super-admins.
- Si no existe ninguno, `render` muestra la **pantalla de configuración inicial** (`vistaConfigInicial`, `ui/usuarios/sesion.js`): nombre, usuario, contraseña de mínimo 8 caracteres y su confirmación.
- `crearDuenoInicial` (`ui/usuarios/sesion.js`) guarda la contraseña con hash y, si hay nube, usa una **transacción** sobre `data/superadmins` que solo escribe si la tabla sigue vacía (dos navegadores no pueden crear el "primer" dueño a la vez).
- Bandera nueva `GLOBALES_LEIDAS` (`Datos.estado.globalesLeidas`, `adaptadores/salida/firebase-datos.js:40`): la configuración inicial y `seed` solo actúan si las tablas globales **se leyeron bien** de la nube. Antes, un error de lectura dejaba `NUBE_LISTA=true` y `seed` podía escribir sobre datos reales.

**Probado**: sin super-admins aparece la configuración inicial; el dueño queda con hash; luego aparece el login y entra con la contraseña elegida.

**Acción manual pendiente**: la contraseña antigua sigue en el historial de git. Verifique en la consola de Firebase que el dueño de producción ya no la usa; si la usa, cámbiela desde "🔑 Mi contraseña".

---

## S4 — Permisos solo en la interfaz ✅

**Error**: varias acciones sensibles solo ocultaban el botón; la función se podía ejecutar igual (y el botón de descuento se mostraba a todos).

**Corrección**: funciones de apoyo en `ui/nucleo/permisos.js`:
- `exigirPermiso(accion, texto)`: `tienePermiso` + aviso.
- `esAdminSistema()`: super-admin dueño o ayudante (no vendedor).
- `pantallasPermitidas()` / `puedeVerPantalla(id)`: las mismas pantallas del menú del usuario.

Validación agregada **al inicio** de cada función:

| Control | Funciones |
|---|---|
| Permiso `cobrar` | `cobrarPedido`, `cobrarDirecto` |
| Permiso `anular` | `anularPedido` |
| Permiso `descuento` | `abrirDescuento` (y el botón solo se muestra con el permiso) |
| `abrircaja` o jefe | `movimientoCaja` |
| `esAdminSistema()` | `descargarRespaldo`, `asignarVendedor`, `configNegocio`, `usuariosNegocio`, `guardarConfig`, `editarUsuario`, `eliminarUsuario`, `agregarSucursal`, `quitarSucursal`, `reporteMensualNegocio`; además `render` no deja abrir `config:`/`usuarios:` a un vendedor |
| Vendedor solo sus demos | `toggleNegocio` |
| Pantalla `clientes` | `editarCliente`, `eliminarCliente` |
| Pantalla `gastosneg` | `nuevoGasto`, `eliminarGasto` |
| Pantalla `minegocio` | `guardarMiNegocio` |
| Pantalla `pedidos` | `setEstadoPedido`, `asignarDomiciliario` |
| Pantalla `domicilios` | `editarDomiciliario`, `eliminarDomiciliario` |
| Pantalla `cocina` | `marcarCocina` |
| Pantalla `citas` | `nuevaCita`, `marcarCita`, `eliminarCita` |

**Cambio visible**: un usuario sin permiso `cobrar` (p. ej. mesero) en un negocio de cobro directo ya no puede cobrar con "💵 Cobrar ahora": recibe "No tienes permiso para cobrar. Pide a un cajero que lo cobre." Antes podía, aunque su rol no lo permitía.

**Probado**: cajero no abre descuentos ni ve el botón, no puede anular; vendedor no suspende un negocio real ni entra a configurar.

**Residual**: sigue siendo control del lado del cliente (se puede alterar `STATE` desde la consola). La protección real llega con S1.

---

## S5 — Pantalla inicial sin control de rol ✅

**Error**: al iniciar sesión todos entraban a `inicio` (Dashboard con dinero), incluso roles sin esa pantalla (cocina); y `renderContenido` no validaba la pantalla pedida.

**Corrección**
- `login` deja `STATE.pageNeg=''`.
- `pantallaValida()` (`ui/nucleo/permisos.js`) se ejecuta antes de dibujar en `vistaNegocio` y `renderContenido`: si la pantalla pedida no está entre las permitidas, cambia a la primera permitida del menú.

**Probado**: cocina entra a su primera pantalla permitida (no al Dashboard); el cajero que pide `contable` se queda en su pantalla.

---

## S6 — Código inyectable por el nombre de una categoría ✅

**Error**: los botones de categoría armaban `onclick="_vCat='${escapeHtml(c)}';render()"` (Nueva Venta) y `onclick="_iCat='${escapeHtml(c)}';render()"` (Inventario, dos veces). El navegador decodifica las entidades del atributo antes de ejecutarlo: `&#39;` vuelve a ser `'` y cierra la cadena. Un nombre de categoría armado a propósito (`x';alert(1);'`) se ejecutaba en la sesión de cualquiera que abriera esas pantallas en cualquier equipo del negocio, incluido el super-admin. Uno inocente con apóstrofo (`Niño's`) solo rompía el botón.

**Corrección** (fase 8, eventos delegados)
- `data-click="elegirCategoriaVenta(this.dataset.cat)" data-cat="${escapeHtml(c)}"` (y `elegirCategoriaInventario`): el dato viaja como texto en un atributo `data-`, nunca dentro del código.
- Todos los `onclick`/`oninput`/… (250) pasaron a `data-*`. `ui/nucleo/eventos.js` interpreta cada uno como una sola llamada con argumentos simples, sin `eval`, y solo a funciones exportadas por los módulos de la interfaz.
- Se revisaron los 94 manejadores viejos que interpolaban `${…}`: solo estos 3 usaban datos escritos por usuarios; los demás, ids generados o constantes.

**Probado**: `tests/navegador/recorrido.test.mjs` pone la categoría `Niño's` a un producto, hace clic real en su botón y comprueba que filtra. `tests/ui/estructura.test.mjs` falla ante cualquier `on…="…"` en una plantilla. El recorrido revisa además que el HTML ya dibujado de las 327 pantallas no tenga atributos `on…`.

**Pendiente**: activar una Content-Security-Policy que bloquee código en línea, por si en otro lugar faltara `escapeHtml` ([csp.md](../-03-architecture/csp.md): política propuesta, probada en local con `node scripts/probar-csp.mjs` y pasos para activarla en Render).

---

## S8 — Código inyectable por el logo del negocio ✅ (2026-10-12)

**Error**: diez plantillas dibujaban `<img src="${neg.logo}">` sin escapar ni validar, y las reglas aceptaban cualquier texto en `negocios_r/<id>/logo` (campo editable por el negocio). Escribiéndolo por consola o API con un valor como `x" onerror="…`, el código corría en la sesión de quien abriera el negocio: **el dueño del sistema al supervisar o sacar el informe mensual**. Desde ahí podía subir de rango a cualquiera (`rolSuper`), crear cuentas o borrar negocios. Lo mismo pasaba con otros datos metidos en atributos: ids en `data-click`, `pctDatafono`, `baseFija`, `diasAvisoVence`, `valorDom`, `contado`… Detalle del ataque: [seguridad-interfaz](../-03-architecture/seguridad-interfaz.md), sección 7.

**Corrección**:
- `Dominio.negocio.logoValido` (`src/dominio/negocio.js`, sobre `Dominio.inventario.esImagenData`) y `logoNegocio(neg, atributos)` en los 10 lugares.
- Elegir y guardar el logo: solo una imagen válida (JPEG si el PNG pesa mucho).
- `escapeHtml` en las **151** interpolaciones dentro de atributos que no lo tenían, más la inicial del nombre y las vistas previas.
- Reglas (cerradas y de transición): `.validate` del logo (imagen `data:` o vacío, ≤ 400.000), del `id` de cada registro (`^[A-Za-z0-9_-]{1,64}$`) y del id del negocio.
- Migración tolerante: limpia un logo inválido y no copia registros con id inválido (`negocioParaGuardar`, `idSeguro`).

**Probado**:
- Estructura: ningún dato sin escapar dentro de un atributo.
- Dominio, reglas (cerradas y de transición) e integración (migración con un logo inválido).
- Recorrido con el ataque real: falla con la línea vieja y pasa con la corrección.
- Capturas: 121 idénticas.

---

## D6 — Pedido de otro turno fuera de todo cierre ✅ (2026-10-12)

**Error**:
- un pedido creado en un turno y cobrado en otro conservaba el `cajaId` del turno en que se creó, y su fecha era anterior a la apertura actual: no entraba en ningún cierre;
- `cobrarPedido` dejaba cobrar con la caja cerrada (mismo efecto);
- además (F19), al abrir la caja siguiente esos pedidos desaparecían de Pedidos y Cuentas.

**Corrección**:
- al cobrar, `venta.cajaId` = la caja abierta;
- con caja, no se cobra sin caja abierta;
- `ventasJornada` incluye siempre lo abierto de cualquier turno;
- `cerrarCaja` avisa de lo que queda sin cobrar.

**Probado**: recorrido "D6/F19". Falla con el código anterior.

## D7 — Movimientos de caja sin transacción ✅ (2026-10-12)

**Error**: `movimientoCaja` reescribía `caja_actual` entera: dos equipos a la vez perdían un movimiento.

**Corrección**: `agregarMovimientoCaja` con `transaccionUnica` sobre el valor del servidor, como D5.

**Probado**: recorrido "D7" (que el movimiento quede guardado). La concurrencia la cubre la misma transacción de D5.

## D8 — Conteo: lo vendido durante el conteo se restaba dos veces ✅ (2026-10-12)

**Error**: la diferencia se calculaba contra el stock del inicio del conteo y se sumaba al stock actual, así que lo vendido mientras se contaba se restaba dos veces.

**Corrección**: cada ítem se compara con el stock del momento en que se escribe su cantidad.

**Probado**: recorrido "D8". Falla con el código anterior.

---

## D1 — Consecutivo de factura repetible ✅

**Error**: cada equipo calculaba "la mayor factura que veo + 1". Dos equipos vendiendo a la vez, o uno sin internet, emitían el mismo número. La tabla `factura_seq` existía pero no se usaba.

**Corrección** (`ui/ventas/nueva-venta.js`; reglas en `dominio/facturas.js`; reserva en `Datos.reservarConsecutivo`)
- `reservarFactura()`: cada equipo **reserva de antemano** su próximo número con una transacción sobre `data_<negocio>_factura_seq` (`max(contador, mayor factura local) + 1`). Firebase serializa las transacciones, así que dos equipos no reciben el mismo número.
- `siguienteFactura()`: usa el número reservado (instantáneo, sin esperar a la red) y pide el siguiente. Sin reserva disponible (sin internet o recién entrando) usa `max(mayor local, último reservado) + 1`.
- Se reserva al terminar de bajar las ventas del negocio (`sincronizarNegocio`), al entrar como supervisor y después de cada uso; la reserva se descarta al salir o cambiar de negocio.
- Lo usan `armarVenta` y `cobrarCitaEntregada`.

**Comportamiento**: puede haber **saltos** (un equipo que cierra sin usar su número reservado, o una venta directa cancelada en el modal de cobro); no hay repetidos mientras haya conexión.

**Probado**: con F-00007 existente reserva la 8; tras vender queda reservada la 9; si otro equipo reserva la 10, este equipo usa su 9 y luego salta a la 11. Sin repetidos.

**Residual**: un equipo **sin conexión** desde el inicio puede repetir un número que otro equipo usó mientras tanto.

---

## D2 — Stock "última escritura gana" ✅

**Error**: el equipo calculaba el stock nuevo y subía el **valor** (`stock = 7`). Dos ventas simultáneas del mismo producto en dos equipos partían del mismo valor y una se perdía.

**Corrección**: `cambiarStock(tabla, id, fn)` (`adaptadores/salida/firebase-datos.js:180`). El cambio se expresa como una función (p. ej. "restar 2 y descontar de los lotes FEFO") que:
1. se aplica de inmediato en el equipo, para que la pantalla responda;
2. se aplica **dentro de una transacción** de Firebase sobre `data_<neg>_<tabla>_r/<id>`, que la vuelve a ejecutar sobre el valor real del servidor si otro equipo se adelantó;
3. marca el registro como sincronizado para que un guardado posterior de la tabla no reenvíe el stock como valor fijo.

Sin nube, o si el registro todavía no está en la nube, usa el guardado normal.

**Puntos que ahora pasan por `cambiarStock`**: `moverInventario` (ventas, anulaciones, ediciones, salidas, cuentas canceladas), `entradaStock` (incluida la creación de lotes; los ids se generan fuera de la función para que un reintento no duplique), `retirarLote` (retira el lote tal como está en el servidor), `entradaInsumo`, `descontarApartado`, `devolverApartado` y el ajuste de `guardarConteo`.

**Cambio de comportamiento en el conteo**: el ajuste ya no fija el stock en "lo contado", sino que aplica la **diferencia** (contado − sistema al iniciar el conteo). Si mientras se contaba alguien vendió en otro equipo, esa venta no se pierde.

**Probado**: stock en la nube 10; este equipo vende 1; otro equipo vende 3 sin que este se entere; este vende 2 más → la nube queda en 4 (10 − 1 − 3 − 2) y el equipo termina con el mismo valor. En local: entradas con lote, venta FEFO, conteo y retiro de lote cuadran.

**Residual**: editar un producto desde su formulario sigue fijando el stock como valor (es una corrección manual del administrador; hallazgo F11).

---

## D3 — Recortes de historial sin efecto ✅

**Error**: `logAudit` (`slice(0,800)`), `moverInventario` (`slice(0,1000)`) y `guardarConteo` (`slice(0,200)`) aparentaban limitar el tamaño, pero `guardarMisDatos` fusiona por id y nunca borra: no recortaban nada y además reenviaban la tabla completa para compararla.

**Corrección**: se eliminaron los recortes y ahora se envían **solo los registros nuevos** (`guardarMisDatos(tabla, [nuevo])`). Se agregó `registrarMovimientos(lista)` (`ui/inventario/motor.js`) para los movimientos de inventario.

**Decisión**: se conserva todo el historial. La auditoría no debe perder registros y los movimientos son la prueba de lo que entró y salió. Las pantallas ya muestran solo lo más reciente (auditoría 300, movimientos 8).

**Probado**: 5 registros de auditoría nuevos se agregan sin perder los anteriores.

**Residual**: las tablas crecen con el tiempo. Si se necesita limitar, archivar por mes (decisión pendiente).

---

## D4 — Conceptos de gasto sin sincronizar ✅

**Error**: `data_<neg>_conceptos_gasto` se escribía en la nube pero ningún equipo la escuchaba ni la bajaba con "🔄 Actualizar", y no se borraba al eliminar el negocio.

**Corrección**: `conceptos_gasto` se agregó a `TABLAS` y a `TABLAS_UNICAS` (`adaptadores/salida/firebase-datos.js:19`, `23`). Con eso se escucha en tiempo real, se baja con "Actualizar", se borra con el negocio y aparece en el respaldo como las demás.

**Probado**: un concepto creado desde otro equipo aparece en este sin recargar.

---

## D5 — Apertura (y cierre) de caja simultánea ✅

**Error**: `abrirCaja` solo revisaba la copia local; dos equipos podían abrir caja a la vez y el último pisaba al primero. Lo mismo al cerrar: dos equipos podían registrar dos cierres de la misma jornada.

**Corrección** (`ui/caja/caja.js`; `cajaDe` en `dominio/caja.js`; `transaccionUnica` en `adaptadores/salida/firebase-datos.js:211`)
- `transaccionUnica(tabla, fn)`: escribe una tabla "única" del negocio con una transacción (o localmente sin nube).
- `cajaDe(valor)`: extrae la caja abierta de cualquier forma en que llegue (`[caja]`, `{0:caja}` o vacío).
- `abrirCaja`: solo escribe si **en la nube** no hay caja; si otro equipo ya abrió, avisa "Ya hay una caja abierta por …" y no toca nada.
- `cerrarCaja`: solo vacía la caja si en la nube sigue abierta **esa misma** caja. Si otro equipo ya la cerró, avisa y no registra un segundo cierre. El registro del cierre se movió a `terminarCierre(...)`, que usa la caja **tal como estaba en el servidor** (con los movimientos de todos los equipos) para recalcular gastos, retiros, entradas, esperado y diferencia.

**Cambio visible**: el cierre espera la confirmación de la nube antes de imprimir la tirilla. Si el navegador bloquea la ventana emergente por la espera, la tirilla se puede reimprimir desde Registro Contable.

**Probado**: con una caja abierta por otro equipo (aún no recibida aquí) no se sobrescribe; con la nube vacía se abre; al cerrar, la caja queda vacía y hay un cierre; si otro equipo cerró primero, no se registra un segundo cierre; también funciona sin nube.

---

## Cómo se probó

Sin tocar la base de producción:

1. **Unidad (Node)**: `sha256Hex` comparado con `crypto.createHash('sha256')` y tiempo de `hashPass`.
2. **Navegador (Chromium sin interfaz, vía Puppeteer)** sobre una copia del proyecto:
   - **Modo local**: `firebase-config.js` vacío.
   - **Nube simulada**: un Firebase Realtime Database falso en memoria (lectura, `set`, `update`, `on/off` con eventos `value`/`child_*` y `transaction`) que permite simular que "otro equipo" escribió sin que este se haya enterado.
3. Resultado: **44 comprobaciones, todas correctas**, sin errores de JavaScript en la página. `node --check app.js` sin errores.

Lo que **no** se probó: Firebase real (transacciones reales, latencia, desconexiones a mitad de una transacción) ni navegadores móviles. Antes de desplegar conviene repetir los pasos 3, 4, 7, 10 y 13 del [protocolo de verificación](../-00-execution-protocol/-00-execution-protocol.md#7-protocolo-de-verificación-smoke-test) con dos equipos sobre un proyecto de Firebase de prueba.
