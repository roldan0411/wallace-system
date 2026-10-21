// ============================================================
//  DOMINIO · Conceptos de gasto
//  Los conceptos se agregan UNA vez y después solo se seleccionan. Antes cada
//  quien los escribía distinto ("arriendo", "Arriendo local") y el informe se
//  llenaba de líneas repetidas. Documentation/09-expenses-accounting.
// ============================================================

export const CONCEPTOS_BASE=['Arriendo','Servicios públicos','Recibo de luz','Recibo de agua','Recibo de gas',
  'Internet / Teléfono','Mercancía / Proveedores','Insumos','Nómina','Mantenimiento','Impuestos',
  'Publicidad','Transporte','Aseo','Otros'];

// Espacios de más fuera
export function normConcepto(x){ return String(x||'').trim().replace(/\s+/g,' '); }
// Para comparar: sin mayúsculas ni tildes
export function claveConcepto(x){ return normConcepto(x).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,''); }

// Lista sin repetidos (por mayúsculas, tildes o espacios), en orden alfabético
export function conceptosUnicos(lista){
  const out=[];
  (lista||[]).forEach(c=>{ const n=normConcepto(c); if(n && !out.some(x=>claveConcepto(x)===claveConcepto(n))) out.push(n); });
  return out.sort((a,b)=>a.localeCompare(b,'es'));
}

// Suma un monto en obj[concepto] sin duplicar por mayúsculas, tildes o espacios.
// Se muestra con el nombre oficial del catálogo si existe, no como lo escribieron.
export function acumularConcepto(obj, nombre, monto, oficiales){
  let n=normConcepto(nombre)||'Otros';
  const oficial=(oficiales||[]).find(x=>claveConcepto(x)===claveConcepto(n));
  if(oficial) n=oficial;
  const ex=Object.keys(obj).find(x=>claveConcepto(x)===claveConcepto(n))||n;
  obj[ex]=(obj[ex]||0)+(monto||0);
  return obj;
}

// Un gasto de caja queda en DOS lados: el movimiento del cajón y una copia en
// Gastos del Negocio (origen 'caja', movId = id del movimiento). El informe suma
// los movimientos; esto devuelve las copias cuyo movimiento NO está entre ellos
// (cajas viejas, cierres sin detalle), para sumarlas sin contar nada dos veces.
// Datos viejos sin movId: se cruzan por concepto y valor, uno a uno.
export function copiasSinMovimiento(copias, movimientos){
  const ids={}, firmas={};
  const firma=x=>claveConcepto(x.concepto||'Otros')+'|'+(Number(x.valor)||0);
  (movimientos||[]).forEach(m=>{
    if(!m || m.tipo!=='gasto') return;
    if(m.id) ids[m.id]=1;
    firmas[firma(m)]=(firmas[firma(m)]||0)+1;
  });
  return (copias||[]).filter(g=>{
    if(!g || g.origen!=='caja') return false;
    if(g.movId) return !ids[g.movId];
    const f=firma(g);
    if(firmas[f]){ firmas[f]--; return false; }
    return true;
  });
}
