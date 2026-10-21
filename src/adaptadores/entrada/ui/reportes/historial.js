// ============================================================
//  INTERFAZ · Historial
//  Todas las ventas con filtros.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/08-sales-reports/08-sales-reports.md
// ============================================================
import { escapeHtml, fijarEscribiendo, fmtDate, fmtMoney } from '../nucleo/estado.js';
import { tienePermiso } from '../nucleo/permisos.js';
import { ic } from '../nucleo/componentes.js';
import { render } from '../nucleo/navegacion.js';
import { detallePagos } from '../ventas/cobro.js';
import { nombreMes } from '../gastos/contable.js';


// ============================================================
//  HISTORIAL (todas las ventas, con filtros)
// ============================================================
export let _hBusca='', _hFiltro='todas', _hMes=null;
export function historial(){
  fijarEscribiendo(false);
  const mes=_hMes||today().substring(0,7);
  let vs=misDatos('ventas').slice().sort((a,b)=>new Date(b.fecha||0)-new Date(a.fecha||0));
  // Por defecto se muestra el mes seleccionado (como Portal Imperial)
  if(mes!=='todos') vs=vs.filter(v=>mesDeJornada(v)===mes);
  if(_hFiltro==='pagadas') vs=vs.filter(v=>v.estado==='pagada');
  else if(_hFiltro==='anuladas') vs=vs.filter(v=>v.estado==='anulada');
  else if(_hFiltro==='abiertas') vs=vs.filter(v=>v.estado==='abierta');
  if(_hBusca){ const q=_hBusca.toLowerCase();
    vs=vs.filter(v=>(v.factura||'').toLowerCase().includes(q)||(v.cliNombre||'').toLowerCase().includes(q)||(v.cliTel||'').includes(q)); }
  const etiq={mesa:'Mesa',llevar:'Para llevar',domicilio:'Domicilio',envio:'Envío'};
  const pagadas=vs.filter(v=>v.estado==='pagada');
  const totalPag=pagadas.reduce((a,v)=>a+Dominio.ventas.ventaDelNegocio(v),0);   // F21: lo del negocio
  const totalCobrado=pagadas.reduce((a,v)=>a+(v.total||0),0);                  // con propina, recargo y domicilio
  // Meses disponibles
  const mesesSet={}; mesesSet[today().substring(0,7)]=1;
  misDatos('ventas').forEach(v=>{ const m2=mesDeJornada(v); if(m2) mesesSet[m2]=1; });
  const meses=Object.keys(mesesSet).sort().reverse();
  return `
    <div class="tarjeta">
      <div class="t-cab">
        <span class="t-tit">${ic('history')} Historial de ventas</span>
        <div class="t-acc">
          <select class="busca" data-change="elegirMesHistorial(this.value)">
            ${meses.map(m=>`<option value="${escapeHtml(m)}" ${m===mes?'selected':''}>${nombreMes(m)}</option>`).join('')}
            <option value="todos" ${mes==='todos'?'selected':''}>Todo el historial</option>
          </select>
          <input type="text" class="busca" placeholder="🔍 Factura, cliente, teléfono..." value="${escapeHtml(_hBusca)}" data-input="buscarHistorial(this.value)">
        </div>
      </div>
      <div class="cats">
        ${[['todas','Todas'],['pagadas','Pagadas'],['abiertas','Por cobrar'],['anuladas','Anuladas']].map(f=>`<button class="cat ${_hFiltro===f[0]?'on':''}" data-click="elegirFiltroHistorial('${escapeHtml(f[0])}')">${f[1]}</button>`).join('')}
      </div>
      <p class="nota">${vs.length} venta(s) · Ventas del negocio: <strong class="oro">${fmtMoney(totalPag)}</strong>${totalCobrado!==totalPag?` · cobrado con propinas, recargos y domicilios: ${fmtMoney(totalCobrado)}`:''}</p>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Factura</th><th>Tipo</th><th>Cliente</th><th>Método</th><th>Total</th><th>Estado</th><th>Jornada</th><th></th></tr></thead>
        <tbody>${vs.length? vs.slice(0,200).map(v=>`<tr>
          <td><strong class="oro">${escapeHtml(v.factura||'—')}</strong></td>
          <td>${etiq[v.tipo]||'—'}</td>
          <td>${escapeHtml(v.cliNombre||v.mesa||'—')}</td>
          <td class="gris" title="${escapeHtml(detallePagos(v))}">${escapeHtml(metodoTexto(v))}</td>
          <td class="negrita">${fmtMoney(v.total)}</td>
          <td>${v.estado==='pagada'?'<span class="pill pill-verde">Pagada</span>':v.estado==='anulada'?'<span class="pill pill-rojo">Anulada</span>':'<span class="pill pill-gold">Por cobrar</span>'}</td>
          <td class="gris chico">${jornadaDe(v)}${jornadaDe(v)!==fechaLocal(v.fecha)?'<br><span class="oro chico">madrugada</span>':''}<br><span class="gris chico">${fmtDate(v.fecha).split(' ').slice(1).join(' ')}</span></td>
          <td>${tienePermiso('imprimir')&&v.estado==='pagada'?`<button class="btn btn-sm" data-click="imprimirFactura('${escapeHtml(v.id)}')" title="Reimprimir">🖨️</button>`:''}</td>
        </tr>`).join('') : '<tr><td colspan="8" class="gris">Sin ventas.</td></tr>'}</tbody>
      </table></div>
    </div>`;
}
export function elegirMesHistorial(v){ _hMes=v; render(); }
export function buscarHistorial(v){ _hBusca=v; render(); }
export function elegirFiltroHistorial(f){ _hFiltro=f; render(); }
