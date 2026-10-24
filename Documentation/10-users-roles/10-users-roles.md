# 10 — Usuarios, roles, permisos y auditoría

> **S1 (Plan B) implementado**: con Firebase configurado, el inicio de sesión lo verifica Firebase Authentication; el rol, las pantallas y los permisos de cada persona se leen de `perfiles/<uid>` y los usuarios de cada negocio viven en `data_<neg>_usuarios_r` sin contraseñas. El admin del negocio solo cambia **su propia** contraseña; las de los demás las restablece el super-admin (cuenta nueva). Lo que sigue describe el login del modo local y la lógica de permisos de la app, que no cambió. Detalle: [-02-corrections → S1](../-02-corrections/-02-corrections.md#s1--base-de-datos-sin-autenticación-ni-reglas--implementado-falta-desplegar).

## 1. Propósito

Controlar quién entra al sistema, qué ventanas ve y qué acciones puede ejecutar en cada negocio, y dejar un registro auditable de las acciones sensibles.

## 2. Alcance

**Incluye**
- Inicio y cierre de sesión (super-admins y empleados).
- Roles de negocio con pantallas y permisos de acción por defecto, personalizables por usuario.
- Restricción de sucursales por usuario.
- Gestión de usuarios por el super-admin (crear, editar, eliminar) y cambio de contraseñas por el jefe del negocio.
- Filtrado del menú lateral.
- Auditoría (`logAudit`) y su pantalla.

**No incluye**
- Roles del equipo Wallace (`dueno`/`ayudante`/`vendedor`) → [01](../01-super-admin-panel/01-super-admin-panel.md).
- Autenticación segura (hash, sesiones, tokens): no existe; ver limitaciones.

## 3. Login (`login`, `ui/usuarios/sesion.js` / `hacerLogin`, `ui/usuarios/sesion.js`)

1. Busca en `superadmins` el usuario y verifica la contraseña con `verificarPass` (hash con sal; acepta registros aún sin migrar) → sesión de super-admin (`rol:'superadmin'`, `rolSuper`).
2. Si no, busca en `usuarios` (global) con `activo!==false` y verifica igual.
3. Valida que el usuario tenga negocio y que el negocio esté `activo` ("Este negocio está suspendido. Contacta al proveedor.").
4. Sucursal: la última usada en ese equipo (`ws_suc_<negId>`) si está permitida, o la primera permitida.
5. `hacerLogin` arranca la sincronización adecuada y, para empleados, borra del equipo los datos de otros negocios ([13](../13-multitenant-isolation/13-multitenant-isolation.md)).
6. La pantalla inicial es la primera que el usuario tiene permitida (`pantallaValida`), no siempre el Dashboard.
7. `logout` (`ui/usuarios/sesion.js`) limpia el estado y detiene las suscripciones. La sesión no persiste: recargar la página pide login de nuevo.

## 4. Roles de negocio (`ROLES`, `dominio/permisos.js`)

`admin` (Administrador), `cajero`, `mesero`, `cocina`, `vendedor`, `dueno` (Dueño).

### Pantallas por defecto (`PANTALLAS_POR_ROL`, `dominio/permisos.js`)

| Rol | Pantallas |
|---|---|
| admin | Todas (no se filtra) |
| cajero | inicio, ventas, pedidos, caja, clientes, domicilios |
| mesero | inicio, ventas, pedidos, clientes |
| cocina | cocina, pedidos |
| vendedor | inicio, ventas, pedidos, catalogo, clientes |
| dueno | inicio, caja, pedidos, reportes, contable, gastosneg, catalogo, conteo, combos, usuarios, config |

Equivalencias usadas por `armarMenu` al filtrar: inventario/insumos/conteo/combos → `catalogo`; tiempos → `cocina`; historial/reimpresiones/cuentas → `pedidos`; cuadredomi → `domicilios`; minegocio → `config`; auditoría solo admin/supervisor.

### Permisos de acción (`ACCIONES`, `dominio/permisos.js` / `PERMISOS_POR_ROL`, `dominio/permisos.js`)

| Acción | Clave | admin | cajero | mesero | cocina | vendedor | dueño |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|
| Cobrar pedidos | `cobrar` | ✔ | ✔ | | | ✔ | |
| Editar pedidos | `editar` | ✔ | ✔ | ✔ | | ✔ | |
| Anular facturas | `anular` | ✔ | | | | | ✔ |
| Cambiar forma de pago | `cambiarpago` | ✔ | ✔ | | | | |
| Reimprimir factura | `imprimir` | ✔ | ✔ | | | ✔ | ✔ |
| Reimprimir comanda | `comanda` | ✔ | ✔ | ✔ | ✔ | | |
| Eliminar definitivamente | `eliminar` | ✔ | | | | | ✔ |
| Abrir / cerrar caja | `abrircaja` | ✔ | ✔ | | | | |
| Aplicar descuentos | `descuento` | ✔ | | | | ✔ | |
| Crear/editar/borrar productos | `editarprod` | ✔ | | | | | ✔ |
| Editar stock | `editarstock` | ✔ | | | | | ✔ |
| Conteo de inventario | `conteo` | ✔ | | | | | ✔ |

`tienePermiso(accion)` (`ui/nucleo/permisos.js`): `true` siempre para supervisor, `admin` y `superadmin`; para los demás usa la lista propia del usuario (`u.permisos`) si tiene, o la del rol.

### Sucursales por usuario
`u.sucursales` vacío = todas. `puedeVerSucursal` filtra el selector de sucursal de la barra superior.

## 5. Gestión de usuarios

### 5.1 Desde el super-admin (`pantallaUsuarios`, `ui/usuarios/usuarios-admin.js` / `editarUsuario`, `ui/usuarios/usuarios-admin.js`)
- Tabla con nombre, usuario, rol, sucursales y estado (las contraseñas no se muestran).
- Crear/editar: nombre*, usuario* (sugerido a partir del nombre del negocio), contraseña (obligatoria al crear, mínimo 4; al editar, vacía = no cambiar), rol, **usuario activo**, sucursales permitidas, **ventanas que puede ver** (21 opciones) y **acciones** (12). Las casillas se precargan con lo del usuario o lo del rol.
- Usuario único entre `usuarios` y `superadmins`.
- `eliminarUsuario` (P11, 2026-10-24): ventana con nombre y rol; "Desactivar" es lo principal (conserva el historial) y "Eliminar definitivamente" (`eliminarUsuarioDefinitivo`) va aparte, en rojo. El último administrador activo del negocio no se borra, ni se desactiva, ni pierde el rol al editarlo (`Dominio.permisos.dejaSinAdmin`).

### 5.2 Desde el negocio (`usuariosNeg`, `ui/usuarios/usuarios-negocio.js`)
- Visible para admin, supervisor o quien tenga la pantalla `usuarios` (`puedeGestionarUsuarios`).
- **Solo permite cambiar contraseñas** (`cambiarPassNeg`, mínimo 4 caracteres, con confirmación). Crear usuarios o cambiar roles requiere al proveedor.
- Cada cambio se audita.

## 6. Menú (`armarMenu`, `ui/nucleo/navegacion.js`)

Construye los grupos PRINCIPAL, OPERACIONES, GESTIÓN y CONFIGURACIÓN según `funciones` y banderas del negocio, y luego filtra por las pantallas del usuario (salvo admin/supervisor). Grupos vacíos no se muestran.

## 7. Auditoría

- `logAudit(accion, detalle)` (`ui/usuarios/auditoria.js`) agrega `{id, usuario, rol, accion, detalle, fecha}` a `auditoria` del negocio.
- Acciones auditadas: abrir/cerrar caja, retiros, gastos/entradas de caja, base corregida, motivo de descuadre, editar/anular/eliminar pedidos, ajustes y cambios de forma de pago, verificación de transferencias, asignar domiciliario, cuentas abiertas (abrir, agregar, cancelar), salida de logística, salida de inventario, conteos, combos, conceptos y registro/eliminación de gastos, cambio de contraseña.
- Pantalla `auditoria` (`ui/usuarios/auditoria.js`): solo admin/supervisor; filtro por usuario; muestra hasta 300 registros.

## 8. Modelo de datos — `usuarios` (global)

> Diccionario completo de todas las tablas (formatos, campos nuevos y viejos): [modelo-de-datos](../-03-architecture/modelo-de-datos.md).

| Campo | Descripción |
|---|---|
| `id`, `negocioId` | Identificación y tenant |
| `nombre`, `usuario` | Credenciales |
| `passHash`, `passSal`, `passIter` | Contraseña: SHA-256 iterado de sal + contraseña (los registros antiguos con `pass` se migran solos al arrancar) |
| `rol` | Rol de negocio |
| `pantallas[]`, `permisos[]` | Personalización (vacío = los del rol) |
| `sucursales[]` | Sucursales permitidas (vacío = todas) |
| `activo`, `creado` | Estado y alta |

## 9. Catálogo de funciones

| Función | Archivo | Alcance | Quién | Qué hace |
|---|---|---|---|---|
| `exigirPermiso(accion,texto)` / `esAdminSistema()` / `pantallasPermitidas()` / `puedeVerPantalla(id)` / `pantallaValida()` | 253–269 | Servicio | Acciones sensibles, render | Validación de permisos dentro de cada acción y pantalla inicial permitida. |
| `hashPass` / `ponerPass(rec,pass)` / `verificarPass(rec,pass)` / `migrarContrasenas()` | dominio/contrasenas.js:47 | Servicio | Login, formularios, `seed` | Contraseñas con hash y sal. |
| `vistaConfigInicial()` / `crearDuenoInicial()` | 7107 / 7122 | Pantalla / Acción UI | Sin super-admins | Crea el primer dueño del sistema. |
| `tienePermiso(accion)` | `ui/nucleo/permisos.js` | Servicio | Todos los módulos | Evalúa permiso de acción. |
| `puedeVerSucursal(id)` | `ui/nucleo/permisos.js` | Servicio | Barra superior | Sucursal permitida. |
| `login(u,p)` | `ui/usuarios/sesion.js` | Interna | `hacerLogin` | Valida credenciales y arma la sesión. |
| `hacerLogin()` | `ui/usuarios/sesion.js` | Acción UI | Botón Entrar / Enter | Login + sincronización. |
| `logout()` | `ui/usuarios/sesion.js` | Acción UI | Botón Salir | Cierra sesión. |
| `cambiarSucursal(id)` | `ui/nucleo/permisos.js` | Acción UI | Selector de sucursal | Cambia y recuerda la sucursal. |
| `logAudit(accion,detalle)` | `ui/usuarios/auditoria.js` | Servicio | Acciones sensibles | Registra auditoría. |
| `pantallaUsuarios(negId)` | `ui/usuarios/usuarios-admin.js` | Pantalla | Super-admin | Usuarios del negocio. |
| `editarUsuario(negId,userId)` | `ui/usuarios/usuarios-admin.js` | Acción UI | Super-admin | Crear/editar usuario con pantallas y permisos. |
| `eliminarUsuario(id)` | `ui/usuarios/usuarios-admin.js` | Acción UI | Super-admin | Desactivar o eliminar (no el último admin activo). |
| `eliminarUsuarioDefinitivo(id)` | `ui/usuarios/usuarios-admin.js` | Acción UI | Super-admin | Borra el usuario y su acceso. |
| `armarMenu()` | `ui/nucleo/navegacion.js` | Interna | `vistaNegocio` | Menú filtrado. |
| `puedeGestionarUsuarios()` | `ui/usuarios/usuarios-negocio.js` | Interna | Usuarios del negocio | ¿Puede cambiar contraseñas? |
| `usuariosNeg()` | `ui/usuarios/usuarios-negocio.js` | Pantalla | `usuarios` | Lista y cambio de contraseña. |
| `cambiarPassNeg(id)` | `ui/usuarios/usuarios-negocio.js` | Acción UI | Jefe | Cambia contraseña y audita. |
| `auditoria()` | `ui/usuarios/auditoria.js` | Pantalla | admin/supervisor | Registro de auditoría. |
| `vistaLogin()` | `ui/usuarios/sesion.js` | Pantalla | Sin sesión | Formulario de ingreso. |

## 10. Interfaz

`.login-fondo`, `.login-caja`, `.login-emblema`, `.login-marca`, `.login-btn`, `.campo`, `.checks/.chk`, `.side-nav/.nav-grupo/.nav-item.on`, `.user-box/.avatar`.

## 11. Limitaciones conocidas (seguridad)

- Las contraseñas ya van con hash, pero los hashes siguen descargándose a todos los equipos con la tabla global `usuarios`; una contraseña corta podría adivinarse por fuerza bruta (S1 pendiente).
- Los permisos se validan en cada acción (`exigirPermiso`, `esAdminSistema`, `puedeVerPantalla`), pero todo ocurre en el navegador: sin S1 (Firebase Auth + reglas) alguien con conocimientos puede alterarlo.
- Sin límite de intentos de login, sin expiración de sesión.
- La auditoría se puede editar o borrar directamente en la base (no hay reglas), y el recorte a 800 registros no surte efecto por la fusión por id, así que crece sin límite (ver [13](../13-multitenant-isolation/13-multitenant-isolation.md)).

Ver [-01-to-review](../-01-to-review/-01-to-review.md#seguridad) y [-02-corrections](../-02-corrections/-02-corrections.md).

## "Olvidé mi contraseña" (2026-10-12)

1. En el login, "¿Olvidaste tu contraseña?": la persona deja su usuario y un contacto. La respuesta es siempre la misma, exista o no.
2. El dueño o el ayudante del sistema ve la solicitud en el panel ("🔑 Solicitudes de contraseña"). **Antes de nada, llama al número registrado** para comprobar que es la persona.
3. "Generar temporal" reemplaza su cuenta con una contraseña de 10 caracteres que se muestra una sola vez. La anterior deja de servir, y queda en la auditoría del negocio.
4. Al entrar con la temporal, la app obliga a elegir una nueva antes de cualquier otra cosa (`debeCambiarPass`).

Código: `ui/usuarios/recuperacion.js`. Diseño, reglas y pruebas: [recuperar-contrasena](../-03-architecture/recuperar-contrasena.md).

**Dueño o ayudante solos** (2026-10-12): con "📧 Mi correo" pasan su cuenta a su correo real. Entran escribiendo el correo, y "¿Olvidaste tu contraseña?" con el correo les manda el enlace de Firebase, sin depender de otro super-admin. Pendiente: "Entrar con Google" ([entrar-con-google](../-03-architecture/entrar-con-google.md)).
