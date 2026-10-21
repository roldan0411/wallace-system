// ============================================================
//  DOMINIO · Periodo de prueba y vencimiento de demos
//  Un negocio "en prueba" tiene pruebaDesde / pruebaHasta (milisegundos).
//  Al vencer queda en SOLO LECTURA: puede entrar y ver todo, pero no vender
//  ni modificar nada hasta que el super-admin lo pase a pago o le dé más días.
//  Las demos usan el mismo mecanismo (vencen en DIAS_DEMO).
//  El bloqueo de escritura lo hacen las reglas de la base (database.rules.json,
//  comparando pruebaHasta con la hora del servidor): esto es solo la lógica.
//  Documentation/01-super-admin-panel/01-super-admin-panel.md (Periodo de prueba)
// ============================================================
import { puede } from './permisos.js';

export const DIAS_PRUEBA=30;   // por defecto; el super-admin lo cambia por negocio
export const DIAS_DEMO=15;
export const MAX_DIAS=365;     // tope para no dejar pruebas "eternas" por error
const DIA_MS=24*60*60*1000;

// Campos que marcan una prueba (los dos son reservados: solo los escribe el super-admin)
export const CAMPOS_PRUEBA=['pruebaDesde','pruebaHasta'];

function diasValidos(dias, porDefecto){
  const d=dias==null ? porDefecto : Math.round(Number(dias));
  if(!Number.isFinite(d) || d<1 || d>MAX_DIAS) throw new Error('Días de prueba inválidos (1 a '+MAX_DIAS+'): '+dias);
  return d;
}
// Campos para empezar una prueba (o el vencimiento de una demo) hoy
export function nuevaPrueba(ahoraMs, dias){
  const d=diasValidos(dias, DIAS_PRUEBA);
  return {pruebaDesde:ahoraMs, pruebaHasta:ahoraMs+d*DIA_MS};
}
// ¿Tiene fecha de vencimiento? (prueba o demo)
export function tienePrueba(neg){ return !!(neg && typeof neg.pruebaHasta==='number'); }
// ¿Ya venció? (sin prueba: nunca)
export function vencida(neg, ahoraMs){ return tienePrueba(neg) && ahoraMs>=neg.pruebaHasta; }
// Solo lectura = prueba o demo vencida
export function soloLectura(neg, ahoraMs){ return vencida(neg, ahoraMs); }

// Estado para mostrar: {tipo:'demo'|'prueba'|null, vencida, diasRestantes, hasta}
// diasRestantes cuenta el día en curso: vence hoy = 1; vencida = 0.
export function estadoPrueba(neg, ahoraMs){
  if(!tienePrueba(neg)) return {tipo:null, vencida:false, diasRestantes:null, hasta:null};
  const resta=neg.pruebaHasta-ahoraMs;
  return {
    tipo: neg.esDemo ? 'demo' : 'prueba',
    vencida: resta<=0,
    diasRestantes: resta<=0 ? 0 : Math.ceil(resta/DIA_MS),
    hasta: neg.pruebaHasta
  };
}
// Más días: se suman desde el vencimiento si aún no vence, o desde hoy si ya venció
export function extenderPrueba(neg, dias, ahoraMs){
  const d=diasValidos(dias, DIAS_PRUEBA);
  const base=tienePrueba(neg) ? Math.max(neg.pruebaHasta, ahoraMs) : ahoraMs;
  return {pruebaDesde:(neg && neg.pruebaDesde) || ahoraMs, pruebaHasta:base+d*DIA_MS};
}
// Pasar a pago: se quitan los campos de prueba (null = borrar en la base)
export function camposConvertirAPago(){ return {pruebaDesde:null, pruebaHasta:null}; }

// Quién puede crear y manejar pruebas y demos: el dueño y el ayudante del sistema
// todas; un vendedor, solo las suyas (vendedorId, o demoDe en una demo que creó).
export function puedeGestionarAlta(usuario, neg){
  if(!usuario || usuario.rol!=='superadmin') return false;
  const r=usuario.rolSuper||'dueno';
  if(r==='dueno' || r==='ayudante') return true;
  if(r!=='vendedor') return false;
  if(!neg) return true;   // crear una nueva: queda a su nombre
  return neg.vendedorId===usuario.id || neg.demoDe===usuario.id;
}
// Borrar los productos de ejemplo: el super-admin, o alguien del propio negocio con permiso de eliminar
export function puedeBorrarEjemplos(usuario, negId){
  if(!usuario) return false;
  if(usuario.rol==='superadmin') return true;
  return usuario.negocioId===negId && puede(usuario, 'eliminar');
}
// Negocios (pruebas o demos) que vencen en los próximos `dias` o ya vencieron, del más urgente al menos
export function porVencer(negocios, ahoraMs, dias){
  const limite=ahoraMs+(dias==null?3:dias)*DIA_MS;
  return (negocios||[]).filter(n=>tienePrueba(n) && n.pruebaHasta<=limite).sort((a,b)=>a.pruebaHasta-b.pruebaHasta);
}
