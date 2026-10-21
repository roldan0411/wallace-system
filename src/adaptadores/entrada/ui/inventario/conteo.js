// ============================================================
//  INTERFAZ · Conteo de inventario
//  Conteo físico y ajuste por diferencias.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/06-inventory-recipes/06-inventory-recipes.md
// ============================================================
import { STATE, escapeHtml, fijarEscribiendo, fmtDate, fmtMoney, now } from '../nucleo/estado.js';
import { BOTON, MSJ } from '../nucleo/textos.js';
import { exigirEscritura, tienePermiso, usaInventario } from '../nucleo/permisos.js';
import { abrirModal, cerrarModal, confirmarModal, ic, toast } from '../nucleo/componentes.js';
import { render } from '../nucleo/navegacion.js';
import { logAudit } from '../usuarios/auditoria.js';
import { registrarMovimientos, reingresarALotes } from './motor.js';



// ============================================================
//  CONTEO DE INVENTARIO (revisión semanal)
//  Se cuenta lo que hay FÍSICAMENTE y se compara con lo que dice el sistema.
//  Queda el registro de quién contó y qué encontró: así se ve si falta,
//  sobra, y si los faltantes se repiten siempre con la misma persona.
// ============================================================
export let _conteo=null;          // conteo que se está haciendo ahora
export let _conteoBusca='';

// Arma la lista de lo que hay que contar (productos con stock + insumos)
export function itemsParaContar(){
  const neg=STATE.negocio;
  const filas=[];
  misDatos('productos').forEach(p=>{
    if(p.stock==null) return;
    filas.push({tipo:'producto', id:p.id, nombre:p.nombre, unidad:'', categoria:p.categoria||'General',
      sistema:p.stock||0, costo:Dominio.inventario.costoUnitario(p), contado:''});   // F14: a costo
  });
  if(neg.usaRecetas){
    misDatos('insumos').forEach(i=>{
      filas.push({tipo:'insumo', id:i.id, nombre:i.nombre, unidad:i.unidad||'', categoria:'Insumos',
        sistema:i.stock||0, costo:i.costo||0, contado:''});
    });
  }
  return filas.sort((a,b)=>(a.categoria+a.nombre).localeCompare(b.categoria+b.nombre,'es'));
}
export function iniciarConteo(){
  if(!exigirEscritura()) return;   // D10: solo lectura
  if(!tienePermiso('conteo')){ toast(MSJ.noTienesPermisoParaHacerConteos,'error'); return; }
  const filas=itemsParaContar();
  if(!filas.length){ toast(MSJ.noHayProductosConInventarioPara,'error'); return; }
  _conteo={inicio:now(), por:STATE.user.nombre, items:filas};
  _conteoBusca='';
  render();
}
export function cancelarConteo(){
  confirmarModal(MSJ.cancelarElConteoSePierdeLo,()=>{
    _conteo=null; render();
  },'Sí, cancelar');
}
// Guarda lo que se escribe en una casilla y actualiza esa fila + los totales,
// SIN redibujar la pantalla (no se pierde el teclado en el celular).
export function contarItem(idx, valor){
  if(!_conteo || !_conteo.items[idx]) return;
  const it=_conteo.items[idx];
  // V3: lo contado es un número de 0 en adelante; lo demás (vacío, negativo, texto) queda sin contar
  const n=parseFloat(valor);
  it.contado = (valor==='' || !Dominio.inventario.cantidadValida(n)) ? '' : n;
  // D8: lo contado se compara con el stock de ESTE momento (si se vendió mientras se
  // contaba, la venta ya está descontada y no se vuelve a restar al aplicar)
  it.sistema=stockActualDe(it);
  const sis=document.getElementById('sis-'+idx); if(sis) sis.textContent=it.sistema+(it.unidad?' '+it.unidad:'');
  pintarFilaConteo(idx);
  pintarTotalesConteo();
}
export function stockActualDe(it){
  const x=misDatos(it.tipo==='insumo'?'insumos':'productos').find(y=>y.id===it.id);
  return x ? (x.stock||0) : (it.sistema||0);
}
export function difDe(it){ return Dominio.inventario.diferenciaConteo(it); }
export function pintarFilaConteo(idx){
  const it=_conteo.items[idx];
  const d=difDe(it);
  const cel=document.getElementById('dif-'+idx);
  if(!cel) return;
  if(d===null){ cel.innerHTML='<span class="gris">—</span>'; }
  else if(d===0){ cel.innerHTML='<span class="pill pill-verde">Cuadra</span>'; }
  else if(d<0){ cel.innerHTML='<span class="pill pill-rojo">Faltan '+Math.abs(d)+'</span><br><span class="gris chico">'+fmtMoney(Math.abs(d)*(it.costo||0))+'</span>'; }
  else { cel.innerHTML='<span class="pill pill-gold">Sobran '+d+'</span><br><span class="gris chico">'+fmtMoney(d*(it.costo||0))+'</span>'; }
  const fila=document.getElementById('fila-'+idx);
  if(fila){ fila.style.background = d===null?'':(d===0?'':(d<0?'rgba(255,92,106,.08)':'rgba(245,197,24,.08)')); }
}
export function resumenConteo(){
  let falta=0, sobra=0, vFalta=0, vSobra=0, contados=0, cuadran=0;
  (_conteo?_conteo.items:[]).forEach(it=>{
    const d=difDe(it);
    if(d===null) return;
    contados++;
    if(d===0){ cuadran++; }
    else if(d<0){ falta++; vFalta+=Math.abs(d)*(it.costo||0); }
    else { sobra++; vSobra+=d*(it.costo||0); }
  });
  return {falta,sobra,vFalta,vSobra,contados,cuadran,total:(_conteo?_conteo.items.length:0)};
}
export function pintarTotalesConteo(){
  const r=resumenConteo();
  const set=(id,v)=>{ const e=document.getElementById(id); if(e) e.innerHTML=v; };
  set('cn-contados', r.contados+' / '+r.total);
  set('cn-cuadran', r.cuadran);
  set('cn-falta', r.falta+'<div class="stat-sub">'+fmtMoney(r.vFalta)+'</div>');
  set('cn-sobra', r.sobra+'<div class="stat-sub">'+fmtMoney(r.vSobra)+'</div>');
  const neto=document.getElementById('cn-neto');
  if(neto){
    const dif=r.vSobra-r.vFalta;
    neto.innerHTML = dif===0?'<span class="verde">Sin diferencia</span>'
      : dif<0?('<span class="rojo">Faltante de '+fmtMoney(Math.abs(dif))+'</span>')
      : ('<span class="oro">Sobrante de '+fmtMoney(dif)+'</span>');
  }
}
// Marca todo lo que no se escribió como "igual al sistema"
export function conteoTodoBien(){
  if(!_conteo) return;
  _conteo.items.forEach((it,i)=>{ if(it.contado===''||it.contado==null){ it.sistema=stockActualDe(it); it.contado=it.sistema; } });   // D8
  render();
  setTimeout(pintarTotalesConteo,50);
}
export function guardarConteo(ajustar){
  if(!exigirEscritura()) return;   // D10: solo lectura
  if(!_conteo){ return; }
  if(ajustar && !tienePermiso('editarstock')){ toast(MSJ.noTienesPermisoParaAjustarEl,'error'); return; }
  const r=resumenConteo();
  if(r.contados===0){ toast(MSJ.escribeAlMenosUnaCantidadContada,'error'); return; }
  const seguir=()=>{
    const items=_conteo.items.filter(it=>difDe(it)!==null).map(it=>({
      tipo:it.tipo, id:it.id, nombre:it.nombre, unidad:it.unidad||'',
      sistema:it.sistema, contado:it.contado, dif:difDe(it), costo:it.costo||0
    }));
    const conteo={id:uid(), fecha:now(), por:STATE.user.nombre, rol:STATE.user.rol||'',
      items, revisados:r.contados, totalItems:r.total, cuadran:r.cuadran,
      faltantes:r.falta, sobrantes:r.sobra, valorFalta:r.vFalta, valorSobra:r.vSobra,
      ajustado:!!ajustar};
    const arr=misDatos('conteos');
    arr.unshift(conteo);
    guardarMisDatos('conteos', [conteo]);   // se conserva todo el historial de conteos
    // Ajustar el stock a lo contado y dejar constancia de cada movimiento
    if(ajustar){
      // Se aplica la DIFERENCIA contada (no el valor fijo): si mientras se
      // contaba alguien vendió en otro equipo, esa venta no se pierde.
      const movs=[];
      items.forEach(it=>{
        if(it.dif===0) return;
        if(it.tipo==='producto'){
          cambiarStock('productos', it.id, x=>{
            if((x.lotes||[]).length){
              if(it.dif<0) descontarDeLotes(x, Math.abs(it.dif)); else reingresarALotes(x, it.dif);
            }
            x.stock=Math.max(0,(x.stock||0)+it.dif);
          });
        } else {
          cambiarStock('insumos', it.id, x=>{ x.stock=Math.max(0,(x.stock||0)+it.dif); });
        }
        movs.push({id:uid(), productoId:it.tipo==='producto'?it.id:null, insumoId:it.tipo==='insumo'?it.id:null,
          nombre:it.nombre, tipo:'ajuste', cantidad:it.dif,
          motivo:'Conteo de inventario ('+(it.dif<0?'faltaban ':'sobraban ')+Math.abs(it.dif)+')',
          por:STATE.user.nombre, fecha:now(), conteoId:conteo.id});
      });
      if(movs.length) registrarMovimientos(movs);
    }
    logAudit(ajustar?'Conteo de inventario + ajuste':'Conteo de inventario',
      r.contados+' revisados · faltan '+r.falta+' ('+fmtMoney(r.vFalta)+') · sobran '+r.sobra);
    _conteo=null;
    toast(ajustar?'Conteo guardado y stock ajustado':'Conteo guardado','success');
    render();
  };
  if(ajustar){
    confirmarModal('El stock del sistema quedará igual a lo que contaste. Se ajustarán '+(r.falta+r.sobra)+' producto(s) y queda registrado a tu nombre. ¿Continuar?', seguir, 'Sí, ajustar');
  } else {
    seguir();
  }
}
export function verConteo(id){
  const c=misDatos('conteos').find(x=>x.id===id); if(!c) return;
  const difs=(c.items||[]).filter(i=>i.dif!==0);
  const cuerpo=`
    <div class="cobro-caja">
      <div class="c-row"><span>Quién contó</span><strong>${escapeHtml(c.por||'—')}</strong></div>
      <div class="c-row"><span>Fecha</span><strong>${fmtDate(c.fecha)}</strong></div>
      <div class="c-row"><span>Revisados</span><strong>${c.revisados||0} de ${c.totalItems||0}</strong></div>
      <div class="c-row"><span>Cuadraron</span><strong class="verde">${c.cuadran||0}</strong></div>
      <div class="c-row"><span>Faltantes</span><strong class="rojo">${c.faltantes||0} · ${fmtMoney(c.valorFalta||0)}</strong></div>
      <div class="c-row"><span>Sobrantes</span><strong class="oro">${c.sobrantes||0} · ${fmtMoney(c.valorSobra||0)}</strong></div>
      <div class="c-row c-total"><span>Diferencia en dinero</span><strong class="${(c.valorSobra-c.valorFalta)<0?'rojo':'verde'}">${fmtMoney((c.valorSobra||0)-(c.valorFalta||0))}</strong></div>
    </div>
    ${c.ajustado?'<p class="nota mt-8">✔ El stock se ajustó a lo contado.</p>':'<p class="nota mt-8">Solo quedó el registro; el stock NO se modificó.</p>'}
    ${difs.length?`<div class="mt-12 maxh-280 overflow-y-auto">
      <table class="tabla"><thead><tr><th>Producto</th><th>Sistema</th><th>Contado</th><th>Dif.</th></tr></thead>
      <tbody>${difs.map(i=>`<tr>
        <td>${escapeHtml(i.nombre)}</td><td>${i.sistema}</td><td>${i.contado}</td>
        <td class="${i.dif<0?'rojo':'oro'} negrita">${i.dif>0?'+':''}${i.dif}</td></tr>`).join('')}</tbody></table>
    </div>`:'<p class="nota mt-12">Todo cuadró: ninguna diferencia.</p>'}`;
  abrirModal({titulo:'Conteo del '+(c.fecha||'').split('T')[0], textoBoton:BOTON.cerrar, campos:[],
    extraHTML:cuerpo, onGuardar:()=>cerrarModal()});
}

export function conteo(){
  fijarEscribiendo(!!_conteo);
  const neg=STATE.negocio;
  if(!usaInventario()){
    return `<div class="tarjeta centro-msg"><div class="msg-ico">📦</div>
      <div class="t-tit centrado">El control de inventario está apagado</div>
      <p class="gris">Este negocio no lleva existencias, así que no hay nada que contar. Se activa en <strong>Mi Negocio → Llevar control de inventario</strong>.</p></div>`;
  }
  // ----- Modo conteo en curso -----
  if(_conteo){
    let filas=_conteo.items.map((it,i)=>({it,i}));
    if(_conteoBusca){ const q=_conteoBusca.toLowerCase(); filas=filas.filter(f=>(f.it.nombre||'').toLowerCase().includes(q)); }
    return `
      <div class="tarjeta tarjeta-pend">
        <div class="t-cab">
          <span class="t-tit">📋 Conteo en curso · ${escapeHtml(_conteo.por)}</span>
          <div class="t-acc">
            <button class="btn btn-sm" data-click="conteoTodoBien()" title="Marca todo lo que falta por escribir con la cantidad del sistema">✓ Lo demás está igual</button>
            <button class="btn btn-sm btn-rojo" data-click="cancelarConteo()">Cancelar</button>
          </div>
        </div>
        <p class="nota">Cuenta lo que hay físicamente y escríbelo en la casilla. La diferencia se calcula sola. Deja en blanco lo que no revises.</p>
      </div>
      <div class="stats">
        <div class="stat azul"><div class="stat-lbl">Revisados</div><div class="stat-val" id="cn-contados">0 / ${_conteo.items.length}</div><div class="stat-sub">de la lista</div></div>
        <div class="stat verde"><div class="stat-lbl">Cuadran</div><div class="stat-val" id="cn-cuadran">0</div><div class="stat-sub">sin diferencia</div></div>
        <div class="stat rojo"><div class="stat-lbl">Faltan</div><div class="stat-val" id="cn-falta">0</div></div>
        <div class="stat gold"><div class="stat-lbl">Sobran</div><div class="stat-val" id="cn-sobra">0</div></div>
      </div>
      <div class="tarjeta">
        <div class="t-cab">
          <span class="t-tit">Resultado: <span id="cn-neto" class="gris">Sin diferencia</span></span>
          <input type="text" class="busca" placeholder="🔍 Buscar producto..." value="${escapeHtml(_conteoBusca)}" data-input="buscarConteo(this.value)">
        </div>
        <div class="tabla-wrap"><table class="tabla tabla-cards">
          <thead><tr><th>Producto</th><th>Sistema</th><th>Contado</th><th>Diferencia</th></tr></thead>
          <tbody>${filas.map(({it,i})=>`<tr id="fila-${escapeHtml(i)}">
            <td data-label="Producto"><strong>${escapeHtml(it.nombre)}</strong><br><span class="gris chico">${escapeHtml(it.categoria)}${it.tipo==='insumo'?' · insumo':''}</span></td>
            <td data-label="Sistema" class="negrita" id="sis-${escapeHtml(i)}">${it.sistema}${it.unidad?' '+escapeHtml(it.unidad):''}</td>
            <td data-label="Contado"><input type="number" class="busca minw-90 w-110" inputmode="decimal"
                value="${escapeHtml(it.contado===''?'':it.contado)}" placeholder="—" data-input="contarItem(${escapeHtml(i)}, this.value)"></td>
            <td data-label="Diferencia" id="dif-${escapeHtml(i)}"><span class="gris">—</span></td>
          </tr>`).join('')}</tbody>
        </table></div>
        <div class="botones-fila mt-16">
          <button class="btn btn-gold" data-click="guardarConteo(false)">💾 Guardar conteo (sin tocar el stock)</button>
          ${tienePermiso('editarstock')?`<button class="btn btn-verde" data-click="guardarConteo(true)">✔ Guardar y ajustar el stock</button>`:''}
        </div>
        ${!tienePermiso('editarstock')?`<p class="nota">Tú puedes contar y dejar el reporte, pero no ajustar el stock. Eso lo hace quien tenga ese permiso.</p>`:''}
      </div>`;
  }
  // ----- Pantalla normal: historial y aviso semanal -----
  const conteos=misDatos('conteos');
  const ultimo=conteos[0];
  const dias=ultimo?diasDesde(ultimo.fecha):null;
  const pendiente = dias===null || dias>=7;
  const items=itemsParaContar();
  return `
    ${pendiente?`<div class="tarjeta alerta">
      <span class="t-tit chico">⚠️ Toca hacer el conteo</span>
      <p>${dias===null?'Nunca se ha hecho un conteo de inventario en este negocio.':'El último conteo fue hace <strong>'+dias+' día(s)</strong> ('+fmtDate(ultimo.fecha)+').'} Se recomienda revisar el inventario una vez por semana.</p>
    </div>`:''}
    <div class="stats">
      <div class="stat azul"><div class="stat-ico azul">${ic('box')}</div><div class="stat-lbl">Para contar</div><div class="stat-val">${items.length}</div><div class="stat-sub">con existencias</div></div>
      <div class="stat ${pendiente?'naranja':'verde'}"><div class="stat-ico ${pendiente?'naranja':'verde'}">${ic('history')}</div><div class="stat-lbl">Último conteo</div><div class="stat-val fs-19">${ultimo?(dias===0?'Hoy':dias+' día(s)'):'Nunca'}</div><div class="stat-sub">${ultimo?escapeHtml(ultimo.por||''):'sin registros'}</div></div>
      ${ultimo?`<div class="stat rojo"><div class="stat-ico rojo">${ic('cash')}</div><div class="stat-lbl">Faltante del último</div><div class="stat-val">${fmtMoney(ultimo.valorFalta||0)}</div><div class="stat-sub">${ultimo.faltantes||0} producto(s)</div></div>
      <div class="stat gold"><div class="stat-ico gold">${ic('report')}</div><div class="stat-lbl">Sobrante del último</div><div class="stat-val">${fmtMoney(ultimo.valorSobra||0)}</div><div class="stat-sub">${ultimo.sobrantes||0} producto(s)</div></div>`:''}
    </div>
    <div class="tarjeta">
      <div class="t-cab">
        <span class="t-tit">${ic('box')} Conteo de inventario</span>
        <div class="t-acc">
          ${tienePermiso('conteo')?`<button class="btn btn-gold" data-click="iniciarConteo()">+ Iniciar conteo</button>`
            :`<span class="pill pill-gold">Solo lectura</span>`}
        </div>
      </div>
      <p class="nota">Aquí se revisa si el inventario está bien: se cuenta lo que hay en la bodega y el sistema muestra qué falta y qué sobra. Cada conteo queda guardado con el nombre de quien lo hizo.</p>
      <div class="tabla-wrap"><table class="tabla tabla-cards">
        <thead><tr><th>Fecha</th><th>Quién contó</th><th>Revisados</th><th>Faltan</th><th>Sobran</th><th>Diferencia</th><th>Acciones</th></tr></thead>
        <tbody>${conteos.length? conteos.map(c=>{
          const dif=(c.valorSobra||0)-(c.valorFalta||0);
          return `<tr>
          <td data-label="Fecha">${fmtDate(c.fecha)}${c.ajustado?'<br><span class="pill pill-azul chico">Stock ajustado</span>':''}</td>
          <td data-label="Quién contó"><strong>${escapeHtml(c.por||'—')}</strong></td>
          <td data-label="Revisados">${c.revisados||0} / ${c.totalItems||0}<br><span class="verde chico">${c.cuadran||0} cuadraron</span></td>
          <td data-label="Faltan" class="${(c.faltantes||0)?'rojo negrita':'gris'}">${c.faltantes||0}${(c.faltantes||0)?'<br><span class="chico">'+fmtMoney(c.valorFalta||0)+'</span>':''}</td>
          <td data-label="Sobran" class="${(c.sobrantes||0)?'oro negrita':'gris'}">${c.sobrantes||0}${(c.sobrantes||0)?'<br><span class="chico">'+fmtMoney(c.valorSobra||0)+'</span>':''}</td>
          <td data-label="Diferencia" class="negrita ${dif<0?'rojo':dif>0?'oro':'verde'}">${dif===0?'Cuadró':fmtMoney(dif)}</td>
          <td class="acciones" data-label="Acciones"><button class="btn btn-sm" data-click="verConteo('${escapeHtml(c.id)}')">Ver detalle</button></td>
        </tr>`;}).join('') : '<tr><td colspan="7" class="gris">Todavía no se ha hecho ningún conteo.</td></tr>'}</tbody>
      </table></div>
    </div>`;
}
export function buscarConteo(v){ _conteoBusca=v; render(); }
