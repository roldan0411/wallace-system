// ============================================================
//  PUERTO DE SALIDA · Datos
//  Contrato de lo que la aplicación necesita del almacenamiento, sin decir
//  CÓMO se guarda. Hoy lo cumple el adaptador de Firebase + localStorage
//  (adaptadores/salida/firebase-datos.js). Otro adaptador (pruebas en memoria,
//  otra base de datos) solo tiene que implementar estas operaciones.
//
//  Convenciones:
//   · "tabla" = nombre lógico (ventas, productos…). Cada negocio tiene las suyas.
//   · Las tablas de registros son arrays de objetos con id.
//   · Las tablas únicas (caja_actual, config, factura_seq, conceptos_gasto) son un solo valor.
// ============================================================

/**
 * @typedef {Object} PuertoDatos
 * @property {() => boolean} iniciar                         Conecta (o queda en modo local). true = hay nube.
 * @property {(cb:Function) => void} cargarGlobales           Lee negocios/usuarios/superadmins y llama cb.
 * @property {(clave:string) => any} get                      Lee una clave completa.
 * @property {(clave:string, valor:any) => void} set          Escribe una clave completa.
 * @property {(negId:string, tabla:string) => string} claveDe Clave física de una tabla de un negocio.
 * @property {(tabla:string) => Array} misDatos               Tabla del negocio activo.
 * @property {(negId:string, tabla:string) => Array} datosDe  Tabla de cualquier negocio.
 * @property {(tabla:string, registros:Array) => void} guardar        Guarda (fusiona por id) solo lo que cambió.
 * @property {(tabla:string, id:string) => void} eliminar             Borra un registro (con marca de borrado).
 * @property {(negId:string, tabla:string, registros:Array) => void} guardarEn  Como guardar, en un negocio dado (no el activo).
 * @property {(negId:string, tabla:string, id:string) => void} eliminarEn       Como eliminar, en un negocio dado.
 * @property {(tabla:string, id:string, fn:Function) => Object|null} modificarRegistro  Cambio concurrente seguro (transacción).
 * @property {(negId:string, datos:Object) => Promise<{ok:boolean, claves:number}>} restaurarNegocio  Reemplaza el registro y las tablas de un negocio con las de un respaldo.
 * @property {(tabla:string, id:string, fn:Function) => Promise<{committed:boolean, valor:Object|null}>} transaccionRegistro  Cambio sobre la versión del servidor; fn devuelve undefined para no tocarlo (D9).
 * @property {(tabla:string, fn:Function) => Promise<{committed:boolean, valor:any}>} transaccionUnica
 * @property {(clave:string, fn:Function) => Promise<{committed:boolean, valor:any}>} transaccionGlobal
 * @property {(negId:string, minimoLocal:number, cuantos?:number) => Promise<number|null>} reservarConsecutivo  Último número del bloque apartado (cuantos, por defecto 1)
 * @property {(negId:string) => void} sincronizarNegocio
 * @property {() => void} detenerSincNegocio
 * @property {() => void} sincronizarTodo
 * @property {() => void} detenerSincTodo
 * @property {(negId:string) => void} limpiarDatosAjenos
 * @property {(modo:{superAdmin:boolean, negId?:string}) => Promise<void>} recargar
 * @property {() => Promise<Object>} exportarTodo
 * @property {(negId:string) => void} borrarDatosNegocio
 * @property {string} entorno   produccion | pruebas | emulador | local (lo elige firebase-config.js; el login lo muestra)
 *
 * Con cuentas de Firebase (S1):
 * @property {(s:{cuentas:boolean, superAdmin?:boolean, negId?:string}) => void} configurarSesion
 * @property {(negId:string) => Promise<Object|null>} cargarNegocioPropio   Lee y escucha data/negocios_r/<negId>.
 * @property {() => Promise<{hecho:boolean}>} migrarTablasGlobales          negocios → negocios_r, usuarios → por negocio (una vez).
 * @property {(negId:string, tabla:string, id:string) => Promise<Object|null>} leerRegistro
 * @property {(fn:(lista:Array)=>Array|undefined) => Promise<{committed:boolean}>} modificarUsuariosLegado
 * @property {(negId:string) => Promise<void>} leerNegocioCompleto        Todas las tablas de un negocio, una vez (R1).
 * @property {{listo:boolean, nubeLista:boolean, globalesLeidas:boolean, cuentas:boolean}} estado
 */

export const OPERACIONES_DATOS=['iniciar','cargarGlobales','get','set','claveDe','misDatos','datosDe','guardar',
  'eliminar','guardarEn','eliminarEn','modificarRegistro','transaccionRegistro','restaurarNegocio','transaccionUnica','transaccionGlobal','reservarConsecutivo',
  'sincronizarNegocio','detenerSincNegocio','sincronizarTodo','detenerSincTodo','limpiarDatosAjenos',
  'recargar','exportarTodo','borrarDatosNegocio',
  'configurarSesion','cargarNegocioPropio','migrarTablasGlobales','leerRegistro','modificarUsuariosLegado',
  'leerNegocioCompleto'];

// Verifica que un adaptador cumpla el contrato (falla al arrancar, no en medio de una venta)
export function verificarPuertoDatos(adaptador){
  const faltan=OPERACIONES_DATOS.filter(op=>typeof (adaptador&&adaptador[op])!=='function');
  if(faltan.length) throw new Error('El adaptador de datos no cumple el puerto. Faltan: '+faltan.join(', '));
  return adaptador;
}
