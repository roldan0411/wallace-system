// ============================================================
//  DOMINIO · Caja
//  Una sola fórmula del efectivo esperado para toda la app.
// ============================================================
import { efectivoRecibido, tercerosNoEfectivo } from './pagos.js';

export const SUCURSAL_PRINCIPAL='principal';

// La caja abierta de una sucursal dentro del valor guardado de caja_actual.
// Sin sucursales es la forma de siempre: [caja], {0:caja}, la caja sola o vacío
// (= la caja de la sucursal principal). Con varias sedes abiertas a la vez (F1):
// {cajas:{<sucursal>: caja}}.
export function cajaDe(v, sucId){
  if(!v) return null;
  const suc=sucId||SUCURSAL_PRINCIPAL;
  if(v.cajas){ const c=v.cajas[suc]; return (c && c.id) ? c : null; }
  if(suc!==SUCURSAL_PRINCIPAL) return null;
  const c=Array.isArray(v)?v[0]:(v[0]!==undefined?v[0]:v);
  return (c && c.id) ? c : null;
}
// Todas las cajas abiertas (de todas las sucursales)
export function cajasDe(v){
  if(!v) return [];
  if(v.cajas) return Object.keys(v.cajas).map(k=>v.cajas[k]).filter(c=>c && c.id);
  const c=cajaDe(v); return c ? [c] : [];
}
// Sucursales que tienen caja abierta
export function sucursalesConCaja(v){
  if(!v) return [];
  if(v.cajas) return Object.keys(v.cajas).filter(k=>v.cajas[k] && v.cajas[k].id);
  return cajaDe(v) ? [SUCURSAL_PRINCIPAL] : [];
}
// Valor nuevo de caja_actual con la caja de una sucursal puesta (o quitada con null).
// Si solo queda la principal se vuelve a la forma de siempre ([caja]).
export function conCaja(v, sucId, caja){
  const suc=sucId||SUCURSAL_PRINCIPAL, cajas={};
  if(v && v.cajas) Object.keys(v.cajas).forEach(k=>{ if(v.cajas[k] && v.cajas[k].id) cajas[k]=v.cajas[k]; });
  else { const vieja=cajaDe(v); if(vieja) cajas[SUCURSAL_PRINCIPAL]=vieja; }
  if(caja) cajas[suc]=caja; else delete cajas[suc];
  const ks=Object.keys(cajas);
  if(!ks.length) return null;
  if(ks.length===1 && ks[0]===SUCURSAL_PRINCIPAL) return [cajas[SUCURSAL_PRINCIPAL]];
  return {cajas};
}
// ¿Esta venta o cierre es de esta sucursal? (lo que no tiene sucursal es de la principal)
export function deSucursal(x, sucId){
  return ((x && x.sucursalId) || SUCURSAL_PRINCIPAL)===(sucId || SUCURSAL_PRINCIPAL);
}
// Totales de los movimientos de una caja (gasto, retiro, entrada)
export function totalesMovimientos(caja){
  const movs=(caja&&caja.movimientos)||[];
  const suma=t=>movs.filter(m=>m.tipo===t).reduce((a,m)=>a+(m.valor||0),0);
  return {gastos:suma('gasto'), retiros:suma('retiro'), entradas:suma('entrada')};
}
// Efectivo que DEBERÍA haber en el cajón:
// base + efectivo recibido + entradas − gastos − retiros − terceros pagados por banco
export function efectivoEsperado(caja, ventas){
  const t=totalesMovimientos(caja);
  return Math.round(((caja&&caja.base)||0) + efectivoRecibido(ventas) + t.entradas - t.gastos - t.retiros - tercerosNoEfectivo(ventas));
}
// Resultado del conteo al cerrar: diferencia y retiro del jefe.
// Devuelve null si la base que se deja es mayor a lo contado.
export function liquidarCierre(esperado, contado, baseManana){
  if(baseManana>contado) return null;
  return {diferencia:contado-esperado, retiroJefe:contado-baseManana};
}

// Pago al domiciliario de los domicilios que entraron por banco: sale del cajón como un
// retiro marcado con pagoDomi (la clave del domiciliario en el cuadre). Cuánto ya se le pagó
// en esta caja, para no pagarle dos veces (flujo a medias de la 3.ª revisión).
export function pagadoADomiciliario(caja, clave){
  return ((caja && caja.movimientos)||[]).filter(m=>m && m.tipo==='retiro' && m.pagoDomi===clave)
    .reduce((a,m)=>a+(Number(m.valor)||0),0);
}
