// ============================================================
//  DOMINIO · Pagos (pago dividido)
//  El cliente puede pagar con varias formas a la vez. Cada venta guarda cuánto
//  entró por cada forma en v.pagos; de ahí salen caja, reportes y contable.
// ============================================================

export const METODOS=['efectivo','banco','tarjeta'];

// Pagos por método de una venta. Ventas viejas: todo entró por su único método.
export function pagosDe(v){
  const p=v&&v.pagos;
  if(p && ((p.efectivo||0)+(p.banco||0)+(p.tarjeta||0))>0){
    return {efectivo:p.efectivo||0, banco:p.banco||0, tarjeta:p.tarjeta||0};
  }
  const o={efectivo:0,banco:0,tarjeta:0};
  const t=(v&&v.total)||0;
  const m=(v&&v.metodo)||'efectivo';
  if(o[m]!==undefined) o[m]=t; else o.efectivo=t;
  return o;
}
// Reparte un monto (la comida, la propina…) según cómo pagó el cliente
export function reparte(v, monto){
  monto=monto||0;
  const p=pagosDe(v);
  const tot=(p.efectivo+p.banco+p.tarjeta);
  if(!tot) return {efectivo:monto, banco:0, tarjeta:0};
  return {efectivo:monto*p.efectivo/tot, banco:monto*p.banco/tot, tarjeta:monto*p.tarjeta/tot};
}
// 'efectivo' | 'banco' | 'tarjeta' | 'mixto'
export function metodoPrincipal(p){
  const usados=Object.keys(p).filter(k=>p[k]>0);
  return usados.length<=1 ? (usados[0]||'efectivo') : 'mixto';
}
// Nombre corto del método de una venta pagada ('Mixto' si usó varios)
export function metodoResumen(v){
  if(!v || v.estado!=='pagada') return '—';
  const p=pagosDe(v);
  const usados=Object.keys(p).filter(k=>p[k]>0);
  if(usados.length<=1) return usados[0]||(v.metodo||'—');
  return 'Mixto';
}
// Suma por método de un monto repartido, para toda una lista de ventas
export function sumaPorMetodo(ventas, fnMonto){
  const acc={efectivo:0,banco:0,tarjeta:0};
  (ventas||[]).forEach(v=>{
    const r=reparte(v, fnMonto(v));
    acc.efectivo+=r.efectivo; acc.banco+=r.banco; acc.tarjeta+=r.tarjeta;
  });
  acc.efectivo=Math.round(acc.efectivo); acc.banco=Math.round(acc.banco); acc.tarjeta=Math.round(acc.tarjeta);
  return acc;
}
// Efectivo que realmente entró al cajón por las ventas
export function efectivoRecibido(ventas){
  return Math.round((ventas||[]).reduce((a,v)=>a+pagosDe(v).efectivo,0));
}
// Propinas y domicilios que NO entraron en efectivo pero se le pagan en
// efectivo a su dueño (mesero o domiciliario): salen del cajón.
export function tercerosNoEfectivo(ventas){
  return Math.round((ventas||[]).reduce((a,v)=>{
    const r=reparte(v,(v.propina||0)+(v.valorDom||0));
    return a+r.banco+r.tarjeta;
  },0));
}
// ¿Transferencia marcada como pendiente de verificar?
export function bancoPendiente(v){
  return !!(v && v.estado==='pagada' && v.bancoVerificado===false && pagosDe(v).banco>0);
}
// Valida un cobro. total: lo que hay que cobrar; pagos: lo que entregó el cliente.
// Devuelve {ok, error?, faltan?, cambio, pagos (ya sin el cambio)}.
// El exceso es CAMBIO y solo puede salir del efectivo.
// S9: un monto de dinero es un número finito y no negativo. Un efectivo de -50.000 con
// +100.000 por banco sumaba lo mismo y bajaba lo que la caja espera (el cierre cuadraba).
export function montoValido(n){ return typeof n==='number' && isFinite(n) && n>=0; }
export function pagosValidos(p){ return !!p && ['efectivo','banco','tarjeta'].every(k=>montoValido(Number(p[k]||0))); }
export function liquidarCobro(total, pagos){
  const p={efectivo:pagos.efectivo||0, banco:pagos.banco||0, tarjeta:pagos.tarjeta||0};
  const suma=p.efectivo+p.banco+p.tarjeta;
  if(!pagosValidos(p)) return {ok:false, error:'negativo'};
  if(suma<=0) return {ok:false, error:'sin_pago'};
  if(Math.abs(suma-total)>0.5 && suma<total) return {ok:false, error:'faltan', faltan:total-suma};
  let cambio=0;
  if(suma>total){
    cambio=suma-total;
    if(p.efectivo<cambio) return {ok:false, error:'cambio_sin_efectivo'};
    p.efectivo-=cambio;
  }
  return {ok:true, cambio:Math.round(cambio),
    pagos:{efectivo:Math.round(p.efectivo), banco:Math.round(p.banco), tarjeta:Math.round(p.tarjeta)}};
}

// Porcentaje entre 0 y 100 (p. ej. el del datáfono)
export function porcentajeValido(n){ return montoValido(n) && n<=100; }
