# Revisión del panel de super-admin (para reestructurarlo)

> 2026-10-14. **Para revisión del usuario.** 2026-10-24: **etapa 1 corregida** (P1, P3, P8, P11, P15, P16 solo la pastilla del rol, P21, P22), con las decisiones del usuario anotadas en la sección 5. El resto sigue sin implementar. Este documento solo cubre el panel del super-admin: el panel del dueño y del ayudante, el del vendedor y las pantallas a las que se llega desde ahí (Configurar, Usuarios, Administradores, 🔐 Cuentas, respaldo e informe). La operación **dentro** de un negocio queda fuera.
> Cada punto sale del código actual. Entre paréntesis va dónde está, con rutas relativas a `src/adaptadores/entrada/`. La numeración sirve para responder ("sí a P3, no a P7…").

Leyenda de prioridad: 🔴 falla o riesgo real · 🟠 flujo incompleto · 🟡 mejora.

## 1. Cómo está hoy (resumen)

| Pantalla | Qué tiene |
|---|---|
| Panel del dueño o ayudante (`ui/super-admin/panel.js`) | **Barra superior con hasta 8 botones:** Respaldo, Restaurar, Calcular cifras, Administradores, Cuentas, Mi correo, Mi contraseña y Salir.<br>**Tarjetas:** solicitudes de contraseña y pruebas por vencer.<br>**Cifras:** 7, en dos filas.<br>**Cartera por vendedor.**<br>**Tabla de negocios:** buscador, filtro por vendedor, y 7 botones por fila (Entrar, Configurar, Usuarios, Informe, Vendedor, Suspender, 🗑️). |
| Panel del vendedor (mismo archivo) | Saludo, por vencer, 3 cifras, "Tus clientes" (solo lectura) y "Mis demostraciones" (Entrar, Pausar, 🗑️). |
| Configurar (`ui/configuracion/config-negocio.js`) | 5 pestañas: datos, plan y vendedor, cómo opera, ventanas y sucursales. Un botón "Guardar" por pestaña. |
| Usuarios (`ui/usuarios/usuarios-admin.js`) | Tabla de empleados y una ventana para crear o editar (rol, ventanas, acciones y sucursales). |
| Administradores (`ui/super-admin/administradores.js`) | Super-admins: crear, editar y eliminar. Solo el dueño. |
| 🔐 Cuentas (`ui/usuarios/migracion-cuentas.js`) | Estado de la migración S1 por usuario. |

## 2. Flujos incompletos o con fallas

### Negocios (alta, estado y baja)

| # | Prioridad | Dónde | Qué pasa hoy | Propuesta |
|---|---|---|---|---|
| P1 | 🔴 | `nuevoNegocio` (`ui/super-admin/negocios.js`) | **Contraseña inicial.** La ventana de crear negocio llena la contraseña del administrador con **`admin123`**, visible. Si nadie la cambia, todos los negocios nuevos quedan con la misma clave. | Usar una clave al azar que se muestre **una sola vez**, como en las demos (`mostrarAccesosDemo`), y marcar `debeCambiarPass` para que la cambie al primer ingreso (eso ya existe). |
| P2 | 🔴 | panel, `toggleNegocio`, `eliminarNegocio`, `asignarVendedor`, `guardarConfig`, `pasarAPago`, `darMasDias` | **No queda rastro.** Lo que hace un super-admin sobre un negocio no deja **ningún registro**: suspender, eliminar, cambiar el plan o el precio, dar días, pasar a pago, asignar un vendedor. `logAudit` es por negocio y aquí no se llama. No se puede saber quién suspendió un cliente ni cuándo. | Agregar una bitácora del sistema `auditoria_sistema` (solo agregar, como S10) con fecha, super-admin, negocio, acción, antes y después. Mostrarla en una pantalla "Historial" del panel y en la ficha de cada negocio (U3). |
| P3 | 🟠 | `toggleNegocio` | **Suspender.** Un solo clic suspende, **sin confirmar** y sin motivo. El botón está al lado de "Vendedor" y del 🗑️. Tampoco se guarda desde cuándo está suspendido. | Pedir confirmación y motivo (falta de pago, solicitud del cliente, otro). Guardar `suspendidoDesde` y `motivoSuspension`. La pastilla "Suspendido" debería decir desde cuándo. |
| P4 | 🟠 | `eliminarNegocio` | **Eliminar.** Hay doble confirmación, pero **no se ofrece un respaldo** de ese negocio antes de borrarlo. "Restaurar" existe, pero solo sirve si alguien bajó un respaldo completo antes. | Antes del borrado definitivo, bajar automáticamente el respaldo **de ese negocio** (o exigirlo con una casilla). Mejor aún: "Archivar" (suspendido y oculto de la lista) como paso previo, y borrar solo lo archivado hace más de N días. |
| P5 | 🟠 | `nuevoNegocio` | **Datos del alta.** Pide nombre, tipo, ciudad, plan, precio, usuario y contraseña. No pide NIT, teléfono, contacto ni día de pago, y el precio viene fijo en `149900`, sea cual sea el plan. El nombre del administrador queda "Administrador". Al terminar, el usuario vuelve al panel sin ningún paso siguiente. | Hacer un asistente corto en 3 pasos: **negocio**, **plan y cobro** (precio sugerido por plan y día de pago) y **administrador** (nombre real y teléfono). Terminar con un resumen y "Configurar ahora" o "Entrar al negocio". |

### Cobro y plan

| # | Prioridad | Dónde | Qué pasa hoy | Propuesta |
|---|---|---|---|---|
| P6 | 🟠 | `config-negocio.js`, pestaña comercial | **Cobro a los clientes.** Se guarda el **día de pago** (`diaPago`), pero **nada lo usa**: no hay lista de quién debe, no hay aviso de mora, y `activo` se cambia a mano. Ya está anotado en la limitación 10 del módulo. | Hacer un control de pagos mínimo: registrar el pago del mes (fecha, valor, medio) y mostrar el estado del mes ("al día", "vence en N días" o "en mora N días"). Agregar una tarjeta "Cobros del mes" en el panel. La suspensión sigue siendo manual, pero sugerida. |
| P7 | 🟡 | pestaña comercial | **"Facturado desde que entró".** El cálculo es `precioMes × meses`. Es una estimación que cuenta los meses de prueba, los suspendidos y los precios anteriores como si se hubieran pagado. | Con P6, sumar los pagos registrados. Mientras tanto, cambiar la etiqueta a "Estimado". |
| P8 | 🟡 | pestañas comercial y ventanas | **Plan y ventanas.** Al cambiar el plan, no se aplican sus ventanas: hay que ir a la pestaña "Ventanas" y pulsar "Aplicar lo del plan". Ese botón lee el `select` del plan, que **no existe** en esa pestaña, así que **siempre aplica "Profesional"**, aunque el botón diga "Aplicar lo del plan Básico" (`aplicarPlantillaPlan`). | Al guardar un plan distinto, preguntar "¿Aplicar las ventanas del plan X?". En la pestaña Ventanas, usar `neg.plan` en lugar del `select`. |

### Configurar

| # | Prioridad | Dónde | Qué pasa hoy | Propuesta |
|---|---|---|---|---|
| P9 | 🟠 | `cfgTab`, `guardarConfig` | **Cambios perdidos.** Al cambiar de pestaña sin guardar, se pierde lo escrito, **sin aviso** (la pantalla se vuelve a dibujar). | Avisar "Tienes cambios sin guardar" al cambiar de pestaña o volver, o guardar todas las pestañas a la vez (los valores se guardan en memoria al cambiar de pestaña). |
| P10 | 🟡 | pestaña Sucursales | **Sucursales.** Agregar y quitar se guardan **al instante**, pero el nuevo nombre de una sede solo se guarda con "Guardar configuración". | Hacerlo igual en todos los casos: editar el nombre en una ventana, como al agregar. |

### Usuarios de un negocio

| # | Prioridad | Dónde | Qué pasa hoy | Propuesta |
|---|---|---|---|---|
| P11 | 🟠 | `eliminarUsuario` (`ui/usuarios/usuarios-admin.js`) | **Borrar usuarios.** Se puede borrar **el último administrador** de un negocio, y nadie quedaría para manejarlo por dentro. La confirmación no dice a quién se borra. | No permitir borrar ni desactivar el último `admin` activo. Confirmar con el nombre ("¿Eliminar a Juan (cajero)?"). Ofrecer "Desactivar" como opción por defecto, porque conserva el historial de sus ventas. |
| P12 | 🟡 | `editarUsuario` | **Contraseña de un empleado.** El super-admin cambia la contraseña escribiéndola él mismo en "Nueva contraseña". | Agregar un botón "Generar temporal" igual al de recuperación, con `debeCambiarPass`. Así el super-admin nunca conoce la clave definitiva. |

### Administradores

| # | Prioridad | Dónde | Qué pasa hoy | Propuesta |
|---|---|---|---|---|
| P13 | 🟠 | `eliminarSuperAdmin` (`ui/super-admin/administradores.js`) | **Borrar un vendedor con clientes.** Si se borra un vendedor, sus negocios siguen apuntando a él y la cartera muestra "(eliminado)". Sus demos quedan sin dueño, y el filtro `!n.demoDe \|\| …` hace que **todos los vendedores** las vean. | Al borrar, pedir a quién se pasan sus clientes y qué hacer con sus demos (borrarlas o pasarlas). |
| P14 | 🟡 | `editarSuperAdmin` | **Descripción del rol vendedor.** El rol se describe como "solo crea y muestra demos", pero hoy también crea negocios a prueba y ve su cartera. Tampoco se ve qué negocios tiene cada vendedor. | Corregir el texto y agregar una columna "Clientes / demos" en la tabla de administradores. |

### Supervisión

| # | Prioridad | Dónde | Qué pasa hoy | Propuesta |
|---|---|---|---|---|
| P15 | 🟠 | `entrarComoNegocio` | **Quién supervisa.** Al supervisar, el usuario pasa a ser `{nombre:'Supervisor'}`. Lo que el super-admin haga dentro del negocio sale en su auditoría como "Supervisor", **sin decir quién fue**. Tampoco queda registrado que entró. | Usar el nombre real ("Supervisor: Ana") y registrar "Entró a supervisar" o "Salió" en la auditoría del negocio y en la del sistema (P2). |

### Cifras y paneles

| # | Prioridad | Dónde | Qué pasa hoy | Propuesta |
|---|---|---|---|---|
| P16 | 🟡 | `panelSuperAdmin` | **Cifras.** Hay 5 problemas:<br>• Las cifras excluyen las demos (está bien), pero la tabla las mezcla con los clientes. Con solo demos, el panel dice "0 de 0 en total" y debajo hay 3 negocios (captura `005-panel`).<br>• "Negocio con más ventas" usa el total **histórico**, que siempre favorece al más antiguo.<br>• No se ve qué tan vieja es cada cifra (el resumen de cada negocio).<br>• "Cartera por vendedor" aparece como **tabla vacía** cuando no hay clientes reales.<br>• La pastilla dice "Dueño del sistema" **también al ayudante**. | • Separar clientes, pruebas y demos (U2).<br>• Usar "el mes" en lugar del histórico.<br>• Mostrar "cifras al día de hoy / de hace N días".<br>• Ocultar la cartera sin datos.<br>• Mostrar el rol real en la pastilla. |
| P17 | 🟡 | panel del vendedor | **Panel del vendedor.** En "Tus clientes" ve plan y estado, pero no los días de prueba que le quedan a cada uno (sí los ve en "por vencer"). No puede pedir "pasar a pago". No ve cuánto factura en el mes con los pagos reales (depende de P6). | Mostrar los días de prueba. Agregar un botón "Avisar que ya pagó", que crea una solicitud que el dueño o el ayudante aprueban con "Pasar a pago". Mostrar su cartera con los pagos de P6. |

### Respaldo y salud del sistema

| # | Prioridad | Dónde | Qué pasa hoy | Propuesta |
|---|---|---|---|---|
| P18 | 🟡 | `descargarRespaldo` | **Último respaldo.** No se sabe cuándo se bajó el último respaldo ni quién lo bajó. Nada recuerda hacerlo. | Guardar `ultimoRespaldo` (fecha y quién) y avisar en el panel si pasaron más de 7 días. |
| P19 | 🟡 | panel | **Negocios inactivos.** No se ve si un negocio **se está usando**: última venta, último ingreso o cifras sin publicar. Un cliente que dejó de usar el sistema es un cliente que se va a ir. | Agregar una columna o pastilla de "Actividad": "vendió hoy", "hace N días" o "sin uso". Sale del resumen que ya publica cada negocio (`resumenDe`, `dias`). |
| P20 | 🟡 | 🔐 Cuentas | **Botón 🔐 Cuentas.** Sigue en la barra para siempre, aunque la migración haya terminado. | Mostrarlo con un número solo mientras haya pendientes o cosas por revisar. Si no, moverlo al menú de sistema (U1). |

### Errores menores

| # | Prioridad | Dónde | Qué pasa hoy | Propuesta |
|---|---|---|---|---|
| P21 | 🟡 | `panel.js`, `usuarios-admin.js` | **Fila de "sin datos".** La tabla de negocios tiene 9 columnas y la fila de "sin datos" ocupa `colspan="8"`. La de usuarios tiene 6 y usa `colspan="7"`. | Corregirlo. Desaparece con el rediseño. |
| P22 | 🟡 | `01-super-admin-panel.md` §10 | **Documentación vieja.** Dice "Empresarial" en configuración (hoy los planes son Básico, Profesional y Premium en todas partes) y "No hay restauración de respaldo" (ya existe, §13). | Actualizar esa sección cuando se apruebe esta revisión. |

## 3. Sugerencias de UI/UX (solo el panel)

| # | Sugerencia | Por qué |
|---|---|---|
| U1 | **Barra superior con dos menús.** Dejar solo el estado de conexión, la hora, **"⚙ Sistema ▾"** (Respaldo, Restaurar, Administradores, 🔐 Cuentas, Calcular cifras, Historial de P2) y **"👤 Mi cuenta ▾"** (nombre y rol, Mi contraseña, Mi correo, Salir). Los avisos que piden acción (cifras sin calcular, cuentas pendientes) van como un **punto con número** en "Sistema". | Hoy son hasta 8 botones, y en celular ocupan 3 renglones (captura `006-panel-movil`). Las acciones de todos los días quedan mezcladas con las que se usan una vez al año. |
| U2 | **Pestañas en la lista de negocios:** **Clientes · A prueba · Demos · Suspendidos**, con su número en cada pestaña. Por defecto, "Clientes". | Las demos hoy se mezclan con los clientes que pagan, con plan "Premium" y $149.900 que no son reales. Así cada pestaña muestra lo que importa: en Demos no hace falta el precio, y en A prueba sí hacen falta los días. |
| U3 | **Ficha del negocio en lugar de 7 botones por fila.** En la fila: nombre, estado, plan, vendedor, actividad (P19) y dos acciones: **Entrar** y **⋯**. Al tocar la fila se abre la **ficha** (`page='negocio:<id>'`), con 5 secciones:<br>• **Resumen**: cifras del mes, actividad, días de prueba y pagos;<br>• **Configurar**: las 5 pestañas actuales;<br>• **Usuarios**;<br>• **Cobros** (P6);<br>• **Historial** (P2).<br>El menú ⋯ trae: Informe, Vendedor, Suspender y Eliminar (este último en rojo y al final). | Hoy cada fila ocupa 3 renglones de botones en el computador y 7 botones en el celular, y "Suspender" y "🗑️" están junto a acciones inofensivas. Una ficha también da un lugar natural a lo nuevo (pagos, historial) sin cargar más la tabla. |
| U4 | **Menos cifras y más útiles.** Una sola fila con: **Clientes activos** (con +/– del mes), **Ingreso del mes** (cobrado contra esperado, con P6), **Ventas de hoy en todo el sistema** y **Por atender** (pruebas por vencer, solicitudes de contraseña, mora). El resto pasa a un reporte. | 7 tarjetas grandes empujan la lista de negocios, que es lo que más se usa, fuera de la pantalla. "Usuarios totales" y "Ventas históricas" casi nunca llevan a una acción. |
| U5 | **Bandeja "Por atender" arriba.** Una sola tarjeta que reúne solicitudes de contraseña, pruebas y demos por vencer, negocios en mora y cifras sin calcular. Cada línea trae su botón (Generar temporal, + Días, Pasar a pago, Registrar pago). Sin pendientes, se ve "Todo al día ✓". | Hoy son 2 o 3 tarjetas separadas, que aparecen y desaparecen. Una bandeja deja claro qué hay que hacer hoy. |
| U6 | **Filtros y orden en la tabla.** Además de buscar y filtrar por vendedor: filtros por plan, ciudad y estado de pago, y ordenar por nombre, antigüedad, precio y última actividad. Recordar el filtro elegido al volver de una ficha. | Con decenas de clientes, hoy no hay forma de ver, por ejemplo, "los Premium de Bucaramanga en mora". |
| U7 | **Fechas legibles.** Cambiar "2026-10-08 / 0 d" por "8 oct 2026 · hace 6 días", y el vencimiento por "vence el 23 oct (en 9 días)". | La fecha ISO más "0 d" en dos renglones no se lee de un vistazo. |
| U8 | **Confirmaciones según el riesgo.**<br>• Sin confirmación: Activar, Entrar.<br>• Confirmación simple con motivo: Suspender.<br>• Escribir el nombre más el respaldo automático: Eliminar y Restaurar (como hoy, más P4).<br>• Botón rojo siempre al final y separado. | Hoy suspender no pide nada y está al lado de botones que no hacen daño. |
| U9 | **Asistente de alta** (P5) en 3 pasos con una barra de avance, y al terminar: "Negocio creado. Acceso: usuario X, contraseña Y (se muestra una vez). [Copiar] [Configurar ahora] [Entrar]". | Es el flujo más importante del vendedor y hoy es una sola ventana larga con campos que se ignoran (la prueba es obligatoria para el vendedor, pero la casilla se ve igual). |
| U10 | **Estados vacíos con acción.**<br>• Sin clientes: "Aún no tienes clientes. [Crear negocio] o [Crear demo] para mostrar el sistema".<br>• Sin vendedores: ocultar la cartera.<br>• Cifras en 0: un texto que explique por qué (por ejemplo, "las demos no cuentan"). | La captura `005-panel` muestra tarjetas en 0 y una tabla vacía sin explicación. |
| U11 | **Celular.** En las tarjetas de negocio: nombre, estado y una línea de datos (tipo · plan · vendedor), y los botones **Entrar** y **⋯** en un solo renglón. Barra superior con el logo y los dos menús de U1 en un solo renglón. | En `006-panel-movil`, cada negocio ocupa casi una pantalla entera. |
| U12 | **Panel del vendedor como embudo.** Tres columnas o pestañas: **Demos** (para mostrar) → **A prueba** (días restantes, botón "Avisar que ya pagó") → **Clientes** (activos, su cartera). En lo alto, la meta del mes si se define una. | Refleja el trabajo real del vendedor (mostrar, probar, cerrar) y le dice qué cliente atender hoy. |
| U13 | **Identidad del rol.** La pastilla dice el rol real (Dueño, Ayudante o Vendedor), y en supervisión el banner dice "Estás supervisando *Negocio* como *Ana* · [Volver al panel]". | Hoy el ayudante ve "Dueño del sistema" y dentro del negocio se llama "Supervisor" (P15, P16). |
| U14 | **Mismo lenguaje en todos los botones.**<br>• "Suspender" (clientes) y "Pausar" (demos), "Informe" y "Reporte mensual en PDF", "Eliminar" y "🗑️" y "×" son el mismo concepto con nombres distintos: elegir uno por acción.<br>• Botones con texto, no solo con emoji. | Es más fácil de aprender y de leer para un lector de pantalla. |

## 5. Etapa 1 corregida (2026-10-24)

| # | Decisión del usuario | Qué se hizo |
|---|---|---|
| P1 | Aprobado | Sin campo de contraseña: clave al azar mostrada una vez (`mostrarAccesoNegocio`); con cuentas, `debeCambiarPass:true` desde que nace el perfil. |
| P3 | Lista + "Otro" con texto obligatorio | `suspenderNegocio` + `Dominio.negocio.suspension`; `suspendidoDesde` y `motivoSuspension` reservados (dominio y `database.rules.json`); el panel muestra desde cuándo y por qué; activar los borra. Las demos se pausan sin motivo. |
| P8 | Preguntar al guardar un plan distinto | "Aplicar lo del plan" usa `planDe(neg)` (antes, siempre Profesional); al guardar otro plan, `preguntarDespues` → `aplicarVentanasDelPlan`. |
| P11 | Desactivar primero | `Dominio.permisos.dejaSinAdmin`: el último admin activo no se borra, ni se desactiva, ni pierde el rol. Quitar a alguien abre una ventana con su nombre y rol: "Desactivar" (principal) o "Eliminar definitivamente" (rojo). |
| P15 | Aprobado | "Supervisor: <nombre>" en la auditoría, banner "Supervisando X como Y", entrada y salida registradas (`rastroSupervision`). |
| P16 | Falla evidente (solo la pastilla) | "Ayudante del sistema" para el ayudante. Las otras 4 partes de P16 siguen pendientes. |
| P21 | Falla evidente | `colspan` 9 (negocios) y 6 (usuarios). |
| P22 | Documentación vieja | Sección 10 de [01-super-admin-panel](01-super-admin-panel.md) al día. |

Pruebas: dominio (`suspension`, `dejaSinAdmin`), reglas (los campos nuevos no los escribe el admin del negocio), recorrido ("panel, etapa 1") y `s1-navegador` (entrar con la clave mostrada; el admin creado por un vendedor nace con `debeCambiarPass`).

## 4. Orden sugerido (si se aprueba)

1. ~~**Riesgo, poco trabajo:** P1, P3, P11, P15, P16 (pastilla del rol), P21.~~ Hecho el 2026-10-24 (sección 5).
2. **Rastro:** P2 (bitácora del sistema). Es la base de la ficha del negocio y del historial.
3. **Estructura nueva:** U1, U2 y U3 (menús, pestañas, ficha del negocio), junto con U7, U8, U10 y U11. Antes y después, tomar capturas (`node scripts/capturas.mjs`).
4. **Cobros:** P6 y P7 (modelo de pagos y reglas: `pagos` en `negocios_r/<id>`, que solo escriben el dueño y el ayudante), U4 y U5.
5. **El resto:** P4, P5/U9, P8–P10, P12–P14, P17–P20, U6, U12–U14.

Lo que toca datos o reglas nuevas (P2, P6, P3 con su motivo, P18) necesita:
- su regla pura en `src/dominio/` con su prueba;
- los campos nuevos en `CAMPOS_NEGOCIO_RESERVADOS` **y** en `database.rules.json`, si los escribe solo el super-admin;
- pruebas de reglas y del recorrido.
