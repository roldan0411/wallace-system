// ============================================================
//  INTERFAZ · Dashboard
//  Pantalla de inicio con las cifras del día.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/08-sales-reports/08-sales-reports.md
// ============================================================
import { STATE, escapeHtml, fijarEscribiendo, fmtCorto, fmtDate, fmtMoney } from '../nucleo/estado.js';
import { ic, pPedido, pPedidos } from '../nucleo/componentes.js';
import { ventasJornada } from '../ventas/pedidos.js';
import { detallePagos } from '../ventas/cobro.js';


// ============================================================
//  DASHBOARD
// ============================================================
export function inicio(){
  const neg=STATE.negocio;
  fijarEscribiendo(false);
  // Monto de venta (comida) tolerante: si no hay subtotal, usa total. Antes las
  // ventas sin 'subtotal' sumaban 0 y el dashboard no mostraba lo cobrado.
  const montoVenta=Dominio.ventas.ventaDelNegocio;   // F21: la misma definición en todas las pantallas
  const vs=misDatos('ventas').filter(v=>v.estado==='pagada');
  const h=today();
  const hoy=ventasJornada(true);
  const totHoy=hoy.reduce((a,v)=>a+montoVenta(v),0);
  // Semana y mes
  const d7=new Date(); d7.setDate(d7.getDate()-7);
  const sem=vs.filter(v=>new Date(v.fecha)>=d7).reduce((a,v)=>a+montoVenta(v),0);
  const mes=vs.filter(v=>mesDeJornada(v)===h.substring(0,7)).reduce((a,v)=>a+montoVenta(v),0);
  const pend=ventasJornada(false).filter(v=>v.estado==='abierta');
  // Gráfico 7 días
  const dias=[];
  for(let i=6;i>=0;i--){
    const d=new Date(); d.setDate(d.getDate()-i);
    const k=fechaLocal(d);
    dias.push({lbl:['D','L','M','X','J','V','S'][d.getDay()],
      tot:vs.filter(v=>jornadaDe(v)===k).reduce((a,v)=>a+montoVenta(v),0)});
  }
  const mx=Math.max.apply(null,dias.map(d=>d.tot).concat([1]));
  const metodos=sumaPorMetodo(hoy, montoVenta);
  // Últimas ventas (las 10 más recientes, como Portal Imperial)
  const ultimas=misDatos('ventas').filter(v=>v.estado!=='anulada')
    .slice().sort((a,b)=>new Date(b.fecha||0)-new Date(a.fecha||0)).slice(0,10);

  // En logística no hay dinero: se mide en unidades de mercancía movida (salidas)
  const uniDe=v=>(v.items||[]).reduce((a,i)=>a+(i.qty||0),0);
  const uniHoy=hoy.reduce((a,v)=>a+uniDe(v),0);
  const uniSem=vs.filter(v=>new Date(v.fecha)>=d7).reduce((a,v)=>a+uniDe(v),0);
  const uniMes=vs.filter(v=>mesDeJornada(v)===h.substring(0,7)).reduce((a,v)=>a+uniDe(v),0);

  if(neg.esLogistica){
    const diasU=[];
    for(let i=6;i>=0;i--){
      const d=new Date(); d.setDate(d.getDate()-i);
      const k=fechaLocal(d);
      diasU.push({lbl:['D','L','M','X','J','V','S'][d.getDay()],
        tot:vs.filter(v=>jornadaDe(v)===k).reduce((a,v)=>a+uniDe(v),0)});
    }
    const mxU=Math.max.apply(null,diasU.map(d=>d.tot).concat([1]));
    return `
    <div class="stats">
      <div class="stat verde"><div class="stat-lbl">Despachado en la jornada</div><div class="stat-val">${uniHoy} und</div><div class="stat-sub">${hoy.length} ${pPedidos()}</div></div>
      <div class="stat azul"><div class="stat-lbl">Últimos 7 días</div><div class="stat-val">${uniSem} und</div><div class="stat-sub">semana</div></div>
      <div class="stat"><div class="stat-lbl">Este mes</div><div class="stat-val">${uniMes} und</div><div class="stat-sub">acumulado</div></div>
    </div>
    <div class="tarjeta">
      <span class="t-tit">${ic('report')} Unidades despachadas por día</span>
      <div class="barras">${diasU.map(d=>`<div class="barra">
        <div class="b-val">${d.tot>0?d.tot:''}</div>
        <div class="b-fill" style="height:${Math.max(4,(d.tot/mxU)*130)}px"></div>
        <div class="b-lbl">${d.lbl}</div></div>`).join('')}</div>
    </div>
    <div class="tarjeta">
      <span class="t-tit">${ic('history')} Últimos ${pPedidos()}</span>
      ${ultimas.length?`<div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>${pPedido(true)}</th><th>Cliente</th><th>Unidades</th><th>Quién</th><th>Fecha</th></tr></thead>
        <tbody>${ultimas.map(v=>`<tr>
          <td><strong class="oro">${escapeHtml(v.factura)}</strong></td>
          <td>${escapeHtml(v.cliNombre||'—')}</td>
          <td class="negrita">${uniDe(v)} und</td>
          <td class="gris">${escapeHtml(v.vendedor||'—')}</td>
          <td class="gris chico">${fmtDate(v.fecha)}</td>
        </tr>`).join('')}</tbody>
      </table></div>`:'<p class="gris">Aún no hay salidas registradas.</p>'}
    </div>`;
  }

  return `
    <div class="stats">
      <div class="stat verde"><div class="stat-lbl">Vendido en la jornada</div><div class="stat-val">${fmtMoney(totHoy)}</div><div class="stat-sub">${hoy.length} venta(s)</div></div>
      <div class="stat gold"><div class="stat-lbl">Por cobrar</div><div class="stat-val">${fmtMoney(pend.reduce((a,v)=>a+(v.total||0),0))}</div><div class="stat-sub">${pend.length} pedido(s)</div></div>
      <div class="stat azul"><div class="stat-lbl">Últimos 7 días</div><div class="stat-val">${fmtMoney(sem)}</div><div class="stat-sub">semana</div></div>
      <div class="stat"><div class="stat-lbl">Este mes</div><div class="stat-val">${fmtMoney(mes)}</div><div class="stat-sub">acumulado</div></div>
    </div>
    <div class="grid2">
      <div class="tarjeta">
        <span class="t-tit">${ic('report')} Ventas por día</span>
        <div class="barras">${dias.map(d=>`<div class="barra">
          <div class="b-val">${d.tot>0?fmtCorto(d.tot):''}</div>
          <div class="b-fill" style="height:${Math.max(4,(d.tot/mx)*130)}px"></div>
          <div class="b-lbl">${d.lbl}</div></div>`).join('')}</div>
      </div>
      <div class="tarjeta">
        <span class="t-tit">${ic('cash')} Métodos de pago (jornada)</span>
        <div class="linea"><span>Efectivo</span><strong class="verde">${fmtMoney(metodos.efectivo)}</strong></div>
        <div class="linea"><span>Banco / Transferencia</span><strong class="azul">${fmtMoney(metodos.banco)}</strong></div>
        <div class="linea"><span>Tarjeta / Datáfono</span><strong>${fmtMoney(metodos.tarjeta)}</strong></div>
        <div class="linea total-linea"><span>TOTAL</span><strong>${fmtMoney(totHoy)}</strong></div>
      </div>
    </div>
    ${(()=>{ const rep=Dominio.facturas.repetidas(misDatos('ventas'));
      if(!rep.length) return '';
      return `<div class="tarjeta alerta">
        <span class="t-tit chico">⚠️ Números de factura repetidos</span>
        <p>${rep.slice(0,8).map(x=>escapeHtml(x.factura)+' ('+x.veces+' ventas)').join(' · ')}. Pasa cuando dos equipos vendieron sin internet con una versión anterior. Revisa esas ventas en Historial.</p>
      </div>`; })()}
    ${(()=>{ const rev=misDatos('ventas').filter(v=>v.pagoDescuadrado && v.estado==='pagada');
      if(!rev.length) return '';
      return `<div class="tarjeta alerta">
        <span class="t-tit chico">⚠️ ${rev.length} ${pPedido()}(s) con el cobro sin ajustar</span>
        <p>Se editaron después de cobrados y el total cambió. Ajusta el pago para que la caja cuadre.</p>
        <div class="botones-fila mt-8">${rev.slice(0,6).map(v=>`<button class="btn btn-sm btn-naranja" data-click="ajustarPagoVenta('${escapeHtml(v.id)}')">${escapeHtml(v.factura||'')} · ${fmtMoney(v.total)}</button>`).join('')}</div>
      </div>`; })()}
    ${pend.length?`<div class="tarjeta tarjeta-pend">
      <span class="t-tit">⏳ ${pPedidos(true)} por cobrar</span>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Pedido</th><th>Cliente</th><th>Total</th><th>Quién lo tomó</th><th></th></tr></thead>
        <tbody>${pend.slice(0,8).map(v=>`<tr>
          <td><strong class="oro">${escapeHtml(v.factura)}</strong></td>
          <td>${escapeHtml(v.cliNombre||v.mesa||'—')}</td>
          <td class="negrita">${fmtMoney(v.total)}</td>
          <td class="gris">${escapeHtml(v.vendedor||'—')}</td>
          <td><button class="btn btn-sm btn-gold" data-click="cobrarPedido('${escapeHtml(v.id)}')">Cobrar</button></td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`:''}
    <div class="tarjeta">
      <span class="t-tit">${ic('history')} Últimas ventas</span>
      ${ultimas.length?`<div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Pedido</th><th>Tipo</th><th>Cliente/Mesa</th><th>Método</th><th>Total</th><th>Estado</th><th>Fecha</th></tr></thead>
        <tbody>${ultimas.map(v=>`<tr>
          <td><strong class="oro">${escapeHtml(v.factura||'—')}</strong></td>
          <td>${escapeHtml(tipoVentaLabel(v.tipo))}</td>
          <td>${escapeHtml(v.cliNombre||v.mesa||'—')}</td>
          <td class="gris" title="${escapeHtml(detallePagos(v))}">${escapeHtml(metodoTexto(v))}</td>
          <td class="negrita">${fmtMoney(v.total)}</td>
          <td>${v.estado==='pagada'?'<span class="pill pill-verde">Pagada</span>':v.estado==='abierta'?'<span class="pill pill-gold">Abierta</span>':'<span class="pill pill-rojo">'+escapeHtml(v.estado||'')+'</span>'}</td>
          <td class="gris chico">${fmtDate(v.fecha)}</td>
        </tr>`).join('')}</tbody>
      </table></div>`:'<p class="gris">No hay ventas aún.</p>'}
    </div>`;
}
export function tipoVentaLabel(t){ return {mesa:'Mesa',domicilio:'Domicilio',llevar:'Para llevar',rapida:'Directa'}[t]||'Venta'; }
