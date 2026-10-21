# 01 — Hallazgos para revisar

Puntos encontrados al documentar el código (commit `15b243d`). Las correcciones aplicadas están en [-02-corrections](../-02-corrections/-02-corrections.md); la columna **Estado** indica cuáles ya se resolvieron. Las referencias de línea de los hallazgos corregidos apuntan a la zona donde estaba el código original. Cada hallazgo indica dónde está, qué pasa, el impacto y una propuesta.

Cada hallazgo corregido tiene debajo su **Solución aplicada** y lo que queda pendiente.

**Severidad**: 🔴 Alta (seguridad o pérdida/corrupción de datos) · 🟠 Media (resultado incorrecto visible) · 🟡 Baja (inconsistencia, deuda técnica).

> **Estado al 2026-10-12:** de la primera revisión, **los 34 hallazgos están cerrados**. La **segunda revisión** (2026-10-12, sección [Segunda revisión](#segunda-revisión-2026-10-12)) encontró 10 nuevos (uno grave de dinero en caja, D6): **los 10 corregidos el mismo día**, cada uno con su prueba. **S8** (logo del negocio sin validar, 🔴), encontrado después: corregido el mismo día. **Tercera revisión** (2026-10-12, [sección](#tercera-revisión-2026-10-12)): 11 hallazgos (D9 🔴, D10, S9, F24 🟠 y 7 menores), **corregidos el mismo día** con sus pruebas, y sus 5 flujos a medias también. **Cuarta revisión** (validaciones, [sección](#cuarta-revisión-2026-10-12)): 6 hallazgos, corregidos el mismo día. Primera revisión: (`npm test` 67/67 · `npm run test:firebase` 36/36). S6 se encontró y corrigió en la fase 8 (2026-10-09). **S1** quedó desplegado y verificado en el proyecto de simulación `wallacesys-dev-sandbox` (base desde cero, dueño creado, reglas cerradas: sin sesión todo responde "Permission denied"); **F17** se cerró por decisión comercial (planes iguales en ventanas). **En la empresa no hay nada desplegado:** su producción sigue con la versión original, con las contraseñas en texto plano y la base abierta, hasta que se repitan las fases de S1 en su proyecto. **Lo que falta no son hallazgos sin corregir sino pruebas con Firebase real, decisiones y el despliegue en la empresa**: ver [Pendientes](#pendientes) y la guía paso a paso [conexion-firebase](../-00-execution-protocol/conexion-firebase.md).

## Resumen

| ID | Sev. | Área | Hallazgo | Estado |
|---|---|---|---|---|
| S1 | 🔴 | Seguridad | Base de datos sin autenticación ni reglas en el repositorio | ✅ Corregido y desplegado en el proyecto de simulación (`wallacesys-dev-sandbox`); falta repetir el despliegue en el proyecto real de la empresa |
| S2 | 🔴 | Seguridad | Contraseñas en texto plano descargadas a todos los equipos | ✅ Corregido |
| S3 | 🔴 | Seguridad | Contraseña inicial del super-admin escrita en `app.js` | ✅ Corregido |
| S4 | 🟠 | Seguridad | Permisos validados solo en el cliente; varias funciones no revalidan | ✅ Corregido |
| S5 | 🟠 | Seguridad | Roles aterrizan en el Dashboard aunque no lo tengan permitido | ✅ Corregido |
| S6 | 🔴 | Seguridad | El nombre de una categoría de producto ejecutaba código dentro de un `onclick` (XSS almacenado) | ✅ Corregido (fase 8) |
| D1 | 🔴 | Datos | Consecutivo de factura puede duplicarse entre equipos | ✅ Corregido |
| D2 | 🔴 | Datos | Stock guardado como valor absoluto: ventas simultáneas se pisan | ✅ Corregido |
| D3 | 🟠 | Datos | Los recortes de historial no tienen efecto; tablas crecen sin límite | ✅ Corregido |
| D4 | 🟠 | Datos | `conceptos_gasto` no se sincroniza en tiempo real | ✅ Corregido |
| D5 | 🟡 | Datos | Apertura de caja simultánea en dos equipos | ✅ Corregido |
| F1 | 🟠 | Funcional | Sucursales prometen caja/pedidos separados y no lo hacen | ✅ Corregido |
| F2 | 🟠 | Funcional | Fechas en UTC en gráficas y comparaciones de reportes | ✅ Corregido |
| F3 | 🟠 | Funcional | Buscadores de Pedidos, Historial y Conteo no filtran al escribir | ✅ Corregido |
| F4 | 🟠 | Funcional | Domicilios ignora pagos divididos (difiere del Cuadre) | ✅ Corregido |
| F5 | 🟡 | Funcional | Texto literal `${pProd()}` en el editor de recetas | ✅ Corregido |
| F6 | 🟡 | Funcional | Planes Premium vs. Empresarial | ✅ Corregido |
| F7 | 🟡 | Funcional | No se puede desactivar un usuario | ✅ Corregido (con S2) |
| F8 | 🟡 | Funcional | Apartados de citas sin movimientos ni auditoría | ✅ Corregido |
| F9 | 🟡 | Funcional | Cobro de entrega de cita sin pago dividido ni caja obligatoria | ✅ Corregido |
| F10 | 🟡 | Funcional | Doble escape en el título del cobro de cita | ✅ Corregido |
| F11 | 🟡 | Funcional | Cambios de stock sin rastro (editar producto, entradas, lotes) | ✅ Corregido |
| F12 | 🟡 | Funcional | Admin del negocio puede reactivar `inventario` | ✅ Corregido (con S1) |
| F13 | 🟡 | Funcional | Gastos vs. Contable pueden no coincidir al borrar gastos de caja | ✅ Corregido |
| F14 | 🟡 | Funcional | Valor de inventario y conteo a precio de venta | ✅ Corregido |
| F15 | 🟡 | Funcional | Domiciliario y estadísticas ligados por nombre | ✅ Corregido |
| F16 | 🟡 | Funcional | La pregunta "¿imprimir?" aparece 400 ms después de cobrar y podía tapar otro modal | ✅ Corregido |
| F17 | 🟡 | Funcional | Los planes Profesional y Premium habilitan exactamente las mismas ventanas | ✅ Cerrado por decisión (2026-10-08): se mantienen iguales |
| F18 | 🟡 | Funcional | Alertas de vencimiento aunque el negocio apagó el inventario | ✅ Corregido |
| R1 | 🟡 | Rendimiento | Super-admin escucha todo `data/`; logos en tabla global | ✅ Corregido (con S1) |
| C1 | 🟡 | Código | Código y campos sin uso | ✅ Corregido |
| C2 | 🟡 | Código | Errores de pantalla atrapados y ocultos | ✅ Corregido |
| R2 | 🟡 | Rendimiento | Sumar gastos por concepto relee el catálogo por cada gasto | ✅ Corregido |
| DOC1 | 🟡 | Documentación | README raíz y `prueba.html` desactualizados | ✅ Corregido (salvo historial de commits) |
| D6 | 🔴 | Datos | Un pedido de un turno anterior (o cobrado con la caja cerrada) no entra en ningún cierre de caja | ✅ Corregido (2026-10-12) |
| D7 | 🟠 | Datos | Gastos, retiros y entradas de caja se guardan sin transacción: dos equipos a la vez pierden uno | ✅ Corregido (2026-10-12) |
| D8 | 🟠 | Datos | Conteo físico: lo vendido mientras se cuenta se descuenta dos veces al aplicar el ajuste | ✅ Corregido (2026-10-12) |
| F19 | 🟠 | Funcional | Cerrar la caja no avisa de pedidos o cuentas sin cobrar, y en el turno siguiente desaparecen de Pedidos y Cuentas | ✅ Corregido (2026-10-12) |
| F20 | 🟠 | Funcional | Se puede anular una venta de una caja ya cerrada (editarla no): cambia las cifras de un cierre pasado | ✅ Corregido (2026-10-12) |
| F21 | 🟠 | Funcional | Cada pantalla suma distinto: Historial y el panel usan el total con propina, recargo y domicilio; Reportes y Contable, el subtotal | ✅ Corregido (2026-10-12) |
| F22 | 🟡 | Funcional | Anular la venta de una cita deja la cita "atendida" y no revierte las cifras del cliente | ✅ Corregido (2026-10-12) |
| F23 | 🟡 | Funcional | Las líneas y brillos (--linea, --glow) no siguen el color del negocio: quedan verdes | ✅ Corregido (2026-10-12) |
| C3 | 🟡 | Código | Errores tragados en flujos importantes: falla al imprimir la comanda (la cocina no se entera) y al cobrar no queda en auditoría | ✅ Corregido (2026-10-12) |
| S7 | 🟡 | Seguridad | Algunas acciones no validan permiso propio (guardar edición de pedido, conceptos de gasto, cuentas abiertas) | ✅ Corregido (2026-10-12) |
| S8 | 🔴 | Seguridad | El logo del negocio (y otros datos dentro de atributos HTML) se metían sin validar ni escapar: quien edita el negocio podía ejecutar código en la sesión del super-admin | ✅ Corregido (2026-10-12) |
| D9 | 🔴 | Datos | Dos equipos que tocan el mismo pedido o cuenta a la vez se pisan: se pierden productos agregados a una cuenta, o queda cobrada con productos sin cobrar | ✅ Corregido (2026-10-12) |
| D10 | 🟠 | Datos | Lo que la base rechaza (p. ej. todo lo de una prueba vencida) se pierde en silencio: la venta se ve hecha y desaparece al recargar | ✅ Corregido (2026-10-12) |
| S9 | 🟠 | Seguridad | Se aceptan montos negativos (formas de pago, propina, recargo, domicilio, precio): permite sacar efectivo cuadrando la caja o dar descuentos sin permiso | ✅ Corregido (2026-10-12) |
| F24 | 🟠 | Funcional | "Eliminar definitivamente" y "Cambiar forma de pago" no respetan las cajas cerradas (F20 solo cubrió anular y editar); eliminar no revierte cliente ni cita | ✅ Corregido (2026-10-12) |
| S10 | 🟡 | Seguridad | La auditoría y los movimientos se pueden borrar o reescribir desde la consola por cualquier empleado: no son de solo agregar | ✅ Corregido (2026-10-12) |
| S11 | 🟡 | Seguridad | Guardar la edición de un pedido por "Confirmar pedido" no valida el permiso `editar` (S7 cubrió solo el otro botón) | ✅ Corregido (2026-10-12) |
| F25 | 🟡 | Funcional | El escáner de código de barras agrega productos marcados "Agotado" | ✅ Corregido (2026-10-12) |
| F26 | 🟡 | Funcional | Al editar, un descuento fijo puede quedar mayor que el subtotal (venta en $0); el descuento en % se congela como valor | ✅ Corregido (2026-10-12) |
| F27 | 🟡 | Funcional | La alerta de stock bajo se abre con `setTimeout` y puede tapar "¿Imprimir factura?" (lo que F16 prohíbe) | ✅ Corregido (2026-10-12) |
| F28 | 🟡 | Funcional | Eliminar un producto no avisa si está en un combo, no deja movimiento de su stock ni auditoría | ✅ Corregido (2026-10-12) |
| C4 | 🟡 | Código | 6 errores atrapados con `console.error` en venta, cuentas y respaldo, en vez de `reportarError` (C2) | ✅ Corregido (2026-10-12) |
| V1 | 🟡 | Validación | Un campo obligatorio con solo espacios pasaba (productos o usuarios "en blanco"); cuando faltaba uno, la ventana lanzaba una excepción | ✅ Corregido (2026-10-12) |
| V2 | 🟡 | Código | Los errores que nadie atrapaba (promesas sin `.catch`, el botón de las ventanas) no quedaban registrados (C2 solo cubría los atrapados) | ✅ Corregido (2026-10-12) |
| V3 | 🟠 | Validación | Números negativos o fuera de rango en gastos, cierre y base de caja, stock, mínimos, costos, conteo, % del datáfono y precio del plan | ✅ Corregido (2026-10-12) |
| V4 | 🟠 | Validación | Un usuario con "@" no podía entrar nunca (el login lo toma como correo); "Ana" y "ana" podían ser dos usuarios distintos | ✅ Corregido (2026-10-12) |
| V5 | 🟡 | Validación | Dos productos con el mismo código de barras: el escáner vendía siempre el primero | ✅ Corregido (2026-10-12) |
| V6 | 🟠 | Interfaz | Los avisos (toast) quedaban encima de las ventanas y **bloqueaban los clics**: en un celular, o con varios avisos seguidos, tapaban "Guardar" o "Sí, continuar" por 3 segundos | ✅ Corregido (2026-10-12) |
| V7 | 🟠 | Funcional | "Generar temporal" sobre la **propia** cuenta la reemplazaba, la app cerraba la sesión y la temporal se perdía sin mostrarse: el super-admin quedaba sin acceso | ✅ Corregido (2026-10-13) |

---

## Seguridad

### S1 🔴 Base de datos abierta — 🟡 Implementado, falta desplegar
- **Dónde**: `firebase-config.js`, `adaptadores/salida/firebase-datos.js:222` (`initFirebase`), ausencia de reglas en el repositorio.
- **Qué pasa**: la app no usa Firebase Auth; para funcionar, las reglas de Realtime Database deben permitir lectura/escritura sin autenticar. Cualquiera con la URL de la base (visible en `firebase-config.js`, que es público) puede leer y modificar todos los negocios.
- **Impacto**: robo de datos de clientes y ventas de todos los negocios, alteración o borrado total. Anula el aislamiento entre tenants.
- **Estado**: 🟡 El código (Plan B), las reglas y la configuración de la CLI están en el repositorio y probados en los emuladores de Firebase (`npm run test:firebase`: 35 pruebas, incluida la interfaz real en Chrome). Falta lo que exige la consola de Firebase y el despliegue por fases. Mientras tanto se puede ensayar todo en el equipo con `npm run emulador` (cuenta de desarrollo `dev` / `dev12345`, ver [entornos-locales](../-00-execution-protocol/entornos-locales.md)). Detalle de la implementación y los pasos: [-02-corrections → S1](../-02-corrections/-02-corrections.md#s1--base-de-datos-sin-autenticación-ni-reglas--implementado-falta-desplegar).
- **Lo que mostró el export de producción** (`node scripts/preparar-pruebas.mjs <export>`): las 17 contraseñas siguen en texto plano (S2 aún no se desplegó), 3 usuarios tienen menos de 6 caracteres y se les pedirá una nueva al migrar, `negocios` es un array con 188 KB de logos, 15 tablas siguen en formato viejo, y hay dos nodos sin uso en la raíz (`posu`, `prueba_conexion`). Ningún bloqueo para las reglas: ningún id de negocio con `_` ni nombres de usuario repetidos.

La guía de diseño original (antes de implementar) sigue abajo como referencia.

#### Cómo resolver S1

##### La idea en una frase
Hoy la base de datos **no sabe quién le habla**: cualquiera que tenga la URL puede pedirle cualquier cosa. La solución es que cada persona inicie sesión **con Firebase** (no solo con la app), y que la base tenga **reglas** que digan "este usuario solo puede leer y escribir los datos de su negocio".

Hoy el login funciona así:

```
Navegador ──descarga TODOS los usuarios──▶ compara la contraseña en el navegador ──▶ "entra"
Base de datos: abierta para cualquiera
```

Así debe quedar:

```
Navegador ──usuario + contraseña──▶ Firebase Authentication ──▶ "sí, es Ana (uid 7f3…)"
Navegador ──"soy 7f3…, dame data_N1_ventas"──▶ Realtime Database
Reglas: ¿7f3… pertenece al negocio N1? sí ──▶ entrega
        ¿7f3… pide data_N2_ventas?       no ──▶ "Permission denied"
```

La contraseña la verifica Firebase en sus servidores. La lista de usuarios y contraseñas **deja de viajar** a los navegadores.

##### Las tres piezas

**1. Firebase Authentication (quién eres)**
- Se activa en la consola de Firebase: *Authentication → Sign-in method → Email/Password*.
- Los usuarios de Wallace entran con un nombre de usuario, no con correo. Se usa un correo interno derivado del usuario, que la persona nunca ve: `cajero1` → `cajero1@usuarios.wallace-system.app`. No tiene que ser un correo real; nadie lo recibe.
- En *Authentication → Settings → Authorized domains* se deja solo el dominio de producción (y `localhost` para pruebas).

**2. Perfil de cada usuario (a qué negocio pertenece)**
Un nodo nuevo en la base, que solo el super-admin puede escribir:

```
perfiles/
  <uid de Firebase>: { negocioId: "N1", rol: "cajero", usuario: "cajero1" }
  <uid del dueño>:   { rol: "superadmin", rolSuper: "dueno" }
```

Las reglas leen este nodo para decidir. (Alternativa: guardar `negocioId` y rol como *custom claims* dentro del token de sesión. Es más rápido para las reglas, pero obliga a usar Cloud Functions también para eso; con `perfiles` es más simple de ver y corregir desde la consola.)

**3. Reglas de seguridad (qué puedes tocar)**
Archivo `database.rules.json`, versionado en el repositorio y publicado con `firebase deploy --only database` (o pegado en la consola: *Realtime Database → Reglas*). Base propuesta:

```json
{
  "rules": {
    ".read": false,
    ".write": false,

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
          ".read": "root.child('perfiles/' + auth.uid + '/negocioId').val() === $negId",
          ".write": "root.child('perfiles/' + auth.uid + '/negocioId').val() === $negId && root.child('perfiles/' + auth.uid + '/rol').val() === 'admin'"
        }
      },

      "$clave": {
        ".read":  "auth != null && $clave.beginsWith('data_' + root.child('perfiles/' + auth.uid + '/negocioId').val() + '_')",
        ".write": "auth != null && $clave.beginsWith('data_' + root.child('perfiles/' + auth.uid + '/negocioId').val() + '_')"
      }
    }
  }
}
```

Qué hace cada parte:
- Todo cerrado por defecto (`false`).
- El super-admin lee y escribe todo `data` (lo necesita su panel y el respaldo).
- Un empleado solo lee y escribe las claves que empiezan por `data_<su negocio>_`. Si pide `data_N2_ventas` siendo de N1, Firebase responde *Permission denied*.
- `superadmins` y `usuarios` quedan fuera del alcance de los empleados (no coinciden con su prefijo).
- Cada uno lee solo su propio perfil.

##### Cambios necesarios en `app.js`

> Propuesta original, escrita con el SDK *compat* de Firebase. Lo implementado está en [-02 → S1](../-02-corrections/-02-corrections.md); desde el 2026-10-11 los adaptadores usan el SDK **modular** (`ref`, `get`, `signInWithEmailAndPassword(auth, …)`) y no existe el objeto global `firebase`.

1. **Cargar el SDK de Auth** en `index.html`, junto a los otros dos de Firebase:
   ```html
   <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
   ```
2. **Login nuevo** (reemplaza la comparación en el navegador de `login`, `ui/usuarios/sesion.js`):
   ```js
   async function hacerLogin(){
     const correo = usuario.trim().toLowerCase() + '@usuarios.wallace-system.app';
     try{
       const cred = await firebase.auth().signInWithEmailAndPassword(correo, pass);
       const perfil = (await FB.ref('perfiles/' + cred.user.uid).once('value')).val();
       if(perfil.rol === 'superadmin'){ /* panel super-admin + sincronizarTodo() */ }
       else { /* leer data/negocios_r/<negocioId>, validar activo, sincronizarNegocio() */ }
     }catch(e){ toast('Usuario o contraseña incorrectos','error'); }
   }
   ```
   `logout` llama `firebase.auth().signOut()`. La sesión queda guardada en el equipo: al recargar no hay que volver a escribir la contraseña (`firebase.auth().onAuthStateChanged`).
3. **No descargar tablas globales antes del login**: `cargarDeLaNube` (`adaptadores/salida/firebase-datos.js:249`) deja de leer `negocios`, `usuarios` y `superadmins`. El empleado solo lee su perfil y su negocio.
4. **`negocios` por registro**: hoy es un único array (`data/negocios`) y las reglas no pueden dar acceso a "solo el elemento 3 del array". Se pasa a `data/negocios_r/<negId>`, el mismo esquema por registro que ya usan ventas y productos (`guardarMisDatos`/`migrarTablaVieja` sirven de modelo).
5. **Altas, bajas y cambios de contraseña de usuarios** pasan a funciones de servidor (ver abajo): crear usuario, cambiar contraseña de otro, desactivar y eliminar. La app solo las llama.
6. **Dejar de usar** `verificarPass`, `passHash`, `passSal` del lado del cliente una vez terminada la migración (punto 4 del plan).

##### Por qué hacen falta Cloud Functions

Desde el navegador, Firebase solo deja a cada persona cambiar **su propia** contraseña. Que el super-admin cree usuarios, le ponga una contraseña nueva a un empleado que la olvidó, o lo desactive, requiere el **Admin SDK**, que solo corre en un servidor. Lo más simple es Cloud Functions de Firebase:

```js
// functions/index.js (Node, Admin SDK)
exports.gestionarUsuario = onCall(async (req) => {
  const yo = (await db.ref('perfiles/' + req.auth.uid).get()).val();
  if(yo?.rol !== 'superadmin') throw new HttpsError('permission-denied', 'Solo el super-admin');
  const { accion, usuario, pass, negocioId, rol } = req.data;
  const email = usuario + '@usuarios.wallace-system.app';
  if(accion === 'crear'){
    const u = await admin.auth().createUser({ email, password: pass });
    await db.ref('perfiles/' + u.uid).set({ negocioId, rol, usuario });
  }
  if(accion === 'cambiarPass'){ const u = await admin.auth().getUserByEmail(email); await admin.auth().updateUser(u.uid, { password: pass }); }
  if(accion === 'desactivar'){ const u = await admin.auth().getUserByEmail(email); await admin.auth().updateUser(u.uid, { disabled: true }); }
});
```

- Cloud Functions exige el **plan Blaze** (pago por uso) de Firebase. Para el volumen de este sistema el consumo normalmente cae dentro de la cuota gratuita, pero hay que registrar un medio de pago y conviene poner una alerta de presupuesto.
- Sin Blaze también se puede: el [Plan B](../-02-corrections/-02-corrections.md#plan-b--sin-pago-por-uso-plan-spark-gratuito--elegido-de-momento) crea usuarios desde el navegador con una segunda instancia de Firebase y resuelve el cambio de contraseña de otro creando una cuenta nueva. **Es el plan elegido de momento.**

##### Migración de los usuarios que ya existen (sin pedirles nada)

Hoy hay usuarios con contraseña guardada como hash; nadie conoce esas contraseñas. Para que cada uno conserve la suya:

1. Una función `migrarCuenta` (Cloud Function) recibe usuario + contraseña, la compara **en el servidor** contra el `passHash` de `data/usuarios` (misma fórmula de `hashPass`) y, si coincide, crea la cuenta de Firebase Auth con esa contraseña y su perfil.
2. El login nuevo intenta primero `signInWithEmailAndPassword`. Si la cuenta no existe todavía, llama a `migrarCuenta` y vuelve a intentar.
3. Cada usuario queda migrado la primera vez que entra. Nadie nota el cambio.

##### Orden de despliegue (para no dejar a nadie afuera)

| Fase | Qué se hace | Reglas de la base | Riesgo |
|---|---|---|---|
| 0 | Crear un **proyecto de Firebase de prueba** con una copia de los datos (importar el respaldo). Hacer todo allí primero. | — | Ninguno sobre producción |
| 1 | Activar Auth, plan Blaze y desplegar las Cloud Functions en producción. | Abiertas (como hoy) | Bajo: nada cambia para los usuarios |
| 2 | Publicar el `app.js` nuevo (login con Firebase + migración automática). | Abiertas | Bajo: si algo falla se vuelve a la versión anterior |
| 3 | Esperar a que todos entren al menos una vez. Comparar cuántos `perfiles` hay contra cuántos `usuarios`. A los que no entraron, el super-admin les pone contraseña nueva con `gestionarUsuario`. | Abiertas | — |
| 4 | Publicar `database.rules.json`. | **Cerradas** | Medio: si una regla quedó mal, alguien no puede trabajar. Las reglas se revierten en segundos desde la consola. |
| 5 | Borrar `passHash`/`passSal` de `data/usuarios` y la tabla global de contraseñas ya no se usa. | Cerradas | — |

##### Cómo comprobar que quedó resuelto

1. **Sin sesión no se lee nada**: abrir en el navegador `https://<proyecto>-default-rtdb.firebaseio.com/data.json`. Debe responder `"Permission denied"`. Hoy responde con todos los datos.
2. **Un negocio no ve otro**: iniciar sesión como empleado de N1 y, en la consola del navegador, preparar el lector:
   ```js
   // En la consola (F12), con la sesión iniciada: el mismo SDK que cargó la app
   const {database:D, app:A}=(await import('/src/adaptadores/salida/firebase-sdk.js')).sdkCargado();
   const leer=r=>D.get(D.ref(D.getDatabase(A.getApp()), r));
   ```
   Luego `await leer('data/data_N2_ventas_r')`: debe fallar con *permission denied*.
3. **Un empleado no ve credenciales**: `await leer('data/usuarios')` debe fallar.
4. **Un empleado no se sube de rango**: intentar escribir en `perfiles/<su uid>/rol` debe fallar.
5. **Simulador de reglas** de la consola (*Realtime Database → Reglas → Simulador*): probar cada caso anterior con distintos `auth.uid`.
6. Repetir el [protocolo de verificación](../-00-execution-protocol/-00-execution-protocol.md#7-protocolo-de-verificación-smoke-test) completo con roles distintos.

##### Decisiones que debe tomar el dueño del sistema

- ~~¿Se activa el plan Blaze para Cloud Functions?~~ **Decidido: de momento no.** Se sigue el [Plan B, sin pago por uso](../-02-corrections/-02-corrections.md#plan-b--sin-pago-por-uso-plan-spark-gratuito--elegido-de-momento).
- ~~¿Qué puede ver un super-admin **vendedor**?~~ **Decidido (2026-10-12): solo sus negocios** (los que tienen su `vendedorId` y sus demos, `demoDe`), en las reglas. Ver [01-super-admin-panel](../01-super-admin-panel/01-super-admin-panel.md), sección 12.
- ¿Puede el **admin de un negocio** crear empleados (hoy solo el super-admin puede)? Si sí, la Cloud Function debe permitirlo para su propio `negocioId`.

##### Qué se gana
- Nadie sin sesión puede leer ni modificar la base.
- Un negocio no puede ver datos de otro, ni siquiera manipulando la app.
- Las contraseñas (ni siquiera sus hashes) ya no viajan a los navegadores.
- Los permisos de rol pueden reforzarse en las reglas (p. ej. que solo `admin` pueda escribir en `negocios_r`), no solo en la interfaz.

### S2 🔴 Contraseñas en texto plano y visibles — ✅ Corregido
- **Dónde estaba** (código antes de la corrección; línea aproximada en la versión actual): `login` (`ui/usuarios/sesion.js`), `TABLAS_GLOBALES` (`adaptadores/salida/firebase-datos.js`), `pantallaUsuarios` (`ui/usuarios/usuarios-admin.js`).
- **Qué pasa**: `usuarios` y `superadmins` se descargan completas a cualquier navegador **antes** del login (para validar en local) y quedan en `localStorage`. Las contraseñas se guardan y comparan sin hash, y el panel las muestra en una columna.
- **Impacto**: cualquier equipo que abra la app obtiene las credenciales de todos los empleados y super-admins.
- **Propuesta**: autenticación del lado del servidor (S1); mientras tanto, como mínimo, hash (p. ej. SHA-256 + sal) y no mostrar contraseñas en tablas.
- **Solución aplicada**:
  1. Funciones nuevas (`dominio/contrasenas.js` (reglas) y `ui/usuarios/sesion.js` (`ponerPass`, `migrarContrasenas`)): `sha256Hex` (SHA-256 en JavaScript puro, síncrono, no depende de HTTPS), `hashPass` (SHA-256 iterado 3.000 veces sobre sal + contraseña), `nuevaSal` (16 bytes aleatorios con `crypto.getRandomValues`), `ponerPass(rec, pass)` y `verificarPass(rec, pass)`.
  2. Los registros de `usuarios` y `superadmins` guardan `passHash`, `passSal` y `passIter`; el campo `pass` se elimina.
  3. `migrarContrasenas()` (llamada desde `seed`) convierte al primer arranque todas las contraseñas en texto plano y reescribe las tablas en la nube. Los usuarios entran con la misma contraseña de siempre.
  4. `login` (`ui/usuarios/sesion.js`) valida con `verificarPass`; acepta registros aún no migrados.
  5. Todo lugar que escribe contraseñas usa `ponerPass`: crear/editar super-admin, "Mi contraseña" (que valida la actual con `verificarPass`), crear negocio, crear demo, crear/editar usuario y cambio de contraseña desde el negocio.
  6. La tabla de usuarios ya no muestra contraseñas; al editar, el campo es de tipo contraseña, viene vacío y "vacío = no cambiar". Se agregó la casilla "Usuario activo" (F7).
- **Residual**: los hashes siguen descargándose a todos los equipos hasta que se haga S1; una contraseña corta podría adivinarse probando combinaciones. Volver a publicar el `app.js` anterior dejaría a todos sin acceso (hacer respaldo antes de desplegar).
- **Detalle y pruebas**: [-02-corrections](../-02-corrections/-02-corrections.md#s2--contraseñas-en-texto-plano-).

### S3 🔴 Contraseña inicial embebida — ✅ Corregido
- **Dónde estaba** (código antes de la corrección; línea aproximada en la versión actual): `seed()`, `ui/nucleo/arranque.js`.
- **Qué pasa**: la contraseña del super-admin dueño inicial está en el código fuente público.
- **Propuesta**: crear el primer super-admin con un procedimiento fuera del código (consola de Firebase o script) y forzar cambio de contraseña. Verificar que en producción ya se cambió.
- **Solución aplicada**:
  1. `seed()` (`ui/nucleo/arranque.js`) ya no crea super-admins ni contiene contraseñas.
  2. Si no existe ningún super-admin, `render` muestra la pantalla de configuración inicial (`vistaConfigInicial`, `ui/usuarios/sesion.js`): nombre, usuario y contraseña de mínimo 8 caracteres con confirmación.
  3. `crearDuenoInicial` (`ui/usuarios/sesion.js`) guarda la contraseña con hash y, con nube, usa una transacción sobre `data/superadmins` que solo escribe si la tabla sigue vacía.
  4. Nueva bandera `GLOBALES_LEIDAS` (`Datos.estado.globalesLeidas`, `adaptadores/salida/firebase-datos.js:40`): `seed` y la configuración inicial solo actúan si las tablas globales se leyeron bien de la nube, para que un fallo de red no termine sobrescribiendo datos reales.
- **Pendiente manual**: la contraseña antigua sigue en el historial de git; verificar en Firebase que el dueño de producción ya no la usa.
- **Detalle y pruebas**: [-02-corrections](../-02-corrections/-02-corrections.md#s3--contraseña-inicial-embebida-).

### S4 🟠 Autorización solo en el cliente — ✅ Corregido
- **Dónde estaba** (código antes de la corrección; línea aproximada en la versión actual): `tienePermiso` (`ui/nucleo/permisos.js`). Sin revalidación en `cobrarPedido` (3024), `anularPedido` (3192), `abrirDescuento` (2211 — el botón se muestra a todos), `movimientoCaja` (4074), `toggleNegocio` (1806), `eliminarCliente`, `eliminarGasto`, `nuevoGasto`.
- **Impacto**: cualquier usuario puede ejecutar acciones sin permiso desde la consola; en el caso de descuentos, incluso desde la interfaz.
- **Propuesta**: validar `tienePermiso` al inicio de cada acción sensible; mostrar el botón de descuento solo con `descuento`; a futuro, reglas de servidor (S1).
- **Solución aplicada**:
  1. Funciones nuevas (`ui/nucleo/permisos.js`): `exigirPermiso(accion, texto)`, `esAdminSistema()` (dueño o ayudante, no vendedor), `pantallasPermitidas()` y `puedeVerPantalla(id)`.
  2. Validación al **inicio** de más de 25 funciones: `cobrarPedido` y `cobrarDirecto` (permiso `cobrar`), `anularPedido` (`anular`), `abrirDescuento` (`descuento`; el botón ya solo se muestra con el permiso), `movimientoCaja` (`abrircaja` o jefe), funciones del super-admin (`descargarRespaldo`, `asignarVendedor`, `configNegocio`, `usuariosNegocio`, `guardarConfig`, `editarUsuario`, `eliminarUsuario`, sucursales, informe mensual), `toggleNegocio` (el vendedor solo sus demos), y por pantalla: clientes, gastos, Mi Negocio, pedidos, domicilios, cocina y citas.
  3. `render` no deja abrir la configuración ni los usuarios de un negocio a un vendedor.
- **Cambio visible**: un usuario sin permiso `cobrar` (p. ej. mesero) ya no puede usar "Cobrar ahora" en negocios de cobro directo.
- **Residual**: sigue siendo control en el navegador; la protección real llega con S1.
- **Detalle y pruebas**: [-02-corrections](../-02-corrections/-02-corrections.md#s4--permisos-solo-en-la-interfaz-).

### S5 🟠 Pantalla inicial sin control de rol — ✅ Corregido
- **Dónde estaba** (código antes de la corrección; línea aproximada en la versión actual): `login` fija `STATE.pageNeg='inicio'` (`ui/nucleo/estado.js`); `renderContenido`/`vistaNegocio` no comprueban que la pantalla esté permitida.
- **Impacto**: el rol `cocina` (sin `inicio`) ve al entrar el Dashboard con ventas y dinero.
- **Propuesta**: al iniciar sesión, ir a la primera pantalla permitida del menú y validar `STATE.pageNeg` contra `armarMenu()` en cada render.
- **Solución aplicada**:
  1. `login` deja la pantalla inicial vacía (`STATE.pageNeg=''`).
  2. `pantallaValida()` (`ui/nucleo/permisos.js`) se ejecuta antes de dibujar en `vistaNegocio` y `renderContenido`: si la pantalla pedida no está entre las permitidas del menú, cambia a la primera permitida.
- **Resultado**: cocina ya no entra al Dashboard; un cajero que pide Contable se queda en su pantalla.
- **Detalle y pruebas**: [-02-corrections](../-02-corrections/-02-corrections.md#s5--pantalla-inicial-sin-control-de-rol-).

### S6 🔴 Código inyectable por el nombre de una categoría — ✅ Corregido
- **Dónde estaba** (antes de la fase 8): botones de categoría de Nueva Venta (`ui/ventas/nueva-venta.js`) e Inventario (`ui/inventario/catalogo.js`, dos veces): `onclick="_vCat='${escapeHtml(c)}';render()"`.
- **Qué pasaba**: el navegador decodifica `&#39;` a `'` antes de ejecutar el `onclick`, así que `escapeHtml` no protegía. Un apóstrofo en la categoría cerraba la cadena y lo que seguía se ejecutaba como código.
- **Impacto**: XSS almacenado. Quien pueda editar productos (p. ej. un empleado con permiso de inventario) podía hacer ejecutar código en la sesión de quien abriera esas pantallas: el dueño, el administrador o el super-admin al entrar al negocio. Ese código podía usar sus permisos y su sesión de Firebase. Sin ataque: una categoría como `Niño's` dejaba el botón sin funcionar.
- **Propuesta**: no mezclar datos con código en atributos de evento.
- **Solución aplicada** (fase 8):
  1. El nombre va en `data-cat="${escapeHtml(c)}"` y la acción lo lee como texto: `data-click="elegirCategoriaVenta(this.dataset.cat)"` (`elegirCategoriaInventario` en el catálogo).
  2. Ya no hay ningún `onclick` en las plantillas; `ui/nucleo/eventos.js` interpreta `data-click` sin `eval` y solo llama funciones exportadas.
- **Resultado**: la prueba de clics reales del recorrido usa una categoría `Niño's` y funciona. `tests/ui/estructura.test.mjs` falla si vuelve un `on…="…"`.
- **Residual y ataques relacionados** (HTML inyectado con `onerror`, CSS, CSP recomendada): [seguridad-interfaz](../-03-architecture/seguridad-interfaz.md).
- **Detalle**: [-02-corrections](../-02-corrections/-02-corrections.md#s6--código-inyectable-por-el-nombre-de-una-categoría-).

## Datos y concurrencia

### D1 🔴 Consecutivo de factura duplicable — ✅ Corregido
- **Dónde estaba** (código antes de la corrección; línea aproximada en la versión actual): `armarVenta` (`ui/ventas/nueva-venta.js`), `cobrarCitaEntregada` (`ui/citas/citas.js`). La tabla `factura_seq` está declarada pero no se usa.
- **Qué pasa**: el número es "mayor número que tengo en este equipo + 1". Dos equipos que venden a la vez (o uno sin internet) generan el mismo número.
- **Propuesta**: usar una transacción de Firebase sobre `data_<neg>_factura_seq` para reservar el consecutivo, con prefijo por equipo como respaldo offline.
- **Solución aplicada** (`ui/ventas/nueva-venta.js`; reglas en `dominio/facturas.js`; reserva en `Datos.reservarConsecutivo`):
  1. `reservarFactura()`: cada equipo reserva de antemano su próximo número con una transacción sobre `data_<negocio>_factura_seq` (máximo entre el contador y la mayor factura local, + 1). Firebase serializa las transacciones, así que dos equipos nunca reciben el mismo número.
  2. `siguienteFactura()`: usa el número reservado (instantáneo) y pide el siguiente. Sin reserva (sin internet) usa el mayor entre lo conocido localmente y lo último reservado, + 1.
  3. Se reserva al terminar de bajar las ventas del negocio, al entrar como supervisor y tras cada uso; la reserva se descarta al salir o cambiar de negocio.
  4. Lo usan `armarVenta` y `cobrarCitaEntregada`. La tabla `factura_seq` ahora sí se usa.
- **Comportamiento**: puede haber saltos en la numeración (número reservado que no se usó), nunca repetidos con conexión.
- **Residual**: un equipo sin conexión desde el inicio aún podría repetir un número.
- **Detalle y pruebas**: [-02-corrections](../-02-corrections/-02-corrections.md#d1--consecutivo-de-factura-repetible-).

### D2 🔴 Stock con "última escritura gana" — ✅ Corregido
- **Dónde estaba** (código antes de la corrección; línea aproximada en la versión actual): `moverInventario` (`ui/inventario/motor.js`) calcula `p.stock = antes + cant` en el equipo y `_subirRegistros` sube el valor absoluto del campo `stock`.
- **Qué pasa**: si dos equipos venden el mismo producto casi al mismo tiempo, ambos parten del mismo stock y uno sobrescribe al otro: se pierde un descuento.
- **Impacto**: inventario descuadrado sin rastro, justamente lo que el motor busca evitar.
- **Propuesta**: aplicar los cambios de stock con `transaction()` o `ServerValue.increment()` sobre `.../<id>/stock` (y lotes), en vez de escribir el valor absoluto.
- **Solución aplicada**:
  1. Nueva función `cambiarStock(tabla, id, fn)` (`adaptadores/salida/firebase-datos.js:180`): el cambio se describe como una función ("restar 2 y descontar de los lotes"), se aplica de inmediato en el equipo y además dentro de una transacción de Firebase sobre `data_<neg>_<tabla>_r/<id>`, que la vuelve a aplicar sobre el valor real del servidor si otro equipo se adelantó.
  2. Pasan por `cambiarStock`: `moverInventario` (ventas, anulaciones, ediciones, salidas, cuentas canceladas), `entradaStock` (los ids de lote se generan fuera para que un reintento no los duplique), `retirarLote`, `entradaInsumo`, `descontarApartado`, `devolverApartado` y el ajuste de `guardarConteo`.
  3. El ajuste por conteo ahora aplica la **diferencia** contada en vez de fijar el valor, para no borrar ventas hechas mientras se contaba.
- **Residual**: editar el producto desde su formulario sigue fijando el stock como valor (F11).
- **Detalle y pruebas**: [-02-corrections](../-02-corrections/-02-corrections.md#d2--stock-última-escritura-gana-).

### D3 🟠 Historiales sin límite efectivo — ✅ Corregido
- **Dónde estaba** (código antes de la corrección; línea aproximada en la versión actual): `logAudit` (`slice(0,800)`, `ui/usuarios/auditoria.js`), `moverInventario` (`slice(0,1000)`), `guardarConteo` (`slice(0,200)`), `guardarMisDatos` (`adaptadores/salida/firebase-datos.js:149`).
- **Qué pasa**: `guardarMisDatos` fusiona con todo lo que hay en caché y nunca borra; el recorte no elimina nada ni local ni en la nube.
- **Impacto**: `auditoria`, `movimientos` y `conteos` crecen indefinidamente; más datos en cada carga y en cada equipo.
- **Propuesta**: eliminar explícitamente los registros sobrantes con `eliminarMisDatos`, o archivar por mes; o asumir el crecimiento y quitar los `slice` engañosos.
- **Solución aplicada**: se quitaron los recortes engañosos de `logAudit`, `moverInventario` y `guardarConteo`, y ahora se envían **solo los registros nuevos** (`guardarMisDatos(tabla, [nuevo])`). Nueva función `registrarMovimientos(lista)` (`ui/inventario/motor.js`).
- **Decisión**: se conserva todo el historial (la auditoría no debe perder registros). Las pantallas siguen mostrando solo lo más reciente.
- **Residual**: las tablas crecen con el tiempo; si hace falta, archivar por mes.
- **Detalle y pruebas**: [-02-corrections](../-02-corrections/-02-corrections.md#d3--recortes-de-historial-sin-efecto-).

### D4 🟠 Conceptos de gasto no sincronizados — ✅ Corregido
- **Dónde estaba** (código antes de la corrección; línea aproximada en la versión actual): `getConceptosGasto`/`guardarConceptos` (`ui/gastos/gastos.js`), clave `data_<neg>_conceptos_gasto` fuera de `TABLAS`.
- **Qué pasa**: se escribe en la nube pero ningún equipo de negocio la escucha ni la baja con "Actualizar"; además `eliminarNegocio` solo la borra si está en el caché del equipo que elimina.
- **Propuesta**: agregar `conceptos_gasto` a `TABLAS` y a `TABLAS_UNICAS`.
- **Solución aplicada**: `conceptos_gasto` se agregó a `TABLAS` y a `TABLAS_UNICAS` (`adaptadores/salida/firebase-datos.js:19`, `23`). Ahora se escucha en tiempo real, se baja con "Actualizar", se borra junto con el negocio y entra en el respaldo.
- **Detalle y pruebas**: [-02-corrections](../-02-corrections/-02-corrections.md#d4--conceptos-de-gasto-sin-sincronizar-).

### D5 🟡 Apertura de caja simultánea — ✅ Corregido
- **Dónde estaba** (código antes de la corrección; línea aproximada en la versión actual): `abrirCaja` (`ui/caja/caja.js`).
- **Qué pasa**: la verificación "ya hay una caja abierta" es local; dos equipos que abren a la vez crean dos cajas y la última sobrescribe a la primera (las ventas con el `cajaId` perdido igual entran por fecha ≥ apertura, pero puede quedar una base distinta).
- **Propuesta**: transacción sobre `caja_actual`.
- **Solución aplicada** (`ui/caja/caja.js`; `cajaDe` en `dominio/caja.js`; `transaccionUnica` en `adaptadores/salida/firebase-datos.js:211`):
  1. Nuevas funciones `transaccionUnica(tabla, fn)` (escribe una tabla única con transacción, o en local sin nube) y `cajaDe(valor)`.
  2. `abrirCaja` solo escribe si **en la nube** no hay caja abierta; si otro equipo se adelantó, avisa "Ya hay una caja abierta por …" y no toca nada.
  3. `cerrarCaja` solo vacía la caja si en la nube sigue abierta esa misma caja; si otro equipo ya cerró, avisa y no registra un segundo cierre. El registro pasó a `terminarCierre(...)`, que recalcula con la caja tal como estaba en el servidor (movimientos de todos los equipos).
- **Cambio visible**: la tirilla de cierre se imprime después de la confirmación de la nube; si el navegador bloquea la ventana, se reimprime desde Contable.
- **Detalle y pruebas**: [-02-corrections](../-02-corrections/-02-corrections.md#d5--apertura-y-cierre-de-caja-simultánea-).

## Funcionales

### F1 🟠 Sucursales a medio implementar — ✅ Corregido
- **Dónde**: `TABLAS_POR_SUCURSAL` (`(eliminada)`, sin uso), `pantallaConfig` pestaña Sucursales (`ui/configuracion/config-negocio.js`), `panelSuperAdmin` lee `data_<id>_ventas-<suc>` (`ui/super-admin/panel.js`) que nunca se escribe.
- **Qué pasa**: la configuración dice "Cada sucursal maneja su caja, pedidos y cierres por separado", pero ventas, caja y cierres son únicos por negocio. El selector de sucursal solo cambia un aviso.
- **Impacto**: un negocio con dos sedes comparte una sola caja y mezcla pedidos.
- **Solución aplicada** (2026-10-08): cada sede tiene **su propia caja** dentro de `caja_actual` (`{cajas:{<sede>:caja}}`; un negocio con una sola sede sigue guardando `[caja]` como siempre), su **base del día siguiente** (`config.basesSucursal`), y ventas y cierres llevan `sucursalId`. Pedidos, Reimpresiones y el cierre de caja ven solo la sede activa; Dashboard, Reportes, Contable y la numeración de facturas siguen siendo de todo el negocio. Reglas en `dominio/caja.js` (`cajaDe(v, sede)`, `conCaja`, `cajasDe`, `sucursalesConCaja`, `deSucursal`); la interfaz entra a la caja solo por `cajaActual()` / `guardarCajaActual()` (`ui/nucleo/permisos.js`). No se puede quitar una sede con caja abierta. Probado en navegador: abrir, vender y cerrar en una sede no toca la otra.

### F2 🟠 Fechas UTC en reportes — ✅ Corregido
- **Dónde**: `inicio` (`ui/reportes/dashboard.js`, `3794`), `reportes` (`ui/reportes/reportes.js`, `5650`, `5660`, `5670`).
- **Qué pasa**: las claves de día se arman con `toISOString()` (UTC) y se comparan con `jornadaDe(v)` (fecha local). En Colombia, desde las 7 p. m. la barra de "hoy" usa la fecha de mañana y aparece en 0; la comparación "hace 7 días" mira `v.fecha` en UTC.
- **Solución aplicada**: Dashboard y Reportes arman las claves de día y mes con `fechaLocal`, y "hace 7 días" compara la jornada de la venta. **Mismo error encontrado en Gastos**: los gastos de caja se guardaban con `fecha:now()` (hora UTC), así que uno de las 8 p. m. del último día del mes caía en el mes siguiente en Gastos y Contable. Ahora guardan el día de la jornada, y para los viejos `dominio/fechas.js` → `diaDe`/`mesDe` convierte el ISO al día local.

### F3 🟠 Buscadores que no filtran — ✅ Corregido
- **Dónde**: Pedidos (`ui/ventas/pedidos.js`), Conteo (`ui/inventario/conteo.js`), Historial (`ui/reportes/historial.js`).
- **Qué pasa**: `oninput` solo asigna la variable (`_pBusca`, `_conteoBusca`, `_hBusca`) sin redibujar; la tabla no cambia hasta otro render.
- **Solución aplicada**: los tres buscadores llaman `render()` al escribir, como los demás (el foco y el cursor se conservan; en Conteo lo contado no se pierde porque vive en `_conteo`).

### F4 🟠 Domicilios vs. Cuadre — ✅ Corregido
- **Dónde**: `domicilios` (`ui/clientes/domicilios.js`, `5607`).
- **Qué pasa**: clasifica efectivo/banco con `v.domPorBanco || v.metodo==='banco'` (`domPorBanco` nunca se asigna y `metodo` es `mixto` en pagos divididos), mientras `cuadreDomi` usa `reparte()`.
- **Solución aplicada**: Domicilios usa `reparte(v, v.valorDom)`, la misma regla del Cuadre; con pago dividido la fila dice "Mixto" con cuánto entró en efectivo y cuánto por banco.

### F5 🟡 Plantilla sin interpolar — ✅ Corregido
- **Dónde**: `recetaFilasHTML` (`ui/inventario/catalogo.js`).
- **Qué pasa**: el mensaje usa comillas simples con `${pProd()}`; se ve el texto literal.
- **Solución aplicada**: plantilla con backticks (`ui/inventario/catalogo.js`).

### F6 🟡 Nombres de plan — ✅ Corregido
- **Dónde estaba**: `nuevoNegocio` (Básico/Profesional/**Premium**), demos (Premium), `pantallaConfig` (Básico/Profesional/**Empresarial**), `VENTANAS_POR_PLAN`.
- **Impacto**: un negocio Premium aparece sin plan seleccionado en Configuración y al guardar pasa a Básico; la plantilla de ventanas no reconoce Premium.
- **Solución aplicada**: el export de producción confirmó que los datos usan **Premium** (3 negocios) y nunca "Empresarial". Constante `PLANES = ['Básico','Profesional','Premium']` y `planDe(neg)` (junto a `ROLES` en `app.js`): crear negocio, Configuración y `VENTANAS_POR_PLAN` usan la misma lista; un "Empresarial" que hubiera quedado se lee como Premium.

### F7 🟡 Usuarios no desactivables — ✅ Corregido (con S2)
- **Dónde estaba** (código antes de la corrección; línea aproximada en la versión actual): `login` filtra `activo!==false`, pero ninguna pantalla cambia `activo`.
- **Propuesta**: agregar "Activo" al formulario de usuario (útil para bajas temporales sin perder historial).
- **Solución aplicada**: casilla "Usuario activo" en el formulario de usuario del super-admin (`editarUsuario`). Un usuario desactivado no puede iniciar sesión y conserva su historial. Ver [-02-corrections](../-02-corrections/-02-corrections.md#s2--contraseñas-en-texto-plano-).

### F8 🟡 Apartados sin rastro — ✅ Corregido
- **Dónde**: `descontarApartado`/`devolverApartado` (`ui/citas/citas.js`/`7465`).
- **Qué pasa**: no usan `moverInventario`, no generan movimientos ni auditoría.
- **Solución aplicada**: `descontarApartado`/`devolverApartado` pasan por `moverInventario` (quedan en Movimientos, respetan lotes y si el negocio lleva inventario) y apartar, no recoger, cancelar o eliminar una cita con apartados queda en Auditoría.

### F9 🟡 Cobro de entrega de cita — ✅ Corregido
- **Dónde**: `cobrarCitaEntregada` (`ui/citas/citas.js`).
- **Qué pasa**: un solo método de pago (sin `pagos{}`), no valida caja abierta (crea venta con `cajaId:null`), no ofrece descuento ni propina.
- **Solución aplicada**: la entrega se cobra con el mismo `abrirCobro` de cualquier venta (pago dividido, cambio, propina, verificación de transferencias), con `stockAplicado` según la cita para no descontar dos veces. Exige la caja abierta y el permiso `cobrar`. `abrirCobro` recibe opciones (`sinCarrito`, `alCobrar`, `pantalla`) para no borrar el pedido que se esté armando en Nueva Venta.

### F10 🟡 Doble escape — ✅ Corregido
- **Dónde**: `cobrarCitaEntregada` (`ui/citas/citas.js`) pasa `escapeHtml(cita.cliente)` en `titulo` y `abrirModal` vuelve a escapar.
- **Solución aplicada**: desapareció con F9 (ya no hay título propio). Se buscaron los demás textos que se escapaban dos veces: los mensajes de borrar empresa, borrar demo y borrar gasto pasaban `escapeHtml` a `confirmarModal`, que ya escapa (un negocio "Pan & Café" se veía `Pan &amp; Café`). Corregidos; además `confirmarModal` respeta los saltos de línea.

### F11 🟡 Cambios de stock sin rastro — ✅ Corregido
- **Dónde**: `editarProducto` (stock editable sin movimiento, `ui/inventario/catalogo.js`), `entradaStock`, `entradaInsumo`, `retirarLote`, `editarInsumo` (no auditan).
- **Solución aplicada**: editar un producto o insumo ya no fija el stock como valor: aplica la **diferencia** con transacción (no pisa ventas de otros equipos, como D2) y deja un movimiento `ajuste` y un registro en Auditoría. Crear producto con stock deja la entrada "Stock inicial". Entradas de stock e insumos y retiros de lote quedan en Auditoría.

### F12 🟡 Inventario reactivable desde el negocio — ✅ Corregido
- **Dónde estaba**: `guardarMiNegocio`.
- **Qué pasa**: la casilla "Llevar control de inventario" agrega `inventario` a `funciones` aunque el super-admin lo haya quitado en "Ventanas habilitadas".
- **Solución aplicada**: S1 lo volvía obligatorio (las reglas no dejan al admin del negocio escribir `funciones`). `inventarioHabilitado(neg)` = lo habilitó el proveedor; la casilla de Mi Negocio guarda la preferencia `inventarioApagado` y queda deshabilitada si el plan no incluye inventario. `usaInventario` = habilitado y no apagado.

### F13 🟡 Gastos vs. Contable — ✅ Corregido
- **Dónde**: `gastosneg` (todos los gastos de `gastos_negocio`), `contable` (gastos de caja desde los cierres).
- **Qué pasa**: si se borra un gasto de origen caja en Gastos, Contable lo sigue contando.
- **Solución aplicada**: los gastos de caja no se borran desde Gastos (se muestra 🔒 Caja y se explica que se corrigen con una Entrada en la caja). La única fuente es la caja y su cierre.

### F14 🟡 Valorización a precio de venta — ✅ Corregido
- **Dónde**: `inventario` (`ui/inventario/catalogo.js`), `itemsParaContar` (`ui/inventario/conteo.js`).
- **Qué pasa**: "Valor del inventario" y las diferencias del conteo de productos usan `precio` de venta; los insumos usan `costo`.
- **Solución aplicada**: campo "Costo por unidad" en el producto. El valor del inventario y las diferencias del conteo usan el costo (`dominio/inventario.js` → `costoUnitario`, `valorInventario`); los productos sin costo se valoran a precio de venta y la tarjeta dice cuántos son.

### F15 🟡 Relaciones por nombre — ✅ Corregido
- **Dónde**: `domiciliario` en ventas (nombre), estadísticas de productos agrupadas por `i.nombre`, propinas por mesero contadas por rol.
- **Solución aplicada**: las ventas guardan `domiciliarioId` y `vendedorId` además del nombre; Domicilios y el Cuadre agrupan por id. Los más vendidos (Reportes, Contable, informe mensual) se agrupan por `prodId` (`dominio/ventas.js` → `vendidoPorProducto`): renombrar un producto ya no parte sus cifras y dos productos con el mismo nombre no se suman. Propinas: el reparto en partes iguales cuenta solo meseros **activos** y además se muestra quién recibió cada propina (`propinasPorPersona`). Las ventas viejas sin id se agrupan por nombre, como antes.

### F16 🟡 Pregunta de impresión con retraso — ✅ Corregido
- **Dónde estaba**: `ui/ventas/cobro.js`, `ui/ventas/nueva-venta.js` (remisión y comanda corregida) y `ui/citas/citas.js`: `setTimeout(()=>confirmarModal(…),400)`.
- **Qué pasaba**: el modal "¿Imprimir?" se abre 400 ms después. Si en ese lapso se abrió otro modal (p. ej. el cobro de otro pedido), lo reemplaza: `abrirModal` usa un solo contenedor. Lo encontró la prueba de recorrido al encadenar acciones rápido.
- **Impacto**: bajo (una persona rara vez actúa en menos de medio segundo), pero puede perderse lo escrito en el modal tapado.
- **Solución aplicada**: `preguntarDespues(mensaje, alConfirmar, texto, ms)` (`ui/nucleo/componentes.js`) no abre la pregunta si ya hay otro modal activo; lo impreso se repite desde Reimpresiones. El ajuste de pago diferido (`ajustarPagoVenta`) no cambió: ese no se puede omitir.

### F17 🟡 Premium igual a Profesional — ✅ Cerrado por decisión
- **Dónde**: `VENTANAS_POR_PLAN` (`dominio/negocio.js`).
- **Qué pasa**: la plantilla de ventanas de Premium es idéntica a la de Profesional; el precio distinto no habilita nada adicional (el super-admin puede marcar ventanas a mano).
- **Propuesta**: decidir qué incluye cada plan (p. ej. sucursales, combos o cuentas abiertas solo en Premium).
- **Decisión** (2026-10-08, responsable del proyecto): **se mantienen las mismas ventanas** en Profesional y Premium; Premium se diferencia por precio y soporte, fuera del sistema. Se revisó que Profesional ya incluye todas las ventanas existentes, así que Premium no podía sumar ventanas. Si más adelante se quiere diferenciar dentro del sistema, las opciones evaluadas fueron: limitar las sucursales a Premium, o reordenar los tres planes (Premium con cocina y sucursales). Sin cambios de código.

### F18 🟡 Alertas de vencimiento con el inventario apagado — ✅ Corregido
- **Dónde estaba**: `avisarVencimientos` revisaba `funciones` en vez de `usaInventario`.
- **Qué pasaba**: un negocio que apagó el inventario desde Mi Negocio (F12) seguía viendo avisos de lotes por vencer.
- **Solución aplicada**: usa `usaInventario(neg)` (`ui/inventario/motor.js`). Encontrado al mover las reglas de negocio al dominio.

## Rendimiento

### R1 🟡 Volumen de descarga — ✅ Corregido (con S1)
- **Con S1**: `negocios` pasó a `data/negocios_r/<id>`; cada empleado descarga solo su negocio (con su logo), no los 188 KB de logos de todos. Lo del super-admin se resolvió después con el resumen por negocio (ver "Solución aplicada").
- `sincronizarTodo` (`adaptadores/salida/firebase-datos.js:339`) escucha `value` de todo `data/`: cada cambio en cualquier negocio reenvía y re-serializa todo al super-admin.
- El logo en base64 vive dentro de `negocios`, que descargan todos los equipos.
- **Solución aplicada** (con cuentas de Firebase): el panel del super-admin ya no escucha todo `data`. Escucha negocios, administradores, usuarios y un **resumen** por negocio (`data_<neg>_resumen`: ventas por día de los últimos 62 días, por mes, total y cantidad), que publican los equipos del propio negocio cada 20 s si cambió (`ui/reportes/resumen.js`, regla en `dominio/ventas.js`). Los datos completos de un negocio se leen bajo demanda: al supervisarlo (en vivo) y al sacar su informe mensual (`Datos.leerNegocioCompleto`). Botón "📊 Calcular cifras" para los negocios que aún no tienen resumen. Los logos siguen dentro del negocio: con `negocios_r` cada empleado ya baja solo el suyo.

### R2 🟡 Conceptos de gasto — ✅ Corregido
- `acumConcepto` (`ui/gastos/gastos.js`) vuelve a armar el catálogo de conceptos (`getConceptosGasto`) por cada gasto que suma. Con cientos de gastos en Contable son cientos de lecturas y ordenamientos.
- **Solución aplicada**: Gastos y Contable arman el catálogo una vez por pantalla (`catalogoConceptos()`) y lo pasan a cada suma.

## Código sin uso

### C1 🟡 — ✅ Corregido
- **Solución aplicada**: eliminados `buscarCliente`, `claveCajaActual`, `TABLAS_POR_SUCURSAL`, las variables sin uso de `imprimirCierre` y el `|| true` de `registrarSalida` (la remisión de Logística se ofrece siempre, a propósito); `domPorBanco` ya no se lee (F4); `usaCaja` se usa en el cobro de citas (F9); `data_<neg>_usuarios` es la tabla de usuarios de cada negocio (S1).
- ~~`buscarCliente`~~, ~~`claveCajaActual`~~ y ~~`TABLAS_POR_SUCURSAL`~~: eliminados al partir la interfaz (2026-10-08).
- `buscarCliente` (`(eliminada)`): no se invoca.
- `TABLAS_POR_SUCURSAL` (`(eliminada)`) declarado, sin uso (`factura_seq` ya se usa desde la corrección D1).
- `usaCaja` (perfiles y negocio): se escribe pero no se lee.
- ~~`data_<neg>_usuarios`: se escucha pero no se usa~~ → con S1 es la tabla de usuarios de cada negocio (sin contraseñas).
- `imprimirCierre` (`ui/caja/caja.js`): variables `metodos`, `porMet`, `ventasCierre` sin uso.
- `v.domPorBanco`: se lee, nunca se escribe.
- `registrarSalida` (`ui/ventas/nueva-venta.js`): condición `|| true` que vuelve el `if` siempre verdadero.

### C2 🟡 Errores de pantalla ocultos — ✅ Corregido
- **Dónde**: `renderContenido` (`ui/nucleo/navegacion.js`) atrapa la excepción de una pantalla, la escribe en la consola y muestra "Ocurrió un error al mostrar esta pantalla"; `refrescarSiSePuede` (`ui/nucleo/estado.js`) hace `try{ render(); }catch(e){}` y la descarta en silencio.
- **Impacto**: un error real en producción no lo ve nadie salvo que alguien abra la consola del navegador.
- **Mitigación aplicada**: `tests/navegador/recorrido.test.mjs` falla ante cualquier "Error en pantalla" o error de consola, y recorre todas las pantallas de 18 negocios.
- **Solución aplicada**: `reportarError(donde, e)` (`ui/nucleo/componentes.js`): va a la consola, avisa a la persona y queda en la Auditoría del negocio como "Error del sistema" (cada error distinto una vez por sesión). Lo usan `renderContenido`, `refrescarSiSePuede` y las alertas de vencimiento.

## Documentación del repositorio

### DOC1 🟡 — ✅ Corregido (salvo el historial)
- **Solución aplicada**: README raíz sin credenciales falsas, con archivos, pruebas y despliegue actuales; `prueba.html` ya no escribe en la base ni lee `posu`: dice qué reglas están publicadas (transición o cerradas) y permite probar un inicio de sesión. El historial de commits no se puede corregir sin reescribirlo.
- `README.md` raíz: credenciales demo (`superadmin/super123`, `admin/admin123`) que no coinciden con `seed()`; dice "Copia los 7 archivos" (son 8 con `prueba.html`); no menciona Logística, combos, cuentas abiertas, lotes ni conteos.
- `prueba.html`: prueba la lectura sobre el nodo `posu` (no `data`) y deja escrito `prueba_conexion`.
- Historial de commits con mensajes genéricos ("Add files via upload", "Update print statement…") que no describen los cambios.

## Segunda revisión (2026-10-12)

Revisión de los flujos completos (vender, cobrar, anular, editar, caja, inventario, citas, reportes, demos y prueba) con dos métodos:
- un análisis automático de los 48 módulos de la interfaz: reglas de `CLAUDE.md`, acciones que escriben sin validar permiso, errores tragados, texto de usuario sin escapar en HTML, stock fijado como valor y código sin uso;
- la lectura del código de cada flujo.

**Lo que salió bien**:
- ningún texto de usuario sin escapar en el HTML (después de S6);
- todos los cambios de stock pasan por `cambiarStock` con movimiento;
- no hay fechas UTC usadas como día;
- no hay preguntas diferidas con `setTimeout`.

### D6 🔴 Un pedido de otro turno (o cobrado sin caja) no entra en ningún cierre — ✅ Corregido
- **Dónde**:
  - `abrirCobro` (`ui/ventas/cobro.js`) cambia el estado a pagada, pero **no actualiza `cajaId`**, que se fijó al **crear** el pedido (`armarVenta`, `ui/ventas/nueva-venta.js`);
  - `ventasJornada` (`ui/ventas/pedidos.js`) elige las ventas del cierre así: `cajaId === caja abierta` **o** fecha posterior a la apertura;
  - `cobrarPedido` no exige caja abierta (Nueva Venta sí).
- **Qué pasa**:
  - **Pedido de un turno anterior**: un pedido (o cuenta de mesa) creado en el turno de ayer y cobrado hoy conserva el `cajaId` de ayer y su fecha es anterior a la apertura de hoy. **No entra en el cierre de hoy.** Tampoco entró en el de ayer, porque entonces no estaba pagado.
  - **Cobro con la caja cerrada**: pasa lo mismo con un pedido cobrado con la caja cerrada.
- **Impacto**: ese dinero **no aparece en ningún cierre**. El cajón queda con un sobrante "inexplicable", y Contable lo cuenta en las ventas (por jornada), pero ningún cierre lo cuadra. Con mesas y cuentas abiertas entre turnos es frecuente.
- **Propuesta**:
  1. Al cobrar, poner `cajaId` (y `sucursalId`) de la caja abierta en ese momento.
  2. Si el negocio usa caja, exigir caja abierta para cobrar (como en Nueva Venta).
  3. Una prueba en el recorrido: pedido creado, caja cerrada, caja nueva, cobro → aparece en el cierre nuevo.

- **Solución aplicada** (2026-10-12):
  1. `abrirCobro` (`ui/ventas/cobro.js`) pone en la venta el `cajaId` de la caja abierta **al cobrar**.
  2. Si el negocio usa caja, no deja cobrar sin caja abierta (`usaCajaNegocio`), igual que Nueva Venta y la entrega de citas.
  3. Con F19, el pedido de otro turno sigue a la vista para cobrarlo.
- **Probado**: `tests/navegador/recorrido.test.mjs` → "D6/F19". Pedido sin cobrar, se cierra la caja, sin caja no se cobra, se abre otra caja, se cobra: queda en la caja nueva y entra en su cierre. Con el código anterior la prueba falla.
### D7 🟠 Movimientos de caja sin transacción — ✅ Corregido
- **Dónde**: `movimientoCaja` (`ui/caja/caja.js`) guarda con `guardarCajaActual`, que reescribe toda la tabla única `caja_actual`. Abrir y cerrar sí usan `transaccionUnica` (D5).
- **Qué pasa**: si dos equipos registran un gasto, retiro o entrada casi a la vez, gana el último y **se pierde el otro movimiento**. El gasto sigue en Gastos del negocio, pero no en el cajón.
- **Impacto**: descuadre en el cierre.
- **Propuesta**: agregar el movimiento dentro de `transaccionUnica('caja_actual', …)` sobre el valor real del servidor, como en D5.

- **Solución aplicada** (2026-10-12): `agregarMovimientoCaja` (`ui/caja/caja.js`) agrega el gasto, retiro o entrada con `transaccionUnica('caja_actual', …)` sobre la caja real del servidor, como abrir y cerrar (D5). La usan `movimientoCaja` y la devolución de F20.
- **Probado**: el recorrido ("D7") comprueba que el movimiento queda en la caja y en Gastos del negocio. El choque entre dos equipos no se puede reproducir en modo local; lo evita la misma transacción de D5.
### D8 🟠 Conteo físico: lo vendido mientras se cuenta se descuenta dos veces — ✅ Corregido
- **Dónde**: `iniciarConteo` (`ui/inventario/conteo.js`) guarda `sistema` = stock **al empezar**. Al aplicar, suma `contado − sistema` al stock **actual**.
- **Ejemplo**:
  - sistema 10 al empezar;
  - se venden 2 mientras se cuenta (stock real 8);
  - se cuentan 8 → diferencia −2;
  - el stock actual (8) baja a **6**.

  El mensaje de confirmación dice "El stock del sistema quedará igual a lo que contaste", y no es así.
- **Propuesta**: al aplicar, recalcular `sistema` con el stock de ese momento (y avisar si cambió durante el conteo), o fijar el stock al valor contado menos lo vendido desde el inicio del conteo.

- **Solución aplicada** (2026-10-12): `contarItem` y "lo demás está igual" (`ui/inventario/conteo.js`) toman el stock **del momento en que se cuenta cada ítem** (`stockActualDe`), no el del inicio del conteo. La columna Sistema se actualiza al escribir.
- **Probado**: recorrido ("D8"). Se empieza el conteo, se venden 2, se cuenta lo que hay y se aplica: el stock queda igual a lo contado. Con el código anterior quedaba 2 menos.
### F19 🟠 Cerrar la caja no avisa de pedidos y cuentas sin cobrar — ✅ Corregido
- **Dónde**:
  - `cerrarCaja` (`ui/caja/caja.js`) solo revisa las ventas con pago descuadrado;
  - las pantallas Pedidos y Cuentas (`ui/ventas/pedidos.js`, `ui/ventas/cuentas-abiertas.js`) muestran `ventasJornada`: la caja abierta y desde su apertura.
- **Qué pasa**: se puede cerrar con pedidos o mesas sin cobrar. Al abrir la caja siguiente, esos pedidos **ya no se ven** en Pedidos ni en Cuentas y quedan "abiertos" para siempre (solo aparecen en Historial).
- **Impacto**:
  - ventas que nunca se cobran;
  - "Por cobrar" del Dashboard inflado;
  - si se cobran desde otro lado, caen en D6.
- **Propuesta**:
  1. Al cerrar, listar lo pendiente y pedir qué hacer: cobrar, anular o dejarlo para el turno siguiente.
  2. En Pedidos y Cuentas, mostrar también lo pendiente de turnos anteriores.
  3. Con D6 resuelto, cobrarlo lo asigna a la caja nueva.

- **Solución aplicada** (2026-10-12):
  - `ventasJornada` (`ui/ventas/pedidos.js`) incluye siempre lo que sigue **abierto**, de cualquier turno: Pedidos y Cuentas lo muestran hasta cobrarlo o anularlo;
  - `cerrarCaja` avisa cuántos pedidos o cuentas quedan sin cobrar y por cuánto ("no entran en este cierre; siguen en Pedidos");
  - al cobrarlos, D6 los asigna a la caja abierta.
- **Probado**: recorrido ("D6/F19").
### F20 🟠 Anular una venta de una caja ya cerrada — ✅ Corregido
- **Dónde**: `anularPedido` (`ui/ventas/cobro.js`) solo exige el permiso `anular`. `editarPedido`, en cambio, bloquea las ventas de una caja cerrada ("anúlalo y haz uno nuevo").
- **Qué pasa**: anular una venta de días pasados:
  - devuelve el stock;
  - cambia las ventas de esa jornada y de ese mes;
  - pero el cierre de esa caja ya quedó guardado con otras cifras.
- **Impacto**: los reportes y el cierre de ese día dejan de coincidir, sin dejar rastro en la caja actual de que se devolvió dinero.
- **Propuesta**: para ventas de una caja cerrada, exigir rol dueño o admin y registrar la devolución como **salida en la caja abierta** (con motivo), o bloquearlo como editar.

- **Solución aplicada** (2026-10-12): para anular una venta pagada de una caja ya cerrada, `anularPedido` (`ui/ventas/cobro.js`):
  - exige administrador o dueño (`puedeRetirarJefe`) y la caja abierta;
  - avisa en la confirmación;
  - registra en la caja abierta un **retiro** "Devolución por anulación F-…" por el efectivo que pagó el cliente, así el cierre de hoy cuadra con el dinero devuelto;
  - lo anota en la auditoría.
- **Probado**: recorrido ("F20"): venta de una caja cerrada → anulada → retiro por su efectivo en la caja nueva.
### F21 🟠 Cada pantalla suma las ventas distinto — ✅ Corregido
- **Dónde**:
  - **suman `subtotal`** (solo productos): Reportes (`ui/reportes/reportes.js`), Dashboard y Contable (`ui/gastos/contable.js`);
  - **suman `total`** (más propina, recargo del datáfono y domicilio): Historial (`ui/reportes/historial.js`, total pagado) y el **resumen del panel del super-admin** (`resumenVentas`, `src/dominio/ventas.js`).
- **Impacto**: el mismo día muestra cifras distintas según la pantalla, y el panel del super-admin (facturación por negocio) incluye dinero que no es del negocio (propinas, recargos, domicilios).
- **Propuesta**:
  - una función en el dominio, `ventaDelNegocio(v)` = `subtotal`, usada en todas las pantallas;
  - mostrar los terceros (propina, recargo, domicilio) aparte;
  - en el panel, decidir si se quiere ver el cobrado total o la venta del negocio, y decirlo en el título.

- **Solución aplicada** (2026-10-12): `ventaDelNegocio(v)` en `src/dominio/ventas.js` (subtotal; total en ventas viejas sin subtotal) es la única definición, y la usan:
  - Reportes, Dashboard y Contable;
  - Historial: "Ventas del negocio", y aparte lo "cobrado con propinas, recargos y domicilios" cuando es distinto;
  - el resumen del panel (`resumenVentas`).

  Los resúmenes ya publicados se recalculan solos cuando alguien del negocio entra (R1).
- **Probado**: `tests/dominio/ventas.test.mjs` → "F21".
### F22 🟡 Anular la venta de una cita no actualiza la cita ni al cliente — ✅ Corregido
- **Dónde**: `anularPedido` no mira `origenCita`, y `guardarClienteAuto` (al cobrar) suma `pedidos` y `totalComprado` del cliente.
- **Qué pasa**:
  - la cita queda "atendida" con `ventaId` de una venta anulada;
  - el cliente conserva el pedido y el monto en sus estadísticas.
- **Propuesta**: al anular, devolver la cita a "pendiente" (o marcarla), y restar del cliente lo que sumó esa venta.

- **Solución aplicada** (2026-10-12): al anular una venta pagada:
  - `revertirClienteAuto` (`ui/clientes/clientes.js`) resta del cliente el pedido y su monto;
  - si la venta vino de una cita, `reabrirCitaDeVenta` (`ui/citas/citas.js`) la devuelve a **pendiente**, sin `ventaId`. Si la anulación devolvió los apartados al inventario, quedan sin apartar: al cobrarla otra vez se descuentan normal.
- **Probado**: recorrido ("F22"): cita con apartado → cobrada → anulada: cita pendiente, stock de vuelta, el cliente con un pedido menos.
### F23 🟡 Las líneas y brillos no siguen el color del negocio — ✅ Corregido
- **Dónde**: `--linea`, `--glow` y `--glow-txt` se definen en `:root` con `--acento-rgb` (`ui/estilos/00-tokens.css`), pero `tema.js` cambia `--acento-rgb` en `<body>`.
- **Qué pasa**: esos tres se calculan una vez con el verde por defecto. Las líneas y brillos quedan verdes en un negocio con otro color.
- **Propuesta**: declararlos también en `body` (una línea en `00-tokens.css`). Cambia el aspecto de los negocios con color propio: verificar con capturas. Detalle en [tema.md](../-03-architecture/tema.md).

- **Solución aplicada** (2026-10-12): `--linea`, `--glow` y `--glow-txt` se recalculan también en `body` (`ui/estilos/00-tokens.css`), donde `tema.js` pone el color del negocio.
- **Probado**: capturas (los demos usan el verde por defecto, así que no cambian); el cambio solo se ve en negocios con color propio.
### C3 🟡 Errores tragados en flujos importantes — ✅ Corregido
- **Dónde**:
  - `try{ imprimirComanda(venta); }catch(e){}` al confirmar un pedido (`ui/ventas/nueva-venta.js`) y al abrir o agregar a una cuenta (`ui/ventas/cuentas-abiertas.js`, dos veces);
  - el `catch` del cobro (`abrirCobro`) hace `console.error` + "Error al cobrar" sin `reportarError`;
  - `logAudit` traga sus propios errores.
- **Impacto**:
  - si la impresión de la comanda falla, **la cocina no recibe el pedido** y nadie se entera;
  - un error al cobrar no queda en la auditoría ("Error del sistema"), así que no se puede investigar.
- **Propuesta**: `reportarError('la comanda', e)` y `reportarError('el cobro', e)` (regla C2 de `CLAUDE.md`). Para la comanda, además, un aviso visible: "No se imprimió la comanda: reimprimir".

- **Solución aplicada** (2026-10-12):
  - `imprimirComandaSegura` (`ui/cocina/comanda.js`) reemplaza los tres `try{ imprimirComanda(…) }catch(e){}`: si falla, `reportarError` (queda en la auditoría) y avisa "No se imprimió la comanda: reimprímela desde Pedidos";
  - el error de cobro usa `reportarError('el cobro', e)`;
  - `logAudit` escribe en la consola en vez de callar (no puede usar `reportarError`, que lo llama a él).
- **Probado**: recorrido ("C3"): con la impresión fallando, el pedido se guarda y el error queda en la auditoría.
### S8 🔴 Código inyectable por el logo del negocio — ✅ Corregido
- **Encontrado** (2026-10-12) al corregir la foto del producto, que tenía el mismo error.
- **Dónde está**: el campo `logo` del negocio se pega tal cual dentro de `<img src="${neg.logo}">`, sin `escapeHtml` ni validación:

| Archivo | Línea | Dónde se ve | Quién lo abre |
|---|---|---|---|
| `ui/nucleo/navegacion.js` | 197 | Barra lateral de **todas** las pantallas del negocio | Todos los empleados; el super-admin al **supervisar** |
| `ui/super-admin/reporte-mensual.js` | 85 | Informe mensual en PDF | El super-admin desde el panel ("📄 Informe"), **sin entrar al negocio** |
| `ui/configuracion/mi-negocio.js` | 39 | Mi Negocio | Quien edita el negocio |
| `ui/configuracion/config-negocio.js` | 64 | Configurar negocio | El super-admin |
| `ui/caja/caja.js` | 349 | Impresión del cierre de caja | Quien cierra la caja |
| `ui/impresion/facturas.js` | 50, 90, 151 | Facturas y tickets | Quien cobra o reimprime |
| `ui/impresion/reportes.js` | 17, 44 | Reportes impresos | Administración |

- **Qué pasa**: la pantalla Mi Negocio solo pone en `logo` una imagen que ella misma reduce (`elegirLogo`), pero **las reglas aceptan cualquier texto** en `negocios_r/<id>/logo`: es un campo que el negocio puede editar (`editaNegocio`) y no tiene `.validate`. Quien tiene una sesión válida puede escribirlo **sin pasar por la pantalla** (desde la consola del navegador con el SDK de Firebase, o con la API REST y su token). Un valor con comillas cierra el atributo `src` y agrega atributos propios, por ejemplo un `onerror` que se ejecuta porque la imagen no carga.
- **Impacto**: XSS almacenado, con **escalada de privilegios**. Ver el detalle de los ataques en [seguridad-interfaz](../-03-architecture/seguridad-interfaz.md), sección 7.
  - **Quién puede atacar**: cualquier cuenta con `editaNegocio` (el administrador o el dueño de un negocio cliente) y el **super-admin vendedor** en sus propios negocios y demos.
  - **A quién**: al dueño o al ayudante del sistema cuando supervisa ese negocio o saca su informe mensual. El código corre con **su** sesión: lee todos los negocios, crea cuentas, cambia `perfiles/<uid>/rolSuper` (un vendedor se haría dueño y anularía la restricción de la sección 12 de [01-super-admin-panel](../01-super-admin-panel/01-super-admin-panel.md)), suspende o borra negocios.
  - También a los demás empleados del mismo negocio (menos grave: el atacante ya administra ese negocio).
- **Lo que hoy lo frenaría**: nada en producción. La CSP propuesta ([csp.md](../-03-architecture/csp.md)) **no** tiene `'unsafe-inline'` en `script-src` y bloquearía el `onerror`; pero está solo en `Report-Only` en el sandbox y no está activa en Render. Aun con la CSP, la inyección de atributos `style` (sí permitidos) deja disfrazar la pantalla (sección 7.3 de seguridad-interfaz).
- **Error menor del mismo lugar**: `navegacion.js:197` pone sin escapar la **primera letra** del nombre del negocio cuando no hay logo. Un solo carácter no alcanza para inyectar etiquetas, pero un `<` o `&` se ve mal. Escaparla igual.
- **Propuesta** (como la foto del producto):
  1. Regla pura `Dominio.negocio.logoValido(s)`: solo `data:image/(png|jpeg|webp);base64,…` y un tope de tamaño (el logo se reduce a 300 px: unos 30–150 KB). Un logo inválido se trata como "sin logo".
  2. Una función `logoNegocio(neg, clases)` en `ui/nucleo/componentes.js` que dibuje la etiqueta solo si es válido, usada en los 10 lugares. Una prueba estructural que falle si vuelve `${neg.logo}` en una plantilla.
  3. **En las reglas**, `.validate` en `negocios_r/$negId/logo` con la misma forma (`newData.val().matches(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+\/=]+$/)` y largo máximo), para que ni la consola ni la API puedan guardar otra cosa. Antes de publicarla, revisar con `scripts/preparar-pruebas.mjs` que los logos de producción cumplan (solo forma y tamaños, sin mostrar valores).
  4. Activar la CSP (ya planeado) como segunda barrera.
- **Solución aplicada** (2026-10-12). Se corrigió la **clase de error** completa, no solo el logo:
  1. **El logo** solo se dibuja con `logoNegocio(neg, atributos)` (`ui/nucleo/componentes.js`), que exige `Dominio.negocio.logoValido`: `data:image/(png|jpeg|webp);base64,…` de hasta 400.000 caracteres (los de producción miden hasta ~135 KB y los 3 cumplen). Un logo inválido = "sin logo". Los 10 lugares lo usan. Mi Negocio y Configurar solo guardan un logo válido; si el PNG pesa mucho, se pasa a JPEG.
  2. **Todos los datos dentro de atributos HTML** pasan por `escapeHtml`: **151** interpolaciones envueltas automáticamente (con acorn), entre ellas los ids de los `data-click`, `pctDatafono`, `baseFija`, `diasAvisoVence`, `precioMes` y `diaPago` de los formularios del negocio, `valorDom` de las cuentas abiertas y `contado` del conteo. Todos eran el mismo hueco: datos que escribe gente con sesión y que podían cerrar el atributo.
  3. La inicial del nombre (`navegacion.js:197`) y las vistas previas de la foto, escapadas.
  4. **Reglas** (cerradas y de transición):
     - `logo` solo como imagen `data:` válida (o vacío);
     - `id` de cada registro con letras, números, `_` y `-` (máx. 64);
     - id del negocio sin símbolos.

     Con eso ni la consola ni la API REST pueden guardar otra cosa, tampoco el super-admin.
  5. **Migración**: lo viejo que no cumpla no frena la migración. Un logo inválido se quita; un registro con id inválido no se copia, con aviso en consola (`Dominio.negocio.negocioParaGuardar`, `idSeguro`). En los datos de producción: 0 casos (955 ids revisados).
- **Probado**:
  - `tests/ui/estructura.test.mjs` falla si cualquier `${…}` dentro de un atributo no está escapado (revisa 285), si hay `src="'+x` sin `escapeHtml` o si una plantilla usa `neg.logo` directo.
  - `tests/dominio/negocio.test.mjs`: comillas, SVG, URL externa y tamaño.
  - `tests/reglas/reglas.test.mjs`: logo y ids maliciosos rechazados para el admin, el vendedor y el super-admin, también con las reglas de transición.
  - Recorrido: el **ataque de verdad** (logo, `pctDatafono`, `diasAvisoVence` e id de producto maliciosos), revisando la barra lateral, Inicio, Venta, Inventario, Mi Negocio, Configurar, una factura y el informe mensual: ningún atributo inyectado y nada ejecutado. Con la línea vieja de la barra lateral la prueba **falla** (aparece el `onerror` en 5 pantallas).
  - Integración: la migración limpia un logo inválido y sigue.
  - Capturas: 121 idénticas.
- **Residual**: los textos **fuera** de atributos ya se escapaban (revisión de S6). La CSP sigue pendiente como segunda barrera ([csp.md](../-03-architecture/csp.md)).

### S7 🟡 Acciones sin validación de permiso propia — ✅ Corregido
- **Dónde** (todas escriben datos sin `exigirPermiso` al inicio):
  - `guardarEdicionPedido` (`ui/ventas/nueva-venta.js`): confía en que `editarPedido` ya lo validó;
  - `agregarConceptoGasto` y `quitarConcepto` (`ui/gastos/gastos.js`);
  - `renombrarCuenta`, `abrirCuentaNueva` y `agregarACuenta` (`ui/ventas/cuentas-abiertas.js`).

  Las demás que marcó el análisis sí validan, con su propia función (`puedeRetirarJefe`, `puedeGestionarUsuarios`).
- **Impacto**: bajo, porque las pantallas ya filtran. Pero la regla del proyecto es que toda acción sensible valide al inicio ("esconder el botón no basta").
- **Propuesta**: `exigirPermiso('editar')` en guardar edición; decidir quién administra los conceptos de gasto (¿solo admin y dueño?); para las cuentas, el permiso de vender.

- **Solución aplicada** (2026-10-12):
  - `guardarEdicionPedido` exige `editar`;
  - `agregarConceptoGasto` exige acceso a Gastos, y `quitarConcepto` además el permiso `eliminar`;
  - `abrirCuentaNueva`, `agregarACuenta` y `renombrarCuenta` exigen acceso a Ventas o Cuentas (`puedeUsarCuentas`).
- **Probado**: `npm test` y el recorrido completo (los roles con acceso siguen pudiendo).
### Flujos a medias y mejoras (no son fallas)

| Qué | Estado | Dónde está |
|---|---|---|
| ~~Pantalla del **periodo de prueba**~~ | **Hecho (2026-10-12)**: crear a prueba (con o sin ejemplos; el vendedor, a su nombre), pastilla de días, aviso dentro del negocio, tarjeta "por vencer" con más días / pasar a pago, borrar ejemplos | [01-super-admin-panel](../01-super-admin-panel/01-super-admin-panel.md), sección 11 |
| ~~Aviso de **demos vencidas**~~ | **Hecho (2026-10-12)**: salen en "Pruebas y demos por vencer" con 🗑️ y "+ Días" | Ídem |
| ~~**Avisos del repositorio original** (`5425800`)~~ | **Portado (2026-10-12)** a los módulos con F1/F15/C2 y pruebas; falta solo `git merge` + `git rm app.js` después del próximo commit | [union-con-original](../-00-execution-protocol/union-con-original.md), 3.2 y 4 |
| ~~Bandera **`agotado`** del producto~~ | **Hecho (2026-10-12)**: botón "Agotado" / "✓ Disponible" en cada tarjeta del inventario (`alternarAgotado`, permiso `editarprod`, con auditoría) | `ui/inventario/catalogo.js` |
| ~~**Foto del producto** (`imagen`)~~ | **Hecho (2026-10-12)**: "📷 Foto" en el formulario del producto; se reduce a 200 px JPEG y se guarda en la base. Solo se dibuja si es una imagen `data:` válida (`Dominio.inventario.imagenValida`): antes se metía sin escapar en 4 pantallas | [realtime-vs-storage](../-03-architecture/realtime-vs-storage.md) |
| ~~**Catálogo de textos**~~ | **Hecho (2026-10-12)**: `ui/nucleo/textos.js` con 199 mensajes fijos (`MSJ`) y 17 botones (`BOTON`); prueba que lo exige. Los mensajes con datos y las plantillas siguen en su módulo | [tema.md](../-03-architecture/tema.md), sección 6 |
| **Importar inventario** desde Excel o CSV | Diseñado (2026-10-13), sin implementar. Hoy los productos se crean uno por uno | [importar-inventario](../-03-architecture/importar-inventario.md) |
| **Modo claro por componente** y 26 tamaños de letra | Para el rediseño (cambia el aspecto: espera a que se pida el rediseño) | [tema.md](../-03-architecture/tema.md), sección 4 |
| ~~**Lo que ve el super-admin vendedor**~~ | **Hecho (2026-10-12)**: las reglas cerradas lo limitan a sus negocios y sus demos; el panel le trae solo esos (consulta por su id); pruebas de reglas y del navegador | [01-super-admin-panel](../01-super-admin-panel/01-super-admin-panel.md), sección 12 |
| ~~**Herramienta de capturas** que se detuvo 2 de unas 8 veces~~ | **Cerrado (2026-10-12)**: desde que informa dónde se detiene, no volvió a pasar en las 7 corridas del 2026-10-12. Si vuelve, el mensaje dice en qué captura | [-03-architecture](../-03-architecture/-03-architecture.md), 11.7 |

### Orden sugerido

1. **D6 y F19** juntos: dinero sin cuadrar y pedidos que se pierden entre turnos.
2. **D7** (es como D5) y **C3** (comanda).
3. **F21** (una sola definición de "venta").
4. **F20, D8, F22, S7, F23.**

Cada uno con su prueba en el recorrido o en el dominio antes de cerrarlo.

## Tercera revisión (2026-10-12)

Lectura de los flujos de punta a punta (cobro, cuentas abiertas, nueva venta, inventario, citas, domicilios, usuarios, sesión, respaldo) buscando lo que la segunda revisión no cubrió: **varios equipos a la vez**, **lo que la base rechaza**, **valores fuera de rango** y **flujos nuevos** (agotado, prueba, vendedor). Hallazgos sacados leyendo el código; **corregidos el mismo día**, cada uno con su prueba. La de integración de D9 muestra que la forma vieja perdía datos contra la base real.

### D9 🔴 Ediciones simultáneas de un pedido o una cuenta se pisan — ✅ Corregido
- **Dónde**: `agregarACuenta` (`ui/ventas/cuentas-abiertas.js`), `abrirCobro` (`ui/ventas/cobro.js`), `confirmarPedido` / `guardarEdicionPedido` (`ui/ventas/nueva-venta.js`), `anularPedido`.
- **Qué pasa**: cada flujo lee el pedido de la copia del equipo, lo cambia y lo guarda con `guardarMisDatos`. El adaptador sube **campo por campo** (`subirRegistros`), y `items`, `total` y `estado` viajan enteros: el último que llega gana. Casos reales (un bar con dos meseros y una caja):
  1. **Dos meseros agregan a la misma mesa** casi a la vez: los `items` del segundo reemplazan los del primero. **Se pierde lo que agregó el primero**: se sirvió y nunca se cobra.
  2. **El cajero cobra mientras un mesero agrega**: la cuenta queda `pagada` con el total viejo en `pagos`, pero con los productos nuevos en `items` (y `total` según quién llegó último). Productos servidos sin cobrar, y una venta con `total` ≠ suma de pagos.
  3. **Dos equipos cobran el mismo pedido**: los dos lo ven `abierta`, los dos descuentan el stock (`descontarStock` mira la marca de **su** copia) y los dos registran el pago. Stock descontado dos veces.
  4. Editar un pedido que otro equipo ya cobró (y aún no llegó al equipo que edita): se suben los `items` nuevos sobre una venta pagada sin ajustar el pago.
- **Propuesta**: los cambios a una venta existente, con **transacción sobre el registro** (`Datos.modificarRegistro` ya existe y lo usa el stock, D2):
  - `agregarACuenta`: dentro de la transacción, sumar los productos a los `items` **del servidor** y recalcular el total;
  - cobro, anulación y edición: verificar dentro de la transacción que el estado del servidor sea el esperado (`abierta` para cobrar, igual `items` al editar). Si no, cancelar con un aviso ("otro equipo cambió este pedido, revísalo").

  El stock se descuenta solo si la transacción del cobro pasó. Prueba: dos clientes del adaptador contra el emulador, como la de avisos entre equipos.
- **Solución aplicada**:
  - Operación nueva del puerto `Datos.transaccionRegistro(tabla, id, fn)`: aplica `fn` sobre la versión **del servidor** y `fn` puede negarse (devuelve `undefined`). Resultado `{committed, valor}`.
  - Sin conexión se aplica sobre la copia del equipo y viaja en la cola, como antes, para que vender sin internet siga funcionando.
  - Reglas puras en `src/dominio/ventas.js`: `agregarACuenta`, `cobrarSiSigueIgual`, `anularSiSigueIgual`, `editarSiSigueIgual` y `mismosItems`, que compara campo por campo porque Firebase devuelve las claves en otro orden.
  - Las usan agregar a una cuenta, cobrar un pedido existente, anular, cancelar una cuenta y guardar una edición.
  - Si otro equipo cambió el pedido, no se pisa: aviso "Otro equipo cambió este pedido…" o "ya lo cobró o anuló otro equipo".
  - El stock se descuenta o devuelve solo si la transacción pasó.
- **Probado**:
  - `tests/dominio/ventas.test.mjs`.
  - `tests/integracion/s1-migracion.test.mjs` → "D9", contra el emulador. Con la forma vieja, el producto que agregó otro equipo **se pierde**; con la transacción queda. Un cobro con productos que cambiaron no se aplica.
  - Recorrido: cobrar un pedido al que otro equipo le agregó algo y anular uno que otro equipo cobró. Ninguno de los dos se aplica.

### D10 🟠 Lo que la base rechaza se pierde en silencio — ✅ Corregido
- **Dónde**: `subirRegistros`, `set` y `setNegocios` en `firebase-datos.js`. Ante un "permiso negado" solo hacen `console.warn` y ponen el punto de conexión en rojo; no se encola (bien, no sirve reintentar), pero **nadie le avisa a la persona**.
- **Qué pasa**: la pantalla ya mostró la venta hecha (se guarda primero en el equipo). Al recargar, la copia del servidor reemplaza la local y la venta **desaparece**.
- **El caso principal**: un negocio con la **prueba vencida**. Solo ve un aviso arriba ("solo lectura") pero puede seguir vendiendo, cobrando y abriendo caja en la pantalla; todo se pierde. También un vendedor que da más de un año de prueba, o cualquier dato que las reglas rechacen (S8). La suspensión del negocio y la desactivación del usuario **sí** se atienden (cierran la sesión).
- **Propuesta**:
  1. Gancho `alEscrituraNegada(ruta)` del adaptador → aviso fuerte en la interfaz ("No se guardó: …") y quitar de la copia local lo rechazado;
  2. Con `Dominio.prueba.soloLectura(negocio)`, la interfaz **bloquea** las acciones que escriben (vender, cobrar, caja, inventario, gastos) con un mensaje claro, en un solo lugar (p. ej. en `exigirPermiso` y en la entrada de `guardarMisDatos`).

  Prueba: con las reglas cerradas y una prueba vencida, una venta muestra el aviso y no queda en la lista.
- **Solución aplicada**:
  1. `negocioSoloLectura()` (`ui/nucleo/permisos.js`): prueba o demo vencida, salvo para el super-admin y la supervisión.
     - `tienePermiso` devuelve `false` para todo menos imprimir y reimprimir la comanda, así que los botones desaparecen.
     - `exigirPermiso` avisa "solo lectura".
     - `exigirEscritura()` abre las acciones que escriben sin permiso propio (confirmar pedido, cuentas, caja, citas, clientes, gastos, inventario…).
  2. Gancho `soloLectura(negId)` del adaptador: si algo se escapa, no se escribe **nada** de ese negocio, ni en la nube ni en el equipo. Lo que la pantalla ya cambió en memoria se deshace con la copia guardada.
  3. Gancho `alEscrituraNegada`: lo que la base rechace se avisa ("La base no aceptó un cambio…"), a lo sumo un aviso cada 4 s. Antes solo iba a la consola.
- **Probado**: recorrido: con la prueba vencida, un pedido no se guarda, una escritura directa tampoco, `cobrar` = no, `imprimir` = sí, y el super-admin supervisando sí puede.

### S9 🟠 Montos negativos aceptados — ✅ Corregido
- **Dónde**:
  - `Dominio.pagos.liquidarCobro` solo revisa que la **suma** alcance; `cambiarFormaPago` y `ajustarPagoVenta` solo que la suma dé el total;
  - propina, recargo (`abrirCobro`) y valor del domicilio (`valorDomicilio`) se leen con `parseFloat` sin mínimo;
  - el precio de un producto (`editarProducto`), igual.
- **Abuso**: un cobro de $50.000 con efectivo **−50.000** y banco **+100.000** suma 50.000 y pasa. La caja espera $50.000 **menos** de efectivo, así que el cajero se lleva ese dinero y **el cierre cuadra**. El banco "recibió" 100.000 que no existen: solo lo detecta "verificar transferencias" si el negocio lo activó. Lo mismo después del cobro, con "Cambiar forma de pago" (permiso `cambiarpago`). Una propina o un domicilio negativos son un **descuento sin el permiso `descuento`**, y un precio negativo baja el total de cualquier venta.
- **Propuesta**: en el dominio, `liquidarCobro` rechaza cualquier parte negativa; reglas puras `montoValido(x)` (número ≥ 0) para propina, recargo, domicilio y precio, usadas por las pantallas. Pruebas de dominio con cada caso.
- **Solución aplicada**:
  - `Dominio.pagos.montoValido` y `pagosValidos`. `liquidarCobro` rechaza cualquier parte negativa (`error:'negativo'`).
  - El cobro rechaza propina y recargo negativos; ajustar el cobro, cambiar la forma de pago y `guardarAjusteCobro` rechazan pagos negativos.
  - El domicilio, el precio y el costo de productos y combos no bajan de 0.
- **Probado**: `tests/dominio/dominio.test.mjs` (el caso efectivo −50.000 / banco +100.000) y el recorrido (el cobro con efectivo negativo no se aplica y avisa).

### F24 🟠 Eliminar definitivamente y cambiar la forma de pago ignoran las cajas cerradas — ✅ Corregido
- **Dónde**: `eliminarDefinitivo` y `cambiarFormaPago` (`ui/ventas/cobro.js`).
- **Qué pasa**: F20 hizo que anular o editar una venta de una caja **ya cerrada** exija admin o dueño y registre la devolución en la caja abierta. Estos dos no:
  - **eliminar** una venta cobrada de una caja cerrada cambia las cifras de ese cierre (Reportes, Contable) sin dejar el dinero en ninguna caja;
  - **cambiar la forma de pago** de esa venta mueve plata entre efectivo y banco de un cierre ya contado.

  Además, eliminar no revierte las cifras del cliente ni reabre la cita (lo que F22 hizo para anular).
- **Propuesta**: la misma regla de F20 para los dos (solo de la caja abierta; si es de una cerrada, admin/dueño y con movimiento en la caja abierta, o no permitirlo), y en eliminar, `revertirClienteAuto` + `reabrirCitaDeVenta`. Mejor aún: que eliminar solo se permita sobre ventas **ya anuladas** (la anulación ya hace todo bien).
- **Solución aplicada**:
  - "Eliminar definitivamente" solo acepta pedidos **ya anulados**: la anulación ya hace bien el stock, la caja (F20), el cliente y la cita (F22), y eliminar ya no devuelve stock por su cuenta.
  - "Cambiar forma de pago" no se permite sobre una venta de una caja cerrada (`esDeCajaCerrada`, la misma regla que editar).
- **Probado**: recorrido: eliminar una venta viva no abre nada; cambiar el pago de una venta de la caja anterior tampoco.

### S10 🟡 Auditoría y movimientos se pueden borrar — ✅ Corregido
- **Qué pasa**: las reglas dejan a cualquier empleado con sesión escribir **cualquier** registro de las tablas de su negocio (los permisos por acción, como `eliminar` o `anular`, solo los aplica la app: es el límite conocido de S4 sin servidor). Desde la consola, alguien que hizo algo indebido puede borrar o cambiar su rastro en `auditoria` y `movimientos`, que es justo lo que debería servir para descubrirlo.
- **Propuesta**: en las reglas, esas dos tablas **solo de agregar**: `$clave` sin `.write` para las claves que terminan en `_auditoria_r` / `_movimientos_r`, y un `$reg` con `.write` solo si `!data.exists()` (y la misma pertenencia al negocio). El recorte de historial (D3) pasaría a hacerlo el dueño del sistema, o se deja crecer. Prueba de reglas: crear sí, cambiar o borrar no.
- **Solución aplicada**: en `database.rules.json`, para la gente del negocio, `$clave` no deja escribir las claves `*_auditoria_r` / `*_movimientos_r`, y `$reg` solo deja **crear** (`!data.exists() && newData.exists()`). El dueño y el ayudante, y el vendedor en su negocio activo, siguen pudiendo borrarlas al eliminar un negocio o una demo. La auditoría ya no se recortaba, así que nada de la app se rompe.
- **Probado**: `tests/reglas/reglas.test.mjs` → "S10": cajero y admin crean, pero no cambian ni borran; las ventas siguen editables; el dueño del sistema sí borra.

### S11 🟡 Confirmar pedido edita sin validar permiso — ✅ Corregido
- **Dónde**: `confirmarPedido` (`ui/ventas/nueva-venta.js`). Con un pedido en edición guarda los cambios, pero no llama `exigirPermiso('editar')` como `guardarEdicionPedido` (S7). Hoy solo se llega ahí después de `editarPedido`, que sí lo valida, pero la acción está exportada y se puede llamar sola.
- **Propuesta**: validar al inicio cuando `STATE.editandoVentaId`.
- **Solución aplicada**: `confirmarPedido` con un pedido en edición exige `editar` y guarda por el mismo camino que "Guardar cambios" (`guardarEdicion`, con la transacción de D9). `guardarAjusteCobro` también valida.
- **Probado**: recorrido: un cajero sin `editar` no cambia el pedido.

### F25 🟡 El escáner agrega productos "Agotado" — ✅ Corregido
- **Dónde**: `agregarAlCarrito` (`ui/ventas/nueva-venta.js`). La lista de Nueva Venta oculta los agotados, pero el escáner y cualquier llamada directa no lo revisan.
- **Propuesta**: en `agregarAlCarrito`, si `p.agotado`, aviso y no agregar.
- **Solución aplicada**: `agregarAlCarrito` rechaza un producto agotado, venga del escáner o de cualquier llamada.
- **Probado**: recorrido.

### F26 🟡 Descuento mayor que el subtotal al editar — ✅ Corregido
- **Dónde**: `armarVenta` (`total=max(0, bruto−_desc)`). El descuento se guarda como valor; al quitar productos en una edición puede quedar mayor que el nuevo subtotal: la venta queda en **$0** con `descuento` > `subtotalBruto`. Un descuento en % se congela en pesos y no cambia si se agregan o quitan productos.
- **Propuesta**: guardar también el tipo (`descTipo: 'pct'|'valor'`) y recalcularlo en `armarVenta`, con tope en el subtotal y aviso.
- **Solución aplicada**:
  - El descuento en % se guarda (`descPct`) y se recalcula con el subtotal de cada momento (`descuentoDe`); también al editar el pedido.
  - Cualquier descuento tiene tope en el subtotal, con un aviso si se ajustó. Un % mayor que 100 se rechaza.
- **Probado**: recorrido (10 % sobre un subtotal que cambia; descuento fijo mayor que el subtotal).

### F27 🟡 La alerta de stock bajo puede tapar "¿Imprimir factura?" — ✅ Corregido
- **Dónde**: `avisarStockBajo` (`ui/inventario/motor.js`) abre su ventana con `setTimeout(…, 700)`. El cobro pregunta "¿Imprimir factura?" con `preguntarDespues`. Es justo lo que la regla F16 prohíbe: según el orden, una ventana reemplaza a la otra.
- **Propuesta**: `preguntarDespues` (o una cola de avisos) también para la alerta.
- **Solución aplicada**: `cuandoNoHayaVentana(abrir, ms)` (`ui/nucleo/componentes.js`) espera a que se cierre la ventana abierta, hasta unos 2 minutos.
  - Antes, `preguntarDespues` **descartaba** la pregunta si había otra ventana; ahora la usa y espera su turno.
  - La alerta de stock también la usa, así que ya no reemplaza a "¿Imprimir factura?".
- **Probado**: recorrido: una pregunta diferida aparece después de cerrar la ventana que estaba abierta.

### F28 🟡 Eliminar un producto deja combos rotos y stock sin rastro — ✅ Corregido
- **Dónde**: `eliminarProducto` (`ui/inventario/catalogo.js`).
- **Qué pasa**: si el producto es parte de un combo, el combo sigue a la venta pero ya no descuenta esa parte (`requerimientos` salta lo que no encuentra). Sus unidades desaparecen sin movimiento (la regla de stock pide dejarlo) y el borrado no queda en auditoría.
- **Propuesta**: avisar y bloquear si está en combos; registrar un movimiento de salida por el stock que tenía y `logAudit`.
- **Solución aplicada**: no se elimina un producto que sea parte de un combo (dice cuáles). Si tenía stock, queda un movimiento de salida "Producto eliminado", y el borrado queda en la auditoría.
- **Probado**: recorrido (componente de un combo).

### C4 🟡 Errores tragados con `console.error` — ✅ Corregido
- **Dónde**:
  - `ui/ventas/cuentas-abiertas.js:90` y `:155`;
  - `ui/ventas/nueva-venta.js:472`, `:526` y `confirmarPedido`;
  - `ui/usuarios/sesion.js:305`;
  - `ui/super-admin/panel.js:238` (respaldo).

  Muestran un aviso genérico pero no pasan por `reportarError`, así que el recorrido no los ve (C2).
- **Propuesta**: `reportarError(donde, e)`, y una prueba estructural que no deje `catch(e){ console.error(e); toast(`.
- **Solución aplicada**: los 10 lugares (los 6 vistos y 4 más: abrir y cerrar caja, crear cuenta, actualizar la cuenta de acceso) usan `reportarError`.
- **Probado**: `tests/ui/estructura.test.mjs` falla si vuelve `console.error(e); toast(`.

### Flujos a medias y mejoras (tercera revisión)

| Qué | Estado | Dónde |
|---|---|---|
| ~~**Pago al domiciliario**~~ | **Hecho (2026-10-12)**: en el Cuadre, "💵 Pagarle $X del cajón" registra un **retiro** de la caja con `pagoDomi` (clave del domiciliario); muestra lo ya pagado y "✓ Pagado", y no deja pagar dos veces (`Dominio.caja.pagadoADomiciliario`) | `ui/clientes/domicilios.js` (`pagarDomiciliario`) |
| ~~**Respaldo** sin la nube / sin restauración~~ | **Hecho (2026-10-12)**: si no se puede leer la base, pregunta y el archivo se llama `respaldo-wallace-PARCIAL-…` (con `parcial:true`). Nuevo **"♻️ Restaurar"** (solo el dueño del sistema): elige un negocio del respaldo, confirma escribiendo su nombre y reemplaza su registro y todas sus tablas (`Datos.restaurarNegocio`); limpia lo que las reglas rechazarían; las cuentas de acceso no se tocan | `descargarRespaldo`, `elegirRespaldo`, `restaurarNegocioDesde` (`ui/super-admin/panel.js`) |
| ~~**Saltos en las facturas**~~ | **Hecho (2026-10-12)**: el cobro directo y la entrega de citas toman el número **al confirmar el cobro**; uno cancelado no gasta número (`armarVenta(estado, {sinFactura:true})`). Quedan saltos solo si un equipo se cierra con un número reservado (D1, por diseño) | `ui/ventas/nueva-venta.js`, `ui/ventas/cobro.js`, `ui/citas/citas.js` |
| ~~**Editar citas**~~ | **Hecho (2026-10-12)**: ✏️ en las citas pendientes (cliente, fecha, hora, detalle, encargado y apartados); el inventario se ajusta **solo por la diferencia**, con movimiento "Cambio de apartado" (`Dominio.inventario.difApartados`) | `editarCita` (`ui/citas/citas.js`) |
| ~~**Inventario apagado después de vender**~~ | **Hecho (2026-10-12)**: lo que SÍ se descontó (`stockAplicado` / `stockDescontado`) se devuelve aunque hoy el inventario esté apagado (`moverInventario(..., forzar)`): anular, cancelar cuenta y devolver apartados | `ui/inventario/motor.js` |

### Orden sugerido (tercera revisión)

1. **D9**: dinero y productos perdidos en bares y restaurantes con varios equipos.
2. **S9 y F24**: dinero que sale de la caja cuadrando el cierre.
3. **D10**: antes de ofrecer periodos de prueba a clientes reales.
4. **S10, S11, F25–F28, C4.**

Cada uno con una prueba que falle con el código de hoy.

## Cuarta revisión (2026-10-12)

Revisión de **validaciones**: todo número o texto que escribe la gente, más lo nuevo del día (facturas sin conexión, recuperación de contraseña, correo real, restaurar). Se corrigió lo encontrado, cada cosa con su prueba.

### V1 🟡 Obligatorios con espacios y una excepción como control — ✅ Corregido
- **Qué pasaba**: `abrirModal` (`ui/nucleo/componentes.js`) daba por lleno un campo con "   ", así que quedaban productos o usuarios con nombre en blanco. Cuando faltaba uno, avisaba y **lanzaba una excepción** para cortar.
- **Solución**: el obligatorio se revisa sin espacios y la ventana se queda abierta, con el foco en el campo, sin excepción. Si `onGuardar` falla, va por `reportarError`.

### V2 🟡 Errores no atrapados sin registro — ✅ Corregido
- **Qué pasaba**: C2 hizo que los errores **atrapados** se avisaran y quedaran en la auditoría, pero una promesa sin `.catch` o un error dentro de un manejador directo solo llegaba a la consola.
- **Solución**: `vigilarErroresGlobales()` (`ui/nucleo/arranque.js`) escucha `error` y `unhandledrejection` y los manda a `reportarError`. Solo los del código de la app (`/src/`); los de Firebase o de extensiones del navegador no. También la sesión guardada que falla al entrar.
- **Probado**: recorrido. Un error de la app y uno de pantalla quedan en la auditoría y uno de Firebase no. Se llama a los manejadores directamente, porque el navegador de pruebas no dispara `unhandledrejection` para promesas creadas desde la prueba.

### V3 🟠 Números fuera de rango — ✅ Corregido
- **Qué pasaba**: se aceptaban números negativos o fuera de rango en varios lugares:
  - un gasto negativo, que **subía** la utilidad del Contable;
  - lo contado y la base de mañana al cerrar la caja, la base al abrir y la base corregida (abrir "debiendo");
  - stock, mínimo y costo de productos e insumos;
  - lo contado en el conteo (también texto, que quedaba como `NaN`);
  - el % del datáfono (negativo o mayor que 100);
  - el precio del plan.
- **Solución**:
  - reglas puras `Dominio.pagos.porcentajeValido` y `Dominio.inventario.cantidadValida`, más `montoValido` (S9);
  - cada formulario avisa y no guarda;
  - el conteo deja sin contar lo que no es un número de 0 en adelante;
  - el precio del plan no baja de 0.

### V4 🟠 Nombres de usuario — ✅ Corregido
- **Qué pasaba**: desde "📧 Mi correo", el login toma cualquier texto con "@" como correo, así que un usuario creado con "@" (p. ej. `ana@tienda.com`) **nunca podría entrar**. Además "Ana" y "ana" podían ser dos usuarios distintos y confundir a cualquiera.
- **Solución**: `Dominio.cuentas.usuarioValido` (de 3 a 40 caracteres, sin "@", sin caracteres de control, sin espacios en los extremos) y `mismoUsuario` (sin distinguir mayúsculas). Se usan al crear o editar empleados, al crear un negocio (su administrador), en Administradores y en la configuración inicial. Los 17 usuarios de producción cumplen (revisado por conteo en el export).

### V5 🟡 Códigos de barras repetidos — ✅ Corregido
- **Qué pasaba**: dos productos podían tener el mismo código; `escanearProducto` toma el primero que encuentra y vendía siempre ese.
- **Solución**: `Dominio.inventario.codigoRepetido`; al guardar un producto con un código que ya es de otro, avisa de cuál y no guarda.

**Probado (V1–V5)**:
- Dominio: `usuarioValido`, `mismoUsuario`, `porcentajeValido`, `cantidadValida` y `codigoRepetido`.
- Recorrido "4.ª revisión", que intenta cada caso:
  - un nombre con espacios, stock negativo, un código repetido y un gasto negativo;
  - un conteo con "-3" y con "abc";
  - un usuario con "@";
  - errores no atrapados.

### V6 🟠 Los avisos bloqueaban los botones de las ventanas — ✅ Corregido
- **Qué pasaba**: `#toasts` está arriba a la derecha y por encima de las ventanas (z-index 200 contra 100). En pantallas angostas, o con varios avisos seguidos, un aviso quedaba sobre "Entrar", "Guardar" o "Sí, continuar" y **el clic caía en el aviso** durante sus 3 segundos.
- **Cómo se encontró**: las pruebas de navegador que hacen clic por coordenadas (ventana de 800×600) fallaban de vez en cuando; con la regla quitada, fallan siempre.
- **Solución**: `#toasts{pointer-events:none}`. Los avisos se ven igual, pero los clics pasan a lo que hay debajo; ningún aviso tiene botones.
- **Probado**: `tests/ui/estructura.test.mjs` exige la regla, y las pruebas de `s1-navegador` con clics por coordenadas pasan. No se pudo comprobar dentro del recorrido: su navegador conservó la hoja de estilos anterior aunque se cambió el archivo, y no se averiguó por qué.

### V7 🟠 Restablecer la propia cuenta dejaba al super-admin sin acceso — ✅ Corregido (2026-10-13)
- **Cómo se encontró**: el usuario pidió "olvidé mi contraseña" para su propio usuario de super-admin y lo resolvió él mismo desde el panel.
- **Qué pasaba**: "Generar temporal" **reemplaza** la cuenta, así que el perfil viejo se borra. Ese perfil era el de la sesión abierta: `escucharMiPerfil` vio "sin perfil", avisó "tu usuario fue desactivado" y cerró la sesión. Los pasos que faltaban (marcar el cambio obligatorio, cerrar la solicitud, **mostrar la temporal**) fallaron sin permiso. Quedó una cuenta nueva con una contraseña que nadie vio, y la vieja sin acceso.
- **Solución** (`ui/usuarios/recuperacion.js`):
  1. `esMiCuenta`: no se puede generar una temporal para la cuenta propia; la tarjeta muestra *"Es tu cuenta: usa 🔑 Mi contraseña o 📧 Mi correo"* en lugar del botón.
  2. La temporal se muestra **apenas existe la cuenta nueva**, antes de los pasos que pueden fallar. Si alguno falla, la temporal ya está en pantalla y un aviso lo explica.
- **Probado**: `tests/navegador/s1-navegador.test.mjs`. Con una solicitud de su propia cuenta, el dueño no ve el botón, y llamar la acción no pide confirmar, no cambia su cuenta y no lo saca de la sesión.
- **Si ya pasó**: otro super-admin dueño o ayudante resuelve la solicitud, que sigue pendiente. Si no hay otro, se usa el procedimiento de consola ([conexion-firebase](../-00-execution-protocol/conexion-firebase.md), sección 5).

### Residuales anotados (no se corrigen)

| De | Residual | Qué hacer |
|---|---|---|
| Correo real | Si "📧 Mi correo" crea la cuenta nueva y falla el paso siguiente (sin conexión justo en ese momento), ese correo queda ocupado por una cuenta sin perfil y el siguiente intento dice "ese correo ya tiene una cuenta" | El dueño del proyecto la borra en la consola de Firebase → Authentication y se repite |
| Recuperación | Alguien podría pedir "olvidé mi contraseña" para muchos usuarios (uno por hora cada uno) y llenar la tarjeta del panel | Descartar en bloque si pasa; las reglas ya impiden usuarios inventados y repeticiones |
| Correo real | Si otro super-admin le restablece la contraseña, la cuenta vuelve a usuario y contraseña (por diseño) | Volver a usar "📧 Mi correo" |

## Pendientes

### Por probar en el proyecto de simulación (antes de la empresa)

Las pruebas automáticas cubren el modo local, los emuladores y Chrome de escritorio. Falta lo que necesita Firebase real, Render u otros dispositivos. Cada paso, con cómo saber que salió bien: [conexion-firebase](../-00-execution-protocol/conexion-firebase.md), sección 2.

| De | Qué falta probar | Estado |
|---|---|---|
| Fase 8 | La interfaz en módulos ES contra Firebase real (`http://localhost:3000/` sin `?local`) | Pendiente |
| S1, S4, S5 | Un usuario de cada rol con las reglas cerradas: cada uno ve y hace solo lo suyo | Pendiente (aún no hay negocios ni usuarios en el sandbox) |
| D1, D2, D5 | Dos equipos a la vez (stock, números de factura, apertura de caja) y venta sin internet | Pendiente (solo probado con Firebase simulado) |
| S1 | Restringir la clave web del sandbox a `localhost` y al sitio de Render | Pendiente (recomendado) |
| Fase 8, S6 | Sitio de pruebas en Render: carga de módulos, `Cache-Control: no-cache` en `/src/*`, CSP en `Report-Only` | Pendiente |
| S1 | Migración de cuentas viejas con el export real, en el emulador | Pendiente |
| — | Celulares y otros navegadores (Safari, Firefox), impresoras térmicas reales, lector de código de barras | Pendiente |
| Recuperación | "Olvidé mi contraseña" (asistida y por correo) con Firebase real: las reglas publicadas, los correos de verificación y restablecimiento de Firebase (plantillas, que no lleguen a no deseado) | Pendiente |
| Acceso | "Entrar con Google" para super-admins: activar el proveedor en la consola y programarlo ([entrar-con-google](../-03-architecture/entrar-con-google.md)) | Pendiente (decidido) |
| Operación | Recuperar el acceso del único super-admin sin correo de recuperación ([conexion-firebase](../-00-execution-protocol/conexion-firebase.md), sección 5) | ✅ Hecho en el sandbox (2026-10-10) |

### Para llevar S1 a la producción de la empresa

| ID | Qué falta | Quién | Cómo |
|---|---|---|---|
| S1 | ~~Crear el proyecto de pruebas~~ → hecho: `wallacesys-dev-sandbox` (cuenta personal del desarrollador; simula producción). Base desde cero, reglas de transición → dueño creado → **reglas cerradas** publicadas y verificadas (2026-10-08) | — | [-00 → 3.1](../-00-execution-protocol/-00-execution-protocol.md#31-qué-significa-cerrar-la-base) |
| S1 | Ensayar la **migración de cuentas viejas** con datos reales (en el emulador: `npm run emulador`; o en un proyecto de la empresa con su permiso) | Desarrollo | [-02 → S1 → Despliegue paso a paso](../-02-corrections/-02-corrections.md#s1--base-de-datos-sin-autenticación-ni-reglas--implementado-falta-desplegar) |
| S1 | Dar el dominio público de producción (`HOSTS_PRODUCCION` en `firebase-config.js`); sin él, producción arrancaría en modo local | Responsable del proyecto | Antes de unir el código al repositorio original |
| S1 | Decidir el plazo de migración de cuentas y si el respaldo incluye `perfiles/` y `login/` (lo del vendedor ya se decidió: solo sus negocios) | Responsable del proyecto | — |
| S1 | Desplegar en producción por fases, con respaldo antes de cada una | Desarrollo + responsable | [-02 → B.8](../-02-corrections/-02-corrections.md#b8-fases-de-despliegue-con-lista-de-chequeo) |

### Riesgos residuales (de hallazgos ya corregidos)

| De | Residual | Qué hacer |
|---|---|---|
| S3 | La contraseña inicial vieja sigue en el historial de Git | Confirmar en producción que nadie la usa (al migrar a S1 todas las cuentas pasan a Firebase Authentication) |
| S2 | Hasta cerrar las reglas de S1 los hashes de contraseñas viajan a los equipos | Se resuelve con la fase 4 de S1 (reglas cerradas) y la limpieza de la fase 5 |
| ~~D1~~ | ~~Un equipo sin conexión desde el inicio puede repetir un número de factura~~ | **Resuelto (2026-10-12)**: bloques de 20 números por equipo; sin bloque, número provisional por fecha y hora + código del equipo, que recibe el definitivo al reconectar; aviso de repetidos. [facturas-sin-conexion](../-03-architecture/facturas-sin-conexion.md) |
| D3 | Auditoría, movimientos y conteos crecen sin límite (a propósito, no se pierde historia) | Archivar por mes si el tamaño lo exige |
| F15 | Las ventas anteriores a la corrección no tienen `prodId`/`vendedorId`/`domiciliarioId` y se siguen agrupando por nombre | Ninguna; las nuevas ya llevan id |
| R1 | Los negocios donde nadie ha entrado con la versión nueva no tienen resumen | Botón "📊 Calcular cifras" del panel |
| S6 | Si en otro lugar faltara `escapeHtml`, HTML inyectado con `onerror`/`onload` todavía se ejecutaría (no hay CSP) | Activar la CSP ([csp.md](../-03-architecture/csp.md): probada en local con 0 violaciones; falta `Report-Only` en el sandbox con Firebase real y luego activarla) |
| S1 | ~~No hay "olvidé mi contraseña"~~ **Resuelto (2026-10-12)**: recuperación asistida para todos, y para el dueño y el ayudante (incluido el **único** super-admin) correo real con el enlace de Firebase ([recuperar-contrasena](../-03-architecture/recuperar-contrasena.md), secciones 8 y 9) | Recomendado: que el dueño use "📧 Mi correo". Pendiente: "Entrar con Google" con verificación en dos pasos ([entrar-con-google](../-03-architecture/entrar-con-google.md)). Seguir con dos super-admins |
| DOC1 | El historial de commits tiene mensajes genéricos | No se corrige sin reescribir el historial; los commits nuevos son descriptivos |
| — | ~~Una prueba de navegador ("empleado con contraseña corta") falló una vez de forma intermitente~~ | Causa probable encontrada el 2026-10-12: un aviso tapaba el botón y el clic por coordenadas caía en él (V6, corregido) |
