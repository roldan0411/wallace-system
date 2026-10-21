// ============================================================
//  INTERFAZ · Comanda
//  Tiquete de preparación para cocina.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/04-kitchen-kds/04-kitchen-kds.md
// ============================================================
import { STATE, escapeHtml, fmtDate } from '../nucleo/estado.js';
import { MSJ } from '../nucleo/textos.js';
import { reportarError, toast } from '../nucleo/componentes.js';


// ============================================================
//  COMANDA DE COCINA (tiquete de preparación)
// ============================================================
export function comandaHTML(v){
  const neg=STATE.negocio||{};
  const tipo=(v.tipo==='mesa')?('MESA '+(v.mesa||'').toUpperCase())
    :(v.tipo==='domicilio')?'DOMICILIO':(v.tipo==='envio')?'ENVÍO':'PARA LLEVAR';
  const items=(v.items||[]).map(i=>`<div style="font-size:22px;font-weight:bold;margin-bottom:8px;line-height:1.2;">
      ${i.qty} x ${escapeHtml(i.nombre)}${i.obs?`<div style="font-size:14px;font-weight:normal;padding-left:12px;">&gt;&gt; ${escapeHtml(i.obs)}</div>`:''}</div>`).join('');
  return `<div style="font-family:'Courier New',monospace;color:#000;text-align:center;">
    <div style="font-size:16px;letter-spacing:2px;font-weight:bold;">*** COCINA ***</div>
    <div style="font-size:30px;font-weight:bold;margin:6px 0;">${escapeHtml(v.factura||'')}</div>
    <div style="border:3px solid #000;border-radius:6px;padding:8px;margin:8px 0;font-size:26px;font-weight:bold;">${tipo}</div>
    ${v.tipo==='domicilio'?`<div style="font-size:15px;font-weight:bold;margin-bottom:6px;line-height:1.5;">
       ${v.cliNombre?escapeHtml(v.cliNombre)+'<br>':''}${v.cliDir?escapeHtml(v.cliDir):''}${v.cliBarrio?' · '+escapeHtml(v.cliBarrio):''}<br>
       Tel: ${escapeHtml(v.cliTel||'')}${v.domiciliario?'<br>Mensajero: '+escapeHtml(v.domiciliario):''}</div>`:''}
    ${v.tipo==='llevar'&&v.cliNombre?`<div style="font-size:17px;margin-bottom:6px;"><strong>${escapeHtml(v.cliNombre)}</strong></div>`:''}
    <div style="font-size:13px;font-weight:bold;">${fmtDate(v.fecha)}</div>
  </div>
  <hr style="border:1px dashed #000;margin:8px 0;">
  <div style="font-family:'Courier New',monospace;color:#000;">
    <div style="text-align:center;font-size:13px;font-weight:bold;margin-bottom:6px;">— PEDIDO —</div>
    ${items}
    ${v.obs?`<hr style="border:1px dashed #000;margin:8px 0;"><div style="font-size:15px;font-weight:bold;">NOTA: ${escapeHtml(v.obs)}</div>`:''}
  </div>
  <div style="text-align:center;font-size:16px;margin-top:10px;">--- &#9986; ---</div>`;
}
// C3: si la comanda no sale, la cocina no se entera del pedido: se avisa y queda en la auditoría
export function imprimirComandaSegura(v){
  try{ imprimirComanda(v); }
  catch(e){ reportarError('la comanda '+((v&&v.factura)||''), e); toast(MSJ.noSeImprimioLaComandaReimprimela,'error'); }
}
export function imprimirComanda(v){
  if(!v){ return; }
  const w=window.open('','_blank','width=400,height=680');
  if(!w){ toast(MSJ.permiteLasVentanasEmergentesParaImprimir,'error'); return; }
  const estilo='@page{size:80mm auto;margin:0;}'
    +'body{margin:0;padding:4mm 3mm;width:80mm;box-sizing:border-box;'
    +'-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#fff;}';
  w.document.write('<html><head><title>Comanda '+(v.factura||'')+'</title><meta charset="utf-8"><style>'+estilo+'</style></head><body>'+comandaHTML(v)+'</body></html>');
  w.document.close();
  setTimeout(()=>w.print(),400);
}
export function imprimirComandaDe(id){ imprimirComanda(misDatos('ventas').find(x=>x.id===id)); }
