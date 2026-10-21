// ============================================================
//  INTERFAZ · Tiempos de entrega
//  Promedios de preparación y entrega.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/04-kitchen-kds/04-kitchen-kds.md
// ============================================================
import { escapeHtml, fijarEscribiendo } from '../nucleo/estado.js';
import { ic } from '../nucleo/componentes.js';


// ============================================================
//  TIEMPOS DE ENTREGA (como Portal Imperial)
// ============================================================
export function tiempos(){
  fijarEscribiendo(false);
  const vs=misDatos('ventas');
  const conTiempo=vs.filter(v=>v.fecha && v.horaListo)
    .map(v=>({tipo:v.tipo, min:(new Date(v.horaListo)-new Date(v.fecha))/60000, fecha:v.horaListo, ref:v.factura||'—'}))
    .filter(x=>x.min>0 && x.min<240)
    .sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
  const prom=arr=>arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:0;
  const ultimos5=conTiempo.slice(0,5).map(x=>x.min);
  const ultimos3=conTiempo.slice(0,3).map(x=>x.min);
  const promVivo=ultimos5.length>=3?prom(ultimos5):(ultimos3.length?prom(ultimos3):0);
  const promGeneral=prom(conTiempo.map(x=>x.min));
  const porTipo={};
  ['mesa','llevar','domicilio'].forEach(t=>{ const a=conTiempo.filter(x=>x.tipo===t).slice(0,5).map(x=>x.min); porTipo[t]={prom:prom(a),n:a.length}; });
  const base=promVivo||promGeneral;
  const estimado=base?Math.ceil(base/5)*5:0;
  const estimadoMax=estimado?estimado+10:0;
  const enCocina=vs.filter(v=>v.estado!=='anulada'&&v.estadoCocina&&v.estadoCocina!=='listo'&&v.estadoCocina!=='entregado').length;
  const fmtMin=m=>m>0?(m>=60?Math.floor(m/60)+'h '+Math.round(m%60)+'min':Math.round(m)+' min'):'—';
  const etiq={mesa:'Mesa',llevar:'Para llevar',domicilio:'Domicilio'};
  return `
    <div class="tarjeta txt-centro">
      <span class="t-tit centrado">${ic('history')} Tiempo estimado para el cliente</span>
      ${estimado?`<div class="stat-grande">${estimado} – ${estimadoMax} min</div>
        <p class="gris">Basado en los últimos ${Math.min(5,conTiempo.length)} pedidos preparados. Dile este tiempo al cliente.</p>
        ${enCocina>=4?`<p class="rojo chico mt-6">⚠ Hay ${enCocina} pedidos en cocina ahora. El tiempo puede ser mayor.</p>`:''}`
        :`<p class="gris mt-10">Aún no hay suficientes datos. Se necesitan al menos 3 pedidos marcados como "listo". Llevan ${conTiempo.length}.</p>`}
    </div>
    <div class="stats">
      <div class="stat gold"><div class="stat-lbl">Promedio en vivo</div><div class="stat-val">${fmtMin(promVivo)}</div><div class="stat-sub">últimos ${Math.min(5,conTiempo.length)} pedidos</div></div>
      <div class="stat verde"><div class="stat-lbl">Promedio histórico</div><div class="stat-val">${fmtMin(promGeneral)}</div><div class="stat-sub">${conTiempo.length} medidos</div></div>
      <div class="stat azul"><div class="stat-lbl">En cocina ahora</div><div class="stat-val">${enCocina}</div><div class="stat-sub">preparándose</div></div>
    </div>
    <div class="tarjeta">
      <span class="t-tit">${ic('report')} Tiempo promedio por tipo</span>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Tipo</th><th>Promedio</th><th>Medidos</th></tr></thead>
        <tbody>
          <tr><td>Mesa</td><td class="oro negrita">${fmtMin(porTipo.mesa.prom)}</td><td>${porTipo.mesa.n}</td></tr>
          <tr><td>Para llevar</td><td class="oro negrita">${fmtMin(porTipo.llevar.prom)}</td><td>${porTipo.llevar.n}</td></tr>
          <tr><td>Domicilio</td><td class="oro negrita">${fmtMin(porTipo.domicilio.prom)}</td><td>${porTipo.domicilio.n}</td></tr>
        </tbody>
      </table></div>
    </div>
    ${conTiempo.length?`<div class="tarjeta">
      <span class="t-tit">${ic('history')} Últimos pedidos preparados</span>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Pedido</th><th>Tipo</th><th>Tiempo</th></tr></thead>
        <tbody>${conTiempo.slice(0,10).map(x=>`<tr><td><strong class="oro">${escapeHtml(x.ref)}</strong></td><td>${etiq[x.tipo]||'—'}</td><td class="negrita ${x.min>25?'rojo':x.min>15?'oro':'verde'}">${fmtMin(x.min)}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>`:''}`;
}
