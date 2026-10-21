// ============================================================
//  INTERFAZ · Estado de la sesión y formatos
//  STATE, refresco de pantalla, indicador de conexión, fechas, dinero y escape de HTML.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/13-multitenant-isolation/13-multitenant-isolation.md
// ============================================================
import { MSJ } from './textos.js';
import { cajaActual } from './permisos.js';
import { reportarError, toast } from './componentes.js';
import { render } from './navegacion.js';

export let ESCRIBIENDO = false;   // true mientras el usuario arma un pedido
export function fijarEscribiendo(v){ ESCRIBIENDO=v; }   // para los otros módulos (no pueden asignar lo que importan)

// Indicador de conexión (punto verde/rojo/naranja). Lo llama el adaptador de datos.
export function mostrarConexion(estado){
  const el=document.getElementById('fb-status');
  if(!el) return;
  if(estado==='ok'){ el.className='fb-dot ok'; el.title='Sincronizado'; }
  else if(estado==='error'){ el.className='fb-dot err'; el.title='Error de nube'; }
  else { el.className='fb-dot off'; el.title='Sin conexión'; }
}

// ¿El campo enfocado perdería lo escrito si redibujamos? Los buscadores no:
// su texto vive en una variable y render() los restaura. Los formularios sí:
// ahí se espera a que el usuario termine (el teclado del celular no se cierra).
export function campoDelicado(a){
  if(!a) return false;
  const tag=(a.tagName||'').toLowerCase();
  if(tag!=='input' && tag!=='textarea' && tag!=='select' && !a.isContentEditable) return false;
  if(a.classList && (a.classList.contains('busca')||a.classList.contains('busca-grande'))) return false;
  return true;
}
function modalAbierto(){ const m=document.getElementById('modal-container'); return !!(m && m.classList.contains('activo')); }
// Refresca la pantalla salvo que el usuario esté ocupado. Lo que no se pinta
// queda pendiente y se pinta al soltar el campo o en la red de seguridad.
// forzar = cambios que el usuario TIENE que ver ya (otro equipo abrió o cerró la caja)
export function refrescarSiSePuede(forzar){
  if(!STATE.user) return;
  if(modalAbierto()){ _refrescoPendiente=true; return; }   // ventana abierta: nunca se tapa
  if(forzar!==true){
    if(campoDelicado(document.activeElement)){ _refrescoPendiente=true; return; }
    // Solo se frena si hay un pedido a medio armar en la pantalla de venta
    if(ESCRIBIENDO && STATE.pageNeg==='ventas'){ _refrescoPendiente=true; return; }
  }
  _refrescoPendiente=false;
  try{ render(); }catch(e){ reportarError('el refresco de pantalla', e); }
}
export let _refrescoPendiente=false;
// Cuando el usuario deja de escribir (quita el foco), pintamos lo que llegó
document.addEventListener('focusout', function(){
  setTimeout(function(){
    if(!_refrescoPendiente || campoDelicado(document.activeElement)) return;
    refrescarSiSePuede();
  },150);
}, true);
// Red de seguridad: cada 20 s, si quedó algo sin pintar (p. ej. se cerró una
// ventana sin tocar ningún campo), se pinta cuando el usuario no esté ocupado
setInterval(function(){ if(_refrescoPendiente) refrescarSiSePuede(); }, 20000);

// Botón "Actualizar": fuerza traer de la nube lo que corresponda
export function refrescarDeLaNube(){
  if(!FB_READY){ toast(MSJ.sinConexionALaNube,'error'); return; }
  toast(MSJ.actualizando,'info');
  Datos.recargar({superAdmin:!!STATE.esSuperAdmin, negId:STATE.negocio?STATE.negocio.id:null})
    .then(()=>{ toast(MSJ.actualizado,'success'); render(); })
    .catch(()=>toast(MSJ.noSePudoActualizar,'error'));
}


// ============================================================
//  ESTADO Y CONFIGURACIÓN
// ============================================================
export const STATE = {
  user:null, negocio:null, esSuperAdmin:false, modoSupervision:false,
  page:'', pageNeg:'inicio', sucursal:null, buscaNegocio:''
};

export function now(){ return new Date().toISOString(); }
// ---------- JORNADA DE TRABAJO ----------
// Hay negocios que abren de noche y cierran en la madrugada. Para ellos el
// "día" NO es el del calendario: todo lo que se venda hasta que se cierre la
// caja pertenece al día en que esa caja se ABRIÓ. Así una jornada no queda
// partida en dos días y los informes cuadran.
export function jornadaActual(){
  try{ return Dominio.fechas.jornadaDeCaja(cajaActual()); }catch(e){ return today(); }
}
export function fmtMoney(n){ return '$ '+(Math.round(n||0)).toLocaleString('es-CO'); }
// Formato corto para etiquetas de gráficas: 1.2M, 950k, 500
export function fmtCorto(n){
  n=Math.round(n||0);
  if(n>=1000000) return (n/1000000).toFixed(n>=10000000?0:1).replace('.0','')+'M';
  if(n>=1000) return (n/1000).toFixed(0)+'k';
  return String(n);
}
export function fmtDate(f){
  if(!f) return '—';
  const d=new Date(f);
  return d.toLocaleDateString('es-CO')+' '+d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
}
export function escapeHtml(s){
  return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
