import { jornadaDe } from './fechas.js';

// ============================================================
//  DOMINIO · Estadísticas de ventas
//  Agrupaciones por producto y por persona usando el ID (F15): antes se
//  agrupaba por nombre, así que renombrar un producto partía sus cifras y dos
//  productos con el mismo nombre se sumaban como uno.
// ============================================================

// Ítems vendidos por producto (prodId; las ventas viejas sin id, por nombre).
// Devuelve [[nombre, {qty, total}], …] (la forma de Object.entries). Se muestra el
// nombre de la venta más reciente; si dos productos distintos se llaman igual,
// el nombre lleva un número para no confundirlos.
export function vendidoPorProducto(ventas){
  const g={};
  const ordenadas=(ventas||[]).slice().sort((a,b)=>String(b.fecha||'').localeCompare(String(a.fecha||'')));
  ordenadas.forEach(v=>(v.items||[]).forEach(i=>{
    const k=i.prodId ? 'id:'+i.prodId : 'n:'+(i.nombre||'?');
    const x=g[k]||(g[k]={nombre:i.nombre||'?', qty:0, total:0});
    x.qty+=i.qty||0;
    x.total+=(i.precio||0)*(i.qty||0);
  }));
  const veces={};
  Object.values(g).forEach(x=>{ veces[x.nombre]=(veces[x.nombre]||0)+1; });
  const n={};
  return Object.values(g).map(x=>{
    let nombre=x.nombre;
    if(veces[nombre]>1){ n[nombre]=(n[nombre]||0)+1; nombre=nombre+' ('+n[nombre]+')'; }
    return [nombre, {qty:x.qty, total:x.total}];
  });
}

// Propinas por quien tomó el pedido (vendedorId; las ventas viejas, por nombre).
// Devuelve [[nombre, total], …] de mayor a menor.
export function propinasPorPersona(ventas){
  const g={};
  (ventas||[]).forEach(v=>{
    if(!(v.propina>0)) return;
    const k=v.vendedorId ? 'id:'+v.vendedorId : 'n:'+(v.vendedor||'—');
    const x=g[k]||(g[k]={nombre:v.vendedor||'—', total:0});
    x.total+=v.propina;
  });
  return Object.values(g).map(x=>[x.nombre, x.total]).sort((a,b)=>b[1]-a[1]);
}

// ¿Esta venta es de este domiciliario? Por id; las viejas (sin id), por nombre.
export function esDelDomiciliario(v, dom){
  if(!v || !dom) return false;
  return v.domiciliarioId ? v.domiciliarioId===dom.id : (v.domiciliario||'')===dom.nombre;
}

// R1: cifras de ventas de un negocio para el panel del super-admin. Las calcula
// cualquier equipo del negocio con sus ventas; como todos los equipos llegan al mismo
// valor, no se pisan entre sí. Montos con propina y domicilio (total), como el panel.
export const DIAS_RESUMEN=62;
// F21: lo que vendió el negocio en una venta = sus productos (subtotal, ya con descuento).
// Propina, recargo del datáfono y domicilio son de terceros y se muestran aparte.
// Ventas viejas sin subtotal: su total.
export function ventaDelNegocio(v){ return v ? (v.subtotal!=null ? v.subtotal : (v.total||0)) : 0; }
export function resumenVentas(ventas, hoyStr){
  const r={total:0, pagadas:0, dias:{}, meses:{}};
  const h=new Date((hoyStr||new Date().toISOString().slice(0,10))+'T00:00:00');
  h.setDate(h.getDate()-DIAS_RESUMEN);
  const p=x=>String(x).padStart(2,'0');
  const limite=h.getFullYear()+'-'+p(h.getMonth()+1)+'-'+p(h.getDate());
  (ventas||[]).forEach(v=>{
    if(!v || v.estado!=='pagada') return;
    const t=Math.round(ventaDelNegocio(v)), d=jornadaDe(v);
    r.total+=t; r.pagadas++;
    if(!d) return;
    if(d>=limite) r.dias[d]=(r.dias[d]||0)+t;
    const m=d.substring(0,7);
    r.meses[m]=(r.meses[m]||0)+t;
  });
  return r;
}
// Último día con ventas del resumen (actividad del negocio en el panel). null si no hay.
// Solo mira los días que guarda el resumen (DIAS_RESUMEN hacia atrás).
export function ultimoDiaConVentas(resumen){
  const dias=Object.keys((resumen&&resumen.dias)||{}).filter(d=>resumen.dias[d]>0).sort();
  return dias.length ? dias[dias.length-1] : null;
}
// Comparación sin depender del orden de las claves (Firebase las devuelve ordenadas)
// ni de los objetos vacíos (Firebase no los guarda: un negocio sin ventas no trae "dias").
export function mismoResumen(a, b){
  const canon=x=>JSON.stringify(x, (k,v)=>{
    if(!(v && typeof v==='object' && !Array.isArray(v))) return v;
    const ks=Object.keys(v).filter(kk=>!(v[kk] && typeof v[kk]==='object' && !Array.isArray(v[kk]) && !Object.keys(v[kk]).length)).sort();
    return ks.reduce((o,kk)=>{ o[kk]=v[kk]; return o; }, {});
  });
  return canon(a||null)===canon(b||null);
}

// ---------- Cambios a un pedido que pueden chocar entre equipos (D9) ----------
// Se aplican DENTRO de una transacción sobre la versión del servidor
// (Datos.transaccionRegistro): devuelven el pedido nuevo, o undefined si ya
// no se debe tocar (lo cobró, anuló o cambió otro equipo).
const r2=n=>Math.round((Number(n)||0)*100)/100;
// ¿Son los mismos productos? (Firebase devuelve las claves en otro orden: se compara campo por campo)
export function mismosItems(a, b){
  const norm=l=>(l||[]).map(i=>[i.prodId||'', r2(i.qty), r2(i.precio), i.obs||''].join('|'));
  const x=norm(a), y=norm(b);
  return x.length===y.length && x.every((k,i)=>k===y[i]);
}
// Suma productos a una cuenta abierta (no los reemplaza) y recalcula el total
export function agregarACuenta(cur, nuevos, opc){
  if(!cur || cur.estado!=='abierta') return undefined;
  opc=opc||{};
  const items=(cur.items||[]).map(i=>Object.assign({}, i));
  (nuevos||[]).forEach(n=>{
    const ya=items.find(i=>i.prodId===n.prodId && r2(i.precio)===r2(n.precio) && (i.obs||'')===(n.obs||''));
    if(ya) ya.qty+=n.qty; else items.push(Object.assign({}, n));
  });
  const bruto=items.reduce((a,i)=>a+i.precio*i.qty,0);
  const subtotal=Math.max(0, bruto-(cur.descuento||0));
  const x=Object.assign({}, cur, {items, subtotalBruto:bruto, subtotal,
    total:subtotal+(cur.valorDom||0)+(cur.propina||0)+(cur.recargo||0),
    agregadoPor:opc.quien||'', agregadoEn:opc.cuando||''});
  if(opc.obs) x.obs=(cur.obs?cur.obs+' · ':'')+opc.obs;
  if(opc.reabrirCocina && cur.estadoCocina && cur.estadoCocina!=='entregado') x.estadoCocina='pendiente';
  return x;
}
// Cobra un pedido solo si sigue sin cobrar y con los mismos productos que vio quien cobra
export function cobrarSiSigueIgual(cur, itemsVistos, cambios){
  if(!cur || cur.estado==='pagada' || cur.estado==='anulada') return undefined;
  if(itemsVistos && !mismosItems(cur.items, itemsVistos)) return undefined;
  const x=Object.assign({}, cur, cambios, {estado:'pagada'});
  if(cambios.exigeVerificar && x.pagos.banco>0){ if(cur.bancoVerificado!==true) x.bancoVerificado=false; }
  else if(!(x.pagos.banco>0)) delete x.bancoVerificado;
  delete x.exigeVerificar;
  return x;
}
// Anula solo si el pedido sigue en el estado que vio quien anula
export function anularSiSigueIgual(cur, estadoVisto, cambios){
  if(!cur || cur.estado==='anulada' || cur.estado!==estadoVisto) return undefined;
  return Object.assign({}, cur, cambios, {estado:'anulada'});
}
// Guarda la edición solo si nadie cambió el pedido mientras se editaba
export function editarSiSigueIgual(cur, estadoVisto, itemsVistos, venta){
  if(!cur || cur.estado!==estadoVisto || !mismosItems(cur.items, itemsVistos)) return undefined;
  return venta;
}
