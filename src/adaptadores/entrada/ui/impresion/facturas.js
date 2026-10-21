// ============================================================
//  INTERFAZ · Facturas
//  Factura POS, media carta y carta.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/12-invoice-printing/12-invoice-printing.md
// ============================================================
import { STATE, escapeHtml, fmtDate, fmtMoney } from '../nucleo/estado.js';
import { MSJ } from '../nucleo/textos.js';
import { logoNegocio, toast } from '../nucleo/componentes.js';


// ============================================================
//  FACTURAS
// ============================================================
export function imprimirFactura(id){
  const v=misDatos('ventas').find(x=>x.id===id); if(!v) return;
  const neg=STATE.negocio;
  const tipo=neg.tipoFactura||'pos';
  let html, pagina, ancho;
  if(tipo==='carta'){ html=facturaCarta(v,neg); pagina='@page{size:letter;margin:14mm;}'; ancho=850; }
  else if(tipo==='media'){ html=facturaMedia(v,neg); pagina='@page{size:letter;margin:10mm;}'; ancho=760; }
  else { html=facturaPOS(v,neg); pagina='@page{size:80mm auto;margin:0;}'; ancho=400; }
  const w=window.open('','_blank','width='+ancho+',height=680');
  if(!w){ toast(MSJ.permiteLasVentanasEmergentesParaImprimir,'error'); return; }
  w.document.write('<html><head><title>Factura '+(v.factura||'')+'</title><meta charset="utf-8"><style>'+pagina+' body{margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;}</style></head><body>'+html+'</body></html>');
  w.document.close();
  setTimeout(()=>w.print(),400);
}
export function datosCliente(v){
  const f=[];
  if(v.cliNombre) f.push(['Cliente',v.cliNombre]);
  if(v.cliTel) f.push(['Teléfono',v.cliTel]);
  if(v.cliDir) f.push(['Dirección',v.cliDir]);
  if(v.cliBarrio) f.push(['Barrio',v.cliBarrio]);
  if(v.cliCiudad) f.push(['Ciudad',v.cliCiudad]);
  if(v.cliDepto) f.push(['Departamento',v.cliDepto]);
  if(v.transportadora) f.push(['Transportadora',v.transportadora]);
  if(v.domiciliario) f.push(['Domiciliario',v.domiciliario]);
  return f;
}
export function tipoTexto(t){ return {mesa:'Mesa',domicilio:'Domicilio',llevar:'Para llevar',envio:'Envío nacional'}[t]||'Venta'; }

export function facturaPOS(v,neg){
  const cli=datosCliente(v);
  // ---- MODO LOGÍSTICA: remisión de entrega, sin valores ni cobro ----
  if(neg.esLogistica || v.esSalida){
    return `<div style="font-family:Arial,sans-serif;color:#000;width:72mm;padding:4mm;margin:0 auto;font-weight:500;">
      <div style="text-align:center;padding-bottom:6px;">
        ${logoNegocio(neg,'style="max-height:110px;max-width:230px;margin-bottom:6px;"')||''}
        <div style="font-size:28px;font-weight:800;line-height:1.1;">${escapeHtml(neg.nombre)}</div>
        ${neg.eslogan?`<div style="font-size:14px;font-style:italic;">${escapeHtml(neg.eslogan)}</div>`:''}
        ${neg.nit?`<div style="font-size:13px;margin-top:3px;">NIT: ${escapeHtml(neg.nit)}</div>`:''}
        ${neg.dir?`<div style="font-size:13px;">${escapeHtml(neg.dir)}</div>`:''}
        ${neg.tel?`<div style="font-size:13px;">Tel: ${escapeHtml(neg.tel)}</div>`:''}
      </div>
      <div style="border-top:2px solid #000;border-bottom:2px solid #000;padding:6px 0;text-align:center;margin:6px 0;">
        <div style="font-size:16px;font-weight:bold;">REMISIÓN DE ENTREGA</div>
        <div style="font-size:15px;font-weight:bold;">N° ${escapeHtml(v.factura||'—')}</div>
        ${Dominio.facturas.esProvisional(v.factura)?'<div style="font-size:11px;">Número provisional (sin internet)</div>':(v.facturaProvisional?'<div style="font-size:11px;">Antes: '+escapeHtml(v.facturaProvisional)+'</div>':'')}
        <div style="font-size:12px;">(No es factura de venta · sin valor comercial)</div>
      </div>
      <div style="font-size:14px;line-height:1.6;margin:6px 0;">
        <div style="display:flex;justify-content:space-between;"><span>Fecha</span><span>${fmtDate(v.fecha)}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>Despachó</span><span>${escapeHtml(v.vendedor||'')}</span></div>
        ${cli.map(f=>`<div style="display:flex;justify-content:space-between;gap:6px;"><span>${f[0]}</span><span style="text-align:right;max-width:62%;">${escapeHtml(f[1])}</span></div>`).join('')}
      </div>
      <div style="border-top:1px dashed #000;padding-top:5px;">
        <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:bold;border-bottom:1px solid #000;padding-bottom:4px;margin-bottom:5px;"><span>CANTIDAD</span><span>PRODUCTO</span></div>
        ${(v.items||[]).map(i=>`<div style="display:flex;justify-content:space-between;font-size:15px;padding:4px 0;"><span style="font-weight:bold;min-width:40px;">${i.qty} und</span><span style="flex:1;text-align:right;">${escapeHtml(i.nombre)}</span></div>`).join('')}
      </div>
      <div style="border-top:2px solid #000;border-bottom:2px solid #000;margin-top:6px;padding:9px 0;display:flex;justify-content:space-between;font-size:18px;font-weight:800;">
        <span>TOTAL UNIDADES</span><span>${(v.items||[]).reduce((a,i)=>a+i.qty,0)} und</span>
      </div>
      ${v.obs?`<div style="border-top:1px dashed #000;margin-top:8px;padding-top:6px;font-size:12px;"><strong>Obs:</strong> ${escapeHtml(v.obs)}</div>`:''}
      <div style="margin-top:22px;font-size:13px;">
        <div style="border-top:1px solid #000;padding-top:4px;text-align:center;">Firma de quien recibe</div>
      </div>
      <div style="text-align:center;font-size:10px;margin-top:14px;border-top:1px dashed #000;padding-top:8px;">Software por WALLACE COMPANY SYSTEM<br>wallacecompany11@gmail.com</div>
    </div>`;
  }
  // ---- MODO NORMAL: factura de venta ----
  const sub=v.subtotalBruto!==undefined?v.subtotalBruto:(v.subtotal||0);
  let extras='';
  if(v.descuento>0) extras+='<div style="display:flex;justify-content:space-between;"><span>Descuento</span><span>-'+fmtMoney(v.descuento)+'</span></div>';
  if(v.valorDom>0) extras+='<div style="display:flex;justify-content:space-between;"><span>'+(v.tipo==='envio'?'Envío':'Domicilio')+'</span><span>'+fmtMoney(v.valorDom)+'</span></div>';
  if(v.propina>0) extras+='<div style="display:flex;justify-content:space-between;"><span>Propina</span><span>'+fmtMoney(v.propina)+'</span></div>';
  if(v.recargo>0) extras+='<div style="display:flex;justify-content:space-between;"><span>Recargo datáfono</span><span>'+fmtMoney(v.recargo)+'</span></div>';
  return `<div style="font-family:Arial,sans-serif;color:#000;width:72mm;padding:4mm;margin:0 auto;font-weight:500;">
    <div style="text-align:center;padding-bottom:6px;">
      ${logoNegocio(neg,'style="max-height:110px;max-width:230px;margin-bottom:6px;"')||''}
      <div style="font-size:28px;font-weight:800;line-height:1.1;">${escapeHtml(neg.nombre)}</div>
      ${neg.eslogan?`<div style="font-size:14px;font-style:italic;">${escapeHtml(neg.eslogan)}</div>`:''}
      ${neg.nit?`<div style="font-size:13px;margin-top:3px;">NIT: ${escapeHtml(neg.nit)}</div>`:''}
      ${neg.dir?`<div style="font-size:13px;">${escapeHtml(neg.dir)}</div>`:''}
      ${neg.tel?`<div style="font-size:13px;">Tel: ${escapeHtml(neg.tel)}</div>`:''}
    </div>
    <div style="border-top:2px solid #000;border-bottom:2px solid #000;padding:6px 0;text-align:center;margin:6px 0;">
      <div style="font-size:15px;font-weight:bold;">FACTURA DE VENTA</div>
      <div style="font-size:15px;font-weight:bold;">N° ${escapeHtml(v.factura||'—')}</div>
      ${Dominio.facturas.esProvisional(v.factura)?'<div style="font-size:11px;">Número provisional (sin internet)</div>':(v.facturaProvisional?'<div style="font-size:11px;">Antes: '+escapeHtml(v.facturaProvisional)+'</div>':'')}
      <div style="font-size:13px;">${tipoTexto(v.tipo).toUpperCase()}</div>
    </div>
    <div style="font-size:14px;line-height:1.6;margin:6px 0;">
      <div style="display:flex;justify-content:space-between;"><span>Fecha</span><span>${fmtDate(v.fecha)}</span></div>
      <div style="display:flex;justify-content:space-between;"><span>Atendió</span><span>${escapeHtml(v.vendedor||'')}</span></div>
      ${v.mesa?`<div style="display:flex;justify-content:space-between;"><span>Mesa</span><span>${escapeHtml(v.mesa)}</span></div>`:''}
      ${cli.map(f=>`<div style="display:flex;justify-content:space-between;gap:6px;"><span>${f[0]}</span><span style="text-align:right;max-width:62%;">${escapeHtml(f[1])}</span></div>`).join('')}
    </div>
    <div style="border-top:1px dashed #000;padding-top:5px;">
      <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:bold;border-bottom:1px solid #000;padding-bottom:4px;margin-bottom:5px;"><span>CANT / PRODUCTO</span><span>VALOR</span></div>
      ${(v.items||[]).map(i=>`<div style="display:flex;justify-content:space-between;font-size:14px;padding:3px 0;"><span style="flex:1;padding-right:8px;">${i.qty} × ${escapeHtml(i.nombre)}</span><span>${fmtMoney(i.precio*i.qty)}</span></div>`).join('')}
    </div>
    <div style="border-top:1px dashed #000;margin-top:6px;padding-top:6px;font-size:14px;">
      <div style="display:flex;justify-content:space-between;"><span>Subtotal</span><span>${fmtMoney(sub)}</span></div>
      ${extras}
    </div>
    <div style="border-top:2px solid #000;border-bottom:2px solid #000;margin-top:6px;padding:9px 0;display:flex;justify-content:space-between;font-size:21px;font-weight:800;">
      <span>TOTAL</span><span>${fmtMoney(v.total)}</span>
    </div>
    ${v.estado==='pagada'?(()=>{ const pg=pagosDe(v); const et={efectivo:'EFECTIVO',banco:'TRANSFERENCIA',tarjeta:'TARJETA'};
      const ls=Object.keys(pg).filter(k=>pg[k]>0);
      return `<div style="border-top:1px dashed #000;margin-top:6px;padding-top:6px;font-size:14px;">
        ${ls.map(k=>`<div style="display:flex;justify-content:space-between;"><span>${et[k]}</span><span>${fmtMoney(pg[k])}</span></div>`).join('')}
        ${v.cambio>0?`<div style="display:flex;justify-content:space-between;font-weight:bold;"><span>CAMBIO</span><span>${fmtMoney(v.cambio)}</span></div>`:''}
      </div>`; })():'<div style="text-align:center;font-size:13px;margin-top:6px;">Pago: <strong>—</strong></div>'}
    ${v.estado!=='pagada'?`<div style="border:3px solid #000;border-radius:6px;margin-top:8px;padding:8px;text-align:center;font-size:17px;font-weight:800;">*** COBRO PENDIENTE ***<div style="font-size:12px;font-weight:600;margin-top:3px;">Esta cuenta aún no ha sido pagada</div></div>`:''}
    ${v.obs?`<div style="border-top:1px dashed #000;margin-top:8px;padding-top:6px;font-size:12px;"><strong>Obs:</strong> ${escapeHtml(v.obs)}</div>`:''}
    <div style="text-align:center;margin-top:14px;font-size:16px;font-weight:800;">${v.estado==='pagada'?'¡GRACIAS POR SU COMPRA!':'CUENTA DE COBRO'}</div>
    <div style="text-align:center;font-size:10px;margin-top:10px;border-top:1px dashed #000;padding-top:8px;">Software por WALLACE COMPANY SYSTEM<br>wallacecompany11@gmail.com</div>
  </div>`;
}
export function facturaMedia(v,neg){
  const sub=v.subtotalBruto!==undefined?v.subtotalBruto:(v.subtotal||0);
  const cli=datosCliente(v);
  const N='#132d46';
  let extras='';
  if(v.descuento>0) extras+='<tr><td style="padding:5px 10px;text-align:right;">Descuento</td><td style="padding:5px 10px;text-align:right;">-'+fmtMoney(v.descuento)+'</td></tr>';
  if(v.valorDom>0) extras+='<tr><td style="padding:5px 10px;text-align:right;">'+(v.tipo==='envio'?'Envío':'Domicilio')+'</td><td style="padding:5px 10px;text-align:right;">'+fmtMoney(v.valorDom)+'</td></tr>';
  if(v.propina>0) extras+='<tr><td style="padding:5px 10px;text-align:right;">Propina</td><td style="padding:5px 10px;text-align:right;">'+fmtMoney(v.propina)+'</td></tr>';
  if(v.recargo>0) extras+='<tr><td style="padding:5px 10px;text-align:right;">Recargo datáfono</td><td style="padding:5px 10px;text-align:right;">'+fmtMoney(v.recargo)+'</td></tr>';
  return `<div style="font-family:Arial,sans-serif;color:#111;max-width:190mm;margin:0 auto;font-size:12px;">
    <div style="background:${escapeHtml(N)};height:9px;"></div>
    <div style="text-align:center;padding:9px 0 7px;font-size:17px;font-weight:800;letter-spacing:5px;color:${escapeHtml(N)};">FACTURA</div>
    <div style="background:${escapeHtml(N)};height:3px;"></div>
    <div style="display:flex;justify-content:center;gap:26px;padding:7px 0;font-size:11px;border-bottom:1px solid #ddd;">
      <span><strong>FECHA:</strong> ${fmtDate(v.fecha)}</span>
      <span><strong>NÚMERO:</strong> ${escapeHtml(v.factura||'—')}${Dominio.facturas.esProvisional(v.factura)?' (provisional)':(v.facturaProvisional?' (antes '+escapeHtml(v.facturaProvisional)+')':'')}</span>
      <span><strong>TIPO:</strong> ${tipoTexto(v.tipo)}</span>
    </div>
    <div style="display:flex;gap:20px;padding:14px 4px;border-bottom:1px solid #ddd;">
      <div style="flex:0 0 150px;text-align:center;">
        ${logoNegocio(neg,'style="max-height:75px;max-width:145px;"')||`<div style="font-size:20px;font-weight:800;color:${escapeHtml(N)};">${escapeHtml(neg.nombre)}</div>`}
      </div>
      <div style="flex:1;font-size:11px;line-height:1.55;">
        <div style="font-weight:800;font-size:13px;">${escapeHtml(neg.nombre)}</div>
        ${neg.nit?`<div>NIT: ${escapeHtml(neg.nit)}</div>`:''}
        ${neg.dir?`<div>${escapeHtml(neg.dir)}</div>`:''}
        ${neg.tel?`<div>Tel: ${escapeHtml(neg.tel)}</div>`:''}
      </div>
      <div style="flex:1;font-size:11px;line-height:1.55;">
        <div style="font-size:9px;letter-spacing:1.5px;color:#888;">CLIENTE</div>
        ${cli.length?cli.map(f=>`<div><strong>${f[0]}:</strong> ${escapeHtml(f[1])}</div>`).join(''):'<div style="color:#999;">Consumidor final</div>'}
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-top:14px;font-size:11px;">
      <thead><tr style="background:${escapeHtml(N)};color:#fff;">
        <th style="padding:7px 10px;text-align:left;width:60px;">CANT</th>
        <th style="padding:7px 10px;text-align:left;">CONCEPTO</th>
        <th style="padding:7px 10px;text-align:right;width:90px;">PRECIO</th>
        <th style="padding:7px 10px;text-align:right;width:95px;">IMPORTE</th>
      </tr></thead>
      <tbody>${(v.items||[]).map((i,x)=>`<tr style="background:${x%2?'#f7f9fa':'#fff'};border-bottom:1px solid #e8ecef;">
        <td style="padding:7px 10px;">${i.qty}</td>
        <td style="padding:7px 10px;">${escapeHtml(i.nombre)}</td>
        <td style="padding:7px 10px;text-align:right;">${fmtMoney(i.precio)}</td>
        <td style="padding:7px 10px;text-align:right;font-weight:600;">${fmtMoney(i.precio*i.qty)}</td>
      </tr>`).join('')}</tbody>
    </table>
    <div style="display:flex;justify-content:flex-end;margin-top:14px;">
      <table style="border-collapse:collapse;font-size:12px;min-width:265px;">
        <tr><td style="padding:5px 10px;text-align:right;">Subtotal</td><td style="padding:5px 10px;text-align:right;">${fmtMoney(sub)}</td></tr>
        ${extras}
        <tr style="background:${escapeHtml(N)};color:#fff;">
          <td style="padding:9px 10px;text-align:right;font-weight:800;font-size:14px;">TOTAL</td>
          <td style="padding:9px 10px;text-align:right;font-weight:800;font-size:14px;">${fmtMoney(v.total)}</td>
        </tr>
      </table>
    </div>
    ${v.obs?`<div style="margin-top:12px;font-size:11px;padding:8px 10px;background:#f7f9fa;border-left:3px solid #01c38e;"><strong>Obs:</strong> ${escapeHtml(v.obs)}</div>`:''}
    <div style="margin-top:20px;text-align:center;font-size:12px;font-weight:700;color:${escapeHtml(N)};">¡Gracias por su compra!</div>
    <div style="margin-top:14px;border-top:1px solid #ddd;padding-top:8px;text-align:center;font-size:9px;color:#888;">
      Software por <strong style="color:${escapeHtml(N)};">WALLACE COMPANY SYSTEM</strong> · wallacecompany11@gmail.com
    </div>
    <div style="background:#01c38e;height:5px;margin-top:8px;"></div>
  </div>`;
}
export function facturaCarta(v,neg){
  return facturaMedia(v,neg).replace('max-width:190mm','max-width:190mm;font-size:13px');
}
