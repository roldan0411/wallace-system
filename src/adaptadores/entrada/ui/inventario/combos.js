// ============================================================
//  INTERFAZ · Combos
//  Combos armados con productos del inventario.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/06-inventory-recipes/06-inventory-recipes.md
// ============================================================
import { STATE, escapeHtml, fijarEscribiendo, fmtMoney, now } from '../nucleo/estado.js';
import { BOTON, MSJ } from '../nucleo/textos.js';
import { exigirEscritura, tienePermiso } from '../nucleo/permisos.js';
import { abrirModal, cerrarModal, fotoProducto, ic, pProd, pProds, toast } from '../nucleo/componentes.js';
import { render } from '../nucleo/navegacion.js';
import { logAudit } from '../usuarios/auditoria.js';
import { _carrito } from '../ventas/nueva-venta.js';



// ============================================================
//  MENÚ / COMBOS
//  Un combo se arma con productos que YA están en el inventario.
//  Ejemplo: Six Pack = 6 Poker en lata · Cubetazo = 10 cervezas.
//  Se vende a su propio precio y al cobrarlo se descuentan las unidades
//  reales del inventario. Aparece solo en Nueva Venta junto a lo demás.
// ============================================================
// ¿Cuántos combos alcanzan con el stock que hay?
export function disponiblesCombo(p, productos){ return Dominio.inventario.disponiblesCombo(p, productos||misDatos('productos')); }
// ¿Se puede agregar uno más sin pasarse del stock real?
export function faltantesParaAgregar(prodId){
  return Dominio.inventario.faltantesParaAgregar(_carrito, prodId, misDatos('productos'))
    .map(f=>f.nombre+(f.hay<=0?' (agotado)':' (solo quedan '+f.hay+')'));
}
// Lo que costaría comprando cada cosa por separado (para mostrar el ahorro)
export function precioSuelto(p, productos){ return Dominio.inventario.precioSuelto(p, productos||misDatos('productos')); }

export let _comboTmp=[];      // componentes que se están armando en el modal
export let _comboBusca='';

export function combos(){
  fijarEscribiendo(false);
  const neg=STATE.negocio;
  const productos=misDatos('productos');
  const sueltos=productos.filter(p=>!esCombo(p));
  let lista=productos.filter(esCombo);
  if(_comboBusca){ const q=_comboBusca.toLowerCase(); lista=lista.filter(p=>(p.nombre||'').toLowerCase().includes(q)); }
  const puede=tienePermiso('editarprod');
  if(!sueltos.length){
    return `<div class="tarjeta centro-msg"><div class="msg-ico">${ic('box')}</div>
      <div class="t-tit centrado">Primero necesitas ${pProds()}</div>
      <p class="gris">Los combos se arman con lo que tengas en el inventario. Agrega primero los ${pProds()} sueltos (por ejemplo la cerveza en lata) y después vuelve aquí a armar el six pack o el cubetazo.</p>
      <button class="btn btn-gold" data-click="irA('inventario')">Ir al inventario</button></div>`;
  }
  return `
    <div class="tarjeta">
      <div class="t-cab">
        <div><span class="t-tit">${ic('cart')} Menú y Combos</span>
          <p class="gris">Arma paquetes con lo que ya tienes en inventario y ponles su propio precio. Al venderlos se descuentan solas las unidades del stock.</p></div>
        <div class="t-acc">
          <input type="text" class="busca" placeholder="🔍 Buscar combo..." value="${escapeHtml(_comboBusca)}" data-input="buscarCombos(this.value)">
          ${puede?`<button class="btn btn-gold" data-click="editarCombo(null)">+ Crear combo</button>`:''}
        </div>
      </div>
      ${lista.length?`<div class="prods inv">
        ${lista.map(p=>{
          const disp=disponiblesCombo(p,productos);
          const suelto=precioSuelto(p,productos);
          const ahorro=suelto-(p.precio||0);
          return `<div class="prod ${disp===0?'off':''}">
            <div class="prod-ico">${fotoProducto(p,'cart')}
              ${disp===0?'<span class="badge-off">NO ALCANZA</span>':''}</div>
            <div class="prod-nom">${escapeHtml(p.nombre)}</div>
            <div class="prod-cat">${escapeHtml(p.categoria||'Combos')}</div>
            <div class="prod-pre">${fmtMoney(p.precio)}</div>
            ${ahorro>0?`<div class="prod-stock color-verde-c">Ahorra ${fmtMoney(ahorro)}</div>`
              :ahorro<0?`<div class="prod-stock poco">Cuesta ${fmtMoney(-ahorro)} más que suelto</div>`:''}
            <div class="gris chico mt-6 lh-1_5">
              ${(p.componentes||[]).map(cp=>{
                const base=productos.find(x=>x.id===cp.prodId);
                return (cp.cantidad||1)+' × '+escapeHtml(base?base.nombre:'(borrado)');
              }).join('<br>')}
            </div>
            <div class="prod-stock ${disp===0?'sin':(disp!==null&&disp<=3)?'poco':''} mt-6">
              ${disp===null?'Sin límite de stock':'Alcanzan para '+disp}
            </div>
            ${puede?`<div class="prod-acc">
              <button class="btn btn-sm btn-verde" data-click="editarCombo('${escapeHtml(p.id)}')">Editar</button>
              <button class="btn btn-sm btn-rojo" data-click="eliminarProducto('${escapeHtml(p.id)}')">×</button>
            </div>`:''}
          </div>`;
        }).join('')}
      </div>`:`<p class="gris">${_comboBusca?'No se encontraron combos.':'Todavía no hay combos. Crea el primero: por ejemplo "Six Pack" con 6 cervezas a mejor precio.'}</p>`}
    </div>
    ${lista.length?`<div class="tarjeta">
      <span class="t-tit">${ic('box')} Qué se descuenta del inventario</span>
      <p class="nota">Cada vez que vendas un combo, el sistema saca estas unidades del stock real.</p>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Combo</th><th>Precio</th><th>Suelto costaría</th><th>Lleva</th><th>Alcanzan</th></tr></thead>
        <tbody>${lista.map(p=>{
          const disp=disponiblesCombo(p,productos);
          return `<tr>
          <td><strong>${escapeHtml(p.nombre)}</strong></td>
          <td class="oro negrita">${fmtMoney(p.precio)}</td>
          <td class="gris">${fmtMoney(precioSuelto(p,productos))}</td>
          <td>${(p.componentes||[]).map(cp=>{const b=productos.find(x=>x.id===cp.prodId);return (cp.cantidad||1)+' × '+escapeHtml(b?b.nombre:'(borrado)');}).join('<br>')}</td>
          <td class="negrita ${disp===0?'rojo':''}">${disp===null?'—':disp}</td>
        </tr>`;}).join('')}</tbody>
      </table></div>
    </div>`:''}`;
}

export function editarCombo(id){
  if(!exigirEscritura()) return;   // D10: solo lectura
  if(!tienePermiso('editarprod')){ toast(MSJ.noTienesPermisoParaCrearCombos,'error'); return; }
  const productos=misDatos('productos');
  const p=id?productos.find(x=>x.id===id):null;
  _comboTmp = p&&p.componentes ? JSON.parse(JSON.stringify(p.componentes)) : [];
  const cats=Array.from(new Set(productos.map(x=>x.categoria||'General')));
  abrirModal({titulo:(p?'Editar':'Nuevo')+' combo', textoBoton:BOTON.guardar, campos:[
    {id:'nombre', label:'Nombre del combo', valor:p?p.nombre:'', requerido:true, placeholder:'Ej: Six Pack, Cubetazo'},
    {id:'precio', label:'Precio de venta del combo', tipo:'number', valor:p?String(p.precio):'', requerido:true},
    {id:'categoria', label:'Categoría', valor:p?(p.categoria||'Combos'):'Combos', placeholder:cats.join(', ')}
  ], extraHTML:comboEditorHTML(),
  onGuardar:(d)=>{
    const comps=_comboTmp.filter(c=>c.prodId && c.cantidad>0);
    if(!comps.length){ toast('Agrega al menos un '+pProd()+' al combo','error'); return; }
    const arr=misDatos('productos');
    const datos={nombre:d.nombre.trim(), precio:Math.max(0, parseFloat(d.precio)||0),   // S9
      categoria:(d.categoria||'Combos').trim()||'Combos',
      esCombo:true, componentes:comps, stock:null, usaLotes:false, lotes:[]};
    if(p){ const x=arr.find(y=>y.id===id); if(x) Object.assign(x,datos); }
    else { arr.unshift(Object.assign({id:uid(), agotado:false, creado:now(), imagen:''}, datos)); }
    guardarMisDatos('productos',arr);
    logAudit(p?'Editó combo':'Creó combo', datos.nombre+' · '+fmtMoney(datos.precio));
    _comboTmp=[];
    cerrarModal(); toast(MSJ.comboGuardado,'success'); render();
  }});
}
export function comboEditorHTML(){
  const sueltos=misDatos('productos').filter(x=>!esCombo(x));
  return `<div class="cobro-caja mt-14">
    <strong>¿Qué lleva el combo? <span class="gris chico">(sale del inventario)</span></strong>
    <div id="combo-lista" class="m-10-0">${comboFilasHTML()}</div>
    <div class="d-flex gap-8 flex-wrap items-centro">
      <select id="cb-prod" class="campo flex-2 minw-140 m-0">
        ${sueltos.map(x=>`<option value="${escapeHtml(x.id)}">${escapeHtml(x.nombre)}${x.stock!=null?' (hay '+x.stock+')':''}</option>`).join('')}
      </select>
      <input id="cb-cant" type="number" min="1" class="campo flex-1 minw-70 m-0" placeholder="Cant.">
      <button type="button" class="btn btn-verde btn-sm" data-click="agregarAComboTmp()">+ Añadir</button>
    </div>
    <p class="nota mt-10" id="cb-resumen"></p>
  </div>`;
}
export function comboFilasHTML(){
  const prods=misDatos('productos');
  if(!_comboTmp.length) return '<p class="nota">Vacío. Agrega lo que lleva, por ejemplo 6 × Cerveza en lata.</p>';
  return _comboTmp.map((c,idx)=>{
    const b=prods.find(x=>x.id===c.prodId);
    return `<div class="c-row p-6-0">
      <span>${b?escapeHtml(b.nombre):'(producto borrado)'}</span>
      <span><strong>${c.cantidad}</strong> und
        <button type="button" class="mini-x" data-click="quitarDeComboTmp(${escapeHtml(idx)})">×</button></span>
    </div>`;
  }).join('');
}
export function pintarResumenCombo(){
  const el=document.getElementById('cb-resumen'); if(!el) return;
  const prods=misDatos('productos');
  const suelto=_comboTmp.reduce((a,c)=>{ const b=prods.find(x=>x.id===c.prodId); return a+(b?(b.precio||0):0)*(c.cantidad||1); },0);
  const precio=parseFloat((document.getElementById('m-precio')||{}).value)||0;
  if(!_comboTmp.length){ el.textContent=''; return; }
  const ahorro=suelto-precio;
  el.innerHTML='Comprado suelto costaría <strong>'+fmtMoney(suelto)+'</strong>.'+
    (precio>0?(ahorro>0?' El cliente ahorra <strong class="verde">'+fmtMoney(ahorro)+'</strong>.'
      :ahorro<0?' <span class="rojo">Ojo: el combo cuesta '+fmtMoney(-ahorro)+' más que suelto.</span>'
      :' Cuesta lo mismo que suelto.'):'');
}
export function agregarAComboTmp(){
  const sel=document.getElementById('cb-prod');
  const cant=parseFloat((document.getElementById('cb-cant')||{}).value)||0;
  if(!sel||!sel.value){ toast('Elige un '+pProd(),'error'); return; }
  if(cant<=0){ toast(MSJ.escribeCuantasUnidadesLleva,'error'); return; }
  const ya=_comboTmp.find(c=>c.prodId===sel.value);
  if(ya) ya.cantidad=cant; else _comboTmp.push({prodId:sel.value, cantidad:cant});
  const cont=document.getElementById('combo-lista');
  if(cont) cont.innerHTML=comboFilasHTML();
  const ci=document.getElementById('cb-cant'); if(ci) ci.value='';
  pintarResumenCombo();
}
export function quitarDeComboTmp(idx){
  _comboTmp.splice(idx,1);
  const cont=document.getElementById('combo-lista');
  if(cont) cont.innerHTML=comboFilasHTML();
  pintarResumenCombo();
}
export function buscarCombos(v){ _comboBusca=v; render(); }
