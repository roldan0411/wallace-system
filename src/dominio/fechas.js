// ============================================================
//  DOMINIO · Fechas y jornada
//  Reglas puras: no usan window, Firebase ni HTML.
// ============================================================

// Fecha LOCAL del equipo en formato AAAA-MM-DD. (Con la fecha UTC, en Colombia
// el día cambiaba a las 7 de la noche.)
export function fechaLocal(d){
  d = d ? new Date(d) : new Date();
  if(isNaN(d.getTime())) return '';
  const p=n=>String(n).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
}
export function hoy(){ return fechaLocal(); }
// Día local de una fecha guardada: 'AAAA-MM-DD' tal cual; ISO (p. ej. gastos de caja
// viejos guardados con la hora UTC) se convierte al día local. Así nada cambia de
// día (o de mes) por la noche.
export function diaDe(f){
  if(!f) return '';
  if(/^\d{4}-\d{2}-\d{2}$/.test(f)) return f;
  return fechaLocal(f);
}
export function mesDe(f){ return diaDe(f).substring(0,7); }

// JORNADA: todo lo que se venda hasta cerrar la caja pertenece al día en que
// esa caja se ABRIÓ (negocios que cierran de madrugada).
export function jornadaDeCaja(caja){
  return (caja && caja.apertura) ? fechaLocal(caja.apertura) : hoy();
}
// Jornada a la que pertenece una venta (las viejas usan su propia fecha)
export function jornadaDe(v){
  if(!v) return '';
  if(v.jornada) return v.jornada;
  return fechaLocal(v.fecha);
}
export function mesDeJornada(v){ return (jornadaDe(v)||'').substring(0,7); }
// Jornada de un cierre de caja: el día en que se abrió esa caja
export function jornadaCierre(c){ return (c&&c.jornada) ? c.jornada : fechaLocal(c&&(c.apertura||c.cierre)); }

// Días que faltan para una fecha AAAA-MM-DD (negativo = ya pasó)
export function diasHasta(fecha, hoyStr){
  if(!fecha) return null;
  const h=new Date((hoyStr||hoy())+'T00:00:00');
  const f=new Date(fecha+'T00:00:00');
  return Math.round((f-h)/86400000);
}
// Días completos transcurridos desde una fecha ISO
export function diasDesde(f, ahora){
  if(!f) return null;
  return Math.floor(((ahora==null?Date.now():ahora)-new Date(f).getTime())/86400000);
}
