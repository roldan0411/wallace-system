// ============================================================
//  INTERFAZ · Permisos del usuario actual y sucursales
//  Aplica al usuario de la sesión las reglas de dominio/permisos.js y dominio/negocio.js.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/10-users-roles/10-users-roles.md
// ============================================================
import { STATE } from './estado.js';
import { MSJ } from './textos.js';
import { toast } from './componentes.js';
import { armarMenu, render } from './navegacion.js';


// ============================================================
//  PERMISOS DEL USUARIO ACTUAL
//  Las reglas viven en src/dominio/permisos.js y src/dominio/negocio.js
//  (ROLES, PANTALLAS_POR_ROL, PERFILES, PLANES… los publica el puente);
//  aquí solo se aplican al usuario y al negocio de la sesión.
// ============================================================

// ¿Este negocio lleva control de existencias? (por defecto, el de la sesión)
export function usaInventario(neg){ return Dominio.negocio.usaInventario(neg||STATE.negocio); }
// ¿El usuario actual puede hacer esta acción?
// D10: prueba o demo vencida = solo lectura para la gente del negocio (el super-admin sí escribe:
// da más días o pasa a pago). Lo usan los permisos, las acciones y el adaptador de datos (gancho).
export function negocioSoloLectura(negId){
  const n=STATE.negocio;
  if(!n || (negId && n.id!==negId)) return false;
  if(STATE.esSuperAdmin || STATE.modoSupervision) return false;
  return Dominio.prueba.soloLectura(n, Date.now());
}
// Acciones que no escriben nada (siguen en solo lectura)
const ACCIONES_LECTURA=['imprimir','comanda'];
export function tienePermiso(accion){
  if(negocioSoloLectura() && ACCIONES_LECTURA.indexOf(accion)<0) return false;
  return Dominio.permisos.puede(STATE.user, accion);
}
// Al inicio de toda acción que guarda algo (vender, caja, citas…), con permiso propio o sin él
export function exigirEscritura(){
  if(!negocioSoloLectura()) return true;
  toast(MSJ.soloLecturaNoSePuedeGuardar,'error');
  return false;
}
// El adaptador avisa lo que no se guardó (solo lectura o reglas): un aviso cada pocos segundos, no uno por campo
export let _avisoNegada=0;
export function escrituraNegada(x){
  if(Date.now()-_avisoNegada<4000) return;
  _avisoNegada=Date.now();
  toast(x && x.motivo==='solo_lectura' ? MSJ.soloLecturaNoSePuedeGuardar : MSJ.laBaseRechazoUnCambio,'error');
}
// Igual que tienePermiso, pero avisa. Se usa al INICIO de cada acción sensible:
// esconder el botón no basta, la función se puede llamar igual.
export function exigirPermiso(accion, texto){
  if(!exigirEscritura() && ACCIONES_LECTURA.indexOf(accion)<0) return false;
  if(tienePermiso(accion)) return true;
  toast(texto||'No tienes permiso para esta acción','error');
  return false;
}
// Super-admin con poder de gestión (dueño o ayudante; el vendedor solo maneja demos)
export function esAdminSistema(){
  return !!(STATE.esSuperAdmin && STATE.user && STATE.user.rolSuper!=='vendedor');
}
// Pantallas del negocio que el usuario actual puede abrir (las mismas del menú)
export function pantallasPermitidas(){
  if(!STATE.negocio || !STATE.user) return [];
  return armarMenu().filter(m=>m.id).map(m=>m.id);
}
export function puedeVerPantalla(id){ return pantallasPermitidas().indexOf(id)>-1; }
// Si la pantalla pedida no está permitida, se cambia por la primera que sí
export function pantallaValida(){
  const perm=pantallasPermitidas();
  if(perm.indexOf(STATE.pageNeg)<0) STATE.pageNeg=perm[0]||'';
  return STATE.pageNeg;
}

// ============================================================
//  SUCURSALES
// ============================================================
// sucursalesDe / usaSucursales: src/dominio/negocio.js (las publica el puente)
export function sucursalActual(){
  if(!usaSucursales(STATE.negocio)) return 'principal';
  return STATE.sucursal || (sucursalesDe(STATE.negocio)[0]||{}).id || 'principal';
}
// F1: cada sucursal tiene su propia caja (regla en dominio/caja.js)
export function cajaActual(){ return cajaDe(misDatos('caja_actual'), sucursalActual()); }
export function guardarCajaActual(c){ guardarMisDatos('caja_actual', Dominio.caja.conCaja(misDatos('caja_actual'), sucursalActual(), c)); }
export function puedeVerSucursal(sucId){ return Dominio.permisos.puedeVerSucursal(STATE.user, sucId); }
export function cambiarSucursal(sucId){
  STATE.sucursal=sucId;
  try{ localStorage.setItem('ws_suc_'+STATE.negocio.id, sucId); }catch(e){}
  const s=sucursalesDe(STATE.negocio).find(x=>x.id===sucId);
  toast('Trabajando en: '+(s?s.nombre:sucId),'success');
  render();
}
