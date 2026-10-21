// ============================================================
//  INTERFAZ · Cuentas abiertas
//  Cuentas por mesa o cliente que se cobran al final.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/02-pos-catalog/02-pos-catalog.md
// ============================================================
import { STATE, escapeHtml, fijarEscribiendo, fmtMoney, now } from '../nucleo/estado.js';
import { BOTON, MSJ } from '../nucleo/textos.js';
import { exigirEscritura, exigirPermiso, puedeVerPantalla, tienePermiso, usaInventario } from '../nucleo/permisos.js';
import { abrirModal, cerrarModal, confirmarModal, ic, pProds, reportarError, toast } from '../nucleo/componentes.js';
import { sonidoError, sonidoPedido } from '../nucleo/sonidos.js';
import { render } from '../nucleo/navegacion.js';
import { logAudit } from '../usuarios/auditoria.js';
import { _carrito, _guardando, _vObs, armarVenta, bloquearBoton, cargarPedidoEnVenta, fijarGuardando, limpiarPedido, validarClientePedido } from './nueva-venta.js';
import { ventasJornada } from './pedidos.js';
import { imprimirComandaSegura } from '../cocina/comanda.js';
import { ajustarStockPorEdicion, descontarStock, devolverStock, faltantesPara, requerimientos } from '../inventario/motor.js';


// ============================================================
//  CUENTAS ABIERTAS
//  Para licoreras, bares y restaurantes: se abre una cuenta por mesa o
//  por cliente, se le van agregando productos durante la noche y se cobra
//  al final. Cada producto que se agrega descuenta inventario al cobrar.
// ============================================================
// ¿El inventario se descuenta apenas se pide, o hasta que se cobra?
// En una licorera o un bar el producto YA salió de la nevera al pedirlo,
// así que el stock debe bajar de una. En otros negocios puede convenir
// esperar al cobro. Se elige en Mi Negocio.
export function descuentaAlPedir(){
  const n=STATE.negocio;
  if(!n || !usaInventario()) return false;
  if(n.descontarAlPedir!==undefined) return !!n.descontarAlPedir;
  return hayPedidosAbiertos();   // por defecto: sí, donde hay pedidos sin cobrar
}
export function usaCuentas(){
  const n=STATE.negocio;
  // Es OPCIONAL: solo aparece si el negocio la habilita en Mi Negocio.
  // Hay negocios que cobran de una y no necesitan cuentas.
  return !!(n && n.usaCuentas===true);
}
// ¿En este negocio existen pedidos sin cobrar? (cuentas abiertas o flujo de dos pasos)
export function hayPedidosAbiertos(){
  const n=STATE.negocio;
  return !!(n && (n.usaCuentas===true || n.flujoPedido==='dos_pasos'));
}
export function cuentasAbiertas(){
  return ventasJornada(false).filter(v=>v.estado==='abierta')
    .sort((a,b)=>new Date(a.fecha||0)-new Date(b.fecha||0));
}
export function nombreCuenta(v){
  if(!v) return 'cuenta';
  if(v.mesa) return v.mesa;
  if(v.cliNombre) return v.cliNombre;
  return v.factura||'Cuenta';
}
export function minutosAbierta(v){
  return Math.max(0, Math.floor((Date.now()-new Date(v.fecha||Date.now()).getTime())/60000));
}
export function tiempoTxt(min){
  if(min<60) return min+' min';
  const h=Math.floor(min/60), m=min%60;
  return h+'h '+(m?m+'m':'');
}
// Abre la cuenta con lo que hay en el carrito (negocios de cobro directo)
export function abrirCuentaNueva(){
  if(!puedeUsarCuentas()){ toast(MSJ.noTienesAccesoALasCuentas,'error'); return; }   // S7
  if(!exigirEscritura()) return;                                                         // D10
  if(!_carrito.length){ toast(MSJ.agregaProductosPrimero,'error'); return; }
  if(!validarClientePedido()) return;
  if(_guardando) return;
  if(descuentaAlPedir()){
    const faltan=faltantesPara(requerimientos(_carrito));
    if(faltan.length){ toast('⛔ No alcanza el inventario: '+faltan.join(', '),'error'); sonidoError(); return; }
  }
  fijarGuardando(true);
  try{
    const venta=armarVenta('abierta');
    venta.estado='abierta';
    venta.esCuenta=true;
    if(descuentaAlPedir()) descontarStock(venta);   // el producto ya salió: baja el stock
    const ventas=misDatos('ventas');
    ventas.unshift(venta);
    guardarMisDatos('ventas',ventas);
    logAudit('Abrió cuenta', (venta.factura||'')+' · '+nombreCuenta(venta)+(venta.stockAplicado?' · inventario descontado':''));
    sonidoPedido();
    if(STATE.negocio.usaCocina) imprimirComandaSegura(venta);
    limpiarPedido(); fijarEscribiendo(false); STATE.pageNeg='cuentas'; render();
    toast('Cuenta abierta: '+nombreCuenta(venta),'success');
  }catch(e){ reportarError('abrir la cuenta', e); }
  finally{ fijarGuardando(false); }
}
// Entra al modo "agregar productos a esta cuenta"
export function irAgregarACuenta(id){
  const v=misDatos('ventas').find(x=>x.id===id);
  if(!v){ toast(MSJ.cuentaNoEncontrada,'error'); return; }
  if(v.estado!=='abierta'){ toast(MSJ.esaCuentaYaFueCobrada,'error'); return; }
  if(STATE.editandoVentaId){ toast(MSJ.terminaLaEdicionQueTienesAbierta,'error'); return; }
  STATE.agregandoCuentaId=id;
  cargarPedidoEnVenta(v, false);
  fijarEscribiendo(true);
  STATE.pageNeg='ventas';
  render();
  toast('Agregando a '+nombreCuenta(v),'info');
}
export function salirDeCuenta(){
  STATE.agregandoCuentaId=null;
  limpiarPedido(); fijarEscribiendo(false); STATE.pageNeg='cuentas'; render();
}
// Suma lo del carrito a la cuenta (no la reemplaza)
export function agregarACuenta(){
  if(!puedeUsarCuentas()){ toast(MSJ.noTienesAccesoALasCuentas,'error'); return; }   // S7
  if(!exigirEscritura()) return;                                                         // D10
  if(_guardando) return;
  const id=STATE.agregandoCuentaId;
  if(!id){ toast(MSJ.noHayNingunaCuentaAbiertaSeleccionada,'error'); return; }
  if(!_carrito.length){ toast(MSJ.agregaProductosPrimero,'error'); return; }
  const v=misDatos('ventas').find(x=>x.id===id);
  if(!v){ toast(MSJ.esaCuentaYaNoExiste,'error'); salirDeCuenta(); return; }
  if(v.estado!=='abierta'){ toast(MSJ.esaCuentaYaFueCobrada,'error'); salirDeCuenta(); return; }
  // Si el inventario ya se había descontado (raro en cuentas), revisar que alcance
  if(v.stockAplicado===true){
    const faltan=faltantesPara(requerimientos(_carrito));
    if(faltan.length){ toast('⛔ No alcanza el inventario: '+faltan.join(', '),'error'); sonidoError(); return; }
  }
  fijarGuardando(true);
  bloquearBoton('btn-confirmar','Guardando…');
  const nuevos=JSON.parse(JSON.stringify(_carrito));
  // D9: se suma sobre la cuenta DEL SERVIDOR (transacción): si otro mesero agregó al mismo tiempo,
  // no se pierde lo suyo; si ya la cobraron o cancelaron, no se agrega nada
  return Datos.transaccionRegistro('ventas', id, cur=>Dominio.ventas.agregarACuenta(cur, nuevos,
      {quien:STATE.user.nombre, cuando:now(), obs:_vObs, reabrirCocina:!!STATE.negocio.usaCocina}))
  .then(r=>{
    if(!r.committed){
      if(r.motivo!=='solo_lectura'){ toast(MSJ.esaCuentaYaNoEstaAbierta,'error'); salirDeCuenta(); }
      return;
    }
    const x=r.valor;
    if(x.stockAplicado===true) ajustarStockPorEdicion([], nuevos, x.factura);
    logAudit('Agregó a la cuenta', (x.factura||'')+' · '+nuevos.reduce((a,i)=>a+i.qty,0)+' und · total '+fmtMoney(x.total));
    sonidoPedido();
    // Comanda solo de lo NUEVO, para que cocina no repita lo anterior
    if(STATE.negocio.usaCocina){
      imprimirComandaSegura(Object.assign({}, x, {items:nuevos, obs:'AGREGADO A '+nombreCuenta(x)}));
    }
    STATE.agregandoCuentaId=null;
    limpiarPedido(); fijarEscribiendo(false); STATE.pageNeg='cuentas'; render();
    toast('Agregado a '+nombreCuenta(x)+' · va en '+fmtMoney(x.total),'success');
  })
  .catch(e=>{ reportarError('agregar a la cuenta', e); toast(MSJ.noSePudoGuardarIntentaDeNuevo,'error'); })
  .then(()=>{ fijarGuardando(false); });
}
// Cambiar el nombre o la mesa de una cuenta
// S7: abrir, agregar y renombrar cuentas = quien vende o maneja las cuentas
export function puedeUsarCuentas(){ return puedeVerPantalla('ventas') || puedeVerPantalla('cuentas'); }
export function renombrarCuenta(id){
  if(!puedeUsarCuentas()){ toast(MSJ.noTienesAccesoALasCuentas,'error'); return; }   // S7
  const v=misDatos('ventas').find(x=>x.id===id); if(!v) return;
  abrirModal({titulo:'Nombre de la cuenta', textoBoton:BOTON.guardar, campos:[
    {id:'nombre', label:'Mesa o nombre del cliente', valor:v.mesa||v.cliNombre||'', requerido:true, placeholder:'Ej: Mesa 4, Don Jorge'}
  ], onGuardar:(d)=>{
    const ventas=misDatos('ventas');
    const x=ventas.find(y=>y.id===id); if(!x){ cerrarModal(); return; }
    if(x.tipo==='mesa') x.mesa=d.nombre.trim(); else x.cliNombre=d.nombre.trim();
    guardarMisDatos('ventas',ventas);
    cerrarModal(); toast(MSJ.cuentaRenombrada,'success'); render();
  }});
}
export function cuentas(){
  fijarEscribiendo(false);
  if(!usaCuentas()){
    return `<div class="tarjeta centro-msg"><div class="msg-ico">🧾</div>
      <div class="t-tit centrado">Las cuentas abiertas están apagadas</div>
      <p class="gris">Este negocio cobra de una y no usa cuentas. Si quieres ir agregando productos y cobrar al final (como en un bar o una licorera), actívalo en <strong>Mi Negocio → Usar cuentas abiertas</strong>.</p>
      ${(STATE.user.rol==='admin'||STATE.user.esSupervisor)?`<button class="btn btn-gold" data-click="irA('minegocio')">Ir a Mi Negocio</button>`:''}</div>`;
  }
  const lista=cuentasAbiertas();
  const total=lista.reduce((a,v)=>a+(v.total||0),0);
  const und=lista.reduce((a,v)=>a+(v.items||[]).reduce((x,i)=>x+i.qty,0),0);
  return `
    <div class="stats">
      <div class="stat gold"><div class="stat-ico gold">${ic('report')}</div><div class="stat-lbl">Cuentas abiertas</div><div class="stat-val">${lista.length}</div><div class="stat-sub">sin cobrar</div></div>
      <div class="stat verde"><div class="stat-ico verde">${ic('cash')}</div><div class="stat-lbl">Por cobrar</div><div class="stat-val">${fmtMoney(total)}</div><div class="stat-sub">${und} ${pProds()}</div></div>
      ${lista.length?`<div class="stat azul"><div class="stat-ico azul">${ic('history')}</div><div class="stat-lbl">La más antigua</div><div class="stat-val fs-19">${tiempoTxt(minutosAbierta(lista[0]))}</div><div class="stat-sub">${escapeHtml(nombreCuenta(lista[0]))}</div></div>`:''}
    </div>
    <div class="tarjeta">
      <div class="t-cab">
        <div><span class="t-tit">🧾 Cuentas abiertas</span>
          <p class="gris">Se les va agregando durante la noche y se cobran al final. Toca una para agregarle más.${usaInventario()?(descuentaAlPedir()?' El inventario se descuenta apenas se agrega el producto.':' El inventario se descuenta al cobrar.'):''}</p></div>
        <button class="btn btn-gold" data-click="nuevaCuentaDesdeCero()">+ Abrir cuenta</button>
      </div>
      ${lista.length?`<div class="kds-grid">
        ${lista.map(v=>{
          const min=minutosAbierta(v);
          const cls=min<60?'krono-verde':min<180?'krono-amar':'krono-rojo';
          return `<div class="kds-card ${escapeHtml(cls)}">
            <div class="kds-top">
              <span class="kds-ref">${escapeHtml(nombreCuenta(v))}</span>
              <span class="kds-krono">${fmtMoney(v.total||0)}</span>
            </div>
            <div class="kds-tipo">${escapeHtml(v.factura||'')} · abierta hace ${tiempoTxt(min)}${v.vendedor?' · '+escapeHtml(v.vendedor):''}</div>
            <div class="kds-items">
              ${(v.items||[]).slice(0,6).map(i=>`<div class="kds-item"><strong>${i.qty}×</strong> ${escapeHtml(i.nombre)} <span class="gris">${fmtMoney(i.precio*i.qty)}</span></div>`).join('')}
              ${(v.items||[]).length>6?`<div class="gris chico">+ ${(v.items||[]).length-6} más…</div>`:''}
            </div>
            <div class="kds-acc">
              <button class="btn btn-sm btn-verde" data-click="irAgregarACuenta('${escapeHtml(v.id)}')">➕ Agregar</button>
              ${tienePermiso('cobrar')?`<button class="btn btn-sm btn-gold" data-click="cobrarPedido('${escapeHtml(v.id)}')">💵 Cobrar</button>`:''}
              ${tienePermiso('imprimir')?`<button class="btn btn-sm" data-click="imprimirFactura('${escapeHtml(v.id)}')" title="Imprimir la cuenta para que la revise el cliente">🧾</button>`:''}
              <button class="btn btn-sm btn-ghost" data-click="renombrarCuenta('${escapeHtml(v.id)}')" title="Cambiar mesa o nombre">✏️</button>
              ${tienePermiso('anular')?`<button class="btn btn-sm btn-rojo" data-click="cancelarCuenta('${escapeHtml(v.id)}')" title="Se fueron sin consumir o sin pagar">🚫 Cancelar</button>`:''}
            </div>
          </div>`;
        }).join('')}
      </div>`:`<div class="centro-msg"><div class="msg-ico">🧾</div>
        <p class="gris">No hay cuentas abiertas. Abre una y ve agregándole productos; se cobra cuando el cliente se va.</p>
        <button class="btn btn-gold" data-click="nuevaCuentaDesdeCero()">+ Abrir cuenta</button></div>`}
    </div>`;
}
// Cancelar una cuenta: no consumieron o no pagaron. Devuelve el producto al
// inventario (si ya se había descontado) y queda registrado quién la canceló.
export function cancelarCuenta(id){
  if(!exigirPermiso('anular', MSJ.noTienesPermisoParaCancelarCuentas)) return;
  const v=misDatos('ventas').find(x=>x.id===id);
  if(!v){ toast(MSJ.cuentaNoEncontrada,'error'); return; }
  if(v.estado!=='abierta'){ toast(MSJ.esaCuentaYaFueCobradaUsa,'error'); return; }
  const und=(v.items||[]).reduce((a,i)=>a+i.qty,0);
  const devuelve = v.stockAplicado===true;   // lo que se descontó vuelve aunque hoy el inventario esté apagado
  confirmarModal('¿Cancelar la cuenta de '+nombreCuenta(v)+' por '+fmtMoney(v.total||0)+'?'
    +(devuelve?' Los '+und+' producto(s) vuelven al inventario.':''),()=>{
    // D9: solo si sigue abierta en el servidor (no la cobró otro equipo mientras tanto)
    Datos.transaccionRegistro('ventas', id, cur=>Dominio.ventas.anularSiSigueIgual(cur, 'abierta',
        {anulada:now(), anuladaPor:STATE.user.nombre, motivoAnulacion:'Cuenta cancelada'}))
    .then(r=>{
      if(!r.committed){ if(r.motivo!=='solo_lectura') toast(MSJ.esaCuentaYaNoEstaAbierta,'error'); render(); return; }
      const x=r.valor;
      const devolvio = x.stockAplicado===true;
      if(devolvio){ devolverStock(x, 'Cuenta cancelada · '+nombreCuenta(x)); guardarMisDatos('ventas',[x]); }
      logAudit('Canceló cuenta abierta', (x.factura||'')+' · '+nombreCuenta(x)+' · '+fmtMoney(x.total||0)+(devolvio?' · inventario devuelto':''));
      toast('Cuenta cancelada'+(devolvio?' · producto devuelto al inventario':''),'info');
      render();
    }).catch(e=>reportarError('cancelar la cuenta', e));
  },'Sí, cancelar');
}
export function nuevaCuentaDesdeCero(){
  STATE.agregandoCuentaId=null;
  limpiarPedido();
  STATE.pageNeg='ventas';
  fijarEscribiendo(true);
  render();
  toast(MSJ.armaElPedidoYUsaDejar,'info');
}
