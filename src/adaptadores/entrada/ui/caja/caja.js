// ============================================================
//  INTERFAZ · Caja
//  Apertura, movimientos, cierre con cuadre, base del día siguiente.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/03-cash-register/03-cash-register.md
// ============================================================
import { STATE, escapeHtml, fijarEscribiendo, fmtDate, fmtMoney, jornadaActual, now } from '../nucleo/estado.js';
import { BOTON, MSJ } from '../nucleo/textos.js';
import { cajaActual, exigirEscritura, sucursalActual, tienePermiso } from '../nucleo/permisos.js';
import { abrirModal, cerrarModal, ic, logoNegocio, pPedido, pPedidos, pPersonal, pProds, reportarError, toast } from '../nucleo/componentes.js';
import { render } from '../nucleo/navegacion.js';
import { logAudit } from '../usuarios/auditoria.js';
import { _guardando, fijarGuardando } from '../ventas/nueva-venta.js';
import { ventasJornada } from '../ventas/pedidos.js';
import { ventasPorVerificar } from '../ventas/cobro.js';


// ============================================================
//  CAJA
// ============================================================
export function caja(){
  fijarEscribiendo(false);
  const neg=STATE.negocio;
  const c=cajaActual();
  if(!c){
    const bs=baseSiguiente();
    const cfg=cfgCaja();
    const ret=(cfg.retirosCerrada||[]).slice(0,5);
    return `<div class="tarjeta centro-msg">
      <div class="msg-ico">${ic('cash')}</div>
      <div class="t-tit centrado">Caja cerrada</div>
      ${bs===null
        ? `<p class="gris">Primera apertura: escribe la base con la que arranca el negocio. De aquí en adelante la base sale sola de lo que quede al cerrar.</p>
           <div class="m-row maxw-280 m-16-auto">
             <label>Base inicial (efectivo con el que arrancas)</label>
             <input type="number" id="caja-base" value="0" class="campo">
           </div>`
        : `<p class="gris">La caja abre con <strong class="oro">${fmtMoney(bs)}</strong>, que fue lo que quedó guardado en el último cierre. No se puede cambiar al abrir.</p>
           <input type="hidden" id="caja-base" value="${escapeHtml(bs)}">`}
      <button class="btn btn-gold" data-click="abrirCaja()">Abrir caja con ${bs===null?'esa base':fmtMoney(bs)}</button>
      ${(bs!==null&&puedeRetirarJefe())?`
        <div class="mt-18 pt-14 borde-arriba-1-solid-linea2">
          <p class="nota">Guardado en el cajón para mañana: <strong class="oro">${fmtMoney(bs)}</strong></p>
          <div class="botones-fila justify-centro">
            <button class="btn btn-sm" data-click="retiroCajaCerrada()">${ic('cash')} Retirar dinero</button>
            <button class="btn btn-sm btn-ghost" data-click="cambiarBaseApertura()">Corregir base</button>
          </div>
          ${ret.length?`<div class="tabla-wrap mt-12 txt-izq"><table class="tabla">
            <thead><tr><th>Retiro</th><th>Quién</th><th>Quedó</th><th>Fecha</th></tr></thead>
            <tbody>${ret.map(r=>`<tr><td class="negrita">${fmtMoney(r.monto)}</td><td>${escapeHtml(r.por||'')}</td>
              <td class="oro">${fmtMoney(r.baseDespues)}</td><td class="gris chico">${fmtDate(r.fecha)}</td></tr>`).join('')}</tbody>
          </table></div>`:''}
        </div>`:''}
    </div>`;
  }
  const ventas=ventasJornada(true);
  // Cada venta se reparte según cómo pagó el cliente (puede ser pago dividido)
  const metodos=sumaPorMetodo(ventas, v=>(v.subtotal||0));
  const totalVenta=metodos.efectivo+metodos.banco+metodos.tarjeta;
  const propinas=ventas.reduce((a,v)=>a+(v.propina||0),0);
  const domis=ventas.reduce((a,v)=>a+(v.valorDom||0),0);
  const recargos=ventas.reduce((a,v)=>a+(v.recargo||0),0);
  const movs=c.movimientos||[];
  const gastos=movs.filter(m=>m.tipo==='gasto').reduce((a,m)=>a+m.valor,0);
  const retiros=movs.filter(m=>m.tipo==='retiro').reduce((a,m)=>a+m.valor,0);
  const entradas=movs.filter(m=>m.tipo==='entrada').reduce((a,m)=>a+m.valor,0);
  const efRecibido=efectivoRecibido(ventas);                 // todo el efectivo que entró
  const terceros=sumaPorMetodo(ventas, v=>(v.propina||0)+(v.valorDom||0));
  const propEf=Math.round(sumaPorMetodo(ventas, v=>(v.propina||0)).efectivo);
  const domEf=Math.round(sumaPorMetodo(ventas, v=>(v.valorDom||0)).efectivo);
  const recEf=Math.round(sumaPorMetodo(ventas, v=>(v.recargo||0)).efectivo);
  const propBanco=Math.round(sumaPorMetodo(ventas, v=>(v.propina||0)).banco+sumaPorMetodo(ventas, v=>(v.propina||0)).tarjeta);
  const domBanco=Math.round(terceros.banco+terceros.tarjeta-propBanco);
  const enCaja=efectivoEsperado(c,ventas);
  const domBancoTotal=Math.round(sumaPorMetodo(ventas, v=>(v.valorDom||0)).banco+sumaPorMetodo(ventas, v=>(v.valorDom||0)).tarjeta);
  const esAdmin=STATE.user.rol==='admin'||STATE.user.esSupervisor;

  return `
    <div class="stats">
      <div class="stat verde"><div class="stat-ico verde">${ic('cash')}</div><div class="stat-lbl">Efectivo</div><div class="stat-val">${fmtMoney(metodos.efectivo)}</div><div class="stat-sub">recibido en la jornada</div></div>
      <div class="stat azul"><div class="stat-ico azul">${ic('cash')}</div><div class="stat-lbl">Banco</div><div class="stat-val">${fmtMoney(metodos.banco)}</div><div class="stat-sub">transferencias</div></div>
      <div class="stat gold"><div class="stat-ico gold">${ic('cash')}</div><div class="stat-lbl">Tarjeta</div><div class="stat-val">${fmtMoney(metodos.tarjeta)}</div><div class="stat-sub">datáfono</div></div>
    </div>
    ${(()=>{ const pv=ventasPorVerificar(ventas); if(!pv.length) return '';
      const tot=pv.reduce((a,v)=>a+pagosDe(v).banco,0);
      return `<div class="tarjeta alerta">
        <span class="t-tit chico">⚠️ ${pv.length} transferencia(s) sin verificar — ${fmtMoney(tot)}</span>
        <p>Estos pagos por banco todavía no se han confirmado en la cuenta. Verifícalos antes de cerrar: si no llegaron, la plata no está.</p>
        <div class="botones-fila mt-8">${pv.slice(0,8).map(v=>`<button class="btn btn-sm btn-verde" data-click="marcarVerificada('${escapeHtml(v.id)}')">${escapeHtml(v.factura||'')} · ${fmtMoney(pagosDe(v).banco)}</button>`).join('')}</div>
      </div>`; })()}
    <p class="nota m-n6-0-14">💵 VENTA (solo ${pProds()}) recibida por cada método. Total venta: <strong class="oro">${fmtMoney(totalVenta)}</strong>.${domBancoTotal>0?` Además entraron <strong>${fmtMoney(domBancoTotal)}</strong> de domicilios por banco (se le pagan al domiciliario en efectivo).`:''}</p>
    <div class="grid2">
      <div class="tarjeta">
        <span class="t-tit">${ic('cash')} Resumen de caja — ${escapeHtml(c.cajero||'')}</span>
        <div class="linea"><span>Jornada</span><strong class="oro">${fechaLocal(c.apertura)}${fechaLocal(c.apertura)!==today()?' <span class="gris chico">(sigue abierta desde ayer)</span>':''}</strong></div>
        <div class="linea"><span>Apertura</span><span class="gris chico">${fmtDate(c.apertura)}</span></div>
        <div class="linea"><span>Base inicial</span><strong>${fmtMoney(c.base||0)}</strong></div>
        <div class="linea"><span>Ventas reales (solo ${pProds()})</span><strong class="oro">${fmtMoney(totalVenta)}</strong></div>
        <div class="linea"><span>Entradas extra</span><strong class="verde">${fmtMoney(entradas)}</strong></div>
        <div class="linea"><span>Gastos / Nómina</span><strong class="rojo">−${fmtMoney(gastos)}</strong></div>
        <div class="linea"><span>Retiros autorizados</span><strong class="rojo">−${fmtMoney(retiros)}</strong></div>
        <div class="linea total-linea fs-18"><span>Efectivo en Caja</span><strong class="oro">${fmtMoney(enCaja)}</strong></div>
        <p class="nota mt-8">Efectivo del cajón: base + ${pProds()} en efectivo + entradas − gastos − retiros${(propBanco+domBanco)>0?' − propinas/domicilios por banco ('+fmtMoney(propBanco+domBanco)+', pagados en efectivo a su dueño)':''}. Solo la venta es del negocio. El banco/tarjeta no está en el cajón.</p>
        ${esAdmin?`<details class="mt-8"><summary class="cursor-mano fs-12 color-verde-c">🔍 Ver desglose del efectivo (diagnóstico)</summary>
          <div class="mt-8 fs-12">
            <div class="linea p-4-0"><span>Base inicial</span><span>${fmtMoney(c.base||0)}</span></div>
            <div class="linea p-4-0"><span>+ ${pProds(true)} en efectivo</span><span>${fmtMoney(metodos.efectivo)}</span></div>
            <div class="linea p-4-0"><span>+ Propinas/domicilios efectivo</span><span>${fmtMoney(propEf+domEf+recEf)}</span></div>
            <div class="linea p-4-0" title="Total del efectivo que entró por ventas"><span>= Efectivo recibido</span><span>${fmtMoney(efRecibido)}</span></div>
            <div class="linea p-4-0"><span>+ Entradas</span><span>${fmtMoney(entradas)}</span></div>
            <div class="linea p-4-0"><span>− Gastos</span><span>−${fmtMoney(gastos)}</span></div>
            <div class="linea p-4-0"><span>− Retiros</span><span>−${fmtMoney(retiros)}</span></div>
            <div class="linea p-4-0"><span>− Propinas/domicilios por banco</span><span>−${fmtMoney(propBanco+domBanco)}</span></div>
            <div class="linea p-4-0 fw-800"><span>= Efectivo esperado</span><span class="oro">${fmtMoney(enCaja)}</span></div>
          </div></details>`:''}
        <div class="botones-fila mt-14 mb-0">
          <button class="btn btn-sm btn-rojo" data-click="movimientoCaja('gasto')">$ Gasto</button>
          <button class="btn btn-sm" data-click="movimientoCaja('retiro')">$ Retiro</button>
          <button class="btn btn-sm btn-verde" data-click="movimientoCaja('entrada')">+ Entrada</button>
          <button class="btn btn-rojo ml-auto" data-click="cerrarCaja()">🔒 Cerrar Caja</button>
        </div>
      </div>
      ${(()=>{
        const usaPropina=(neg.usaPropina!==undefined?neg.usaPropina:neg.usaCocina);
        const usaDomi=(neg.usaDomicilios!==undefined?neg.usaDomicilios:(neg.tiposEntrega||[]).indexOf('domicilio')>-1);
        const usaDatafono=(neg.pctDatafono||0)>0 || recargos>0;
        const lineas=[];
        if(usaPropina) lineas.push(`<div class="linea"><span>👤 Propinas (del ${pPersonal()})</span><strong class="verde">${fmtMoney(propinas)}</strong></div>`);
        if(usaDomi) lineas.push(`<div class="linea"><span>🛵 Domicilios (del domiciliario)</span><strong class="azul">${fmtMoney(domis)}</strong></div>`);
        if(usaDatafono) lineas.push(`<div class="linea"><span>💳 Recargos datáfono</span><strong class="oro">${fmtMoney(recargos)}</strong></div>`);
        if(!lineas.length) return '';
        return `<div class="tarjeta">
        <span class="t-tit">${ic('users')} No son ingreso del negocio</span>
        <p class="gris mb-10">Estos valores se cobran pero pertenecen a terceros. No suman a las ventas reales.</p>
        ${lineas.join('')}
      </div>`;
      })()}
    </div>
    ${movs.length?`<div class="tarjeta">
      <span class="t-tit">${ic('report')} Movimientos del día</span>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Tipo</th><th>Concepto</th><th>Quién</th><th>Valor</th></tr></thead>
        <tbody>${movs.map(m=>`<tr>
          <td>${m.tipo==='gasto'?'<span class="pill pill-rojo">Gasto</span>':m.tipo==='retiro'?'<span class="pill pill-gold">Retiro</span>':'<span class="pill pill-verde">Entrada</span>'}</td>
          <td>${escapeHtml(m.concepto||'')}</td>
          <td class="gris">${escapeHtml(m.por||'')}</td>
          <td class="negrita ${m.tipo==='entrada'?'verde':'rojo'}">${m.tipo==='entrada'?'+':'−'}${fmtMoney(m.valor)}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`:''}`;
}

export function abrirCaja(){
  if(!exigirEscritura()) return;   // D10: solo lectura
  if(!tienePermiso('abrircaja')){ toast(MSJ.noTienesPermisoParaAbrirLa,'error'); return; }
  const abierta=cajaActual();
  if(abierta){ toast('Ya hay una caja abierta por '+(abierta.cajero||'otro usuario'),'info'); render(); return; }
  const bs=baseSiguiente();
  // Si ya hubo un cierre, la base es OBLIGATORIA: la que quedó guardada
  const base = bs!==null ? bs : (parseFloat((document.getElementById('caja-base')||{}).value)||0);
  if(!Dominio.pagos.montoValido(base)){ toast(MSJ.losMontosNoPuedenSerNegativos,'error'); return; }   // V3: abrir debiendo
  if(_guardando) return;
  fijarGuardando(true);
  const nueva={id:uid(), base, apertura:now(), cajero:STATE.user.nombre, movimientos:[]};
  // Transacción: solo se abre si en la NUBE sigue sin caja (antes dos equipos
  // podían abrir a la vez y el último pisaba al primero)
  const suc=sucursalActual();
  transaccionUnica('caja_actual', cur=>{ if(cajaDe(cur,suc)) return; return Dominio.caja.conCaja(cur, suc, nueva); })
    .then(r=>{
      if(!r.committed){
        const ab=cajaDe(r.valor,suc);
        toast('Ya hay una caja abierta por '+((ab&&ab.cajero)||'otro usuario'),'info'); render(); return;
      }
      logAudit('Abrió caja','Base: '+fmtMoney(base));
      toast('Caja abierta con '+fmtMoney(base),'success');
      render();
    })
    .catch(e=>{ reportarError('abrir la caja', e); toast(MSJ.noSePudoAbrirLaCaja,'error'); })
    .then(()=>{ fijarGuardando(false); });
}
// D7: agrega un movimiento (gasto, retiro, entrada) a la caja abierta de esta sede con una
// transacción sobre el valor REAL del servidor. true = quedó guardado.
export function agregarMovimientoCaja(mov){
  const suc=sucursalActual();
  return transaccionUnica('caja_actual', cur=>{
    if(cur===null) return null;                 // sin copia local: Firebase reintenta con el valor real
    const c=cajaDe(cur,suc); if(!c) return;     // ya no hay caja abierta: no se toca
    return Dominio.caja.conCaja(cur, suc, Object.assign({}, c, {movimientos:[mov].concat(c.movimientos||[])}));
  }).then(r=>{ const c=cajaDe(r.valor,suc); return !!(r.committed && c && (c.movimientos||[]).some(m=>m.id===mov.id)); });
}
export function movimientoCaja(tipo){
  if(!exigirEscritura()) return;   // D10: solo lectura
  if(!(tienePermiso('abrircaja')||puedeRetirarJefe())){ toast(MSJ.noTienesPermisoParaRegistrarMovimientos,'error'); return; }
  const titulos={gasto:'Registrar gasto de caja',retiro:'Registrar retiro',entrada:'Registrar entrada'};
  abrirModal({titulo:titulos[tipo], textoBoton:BOTON.registrar, campos:[
    {id:'concepto', label:'Concepto', requerido:true},
    {id:'valor', label:'Valor', tipo:'number', requerido:true}
  ], onGuardar:(d)=>{
    const c=cajaActual();
    if(!c){ toast(MSJ.noHayCajaAbierta,'error'); return; }
    const valor=parseFloat(d.valor)||0;
    if(valor<=0){ toast(MSJ.valorInvalido,'error'); return; }
    // D7: en una transacción sobre la caja del servidor (dos equipos a la vez ya no se pisan)
    const mov={id:uid(), tipo, concepto:d.concepto, valor, por:STATE.user.nombre, fecha:now()};
    const jornada=jornadaActual();
    agregarMovimientoCaja(mov)
      .then(ok=>{
        if(!ok){ toast(MSJ.noSeRegistroLaCajaYa,'error'); render(); return; }
        // Un GASTO de caja es un egreso del negocio: queda en Gastos del Negocio
        // y por tanto en el Reporte Contable (restando de ingresos). Solo si el
        // movimiento entró; movId los cruza para no contar el mismo dos veces.
        if(tipo==='gasto'){
          const g=misDatos('gastos_negocio');
          // fecha = día de la jornada (no la hora UTC, que de noche caía en el día o mes siguiente)
          g.unshift({id:uid(), movId:mov.id, concepto:d.concepto, valor, categoria:'Caja', origen:'caja',
            por:STATE.user.nombre, fecha:jornada, creado:mov.fecha, cajaId:c.id});
          guardarMisDatos('gastos_negocio',g);
        }
        render();
      })
      .catch(e=>reportarError('el movimiento de caja', e));
    logAudit(tipo==='gasto'?'Gasto de caja':tipo==='retiro'?'Retiro de caja':'Entrada a caja',
      d.concepto+' · '+fmtMoney(valor));
    cerrarModal(); toast(MSJ.registrado,'success'); render();
  }});
}
export function cerrarCaja(){
  if(!exigirEscritura()) return;   // D10: solo lectura
  if(!tienePermiso('abrircaja')){ toast(MSJ.noTienesPermisoParaCerrarLa,'error'); return; }
  // No dejar cerrar con cobros a medio ajustar: eso es lo que descuadra la caja
  const sinAjustar=ventasJornada(true).filter(v=>v.pagoDescuadrado);
  if(sinAjustar.length){
    abrirModal({titulo:'Hay cobros sin ajustar', textoBoton:BOTON.entendido, campos:[],
      extraHTML:`<p class="nota">Estos ${pPedidos()} se editaron después de cobrados y su pago no cuadra con el total. Ajústalos antes de cerrar la caja:</p>
        <div class="botones-fila mt-10">${sinAjustar.map(v=>`<button class="btn btn-sm btn-naranja" data-click="ajustarPagoDesdeModal('${escapeHtml(v.id)}')">${escapeHtml(v.factura||'')} · ${fmtMoney(v.total)}</button>`).join('')}</div>`,
      onGuardar:()=>cerrarModal()});
    return;
  }
  const c=cajaActual();
  if(!c) return;
  const ventas=ventasJornada(true);
  const porVerificar=ventasPorVerificar(ventas);
  const efVenta=Math.round(sumaPorMetodo(ventas, v=>(v.subtotal||0)).efectivo);
  const movs=c.movimientos||[];
  const gastos=movs.filter(m=>m.tipo==='gasto').reduce((a,m)=>a+m.valor,0);
  const retiros=movs.filter(m=>m.tipo==='retiro').reduce((a,m)=>a+m.valor,0);
  const entradas=movs.filter(m=>m.tipo==='entrada').reduce((a,m)=>a+m.valor,0);
  const propEf=Math.round(sumaPorMetodo(ventas, v=>(v.propina||0)).efectivo);
  const domEf=Math.round(sumaPorMetodo(ventas, v=>(v.valorDom||0)).efectivo);
  const recEf=Math.round(sumaPorMetodo(ventas, v=>(v.recargo||0)).efectivo);
  const esperado=efectivoEsperado(c,ventas);
  const sugerida = baseFija()!==null ? baseFija() : (c.base||0);
  // F19: lo que no se cobró no se pierde: sigue en Pedidos y se cobra en el turno siguiente
  const pendientes=ventasJornada(false).filter(v=>v.estado==='abierta');
  abrirModal({titulo:'Cerrar caja', textoBoton:BOTON.cerrarCaja, campos:[
    {id:'contado', label:'Cuenta el efectivo del cajón. Esperado: '+fmtMoney(esperado), tipo:'number', valor:String(esperado), requerido:true},
    {id:'base', label:'¿Cuánto dejas en el cajón para mañana?', tipo:'number', valor:String(sugerida), requerido:true}
  ], extraHTML:`${pendientes.length?`<div class="alerta radio-10 p-11-14 mb-10">
      <strong class="oro">⏳ ${pendientes.length} ${pendientes.length===1?pPedido():pPedidos()} sin cobrar (${fmtMoney(pendientes.reduce((a,v)=>a+(v.total||0),0))})</strong>
      <p class="nota mt-4">No entran en este cierre. Siguen en ${escapeHtml(pPedidos(true))} para cobrarlos (o anularlos) en el turno siguiente.</p></div>`:''}${porVerificar.length?`<div class="alerta radio-10 p-11-14 mb-10">
      <strong class="rojo">⚠️ ${porVerificar.length} transferencia(s) sin verificar (${fmtMoney(porVerificar.reduce((a,v)=>a+pagosDe(v).banco,0))})</strong>
      <p class="nota mt-4">Ese dinero se está contando como recibido. Si no llegó a la cuenta, revísalo antes de cerrar.</p></div>`:''}
    <div class="cobro-caja">
      <div class="c-row"><span>Contado en el cajón</span><strong id="cc-contado">${fmtMoney(esperado)}</strong></div>
      <div class="c-row"><span>Queda de base para mañana</span><strong class="oro" id="cc-base">${fmtMoney(sugerida)}</strong></div>
      <div class="c-row c-total"><span>SE LLEVA EL JEFE</span><strong id="cc-retiro">${fmtMoney(Math.max(0,esperado-sugerida))}</strong></div>
      <p class="nota mt-8" id="cc-aviso">Lo que sobre de la base se retira y se guarda. Mañana la caja abre sola con la base que dejes aquí.</p>
    </div>`,
    onAbrir:()=>{
      const calc=()=>{
        const co=parseFloat((document.getElementById('m-contado')||{}).value)||0;
        const ba=parseFloat((document.getElementById('m-base')||{}).value)||0;
        const set=(id,v)=>{ const e=document.getElementById(id); if(e) e.innerHTML=v; };
        set('cc-contado',fmtMoney(co));
        set('cc-base',fmtMoney(ba));
        set('cc-retiro', ba>co?'<span class="rojo">La base no puede ser mayor a lo contado</span>':fmtMoney(co-ba));
        const av=document.getElementById('cc-aviso');
        if(av) av.innerHTML = ba>co
          ? '⚠️ Estás dejando más de lo que hay en el cajón.'
          : (co-ba)===0 ? 'No se retira nada: queda todo el efectivo en el cajón.'
          : 'El jefe se lleva <strong>'+fmtMoney(co-ba)+'</strong> y mañana la caja abre con <strong>'+fmtMoney(ba)+'</strong>.';
      };
      ['m-contado','m-base'].forEach(id=>{ const e=document.getElementById(id); if(e) e.addEventListener('input',calc); });
      calc();
    },
  onGuardar:(d)=>{
    const contado=parseFloat(d.contado)||0;
    const baseManana=parseFloat(d.base)||0;
    if(!Dominio.pagos.montoValido(contado) || !Dominio.pagos.montoValido(baseManana)){ toast(MSJ.losMontosNoPuedenSerNegativos,'error'); return; }   // V3
    if(baseManana>contado){ toast(MSJ.laBaseParaMananaNoPuede,'error'); return; }
    if(_guardando) return;
    fijarGuardando(true);
    // Transacción: se cierra SOLO si en la nube sigue abierta esta misma caja.
    // Así dos equipos no generan dos cierres de la misma jornada. Se usa la
    // caja tal como está en el servidor (con los movimientos de todos).
    let enServidor=null;
    const suc=sucursalActual();
    transaccionUnica('caja_actual', cur=>{
      const ab=cajaDe(cur,suc);
      if(!ab || ab.id!==c.id) return;     // ya la cerró otro equipo: no tocar
      enServidor=ab;
      return Dominio.caja.conCaja(cur, suc, null);   // sin caja en ESTA sede (las otras siguen)
    }).then(r=>{
      if(!r.committed){ cerrarModal(); toast(MSJ.estaCajaYaFueCerradaDesde,'error'); render(); return; }
      terminarCierre(enServidor||c, ventas, contado, baseManana, d.motivo);
    }).catch(e=>{ reportarError('cerrar la caja', e); toast(MSJ.noSePudoCerrarLaCaja,'error'); })
      .then(()=>{ fijarGuardando(false); });
  }});
}
// Registra el cierre ya confirmado (la caja ya quedó vacía en la nube)
export function terminarCierre(c, ventas, contado, baseManana, motivo){
    const movs=c.movimientos||[];
    const gastos=movs.filter(m=>m.tipo==='gasto').reduce((a,m)=>a+m.valor,0);
    const retiros=movs.filter(m=>m.tipo==='retiro').reduce((a,m)=>a+m.valor,0);
    const entradas=movs.filter(m=>m.tipo==='entrada').reduce((a,m)=>a+m.valor,0);
    const efVenta=Math.round(sumaPorMetodo(ventas, v=>(v.subtotal||0)).efectivo);
    const propEf=Math.round(sumaPorMetodo(ventas, v=>(v.propina||0)).efectivo);
    const domEf=Math.round(sumaPorMetodo(ventas, v=>(v.valorDom||0)).efectivo);
    const esperado=efectivoEsperado(c,ventas);
    const retiroJefe=contado-baseManana;
    const dif=contado-esperado;
    const cierre=Object.assign({}, c, {id:uid(), cierre:now(), jornada:fechaLocal(c.apertura), cerradaPor:STATE.user.nombre,
      sucursalId:sucursalActual(),
      totalVentas:ventas.reduce((a,v)=>a+(v.subtotal||0),0),
      efVenta, gastos, retiros, entradas, propEf, domEf,
      esperado, contado, diferencia:dif, motivoDescuadre:(motivo||''),
      baseManana, retiroJefe, retiroPor:STATE.user.nombre});
    const cierres=misDatos('cierres');
    cierres.unshift(cierre);
    guardarMisDatos('cierres',cierres);
    logAudit('Cerró caja', 'Esperado '+fmtMoney(esperado)+' · Contado '+fmtMoney(contado)+
      (dif===0?' · Cuadró':dif>0?' · Sobró '+fmtMoney(dif):' · Faltó '+fmtMoney(Math.abs(dif)))+
      ' · Deja base '+fmtMoney(baseManana)+(retiroJefe>0?' · Retira '+fmtMoney(retiroJefe):''));
    // La base de mañana es EXACTAMENTE lo que se deja en el cajón hoy
    const cfg=cfgCaja(); ponerBaseSiguiente(cfg, baseManana); guardarCfgCaja(cfg);
    if(retiroJefe>0) logAudit('Retiro del cierre', fmtMoney(retiroJefe)+' se los lleva '+STATE.user.nombre);
    cerrarModal();
    // Imprimir el cuadre de caja (tirilla 80mm), como Portal Imperial
    imprimirCierre(cierre);
    // Si hubo descuadre, mostramos el reporte para revisar en pantalla
    if(dif!==0){ setTimeout(()=>reporteDescuadre(cierre),300); }
    toast(dif===0?'Caja cerrada, cuadró exacto':dif>0?'Caja cerrada, sobró '+fmtMoney(dif):'Caja cerrada, faltó '+fmtMoney(Math.abs(dif)),
      dif===0?'success':'error');
    if(retiroJefe>0) setTimeout(()=>toast('Retirados '+fmtMoney(retiroJefe)+'. Mañana la caja abre con '+fmtMoney(baseManana),'info'),600);
    render();
}
// Imprime el cuadre de caja en tirilla POS 80mm
export function imprimirCierre(c){
  const neg=STATE.negocio||{};
  const dif=c.diferencia||0;
  const html=`<div style="font-family:Arial,sans-serif;color:#000;width:72mm;padding:4mm;margin:0 auto;font-weight:600;">
    <div style="text-align:center;">
      ${logoNegocio(neg,'style="max-height:90px;max-width:200px;margin-bottom:4px;"')||''}
      <div style="font-size:20px;font-weight:800;">${escapeHtml(neg.nombre||'')}</div>
    </div>
    <div style="text-align:center;font-size:17px;font-weight:800;border-top:2px solid #000;border-bottom:2px solid #000;padding:6px 0;margin:8px 0;">CIERRE DE CAJA</div>
    <div style="font-size:13px;line-height:1.7;">
      <div style="display:flex;justify-content:space-between;"><span>Jornada:</span><span><strong>${jornadaCierre(c)}</strong></span></div>
      <div style="display:flex;justify-content:space-between;"><span>Cajero:</span><span>${escapeHtml(c.cerradaPor||c.cajero||'')}</span></div>
      <div style="display:flex;justify-content:space-between;"><span>Apertura:</span><span>${fmtDate(c.apertura)}</span></div>
      <div style="display:flex;justify-content:space-between;"><span>Cierre:</span><span>${fmtDate(c.cierre)}</span></div>
    </div>
    <div style="border-top:2px solid #000;margin:8px 0;padding-top:8px;font-size:14px;line-height:1.9;">
      <div style="display:flex;justify-content:space-between;"><span>Base inicial</span><span>${fmtMoney(c.base||0)}</span></div>
      <div style="display:flex;justify-content:space-between;"><span>Ventas efectivo</span><span>${fmtMoney(c.efVenta||0)}</span></div>
      <div style="display:flex;justify-content:space-between;"><span>Entradas</span><span>+${fmtMoney(c.entradas||0)}</span></div>
      <div style="display:flex;justify-content:space-between;"><span>Gastos</span><span>-${fmtMoney(c.gastos||0)}</span></div>
      <div style="display:flex;justify-content:space-between;"><span>Retiros</span><span>-${fmtMoney(c.retiros||0)}</span></div>
    </div>
    <div style="border-top:1px dashed #000;margin:8px 0;padding-top:8px;font-size:12px;line-height:1.7;">
      <div style="display:flex;justify-content:space-between;"><span>Propinas (no ingreso)</span><span>${fmtMoney(c.propEf||0)}</span></div>
      <div style="display:flex;justify-content:space-between;"><span>Domicilios (no ingreso)</span><span>${fmtMoney(c.domEf||0)}</span></div>
    </div>
    <div style="border-top:2px solid #000;margin:8px 0;padding-top:8px;font-size:15px;line-height:2;font-weight:800;">
      <div style="display:flex;justify-content:space-between;"><span>Total ventas</span><span>${fmtMoney(c.totalVentas||0)}</span></div>
      <div style="display:flex;justify-content:space-between;"><span>Efectivo esperado</span><span>${fmtMoney(c.esperado||0)}</span></div>
      <div style="display:flex;justify-content:space-between;"><span>Efectivo contado</span><span>${fmtMoney(c.contado||0)}</span></div>
    </div>
    <div style="border:3px solid #000;border-radius:6px;margin-top:8px;padding:10px;text-align:center;font-size:18px;font-weight:800;">
      ${dif===0?'CAJA CUADRADA':dif>0?'SOBRA '+fmtMoney(dif):'FALTA '+fmtMoney(Math.abs(dif))}
    </div>
    ${c.baseManana!==undefined?`<div style="border-top:2px solid #000;margin-top:10px;padding-top:8px;font-size:15px;line-height:1.9;font-weight:800;">
      <div style="display:flex;justify-content:space-between;"><span>Queda de base</span><span>${fmtMoney(c.baseManana||0)}</span></div>
      <div style="display:flex;justify-content:space-between;"><span>Retirado</span><span>${fmtMoney(c.retiroJefe||0)}</span></div>
      ${c.retiroJefe>0?`<div style="font-size:12px;font-weight:600;">Recibe: ${escapeHtml(c.retiroPor||'')}</div>
      <div style="text-align:center;font-size:13px;margin-top:16px;">Firma de quien recibe: ___________</div>`:''}
    </div>`:''}
    ${c.motivoDescuadre?`<div style="font-size:12px;margin-top:8px;">Obs: ${escapeHtml(c.motivoDescuadre)}</div>`:''}
    <div style="text-align:center;font-size:13px;margin-top:18px;">Firma: _______________</div>
    <div style="text-align:center;font-size:9px;margin-top:12px;border-top:1px dashed #000;padding-top:6px;">Software por WALLACE COMPANY SYSTEM</div>
  </div>`;
  const w=window.open('','_blank','width=400,height=680');
  if(!w){ toast(MSJ.permiteLasVentanasEmergentesParaImprimir,'error'); return; }
  w.document.write('<html><head><title>Cierre '+fmtDate(c.cierre)+'</title><meta charset="utf-8"><style>@page{size:80mm auto;margin:0;}body{margin:0;padding:4mm 3mm;width:80mm;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#fff;}</style></head><body>'+html+'</body></html>');
  w.document.close();
  setTimeout(()=>w.print(),400);
}
// Reporte de descuadre (cuando la caja no cuadra al cerrar)
export function reporteDescuadre(c){
  const dif=c.diferencia||0;
  const cuerpo=`
    <div class="${dif<0?'alerta':'tarjeta-pend'} radio-10 p-14-16">
      <div class="${dif<0?'rojo':'oro'} fs-17 fw-800">
        ${dif<0?'⚠️ FALTÓ '+fmtMoney(Math.abs(dif)):'💰 SOBRÓ '+fmtMoney(dif)}
      </div>
      <p class="nota mt-6">Cerró: ${escapeHtml(c.cerradaPor||'')} · ${fmtDate(c.cierre)}</p>
    </div>
    <div class="cobro-caja mt-12">
      <div class="c-row"><span>Base de apertura</span><span>${fmtMoney(c.base||0)}</span></div>
      <div class="c-row"><span>Ventas en efectivo</span><span>${fmtMoney(c.efVenta||0)}</span></div>
      <div class="c-row"><span>Entradas</span><span>+${fmtMoney(c.entradas||0)}</span></div>
      <div class="c-row"><span>Gastos</span><span class="rojo">−${fmtMoney(c.gastos||0)}</span></div>
      <div class="c-row"><span>Retiros</span><span class="rojo">−${fmtMoney(c.retiros||0)}</span></div>
      <div class="c-row c-total"><span>Esperado en cajón</span><strong>${fmtMoney(c.esperado||0)}</strong></div>
      <div class="c-row"><span>Contado real</span><span class="negrita">${fmtMoney(c.contado||0)}</span></div>
      <div class="c-row c-total"><span>Diferencia</span><strong class="${dif<0?'rojo':'oro'}">${dif<0?'−':'+'}${fmtMoney(Math.abs(dif))}</strong></div>
    </div>`;
  abrirModal({titulo:'📋 Reporte de descuadre', textoBoton:BOTON.entendido, campos:[
    {id:'motivo', label:'¿Sabes por qué el descuadre? (opcional, queda registrado)', valor:c.motivoDescuadre||''}
  ], extraHTML:cuerpo, onGuardar:(d)=>{
    if(d.motivo){
      const cierres=misDatos('cierres'); const x=cierres.find(y=>y.id===c.id);
      if(x){ x.motivoDescuadre=d.motivo; guardarMisDatos('cierres',cierres); }
      logAudit('Motivo de descuadre', d.motivo);
    }
    cerrarModal();
  }});
}
// ============================================================
//  BASE PARA EL DÍA SIGUIENTE
//  Al cerrar, el jefe deja en el cajón la base de siempre y se lleva el resto.
//  Al otro día la caja abre EXACTAMENTE con lo que quedó, no con lo que
//  alguien escriba. Así nadie puede "inventar" la base de apertura.
// ============================================================
export function cfgCaja(){
  const c=DB.get(claveDe(STATE.negocio.id,'config'));
  return (c && !Array.isArray(c)) ? c : (Array.isArray(c)&&c[0]) ? c[0] : {};
}
export function guardarCfgCaja(obj){ DB.set(claveDe(STATE.negocio.id,'config'), obj); }
// La base guardada es por sede (F1): la principal en baseSiguiente (como siempre), las demás en basesSucursal
export function baseSiguiente(){
  const c=cfgCaja(), suc=sucursalActual();
  const b = suc==='principal' ? c.baseSiguiente : (c.basesSucursal||{})[suc];
  return (b===undefined||b===null)?null:(parseFloat(b)||0);
}
export function ponerBaseSiguiente(cfg, valor){
  const suc=sucursalActual();
  if(suc==='principal') cfg.baseSiguiente=valor;
  else { cfg.basesSucursal=cfg.basesSucursal||{}; cfg.basesSucursal[suc]=valor; }
  return cfg;
}
// Base fija que el negocio quiere dejar todos los días (se configura en Mi Negocio)
export function baseFija(){
  const n=STATE.negocio;
  return (n && n.baseFija!=null && n.baseFija!=='') ? (parseFloat(n.baseFija)||0) : null;
}
export function puedeRetirarJefe(){
  const u=STATE.user;
  return !!(u && (u.rol==='admin' || u.rol==='dueno' || u.esSupervisor));
}
// El jefe saca dinero cuando la caja YA está cerrada: baja la base de mañana
export function retiroCajaCerrada(){
  if(!puedeRetirarJefe()){ toast(MSJ.soloElAdministradorOElDuenoPuedenRetirar,'error'); return; }
  const base=baseSiguiente();
  if(base===null){ toast(MSJ.todaviaNoHayUnaBaseGuardada,'error'); return; }
  abrirModal({titulo:'Retirar dinero de la caja cerrada', textoBoton:BOTON.retirar, campos:[
    {id:'monto', label:'¿Cuánto va a retirar?', tipo:'number', requerido:true},
    {id:'motivo', label:'Motivo (opcional)', valor:'Retiro del dueño'}
  ], extraHTML:`<div class="cobro-caja">
      <div class="c-row"><span>Guardado para mañana</span><strong class="oro">${fmtMoney(base)}</strong></div>
      <p class="nota mt-8">Lo que retire se descuenta de la base con la que abrirá mañana. Queda registrado a su nombre.</p>
    </div>`,
  onGuardar:(d)=>{
    const monto=parseFloat(d.monto)||0;
    if(monto<=0){ toast(MSJ.montoInvalido,'error'); return; }
    if(monto>base){ toast('No puede retirar más de '+fmtMoney(base),'error'); return; }
    const nueva=base-monto;
    const cfg=cfgCaja();
    ponerBaseSiguiente(cfg, nueva);
    cfg.retirosCerrada=(cfg.retirosCerrada||[]).slice(0,30);
    cfg.retirosCerrada.unshift({monto, por:STATE.user.nombre, motivo:d.motivo||'', fecha:now(), baseAntes:base, baseDespues:nueva, sucursalId:sucursalActual()});
    guardarCfgCaja(cfg);
    logAudit('Retiro con caja cerrada', fmtMoney(monto)+' · base '+fmtMoney(base)+' → '+fmtMoney(nueva));
    cerrarModal();
    toast('Retirados '+fmtMoney(monto)+'. Mañana la caja abre con '+fmtMoney(nueva),'success');
    render();
  }});
}
// Solo el admin/dueño puede cambiar a mano la base de apertura (queda registrado)
export function cambiarBaseApertura(){
  if(!puedeRetirarJefe()){ toast(MSJ.soloElAdministradorOElDuenoPuedenCambiar,'error'); return; }
  const base=baseSiguiente();
  abrirModal({titulo:'Corregir la base de apertura', textoBoton:BOTON.guardar, campos:[
    {id:'base', label:'Base con la que abrirá la caja', tipo:'number', valor:String(base||0), requerido:true},
    {id:'motivo', label:'¿Por qué se corrige?', requerido:true}
  ], extraHTML:`<p class="nota">Úsalo solo si el dinero del cajón no coincide con lo que quedó al cerrar. Queda en la auditoría.</p>`,
  onGuardar:(d)=>{
    const nueva=parseFloat(d.base)||0;
    if(!Dominio.pagos.montoValido(nueva)){ toast(MSJ.losMontosNoPuedenSerNegativos,'error'); return; }   // V3: una base negativa abriría la caja debiendo
    const cfg=cfgCaja(); ponerBaseSiguiente(cfg, nueva); guardarCfgCaja(cfg);
    logAudit('Corrigió la base de apertura', fmtMoney(base||0)+' → '+fmtMoney(nueva)+' · '+(d.motivo||''));
    cerrarModal(); toast(MSJ.baseCorregida,'success'); render();
  }});
}
