// ============================================================
//  DOMINIO · Inventario: lotes (FEFO), combos y requerimientos
//  Un producto puede tener p.lotes=[{id, cantidad, vence:'AAAA-MM-DD', ingresado, motivo}].
//  p.stock es igual a la suma de los lotes. Al descontar se saca primero
//  del lote que vence antes (First Expired, First Out).
// ============================================================
import { diasHasta } from './fechas.js';

// ---------- Lotes ----------
// Sin fecha van al final; los que vencen antes, primero
export function ordenarLotes(lotes){
  return (lotes||[]).slice().sort((a,b)=>{
    if(!a.vence && !b.vence) return 0;
    if(!a.vence) return 1;
    if(!b.vence) return -1;
    return a.vence.localeCompare(b.vence);
  });
}
export function sumaLotes(p){ return (p.lotes||[]).reduce((a,l)=>a+(l.cantidad||0),0); }
// Descuenta 'cant' unidades sacando de los lotes más próximos a vencer
export function descontarDeLotes(p, cant){
  if(!p.lotes || !p.lotes.length) return;
  let resta=cant;
  for(const l of ordenarLotes(p.lotes)){
    if(resta<=0) break;
    const usar=Math.min(l.cantidad||0, resta);
    l.cantidad=(l.cantidad||0)-usar;
    resta-=usar;
  }
  p.lotes=p.lotes.filter(l=>(l.cantidad||0)>0);
}
// Reingresa 'cant' unidades al lote más próximo a vencer (o crea uno sin fecha)
export function reingresarALotes(p, cant, nuevoId, ahora){
  if(!p.lotes || !p.lotes.length){
    p.lotes=[{id:nuevoId, cantidad:cant, vence:'', ingresado:ahora, motivo:'Devolución'}];
    return;
  }
  const orden=ordenarLotes(p.lotes);
  orden[0].cantidad=(orden[0].cantidad||0)+cant;
}
// Aplica un cambio de existencias a un registro (producto o insumo).
// cant negativo = sale. Nunca deja stock negativo. Respeta lotes FEFO.
// Se puede aplicar varias veces sobre copias distintas (transacciones).
export function aplicarCambioStock(reg, cant, nuevoId, ahora){
  if((reg.lotes||[]).length){
    if(cant<0) descontarDeLotes(reg, Math.abs(cant)); else reingresarALotes(reg, cant, nuevoId, ahora);
  }
  reg.stock=Math.max(0, (reg.stock||0)+cant);
  return reg;
}
// Lotes por vencer o vencidos en todos los productos: [{producto, lote, dias}]
export function lotesConAlerta(productos, umbralDias, hoyStr){
  const res=[];
  (productos||[]).forEach(p=>{
    (p.lotes||[]).forEach(l=>{
      if(!l.vence || (l.cantidad||0)<=0) return;
      const d=diasHasta(l.vence, hoyStr);
      if(d!=null && d<=umbralDias) res.push({producto:p, lote:l, dias:d});
    });
  });
  return res.sort((a,b)=>a.dias-b.dias);
}

// ---------- Combos ----------
export function esCombo(p){ return !!(p && p.esCombo && (p.componentes||[]).length); }
// ¿Cuántos combos alcanzan con el stock? null = ningún componente limita
export function disponiblesCombo(p, productos){
  let min=null;
  (p.componentes||[]).forEach(cp=>{
    const base=(productos||[]).find(x=>x.id===cp.prodId);
    if(!base){ min=0; return; }
    if(base.stock==null) return;
    const alcanza=Math.floor((base.stock||0)/(cp.cantidad||1));
    min=(min===null)?alcanza:Math.min(min,alcanza);
  });
  return min===null?null:Math.max(0,min);
}
// Lo que costaría comprando cada componente por separado
export function precioSuelto(p, productos){
  return (p.componentes||[]).reduce((a,cp)=>{
    const base=(productos||[]).find(x=>x.id===cp.prodId);
    return a+(base?(base.precio||0):0)*(cp.cantidad||1);
  },0);
}
// Unidades de cada producto que pide un carrito (sueltos + dentro de combos)
export function unidadesPedidas(carrito, productos, extraProdId, extraQty){
  const pedido={};
  const sumar=(prodId,qty)=>{
    const p=(productos||[]).find(x=>x.id===prodId); if(!p) return;
    if(esCombo(p)) (p.componentes||[]).forEach(cp=>{ pedido[cp.prodId]=(pedido[cp.prodId]||0)+(cp.cantidad||1)*qty; });
    else pedido[prodId]=(pedido[prodId]||0)+qty;
  };
  (carrito||[]).forEach(i=>sumar(i.prodId,i.qty));
  if(extraProdId) sumar(extraProdId, extraQty||1);
  return pedido;
}
// ¿Se puede agregar uno más de prodId al carrito? Devuelve [{nombre, hay}] de lo que no alcanza.
export function faltantesParaAgregar(carrito, prodId, productos){
  const pedido=unidadesPedidas(carrito, productos, prodId, 1);
  const faltan=[];
  Object.keys(pedido).forEach(id=>{
    const p=(productos||[]).find(x=>x.id===id);
    if(!p || p.stock==null) return;
    if(pedido[id]>(p.stock||0)) faltan.push({nombre:p.nombre, hay:p.stock||0});
  });
  return faltan;
}

// ---------- Requerimientos (motor de inventario) ----------
// Unidades reales que consume una lista de ítems: {prod:{id:cant}, ins:{id:cant}}.
// Expande combos (a sus componentes) y recetas (a sus insumos).
export function requerimientos(items, productos, usaRecetas){
  const res={prod:{}, ins:{}};
  (items||[]).forEach(it=>{
    const p=(productos||[]).find(x=>x.id===it.prodId);
    if(!p) return;
    const qty=it.qty||0;
    if(esCombo(p)){
      (p.componentes||[]).forEach(cp=>{
        const base=productos.find(x=>x.id===cp.prodId);
        if(base && base.stock!=null) res.prod[cp.prodId]=(res.prod[cp.prodId]||0)+(cp.cantidad||1)*qty;
      });
      return;
    }
    if(usaRecetas && (p.receta||[]).length){
      p.receta.forEach(r=>{ res.ins[r.insumoId]=(res.ins[r.insumoId]||0)+(r.cantidad||0)*qty; });
    }
    if(p.stock!=null) res.prod[it.prodId]=(res.prod[it.prodId]||0)+qty;
  });
  return res;
}
// Cuánto cambia el inventario al pasar de A a B (+ = consume más)
export function difRequerimientos(antes, despues){
  const d={prod:{}, ins:{}};
  ['prod','ins'].forEach(k=>{
    const ids=new Set(Object.keys(antes[k]||{}).concat(Object.keys(despues[k]||{})));
    ids.forEach(id=>{
      const v=(despues[k][id]||0)-(antes[k][id]||0);
      if(v!==0) d[k][id]=v;
    });
  });
  return d;
}
// ¿Alcanza el inventario? Devuelve [{nombre, pide, hay}] de lo que falta.
export function faltantesPara(req, productos, insumos){
  const faltan=[];
  Object.keys(req.prod||{}).forEach(id=>{
    if(req.prod[id]<=0) return;
    const p=(productos||[]).find(x=>x.id===id);
    if(!p || p.stock==null) return;
    if(req.prod[id]>(p.stock||0)) faltan.push({nombre:p.nombre, pide:req.prod[id], hay:p.stock||0});
  });
  Object.keys(req.ins||{}).forEach(id=>{
    if(req.ins[id]<=0) return;
    const x=(insumos||[]).find(y=>y.id===id);
    if(!x) return;
    if(req.ins[id]>(x.stock||0)) faltan.push({nombre:x.nombre, pide:req.ins[id], hay:x.stock||0});
  });
  return faltan;
}

// Conteo físico: contado − sistema. null si todavía no se contó (vacío o no numérico).
export function diferenciaConteo(it){
  if(!it || it.contado==='' || it.contado==null || isNaN(it.contado)) return null;
  return it.contado - it.sistema;
}

// F14: el inventario se valora a COSTO. Si el producto no tiene costo cargado se usa
// el precio de venta (y se informa cuántos quedaron así, para no confundir).
export function costoUnitario(p){ return (p && p.costo>0) ? p.costo : ((p && p.precio) || 0); }
export function valorInventario(productos){
  const r={valor:0, sinCosto:0, conCosto:0};
  (productos||[]).forEach(p=>{
    if(!p || p.stock==null) return;
    r.valor+=(p.stock||0)*costoUnitario(p);
    if(p.costo>0) r.conCosto++; else r.sinCosto++;
  });
  return r;
}

// ---------- Foto del producto ----------
// Se guarda en el producto como data: URL (JPEG reducido, como el logo del negocio).
// Solo se acepta una imagen de verdad: cualquier otro texto no se dibuja nunca en el HTML.
export const FOTO_MAX_PX=200;
export const FOTO_MAX_BYTES=60000;      // ~45 KB de imagen: la tabla de productos se sincroniza a todos los equipos
export function imagenValida(s){ return esImagenData(s, FOTO_MAX_BYTES); }
// Una imagen guardada como texto: data: de PNG, JPEG o WebP en base64 y de tamaño acotado.
// Sin comillas, espacios ni "<": nunca puede salirse de un atributo src (S8).
// Las reglas de la base validan el logo con la misma expresión (database.rules*.json).
export const IMAGEN_DATA=/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
export function esImagenData(s, max){ return typeof s==='string' && s.length<=max && IMAGEN_DATA.test(s); }

// Cambio de los productos apartados de una cita: {sacar:{prodId:cant}, devolver:{prodId:cant}}
// (solo la diferencia, para no devolver y volver a sacar todo)
export function difApartados(antes, despues){
  const suma=l=>{ const o={}; (l||[]).forEach(x=>{ if(x && x.prodId && x.cantidad>0) o[x.prodId]=(o[x.prodId]||0)+x.cantidad; }); return o; };
  const a=suma(antes), d=suma(despues), sacar={}, devolver={};
  new Set(Object.keys(a).concat(Object.keys(d))).forEach(id=>{
    const k=(d[id]||0)-(a[id]||0);
    if(k>0) sacar[id]=k; else if(k<0) devolver[id]=-k;
  });
  return {sacar, devolver};
}

// Una cantidad de inventario (stock, mínimo, contado, costo): número finito y no negativo
export function cantidadValida(n){ return typeof n==='number' && isFinite(n) && n>=0; }
// ¿Otro producto ya usa este código de barras? (el escáner tomaría el primero que encuentre)
export function codigoRepetido(productos, codigo, idPropio){
  const c=String(codigo||'').trim(); if(!c) return null;
  return (productos||[]).find(p=>p && p.id!==idPropio && String(p.codBarras||'').trim()===c) || null;
}
