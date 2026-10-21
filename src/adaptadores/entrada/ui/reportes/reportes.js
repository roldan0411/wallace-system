// ============================================================
//  INTERFAZ · Reportes
//  Reportes de ventas.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/08-sales-reports/08-sales-reports.md
// ============================================================
import { STATE, escapeHtml, fijarEscribiendo, fmtCorto, fmtMoney } from '../nucleo/estado.js';
import { ic, pPersonal, pProd, pProds } from '../nucleo/componentes.js';


// ============================================================
//  REPORTES
// ============================================================
export function reportes(){
  fijarEscribiendo(false);
  const neg=STATE.negocio;
  const vs=misDatos('ventas').filter(v=>v.estado==='pagada');
  const h=today();
  const hoy=vs.filter(v=>jornadaDe(v)===h);
  const totHoy=hoy.reduce((a,v)=>a+Dominio.ventas.ventaDelNegocio(v),0);
  const ticket=hoy.length?Math.round(totHoy/hoy.length):0;
  const d7=new Date(); d7.setDate(d7.getDate()-7);
  const k7=fechaLocal(d7);
  const hace7=vs.filter(v=>jornadaDe(v)===k7).reduce((a,v)=>a+Dominio.ventas.ventaDelNegocio(v),0);
  const cambio=hace7>0?Math.round((totHoy-hace7)/hace7*100):0;
  // Gráfico 7 días
  const dias=[];
  for(let i=6;i>=0;i--){
    const d=new Date(); d.setDate(d.getDate()-i);
    const k=fechaLocal(d);
    dias.push({lbl:['DOM','LUN','MAR','MIÉ','JUE','VIE','SÁB'][d.getDay()],
      tot:vs.filter(v=>jornadaDe(v)===k).reduce((a,v)=>a+Dominio.ventas.ventaDelNegocio(v),0)});
  }
  const mx=Math.max.apply(null,dias.map(d=>d.tot).concat([1]));
  // Gráfico 12 meses
  const meses=[];
  const MESNOM=['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
  for(let i=11;i>=0;i--){
    const d=new Date(); d.setDate(1); d.setMonth(d.getMonth()-i);
    const k=fechaLocal(d).substring(0,7);
    // Mostrar el año corto en enero o en el primer mes del gráfico, para distinguir años
    const yy=String(d.getFullYear()).slice(2);
    const etq=(d.getMonth()===0||i===11)?MESNOM[d.getMonth()]+' '+yy:MESNOM[d.getMonth()];
    meses.push({lbl:etq,
      tot:vs.filter(v=>mesDeJornada(v)===k).reduce((a,v)=>a+Dominio.ventas.ventaDelNegocio(v),0)});
  }
  const mxM=Math.max.apply(null,meses.map(m=>m.tot).concat([1]));
  // Ventas últimos 30 días para más/menos vendidos y horas pico
  const d30=new Date(); d30.setDate(d30.getDate()-30);
  const k30=fechaLocal(d30);
  const v30=vs.filter(v=>jornadaDe(v)>=k30);
  const ordenados=Dominio.ventas.vendidoPorProducto(v30).sort((a,b)=>b[1].qty-a[1].qty);   // F15: por producto, no por nombre
  const top=ordenados.slice(0,8);
  const menos=ordenados.slice(-8).reverse();
  // Horas pico (30 días)
  const horas=new Array(24).fill(0);
  v30.forEach(v=>{ const hh=new Date(v.fecha).getHours(); horas[hh]+=Dominio.ventas.ventaDelNegocio(v); });
  const maxHora=Math.max.apply(null,horas.concat([1]));
  const horasActivas=horas.map((tot,hh)=>({h:hh,tot})).filter(x=>x.tot>0);
  // Resumen del día: propinas por mesero, platos de hoy, domicilios
  const usaPropinaNeg=(neg.usaPropina!==undefined?neg.usaPropina:neg.usaCocina);
  const usaDomiciliosNeg=(neg.usaDomicilios!==undefined?neg.usaDomicilios:(neg.tiposEntrega||[]).indexOf('domicilio')>-1);
  const propinasHoy=hoy.reduce((a,v)=>a+(v.propina||0),0);
  // Reparto en partes iguales entre los meseros ACTIVOS; además, quién atendió cada propina (F15)
  const meseros=(DB.get('usuarios')||[]).filter(u=>u.negocioId===neg.id && u.rol==='mesero' && u.activo!==false).map(u=>u.nombre);
  const propPorPersona=Dominio.ventas.propinasPorPersona(hoy);
  const numMeseros=meseros.length||1;
  const propinaPorMesero=propinasHoy/numMeseros;
  const topHoy=Dominio.ventas.vendidoPorProducto(hoy).map(([n,x])=>[n,x.qty]).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const domiciliosHoy=hoy.filter(v=>v.tipo==='domicilio').length;
  const recargosHoy=hoy.reduce((a,v)=>a+(v.recargo||0),0);
  window._repData={totHoy,hoy,ticket,cambio,hace7,dias,meses,top,mes:h.substring(0,7)};

  return `
    <div class="tarjeta">
      <div class="t-cab">
        <span class="t-tit">${ic('report')} Resumen del Día (Hoy)</span>
        <button class="btn btn-gold btn-sm" data-click="imprimirReporte()">🖨️ PDF / Imprimir</button>
      </div>
      <div class="stats mb-6">
        <div class="stat verde"><div class="stat-lbl">Vendido hoy</div><div class="stat-val">${fmtMoney(totHoy)}</div><div class="stat-sub">${hoy.length} ventas</div></div>
        ${usaPropinaNeg?`<div class="stat gold"><div class="stat-lbl">Propinas del día</div><div class="stat-val">${fmtMoney(propinasHoy)}</div><div class="stat-sub">para ${pPersonal()}</div></div>`:''}
        ${usaDomiciliosNeg?`<div class="stat azul"><div class="stat-lbl">Domicilios</div><div class="stat-val">${domiciliosHoy}</div><div class="stat-sub">recargos: ${fmtMoney(recargosHoy)}</div></div>`:`<div class="stat gold"><div class="stat-lbl">Ticket promedio</div><div class="stat-val">${fmtMoney(ticket)}</div><div class="stat-sub">por venta</div></div>`}
      </div>
      <div class="grid2">
        ${usaPropinaNeg?`<div>
          <p class="oro negrita mb-8">💵 Propinas a repartir (entre ${numMeseros} ${pPersonal()})</p>
          ${propinasHoy>0?`<div class="p-12-14 fondo-acc-rgb-08 radio-10">
            <div class="linea borde-ninguno p-2-0"><span class="negrita">A cada uno le toca:</span><strong class="oro">${fmtMoney(propinaPorMesero)}</strong></div>
            ${meseros.length?`<p class="gris chico mt-4">${meseros.map(m=>escapeHtml(m)).join(' · ')}</p>`:''}
            ${propPorPersona.length?`<p class="gris chico mt-6">Recibidas por: ${propPorPersona.map(([n,t])=>escapeHtml(n)+' '+fmtMoney(t)).join(' · ')}</p>`:''}
          </div>`:'<p class="gris">No hay propinas registradas hoy.</p>'}
        </div>`:''}
        <div>
          <p class="oro negrita mb-8"><span class="ico-txt">${ic('box')}</span> ${pProds(true)} más vendidos hoy</p>
          ${topHoy.length?`<table class="tabla"><tbody>${topHoy.map(([n,q])=>`<tr><td>${escapeHtml(n)}</td><td class="oro negrita txt-der">${q}</td></tr>`).join('')}</tbody></table>`:'<p class="gris">Aún no hay ventas hoy.</p>'}
        </div>
      </div>
    </div>
    <div class="stats">
      <div class="stat verde"><div class="stat-ico verde">${ic('cash')}</div><div class="stat-lbl">Ventas Hoy</div><div class="stat-val">${fmtMoney(totHoy)}</div><div class="stat-sub">${hoy.length} transacciones</div></div>
      <div class="stat gold"><div class="stat-ico gold">${ic('report')}</div><div class="stat-lbl">Ticket Promedio</div><div class="stat-val">${fmtMoney(ticket)}</div><div class="stat-sub">por venta</div></div>
      <div class="stat ${cambio>=0?'verde':'rojo'}"><div class="stat-ico ${cambio>=0?'verde':'rojo'}">${ic('history')}</div><div class="stat-lbl">vs. mismo día semana pasada</div><div class="stat-val">${cambio>=0?'+':''}${cambio}%</div><div class="stat-sub">Hace 7 días: ${fmtMoney(hace7)}</div></div>
    </div>
    <div class="grid2">
      <div class="tarjeta"><span class="t-tit">${ic('report')} Ventas por Día (7 días)</span>
        <div class="barras">${dias.map(d=>`<div class="barra"><div class="b-val">${d.tot>0?fmtCorto(d.tot):''}</div><div class="b-fill" style="height:${Math.max(4,(d.tot/mx)*130)}px"></div><div class="b-lbl">${d.lbl}</div></div>`).join('')}</div></div>
      <div class="tarjeta"><span class="t-tit">${ic('report')} Ventas Mensuales (12 meses)</span>
        <div class="barras">${meses.map(m=>`<div class="barra"><div class="b-val">${m.tot>0?fmtCorto(m.tot):''}</div><div class="b-fill" style="height:${Math.max(4,(m.tot/mxM)*130)}px"></div><div class="b-lbl">${m.lbl}</div></div>`).join('')}</div></div>
    </div>
    <div class="tarjeta"><span class="t-tit">${ic('history')} Horas Pico (últimos 30 días)</span>
      ${horasActivas.length?`<div class="barras">${horasActivas.map(x=>`<div class="barra"><div class="b-val">${fmtCorto(x.tot)}</div><div class="b-fill" style="height:${Math.max(4,(x.tot/maxHora)*130)}px"></div><div class="b-lbl">${x.h}H</div></div>`).join('')}</div>
        <p class="nota mt-8">Te ayuda a saber a qué horas necesitas más personal.</p>`:'<p class="gris">Sin datos.</p>'}
    </div>
    <div class="grid2">
      <div class="tarjeta"><span class="t-tit">${ic('box')} ${pProds(true)} más vendidos (30 días)</span>
        ${top.length?`<div class="tabla-wrap"><table class="tabla">
          <thead><tr><th>${pProd(true)}</th><th>Uds.</th><th>Total</th></tr></thead>
          <tbody>${top.map(([n,d])=>`<tr><td>${escapeHtml(n)}</td><td class="negrita">${d.qty}</td><td class="oro">${fmtMoney(d.total)}</td></tr>`).join('')}</tbody>
        </table></div>`:'<p class="gris">Sin datos.</p>'}
      </div>
      <div class="tarjeta"><span class="t-tit">${ic('report')} ${pProds(true)} menos vendidos (30 días)</span>
        ${menos.length?`<div class="tabla-wrap"><table class="tabla">
          <thead><tr><th>${pProd(true)}</th><th>Uds.</th><th>Total</th></tr></thead>
          <tbody>${menos.map(([n,d])=>`<tr><td>${escapeHtml(n)}</td><td class="negrita">${d.qty}</td><td class="gris">${fmtMoney(d.total)}</td></tr>`).join('')}</tbody>
        </table></div>
        <p class="nota mt-8">Candidatos a quitar o renovar en el menú.</p>`:'<p class="gris">Sin datos.</p>'}
      </div>
    </div>`;
}
