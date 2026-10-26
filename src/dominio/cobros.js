// ============================================================
//  DOMINIO · Cobro mensual a los clientes (P6)
//  Cada pago cubre un mes ('AAAA-MM'). El negocio guarda desde qué mes se le
//  cobra (cobroDesde), hasta qué mes pagó (pagadoHasta) y su día de pago
//  (diaPago). Vence el día de pago de cada mes; con DIAS_GRACIA días de gracia
//  está "por pagar" y después "en mora". La suspensión la decide el dueño o el
//  ayudante (no es automática). Documentation/01-super-admin-panel (sección 16)
// ============================================================

export const DIAS_GRACIA=5;
export const MEDIOS_PAGO=['Efectivo','Transferencia','Nequi','Daviplata','Otro'];
// Campos del negocio que escribe solo el super-admin (también en CAMPOS_NEGOCIO_RESERVADOS)
export const CAMPOS_COBRO=['cobroDesde','pagadoHasta'];

const MES=/^\d{4}-(0[1-9]|1[0-2])$/;
const FECHA=/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export function mesValido(m){ return typeof m==='string' && MES.test(m); }
export function mesSiguiente(m){
  let [a,b]=m.split('-').map(Number);
  b++; if(b>12){ b=1; a++; }
  return a+'-'+String(b).padStart(2,'0');
}
export function mesAnterior(m){
  let [a,b]=m.split('-').map(Number);
  b--; if(b<1){ b=12; a--; }
  return a+'-'+String(b).padStart(2,'0');
}
function diasDelMes(m){ const [a,b]=m.split('-').map(Number); return new Date(a, b, 0).getDate(); }
// Fecha en que vence un mes: su día de pago (el 31 en febrero es el último día del mes)
export function vencimiento(mes, diaPago){
  const d=Math.min(Math.max(1, parseInt(diaPago,10)||1), diasDelMes(mes));
  return mes+'-'+String(d).padStart(2,'0');
}
// Día de pago de un negocio que empieza a pagar en "fecha": ese día (máximo 28, para que exista todos los meses)
export function diaPagoPorDefecto(fecha){ return Math.min(28, parseInt(String(fecha).slice(8,10),10)||1); }
// Primer mes que se le cobra: el del primer vencimiento desde que empieza a pagar (paga al empezar)
export function primerMesCobro(fecha, diaPago){
  const m=String(fecha).slice(0,7);
  return vencimiento(m, diaPago)>=fecha ? m : mesSiguiente(m);
}
function diasEntre(desde, hasta){ return Math.round((new Date(hasta+'T00:00:00')-new Date(desde+'T00:00:00'))/86400000); }

// Último mes pagado SIN HUECOS desde "desde" (sin contar los anulados): si pagó septiembre y
// noviembre pero no octubre, queda en septiembre (octubre sigue debiéndose). Sin "desde", el mayor.
export function pagadoHasta(pagos, desde){
  const meses=(pagos||[]).filter(p=>p && !p.anulado && mesValido(p.mes)).map(p=>p.mes);
  if(!meses.length) return null;
  if(!mesValido(desde)) return meses.sort()[meses.length-1];
  const hay={}; meses.forEach(m=>{ hay[m]=1; });
  let m=desde, ultimo=null;
  while(hay[m]){ ultimo=m; m=mesSiguiente(m); }
  return ultimo;
}
// Campos para empezar a cobrarle a un negocio desde "fecha" (alta sin prueba o pasar a pago)
export function inicioDeCobro(fecha, diaPago){
  const dia=parseInt(diaPago,10)>0 ? Math.min(31, parseInt(diaPago,10)) : diaPagoPorDefecto(fecha);
  return {diaPago:dia, cobroDesde:primerMesCobro(fecha, dia), pagadoHasta:null};
}
// Mes que se sugiere al registrar un pago: el primero que falta
export function mesPorPagar(neg, hoy){
  if(neg && mesValido(neg.pagadoHasta)) return mesSiguiente(neg.pagadoHasta);
  if(neg && mesValido(neg.cobroDesde)) return neg.cobroDesde;
  return String(hoy).slice(0,7);
}

// Estado de pago de un negocio en el día "hoy" (AAAA-MM-DD):
//  no_aplica   demos, pruebas y negocios sin precio
//  sin_iniciar todavía no tiene control de pagos (negocios de antes: se inicia con el primer pago)
//  al_dia      {mes, vence}: el próximo mes por pagar aún no vence
//  por_pagar   {mes, vence, pendientes}: venció hace DIAS_GRACIA días o menos
//  en_mora     {mes, vence, diasMora, pendientes}: días desde que venció el mes más viejo sin pagar
export function estadoPago(neg, hoy, gracia){
  const g=gracia==null ? DIAS_GRACIA : gracia;
  if(!neg || neg.esDemo || typeof neg.pruebaHasta==='number' || !(Number(neg.precioMes)>0)) return {estado:'no_aplica'};
  if(!mesValido(neg.cobroDesde)) return {estado:'sin_iniciar'};
  let mes=mesValido(neg.pagadoHasta) ? mesSiguiente(neg.pagadoHasta) : neg.cobroDesde;
  if(mes<neg.cobroDesde) mes=neg.cobroDesde;
  const vence=vencimiento(mes, neg.diaPago);
  if(hoy<vence) return {estado:'al_dia', mes, vence};
  let pendientes=0;
  for(let m=mes; vencimiento(m, neg.diaPago)<=hoy && pendientes<240; m=mesSiguiente(m)) pendientes++;
  const atraso=diasEntre(vence, hoy);
  if(atraso<=g) return {estado:'por_pagar', mes, vence, pendientes};
  return {estado:'en_mora', mes, vence, diasMora:atraso, pendientes};
}

// Validación de un pago antes de guardarlo. Devuelve el motivo o '' si está bien.
export function problemaDelPago(p){
  if(!p || !p.id || !p.negocioId) return 'incompleto';
  if(!mesValido(p.mes)) return 'mes';
  if(typeof p.valor!=='number' || !isFinite(p.valor) || p.valor<=0) return 'valor';
  if(MEDIOS_PAGO.indexOf(p.medio)<0) return 'medio';
  if(!FECHA.test(String(p.fecha||''))) return 'fecha';
  return '';
}
export function nuevoPago({id, negocioId, mes, valor, medio, fecha, nota, quien, registrado}){
  const q=quien||{};
  const p={id, negocioId, mes, valor:Math.round(Number(valor)), medio, fecha, registrado,
    quien:String(q.nombre||q.usuario||'—').slice(0,80)};
  const n=String(nota||'').trim().slice(0,120);
  if(n) p.nota=n;
  return p;
}
// Lo que entró de verdad (P7): suma de los pagos no anulados
export function totalPagado(pagos){ return (pagos||[]).filter(p=>p && !p.anulado).reduce((a,p)=>a+(Number(p.valor)||0), 0); }
