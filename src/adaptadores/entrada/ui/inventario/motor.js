// ============================================================
//  INTERFAZ · Motor de inventario
//  Único camino para mover existencias; lotes FEFO y alertas de vencimiento.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/06-inventory-recipes/06-inventory-recipes.md
// ============================================================
import { STATE, escapeHtml, now } from '../nucleo/estado.js';
import { BOTON } from '../nucleo/textos.js';
import { usaInventario } from '../nucleo/permisos.js';
import { abrirModal, cerrarModal, cuandoNoHayaVentana, toast } from '../nucleo/componentes.js';
import { sonidoAlerta } from '../nucleo/sonidos.js';


// ============================================================
//  LOTES Y FECHAS DE VENCIMIENTO (FEFO)
//  Un producto puede tener p.lotes = [{id, cantidad, vence:'YYYY-MM-DD', ingresado, motivo}]
//  El p.stock total se mantiene igual a la suma de los lotes.
//  Al descontar se saca primero del lote que vence antes (First Expired, First Out).
// ============================================================
// Reingresa 'cant' unidades: las suma al lote más próximo a vencer (el que probablemente se usó)
export function reingresarALotes(p, cant){ return Dominio.inventario.reingresarALotes(p, cant, uid(), now()); }
// Umbral de aviso configurable por negocio (por defecto 7 días)
export function diasAvisoVence(){ return Dominio.negocio.diasAvisoVence(STATE.negocio); }
// Lista de {producto, lote, dias} de lotes por vencer o vencidos en TODOS los productos
export function lotesAlerta(){ return Dominio.inventario.lotesConAlerta(misDatos('productos'), diasAvisoVence()); }
// Aviso al entrar a inventario si hay lotes por vencer/vencidos (una vez por render)
export function avisarVencimientos(){
  const neg=STATE.negocio;
  if(!usaInventario(neg)) return;           // también si el negocio apagó el inventario (F12)
  if(neg.alertaVence===false) return;
  const al=lotesAlerta();
  if(!al.length) return;
  const vencidos=al.filter(x=>x.dias<0);
  const proximos=al.filter(x=>x.dias>=0);
  if(vencidos.length) sonidoAlerta();
  const cuerpo=`
    ${vencidos.length?`<div class="alerta radio-10 p-12-15 mb-10">
      <strong class="rojo fs-15">⛔ YA VENCIERON (${vencidos.length})</strong>
      <p class="mt-6 lh-1_8">${vencidos.map(x=>escapeHtml(x.producto.nombre)+' · lote de '+x.lote.cantidad+' · venció '+fmtSoloFecha(x.lote.vence)+' (hace '+Math.abs(x.dias)+' día'+(Math.abs(x.dias)===1?'':'s')+')').join('<br>')}</p>
      <p class="nota mt-8">Retíralos del inventario para no venderlos.</p>
    </div>`:''}
    ${proximos.length?`<div class="tarjeta-pend radio-10 p-12-15">
      <strong class="oro fs-15">⚠️ POR VENCER (${proximos.length})</strong>
      <p class="mt-6 lh-1_8">${proximos.map(x=>escapeHtml(x.producto.nombre)+' · lote de '+x.lote.cantidad+' · vence '+fmtSoloFecha(x.lote.vence)+' ('+(x.dias===0?'hoy':'en '+x.dias+' día'+(x.dias===1?'':'s'))+')').join('<br>')}</p>
      <p class="nota mt-8">Prioriza vender estos primero (el sistema ya los saca primero al vender).</p>
    </div>`:''}`;
  abrirModal({titulo:'Alertas de vencimiento', textoBoton:BOTON.entendido, campos:[],
    extraHTML:cuerpo, onGuardar:()=>{ cerrarModal(); }});
}
export function fmtSoloFecha(f){
  if(!f) return '—';
  try{ return new Date(f+'T00:00:00').toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'}); }
  catch(e){ return f; }
}

// ============================================================
//  MOTOR DE INVENTARIO
//  Un solo camino para TODO lo que mueve existencias: vender, anular,
//  editar un pedido, mermas y ajustes. Así el inventario nunca queda
//  descuadrado por un flujo que se olvidó de descontar o devolver.
// ============================================================
// Cuántas unidades reales consume una lista de items (expande combos y recetas)
export function requerimientos(items){ return Dominio.inventario.requerimientos(items, misDatos('productos'), !!(STATE.negocio&&STATE.negocio.usaRecetas)); }
// Aplica un movimiento de inventario. signo -1 = sale del stock, +1 = entra.
// registra=true deja constancia en Movimientos (para ediciones, mermas y ajustes).
// forzar=true: aunque el negocio haya apagado el inventario (devolver lo que SÍ se descontó)
export function moverInventario(req, signo, motivo, registra, forzar){
  if(!usaInventario() && !forzar) return [];
  const productos=misDatos('productos');
  const insumos=misDatos('insumos');
  const nuevosMovs=[];
  const agotados=[];
  Object.keys(req.prod||{}).forEach(id=>{
    const cant=req.prod[id]*signo;          // negativo = sale
    const p=productos.find(x=>x.id===id);
    if(!p || p.stock==null || !cant) return;
    const antes=p.stock||0;
    const idLote=uid(), cuando=now();   // fuera de la función: la transacción puede repetirla
    cambiarStock('productos', id, x=>Dominio.inventario.aplicarCambioStock(x, cant, idLote, cuando));
    if(antes>0 && p.stock<=0) agotados.push(p.nombre);
    if(registra) nuevosMovs.push({id:uid(), productoId:id, nombre:p.nombre, tipo:cant<0?'salida':'entrada',
      cantidad:Math.abs(cant), motivo:motivo||'Ajuste', por:STATE.user.nombre, fecha:now()});
  });
  Object.keys(req.ins||{}).forEach(id=>{
    const cant=req.ins[id]*signo;
    const x=insumos.find(y=>y.id===id);
    if(!x || !cant) return;
    const antes=x.stock||0;
    cambiarStock('insumos', id, y=>Dominio.inventario.aplicarCambioStock(y, cant));
    if(antes>0 && x.stock<=0) agotados.push(x.nombre);
    if(registra) nuevosMovs.push({id:uid(), insumoId:id, nombre:x.nombre, tipo:cant<0?'salida-insumo':'entrada-insumo',
      cantidad:Math.abs(cant), motivo:motivo||'Ajuste', por:STATE.user.nombre, fecha:now()});
  });
  if(nuevosMovs.length) registrarMovimientos(nuevosMovs);
  return Array.from(new Set(agotados));
}
// Agrega movimientos de inventario (solo sube los nuevos)
export function registrarMovimientos(lista){
  guardarMisDatos('movimientos', lista);
}
// ¿Alcanza el inventario para este cambio? Devuelve la lista de lo que falta.
export function faltantesPara(req){
  if(!usaInventario()) return [];
  return Dominio.inventario.faltantesPara(req, misDatos('productos'), misDatos('insumos'))
    .map(f=>f.nombre+' (piden '+f.pide+', hay '+f.hay+')');
}
// ---------- Las 3 operaciones que usan las ventas ----------
// Descuenta el inventario de una venta y deja la marca de que YA se descontó
export function descontarStock(venta){
  if(!usaInventario() || !venta) return;
  if(venta.stockAplicado===true) return;                 // nunca descontar dos veces
  const agot=moverInventario(requerimientos(venta.items), -1, 'Venta '+(venta.factura||''), false);
  venta.stockAplicado=true;
  if(agot.length) toast('⚠️ Se agotó: '+agot.join(', ')+'. Revisa el inventario.','error');
}
// Devuelve el inventario de una venta (anular, eliminar).
// Queda REGISTRADO en Movimientos: es la forma de comprobar que la mercancía volvió.
// Si la venta SÍ descontó (stockAplicado), se devuelve aunque después se haya apagado el inventario:
// antes no volvía nada y la venta quedaba marcada como descontada para siempre.
export function devolverStock(venta, motivo){
  if(!venta || venta.stockAplicado===false) return;      // ya se había devuelto
  const descontada=venta.stockAplicado===true;
  if(!usaInventario() && !descontada) return;
  moverInventario(requerimientos(venta.items), +1, motivo||('Devolución · '+(venta.factura||'')), true, descontada);
  venta.stockAplicado=false;
}
// Ajusta el inventario cuando se EDITA un pedido que ya había descontado
export function ajustarStockPorEdicion(itemsAntes, itemsDespues, factura){
  if(!usaInventario()) return;
  const d=difRequerimientos(requerimientos(itemsAntes), requerimientos(itemsDespues));
  if(!Object.keys(d.prod).length && !Object.keys(d.ins).length) return;
  const agot=moverInventario(d, -1, 'Edición del pedido '+(factura||''), true);
  if(agot.length) toast('⚠️ Se agotó: '+agot.join(', '),'error');
}
export function avisarStockBajo(venta){
  const neg=STATE.negocio;
  if((neg.funciones||[]).indexOf('inventario')<0) return;
  if(neg.alertaStock===false) return;
  const productos=misDatos('productos');
  const insumos=neg.usaRecetas?misDatos('insumos'):[];
  const agotado=[], bajo=[];
  const revisar=(nombre,stock,min,unidad)=>{
    if(stock<=0) agotado.push(nombre);
    else if(stock<=(min||0)) bajo.push(nombre+' ('+stock+(unidad?' '+unidad:'')+')');
  };
  (venta.items||[]).forEach(item=>{
    const p=productos.find(x=>x.id===item.prodId);
    if(!p) return;
    if(p.stock!=null) revisar(p.nombre, p.stock, p.stockMin);
    if(neg.usaRecetas && p.receta){
      p.receta.forEach(r=>{ const ins=insumos.find(x=>x.id===r.insumoId); if(ins) revisar(ins.nombre, ins.stock||0, ins.stockMin, ins.unidad); });
    }
  });
  // Quitar repetidos
  const ag=Array.from(new Set(agotado)), bj=Array.from(new Set(bajo));
  if(!ag.length && !bj.length) return;
  sonidoAlerta();
  // ALERTA REAL: modal que obliga a enterarse, no un aviso que se va solo
  const cuerpo=`
    ${ag.length?`<div class="alerta radio-10 p-12-15 mb-10">
      <strong class="rojo fs-15">⛔ SE AGOTARON</strong>
      <p class="mt-6 lh-1_7">${ag.map(x=>escapeHtml(x)).join('<br>')}</p>
      <p class="nota mt-8">No se podrán vender hasta que registres una entrada en ${neg.usaRecetas?'Insumos':'Inventario'}.</p>
    </div>`:''}
    ${bj.length?`<div class="tarjeta-pend radio-10 p-12-15">
      <strong class="oro fs-15">⚠️ QUEDAN POCOS</strong>
      <p class="mt-6 lh-1_7">${bj.map(x=>escapeHtml(x)).join('<br>')}</p>
    </div>`:''}`;
  // F27: espera a que se cierre la ventana que esté abierta (p. ej. "¿Imprimir factura?")
  cuandoNoHayaVentana(()=>abrirModal({titulo:'🔔 Alerta de inventario', textoBoton:BOTON.entendido, campos:[],
      extraHTML:cuerpo, onGuardar:()=>cerrarModal()}), 700);
}
