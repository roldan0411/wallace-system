# Content-Security-Policy (CSP) de Wallace System

Qué es la CSP, la política propuesta directiva por directiva, cómo se probó, cómo activarla en Render y qué hacer cuando bloquea algo. Es la defensa que falta contra el código inyectado. Por qué hace falta: [seguridad-interfaz](seguridad-interfaz.md) y el residual de **S6** en [-01-to-review](../-01-to-review/-01-to-review.md).

> **Estado (2026-10-10): probada en local; lista en modo `Report-Only` para el sitio del sandbox en Firebase Hosting (`firebase.hosting.json`), que se aplica al publicar con `npm run publicar:sandbox`. NO activada en ningún lado.** Falta revisar la consola con Firebase real y después activarla.

## 1. Qué es y qué resuelve

La CSP es un encabezado HTTP (`Content-Security-Policy`) con el que el servidor le dice al navegador **de dónde puede cargar y ejecutar cosas** la página: scripts, estilos, imágenes, fuentes, conexiones, marcos. El navegador bloquea lo que no esté en la lista, aunque esté dentro de la propia página.

Para Wallace System lo importante es que bloquea **el código en línea**: atributos `onclick`/`onerror`, `<script>` escritos en el HTML y enlaces `javascript:`. Si en algún lugar falta un `escapeHtml` y alguien logra meter `<img src=x onerror="…">` en un nombre de cliente o de producto, sin CSP ese código se ejecuta con la sesión de quien abra la pantalla. Con CSP, el navegador lo bloquea y no pasa nada.

Hasta la fase 8 no se podía usar: la app tenía 250 manejadores `onclick` en línea, y la única CSP compatible tenía que permitir `'unsafe-inline'`, que es justamente lo que deja pasar el código inyectado. Ahora la interfaz no tiene código en línea (eventos delegados, `-03-architecture` sección 11).

La CSP **no reemplaza** a `escapeHtml` ni a las reglas de la base. Es una segunda barrera por si la primera falla.

## 2. La política propuesta

```
default-src 'self';
script-src 'self' https://www.gstatic.com https://*.firebaseio.com;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src https://fonts.gstatic.com;
img-src 'self' data: blob:;
connect-src 'self' https://*.firebaseio.com wss://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com;
frame-src https://*.firebaseapp.com;
object-src 'none';
base-uri 'self';
frame-ancestors 'none'
```

| Directiva | Valor | Por qué |
|---|---|---|
| `default-src` | `'self'` | Lo que no tenga directiva propia solo puede venir del mismo sitio. |
| `script-src` | `'self'` | `src/` (módulos), `firebase-config.js`, `prueba.js`. **Sin `'unsafe-inline'` ni `'unsafe-eval'`**: es lo que bloquea el código inyectado. |
| | `https://www.gstatic.com` | Los tres módulos del SDK de Firebase (`firebase-app.js`, `-database.js`, `-auth.js`) que importa `src/adaptadores/salida/firebase-sdk.js`. |
| | `https://*.firebaseio.com` | Cuando no hay WebSocket (redes que lo bloquean), la base de Firebase cae a *long polling*, que carga scripts desde el servidor de la base. |
| `style-src` | `'self'` | `ui/estilos/*.css`. |
| | `'unsafe-inline'` | **Necesario por ahora**: los estilos calculados de las plantillas (alto de barras de los gráficos, anchos de porcentaje), los `<style>` de las ventanas de impresión y el mensaje de error de `src/arranque.js`. Ver sección 6. |
| | `https://fonts.googleapis.com` | La hoja de las fuentes Inter y Montserrat que enlaza `index.html`. |
| `font-src` | `https://fonts.gstatic.com` | Los archivos de esas fuentes. |
| `img-src` | `'self' data: blob:` | Los logos de los negocios se guardan como `data:` (Mi Negocio los lee con `FileReader`), y el respaldo del panel se descarga como `blob:`. |
| `connect-src` | `https://*.firebaseio.com wss://*.firebaseio.com` | La base de datos (WebSocket y su respaldo HTTP). Si algún día se crea una base fuera de `us-central1`, su dominio es `*.firebasedatabase.app` y hay que agregarlo. |
| | `https://identitytoolkit.googleapis.com https://securetoken.googleapis.com` | Firebase Authentication: iniciar sesión, crear cuentas y renovar el token. |
| `frame-src` | `https://*.firebaseapp.com` | Firebase Authentication puede usar un marco oculto de su dominio. Con usuario y contraseña normalmente no lo usa, pero se deja para no romperlo. |
| `object-src` | `'none'` | Sin `<object>`/`<embed>` (plugins). |
| `base-uri` | `'self'` | Impide que un `<base href>` inyectado cambie a dónde apuntan las rutas relativas de los módulos. |
| `frame-ancestors` | `'none'` | Ninguna otra página puede meter la app en un marco (evita engaños de clics, *clickjacking*). Solo funciona como encabezado, no en `<meta>`. |

**Lo que no hace falta permitir**: los emuladores (`localhost:9000/9099`) y el modo local no pasan por Render, donde se pone el encabezado.

**`prueba.html`** (diagnóstico de conexión) también recibe la política, porque el encabezado va en `/*`. Su código está en `prueba.js` (sin `<script>` ni `onclick` en línea) desde el 2026-10-10; se comprobó que dibuja sus revisiones y que su botón responde con la CSP puesta.

## 3. Cómo se probó (2026-10-10)

`scripts/probar-csp.mjs` hace lo siguiente sin desplegar nada y sin tocar `index.html`:
- sirve el proyecto con la política en un `<meta>`;
- abre la app en modo local en Chrome sin ventana;
- crea los 18 demos y dibuja las **327 pantallas**;
- imprime una factura por negocio en una **ventana real** (las ventanas de impresión heredan la CSP de la página que las abre);
- cuenta cada violación con el evento `securitypolicyviolation`.

```
node scripts/probar-csp.mjs            → pantallas: 327 · impresiones: 18 · violaciones: ninguna
node scripts/probar-csp.mjs estricta   → sin 'unsafe-inline' en style-src: ~830 bloqueos
                                         (estilos calculados de las plantillas y <style> de la impresión)
```

- La variante `estricta` es la **prueba de control**: demuestra que el script sí detecta bloqueos (también dentro de las ventanas de impresión), y lista lo que habría que cambiar para quitar `'unsafe-inline'` de `style-src`.
- Además, el recorrido completo (`tests/navegador/recorrido.test.mjs`: venta, anulación, cierre de caja, clics reales) pasó 8/8 con la política puesta.
- **Ojo**: ese recorrido no sirve solo para vigilar la CSP. Chrome no informa los bloqueos como errores de consola, así que "sin errores de JavaScript" no los ve. Para la CSP, usar `probar-csp.mjs`.

**Lo que NO se probó**: las conexiones a Firebase real (Authentication y base de datos), porque la prueba corre en modo local. Eso se comprueba en el sandbox con `Report-Only` (sección 4).

## 4. Cómo activarla en Render (por pasos)

Render pone encabezados a un sitio estático con `headers` en `render.yaml`, igual que el `Cache-Control` de `/src/*`.

**Paso 1: solo informar (`Report-Only`), en el sitio de pruebas o fork.** El navegador **no bloquea nada**; solo escribe en la consola lo que bloquearía.

```yaml
    headers:
      - path: /src/*
        name: Cache-Control
        value: no-cache
      - path: /*
        name: Content-Security-Policy-Report-Only
        value: "default-src 'self'; script-src 'self' https://www.gstatic.com https://*.firebaseio.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self' https://*.firebaseio.com wss://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com; frame-src https://*.firebaseapp.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
```

**Paso 2: verificar con el sandbox (`wallacesys-dev-sandbox`).**
1. Confirmar que el encabezado llega: `curl -I https://<sitio-de-pruebas>/` debe mostrar `content-security-policy-report-only: …`.
2. Abrir la app con la consola del navegador abierta (F12). Probar:
   - iniciar sesión;
   - crear un negocio y un usuario;
   - vender, cobrar e imprimir;
   - abrir y cerrar caja;
   - subir un logo en Mi Negocio;
   - descargar el respaldo del panel.
3. Buscar mensajes `[Report Only] Refused to …`. Cada uno dice qué directiva y qué dirección bloquearía; corregir la política (sección 5) y repetir.
4. Probar también desde un celular y desde una red que bloquee WebSocket, si se puede (activa el respaldo de Firebase).

**Paso 3: activar.** Cuando la consola esté limpia, cambiar el nombre del encabezado a `Content-Security-Policy` (mismo valor). Desde ese momento el navegador bloquea.

**Paso 4: producción de la empresa.** Repetir el paso 1 con su dominio unos días antes de activarla allí.

**Para revertir**: quitar el bloque del encabezado de `render.yaml` y volver a publicar. La CSP no guarda nada en los navegadores, así que se va con la siguiente carga.

## 5. Si bloquea algo

| Mensaje en la consola | Causa | Qué hacer |
|---|---|---|
| `Refused to connect to 'wss://…firebasedatabase.app'` | La base está en otra región | Agregar `https://*.firebasedatabase.app wss://*.firebasedatabase.app` a `connect-src` (y a `script-src` por el respaldo) |
| `Refused to connect to 'https://…googleapis.com'` | Firebase Authentication usa otro servicio | Agregar ese dominio exacto a `connect-src` |
| `Refused to load the script 'https://…'` | Se agregó una librería externa | Mejor copiarla al proyecto (`'self'`); si no, agregar su dominio exacto a `script-src`, nunca `*` |
| `Refused to execute inline event handler` | Alguien volvió a escribir `onclick="…"` | Cambiarlo por `data-click` (regla de `CLAUDE.md`). `npm test` también lo detecta |
| `Refused to execute inline script` | Un `<script>` dentro de HTML generado | Pasar el código a un módulo |
| `Refused to load the image 'https://…'` | Una imagen de otro sitio | Agregar el dominio a `img-src` o guardarla como `data:` |
| `Refused to apply inline style` | Se quitó `'unsafe-inline'` de `style-src` antes de tiempo | Ver sección 6 |

**Nunca** "arreglar" un bloqueo agregando `'unsafe-inline'` o `'unsafe-eval'` a `script-src`, ni `*`: eso anula la protección.

**Mantenimiento**: la política está escrita en **un solo lugar**, `scripts/csp-politica.mjs`. De ahí la toma `scripts/probar-csp.mjs`, y `tests/ui/estructura.test.mjs` (`npm test`) falla si `firebase.hosting.json`, o `render.yaml` cuando la lleve, tiene otra distinta. Para cambiarla: editar `csp-politica.mjs`, copiar el texto resultante (`POLITICA_ENCABEZADO`) a esos archivos y correr `npm test` y `node scripts/probar-csp.mjs`. Al agregar cualquier recurso externo (fuente, librería, imagen, servicio), agregarlo a la política y correr `node scripts/probar-csp.mjs`.

## 6. Mejora posterior: quitar `'unsafe-inline'` de `style-src`

El riesgo que deja `'unsafe-inline'` en estilos es menor: un CSS inyectado no ejecuta código, pero podría tapar la pantalla o rastrear (ver [seguridad-interfaz](seguridad-interfaz.md), sección 4). Para quitarlo:
- los estilos calculados de las plantillas (`style="height:…px"` en `reportes/dashboard.js`, `reportes/reportes.js`; `style="width:…%"` en `gastos/gastos.js`) se fijan desde JavaScript después de dibujar. Por ejemplo, con `data-alto="…"` y `el.style.height=…`, que la CSP permite porque no es HTML;
- el color de `super-admin/reporte-mensual.js` pasa a una clase;
- los `<style>` de las ventanas de impresión pasan a un archivo CSS enlazado desde esa ventana, o se usa un *nonce*;
- el mensaje de error de `src/arranque.js` pasa a una clase.

`node scripts/probar-csp.mjs estricta` muestra cuántos bloqueos quedan; el objetivo es 0.

## 7. En el sitio del sandbox (Firebase Hosting)

El sandbox se publica con Firebase Hosting, no con Render, así que ahí la CSP va en `firebase.hosting.json` y no en `render.yaml`. Ya está puesta como **`Content-Security-Policy-Report-Only`**: el navegador no bloquea nada, solo avisa en la consola.

1. Publicar: `npm.cmd run publicar:sandbox`.
2. Comprobar que llega: `curl -I https://wallacesys-dev-sandbox.web.app/` debe mostrar `content-security-policy-report-only: …`.
3. Abrir el sitio con la consola abierta (F12 → *Console*) y hacer el recorrido de la sección 4, paso 2. Buscar mensajes `[Report Only] Refused to …`.
4. Si aparece alguno: corregir `scripts/csp-politica.mjs` (sección 5), copiar el texto a `firebase.hosting.json`, `npm test`, volver a publicar y repetir.
5. Cuando la consola esté limpia, **activarla**: en `firebase.hosting.json`, cambiar la clave `Content-Security-Policy-Report-Only` por `Content-Security-Policy` (mismo valor) y volver a publicar.
6. Para la empresa, lo mismo en `render.yaml` (sección 4).
