// ============================================================
//  INTERFAZ · Cocina (KDS)
//  Pantalla de preparación de pedidos.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/04-kitchen-kds/04-kitchen-kds.md
// ============================================================
import { STATE, escapeHtml, fijarEscribiendo, now } from '../nucleo/estado.js';
import { MSJ } from '../nucleo/textos.js';
import { puedeVerPantalla } from '../nucleo/permisos.js';
import { ic, toast } from '../nucleo/componentes.js';
import { sonidoPedido } from '../nucleo/sonidos.js';
import { render } from '../nucleo/navegacion.js';
import { ventasJornada } from '../ventas/pedidos.js';


// ============================================================
//  COCINA (pantalla para preparar los pedidos)
// ============================================================
export let _ultimoCountCocina=-1;
export function cocina(){
  fijarEscribiendo(false);
  const vs=ventasJornada(false).filter(v=>v.estado!=='anulada' && v.estadoCocina
      && v.estadoCocina!=='entregado')
    .sort((a,b)=>new Date(a.fecha||0)-new Date(b.fecha||0));
  // Sonar cuando entra un pedido nuevo (más pendientes que antes)
  const nPend=vs.filter(v=>v.estadoCocina==='pendiente'||v.estadoCocina==='preparando').length;
  if(_ultimoCountCocina>=0 && nPend>_ultimoCountCocina){ try{ sonidoPedido(); }catch(e){} }
  _ultimoCountCocina=nPend;
  const enPrep=vs.filter(v=>v.estadoCocina==='pendiente'||v.estadoCocina==='preparando');
  const listos=vs.filter(v=>v.estadoCocina==='listo');
  const etiq={mesa:'Mesa',llevar:'Para llevar',domicilio:'Domicilio',envio:'Envío'};
  const usaComanda=(STATE.negocio||{}).usaCocina;

  const tarjeta=(v)=>{
    const min=Math.floor((Date.now()-new Date(v.fecha||Date.now()).getTime())/60000);
    const cls=min<15?'krono-verde':min<25?'krono-amar':'krono-rojo';
    const prep=v.estadoCocina==='preparando';
    return `<div class="kds-card ${escapeHtml(cls)}">
      <div class="kds-top">
        <span class="kds-ref">${escapeHtml(v.factura||'')}</span>
        <span class="kds-krono">${min} min</span>
      </div>
      <div class="kds-tipo">${etiq[v.tipo]||''}${v.mesa?' · '+escapeHtml(v.mesa):''}${v.cliNombre?' · '+escapeHtml(v.cliNombre):''}</div>
      ${v.tipo==='domicilio'?`<div class="gris chico mb-6">📍 ${escapeHtml(v.cliDir||'')}${v.cliTel?' · ☎ '+escapeHtml(v.cliTel):''}</div>`:''}
      <div class="kds-items">
        ${(v.items||[]).map(i=>`<div class="kds-item"><strong>${i.qty}×</strong> ${escapeHtml(i.nombre)}${i.obs?`<div class="rojo chico">⚠ ${escapeHtml(i.obs)}</div>`:''}</div>`).join('')}
      </div>
      ${v.obs?`<div class="kds-nota">${escapeHtml(v.obs)}</div>`:''}
      <div class="kds-acc">
        ${!prep&&v.estadoCocina!=='listo'?`<button class="btn btn-sm btn-verde" data-click="marcarCocina('${escapeHtml(v.id)}','preparando')">👨‍🍳 Preparando</button>`:''}
        ${v.estadoCocina!=='listo'?`<button class="btn btn-sm btn-gold" data-click="marcarCocina('${escapeHtml(v.id)}','listo')">✓ Listo</button>`:'<span class="pill pill-verde">✓ Listo</span>'}
        ${usaComanda?`<button class="btn btn-sm btn-ghost" data-click="imprimirComandaDe('${escapeHtml(v.id)}')" title="Comanda">🖨️</button>`:''}
      </div>
    </div>`;
  };
  return `
    <div class="stats">
      <div class="stat gold"><div class="stat-ico gold">${ic('chef')}</div><div class="stat-lbl">En preparación</div><div class="stat-val">${enPrep.length}</div><div class="stat-sub">pedidos en cocina</div></div>
      <div class="stat verde"><div class="stat-ico verde">${ic('report')}</div><div class="stat-lbl">Listos</div><div class="stat-val">${listos.length}</div><div class="stat-sub">para entregar</div></div>
    </div>
    <div class="tarjeta">
      <span class="t-tit">${ic('chef')} En preparación · <span class="gris chico">ordenado por tiempo de espera</span></span>
      ${enPrep.length?`<div class="kds-grid">${enPrep.map(tarjeta).join('')}</div>`:'<p class="gris">No hay pedidos en cocina.</p>'}
    </div>
    ${listos.length?`<div class="tarjeta">
      <span class="t-tit">✅ Listos para entregar</span>
      <div class="kds-grid">${listos.map(v=>`<div class="kds-card krono-verde">
        <div class="kds-top"><span class="kds-ref">${escapeHtml(v.factura||'')}</span><span class="pill pill-verde">Listo</span></div>
        <div class="kds-tipo">${etiq[v.tipo]||''}${v.mesa?' · '+escapeHtml(v.mesa):''}${v.cliNombre?' · '+escapeHtml(v.cliNombre):''}</div>
        <div class="kds-acc">
          <button class="btn btn-sm btn-verde" data-click="marcarCocina('${escapeHtml(v.id)}','entregado')">✓ Entregado</button>
          <button class="btn btn-sm btn-ghost" data-click="marcarCocina('${escapeHtml(v.id)}','pendiente')">← Volver</button>
        </div>
      </div>`).join('')}</div>
    </div>`:''}`;
}
export function marcarCocina(id,estado){
  if(!puedeVerPantalla('cocina')){ toast(MSJ.noTienesAccesoACocina,'error'); return; }
  const arr=misDatos('ventas');
  const v=arr.find(x=>x.id===id); if(!v) return;
  v.estadoCocina=estado;
  if(estado==='preparando' && !v.horaPreparando) v.horaPreparando=now();
  if(estado==='listo'){ if(!v.horaListo) v.horaListo=now(); sonidoPedido(); }
  if(estado==='entregado') v.horaEntregado=now();
  guardarMisDatos('ventas',arr);
  toast(estado==='listo'?'Pedido listo para entregar':estado==='entregado'?'Pedido entregado':estado==='preparando'?'En preparación':'Vuelve a pendiente',
    estado==='listo'?'success':'info');
  render();
}
