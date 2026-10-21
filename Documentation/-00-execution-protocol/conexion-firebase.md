# Conexión con Firebase: dónde vamos y siguientes pasos

Guía para continuar desde el proyecto de simulación `wallacesys-dev-sandbox` hasta el proyecto real de la empresa. Cada paso dice qué hacer, con qué comando y cómo saber que salió bien. Cómo funcionan los entornos: [entornos-locales](entornos-locales.md). El plan completo de S1: [-02-corrections → S1](../-02-corrections/-02-corrections.md#s1--base-de-datos-sin-autenticación-ni-reglas--implementado-falta-desplegar).

> En la terminal PowerShell usar `npm.cmd` y `npx.cmd` (o arreglar la política de scripts: [-00, 1.1](-00-execution-protocol.md#11-windows-la-ejecución-de-scripts-está-deshabilitada)).

## 1. Lo que ya está hecho (2026-10-08)

| Pieza | Estado |
|---|---|
| Proyecto `wallacesys-dev-sandbox` (cuenta personal del desarrollador, simula producción) | ✅ Creado, base desde cero |
| Realtime Database (us-central1) y Authentication con correo y contraseña | ✅ Activos |
| `.firebaserc` con el alias `pruebas` → `wallacesys-dev-sandbox` | ✅ |
| Configuración web en el bloque `PRUEBAS` de `firebase-config.js` | ✅ (cualquier dominio que no sea de producción la usa: `localhost`, el sitio del fork en Render) |
| Reglas de transición → dueño creado (`Admn-Wallacesys`) → **reglas cerradas** publicadas | ✅ Verificado: sin sesión todo responde "Permission denied" |
| Proyecto real de la empresa (`wallace-system`) | ❌ **Nada desplegado**: sigue con la versión original y la base abierta |

## 2. Siguientes pasos en el sandbox

### Paso 1 — Abrir la app contra el sandbox
```
npx.cmd serve -s . -l 3000
```
- App: `http://localhost:3000/` (sin `?local` ni `?emulador`). El login debe mostrar el aviso de entorno de **pruebas**.
- Diagnóstico: `http://localhost:3000/prueba.html` debe mostrar "Entorno: pruebas", la base conectada y las **reglas cerradas**. No escribe nada.
- Entrar con `Admn-Wallacesys` y su contraseña (la que se creó en la configuración inicial; no está escrita en ningún archivo).

✔ Listo cuando: entras al panel del super-admin sin errores.
Es la **primera vez que la interfaz en módulos ES (fase 8) habla con Firebase real**. Si algo falla, abrir la consola (F12) y anotar el mensaje.

### Paso 2 — Crear datos y probar cada rol
1. En el panel: crear un negocio (o un demo de una plantilla) con caja, inventario y ventas.
2. En Usuarios del negocio: crear uno de cada rol (admin, cajero, mesero, cocina). Con S1, cada usuario nuevo recibe su cuenta de Firebase Authentication.
3. Con cada rol, en una ventana privada:

Permisos por defecto de cada rol (`src/dominio/permisos.js`; se pueden ajustar por usuario):

| Rol | Debe poder | No debe poder |
|---|---|---|
| Admin | Todas las pantallas de su negocio, incluidos usuarios y configuración; cobrar, anular, descuentos, editar stock | Ver otros negocios |
| Dueño | Inicio, caja, pedidos, reportes, contable, gastos, catálogo, conteo, combos, usuarios, configuración; anular y ajustar stock | Vender (no tiene Nueva Venta), ver otros negocios |
| Cajero | Vender, pedidos, caja (abrir y cerrar), clientes, domicilios; cobrar, cambiar forma de pago, imprimir | Anular, descuentos, tocar el stock, usuarios, reportes, contable |
| Mesero | Vender (tomar pedidos), pedidos, clientes; comandas | Cobrar, caja |
| Vendedor | Vender, pedidos, catálogo, clientes; cobrar, imprimir, descuentos | Caja, anular |
| Cocina | Cocina y pedidos; comandas | Inicio (dinero), ventas, caja |

4. Recorrido mínimo: venta con pago dividido → imprimir → anular → abrir y cerrar caja → ajuste de stock → subir logo en Mi Negocio.
5. Protocolo completo: [-00, sección 7](-00-execution-protocol.md) y las pruebas 1–15 de B.9 en [-02](../-02-corrections/-02-corrections.md).

✔ Listo cuando: cada rol ve solo lo suyo y la consola no muestra errores.

### Paso 3 — Dos equipos a la vez y sin internet
- Dos navegadores (o PC y celular) en el mismo negocio:
  - vender el mismo producto a la vez: el stock baja por las dos ventas (D2);
  - cobrar en los dos: los números de factura no se repiten (D1);
  - abrir caja en los dos: solo uno la abre (D5).
- Sin internet: desconectar la red, vender, reconectar. La venta debe subir sola.

✔ Listo cuando: los datos cuadran en los dos equipos.

### Paso 4 — Restringir la clave web (recomendado)
La `apiKey` de `firebase-config.js` no es secreta: viaja en la página y la protección real son las reglas y Authentication. Aun así, conviene limitar desde qué sitios se puede usar:
1. [Google Cloud Console](https://console.cloud.google.com/) → proyecto `wallacesys-dev-sandbox` → *APIs y servicios* → *Credenciales* → la clave "Browser key (auto created by Firebase)".
2. *Restricciones de aplicaciones* → *Sitios web*: `http://localhost:3000/*` y el dominio del sitio de pruebas en Render (paso 5), p. ej. `https://<sitio>.onrender.com/*`.
3. Guardar, esperar unos minutos y repetir el paso 1.

✔ Listo cuando: la app sigue entrando desde esos sitios. Desde otro dominio, Firebase rechaza la clave.

### Paso 5 — Publicar el sitio de pruebas

Para probar desde cualquier equipo o celular (no solo `localhost`). Hay dos opciones, y las dos usan el sandbox solas, porque su dominio no está en `HOSTS_PRODUCCION`:

| | Firebase Hosting del sandbox (A) | Render del fork (B) |
|---|---|---|
| Dirección | `https://wallacesys-dev-sandbox.web.app` | `https://<nombre>.onrender.com` |
| Rapidez | Un comando, en un minuto | Crear el servicio en Render |
| Parecido a producción | Otro servidor (encabezados en `firebase.hosting.json`) | **El mismo** que la empresa (`render.yaml`) |
| Qué sube | La carpeta `.publicar/` (lista blanca) | Lo que hay en la rama de GitHub |

Recomendación: **A para probar ya**; **B antes de llevar a la empresa**, para validar `render.yaml` (caché, CSP).

#### Opción A — Firebase Hosting del sandbox

**Por qué hay un script**: Firebase Hosting sube lo que hay **en el disco**, no lo que hay en Git. Si se publicara la carpeta del proyecto, `importar-pruebas.json` (contraseñas de producción) y `perfil.json` quedarían en internet. `scripts/publicar-sandbox.mjs`:
- copia a `.publicar/` **solo** `index.html`, `src/`, `firebase-config.js` y `prueba.html/js`;
- revisa que no haya nada más que `.html`, `.js` y `.css`;
- se detiene si algo no cuadra.

`firebase.hosting.json` publica solo esa carpeta.

1. Sesión de la CLI (una vez): `npx.cmd firebase login`, con la cuenta de Google dueña del sandbox.
2. Publicar:
   ```
   npm.cmd run publicar:sandbox
   ```
   Prepara y revisa `.publicar/` (dice cuántos archivos) y luego hace `firebase deploy --only hosting -P pruebas --config firebase.hosting.json`. La primera vez puede pedir activar Hosting en el proyecto: aceptar, o hacerlo en la consola → *Hosting* → *Comenzar*.
3. Abrir `https://wallacesys-dev-sandbox.web.app`. El login debe avisar "Entorno de PRUEBAS", y `/prueba.html` debe decir "pruebas" y "reglas cerradas".
4. Si en el paso 4 se restringió la clave web, agregar `https://wallacesys-dev-sandbox.web.app/*` y `https://wallacesys-dev-sandbox.firebaseapp.com/*` a sus sitios permitidos. Los dominios de Hosting ya vienen autorizados en Authentication.
5. Probar con los pasos 2 y 3 desde la PC y un celular.

- **Actualizar** después de un cambio: repetir `npm.cmd run publicar:sandbox`.
- **Quitar el sitio**: `npx.cmd firebase hosting:disable -P pruebas`.
- **Solo preparar sin publicar** (para revisar `.publicar/`): `node scripts/publicar-sandbox.mjs`.

Comprobado el 2026-10-10:
- la app arranca desde `.publicar/` (88 archivos);
- pedir `/importar-pruebas.json`, `/perfil.json`, `/package.json` o `/tests/…` devuelve la página principal, porque esos archivos no están en el sitio.

#### Opción B — Render (fork): igual a como publica la empresa
1. En Render: *New* → *Blueprint* (o *Static Site*) desde `github.com/Danielvt914/wallace-system`, rama `s1-y-correcciones`. `render.yaml` ya define el sitio estático.
2. El dominio `*.onrender.com` no está en `HOSTS_PRODUCCION`, así que **usa el sandbox solo**.
3. Comprobar:
   - `curl -I https://<sitio>.onrender.com/src/arranque.js` debe mostrar `cache-control: no-cache`;
   - la app carga e inicia sesión como en el paso 1.
4. Si el inicio de sesión falla con `auth/unauthorized-domain`: Firebase → *Authentication* → *Configuración* → *Dominios autorizados* → agregar el dominio de Render.

✔ Listo cuando: el sitio público funciona igual que en `localhost`.

### Paso 6 — CSP en modo "solo informar"
El navegador avisa en la consola lo que bloquearía, sin bloquear nada.
- **Firebase Hosting (opción A)**: ya viene puesto en `firebase.hosting.json`. Publicar, abrir la consola (F12) y repetir el paso 2. Guía: [csp.md, sección 7](../-03-architecture/csp.md).
- **Render (opción B)**: agregar el encabezado a `render.yaml` ([csp.md, sección 4](../-03-architecture/csp.md)).

Cuando no aparezca ningún aviso, se cambia a `Content-Security-Policy` (activa) y se vuelve a publicar.

✔ Listo cuando: no aparece ningún `[Report Only] Refused to …`.

### Paso 7 — Ensayar la migración de cuentas con datos reales (sin tocar el sandbox)
El sandbox se dejó desde cero a propósito. La migración de las cuentas viejas (con contraseñas en texto plano) se ensaya en el **emulador**, con una copia del export de producción:
```
node scripts/preparar-pruebas.mjs <ruta-al-export>.json
npm.cmd run emulador
```
- Abrir `http://localhost:3000/?emulador`.
- Entrar con usuarios reales: cada uno migra a Firebase Authentication en su primer ingreso.
- Los 3 que tienen menos de 6 caracteres deben recibir el pedido de una contraseña nueva.

El export y `importar-pruebas.json` tienen contraseñas y datos de clientes: no se suben a Git ni se comparten. Ya están en `.gitignore`.

✔ Listo cuando: los usuarios reales entran y quedan migrados (Panel → 🔐 Cuentas).

## 3. Proyecto real de la empresa (requiere aprobación del responsable)

**No hacer sin el visto bueno explícito del responsable del proyecto.** En el repositorio no existe un alias de producción, y no se crea hasta ese momento.

1. **Dominio**: llenar `HOSTS_PRODUCCION` en `firebase-config.js` con el dominio público real, **antes** de unir este código al repositorio original. Sin eso, ningún dominio usa producción.
2. **Decisiones pendientes**: el plazo de migración de cuentas, y si el respaldo incluye `perfiles/` y `login/`. (El vendedor ya está limitado a sus negocios en `database.rules.json`: volver a publicar las reglas cerradas en el sandbox con `npm run reglas:cerradas` para probarlo.)
3. **Respaldo** completo de la base antes de cada fase (export desde la consola de Firebase).
4. **Authentication**: activar correo y contraseña en el proyecto de la empresa (si no, la app muestra el aviso `auth_desactivado`).
5. **Alias**: `npx.cmd firebase use --add` → elegir el proyecto de la empresa → nombre `produccion`.
6. **Fases**: reglas de transición (`--config firebase.transicion.json -P produccion`) → publicar la app → los usuarios migran al entrar → verificar en 🔐 Cuentas → reglas cerradas (`-P produccion`, sin `--config`). Lista de chequeo: [-02 → B.8](../-02-corrections/-02-corrections.md#b8-fases-de-despliegue-con-lista-de-chequeo).
7. Repetir allí los pasos 4–6 de la sección 2 (clave restringida, `no-cache`, CSP).

## 4. Comandos de Firebase de este proyecto

| Comando | Qué hace | Proyecto |
|---|---|---|
| `npm.cmd run reglas:transicion` | Publica `database.rules.transicion.json` (permite migrar cuentas viejas) | `pruebas` (sandbox) |
| `npm.cmd run reglas:cerradas` | Publica `database.rules.json` (reglas finales) | `pruebas` (sandbox) |
| `npm.cmd run publicar:sandbox` | Publica el sitio en Firebase Hosting (solo `.publicar/`, lista blanca) | `pruebas` (sandbox) |
| `npm.cmd run emulador` | Emuladores locales + la app en el puerto 3000 (cuenta `dev` / `dev12345`) | `demo-wallace` (no existe en la nube) |
| `npm.cmd run test:firebase` | Todas las pruebas con emuladores | `demo-wallace` |

Todos los comandos del repositorio usan `-P pruebas` o el proyecto ficticio de los emuladores. Ninguno apunta a la producción de la empresa.

## 5. Recuperar el acceso de un super-admin que olvidó su contraseña

> **Empleados y super-admins que no son el único** (2026-10-12): usan "¿Olvidaste tu contraseña?" en el login y el dueño o el ayudante la resuelve desde el panel ([recuperar-contrasena](../-03-architecture/recuperar-contrasena.md)). Lo de esta sección es para cuando se olvida el **único** super-admin **y no pasó su cuenta a su correo real** ("📧 Mi correo", que le permite recuperarla con el enlace de Firebase: [recuperar-contrasena](../-03-architecture/recuperar-contrasena.md), sección 9).

**Por qué no hay "olvidé mi contraseña"**: las cuentas usan un correo interno inventado (`u<aleatorio>@usuarios.wallace-system.app`, decisión de S1), así que el correo de restablecimiento de Firebase no le llega a nadie.

**Lo normal**: otro super-admin con rol dueño la restablece en la app (Panel → Administradores → editar → contraseña nueva). Los empleados se los restablece el super-admin desde Usuarios. **Tener siempre al menos dos super-admins dueños** evita este procedimiento.

**Si es el único super-admin** (como en el sandbox): lo hace el dueño del proyecto desde la consola de Firebase o la CLI, que no pasan por las reglas. El acceso depende de dos nodos:
- `login/<usuario>` = `{correo, uid}`, que lleva del nombre de usuario a la cuenta;
- `perfiles/<uid>` = `{rol:'superadmin', …}`, que es lo que miran las reglas.

### 5.1 Procedimiento (conserva todos los datos)

El orden permite deshacer hasta el último paso: la cuenta vieja se borra solo cuando la nueva ya entra.

1. **Anotar la cuenta actual**: consola de Firebase → *Realtime Database* → *Datos* → `login` → `Admn-Wallacesys` (el nombre de usuario tal cual; los puntos aparecen como `%2E`). Copiar `correo` y `uid` (el "viejo").
2. **Crear la cuenta nueva**: *Authentication* → *Usuarios* → *Agregar usuario*.
   - Correo: uno nuevo con el mismo formato, p. ej. `uadmnrecupera01@usuarios.wallace-system.app`.
   - Contraseña: la nueva (8 caracteres o más).
   - Copiar el **UID** que asigna (el "nuevo").
3. **Copiar el perfil al uid nuevo** (PowerShell, en la carpeta del proyecto; requiere `npx.cmd firebase login` hecho):
   ```
   npx.cmd firebase database:get /perfiles/<uid-viejo> -P pruebas -o perfil.json
   npx.cmd firebase database:set /perfiles/<uid-nuevo> perfil.json -P pruebas
   ```
   - `<uid-viejo>` es el `uid` de `login` → `Admn-Wallacesys` en *Realtime Database*; `<uid-nuevo>` es el UID de la cuenta del paso 2 en *Authentication* → *Usuarios* (pasar el mouse sobre la columna "UID del usuario" muestra el botón de copiar). Se pegan **sin** `<` `>`.
   - `-o` escribe el archivo bien codificado; no usar `>` en PowerShell 5.1.
   - **Antes del segundo comando**, abrir `perfil.json`: debe tener `"rol": "superadmin"` y el usuario. Si dice solo `null`, el uid viejo está mal copiado y **no** se sigue.
   - El segundo comando pregunta `You are about to overwrite all data at …/perfiles/<uid>. Are you sure? (y/N)`. Firebase lo pregunta siempre, aunque la ruta esté vacía. Responder `y` **solo si** el uid del mensaje es el **nuevo**. Si es el viejo, `N`: se escribiría sobre el perfil que hoy funciona.
   - `perfil.json` queda en la carpeta del proyecto: está en `.gitignore` y se borra en el paso 6.
4. **Apuntar el usuario a la cuenta nueva**: en la consola, `login` → `Admn-Wallacesys`. Cambiar `correo` por el del paso 2 y `uid` por el nuevo.
5. **Probar**: `http://localhost:3000/` → entrar con `Admn-Wallacesys` y la contraseña nueva.
6. **Retirar la cuenta vieja**, solo si el paso 5 funcionó:
   - *Authentication* → la cuenta del correo viejo → *Borrar cuenta*;
   - `npx.cmd firebase database:remove /perfiles/<uid-viejo> -P pruebas`;
   - borrar `perfil.json`.

En Panel → 🔐 Cuentas el usuario debe aparecer "migrado" y sin perfiles huérfanos.

### 5.2 Atajo solo para un sandbox sin datos que importen

1. *Authentication* → borrar todas las cuentas.
2. *Realtime Database* → borrar los nodos `data`, `login` y `perfiles`.
3. `npm.cmd run reglas:transicion`
4. Abrir `http://localhost:3000/`: aparece la **configuración inicial**; crear el dueño de nuevo.
5. `npm.cmd run reglas:cerradas`

Se pierde todo lo creado en el sandbox. **Nunca** usarlo en el proyecto de la empresa.

### 5.3 En producción

El mismo procedimiento 5.1, pero con el proyecto de la empresa:
- con su alias (`-P produccion`, que se crea solo con aprobación);
- con respaldo previo de la base;
- hecho por quien sea dueño de ese proyecto en Firebase.
