# Unir el fork con el repositorio original

Cómo llevar el trabajo de la rama `s1-y-correcciones` (fork `Danielvt914/wallace-system`) al repositorio original `roldan0411/wallace-system` sin perder los cambios que se hicieron allá mientras tanto, y sin publicar algo que rompa producción.

> En la terminal PowerShell usar `npm.cmd`/`npx.cmd`. Los comandos de `git` funcionan igual en PowerShell y en Git Bash.

## 1. Situación (revisada el 2026-10-10)

```
original (roldan0411)   15b243d ── 5425800  "Add notifications for new orders and cash changes"
                            │
fork (s1-y-correcciones)    └── 5fa89f1 ── 62941a6 ── e2f41bc ── (cambios sin commit)
```

- **Base común**: `15b243d` ("Add files via upload"). Ahí empezó el trabajo del fork.
- **En el original** hay **un** commit nuevo desde entonces: `5425800` (04/10/2026). Solo cambia `app.js` (+118/−34).
- **En el fork**, `app.js` ya no existe: se partió en los módulos de `src/adaptadores/entrada/ui/` (fase 1.5) y luego se convirtió en módulos ES (fase 8).

**Resultado de simular la unión** (`git merge-tree`, no toca nada): **un solo conflicto**, de tipo *modify/delete* en `app.js`. Todo lo demás se une solo.

```
CONFLICT (modify/delete): app.js deleted in HEAD and modified in upstream/main.
```

Git no puede resolverlo solo: no sabe que el contenido de `app.js` ahora vive en otros 47 archivos. Hay que **portar a mano** lo que cambió el original.

## 2. Cómo revisarlo de nuevo (antes de cada unión)

Una sola vez, registrar el original como `upstream` (solo lectura para nosotros):
```
git remote add upstream https://github.com/roldan0411/wallace-system.git
```

Cada vez que se quiera saber si el original cambió:
```
git fetch upstream
git merge-base HEAD upstream/main                 # base común (hoy 15b243d)
git log --oneline HEAD..upstream/main             # commits del original que el fork no tiene
git diff --stat <base> upstream/main              # qué archivos tocaron
git merge-tree --write-tree --name-only HEAD upstream/main   # simula la unión: lista los conflictos
```

Si `git log HEAD..upstream/main` no muestra nada, no hay nada que traer.

## 3. Qué trae el commit `5425800` y dónde va ahora

> **Ya portado (2026-10-12).** Cada cambio está en su módulo (tabla 3.2). Falta solo la unión en Git (sección 4, que ahora es corta): así Git sabe que `5425800` ya está incluido y la próxima unión trae solo lo posterior.

Ver el cambio completo: `git show 5425800 -- app.js`.

| Cambio en el original (`app.js`) | Qué hace | Dónde va en el fork |
|---|---|---|
| `avisarPedidoNuevo(v)` + detección de venta nueva en `sincronizarNegocio` | Aviso 🔔 con sonido cuando **otro equipo** toma un pedido (no en la carga inicial ni si lo hizo el mismo usuario) | La **detección**, en el adaptador de datos (`src/adaptadores/salida/firebase-datos.js`), que avisa con un **gancho nuevo** (p. ej. `alPedidoNuevo`). Hay que agregarlo al puerto `src/aplicacion/puertos/datos.js` si cambia el contrato, y conectarlo en `src/arranque.js`. El **aviso** (toast y sonido), en la interfaz (`ui/ventas/` o `ui/nucleo/`) |
| `avisarCambioCaja(v)` + `_cajaAvisada` | Aviso cuando otro equipo abre o cierra la caja; la pantalla se refresca de una vez | Detección en `firebase-datos.js` (gancho, p. ej. `alCambiarCaja`); aviso en `ui/caja/caja.js` |
| `campoDelicado(a)` y `refrescarSiSePuede(forzar)` | Escribir en un buscador ya no frena el refresco, solo los formularios. Los cambios de caja fuerzan el refresco. Revisión cada 20 s de lo que quedó sin pintar | `ui/nucleo/estado.js` (ahí vive `refrescarSiSePuede`) |
| `mesDe(f)` | Mes de una fecha | `src/dominio/fechas.js`, con prueba en `tests/dominio/`, publicado en el puente si la interfaz lo usa por nombre |
| Ajustes en `movimientoCaja`, `contable`, `gastosneg`, Nueva Venta (`_guardando`) e `imprimirReporteNegocio` | Ajustes de esas pantallas | `ui/caja/caja.js`, `ui/gastos/contable.js`, `ui/gastos/gastos.js`, `ui/ventas/nueva-venta.js`, `ui/impresion/reportes.js` (buscar cada función en [mapa-interfaz](../-03-architecture/mapa-interfaz.md)) |

### 3.1 No se copia: se adapta

El código del original es anterior a varias correcciones del fork. Al portarlo hay que respetarlas:

| En el original | Choca con | Cómo portarlo |
|---|---|---|
| Revisa la caja con `caja_actual[0]` | **F1**: cada sucursal tiene su caja | Usar `cajaActual()` / `cajaDe(lista, sucursal)`; avisar solo del cambio de la sucursal del equipo |
| "Lo hice yo" comparando `v.vendedor === STATE.user.nombre` | **F15**: agrupar y comparar por id | Comparar `v.vendedorId` con `STATE.user.id` |
| `catch(e){}` vacíos | **C2**: errores atrapados con `reportarError` | `reportarError('el aviso de …', e)` |
| `toast(... + v.factura + ...)` | `toast` ya escapa (no pasarle `escapeHtml`) | Dejarlo como texto plano |
| Variables globales y llamadas por nombre | **Fase 8**: módulos ES | `import`/`export`; si otro módulo cambia una variable, `fijarX(v)` |
| Adaptador que llama a la interfaz directamente | **Arquitectura**: el adaptador de datos no conoce la interfaz | Gancho en `arranque.js` → función exportada de la interfaz |

### 3.2 Cómo quedó portado (2026-10-12)

| Cambio | Dónde quedó |
|---|---|
| Detección de pedido nuevo | `firebase-datos.js`: gancho `alRegistroNuevo(tabla, valor, {inicial})`. "Nuevo" = no estaba en lo recibido ni en lo que este equipo subió; `inicial` = llegó en los primeros 2,5 s de sincronizar. No cambia el puerto (los ganchos no son operaciones) |
| Detección de cambio de caja | `firebase-datos.js`: gancho `alCambiarTabla(tabla, nuevo, viejo, {inicial})` para las tablas enteras del negocio |
| Avisos (toast + sonido) | `ui/nucleo/avisos-nube.js`: `registroNuevoDeNube` (compara `vendedorId`, F15; ignora otras sedes, F1) y `tablaCambioDeNube` (estado de la caja **de mi sede** con `cajaDe`, F1; refresco forzado). Conectados en `src/arranque.js` |
| `campoDelicado`, `refrescarSiSePuede(forzar)`, revisión cada 20 s | `ui/nucleo/estado.js`. Con una ventana abierta nunca se redibuja: queda pendiente |
| Nueva Venta no congela | `ui/ventas/nueva-venta.js`: "escribiendo" solo con productos en el pedido, editando o agregando a una cuenta |
| `movId` en la copia del gasto de caja | `ui/caja/caja.js`; además la copia se guarda **solo si el movimiento entró** (D7: antes quedaba la copia aunque la caja ya no estuviera abierta) |
| Cruce de gastos de caja en el Contable | Regla pura `Dominio.gastos.copiasSinMovimiento` (`src/dominio/gastos.js`), usada en `ui/gastos/contable.js` |
| `mesDe` | Ya existía (`Dominio.fechas.mesDe`, F2): nada que portar |

Pruebas: `tests/dominio/negocio.test.mjs` (cruce de gastos), `tests/integracion/s1-migracion.test.mjs` (otro equipo escribe en el emulador → el adaptador avisa; lo propio y la carga no), `tests/navegador/recorrido.test.mjs` ("5425800": textos de los avisos, otra sede, caja, Nueva Venta libre, `campoDelicado`; D7 con `movId`).

## 4. Paso a paso de la unión

> **Con `5425800` ya portado**, los pasos 4 y 6 se reducen a: resolver el conflicto con `git rm app.js` y correr las pruebas. Comandos, después de hacer commit de lo pendiente:
> ```
> git remote add upstream https://github.com/roldan0411/wallace-system.git   (solo la primera vez)
> git fetch upstream
> git merge upstream/main          (conflicto en app.js: borrado aquí, modificado allá)
> git rm app.js
> npm.cmd test
> git commit -m "Une el original (5425800): avisos de pedido nuevo y de caja ya portados a los módulos"
> ```
> No se hizo antes porque la unión termina en un commit y había trabajo preparado con `git add` que habría quedado mezclado en él.

Todo se hace en la rama del fork. El original **no se toca** hasta el Pull Request.

1. **Partir de un estado limpio**: hacer commit de lo pendiente (`git status` sin cambios).
2. **Traer el original**: `git fetch upstream`.
3. **Unir**: `git merge upstream/main`. Git se detiene con el conflicto en `app.js` y deja la versión del original en la carpeta.
4. **Portar**: con `git show 5425800 -- app.js` a la vista, llevar cada cambio a su módulo según la sección 3 y adaptarlo según 3.1. Agregar las pruebas: dominio (`mesDe`); en el recorrido del navegador, que un pedido o un cambio de caja llegado "de otro equipo" muestre el aviso.
5. **Quitar `app.js`**, porque su contenido ya está en los módulos: `git rm app.js`.
6. **Verificar** (todo debe pasar):
   ```
   npm.cmd test
   npm.cmd run test:firebase
   node scripts/capturas.mjs tomar capturas/union
   node scripts/capturas.mjs comparar capturas/base capturas/union
   ```
   La comparación puede mostrar diferencias **solo** donde el original cambió algo visible. Revisar cada una.
7. **Terminar la unión**: `git commit`. El mensaje sugerido es `Une el original (5425800): avisos de pedido nuevo y de caja portados a los módulos`. Git registra que `5425800` ya está incluido: la próxima unión solo traerá lo posterior.
8. **Subir**: `git push`.

**Si algo sale mal antes del paso 7**: `git merge --abort` deja la rama como estaba antes del paso 3.

**No usar `git rebase`** sobre el original: reescribiría los commits del fork ya subidos.

## 5. Antes del Pull Request al original (requisitos)

Qué apunta a dónde (Firebase por dominio, servicios de Render), qué hacer con la base y las cuentas de la empresa, y la lista de chequeo completa: [paso-a-produccion](paso-a-produccion.md).

Unir el código **no es** desplegar, pero puede serlo: si el sitio de la empresa en Render se publica solo desde `main`, aceptar el Pull Request publica de inmediato. Por eso, antes de abrirlo:

| # | Requisito | Por qué |
|---|---|---|
| 1 | `HOSTS_PRODUCCION` en `firebase-config.js` con el dominio público real | Vacío, el dominio de la empresa usaría el proyecto de pruebas o el modo local en vez de su base |
| 2 | Saber si Render publica solo al unir (*Auto-Deploy* del servicio de la empresa) | Si sí, desactivarlo mientras se prepara S1, o unir solo cuando todo esté listo |
| 3 | Firebase de la empresa preparado: Authentication con correo y contraseña activo, **respaldo** de la base, reglas de **transición** publicadas | La versión nueva inicia sesión con Firebase Authentication y migra las cuentas viejas al primer ingreso ([-02 → B.8](../-02-corrections/-02-corrections.md#b8-fases-de-despliegue-con-lista-de-chequeo)) |
| 4 | Decisiones del responsable tomadas (super-admin vendedor, plazo de migración, contenido del respaldo) | Cambian reglas y pantallas |
| 5 | Pruebas con Firebase real hechas en el sandbox ([conexion-firebase](conexion-firebase.md)) | Las automáticas no cubren Firebase real ni dispositivos |
| 6 | El original no tiene commits nuevos sin portar (repetir la sección 2) | Si los hay, repetir la sección 4 primero |
| 7 | `render.yaml` revisado: el del fork agrega `Cache-Control: no-cache` en `/src/*` | Al unir, el servicio de la empresa lo toma |

**El Pull Request**: desde GitHub, `Danielvt914/wallace-system` rama `s1-y-correcciones` → `roldan0411/wallace-system` rama `main`. En la descripción conviene enlazar:
- `Documentation/-01-to-review` (qué se corrigió);
- `-02-corrections` → S1 (cómo desplegar);
- este documento.

## 6. Después de unir

1. Seguir las fases de S1 en el proyecto de la empresa ([conexion-firebase](conexion-firebase.md), sección 3), con respaldo antes de cada una.
2. Subir `VERSION_UI` y el `?v=` de los estilos en cada publicación.
3. Mantener el fork al día. Antes de empezar trabajo nuevo:
   ```
   git fetch upstream
   git merge upstream/main
   ```

## 7. Para que no vuelva a pasar

- **Avisar antes de tocar código del original** mientras haya trabajo abierto en un fork. Cada cambio en el original obliga a portarlo, y más ahora que la estructura es tan distinta.
- **Unir seguido**: pocos commits por unión son fáciles de portar; muchos, no.
- **Trabajar sobre la estructura nueva** una vez unida: nada de volver a un archivo único. Las reglas están en `CLAUDE.md`.
