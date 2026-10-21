// ============================================================
//  INTERFAZ · Pedidos
//  Lista de pedidos de la jornada y cambio de estado.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/02-pos-catalog/02-pos-catalog.md
// ============================================================
import { STATE, escapeHtml, fijarEscribiendo, fmtMoney } from '../nucleo/estado.js';
import { MSJ } from '../nucleo/textos.js';
import { cajaActual, puedeVerPantalla, sucursalActual, tienePermiso } from '../nucleo/permisos.js';
import { ic, pPedido, pPedidos, pPersonal, toast } from '../nucleo/componentes.js';
import { render } from '../nucleo/navegacion.js';
import { logAudit } from '../usuarios/auditoria.js';
import { usaCuentas } from './cuentas-abiertas.js';
import { detallePagos } from './cobro.js';


// ============================================================
//  PEDIDOS
// ============================================================
export let _pBusca='';

// Ventas de la jornada: desde que se abrió la caja, sin importar el dispositivo
export function ventasJornada(soloPagadas){
  const cajaAbierta=cajaActual();
  let vs=misDatos('ventas');
  // F1: con sucursales, cada sede ve sus pedidos y su caja
  if(usaSucursales(STATE.negocio)){ const suc=sucursalActual(); vs=vs.filter(v=>Dominio.caja.deSucursal(v,suc)); }
  if(cajaAbierta && cajaAbierta.apertura){
    const desde=new Date(cajaAbierta.apertura).getTime();
    // F19: lo que quedó sin cobrar de turnos anteriores sigue a la vista hasta cobrarlo o anularlo
    vs=vs.filter(v=> v.estado==='abierta' || v.cajaId===cajaAbierta.id || new Date(v.fecha||0).getTime()>=desde);
  } else {
    const h=today();
    vs=vs.filter(v=> v.estado==='abierta' || jornadaDe(v)===h);
  }
  return soloPagadas ? vs.filter(v=>v.estado==='pagada') : vs;
}

export function pedidos(){
  const neg=STATE.negocio;
  fijarEscribiendo(false);
  const cajaAbierta=cajaActual();
  let vs=ventasJornada(false).filter(v=>v.estado!=='anulada');
  if(_pBusca){
    const q=_pBusca.toLowerCase();
    vs=vs.filter(v=>(v.factura||'').toLowerCase().includes(q)
      ||(v.cliNombre||'').toLowerCase().includes(q)
      ||(v.cliTel||'').includes(q)
      ||(v.domiciliario||'').toLowerCase().includes(q)
      ||(v.mesa||'').toLowerCase().includes(q));
  }
  vs=vs.sort((a,b)=>new Date(b.fecha||0)-new Date(a.fecha||0));
  const etiq={mesa:'Mesa',llevar:'Para llevar',domicilio:'Domicilio',envio:'Envío',entrega:'Entrega',despacho:'Despacho'};
  const usaCocina=neg.usaCocina;
  const esLog=neg.esLogistica;
  // Columnas que dependen del tipo de negocio
  const tiposCfg=(neg.tiposEntrega&&neg.tiposEntrega.length)?neg.tiposEntrega:['llevar'];
  const colTipo = tiposCfg.length>1;                 // solo si hay más de un tipo de entrega
  const usaMesas = neg.usaMesas;
  const usaDomi = (neg.usaDomicilios!==undefined?neg.usaDomicilios:tiposCfg.indexOf('domicilio')>-1);
  const colDinero = !esLog;                          // logística no muestra dinero
  const doms=misDatos('domiciliarios');
  const uniDe=v=>(v.items||[]).reduce((a,i)=>a+(i.qty||0),0);
  // Badge de cocina
  const cocBadge=(e)=>{
    const m={pendiente:['pill-gold','Pendiente'],preparando:['pill-azul','Preparando'],listo:['pill-verde','Listo'],entregado:['pill','Entregado']};
    const x=m[e||'pendiente']; return `<span class="pill ${escapeHtml(x[0])}">${x[1]}</span>`;
  };
  const selDom=(v)=>{
    if(!doms.length) return '—';
    return `<select class="busca minw-auto p-5-8" data-change="asignarDomiciliario('${escapeHtml(v.id)}',this.value)"><option value="">Asignar…</option>${doms.map(d=>`<option ${v.domiciliario===d.nombre?'selected':''}>${escapeHtml(d.nombre)}</option>`).join('')}</select>`;
  };
  // Encabezados dinámicos
  const cols=[];
  cols.push(esLog?pPedido(true)+' / '+pPersonal(true):pPedido(true)+(usaDomi?' / Mensajero':''));
  if(colTipo) cols.push('Tipo');
  cols.push('Cliente'+(usaMesas?'/Mesa':''));
  cols.push(colDinero?'Total':'Unidades');
  if(colDinero) cols.push('Cobro');
  if(usaCocina) cols.push('Cocina');
  cols.push('Estado');
  if(usaDomi) cols.push('Domiciliario');
  cols.push('Acciones');
  const nCols=cols.length;
  const fila=(v)=>{
    const abierta=v.estado==='abierta';
    let tds='';
    tds+=`<td><strong class="oro">${escapeHtml(v.factura||'—')}</strong>${v.editadoPor?`<br><span class="gris chico">editado: ${escapeHtml(v.editadoPor)}</span>`:''}</td>`;
    if(colTipo) tds+=`<td>${etiq[v.tipo]||'—'}${v.mesa?'<br><span class="gris chico">'+escapeHtml(v.mesa)+'</span>':''}</td>`;
    tds+=`<td>${escapeHtml(v.cliNombre||v.mesa||'—')}${v.cliTel?`<br><span class="gris chico">${escapeHtml(v.cliTel)}</span>`:''}</td>`;
    tds+=colDinero?`<td class="negrita">${fmtMoney(v.total)}</td>`:`<td class="negrita">${uniDe(v)} und</td>`;
    if(colDinero) tds+=`<td>${abierta?'<span class="pill pill-gold">Abierta</span>':'<span class="pill pill-verde">Pagada</span>'}${v.estado==='pagada'?`<br><span class="gris chico" title="${escapeHtml(detallePagos(v))}">${escapeHtml(metodoTexto(v))}</span>`:''}${v.pagoDescuadrado?`<br><span class="pill pill-rojo mt-3">Revisar pago</span>`:''}${bancoPendiente(v)?`<br><span class="pill pill-gold mt-3">Transferencia sin verificar</span>`:''}</td>`;
    if(usaCocina) tds+=`<td>${cocBadge(v.estadoCocina)}</td>`;
    tds+=`<td><select class="busca minw-auto p-5-8" data-change="setEstadoPedido('${escapeHtml(v.id)}',this.value)"><option value="activo" ${v.estadoPedido!=='entregado'?'selected':''}>Activo</option><option value="entregado" ${v.estadoPedido==='entregado'?'selected':''}>Entregado</option></select></td>`;
    if(usaDomi) tds+=`<td>${v.tipo==='domicilio'?selDom(v):'—'}</td>`;
    tds+=`<td class="acciones">
      ${abierta&&colDinero&&tienePermiso('cobrar')?`<button class="btn btn-sm btn-verde" data-click="cobrarPedido('${escapeHtml(v.id)}')" title="Cobrar">💵 Cobrar</button>`:''}
      ${tienePermiso('editar')?`<button class="btn btn-sm" data-click="editarPedido('${escapeHtml(v.id)}')" title="Editar">✏️</button>`:''}
      ${usaCocina&&tienePermiso('comanda')?`<button class="btn btn-sm" data-click="reimprimirComanda('${escapeHtml(v.id)}')" title="Comanda de cocina">👨‍🍳</button>`:''}
      ${tienePermiso('imprimir')?`<button class="btn btn-sm" data-click="imprimirFactura('${escapeHtml(v.id)}')" title="${esLog?'Reimprimir remisión':(v.estado==='pagada'?'Reimprimir factura':'Imprimir cuenta (cobro pendiente)')}">🖨️</button>`:''}
      ${v.pagoDescuadrado&&tienePermiso('cobrar')?`<button class="btn btn-sm btn-naranja" data-click="ajustarPagoVenta('${escapeHtml(v.id)}')" title="El total cambió: ajustar el cobro">⚠ Ajustar cobro</button>`:''}
      ${bancoPendiente(v)?`<button class="btn btn-sm btn-verde" data-click="marcarVerificada('${escapeHtml(v.id)}')" title="Confirmar que la transferencia llegó">✔ Verificar</button>`:''}
      ${colDinero&&v.estado==='pagada'&&tienePermiso('cambiarpago')?`<button class="btn btn-sm" data-click="cambiarFormaPago('${escapeHtml(v.id)}')" title="Cambiar forma de pago">💳</button>`:''}
      ${tienePermiso('anular')?`<button class="btn btn-sm btn-rojo" data-click="anularPedido('${escapeHtml(v.id)}')" title="Anular">🚫</button>`:''}
      ${tienePermiso('eliminar')?`<button class="btn btn-sm btn-rojo" data-click="eliminarDefinitivo('${escapeHtml(v.id)}')" title="Eliminar por completo">🗑️</button>`:''}
    </td>`;
    return `<tr class="${abierta?'fila-pend':''}">${tds}</tr>`;};

  return `
    <div class="tarjeta">
      <div class="t-cab">
        <span class="t-tit">${ic('report')} ${pPedidos(true)} <span class="gris chico fw-normal">${cajaAbierta?('jornada del '+fechaLocal(cajaAbierta.apertura)):'(hoy)'}</span></span>
        <div class="t-acc">
          <input type="text" class="busca" placeholder="🔍 ${esLog?'Remisión':'Factura'}, cliente${usaDomi?', teléfono':''}..." value="${escapeHtml(_pBusca)}" data-input="buscarPedidos(this.value)">
          <button class="btn btn-sm" data-click="refrescarDeLaNube()">🔄 Actualizar</button>
          ${usaCuentas()?`<button class="btn btn-sm" data-click="irA('cuentas')">🧾 Cuentas abiertas</button>`:''}
          <button class="btn btn-gold" data-click="irA('ventas')">+ ${pPedido(true)}</button>
        </div>
      </div>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead>
        <tbody>${vs.length? vs.slice(0,100).map(fila).join('')
          : `<tr><td colspan="${escapeHtml(nCols)}" class="gris">Sin ${pPedidos()} en esta jornada.</td></tr>`}</tbody>
      </table></div>
    </div>`;
}
// Cambiar estado del pedido (activo/entregado) desde la tabla
export function setEstadoPedido(id, estado){
  if(!puedeVerPantalla('pedidos')){ toast(MSJ.noTienesAccesoAPedidos,'error'); return; }
  const arr=misDatos('ventas');
  const v=arr.find(x=>x.id===id); if(!v) return;
  v.estadoPedido=estado;
  if(estado==='entregado' && v.estadoCocina && v.estadoCocina!=='entregado') v.estadoCocina='entregado';
  guardarMisDatos('ventas',arr);
  toast(estado==='entregado'?'Pedido entregado':'Pedido activo','info');
  render();
}
// Asignar domiciliario a un pedido desde la tabla
// F15: la venta guarda el id del domiciliario (el nombre queda para mostrar)
export function idDomiciliario(nombre){
  if(!nombre) return null;
  const d=misDatos('domiciliarios').find(x=>x.nombre===nombre);
  return d ? d.id : null;
}
export function asignarDomiciliario(id, nombre){
  if(!puedeVerPantalla('pedidos')){ toast(MSJ.noTienesAccesoAPedidos,'error'); return; }
  const arr=misDatos('ventas');
  const v=arr.find(x=>x.id===id); if(!v) return;
  v.domiciliario=nombre;
  v.domiciliarioId=idDomiciliario(nombre);
  guardarMisDatos('ventas',arr);
  logAudit('Asignó domiciliario', (v.factura||'')+' → '+nombre);
  toast(nombre?'Domiciliario asignado':'Domiciliario quitado','success');
  render();
}
export function buscarPedidos(v){ _pBusca=v; render(); }
