// ============================================================
//  INTERFAZ · Impresión de reportes
//  Reporte de ventas y contable imprimibles.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/12-invoice-printing/12-invoice-printing.md
// ============================================================
import { STATE, escapeHtml, fmtMoney } from '../nucleo/estado.js';
import { MSJ } from '../nucleo/textos.js';
import { logoNegocio, toast } from '../nucleo/componentes.js';

export function imprimirReporte(){
  const d=window._repData; if(!d){ toast(MSJ.abrePrimeroLosReportes,'error'); return; }
  const neg=STATE.negocio;
  const html=`<div style="font-family:Arial,sans-serif;color:#000;max-width:800px;margin:0 auto;padding:18px;">
    <div style="text-align:center;border-bottom:2px solid #000;padding-bottom:10px;">
      ${logoNegocio(neg,'style="max-height:70px;"')||''}
      <div style="font-size:22px;font-weight:800;">${escapeHtml(neg.nombre)}</div>
      <div style="font-size:16px;font-weight:700;margin-top:6px;">Reporte de Ventas</div>
      <div style="font-size:11px;color:#555;">Generado el ${new Date().toLocaleString('es-CO')}</div>
    </div>
    <table style="width:100%;font-size:13px;margin-top:16px;">
      <tr><td style="padding:5px;">Vendido hoy</td><td style="text-align:right;font-weight:bold;">${fmtMoney(d.totHoy)}</td></tr>
      <tr><td style="padding:5px;">Transacciones</td><td style="text-align:right;">${d.hoy.length}</td></tr>
      <tr><td style="padding:5px;">Ticket promedio</td><td style="text-align:right;">${fmtMoney(d.ticket)}</td></tr>
    </table>
    ${d.top.length?`<h3 style="font-size:14px;margin-top:18px;border-bottom:1px solid #999;">Más vendidos</h3>
    <table style="width:100%;font-size:12px;border-collapse:collapse;">
      ${d.top.map(t=>`<tr style="border-bottom:1px solid #eee;"><td style="padding:5px;">${escapeHtml(t[0])}</td><td style="padding:5px;text-align:right;font-weight:600;">${t[1]}</td></tr>`).join('')}
    </table>`:''}
    <div style="margin-top:24px;text-align:center;font-size:10px;color:#666;border-top:1px dashed #999;padding-top:8px;">
      Software por WALLACE COMPANY SYSTEM
    </div></div>`;
  const w=window.open('','_blank','width=850,height=680');
  if(!w){ toast(MSJ.permiteLasVentanasEmergentes,'error'); return; }
  w.document.write('<html><head><title>Reporte</title><meta charset="utf-8"><style>@page{size:letter;margin:12mm;}body{margin:0;}</style></head><body>'+html+'</body></html>');
  w.document.close(); setTimeout(()=>w.print(),400);
}
export function imprimirContable(){
  const d=window._contData; if(!d){ toast(MSJ.abrePrimeroElInforme,'error'); return; }
  const neg=STATE.negocio;
  const html=`<div style="font-family:Arial,sans-serif;color:#000;max-width:800px;margin:0 auto;padding:18px;">
    <div style="text-align:center;border-bottom:2px solid #000;padding-bottom:10px;">
      ${logoNegocio(neg,'style="max-height:70px;"')||''}
      <div style="font-size:22px;font-weight:800;">${escapeHtml(neg.nombre)}</div>
      ${neg.nit?`<div style="font-size:12px;">NIT: ${escapeHtml(neg.nit)}</div>`:''}
      <div style="font-size:16px;font-weight:700;margin-top:6px;">Registro Contable — ${escapeHtml(d.nombreMes)}</div>
      <div style="font-size:10px;color:#555;">Informe interno. No es tributario ni tiene relación con la DIAN.</div>
    </div>
    <table style="width:100%;font-size:13px;margin-top:16px;">
      <tr><td style="padding:4px;">Ventas del mes</td><td style="text-align:right;font-weight:bold;">${fmtMoney(d.totalVentas)}</td></tr>
      <tr><td style="padding:4px;color:#555;">· Efectivo</td><td style="text-align:right;color:#555;">${fmtMoney(d.metodos.efectivo)}</td></tr>
      <tr><td style="padding:4px;color:#555;">· Banco</td><td style="text-align:right;color:#555;">${fmtMoney(d.metodos.banco)}</td></tr>
      <tr><td style="padding:4px;color:#555;">· Tarjeta</td><td style="text-align:right;color:#555;">${fmtMoney(d.metodos.tarjeta)}</td></tr>
      <tr><td style="padding:4px;">Gastos de caja</td><td style="text-align:right;">-${fmtMoney(d.gastosCaja||0)}</td></tr>
      <tr><td style="padding:4px;">Gastos del negocio</td><td style="text-align:right;">-${fmtMoney(d.gastosNeg||0)}</td></tr>
      <tr style="border-top:2px solid #000;"><td style="padding:7px 4px;font-weight:bold;font-size:15px;">UTILIDAD</td><td style="text-align:right;font-weight:bold;font-size:15px;">${fmtMoney(d.utilidad)}</td></tr>
    </table>
    ${(d.conceptos&&d.conceptos.length)?`<h3 style="font-size:14px;margin-top:18px;border-bottom:1px solid #999;">Egresos por concepto</h3>
    <table style="width:100%;font-size:12px;border-collapse:collapse;">
      ${d.conceptos.map(c=>`<tr style="border-bottom:1px solid #eee;"><td style="padding:5px;">${escapeHtml(c[0])}</td><td style="padding:5px;text-align:right;">${fmtMoney(c[1])}</td></tr>`).join('')}
    </table>`:''}
    <div style="margin-top:24px;text-align:center;font-size:10px;color:#666;border-top:1px dashed #999;padding-top:8px;">
      Generado el ${new Date().toLocaleString('es-CO')} · WALLACE COMPANY SYSTEM
    </div></div>`;
  const w=window.open('','_blank','width=850,height=680');
  if(!w){ toast(MSJ.permiteLasVentanasEmergentes,'error'); return; }
  w.document.write('<html><head><title>Contable</title><meta charset="utf-8"><style>@page{size:letter;margin:12mm;}body{margin:0;}</style></head><body>'+html+'</body></html>');
  w.document.close(); setTimeout(()=>w.print(),400);
}
