// ============================================================
//  INTERFAZ · Insumos
//  Inventario de compra de un restaurante.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/06-inventory-recipes/06-inventory-recipes.md
// ============================================================
import { STATE, escapeHtml, fijarEscribiendo, fmtMoney, now } from '../nucleo/estado.js';
import { BOTON, MSJ } from '../nucleo/textos.js';
import { exigirEscritura, tienePermiso } from '../nucleo/permisos.js';
import { abrirModal, cerrarModal, confirmarModal, ic, pProd, pProds, toast } from '../nucleo/componentes.js';
import { render } from '../nucleo/navegacion.js';
import { logAudit } from '../usuarios/auditoria.js';
import { registrarMovimientos } from './motor.js';


// ============================================================
//  INSUMOS (inventario de compra de un restaurante)
//  Se descuentan solos por la receta de cada plato.
// ============================================================
export let _insBusca='';
export function pantallaInsumos(){
  fijarEscribiendo(false);
  const todos=misDatos('insumos');
  let lista=todos;
  if(_insBusca){ const q=_insBusca.toLowerCase(); lista=lista.filter(i=>(i.nombre||'').toLowerCase().includes(q)); }
  const agotados=todos.filter(i=>(i.stock||0)<=0);
  const bajos=todos.filter(i=>(i.stock||0)>0 && (i.stock||0)<=(i.stockMin||0));
  const valor=todos.reduce((a,i)=>a+((i.stock||0)*(i.costo||0)),0);

  return `
    ${todos.length?`<div class="stats">
      <div class="stat"><div class="stat-ico">${ic('box')}</div><div class="stat-lbl">Insumos</div><div class="stat-val">${todos.length}</div><div class="stat-sub">materias primas</div></div>
      <div class="stat gold"><div class="stat-ico gold">${ic('cash')}</div><div class="stat-lbl">Valor en bodega</div><div class="stat-val">${fmtMoney(valor)}</div><div class="stat-sub">a costo</div></div>
      <div class="stat ${bajos.length?'naranja':''}"><div class="stat-ico ${bajos.length?'naranja':''}">${ic('history')}</div><div class="stat-lbl">Quedan pocos</div><div class="stat-val">${bajos.length}</div><div class="stat-sub">por agotarse</div></div>
      <div class="stat ${agotados.length?'rojo':''}"><div class="stat-ico ${agotados.length?'rojo':''}">${ic('box')}</div><div class="stat-lbl">Agotados</div><div class="stat-val">${agotados.length}</div><div class="stat-sub">sin existencias</div></div>
    </div>`:''}
    ${(agotados.length||bajos.length)?`<div class="tarjeta alerta">
      <span class="t-tit chico">⚠️ Alertas de insumos</span>
      ${agotados.length?`<p><strong class="rojo">AGOTADOS (${agotados.length}):</strong> ${agotados.map(i=>escapeHtml(i.nombre)).join(', ')}</p>`:''}
      ${bajos.length?`<p><strong class="oro">Quedan pocos (${bajos.length}):</strong> ${bajos.map(i=>escapeHtml(i.nombre)+' ('+(i.stock||0)+' '+escapeHtml(i.unidad||'')+')').join(', ')}</p>`:''}
    </div>`:''}
    <div class="tarjeta">
      <div class="t-cab">
        <span class="t-tit">${ic('box')} Insumos e inventario</span>
        <div class="t-acc">
          <input type="text" class="busca" placeholder="🔍 Buscar insumo..." value="${escapeHtml(_insBusca)}" data-input="buscarInsumos(this.value)">
          ${tienePermiso('editarprod')?`<button class="btn btn-gold" data-click="editarInsumo(null)">+ Agregar insumo</button>`:''}
        </div>
      </div>
      ${lista.length?`<div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Insumo</th><th>Existencias</th><th>Unidad</th><th>Costo unit.</th><th>Avisar bajo</th><th></th></tr></thead>
        <tbody>${lista.map(i=>{
          const sin=(i.stock||0)<=0, poco=(i.stock||0)>0 && (i.stock||0)<=(i.stockMin||0);
          return `<tr>
            <td class="negrita">${escapeHtml(i.nombre)}</td>
            <td><span class="${sin?'rojo':poco?'oro':'verde'} negrita">${i.stock||0}</span>${sin?' <span class="pill pill-rojo">Agotado</span>':poco?' <span class="pill pill-gold">Pocos</span>':''}</td>
            <td class="gris">${escapeHtml(i.unidad||'—')}</td>
            <td>${fmtMoney(i.costo||0)}</td>
            <td class="gris">${i.stockMin||0}</td>
            <td><div class="acciones">
              ${tienePermiso('editarstock')?`<button class="btn btn-sm btn-verde" data-click="entradaInsumo('${escapeHtml(i.id)}')">+ Entrada</button>`:''}
              ${tienePermiso('editarprod')?`<button class="btn btn-sm" data-click="editarInsumo('${escapeHtml(i.id)}')">Editar</button>`:''}
              ${tienePermiso('editarprod')?`<button class="btn btn-sm btn-rojo" data-click="eliminarInsumo('${escapeHtml(i.id)}')">×</button>`:''}
            </div></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>`:`<p class="gris">${_insBusca?'No se encontraron insumos.':'Aún no hay insumos. Agrega el primero (arroz, pollo, aceite…) y luego los asignas a los '+pProds()+' con una receta.'}</p>`}
    </div>`;
}

export function editarInsumo(id){
  if(!exigirEscritura()) return;   // D10: solo lectura
  if(!tienePermiso('editarprod')){ toast(MSJ.noTienesPermisoParaEditarInsumos,'error'); return; }
  const arr=misDatos('insumos');
  const i=id?arr.find(x=>x.id===id):null;
  abrirModal({titulo:(i?'Editar':'Nuevo')+' insumo', textoBoton:BOTON.guardar, campos:[
    {id:'nombre', label:'Nombre del insumo', valor:i?i.nombre:'', requerido:true, placeholder:'Ej: Pollo, Arroz, Aceite'},
    {id:'unidad', label:'Unidad de medida', valor:i?(i.unidad||''):'', placeholder:'g, kg, ml, litro, unidad…'},
    {id:'stock', label:'Existencias actuales', tipo:'number', valor:i&&i.stock!=null?String(i.stock):'0'},
    {id:'costo', label:'Costo por unidad (opcional)', tipo:'number', valor:i&&i.costo!=null?String(i.costo):''},
    {id:'stockmin', label:'Avisar cuando queden menos de', tipo:'number', valor:i&&i.stockMin!=null?String(i.stockMin):'5'}
  ], onGuardar:(d)=>{
    const list=misDatos('insumos');
    const datos={
      nombre:d.nombre.trim(),
      unidad:(d.unidad||'').trim(),
      stock:parseFloat(d.stock)||0,
      costo:d.costo===''?0:(parseFloat(d.costo)||0),
      stockMin:parseFloat(d.stockmin)||0
    };
    if(!['stock','costo','stockMin'].every(k=>Dominio.inventario.cantidadValida(datos[k]))){ toast(MSJ.lasCantidadesNoPuedenSerNegativas,'error'); return; }   // V3
    // F11: editar las existencias aplica la DIFERENCIA (transacción) y deja rastro
    let ajuste=null;
    if(i){
      const x=list.find(y=>y.id===id);
      if(x){
        const antes=x.stock||0;
        if(datos.stock!==antes){ ajuste={antes, despues:datos.stock}; delete datos.stock; }
        Object.assign(x,datos);
      }
    } else { list.unshift(Object.assign({id:uid(), creado:now()}, datos)); }
    guardarMisDatos('insumos',list);
    if(ajuste){
      const dif=ajuste.despues-ajuste.antes;
      cambiarStock('insumos', id, y=>{ y.stock=(y.stock||0)+dif; });
      registrarMovimientos([{id:uid(), insumoId:id, nombre:datos.nombre, tipo:'ajuste', cantidad:dif,
        motivo:'Ajuste al editar ('+ajuste.antes+' → '+ajuste.despues+')', por:STATE.user.nombre, fecha:now()}]);
      logAudit('Ajustó insumo al editar', datos.nombre+': '+ajuste.antes+' → '+ajuste.despues);
    } else if(!i){
      logAudit('Creó insumo', datos.nombre+' · '+datos.stock+' '+datos.unidad);
    }
    cerrarModal(); toast(MSJ.insumoGuardado,'success'); render();
  }});
}
export function eliminarInsumo(id){
  if(!exigirEscritura()) return;   // D10: solo lectura
  if(!tienePermiso('editarprod')){ toast(MSJ.noTienesPermisoParaBorrarInsumos,'error'); return; }
  const i=misDatos('insumos').find(x=>x.id===id);
  // Avisar si algún plato lo usa en su receta
  const platos=misDatos('productos').filter(p=>(p.receta||[]).some(r=>r.insumoId===id));
  const aviso=platos.length?' Lo usan '+platos.length+' '+pProd()+'(s): quedarán sin ese insumo en la receta.':'';
  confirmarModal('¿Eliminar el insumo "'+(i?i.nombre:'')+'"?'+aviso,()=>{
    eliminarMisDatos('insumos',id);
    // Limpiarlo de las recetas
    const prods=misDatos('productos'); let cambio=false;
    prods.forEach(p=>{ if(p.receta){ const n=p.receta.length; p.receta=p.receta.filter(r=>r.insumoId!==id); if(p.receta.length!==n) cambio=true; } });
    if(cambio) guardarMisDatos('productos',prods);
    toast(MSJ.insumoEliminado,'info'); render();
  },'Eliminar');
}
export function entradaInsumo(id){
  if(!exigirEscritura()) return;   // D10: solo lectura
  if(!tienePermiso('editarstock')){ toast(MSJ.noTienesPermisoParaModificarEl,'error'); return; }
  const arr=misDatos('insumos');
  const i=arr.find(x=>x.id===id); if(!i) return;
  abrirModal({titulo:'Entrada de insumo · '+i.nombre, textoBoton:BOTON.agregar, campos:[
    {id:'cant', label:'¿Cuánto entra? ('+(i.unidad||'unidades')+')', tipo:'number', requerido:true},
    {id:'motivo', label:'Motivo', valor:'Compra'}
  ], extraHTML:`<p class="nota">Existencias actuales: <strong>${i.stock||0} ${escapeHtml(i.unidad||'')}</strong></p>`,
  onGuardar:(d)=>{
    const cant=parseFloat(d.cant)||0;
    if(cant<=0){ toast(MSJ.cantidadInvalida,'error'); return; }
    cambiarStock('insumos', id, x=>{ x.stock=(x.stock||0)+cant; });
    registrarMovimientos([{id:uid(), insumoId:id, nombre:i.nombre, tipo:'entrada-insumo', cantidad:cant,
      motivo:d.motivo, por:STATE.user.nombre, fecha:now()}]);
    logAudit('Entrada de insumo', i.nombre+' +'+cant+' '+(i.unidad||'')+' · '+(d.motivo||''));
    cerrarModal(); toast(MSJ.entradaRegistrada,'success'); render();
  }});
}
export function buscarInsumos(v){ _insBusca=v; render(); }
