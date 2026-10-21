// ============================================================
//  INTERFAZ · Agenda
//  Citas y turnos, productos apartados, cobro de la entrega.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/05-appointments-shifts/05-appointments-shifts.md
// ============================================================
import { STATE, escapeHtml, fijarEscribiendo, fmtDate, fmtMoney, jornadaActual, now } from '../nucleo/estado.js';
import { BOTON, MSJ } from '../nucleo/textos.js';
import { cajaActual, exigirEscritura, exigirPermiso, puedeVerPantalla, sucursalActual, usaInventario } from '../nucleo/permisos.js';
import { abrirModal, cerrarModal, confirmarModal, ic, toast } from '../nucleo/componentes.js';
import { render } from '../nucleo/navegacion.js';
import { logAudit } from '../usuarios/auditoria.js';
import { abrirCobro } from '../ventas/cobro.js';
import { moverInventario } from '../inventario/motor.js';


// ============================================================
//  AGENDAR (citas, turnos, entregas)
// ============================================================
export function citas(){
  fijarEscribiendo(false);
  const neg=STATE.negocio;
  const lista=misDatos('citas').slice().sort((a,b)=>new Date(a.fechaHora)-new Date(b.fechaHora));
  const hoy=today();
  const deHoy=lista.filter(c=>(c.fechaHora||'').startsWith(hoy));
  const pendientes=lista.filter(c=>c.estado==='pendiente');
  const usaInv=(neg.funciones||[]).indexOf('inventario')>-1;
  // Cuántas unidades hay apartadas ahora mismo (citas pendientes con productos)
  const apartadasActivas=lista.filter(c=>c.estado==='pendiente' && (c.apartados||[]).length)
    .reduce((a,c)=>a+(c.apartados||[]).reduce((s,x)=>s+(x.cantidad||0),0),0);
  return `
    <div class="stats">
      <div class="stat verde"><div class="stat-lbl">Agendado hoy</div><div class="stat-val">${deHoy.length}</div><div class="stat-sub">para el día de hoy</div></div>
      <div class="stat gold"><div class="stat-lbl">Pendientes</div><div class="stat-val">${pendientes.length}</div><div class="stat-sub">sin atender</div></div>
      ${usaInv?`<div class="stat azul"><div class="stat-lbl">Productos apartados</div><div class="stat-val">${apartadasActivas}</div><div class="stat-sub">reservados sin entregar</div></div>`
        :`<div class="stat azul"><div class="stat-lbl">Total agendado</div><div class="stat-val">${lista.length}</div><div class="stat-sub">en el sistema</div></div>`}
    </div>
    <div class="tarjeta">
      <div class="t-cab">
        <span class="t-tit">${ic('calendar')} Agendar</span>
        <button class="btn btn-gold" data-click="nuevaCita()">+ Nuevo agendamiento</button>
      </div>
      ${usaInv?`<p class="nota">Al apartar productos se descuentan del inventario y quedan reservados para esa persona. Si <strong>no se recoge</strong>, vuelven al stock.</p>`:''}
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Fecha y hora</th><th>Cliente</th><th>Detalle</th>${usaInv?'<th>Apartado</th>':''}<th>Encargado</th><th>Estado</th><th>Acciones</th></tr></thead>
        <tbody>
        ${lista.length? lista.map(c=>{
          const ap=c.apartados||[];
          const apHTML=ap.length
            ? ap.map(x=>`<div class="chico">${escapeHtml(x.nombre)} <strong>×${x.cantidad}</strong></div>`).join('')
              +(c.estado==='pendiente'?'<span class="pill pill-azul mt-4">Reservado</span>'
                :c.estado==='atendida'?(c.ventaId?'<span class="pill pill-verde mt-4">Entregado y cobrado</span>':'<span class="pill pill-verde mt-4">Entregado</span>')
                :c.estado==='no_recogio'?'<span class="pill pill-rojo mt-4">Devuelto al stock</span>'
                :'<span class="pill pill-rojo mt-4">Devuelto al stock</span>')
            : '<span class="gris chico">—</span>';
          return `<tr>
          <td>${fmtDate(c.fechaHora)}</td>
          <td><strong>${escapeHtml(c.cliente||'—')}</strong>${c.tel?`<br><span class="gris chico">${escapeHtml(c.tel)}</span>`:''}</td>
          <td>${escapeHtml(c.detalle||'—')}</td>
          ${usaInv?`<td>${apHTML}</td>`:''}
          <td>${escapeHtml(c.encargado||'—')}</td>
          <td>${c.estado==='atendida'?'<span class="pill pill-verde">Atendida</span>'
              :c.estado==='cancelada'?'<span class="pill pill-rojo">Cancelada</span>'
              :c.estado==='no_recogio'?'<span class="pill pill-rojo">No se recogió</span>'
              :'<span class="pill pill-gold">Pendiente</span>'}</td>
          <td class="acciones">
            ${c.estado==='pendiente'?`
              <button class="btn btn-sm" data-click="editarCita('${escapeHtml(c.id)}')" title="Cambiar fecha, datos o productos apartados">✏️</button>
              <button class="btn btn-sm btn-verde" data-click="marcarCita('${escapeHtml(c.id)}','atendida')" title="${ap.length?'Entregado (mantiene el descuento de inventario)':'Marcar atendida'}">${ap.length?'✓ Entregado':'✓'}</button>
              ${ap.length?`<button class="btn btn-sm btn-rojo" data-click="marcarCita('${escapeHtml(c.id)}','no_recogio')" title="No se recogió (devuelve los productos al stock)">↩ No se recogió</button>`
                :`<button class="btn btn-sm btn-rojo" data-click="marcarCita('${escapeHtml(c.id)}','cancelada')" title="Cancelar">✕</button>`}`:''}
            <button class="btn btn-sm" data-click="eliminarCita('${escapeHtml(c.id)}')" title="Eliminar">🗑</button>
          </td>
        </tr>`;}).join('') : `<tr><td colspan="${usaInv?7:6}" class="gris">Nada agendado todavía.</td></tr>`}
        </tbody>
      </table></div>
    </div>`;
}

export let _apartTmp=[];   // productos que se están apartando en el modal de la cita
export function nuevaCita(){
  if(!exigirEscritura()) return;   // D10: solo lectura
  if(!puedeVerPantalla('citas')){ toast(MSJ.noTienesAccesoALaAgenda,'error'); return; }
  const neg=STATE.negocio;
  const esServicio=(neg.palabraProducto||'')==='Servicio';
  const usaInv=(neg.funciones||[]).indexOf('inventario')>-1;
  _apartTmp=[];
  abrirModal({titulo:'Nuevo agendamiento', textoBoton:BOTON.agendar, campos:[
    {id:'cliente', label:'Cliente', requerido:true},
    {id:'tel', label:'Teléfono (opcional)'},
    {id:'fecha', label:'Fecha', tipo:'date', valor:today()},
    {id:'hora', label:'Hora', tipo:'time', valor:'10:00'},
    {id:'detalle', label:esServicio?'Servicio':'Detalle (qué se agenda)',
      valor:esServicio?'Corte':'',
      placeholder:esServicio?'Corte, tinte, manicure...':'Ej: 2 collares chicle, entrega de pedido...'},
    {id:'encargado', label:'Encargado (opcional)'}
  ], extraHTML: usaInv ? apartadoEditorHTML() : '',
  onGuardar:(d)=>{
    const apartados=_apartTmp.filter(x=>x.prodId && x.cantidad>0);
    // Verificar que aún haya stock suficiente antes de apartar
    if(apartados.length){
      const productos=misDatos('productos');
      const faltan=[];
      apartados.forEach(x=>{
        const p=productos.find(y=>y.id===x.prodId);
        if(p && p.stock!=null && p.stock < x.cantidad){
          faltan.push(x.nombre+' (quedan '+p.stock+', apartas '+x.cantidad+')');
        }
      });
      if(faltan.length){ toast('Sin stock para apartar: '+faltan.join(', '),'error'); return; }
    }
    const arr=misDatos('citas');
    const cita={id:uid(), cliente:d.cliente, tel:d.tel,
      fechaHora:d.fecha+'T'+(d.hora||'10:00')+':00',
      detalle:d.detalle, encargado:d.encargado,
      apartados:apartados, stockDescontado:false,
      estado:'pendiente', creado:now(), por:STATE.user.nombre};
    // Descontar del inventario lo apartado
    if(apartados.length){
      descontarApartado(apartados, 'Apartado · cita de '+(d.cliente||''));
      cita.stockDescontado=usaInventario();
      logAudit('Apartó productos', (d.cliente||'')+' · '+apartados.map(a=>a.nombre+' ×'+a.cantidad).join(', '));
    }
    arr.push(cita);
    guardarMisDatos('citas',arr);
    _apartTmp=[];
    cerrarModal();
    toast(apartados.length?'Agendado y productos apartados':'Agendado','success');
    render();
  }});
}

// Editar una cita pendiente (antes había que borrarla y crearla otra vez). Si cambian los
// productos apartados, el inventario se ajusta SOLO por la diferencia, con movimiento.
export function editarCita(id){
  if(!exigirEscritura()) return;
  if(!puedeVerPantalla('citas')){ toast(MSJ.noTienesAccesoALaAgenda,'error'); return; }
  const c=misDatos('citas').find(x=>x.id===id); if(!c) return;
  if(c.estado!=='pendiente'){ toast(MSJ.soloSeEditaUnaCitaPendiente,'error'); return; }
  const neg=STATE.negocio;
  const usaInv=(neg.funciones||[]).indexOf('inventario')>-1;
  const [fecha, horaSeg]=String(c.fechaHora||'').split('T');
  _apartTmp=JSON.parse(JSON.stringify(c.apartados||[]));
  abrirModal({titulo:'Editar agendamiento', textoBoton:BOTON.guardar, campos:[
    {id:'cliente', label:'Cliente', requerido:true, valor:c.cliente||''},
    {id:'tel', label:'Teléfono (opcional)', valor:c.tel||''},
    {id:'fecha', label:'Fecha', tipo:'date', valor:fecha||today()},
    {id:'hora', label:'Hora', tipo:'time', valor:(horaSeg||'10:00').slice(0,5)},
    {id:'detalle', label:'Detalle', valor:c.detalle||''},
    {id:'encargado', label:'Encargado (opcional)', valor:c.encargado||''}
  ], extraHTML: usaInv ? apartadoEditorHTML() : '',
  onGuardar:(d)=>{
    const nuevos=_apartTmp.filter(x=>x.prodId && x.cantidad>0);
    const dif=Dominio.inventario.difApartados(c.stockDescontado?c.apartados:[], nuevos);
    // Lo que se aparta de más tiene que alcanzar
    const productos=misDatos('productos');
    const faltan=Object.keys(dif.sacar).map(pid=>{ const p=productos.find(y=>y.id===pid);
      return (p && p.stock!=null && p.stock<dif.sacar[pid]) ? p.nombre+' (quedan '+p.stock+', apartas '+dif.sacar[pid]+' más)' : null; }).filter(Boolean);
    if(faltan.length){ toast('Sin stock para apartar: '+faltan.join(', '),'error'); return; }
    const arr=misDatos('citas'); const x=arr.find(y=>y.id===id); if(!x){ cerrarModal(); return; }
    const motivo='Cambio de apartado · cita de '+(d.cliente||'');
    if(Object.keys(dif.devolver).length) moverInventario({prod:dif.devolver, ins:{}}, +1, motivo, true, !!x.stockDescontado);
    if(Object.keys(dif.sacar).length) moverInventario({prod:dif.sacar, ins:{}}, -1, motivo, true, !!x.stockDescontado);   // igual que lo ya apartado
    Object.assign(x, {cliente:d.cliente, tel:d.tel, fechaHora:d.fecha+'T'+(d.hora||'10:00')+':00', detalle:d.detalle,
      encargado:d.encargado, apartados:nuevos, editada:now(), editadaPor:STATE.user.nombre});
    if(nuevos.length && !x.stockDescontado) x.stockDescontado=usaInventario();
    if(!nuevos.length) x.stockDescontado=false;
    guardarMisDatos('citas',[x]);
    logAudit('Editó cita', (d.cliente||'')+(Object.keys(dif.sacar).length||Object.keys(dif.devolver).length?' · apartados ajustados':''));
    _apartTmp=[];
    cerrarModal(); toast(MSJ.citaActualizada,'success'); render();
  }});
}
// --- Editor de productos apartados (dentro del modal de la cita) ---
export function apartadoEditorHTML(){
  const productos=misDatos('productos').filter(p=>p.stock!=null);
  if(!productos.length){
    return `<div class="cobro-caja mt-14">
      <strong>Apartar productos</strong>
      <p class="nota mt-8">No hay productos con inventario para apartar. Agrega productos con stock en <strong>Inventario</strong>.</p>
    </div>`;
  }
  return `<div class="cobro-caja mt-14">
    <strong>Apartar productos <span class="gris chico">(opcional — se restan del inventario y quedan reservados)</span></strong>
    <div id="apart-lista" class="m-10-0">${apartadoFilasHTML()}</div>
    <div class="d-flex gap-8 flex-wrap items-centro">
      <select id="apart-prod" class="campo flex-2 minw-130 m-0">
        ${productos.map(p=>`<option value="${escapeHtml(p.id)}">${escapeHtml(p.nombre)} (stock ${p.stock})</option>`).join('')}
      </select>
      <input id="apart-cant" type="number" min="1" class="campo flex-1 minw-70 m-0" placeholder="Cant.">
      <button type="button" class="btn btn-verde btn-sm" data-click="agregarProdApartado()">+ Apartar</button>
    </div>
  </div>`;
}
export function apartadoFilasHTML(){
  if(!_apartTmp.length) return '<p class="nota">Sin productos apartados. Esta cita se agenda sin reservar inventario.</p>';
  return _apartTmp.map((x,idx)=>`<div class="c-row p-6-0">
      <span>${escapeHtml(x.nombre)}</span>
      <span><strong>×${x.cantidad}</strong>
        <button type="button" class="mini-x" data-click="quitarProdApartado(${escapeHtml(idx)})">×</button></span>
    </div>`).join('');
}
export function agregarProdApartado(){
  const sel=document.getElementById('apart-prod');
  const cant=parseFloat((document.getElementById('apart-cant')||{}).value)||0;
  if(!sel||!sel.value){ toast(MSJ.eligeUnProducto,'error'); return; }
  if(cant<=0){ toast(MSJ.escribeLaCantidad,'error'); return; }
  const p=misDatos('productos').find(y=>y.id===sel.value);
  if(!p){ toast(MSJ.productoNoEncontrado,'error'); return; }
  if(p.stock!=null && p.stock<cant){ toast('Solo quedan '+p.stock+' de '+p.nombre,'error'); return; }
  const ya=_apartTmp.find(x=>x.prodId===sel.value);
  if(ya){ ya.cantidad=cant; } else { _apartTmp.push({prodId:p.id, nombre:p.nombre, cantidad:cant, precio:p.precio||0}); }
  const cont=document.getElementById('apart-lista');
  if(cont) cont.innerHTML=apartadoFilasHTML();
  const ci=document.getElementById('apart-cant'); if(ci) ci.value='';
}
export function quitarProdApartado(idx){
  _apartTmp.splice(idx,1);
  const cont=document.getElementById('apart-lista');
  if(cont) cont.innerHTML=apartadoFilasHTML();
}
// Resta del stock los productos apartados (usa lotes FEFO si el producto los maneja)
// Apartados: pasan por el motor de inventario, así quedan en Movimientos (F8)
export function reqApartados(apartados){
  const prod={};
  (apartados||[]).forEach(x=>{ if(x && x.prodId && x.cantidad>0) prod[x.prodId]=(prod[x.prodId]||0)+x.cantidad; });
  return {prod, ins:{}};
}
export function descontarApartado(apartados, motivo){
  moverInventario(reqApartados(apartados), -1, motivo||'Apartado de cita', true);
}
// Devuelve al stock los productos apartados (cuando no se recogió o se canceló)
// Solo se llama si la cita SÍ descontó (stockDescontado): vuelve aunque hoy el inventario esté apagado
export function devolverApartado(apartados, motivo){
  moverInventario(reqApartados(apartados), +1, motivo||'Devolución de apartado', true, true);
}
export function marcarCita(id,estado){
  if(!exigirEscritura()) return;   // D10: solo lectura
  if(!puedeVerPantalla('citas')){ toast(MSJ.noTienesAccesoALaAgenda,'error'); return; }
  const arr=misDatos('citas');
  const c=arr.find(x=>x.id===id); if(!c) return;
  const tieneApartados=(c.apartados||[]).length>0;

  // ENTREGADO con productos apartados: registrar la venta (cuenta en dashboard/caja/reportes)
  if(estado==='atendida' && tieneApartados && !c.ventaId){
    cobrarCitaEntregada(c);   // abre modal de cobro; al confirmar marca la cita y crea la venta
    return;
  }

  // Si NO se recogió o se cancela: devolver al stock lo que se había apartado
  if((estado==='no_recogio' || estado==='cancelada') && tieneApartados && c.stockDescontado){
    devolverApartado(c.apartados, (estado==='no_recogio'?'No se recogió':'Cita cancelada')+' · '+(c.cliente||''));
    c.stockDescontado=false;
    logAudit(estado==='no_recogio'?'Apartado no recogido':'Canceló cita con apartados', (c.cliente||'')+' · productos devueltos al stock');
  }
  c.estado=estado;
  c.cerrada=now();
  guardarMisDatos('citas',arr);
  const msg = estado==='atendida' ? 'Marcado como entregado'
            : estado==='no_recogio' ? 'No se recogió · productos devueltos al stock'
            : 'Cancelado';
  toast(msg,'info');
  render();
}

// Al confirmar que la cita llegó y se llevó los productos: cobrar y registrar la venta.
// El stock YA se descontó cuando se apartó, así que la venta NO vuelve a descontarlo.
export function cobrarCitaEntregada(cita){
  if(!exigirPermiso('cobrar','No tienes permiso para cobrar')) return;
  const neg=STATE.negocio;
  // Igual que una venta: con caja, la caja debe estar abierta (F9)
  const cajaAbierta=cajaActual();
  if((neg.funciones||[]).indexOf('caja')>-1 && neg.usaCaja!==false && !cajaAbierta){
    toast(MSJ.abreLaCajaAntesDeCobrarLa,'error'); return;
  }
  const items=(cita.apartados||[]).map(x=>({prodId:x.prodId, nombre:x.nombre, precio:x.precio||0, qty:x.cantidad}));
  const bruto=items.reduce((a,i)=>a+i.precio*i.qty,0);
  const venta={
    id:uid(), factura:'',   // el número se toma al confirmar el cobro (abrirCobro)
    items:items,
    subtotal:bruto, subtotalBruto:bruto, descuento:0, descMotivo:'',
    valorDom:0, propina:0, recargo:0, total:bruto,
    estado:'abierta', tipo:'llevar', cajaId:cajaAbierta?cajaAbierta.id:null, sucursalId:sucursalActual(),
    vendedor:STATE.user.nombre, vendedorId:STATE.user.id||null, fecha:now(), jornada:jornadaActual(),
    obs:'Entrega de agendamiento'+(cita.detalle?' · '+cita.detalle:''), mesa:'',
    cliNombre:cita.cliente||'', cliTel:cita.tel||'', cliDir:'', cliBarrio:'',
    cliCiudad:'', cliDepto:'', transportadora:'', domiciliario:'',
    estadoCocina:'',
    // Lo apartado ya salió del inventario al agendar: el cobro no lo vuelve a descontar
    stockAplicado:!!cita.stockDescontado,
    origenCita:cita.id
  };
  // El cobro es el mismo de cualquier venta: pago dividido, cambio, propina, verificación de transferencias (F9)
  abrirCobro(venta, true, {sinCarrito:true, pantalla:'citas', alCobrar:v=>{
    const arr=misDatos('citas');
    const c=arr.find(x=>x.id===cita.id);
    if(c){ c.estado='atendida'; c.cerrada=now(); c.ventaId=v.id; }
    guardarMisDatos('citas',arr);
    logAudit('Cobró entrega de cita', (v.factura||'')+' · '+(cita.cliente||'')+' · '+fmtMoney(v.total));
  }});
}
// F22: al anular la venta de una entrega, la cita vuelve a pendiente. Si la anulación
// devolvió los apartados al inventario, ya no están apartados (al cobrarla de nuevo se descuentan).
export function reabrirCitaDeVenta(venta, stockDevuelto){
  const arr=misDatos('citas');
  const c=arr.find(x=>x.id===venta.origenCita && x.ventaId===venta.id); if(!c) return;
  c.estado='pendiente'; c.ventaId=null; c.cerrada=null;
  if(stockDevuelto) c.stockDescontado=false;
  guardarMisDatos('citas',[c]);
  logAudit('Reabrió cita por anulación', (venta.factura||'')+' · '+(c.cliente||''));
}
export function eliminarCita(id){
  if(!exigirEscritura()) return;   // D10: solo lectura
  if(!puedeVerPantalla('citas')){ toast(MSJ.noTienesAccesoALaAgenda,'error'); return; }
  const c=misDatos('citas').find(x=>x.id===id);
  const debeDevolver = c && (c.apartados||[]).length && c.stockDescontado && !c.ventaId;
  const advertir = debeDevolver
    ? '¿Eliminar este agendamiento? Los productos apartados volverán al stock.'
    : '¿Eliminar este agendamiento?';
  confirmarModal(advertir,()=>{
    // Solo devolver stock si aún estaba apartado y NO se convirtió en venta
    if(debeDevolver){
      devolverApartado(c.apartados, 'Cita eliminada · '+(c.cliente||''));
      logAudit('Eliminó cita con apartados', (c.cliente||'')+' · productos devueltos al stock');
    }
    eliminarMisDatos('citas',id); toast(MSJ.eliminado,'info'); render();
  },'Eliminar');
}
