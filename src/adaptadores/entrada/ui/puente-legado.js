// ============================================================
//  PUENTE DE MIGRACIÓN (temporal)
//  La interfaz (los scripts clásicos de ui/manifiesto.js) llama acciones
//  por nombre global (data-click, eventos.js). Mientras pasa a módulos
//  (fase 8), este puente publica en window el dominio, los datos y las
//  cuentas con los nombres que la interfaz ya usa (misDatos, pagosDe, ROLES…).
//  Cuando un módulo de la interfaz deje de necesitar un nombre, se quita de aquí.
//
//  Regla: la interfaz NO debe declarar nada con estos nombres (lo taparía).
//  tests/ui/estructura.test.mjs lee esta lista y lo verifica.
// ============================================================

/**
 * @param {Window} win
 * @param {{datos:Object, cuentas:Object, sesion:Object, dominio:Object, cripto:Object}} piezas
 */
export function instalarPuente(win, piezas){
  const {datos, cuentas, sesion, dominio, cripto}=piezas;
  const d=dominio;

  // Espacios de nombres explícitos (lo que debe usar el código nuevo)
  win.Datos=datos;
  win.Cuentas=cuentas;          // Firebase Authentication + perfiles (S1)
  win.ServicioSesion=sesion;    // {crear(), mensajeDeFallo(motivo)}
  win.Dominio=d;
  win.Cripto=cripto;
  win.Pruebas=piezas.pruebas;   // periodo de prueba (aplicacion/servicios/pruebas.js); aún sin pantalla

  // Banderas de estado de la nube (solo lectura; NUBE_LISTA también se escribe)
  const propiedad=(nombre, get, set)=>Object.defineProperty(win, nombre, {get, set, configurable:true});
  propiedad('FB_READY', ()=>datos.estado.listo);
  propiedad('NUBE_LISTA', ()=>datos.estado.nubeLista, v=>{ datos.estado.nubeLista=!!v; });
  propiedad('GLOBALES_LEIDAS', ()=>datos.estado.globalesLeidas);

  Object.assign(win, {
    // ---- Puerto de datos con los nombres de siempre ----
    DB: {get:datos.get, set:datos.set},
    claveDe: datos.claveDe,
    misDatos: datos.misDatos,
    datosDe: datos.datosDe,
    guardarMisDatos: datos.guardar,
    eliminarMisDatos: datos.eliminar,
    cambiarStock: datos.modificarRegistro,
    transaccionUnica: datos.transaccionUnica,
    sincronizarNegocio: datos.sincronizarNegocio,
    detenerSincNegocio: datos.detenerSincNegocio,
    sincronizarTodo: datos.sincronizarTodo,
    detenerSincTodo: datos.detenerSincTodo,
    limpiarDatosAjenos: datos.limpiarDatosAjenos,

    // ---- Dominio: fechas ----
    fechaLocal: d.fechas.fechaLocal,
    today: d.fechas.hoy,
    jornadaDe: d.fechas.jornadaDe,
    mesDeJornada: d.fechas.mesDeJornada,
    jornadaCierre: d.fechas.jornadaCierre,
    diasHasta: d.fechas.diasHasta,
    diasDesde: d.fechas.diasDesde,

    // ---- Dominio: pagos y caja ----
    pagosDe: d.pagos.pagosDe,
    reparte: d.pagos.reparte,
    metodoPrincipal: d.pagos.metodoPrincipal,
    metodoTexto: d.pagos.metodoResumen,
    sumaPorMetodo: d.pagos.sumaPorMetodo,
    efectivoRecibido: d.pagos.efectivoRecibido,
    tercerosNoEfectivo: d.pagos.tercerosNoEfectivo,
    bancoPendiente: d.pagos.bancoPendiente,
    cajaDe: d.caja.cajaDe,
    efectivoEsperado: d.caja.efectivoEsperado,

    // ---- Dominio: inventario ----
    ordenarLotes: d.inventario.ordenarLotes,
    sumaLotes: d.inventario.sumaLotes,
    descontarDeLotes: d.inventario.descontarDeLotes,
    difRequerimientos: d.inventario.difRequerimientos,
    esCombo: d.inventario.esCombo,

    // ---- Dominio: roles, permisos y negocio (constantes y reglas puras) ----
    ROLES: d.permisos.ROLES,
    PANTALLAS_POR_ROL: d.permisos.PANTALLAS_POR_ROL,
    ACCIONES: d.permisos.ACCIONES,
    PERMISOS_POR_ROL: d.permisos.PERMISOS_POR_ROL,
    PERFILES: d.negocio.PERFILES,
    PLANES: d.negocio.PLANES,
    VENTANAS_POR_PLAN: d.negocio.VENTANAS_POR_PLAN,
    planDe: d.negocio.planDe,
    inventarioHabilitado: d.negocio.inventarioHabilitado,
    sucursalesDe: d.negocio.sucursalesDe,
    usaSucursales: d.negocio.usaSucursales,

    // ---- Dominio: gastos ----
    CONCEPTOS_BASE: d.gastos.CONCEPTOS_BASE,
    normConcepto: d.gastos.normConcepto,
    claveConcepto: d.gastos.claveConcepto,

    // ---- Dominio: contraseñas ----
    verificarPass: d.contrasenas.verificarPass,
    hashPass: d.contrasenas.hashPass,
    sha256Hex: d.contrasenas.sha256Hex,

    // ---- Adaptador de cripto ----
    uid: cripto.nuevoId,
    nuevaSal: cripto.nuevaSal
  });
}
