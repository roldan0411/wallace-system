// ============================================================
//  INTERFAZ · Registro contable
//  Resumen contable mensual y reimpresión de cierres.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/09-expenses-accounting/09-expenses-accounting.md
// ============================================================
import { STATE, escapeHtml, fijarEscribiendo, fmtMoney } from '../nucleo/estado.js';
import { MSJ } from '../nucleo/textos.js';
import { ic, pProd, pProds, toast } from '../nucleo/componentes.js';
import { render } from '../nucleo/navegacion.js';
import { imprimirCierre } from '../caja/caja.js';
import { acumConcepto, catalogoConceptos, conceptosCompactoHTML } from './gastos.js';


// ============================================================
//  CONTABLE
// ============================================================
export let _mesCont=null;
export function contable(){
  fijarEscribiendo(false);
  const neg=STATE.negocio;
  const mes=_mesCont||today().substring(0,7);
  // Mes anterior para el comparativo
  const [anio,mnum]=mes.split('-').map(Number);
  const dPrev=new Date(anio,mnum-2,1); const mesPrev=dPrev.getFullYear()+'-'+String(dPrev.getMonth()+1).padStart(2,'0');
  const vs=misDatos('ventas').filter(v=>v.estado==='pagada');
  const delMes=vs.filter(v=>mesDeJornada(v)===mes);
  const delPrev=vs.filter(v=>mesDeJornada(v)===mesPrev);
  const totalVentas=delMes.reduce((a,v)=>a+Dominio.ventas.ventaDelNegocio(v),0);
  const totalPrev=delPrev.reduce((a,v)=>a+Dominio.ventas.ventaDelNegocio(v),0);
  const difV=totalVentas-totalPrev;
  const pctV=totalPrev>0?Math.round((difV/totalPrev)*100):0;
  const metodos=sumaPorMetodo(delMes, v=>Dominio.ventas.ventaDelNegocio(v));
  const propinas=delMes.reduce((a,v)=>a+(v.propina||0),0);
  const domis=delMes.reduce((a,v)=>a+(v.valorDom||0),0);
  const recargos=delMes.reduce((a,v)=>a+(v.recargo||0),0);
  // ---- EGRESOS ----
  // Los gastos de caja se leen de los MOVIMIENTOS REALES del cajón (caja abierta
  // y cierres del mes); las copias en Gastos del Negocio solo suman si su
  // movimiento no aparece (Dominio.gastos.copiasSinMovimiento). Los del negocio, aparte.
  const gastosMes=misDatos('gastos_negocio').filter(g=>Dominio.fechas.mesDe(g.fecha)===mes);
  const gastos=gastosMes.filter(g=>g.origen!=='caja');
  const totalGastos=gastos.reduce((a,g)=>a+g.valor,0);      // solo los del negocio
  const cierres=misDatos('cierres').filter(c=>(jornadaCierre(c)||'').substring(0,7)===mes);
  const movsMes=[];
  cierres.forEach(c=>(c.movimientos||[]).forEach(m=>movsMes.push(m)));
  // Contable es de todo el negocio: entran las cajas abiertas de todas las sedes (F1)
  Dominio.caja.cajasDe(misDatos('caja_actual')).forEach(cajaAbC=>{
    if(fechaLocal(cajaAbC.apertura).substring(0,7)===mes) (cajaAbC.movimientos||[]).forEach(m=>movsMes.push(m));
  });
  let retiros=0, gastosCaja=0;
  const gCaja={}, gNeg={}, ofi=catalogoConceptos();
  movsMes.forEach(m=>{
    if(m.tipo==='retiro'){ retiros+=m.valor||0; return; }
    if(m.tipo!=='gasto') return;
    gastosCaja+=m.valor||0;
    acumConcepto(gCaja, m.concepto||'Otros', m.valor||0, ofi);
  });
  Dominio.gastos.copiasSinMovimiento(gastosMes, movsMes).forEach(g=>{
    gastosCaja+=g.valor||0;
    acumConcepto(gCaja, g.concepto||'Otros', g.valor||0, ofi);
  });
  const egresos=totalGastos+gastosCaja;
  const utilidad=totalVentas-egresos;
  const sumaDif=cierres.reduce((a,c)=>a+(c.diferencia||0),0);
  gastos.forEach(g=>acumConcepto(gNeg,g.concepto,g.valor,ofi));
  const concCaja=Object.entries(gCaja).sort((a,b)=>b[1]-a[1]);
  const concNeg=Object.entries(gNeg).sort((a,b)=>b[1]-a[1]);
  // Productos más vendidos del mes
  const topProd=Dominio.ventas.vendidoPorProducto(delMes).sort((a,b)=>b[1].qty-a[1].qty).slice(0,10);   // F15
  // Días de mayor venta
  const porDia={}; delMes.forEach(v=>{ const d=jornadaDe(v); porDia[d]=(porDia[d]||0)+Dominio.ventas.ventaDelNegocio(v); });
  const topDias=Object.entries(porDia).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const mesesSet={}; mesesSet[today().substring(0,7)]=1;
  vs.forEach(v=>{ const m2=mesDeJornada(v); if(m2) mesesSet[m2]=1; });
  misDatos('gastos_negocio').forEach(g=>{ if(g.fecha) mesesSet[Dominio.fechas.mesDe(g.fecha)]=1; });
  const meses=Object.keys(mesesSet).sort().reverse();
  const gastosNeg=totalGastos;
  window._contData={mes,nombreMes:nombreMes(mes),totalVentas,metodos,totalGastos,gastosCaja,gastosNeg,
    egresos,utilidad,cierres,propinas,domis,recargos,retiros,
    conceptos:concCaja.concat(concNeg)};

  return `
    <div class="tarjeta">
      <div class="t-cab">
        <div><span class="t-tit">${ic('report')} Registro Contable Mensual</span>
          <p class="gris">Informe interno de gestión para el dueño. No es tributario ni tiene relación con la DIAN.</p></div>
        <div class="t-acc">
          <select class="busca" data-change="elegirMesContable(this.value)">
            ${meses.map(m=>`<option value="${escapeHtml(m)}" ${m===mes?'selected':''}>${nombreMes(m)}</option>`).join('')}
          </select>
          <button class="btn btn-gold btn-sm" data-click="imprimirContable()">🖨️ PDF / Imprimir</button>
        </div>
      </div>
    </div>
    <div class="stats">
      <div class="stat verde"><div class="stat-ico verde">${ic('cash')}</div><div class="stat-lbl">Ventas del mes</div><div class="stat-val">${fmtMoney(totalVentas)}</div><div class="stat-sub">${totalPrev>0?(pctV>=0?'▲ +':'▼ ')+pctV+'% vs mes anterior':delMes.length+' venta(s)'}</div></div>
      <div class="stat rojo"><div class="stat-ico rojo">${ic('cash')}</div><div class="stat-lbl">Gastos del mes</div><div class="stat-val">${fmtMoney(egresos)}</div><div class="stat-sub">caja + negocio (sin retiros)</div></div>
      <div class="stat gold"><div class="stat-ico gold">${ic('report')}</div><div class="stat-lbl">Utilidad estimada</div><div class="stat-val">${fmtMoney(utilidad)}</div><div class="stat-sub">ventas − egresos</div></div>
      <div class="stat azul"><div class="stat-ico azul">${ic('history')}</div><div class="stat-lbl">Cierres del mes</div><div class="stat-val">${cierres.length}</div><div class="stat-sub">${sumaDif===0?'sin descuadres':(sumaDif>0?'sobró '+fmtMoney(sumaDif):'faltó '+fmtMoney(Math.abs(sumaDif)))}</div></div>
    </div>
    <div class="grid2">
      <div class="tarjeta"><span class="t-tit">${ic('cash')} Ventas por método de pago</span>
        <div class="linea"><span>Efectivo</span><strong class="verde">${fmtMoney(metodos.efectivo)}</strong></div>
        <div class="linea"><span>Banco / Transferencia</span><strong class="azul">${fmtMoney(metodos.banco)}</strong></div>
        <div class="linea"><span>Tarjeta</span><strong class="oro">${fmtMoney(metodos.tarjeta)}</strong></div>
        <div class="linea total-linea"><span>TOTAL VENTAS</span><strong>${fmtMoney(totalVentas)}</strong></div>
      </div>
      <div class="tarjeta"><span class="t-tit">${ic('cash')} Egresos por concepto (lo que se gastó)</span>
        ${concCaja.length?`<div class="cc-sec"><span>De la caja diaria</span><span>${fmtMoney(gastosCaja)}</span></div>
          ${conceptosCompactoHTML(gCaja,{id:'ct-caja',max:5,base:egresos})}`:''}
        ${concNeg.length?`<div class="cc-sec mt-14"><span>Gastos del negocio</span><span>${fmtMoney(totalGastos)}</span></div>
          ${conceptosCompactoHTML(gNeg,{id:'ct-neg',max:6,base:egresos})}`:''}
        ${(!concCaja.length&&!concNeg.length)?'<p class="gris">Sin gastos este mes.</p>':`
          <div class="linea total-linea"><span>TOTAL EGRESOS</span><strong class="rojo">${fmtMoney(egresos)}</strong></div>
          ${totalVentas>0?`<p class="nota mt-8">Los gastos se llevan el <strong class="rojo">${Math.round(egresos/totalVentas*1000)/10}%</strong> de lo vendido. Queda el <strong class="verde">${Math.round(utilidad/totalVentas*1000)/10}%</strong> de utilidad.</p>`:''}`}
      </div>
    </div>
    ${(propinas+domis+recargos+retiros)>0?`<div class="tarjeta">
      <span class="t-tit">${ic('users')} Dinero de terceros (no es ingreso)</span>
      ${propinas>0?`<div class="linea"><span>Propinas</span><strong class="verde">${fmtMoney(propinas)}</strong></div>`:''}
      ${domis>0?`<div class="linea"><span>Domicilios</span><strong class="azul">${fmtMoney(domis)}</strong></div>`:''}
      ${recargos>0?`<div class="linea"><span>Recargos datáfono</span><strong class="oro">${fmtMoney(recargos)}</strong></div>`:''}
      ${retiros>0?`<div class="linea"><span>Retiros del dueño (no es gasto)</span><strong class="gris">${fmtMoney(retiros)}</strong></div>`:''}
    </div>`:''}
    <div class="grid2">
      <div class="tarjeta"><span class="t-tit">${ic('box')} ${pProds(true)} más vendidos</span>
        ${topProd.length?`<div class="tabla-wrap"><table class="tabla">
          <thead><tr><th>${pProd(true)}</th><th>Cant.</th><th>Total</th></tr></thead>
          <tbody>${topProd.map(p=>`<tr><td>${escapeHtml(p[0])}</td><td class="negrita">${p[1].qty}</td><td class="oro">${fmtMoney(p[1].total)}</td></tr>`).join('')}</tbody>
        </table></div>`:'<p class="gris">Sin ventas este mes.</p>'}
      </div>
      <div class="tarjeta"><span class="t-tit">${ic('history')} Días de mayor venta</span>
        ${topDias.length?`<div class="tabla-wrap"><table class="tabla">
          <thead><tr><th>Día</th><th>Ventas</th></tr></thead>
          <tbody>${topDias.map(d=>`<tr><td>${d[0]}</td><td class="negrita oro">${fmtMoney(d[1])}</td></tr>`).join('')}</tbody>
        </table></div>`:'<p class="gris">Sin datos.</p>'}
      </div>
    </div>
    ${cierres.length?`<div class="tarjeta"><span class="t-tit">${ic('history')} Cierres de caja del mes (control de descuadres)</span>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Día</th><th>Cajero</th><th>Esperado</th><th>Contado</th><th>Base dejada</th><th>Retirado</th><th>Resultado</th><th></th></tr></thead>
        <tbody>${cierres.map(c=>`<tr>
          <td>${jornadaCierre(c)}${fechaLocal(c.cierre)!==jornadaCierre(c)?'<br><span class="gris chico">cerró el '+fechaLocal(c.cierre)+'</span>':''}</td>
          <td>${escapeHtml(c.cerradaPor||c.cajero||'—')}</td>
          <td>${fmtMoney(c.esperado||0)}</td>
          <td>${fmtMoney(c.contado||0)}</td>
          <td class="oro">${c.baseManana!==undefined?fmtMoney(c.baseManana):'—'}</td>
          <td class="negrita">${c.retiroJefe?fmtMoney(c.retiroJefe):'—'}</td>
          <td>${(c.diferencia||0)===0?'<span class="pill pill-verde">Cuadró</span>':(c.diferencia>0?'<span class="pill pill-azul">Sobró '+fmtMoney(c.diferencia)+'</span>':'<span class="pill pill-rojo">Faltó '+fmtMoney(Math.abs(c.diferencia))+'</span>')}</td>
          <td><button class="btn btn-sm" data-click="reimprimirCierre('${escapeHtml(c.id)}')" title="Reimprimir cuadre">🖨️</button></td>
        </tr>`).join('')}</tbody>
      </table></div></div>`:''}`;
}
export function reimprimirCierre(id){
  const c=misDatos('cierres').find(x=>x.id===id);
  if(!c){ toast(MSJ.cierreNoEncontrado,'error'); return; }
  imprimirCierre(c);
}
export function nombreMes(m){
  if(!m) return '';
  const p=m.split('-');
  const n=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return (n[parseInt(p[1])-1]||'')+' de '+p[0];
}
export function elegirMesContable(v){ _mesCont=v; render(); }
