// ============================================================
//  INTERFAZ · Informe mensual del negocio
//  Informe imprimible para el super-admin.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/01-super-admin-panel/01-super-admin-panel.md
// ============================================================
import { escapeHtml, fmtDate, fmtMoney } from '../nucleo/estado.js';
import { BOTON, MSJ } from '../nucleo/textos.js';
import { esAdminSistema } from '../nucleo/permisos.js';
import { abrirModal, cerrarModal, logoNegocio, toast } from '../nucleo/componentes.js';
import { nombreMes } from '../gastos/contable.js';

// ============================================================
//  REPORTE MENSUAL DEL NEGOCIO (PDF / impresión) — para el super admin
// ============================================================
export let _repNegMes=null;
export async function reporteMensualNegocio(negId){
  if(!esAdminSistema()){ toast(MSJ.noTienesPermisoParaVerInformes,'error'); return; }
  const neg=(DB.get('negocios')||[]).find(n=>n.id===negId);
  if(!neg){ toast(MSJ.negocioNoEncontrado,'error'); return; }
  // R1: el panel no tiene las ventas de cada negocio; se leen ahora, una vez
  if(FB_READY && Datos.estado.cuentas){
    toast('Cargando datos de '+neg.nombre+'…','info');
    try{ await Datos.leerNegocioCompleto(negId); }
    catch(e){ toast(MSJ.noSePudieronLeerLosDatos,'error'); return; }
  }
  const ventas=(datosDe(negId,'ventas')||[]);
  const mesesSet={}; mesesSet[today().substring(0,7)]=1;
  ventas.forEach(v=>{ const m2=(v.jornada||fechaLocal(v.fecha)||'').substring(0,7); if(m2) mesesSet[m2]=1; });
  const meses=Object.keys(mesesSet).sort().reverse();
  abrirModal({titulo:'📄 Reporte mensual · '+neg.nombre, textoBoton:BOTON.generarPdf, campos:[
    {id:'mes', label:'Mes del informe', tipo:'select', opciones:meses.map(m=>({valor:m,label:nombreMes(m)}))}
  ], extraHTML:`<p class="nota">Se abre listo para imprimir o guardar como PDF (en la ventana de impresión elija "Guardar como PDF").</p>`,
  onGuardar:(d)=>{ cerrarModal(); imprimirReporteNegocio(negId, d.mes); }});
}
export function imprimirReporteNegocio(negId, mes){
  const neg=(DB.get('negocios')||[]).find(n=>n.id===negId); if(!neg) return;
  const jorn=v=>(v.jornada||fechaLocal(v.fecha)||'').substring(0,7);
  const ventas=(datosDe(negId,'ventas')||[]).filter(v=>v.estado==='pagada' && jorn(v)===mes);
  const anuladas=(datosDe(negId,'ventas')||[]).filter(v=>v.estado==='anulada' && jorn(v)===mes);
  const monto=v=>(v.subtotal!=null?v.subtotal:(v.total||0));
  const totalVentas=ventas.reduce((a,v)=>a+monto(v),0);
  // Reparto por método (respeta los pagos divididos)
  const met={efectivo:0,banco:0,tarjeta:0};
  ventas.forEach(v=>{
    const p=(v.pagos&&(v.pagos.efectivo||v.pagos.banco||v.pagos.tarjeta))?v.pagos:null;
    if(p){ const tot=(p.efectivo||0)+(p.banco||0)+(p.tarjeta||0)||1; const m=monto(v);
      met.efectivo+=m*(p.efectivo||0)/tot; met.banco+=m*(p.banco||0)/tot; met.tarjeta+=m*(p.tarjeta||0)/tot; }
    else if(met[v.metodo]!==undefined) met[v.metodo]+=monto(v);
    else met.efectivo+=monto(v);
  });
  // Gastos: de la caja (cierres del mes) + los del negocio
  const cierres=(datosDe(negId,'cierres')||[]).filter(c=>((c.jornada||fechaLocal(c.apertura||c.cierre))||'').substring(0,7)===mes);
  const gastosNeg=(datosDe(negId,'gastos_negocio')||[]).filter(g=>Dominio.fechas.mesDe(g.fecha)===mes && g.origen!=='caja');
  let gastosCaja=0, retiros=0; const porConcepto={};
  cierres.forEach(c=>(c.movimientos||[]).forEach(m=>{
    if(m.tipo==='retiro') retiros+=m.valor||0;
    if(m.tipo==='gasto'){ gastosCaja+=m.valor||0; const k=m.concepto||'Otros'; porConcepto[k]=(porConcepto[k]||0)+(m.valor||0); }
  }));
  gastosNeg.forEach(g=>{ const k=g.concepto||'Otros'; porConcepto[k]=(porConcepto[k]||0)+(g.valor||0); });
  const totalGastosNeg=gastosNeg.reduce((a,g)=>a+g.valor,0);
  const egresos=gastosCaja+totalGastosNeg;
  const utilidad=totalVentas-egresos;
  const conceptos=Object.entries(porConcepto).sort((a,b)=>b[1]-a[1]);
  // Productos más vendidos
  const top=Dominio.ventas.vendidoPorProducto(ventas).map(([n,x])=>[n,{q:x.qty,t:x.total}]).sort((a,b)=>b[1].t-a[1].t).slice(0,10);   // F15
  // Días y descuadres
  const porDia={}; ventas.forEach(v=>{ const d=v.jornada||fechaLocal(v.fecha); porDia[d]=(porDia[d]||0)+monto(v); });
  const dias=Object.keys(porDia).length;
  const sumaDif=cierres.reduce((a,c)=>a+(c.diferencia||0),0);
  const usuarios=(DB.get('usuarios')||[]).filter(u=>u.negocioId===negId);
  const vend=(DB.get('superadmins')||[]).find(x=>x.id===neg.vendedorId);
  const pct=x=>totalVentas>0?(Math.round(x/totalVentas*1000)/10)+'%':'—';
  const fila=(a,b,c2)=>`<tr><td style="padding:6px 8px;">${a}</td><td style="padding:6px 8px;text-align:right;">${b}</td><td style="padding:6px 8px;text-align:right;color:#666;">${c2||''}</td></tr>`;
  const html=`<div style="font-family:Arial,sans-serif;color:#111;max-width:180mm;margin:0 auto;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #132d46;padding-bottom:10px;">
      <div>
        <div style="font-size:23px;font-weight:800;">${escapeHtml(neg.nombre)}</div>
        <div style="font-size:12px;color:#555;">${escapeHtml(neg.tipo||'')}${neg.ciudad?' · '+escapeHtml(neg.ciudad):''}${neg.nit?' · NIT '+escapeHtml(neg.nit):''}</div>
        <div style="font-size:12px;color:#555;">Cliente desde: ${neg.creado?fmtDate(neg.creado).split(' ')[0]:'—'} · Plan ${escapeHtml(neg.plan||'—')} (${fmtMoney(neg.precioMes||0)}/mes)</div>
        ${vend?`<div style="font-size:12px;color:#555;">Vendedor a cargo: <strong>${escapeHtml(vend.nombre)}</strong></div>`:''}
      </div>
      <div style="text-align:right;">
        ${logoNegocio(neg,'style="max-height:58px;"')||''}
        <div style="font-size:11px;color:#888;margin-top:4px;">Informe generado<br>${new Date().toLocaleString('es-CO')}</div>
      </div>
    </div>
    <div style="text-align:center;font-size:17px;font-weight:800;margin:14px 0 4px;">INFORME MENSUAL — ${nombreMes(mes).toUpperCase()}</div>
    <div style="text-align:center;font-size:11px;color:#777;margin-bottom:14px;">Informe interno de gestión. No es un documento tributario.</div>

    <div style="display:flex;gap:10px;margin-bottom:16px;">
      <div style="flex:1;border:1px solid #ddd;border-radius:8px;padding:10px;text-align:center;">
        <div style="font-size:10px;color:#777;letter-spacing:1px;">VENTAS</div>
        <div style="font-size:19px;font-weight:800;">${fmtMoney(totalVentas)}</div>
        <div style="font-size:10px;color:#777;">${ventas.length} venta(s) · ${dias} día(s)</div></div>
      <div style="flex:1;border:1px solid #ddd;border-radius:8px;padding:10px;text-align:center;">
        <div style="font-size:10px;color:#777;letter-spacing:1px;">GASTOS</div>
        <div style="font-size:19px;font-weight:800;color:#c0392b;">${fmtMoney(egresos)}</div>
        <div style="font-size:10px;color:#777;">${pct(egresos)} de las ventas</div></div>
      <div style="flex:1;border:1px solid #ddd;border-radius:8px;padding:10px;text-align:center;">
        <div style="font-size:10px;color:#777;letter-spacing:1px;">UTILIDAD</div>
        <div style="font-size:19px;font-weight:800;color:${utilidad>=0?'#186a3b':'#c0392b'};">${fmtMoney(utilidad)}</div>
        <div style="font-size:10px;color:#777;">${pct(utilidad)} de las ventas</div></div>
      <div style="flex:1;border:1px solid #ddd;border-radius:8px;padding:10px;text-align:center;">
        <div style="font-size:10px;color:#777;letter-spacing:1px;">TICKET PROMEDIO</div>
        <div style="font-size:19px;font-weight:800;">${fmtMoney(ventas.length?Math.round(totalVentas/ventas.length):0)}</div>
        <div style="font-size:10px;color:#777;">por venta</div></div>
    </div>

    <h3 style="font-size:13px;border-bottom:1px solid #999;padding-bottom:3px;">Ventas por forma de pago</h3>
    <table style="width:100%;font-size:12px;border-collapse:collapse;">
      ${fila('Efectivo',fmtMoney(Math.round(met.efectivo)),pct(met.efectivo))}
      ${fila('Banco / transferencia',fmtMoney(Math.round(met.banco)),pct(met.banco))}
      ${fila('Tarjeta / datáfono',fmtMoney(Math.round(met.tarjeta)),pct(met.tarjeta))}
      <tr style="border-top:2px solid #333;font-weight:800;">${'<td style="padding:6px 8px;">TOTAL</td><td style="padding:6px 8px;text-align:right;">'+fmtMoney(totalVentas)+'</td><td></td>'}</tr>
    </table>

    <h3 style="font-size:13px;border-bottom:1px solid #999;padding-bottom:3px;margin-top:16px;">En qué se fue la plata</h3>
    <table style="width:100%;font-size:12px;border-collapse:collapse;">
      ${conceptos.length?conceptos.map(c=>fila(escapeHtml(c[0]),fmtMoney(c[1]),pct(c[1]))).join(''):'<tr><td style="padding:6px 8px;color:#777;">Sin gastos registrados este mes</td></tr>'}
      <tr style="border-top:2px solid #333;font-weight:800;"><td style="padding:6px 8px;">TOTAL EGRESOS</td><td style="padding:6px 8px;text-align:right;">${fmtMoney(egresos)}</td><td style="padding:6px 8px;text-align:right;color:#666;">${pct(egresos)}</td></tr>
    </table>
    ${retiros>0?`<p style="font-size:11px;color:#777;margin-top:6px;">Retiros del dueño en el mes: ${fmtMoney(retiros)} (no son gasto del negocio).</p>`:''}

    ${top.length?`<h3 style="font-size:13px;border-bottom:1px solid #999;padding-bottom:3px;margin-top:16px;">Lo más vendido</h3>
    <table style="width:100%;font-size:12px;border-collapse:collapse;">
      <tr style="background:#f2f4f7;font-weight:700;"><td style="padding:6px 8px;">Producto</td><td style="padding:6px 8px;text-align:right;">Unidades</td><td style="padding:6px 8px;text-align:right;">Total</td></tr>
      ${top.map(t=>fila(escapeHtml(t[0]),t[1].q,fmtMoney(t[1].t))).join('')}
    </table>`:''}

    <h3 style="font-size:13px;border-bottom:1px solid #999;padding-bottom:3px;margin-top:16px;">Control y operación</h3>
    <table style="width:100%;font-size:12px;border-collapse:collapse;">
      ${fila('Cierres de caja del mes',cierres.length,'')}
      ${fila('Resultado de los cierres', sumaDif===0?'Cuadraron todos':(sumaDif>0?'Sobró '+fmtMoney(sumaDif):'Faltó '+fmtMoney(Math.abs(sumaDif))),'')}
      ${fila('Ventas anuladas',anuladas.length,fmtMoney(anuladas.reduce((a,v)=>a+(v.total||0),0)))}
      ${fila('Usuarios del sistema',usuarios.length,usuarios.filter(u=>u.activo!==false).length+' activo(s)')}
      ${fila('Sucursales',(neg.sucursales||[]).length||1,'')}
    </table>

    <div style="margin-top:26px;border-top:1px dashed #999;padding-top:8px;text-align:center;font-size:10px;color:#777;">
      WALLACE COMPANY SYSTEM · wallacecompany11@gmail.com<br>
      Informe generado automáticamente por el sistema · ${escapeHtml(neg.nombre)} · ${nombreMes(mes)}
    </div>
  </div>`;
  const w=window.open('','_blank','width=900,height=700');
  if(!w){ toast(MSJ.permiteLasVentanasEmergentesParaGenerar,'error'); return; }
  w.document.write('<html><head><title>Informe '+escapeHtml(neg.nombre)+' '+nombreMes(mes)+'</title><meta charset="utf-8"><style>@page{size:letter;margin:14mm;}body{margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;}h3{margin:14px 0 6px;}</style></head><body>'+html+'</body></html>');
  w.document.close();
  setTimeout(()=>w.print(),500);
}
