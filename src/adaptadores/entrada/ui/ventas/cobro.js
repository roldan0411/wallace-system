// ============================================================
//  INTERFAZ · Cobro y edición de ventas
//  Pago dividido, verificación de transferencias, anular, editar, ajustar cobro.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/02-pos-catalog/02-pos-catalog.md
// ============================================================
import { STATE, escapeHtml, fijarEscribiendo, fmtMoney, now } from '../nucleo/estado.js';
import { BOTON, MSJ } from '../nucleo/textos.js';
import { cajaActual, exigirEscritura, exigirPermiso, tienePermiso } from '../nucleo/permisos.js';
import { abrirModal, cerrarModal, confirmarModal, preguntarDespues, reportarError, toast } from '../nucleo/componentes.js';
import { sonidoVenta } from '../nucleo/sonidos.js';
import { render } from '../nucleo/navegacion.js';
import { logAudit } from '../usuarios/auditoria.js';
import { _guardando, cargarPedidoEnVenta, fijarGuardando, limpiarPedido, siguienteFactura } from './nueva-venta.js';
import { agregarMovimientoCaja, puedeRetirarJefe } from '../caja/caja.js';
import { imprimirComanda } from '../cocina/comanda.js';
import { reabrirCitaDeVenta } from '../citas/citas.js';
import { avisarStockBajo, descontarStock, devolverStock } from '../inventario/motor.js';
import { guardarClienteAuto, revertirClienteAuto } from '../clientes/clientes.js';
import { imprimirFactura } from '../impresion/facturas.js';


// ============================================================
//  PAGO DIVIDIDO
//  El cliente puede pagar con varias formas a la vez: parte en efectivo,
//  parte por transferencia, parte con tarjeta. Cada venta guarda cuánto
//  entró por cada forma en v.pagos, y de ahí salen caja, reportes y contable.
// ============================================================
export function detallePagos(v){
  const p=pagosDe(v);
  const et={efectivo:'Efectivo',banco:'Banco',tarjeta:'Tarjeta'};
  return Object.keys(p).filter(k=>p[k]>0).map(k=>et[k]+' '+fmtMoney(p[k])).join(' · ');
}
// ---------- Verificación de transferencias ----------
// Un empleado puede decir "pagó por transferencia" sin que el dinero llegue.
// Si el negocio activa esta opción, esas ventas quedan marcadas hasta que
// alguien confirme el comprobante.
export function exigeVerificarBanco(){ return !!(STATE.negocio && STATE.negocio.verificarBanco); }
export function ventasPorVerificar(lista){ return (lista||[]).filter(bancoPendiente); }
export function marcarVerificada(id){
  if(!exigirEscritura()) return;   // D10: solo lectura
  if(!(tienePermiso('cobrar')||tienePermiso('cambiarpago'))){ toast(MSJ.noTienesPermisoParaVerificarPagos,'error'); return; }
  const v=misDatos('ventas').find(x=>x.id===id); if(!v) return;
  confirmarModal('¿Confirmas que la transferencia de '+fmtMoney(pagosDe(v).banco)+' de '+(v.factura||'')+' YA llegó a la cuenta?',()=>{
    const ventas=misDatos('ventas');
    const x=ventas.find(y=>y.id===id); if(!x) return;
    x.bancoVerificado=true; x.verificadoPor=STATE.user.nombre; x.verificadoEn=now();
    guardarMisDatos('ventas',ventas);
    logAudit('Verificó transferencia', (x.factura||'')+' · '+fmtMoney(pagosDe(x).banco));
    toast(MSJ.pagoVerificado,'success'); render();
  },'Sí, ya llegó');
}

// ---------- COBRAR ----------
export function cobrarPedido(id){
  if(!exigirPermiso('cobrar','No tienes permiso para cobrar')) return;
  const v=misDatos('ventas').find(x=>x.id===id);
  if(!v){ toast(MSJ.pedidoNoEncontrado,'error'); return; }
  if(v.estado==='pagada'){ toast(MSJ.yaFueCobrado,'info'); return; }
  abrirCobro(v,false);
}

// Modal de cobro. esNuevo=true cuando viene de "Cobrar ahora" (flujo directo)
// opc (cobros que no salen del carrito, p. ej. la entrega de una cita):
//   sinCarrito: no limpiar el pedido que se esté armando en Nueva Venta
//   alCobrar(venta): se llama con la venta ya guardada
//   pantalla: a dónde ir después (por defecto Pedidos)
export function abrirCobro(v, esNuevo, opc){
  opc=opc||{};
  const neg=STATE.negocio;
  // D6: con caja, se cobra con la caja abierta (si no, ese dinero no entraría en ningún cierre)
  if(usaCajaNegocio() && !cajaActual()){ toast(MSJ.abreLaCajaAntesDeCobrar,'error'); return; }
  const base=v.subtotal||0;
  const dom=v.valorDom||0;
  const usaPropina=(neg.usaPropina!==undefined?neg.usaPropina:neg.usaCocina);
  const pct=neg.pctDatafono||0;
  const campos=[];
  if(usaPropina) campos.push({id:'propina', label:'Propina (del personal, no es del negocio)', tipo:'number', valor:'0'});
  campos.push({id:'recargo', label:'Recargo del datáfono (lo cobra el banco)', tipo:'number', valor:'0'});
  const totalIni=base+dom;

  abrirModal({titulo:'Cobrar '+(v.factura||'(nueva venta)')+' · '+fmtMoney(totalIni), textoBoton:BOTON.confirmarCobro,
    campos,
    extraHTML:`<div class="cobro-caja">
      <div class="c-row"><span>${escapeHtml(neg.palabraProductos||'Productos')}</span><strong>${fmtMoney(v.subtotalBruto!==undefined?v.subtotalBruto:base)}</strong></div>
      ${v.descuento>0?`<div class="c-row"><span>Descuento${v.descMotivo?' · '+escapeHtml(v.descMotivo):''}</span><strong class="rojo">−${fmtMoney(v.descuento)}</strong></div>`:''}
      ${dom>0?`<div class="c-row"><span>${v.tipo==='envio'?'Envío':'Domicilio'}</span><strong>${fmtMoney(dom)}</strong></div>`:''}
      <div class="c-row" id="r-prop" style="display:none;"><span>Propina</span><strong id="v-prop">$ 0</strong></div>
      <div class="c-row" id="r-rec" style="display:none;"><span>Recargo datáfono</span><strong id="v-rec">$ 0</strong></div>
      <div class="c-row c-total"><span>TOTAL A COBRAR</span><strong id="v-total">${fmtMoney(totalIni)}</strong></div>
    </div>
    <div class="cobro-caja mt-12">
      <strong>¿Cómo paga el cliente?</strong>
      <p class="nota m-6-0-10">Puede pagar con varias formas a la vez. Escribe cuánto entra por cada una; deja en 0 las que no use.</p>
      <div class="botones-fila">
        <button type="button" class="btn btn-sm btn-verde" data-click="pagoRapido('efectivo')">Todo en efectivo</button>
        <button type="button" class="btn btn-sm" data-click="pagoRapido('banco')">Todo por banco</button>
        <button type="button" class="btn btn-sm" data-click="pagoRapido('tarjeta')">Todo con tarjeta</button>
        <button type="button" class="btn btn-sm btn-ghost" data-click="pagoRapido('mitad')">Mitad y mitad</button>
      </div>
      <div class="form2 mt-6">
        <div class="m-row mb-8"><label>💵 Efectivo</label>
          <input type="number" id="pg-efectivo" class="campo" value="${escapeHtml(totalIni)}" inputmode="decimal"></div>
        <div class="m-row mb-8"><label>🏦 Transferencia / Banco</label>
          <input type="number" id="pg-banco" class="campo" value="0" inputmode="decimal"></div>
        <div class="m-row mb-8"><label>💳 Tarjeta / Datáfono</label>
          <input type="number" id="pg-tarjeta" class="campo" value="0" inputmode="decimal"></div>
        <div class="m-row mb-8"><label>Falta / sobra</label>
          <div class="campo d-flex items-centro fw-800" id="pg-estado">$ 0</div></div>
      </div>
      <div class="c-nota" id="c-nota"></div>
    </div>`,
    onAbrir:()=>{
      window._cobroTotal=totalIni;
      const recalc=()=>{
        const prop=parseFloat((document.getElementById('m-propina')||{}).value)||0;
        const rec=parseFloat((document.getElementById('m-recargo')||{}).value)||0;
        const total=base+dom+prop+rec;
        window._cobroTotal=total;
        const set=(id,val)=>{ const e=document.getElementById(id); if(e) e.textContent=val; };
        const ver=(id,on)=>{ const e=document.getElementById(id); if(e) e.style.display=on?'flex':'none'; };
        set('v-prop',fmtMoney(prop)); ver('r-prop',prop>0);
        set('v-rec',fmtMoney(rec));  ver('r-rec',rec>0);
        set('v-total',fmtMoney(total));
        pintarEstadoPago();
      };
      ['m-propina','m-recargo'].forEach(id=>{ const e=document.getElementById(id); if(e) e.addEventListener('input',recalc); });
      ['pg-efectivo','pg-banco','pg-tarjeta'].forEach(id=>{ const e=document.getElementById(id); if(e) e.addEventListener('input',pintarEstadoPago); });
      // Si usan tarjeta y hay % de datáfono configurado, se sugiere el recargo
      const t=document.getElementById('pg-tarjeta');
      if(t && pct>0) t.addEventListener('change',()=>{
        const r=document.getElementById('m-recargo');
        const val=parseFloat(t.value)||0;
        if(r && val>0 && !parseFloat(r.value)){ r.value=Math.round(val*pct/100); recalc(); }
      });
      recalc();
    },
    onGuardar:(d)=>{
      if(_guardando) return;
      if(!exigirEscritura()) return;                                     // D10
      const propina=parseFloat(d.propina)||0;
      const recargo=parseFloat(d.recargo)||0;
      // S9: nada negativo (una propina o un recargo negativos son un descuento sin permiso)
      if(!Dominio.pagos.montoValido(propina) || !Dominio.pagos.montoValido(recargo)){ toast(MSJ.losMontosNoPuedenSerNegativos,'error'); return; }
      const total=(v.subtotal||0)+(v.valorDom||0)+propina+recargo;
      // Reglas del cobro (faltante; el exceso es cambio y solo sale del efectivo): src/dominio/pagos.js
      const liq=Dominio.pagos.liquidarCobro(total, leerPagos());
      if(!liq.ok){
        toast(liq.error==='sin_pago'?'Escribe cuánto paga el cliente'
          :liq.error==='negativo'?MSJ.losMontosNoPuedenSerNegativos
          :liq.error==='faltan'?'Faltan '+fmtMoney(liq.faltan)+' por cubrir'
          :'Solo se puede dar cambio del efectivo. Revisa los montos.','error');
        return;
      }
      const pagos=liq.pagos, cambio=liq.cambio;
      const pagosR={efectivo:Math.round(pagos.efectivo), banco:Math.round(pagos.banco), tarjeta:Math.round(pagos.tarjeta)};
      // D6: el cobro cuenta en la caja abierta AHORA (un pedido de otro turno traía la de entonces)
      const cajaCobro=cajaActual();
      const cambios={pagos:pagosR, metodo:metodoPrincipal(pagosR), propina, recargo, total, cambio:Math.round(cambio),
        cobrado:now(), cobradoPor:STATE.user.nombre, exigeVerificar:exigeVerificarBanco()};
      if(cajaCobro) cambios.cajaId=cajaCobro.id;
      fijarGuardando(true);
      // Pedido nuevo (cobro directo): todavía no existe en ningún otro equipo
      if(esNuevo){
        try{
          if(!v.factura) v.factura=siguienteFactura();     // el número, recién ahora que el cobro se confirma
          const venta=Dominio.ventas.cobrarSiSigueIgual(Object.assign({}, v, {estado:'abierta'}), null, cambios);
          const ventas=misDatos('ventas');
          const yaEsta=ventas.findIndex(x=>x.id===venta.id);
          if(yaEsta>-1) ventas[yaEsta]=venta; else ventas.unshift(venta);   // evita duplicados al editar
          descontarStock(venta);                 // marca la venta como descontada
          guardarMisDatos('ventas',ventas);      // se guarda DESPUÉS, con la marca
          trasCobrar(venta);
        }catch(e){ reportarError('el cobro', e); }
        finally{ fijarGuardando(false); }
        return;
      }
      // D9: pedido que ya existe: se cobra sobre la versión del servidor, solo si sigue sin cobrar
      // y con los mismos productos (si otro equipo lo cobró o le agregó algo, no se cobra a ciegas)
      Datos.transaccionRegistro('ventas', v.id, cur=>Dominio.ventas.cobrarSiSigueIgual(cur, v.items, cambios))
      .then(r=>{
        if(!r.committed){
          if(r.motivo==='solo_lectura') return;
          const x=r.valor;
          toast(!x?MSJ.elPedidoYaNoExiste:(x.estado==='pagada'||x.estado==='anulada')?MSJ.esePedidoYaFueCobradoOAnulado:MSJ.otroEquipoCambioEstePedido,'error');
          cerrarModal(); render(); return;
        }
        const venta=r.valor;
        if(venta.stockAplicado!==true){ descontarStock(venta); guardarMisDatos('ventas',[venta]); }
        trasCobrar(venta);
      })
      .catch(e=>{ reportarError('el cobro', e); toast(MSJ.noSePudoGuardarIntentaDeNuevo,'error'); })
      .then(()=>{ fijarGuardando(false); });
      // Lo que sigue a un cobro ya guardado
      function trasCobrar(venta){
        guardarClienteAuto(venta);
        sonidoVenta();
        avisarStockBajo(venta);
        if(esNuevo && !opc.sinCarrito){ limpiarPedido(); fijarEscribiendo(false); }
        if(opc.alCobrar){ try{ opc.alCobrar(venta); }catch(e){ reportarError('después del cobro', e); } }
        cerrarModal();
        toast('Cobrado: '+fmtMoney(venta.total)+(cambio>0?' · Cambio '+fmtMoney(cambio):''),'success');
        if(cambio>0) setTimeout(()=>toast('💵 Devuelve '+fmtMoney(cambio)+' de cambio','info'),500);
        if((neg.funciones||[]).indexOf('facturas')>-1){
          const fid=venta.id;
          preguntarDespues(MSJ.imprimirFactura,()=>imprimirFactura(fid),'Imprimir');
        }
        STATE.pageNeg=opc.pantalla||'pedidos';
        render();
      }
    }});
}
// ¿Este negocio trabaja con caja? (igual que Nueva Venta y la entrega de citas)
export function usaCajaNegocio(){ const n=STATE.negocio; return !!(n && (n.funciones||[]).indexOf('caja')>-1 && n.usaCaja!==false); }
export function leerPagos(){
  const n=id=>parseFloat((document.getElementById(id)||{}).value)||0;
  return {efectivo:n('pg-efectivo'), banco:n('pg-banco'), tarjeta:n('pg-tarjeta')};
}
// Muestra si falta plata, si está exacto o cuánto hay que devolver
export function pintarEstadoPago(){
  const el=document.getElementById('pg-estado'); if(!el) return;
  const total=window._cobroTotal||0;
  const p=leerPagos();
  const suma=p.efectivo+p.banco+p.tarjeta;
  const dif=suma-total;
  if(Math.abs(dif)<0.5){ el.innerHTML='<span class="verde">✓ Exacto</span>'; }
  else if(dif<0){ el.innerHTML='<span class="rojo">Faltan '+fmtMoney(-dif)+'</span>'; }
  else { el.innerHTML='<span class="oro">Cambio '+fmtMoney(dif)+'</span>'; }
  const n=document.getElementById('c-nota');
  if(n){
    if(p.tarjeta>0){ n.innerHTML='💳 El recargo del datáfono lo cobra el banco, <strong>no es ingreso del negocio</strong>.'; n.style.display='block'; }
    else n.style.display='none';
  }
}
export function pagoRapido(tipo){
  const total=window._cobroTotal||0;
  const set=(id,v)=>{ const e=document.getElementById(id); if(e) e.value=v; };
  if(tipo==='mitad'){ set('pg-efectivo',Math.round(total/2)); set('pg-banco',total-Math.round(total/2)); set('pg-tarjeta',0); }
  else { set('pg-efectivo',tipo==='efectivo'?total:0); set('pg-banco',tipo==='banco'?total:0); set('pg-tarjeta',tipo==='tarjeta'?total:0); }
  pintarEstadoPago();
}

// ---------- ANULAR ----------
export function anularPedido(id){
  if(!exigirPermiso('anular','No tienes permiso para anular')) return;
  const v=misDatos('ventas').find(x=>x.id===id);
  if(!v){ toast(MSJ.pedidoNoEncontrado,'error'); return; }
  if(v.estado==='anulada'){ toast(MSJ.yaEstaAnulado,'info'); return; }
  // F20: una venta de una caja YA CERRADA cambia un cierre pasado. Solo admin o dueño,
  // y el efectivo que se le devuelve al cliente sale como retiro de la caja abierta.
  const cajaAb=cajaActual();
  const deCajaCerrada = v.estado==='pagada' && !!v.cajaId && (!cajaAb || cajaAb.id!==v.cajaId);
  const devolver = deCajaCerrada ? Math.round(pagosDe(v).efectivo) : 0;
  if(deCajaCerrada){
    if(!puedeRetirarJefe()){ toast(MSJ.esaVentaEsDeUnaCaja,'error'); return; }
    if(!cajaAb){ toast(MSJ.abreLaCajaParaRegistrarLa,'error'); return; }
  }
  const aviso = deCajaCerrada
    ? ' Es de una caja ya cerrada'+(devolver>0?': se registrará una salida de '+fmtMoney(devolver)+' en la caja abierta para devolverle el efectivo al cliente.':'.')
    : ' Si ya estaba cobrado, se devuelve el stock.';
  const estadoVisto=v.estado;
  confirmarModal('¿Anular el pedido '+(v.factura||'')+' de '+fmtMoney(v.total)+'?'+aviso, ()=>{
    // D9: sobre la versión del servidor y solo si sigue como se vio (no lo cobró o anuló otro equipo)
    Datos.transaccionRegistro('ventas', id, cur=>Dominio.ventas.anularSiSigueIgual(cur, estadoVisto, {anulada:now(), anuladaPor:STATE.user.nombre}))
    .then(r=>{
      if(!r.committed){ if(r.motivo!=='solo_lectura') toast(r.valor?MSJ.otroEquipoCambioEstePedido:MSJ.elPedidoYaNoExiste,'error'); render(); return; }
      trasAnular(r.valor);
    }).catch(e=>reportarError('anular el pedido', e));
  },'Sí, anular');
  function trasAnular(venta){
    const teniaStock = venta.stockAplicado===true || (venta.stockAplicado===undefined && estadoVisto==='pagada');
    const estabaPagada = estadoVisto==='pagada';
    if(teniaStock){ devolverStock(venta, 'Anulación del pedido '+(venta.factura||'')); guardarMisDatos('ventas',[venta]); }   // devuelve y deja constancia
    if(estabaPagada) revertirClienteAuto(venta);                                      // F22: las cifras del cliente
    if(venta.origenCita) reabrirCitaDeVenta(venta, teniaStock);                       // F22: la cita vuelve a pendiente
    if(deCajaCerrada && devolver>0){
      agregarMovimientoCaja({id:uid(), tipo:'retiro', concepto:'Devolución por anulación '+(venta.factura||''), valor:devolver, por:STATE.user.nombre, fecha:now()})
        .then(ok=>{ if(!ok) toast(MSJ.noSePudoRegistrarLaDevolucion,'error'); render(); })
        .catch(e=>reportarError('la devolución en caja', e));
    }
    logAudit('Anuló pedido', (venta.factura||'')+' · '+fmtMoney(venta.total)+(deCajaCerrada?' · de una caja cerrada (devolución '+fmtMoney(devolver)+')':''));
    toast(MSJ.pedidoAnulado,'info');
    render();
  }
}

// ---------- EDITAR PEDIDO ----------
export function editarPedido(id){
  if(!tienePermiso('editar')){ toast(MSJ.noTienesPermisoParaEditarPedidos,'error'); return; }
  const v=misDatos('ventas').find(x=>x.id===id);
  if(!v){ toast(MSJ.pedidoNoEncontrado,'error'); return; }
  if(v.estado==='anulada'){ toast(MSJ.noSePuedeEditarUnPedido,'error'); return; }
  // Una venta de una caja YA CERRADA no se toca: descuadraría ese cierre
  const cajaAb=cajaActual();
  if(v.estado==='pagada' && v.cajaId && (!cajaAb || cajaAb.id!==v.cajaId)){
    toast(MSJ.esePedidoEsDeUnaCaja,'error');
    return;
  }
  if(v.estado==='pagada' && !cajaAb){
    toast(MSJ.abreLaCajaAntesDeEditar,'error'); return;
  }
  STATE._itemsAntes=JSON.parse(JSON.stringify(v.items||[]));
  STATE._totalAntes=v.total||0;
  // Cargar el pedido en el carrito para modificarlo
  cargarPedidoEnVenta(v, true);
  STATE.editandoVentaId=id;   // marca que estamos editando, no creando
  fijarEscribiendo(true);
  STATE.pageNeg='ventas';
  toast('Editando '+(v.factura||'pedido')+(v.estado==='pagada'?' (ya cobrado: se ajustará el pago)':'')+'. Guarda para aplicar cambios.','info');
  render();
}
// Cuando se edita un pedido YA COBRADO y cambia el total, hay que decir
// cómo queda el pago. Hay dos formas, según lo que elija el negocio en
// Mi Negocio → "Al editar un pedido ya cobrado":
//  · "diferencia": solo se registra lo que el cliente debe o lo que hay que devolverle.
//  · "total": se vuelve a repartir el total completo entre las formas de pago.
export function modoAjusteCobro(){
  const n=STATE.negocio;
  return (n && n.ajusteCobro==='total') ? 'total' : 'diferencia';
}
export function ajustarPagoVenta(id, modoForzado){
  const v=misDatos('ventas').find(x=>x.id===id);
  if(!v){ toast(MSJ.pedidoNoEncontrado,'error'); return; }
  const p=pagosDe(v);
  const pagado=Math.round(p.efectivo+p.banco+p.tarjeta);
  const total=Math.round(v.total||0);
  const dif=total-pagado;                       // + el cliente debe · − hay que devolverle
  const modo=modoForzado||modoAjusteCobro();

  // ---------- MODO TOTAL: se cobra el total nuevo, como una venta normal ----------
  // No habla de deudas: muestra el total nuevo y el cajero lo cobra completo.
  // El pago anterior se REEMPLAZA, así que la caja no cuenta nada dos veces.
  if(modo==='total' || dif===0){
    abrirModal({titulo:'Cobrar '+(v.factura||'')+' · '+fmtMoney(total), textoBoton:BOTON.confirmarCobro, campos:[],
      extraHTML:`<div class="cobro-caja">
        <div class="c-row"><span>${escapeHtml((STATE.negocio.palabraProductos)||'Productos')}</span><span>${fmtMoney(v.subtotal||0)}</span></div>
        ${(v.valorDom||0)>0?`<div class="c-row"><span>Domicilio</span><span>${fmtMoney(v.valorDom)}</span></div>`:''}
        ${(v.propina||0)>0?`<div class="c-row"><span>Propina</span><span>${fmtMoney(v.propina)}</span></div>`:''}
        ${(v.recargo||0)>0?`<div class="c-row"><span>Recargo datáfono</span><span>${fmtMoney(v.recargo)}</span></div>`:''}
        <div class="c-row c-total"><span>TOTAL A COBRAR</span><strong>${fmtMoney(total)}</strong></div>
      </div>
      <div class="cobro-caja mt-12">
        <strong>¿Cómo paga el cliente?</strong>
        <p class="nota m-6-0-10">Cobra el total completo de ${fmtMoney(total)}. Esto reemplaza el pago anterior del pedido, así que la caja queda con el valor correcto.</p>
        <div class="botones-fila">
          <button type="button" class="btn btn-sm btn-verde" data-click="pagoRapido('efectivo')">Todo en efectivo</button>
          <button type="button" class="btn btn-sm" data-click="pagoRapido('banco')">Todo por banco</button>
          <button type="button" class="btn btn-sm" data-click="pagoRapido('tarjeta')">Todo con tarjeta</button>
          <button type="button" class="btn btn-sm btn-ghost" data-click="pagoRapido('mitad')">Mitad y mitad</button>
        </div>
        <div class="form2 mt-6">
          <div class="m-row mb-8"><label>💵 Efectivo</label><input type="number" id="pg-efectivo" class="campo" value="${escapeHtml(total)}"></div>
          <div class="m-row mb-8"><label>🏦 Banco</label><input type="number" id="pg-banco" class="campo" value="0"></div>
          <div class="m-row mb-8"><label>💳 Tarjeta</label><input type="number" id="pg-tarjeta" class="campo" value="0"></div>
          <div class="m-row mb-8"><label>Falta / sobra</label><div class="campo d-flex items-centro fw-800" id="pg-estado">$ 0</div></div>
        </div>
        ${dif!==0?`<button type="button" class="btn btn-ghost btn-sm mt-6" data-click="ajustarPagoDesdeModal('${escapeHtml(id)}','diferencia')">↔ Cobrar solo la diferencia (${fmtMoney(Math.abs(dif))})</button>`:''}
        <div class="c-nota" id="c-nota"></div>
      </div>`,
    onAbrir:()=>{
      window._cobroTotal=total;
      ['pg-efectivo','pg-banco','pg-tarjeta'].forEach(x=>{ const e=document.getElementById(x); if(e) e.addEventListener('input',pintarEstadoPago); });
      pintarEstadoPago();
    },
    onGuardar:()=>{
      const nuevos=leerPagos();
      if(!Dominio.pagos.pagosValidos(nuevos)){ toast(MSJ.losMontosNoPuedenSerNegativos,'error'); return; }   // S9
      const suma=nuevos.efectivo+nuevos.banco+nuevos.tarjeta;
      if(Math.abs(suma-total)>0.5){ toast('La suma debe dar exactamente '+fmtMoney(total),'error'); return; }
      guardarAjusteCobro(id, {efectivo:Math.round(nuevos.efectivo), banco:Math.round(nuevos.banco), tarjeta:Math.round(nuevos.tarjeta)});
    }});
    return;
  }

  // ---------- MODO DIFERENCIA: solo lo que falta cobrar o devolver ----------
  const cobra=dif>0;
  const monto=Math.abs(dif);
  const tope={efectivo:Math.round(p.efectivo), banco:Math.round(p.banco), tarjeta:Math.round(p.tarjeta)};
  abrirModal({titulo:(cobra?'Cobrar la diferencia · ':'Devolver al cliente · ')+(v.factura||''),
    textoBoton:cobra?'Registrar el cobro':'Registrar la devolución', campos:[],
    extraHTML:`<div class="cobro-caja">
      <div class="c-row"><span>Total anterior</span><span>${fmtMoney(pagado)}</span></div>
      <div class="c-row"><span>Total nuevo</span><span>${fmtMoney(total)}</span></div>
      <div class="c-row c-total"><span>${cobra?'EL CLIENTE DEBE':'HAY QUE DEVOLVERLE'}</span><strong class="${cobra?'oro':'rojo'}">${fmtMoney(monto)}</strong></div>
    </div>
    <div class="cobro-caja mt-12">
      <strong>${cobra?'¿Con qué paga esa diferencia?':'¿De dónde sale la devolución?'}</strong>
      <p class="nota m-6-0-10">Solo registra ${fmtMoney(monto)}. El resto del pago queda como estaba.${cobra?'':' No puedes devolver por una forma más de lo que se pagó por ella.'}</p>
      <div class="botones-fila">
        <button type="button" class="btn btn-sm btn-verde" data-click="pagoRapido('efectivo')">Todo en efectivo</button>
        <button type="button" class="btn btn-sm" data-click="pagoRapido('banco')">Todo por banco</button>
        <button type="button" class="btn btn-sm" data-click="pagoRapido('tarjeta')">Todo con tarjeta</button>
      </div>
      <div class="form2 mt-6">
        <div class="m-row mb-8"><label>💵 Efectivo${cobra?'':' (pagado: '+fmtMoney(tope.efectivo)+')'}</label><input type="number" id="pg-efectivo" class="campo" value="${escapeHtml(monto)}"></div>
        <div class="m-row mb-8"><label>🏦 Banco${cobra?'':' (pagado: '+fmtMoney(tope.banco)+')'}</label><input type="number" id="pg-banco" class="campo" value="0"></div>
        <div class="m-row mb-8"><label>💳 Tarjeta${cobra?'':' (pagado: '+fmtMoney(tope.tarjeta)+')'}</label><input type="number" id="pg-tarjeta" class="campo" value="0"></div>
        <div class="m-row mb-8"><label>Falta / sobra</label><div class="campo d-flex items-centro fw-800" id="pg-estado">$ 0</div></div>
      </div>
      <button type="button" class="btn btn-ghost btn-sm mt-6" data-click="ajustarPagoDesdeModal('${escapeHtml(id)}','total')">↔ Mejor repartir el total completo</button>
      <div class="c-nota" id="c-nota"></div>
    </div>`,
  onAbrir:()=>{
    window._cobroTotal=monto;
    ['pg-efectivo','pg-banco','pg-tarjeta'].forEach(x=>{ const e=document.getElementById(x); if(e) e.addEventListener('input',pintarEstadoPago); });
    pintarEstadoPago();
  },
  onGuardar:()=>{
    const d=leerPagos();
    if(!Dominio.pagos.pagosValidos(d)){ toast(MSJ.losMontosNoPuedenSerNegativos,'error'); return; }   // S9
    const suma=d.efectivo+d.banco+d.tarjeta;
    if(Math.abs(suma-monto)>0.5){ toast('Debe sumar exactamente '+fmtMoney(monto),'error'); return; }
    const signo=cobra?1:-1;
    const fin={efectivo:Math.round(p.efectivo+signo*d.efectivo),
               banco:Math.round(p.banco+signo*d.banco),
               tarjeta:Math.round(p.tarjeta+signo*d.tarjeta)};
    if(fin.efectivo<0||fin.banco<0||fin.tarjeta<0){
      toast(MSJ.noPuedesDevolverPorUnaForma,'error'); return;
    }
    guardarAjusteCobro(id, fin, (cobra?'Cobró ':'Devolvió ')+fmtMoney(monto));
  }});
}
// Guarda el nuevo reparto del pago en la venta
export function guardarAjusteCobro(id, pagos, detalleExtra){
  if(!exigirPermiso('editar','No tienes permiso para editar pedidos')) return;    // S7/S11: también si se llama sola
  if(!Dominio.pagos.pagosValidos(pagos)){ toast(MSJ.losMontosNoPuedenSerNegativos,'error'); return; }
  const ventas=misDatos('ventas');
  const x=ventas.find(y=>y.id===id); if(!x){ cerrarModal(); return; }
  const antes=detallePagos(x);
  x.pagos=pagos;
  x.metodo=metodoPrincipal(pagos);
  if(exigeVerificarBanco() && pagos.banco>0){ if(x.bancoVerificado!==true) x.bancoVerificado=false; }
  else if(pagos.banco<=0){ delete x.bancoVerificado; }
  x.pagoDescuadrado=false;
  x.pagoEditadoPor=STATE.user.nombre; x.pagoEditadoEn=now();
  guardarMisDatos('ventas',ventas);
  logAudit('Ajustó el cobro tras editar', (x.factura||'')+': '+antes+' → '+detallePagos(x)+(detalleExtra?' · '+detalleExtra:''));
  cerrarModal();
  toast(detalleExtra?detalleExtra:'Cobro ajustado','success');
  render();
}

// ---------- CAMBIAR FORMA DE PAGO (después de cobrado) ----------
export function cambiarFormaPago(id){
  if(!tienePermiso('cambiarpago')){ toast(MSJ.noTienesPermisoParaCambiarLa,'error'); return; }
  const v=misDatos('ventas').find(x=>x.id===id);
  if(!v){ toast(MSJ.pedidoNoEncontrado,'error'); return; }
  if(v.estado!=='pagada'){ toast(MSJ.soloAplicaAPedidosYaCobrados,'error'); return; }
  // F24: mover plata entre efectivo y banco de una caja YA CERRADA cambia un cierre contado
  if(esDeCajaCerrada(v)){ toast(MSJ.esePedidoEsDeUnaCaja,'error'); return; }
  const p=pagosDe(v);
  const total=v.total||0;
  abrirModal({titulo:'Corregir la forma de pago', textoBoton:BOTON.guardar, campos:[],
    extraHTML:`<p class="nota">Total cobrado: <strong>${fmtMoney(total)}</strong>. Reparte ese valor entre las formas de pago reales.</p>
    <div class="cobro-caja">
      <div class="form2">
        <div class="m-row mb-8"><label>💵 Efectivo</label><input type="number" id="pg-efectivo" class="campo" value="${Math.round(p.efectivo)}"></div>
        <div class="m-row mb-8"><label>🏦 Banco</label><input type="number" id="pg-banco" class="campo" value="${Math.round(p.banco)}"></div>
        <div class="m-row mb-8"><label>💳 Tarjeta</label><input type="number" id="pg-tarjeta" class="campo" value="${Math.round(p.tarjeta)}"></div>
        <div class="m-row mb-8"><label>Falta / sobra</label><div class="campo d-flex items-centro fw-800" id="pg-estado">$ 0</div></div>
      </div>
      <div class="c-nota" id="c-nota"></div>
    </div>`,
  onAbrir:()=>{
    window._cobroTotal=total;
    ['pg-efectivo','pg-banco','pg-tarjeta'].forEach(x=>{ const e=document.getElementById(x); if(e) e.addEventListener('input',pintarEstadoPago); });
    pintarEstadoPago();
  },
  onGuardar:()=>{
    const nuevos=leerPagos();
    if(!Dominio.pagos.pagosValidos(nuevos)){ toast(MSJ.losMontosNoPuedenSerNegativos,'error'); return; }   // S9
    const suma=nuevos.efectivo+nuevos.banco+nuevos.tarjeta;
    if(Math.abs(suma-total)>0.5){ toast('La suma debe dar exactamente '+fmtMoney(total),'error'); return; }
    const ventas=misDatos('ventas');
    const x=ventas.find(y=>y.id===id);
    if(!x){ cerrarModal(); return; }
    const antes=detallePagos(x);
    x.pagos={efectivo:Math.round(nuevos.efectivo), banco:Math.round(nuevos.banco), tarjeta:Math.round(nuevos.tarjeta)};
    x.metodo=metodoPrincipal(x.pagos);
    if(exigeVerificarBanco() && x.pagos.banco>0){ if(x.bancoVerificado!==true) x.bancoVerificado=false; }
    else if(x.pagos.banco<=0){ delete x.bancoVerificado; }
    x.pagoEditadoPor=STATE.user.nombre; x.pagoEditadoEn=now();
    guardarMisDatos('ventas',ventas);
    logAudit('Cambió forma de pago', (x.factura||'')+': '+antes+' → '+detallePagos(x));
    cerrarModal(); toast(MSJ.formaDePagoActualizada,'success'); render();
  }});
}

// ---------- REIMPRIMIR COMANDA (cocina) ----------
export function reimprimirComanda(id){
  if(!tienePermiso('comanda')){ toast(MSJ.noTienesPermisoParaImprimirComandas,'error'); return; }
  const v=misDatos('ventas').find(x=>x.id===id);
  if(!v){ toast(MSJ.pedidoNoEncontrado,'error'); return; }
  imprimirComanda(v);
}

// ---------- ELIMINAR DEFINITIVAMENTE ----------
export function eliminarDefinitivo(id){
  if(!tienePermiso('eliminar')){ toast(MSJ.noTienesPermisoParaEliminar,'error'); return; }
  const v=misDatos('ventas').find(x=>x.id===id);
  if(!v){ toast(MSJ.pedidoNoEncontrado,'error'); return; }
  // F24: solo pedidos YA ANULADOS. La anulación devuelve el stock, respeta las cajas cerradas (F20)
  // y revierte cliente y cita (F22); eliminar una venta viva se saltaba todo eso.
  if(v.estado!=='anulada'){ toast(MSJ.soloSePuedeEliminarUnPedidoAnulado,'error'); return; }
  confirmarModal('⚠️ Eliminar PERMANENTEMENTE '+(v.factura||'este pedido')+' ('+fmtMoney(v.total)+'), que ya está anulado. No se puede deshacer. ¿Continuar?', ()=>{
    eliminarMisDatos('ventas',id);
    logAudit('Eliminó definitivamente', (v.factura||'')+' · '+fmtMoney(v.total));
    toast(MSJ.pedidoEliminadoPorCompleto,'error'); render();
  },'Sí, eliminar');
}
// ¿Es de una caja ya cerrada? (F20/F24: editar, anular o cambiar el pago tocan ese cierre)
export function esDeCajaCerrada(v){
  const cajaAb=cajaActual();
  return !!(v && v.estado==='pagada' && v.cajaId && (!cajaAb || cajaAb.id!==v.cajaId));
}
// Botones dentro de un modal que abren el ajuste de cobro (fase 8: antes eran onclick compuestos)
export function ajustarPagoDesdeModal(id, modo){ cerrarModal(); ajustarPagoVenta(id, modo); }
