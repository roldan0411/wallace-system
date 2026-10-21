// ============================================================
//  DOMINIO · Consecutivo de facturas
//  La reserva del número en la nube la hace un adaptador; aquí solo
//  vive la regla de qué número usar.
// ============================================================

// Un número provisional (P-…) no cuenta como consecutivo: sus dígitos son fecha y hora
export function numeroDe(factura){ return esProvisional(factura) ? 0 : (parseInt(String(factura||'').replace(/\D/g,''))||0); }
export function mayorNumero(ventas){
  let mayor=0;
  (ventas||[]).forEach(v=>{ const n=numeroDe(v&&v.factura); if(n>mayor) mayor=n; });
  return mayor;
}
export function formatearFactura(n){ return 'F-'+String(n).padStart(5,'0'); }
// Elige el número de la próxima factura.
//  reservada: número reservado en la nube por este equipo (o null)
//  local:     mayor número que este equipo conoce
//  seq:       último número reservado en la nube que este equipo conoce
// Se usa la reserva si es mayor a lo conocido; si no (sin internet), el mayor + 1.
export function elegirNumero(reservada, local, seq){
  if(reservada!==null && reservada!==undefined && reservada>local) return reservada;
  return Math.max(local||0, seq||0)+1;
}

// ---------- Sin conexión: bloques por equipo y número provisional ----------
// Con conexión, cada equipo aparta un BLOQUE de números en una sola transacción y los
// gasta con o sin internet (dos equipos nunca reciben el mismo). Si no tiene bloque
// (arrancó sin internet o se le acabó), la venta sale con un número PROVISIONAL que
// no se puede repetir (código del equipo + fecha y hora) y al reconectar recibe el
// definitivo. Documentation/-03-architecture/facturas-sin-conexion.md
export const TAMANO_BLOQUE=20;
export const MINIMO_BLOQUE=5;       // con menos de esto (y conexión) se aparta otro bloque
// El bloque es una lista de rangos [[desde, hasta], …] que se gastan en orden
export function quedanEnBloque(rangos){ return (rangos||[]).reduce((a,r)=>a+Math.max(0, r[1]-r[0]+1), 0); }
export function necesitaBloque(rangos){ return quedanEnBloque(rangos)<MINIMO_BLOQUE; }
export function agregarRango(rangos, desde, hasta){
  const l=(rangos||[]).filter(r=>r[1]>=r[0]).map(r=>r.slice());
  if(hasta>=desde) l.push([desde, hasta]);
  return l;
}
// Toma el siguiente número del bloque: {numero, rangos} (sin tocar el original) o null si está vacío
export function tomarDelBloque(rangos){
  const l=(rangos||[]).filter(r=>r[1]>=r[0]).map(r=>r.slice());
  if(!l.length) return null;
  const numero=l[0][0];
  l[0][0]++;
  return {numero, rangos:l.filter(r=>r[1]>=r[0])};
}
// P-<equipo>-<AAMMDDhhmmss>: el equipo es un código al azar guardado en el equipo; dos equipos
// tendrían que tener el mismo código y vender en el mismo segundo para repetirlo
export function numeroProvisional(equipo, ms){
  const d=new Date(ms), z=n=>String(n).padStart(2,'0');
  return 'P-'+equipo+'-'+z(d.getFullYear()%100)+z(d.getMonth()+1)+z(d.getDate())+z(d.getHours())+z(d.getMinutes())+z(d.getSeconds());
}
export function esProvisional(factura){ return /^P-[A-Z0-9]+-\d+(-\d+)?$/.test(String(factura||'')); }
export function equipoDeProvisional(factura){ return esProvisional(factura) ? String(factura).split('-')[1] : null; }
// Números (no provisionales) que aparecen en más de una venta, del más reciente al más viejo
export function repetidas(ventas){
  const vistos={}, rep={};
  (ventas||[]).forEach(v=>{ const f=v && v.factura; if(!f || esProvisional(f)) return; if(vistos[f]) rep[f]=(rep[f]||1)+1; else vistos[f]=1; });
  return Object.keys(rep).sort((a,b)=>numeroDe(b)-numeroDe(a)).map(f=>({factura:f, veces:rep[f]}));
}
