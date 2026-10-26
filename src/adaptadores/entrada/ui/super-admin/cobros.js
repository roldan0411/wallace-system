// ============================================================
//  INTERFAZ · Cobro mensual a los clientes (P6)
//  Tarjeta "Cobros del mes" del panel, estado de pago de cada cliente,
//  registrar y anular pagos, y la sección "Cobros" de la ficha del negocio.
//  Reglas puras en dominio/cobros.js; los pagos van en data/pagos (los ven y
//  registran solo el dueño y el ayudante). La suspensión sigue siendo manual.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/01-super-admin-panel/01-super-admin-panel.md
// ============================================================
import { STATE, escapeHtml, fmtMoney, now, refrescarSiSePuede } from '../nucleo/estado.js';
import { BOTON, MSJ } from '../nucleo/textos.js';
import { esAdminSistema } from '../nucleo/permisos.js';
import { abrirModal, cerrarModal, confirmarModal, reportarError, toast } from '../nucleo/componentes.js';
import { render } from '../nucleo/navegacion.js';
import { anotarEnSistema } from './historial-sistema.js';
import { cabeceraFicha } from './ficha-negocio.js';

const mesLegible=m=>new Date(m+'-01T00:00:00').toLocaleDateString('es-CO', {month:'long', year:'numeric'});
const diaLegible=f=>new Date(f+'T00:00:00').toLocaleDateString('es-CO', {day:'numeric', month:'short'});
export function estadoCobro(neg){ return Dominio.cobros.estadoPago(neg, today()); }

// Pastilla con el estado de pago (vacía en demos, pruebas y negocios sin precio)
export function pillPago(neg){
  const e=estadoCobro(neg);
  if(e.estado==='al_dia') return `<span class="pill pill-verde chico">Al día</span>`;
  if(e.estado==='por_pagar') return `<span class="pill pill-oro chico">Por pagar · ${escapeHtml(today()>e.vence?'venció el '+diaLegible(e.vence):'vence hoy')}</span>`;
  if(e.estado==='en_mora') return `<span class="pill pill-rojo chico">En mora · ${escapeHtml(e.diasMora)} días</span>`;
  if(e.estado==='sin_iniciar') return `<span class="pill pill-azul chico">Sin pagos registrados</span>`;
  return '';
}
// Clientes activos (no demos ni pruebas) que deben o que aún no tienen control de pagos
function porCobrar(){
  const orden={en_mora:0, por_pagar:1, sin_iniciar:2};
  return (DB.get('negocios')||[])
    .filter(n=>n.activo && Dominio.negocio.grupoPanel(n)==='clientes')
    .map(n=>({n, e:estadoCobro(n)}))
    .filter(x=>x.e.estado in orden)
    .sort((a,b)=>orden[a.e.estado]-orden[b.e.estado] || (b.e.diasMora||0)-(a.e.diasMora||0));
}
// U6: para ordenar "los que más deben primero"
export function gravedadCobro(n){
  const e=estadoCobro(n);
  return e.estado==='en_mora' ? 1000+(e.diasMora||0) : ({por_pagar:500, sin_iniciar:100, al_dia:10}[e.estado]||0);
}
// Cifra "Por atender" del panel: todo lo que aparece en "Cobros del mes" (mora, por pagar y sin pagos registrados)
export function cuantosPorCobrar(){ return esAdminSistema() ? porCobrar().length : 0; }

export function tarjetaCobros(){
  if(!esAdminSistema()) return '';
  const lista=porCobrar();
  if(!lista.length) return '';
  const mora=lista.filter(x=>x.e.estado==='en_mora').length;
  return `<div class="tarjeta ${mora?'alerta':''}">
    <span class="t-tit">💰 Cobros del mes (${lista.length})</span>
    <p class="gris">Clientes que deben o que todavía no tienen pagos registrados. Registra el pago al recibirlo; suspender lo decides tú.</p>
    <div class="tabla-wrap"><table class="tabla tabla-cards">
      <thead><tr><th>Negocio</th><th>Estado</th><th>Debe</th><th>Acciones</th></tr></thead>
      <tbody>${lista.map(({n, e})=>`<tr>
        <td data-label="Negocio"><button class="link-negocio" data-click="cobrosNegocio('${escapeHtml(n.id)}')">${escapeHtml(n.nombre)}</button></td>
        <td data-label="Estado">${pillPago(n)}${e.mes?`<br><span class="gris chico">${escapeHtml(mesLegible(e.mes))}</span>`:''}</td>
        <td data-label="Debe">${e.pendientes>1?escapeHtml(e.pendientes)+' meses · ':''}${fmtMoney((n.precioMes||0)*(e.pendientes||1))}</td>
        <td data-label="Acciones"><div class="acciones">
          <button class="btn btn-sm btn-gold" data-click="registrarPago('${escapeHtml(n.id)}')">Registrar pago</button>
          ${e.estado==='en_mora'?`<button class="btn btn-sm btn-naranja" data-click="toggleNegocio('${escapeHtml(n.id)}')">Suspender</button>`:''}
        </div></td>
      </tr>`).join('')}</tbody>
    </table></div>
  </div>`;
}

// ---------- Registrar y anular ----------
// Recalcula y guarda en el negocio hasta qué mes pagó (sin huecos) e inicia el cobro si no lo tenía
function aplicarPagosAlNegocio(negId, pagos, mesNuevo, fecha){
  const negocios=DB.get('negocios')||[];
  const n=negocios.find(x=>x.id===negId); if(!n) return null;
  const antes={cobroDesde:n.cobroDesde||null, pagadoHasta:n.pagadoHasta||null, diaPago:n.diaPago||null};
  if(!Dominio.cobros.mesValido(n.cobroDesde) && mesNuevo) n.cobroDesde=mesNuevo;   // negocios de antes: empieza con el primer pago
  if(!n.diaPago && fecha) n.diaPago=Dominio.cobros.diaPagoPorDefecto(fecha);
  n.pagadoHasta=Dominio.cobros.pagadoHasta(pagos, n.cobroDesde);
  if(n.pagadoHasta===null) delete n.pagadoHasta;
  DB.set('negocios', negocios);
  return {n, antes, despues:{cobroDesde:n.cobroDesde||null, pagadoHasta:n.pagadoHasta||null, diaPago:n.diaPago||null}};
}
export function registrarPago(negId){
  if(!esAdminSistema()){ toast(MSJ.soloElDuenoOElAyudanteRegistranPagos,'error'); return; }
  const neg=(DB.get('negocios')||[]).find(n=>n.id===negId); if(!neg) return;
  const hoy=today(), sugerido=Dominio.cobros.mesPorPagar(neg, hoy);
  let m=sugerido; for(let i=0;i<12;i++) m=Dominio.cobros.mesAnterior(m);
  const meses=[]; for(let i=0;i<19;i++){ meses.push(m); m=Dominio.cobros.mesSiguiente(m); }
  abrirModal({titulo:'Registrar pago de '+neg.nombre, textoBoton:BOTON.registrar, campos:[
    {id:'mes', label:'Mes que paga', tipo:'select', valor:sugerido, opciones:meses.map(x=>({valor:x, label:mesLegible(x)}))},
    {id:'valor', label:'Valor', tipo:'number', valor:String(neg.precioMes||''), requerido:true},
    {id:'medio', label:'Medio de pago', tipo:'select', opciones:Dominio.cobros.MEDIOS_PAGO.map(x=>({valor:x, label:x}))},
    {id:'fecha', label:'Fecha en que pagó', tipo:'date', valor:hoy, requerido:true},
    {id:'nota', label:'Nota (opcional)', placeholder:'Ej: comprobante 1234'}
  ], extraHTML:`<p class="nota">Un pago por mes. Si pagó varios meses, regístralos uno por uno.${Dominio.cobros.mesValido(neg.cobroDesde)?'':' Este cliente todavía no tiene control de pagos: empieza desde el mes que registres.'}</p>`,
  onGuardar:(d)=>{
    const yo=STATE._superUser||STATE.user;
    const pago=Dominio.cobros.nuevoPago({id:uid(), negocioId:negId, mes:d.mes, valor:d.valor, medio:d.medio, fecha:d.fecha, nota:d.nota,
      quien:yo, registrado:now()});
    if(Dominio.cobros.problemaDelPago(pago)){ toast(MSJ.revisaElPago,'error'); return; }
    guardarPagoYActualizar(pago, '').then(ok=>{ if(ok){ cerrarModal(); toast('Pago registrado: '+mesLegible(pago.mes),'success'); render(); } });
  }});
}
// Guarda el pago, recalcula "pagado hasta" del negocio y lo anota en el historial. Promesa: true si quedó.
function guardarPagoYActualizar(pago, detalleExtra){
  const negId=pago.negocioId;
  return Datos.guardarPago(pago).then(ok=>{
    if(!ok){ toast(MSJ.noSeGuardoElPago,'error'); return false; }
    return Datos.leerPagos(negId).then(pagos=>{
      const r=aplicarPagosAlNegocio(negId, pagos, pago.mes, pago.fecha);
      if(r) anotarEnSistema(Dominio.sistema.ACCION.registrarPago, r.n, r.antes, r.despues, mesLegible(pago.mes)+' · '+fmtMoney(pago.valor)+' · '+pago.medio+(detalleExtra?' · '+detalleExtra:''));
      if(_cobrosFicha.negId===negId) _cobrosFicha={negId, lista:pagos};
      return true;
    });
  }).catch(e=>{ reportarError('registrar el pago', e); toast(MSJ.noSeGuardoElPago,'error'); return false; });
}
export function anularPago(negId, pagoId){
  if(!esAdminSistema()){ toast(MSJ.soloElDuenoOElAyudanteRegistranPagos,'error'); return; }
  const p=((_cobrosFicha.negId===negId && _cobrosFicha.lista)||[]).find(x=>x.id===pagoId);
  if(!p || p.anulado) return;
  confirmarModal('¿Anular el pago de '+mesLegible(p.mes)+' por '+fmtMoney(p.valor)+'? Queda en la lista como anulado y ese mes vuelve a deberse.', ()=>{
    const yo=STATE._superUser||STATE.user;
    const anulado=Object.assign({}, p, {anulado:true, anuladoEn:now(), anuladoPor:String((yo&&yo.nombre)||'—').slice(0,80)});
    Datos.guardarPago(anulado).then(ok=>{
      if(!ok){ toast(MSJ.noSeGuardoElPago,'error'); return null; }
      return Datos.leerPagos(negId).then(pagos=>{
        const r=aplicarPagosAlNegocio(negId, pagos, null, null);
        if(r) anotarEnSistema(Dominio.sistema.ACCION.anularPago, r.n, r.antes, r.despues, mesLegible(p.mes)+' · '+fmtMoney(p.valor));
        _cobrosFicha={negId, lista:pagos};
        toast(MSJ.pagoAnulado,'info'); render();
      });
    }).catch(e=>{ reportarError('anular el pago', e); toast(MSJ.noSeGuardoElPago,'error'); });
  }, 'Anular pago');
}

// ---------- Sección "Cobros" de la ficha ----------
export let _cobrosFicha={negId:null, lista:null};
export function cobrosNegocio(negId){
  if(!esAdminSistema()){ toast(MSJ.soloElDuenoOElAyudanteRegistranPagos,'error'); return; }
  STATE.page='cobros:'+negId; _cobrosFicha={negId, lista:null}; render();
  Datos.leerPagos(negId)
    .then(l=>{ if(_cobrosFicha.negId===negId){ _cobrosFicha={negId, lista:l}; render(); } })
    .catch(e=>{ _cobrosFicha={negId, lista:[]}; reportarError('leer los pagos', e); render(); });
}
export function pantallaCobrosNegocio(negId){
  const neg=(DB.get('negocios')||[]).find(n=>n.id===negId);
  if(!neg) return `<div class="contenido"><div class="tarjeta">Negocio no encontrado. <button class="btn btn-sm" data-click="irPanel()">← Volver al panel</button></div></div>`;
  const lista=_cobrosFicha.negId===negId ? _cobrosFicha.lista : null;
  const e=estadoCobro(neg);
  const pagos=(lista||[]).slice().sort((a,b)=>(b.mes+b.registrado).localeCompare(a.mes+a.registrado));
  const texto={no_aplica:neg.esDemo?'Las demos no se cobran.':(typeof neg.pruebaHasta==='number'?'Está a prueba: se cobra cuando pase a pago.':'Sin precio mensual: no se cobra.'),
    sin_iniciar:'Todavía no tiene pagos registrados. El control empieza con el primer pago que registres.',
    al_dia:'Al día. El próximo pago ('+(e.mes?mesLegible(e.mes):'')+') vence el '+(e.vence?diaLegible(e.vence):'')+'.',
    por_pagar:'Debe '+(e.mes?mesLegible(e.mes):'')+' ('+(e.vence===today()?'vence hoy':'venció el '+(e.vence?diaLegible(e.vence):''))+'). Tiene '+Dominio.cobros.DIAS_GRACIA+' días de gracia.',
    en_mora:'En mora: '+(e.pendientes||1)+' mes(es) sin pagar desde '+(e.mes?mesLegible(e.mes):'')+'. Lleva '+(e.diasMora||0)+' días de atraso.'}[e.estado];
  return `${cabeceraFicha(neg, 'cobros')}
  <div class="contenido">
    <div class="tarjeta ${e.estado==='en_mora'?'alerta':''}">
      <span class="t-tit">💰 Estado de pago ${pillPago(neg)}</span>
      <p>${escapeHtml(texto)}</p>
      <div class="ficha-datos">
        <div class="ficha-dato"><span class="gris chico">Precio al mes</span><strong>${fmtMoney(neg.precioMes||0)}</strong></div>
        <div class="ficha-dato"><span class="gris chico">Día de pago</span><strong>${neg.diaPago?escapeHtml(neg.diaPago):'—'}</strong></div>
        <div class="ficha-dato"><span class="gris chico">Se cobra desde</span><strong>${Dominio.cobros.mesValido(neg.cobroDesde)?escapeHtml(mesLegible(neg.cobroDesde)):'—'}</strong></div>
        <div class="ficha-dato"><span class="gris chico">Pagado hasta</span><strong>${Dominio.cobros.mesValido(neg.pagadoHasta)?escapeHtml(mesLegible(neg.pagadoHasta)):'—'}</strong></div>
        <div class="ficha-dato"><span class="gris chico">Total pagado</span><strong>${lista?fmtMoney(Dominio.cobros.totalPagado(lista)):'…'}</strong></div>
      </div>
      <div class="botones-fila mt-14">
        <button class="btn btn-gold" data-click="registrarPago('${escapeHtml(neg.id)}')">💰 Registrar pago</button>
        ${e.estado==='en_mora'&&neg.activo?`<button class="btn btn-naranja" data-click="toggleNegocio('${escapeHtml(neg.id)}')">Suspender</button>`:''}
        <button class="btn btn-ghost" data-click="configNegocio('${escapeHtml(neg.id)}')">Cambiar precio o día de pago</button>
      </div>
    </div>
    <div class="tarjeta">
      <span class="t-tit">Pagos registrados</span>
      <div class="tabla-wrap"><table class="tabla tabla-cards">
        <thead><tr><th>Mes</th><th>Valor</th><th>Medio</th><th>Pagó el</th><th>Registró</th><th></th></tr></thead>
        <tbody>${lista===null?'<tr><td colspan="6" class="gris">Cargando…</td></tr>'
          : pagos.length? pagos.map(p=>`<tr class="${p.anulado?'gris':''}">
          <td data-label="Mes"><strong>${escapeHtml(mesLegible(p.mes))}</strong>${p.anulado?' <span class="pill pill-rojo chico">Anulado</span>':''}${p.nota?`<br><span class="gris chico">${escapeHtml(p.nota)}</span>`:''}</td>
          <td data-label="Valor">${fmtMoney(p.valor)}</td>
          <td data-label="Medio">${escapeHtml(p.medio)}</td>
          <td data-label="Pagó el">${escapeHtml(p.fecha)}</td>
          <td data-label="Registró" class="gris chico">${escapeHtml(p.quien||'—')}${p.anulado?`<br>Anuló: ${escapeHtml(p.anuladoPor||'—')}`:''}</td>
          <td data-label="Acciones">${p.anulado?'':`<button class="btn btn-sm btn-ghost" data-click="anularPago('${escapeHtml(neg.id)}', '${escapeHtml(p.id)}')">Anular</button>`}</td>
        </tr>`).join('') : '<tr><td colspan="6" class="gris">Sin pagos registrados.</td></tr>'}</tbody>
      </table></div>
    </div>
  </div>`;
}

// ---------- Avisos de pago de los vendedores (P17) ----------
// El vendedor avisa que su cliente pagó; el dueño o el ayudante lo confirman (queda el pago) o lo rechazan.
export let _avisosPago=[];
export let _dejarAvisosPago=null;
export function escucharAvisosPago(){
  dejarAvisosPago();
  if(!esAdminSistema()) return;
  _dejarAvisosPago=Datos.escucharAvisosPago(l=>{ _avisosPago=l||[]; refrescarSiSePuede(); });
}
export function dejarAvisosPago(){
  if(_dejarAvisosPago){ try{ _dejarAvisosPago(); }catch(e){ console.warn(e); } }
  _dejarAvisosPago=null; _avisosPago=[];
}
// Cifra "Por atender" del panel
export function cuantosAvisosPago(){ return esAdminSistema() ? Dominio.cobros.avisosPendientes(_avisosPago).length : 0; }
export function tarjetaAvisosPago(){
  if(!esAdminSistema()) return '';
  const lista=Dominio.cobros.avisosPendientes(_avisosPago);
  if(!lista.length) return '';
  return `<div class="tarjeta alerta">
    <span class="t-tit">📨 Avisos de pago de los vendedores (${lista.length})</span>
    <p class="gris">Confírmalo cuando veas el dinero: queda registrado como un pago. Si no llegó, recházalo.</p>
    <div class="tabla-wrap"><table class="tabla tabla-cards">
      <thead><tr><th>Negocio</th><th>Pago</th><th>Avisó</th><th>Acciones</th></tr></thead>
      <tbody>${lista.map(a=>`<tr>
        <td data-label="Negocio"><strong>${escapeHtml(a.negocioNombre||a.negocioId)}</strong></td>
        <td data-label="Pago">${escapeHtml(mesLegible(a.mes))} · ${fmtMoney(a.valor)} · ${escapeHtml(a.medio)}<br><span class="gris chico">pagó el ${escapeHtml(a.fecha)}${a.nota?' · '+escapeHtml(a.nota):''}</span></td>
        <td data-label="Avisó">${escapeHtml(a.quien)}</td>
        <td data-label="Acciones"><div class="acciones">
          <button class="btn btn-sm btn-verde" data-click="confirmarAvisoPago('${escapeHtml(a.id)}')">Confirmar</button>
          <button class="btn btn-sm btn-ghost" data-click="rechazarAvisoPago('${escapeHtml(a.id)}')">Rechazar</button>
        </div></td>
      </tr>`).join('')}</tbody>
    </table></div>
  </div>`;
}
// Vendedor: avisar que un cliente suyo pagó
export function avisarPago(negId){
  const neg=(DB.get('negocios')||[]).find(n=>n.id===negId); if(!neg) return;
  if(!(STATE.user && STATE.user.rolSuper==='vendedor' && neg.vendedorId===STATE.user.id)){ toast(MSJ.soloElVendedorDeEseCliente,'error'); return; }
  const hoy=today(), sugerido=Dominio.cobros.mesPorPagar(neg, hoy);
  let m=sugerido; for(let i=0;i<6;i++) m=Dominio.cobros.mesAnterior(m);
  const meses=[]; for(let i=0;i<10;i++){ meses.push(m); m=Dominio.cobros.mesSiguiente(m); }
  abrirModal({titulo:'Avisar que '+neg.nombre+' pagó', textoBoton:BOTON.avisar, campos:[
    {id:'mes', label:'Mes que pagó', tipo:'select', valor:sugerido, opciones:meses.map(x=>({valor:x, label:mesLegible(x)}))},
    {id:'valor', label:'Valor', tipo:'number', valor:String(neg.precioMes||''), requerido:true},
    {id:'medio', label:'Medio de pago', tipo:'select', opciones:Dominio.cobros.MEDIOS_PAGO.map(x=>({valor:x, label:x}))},
    {id:'fecha', label:'Fecha en que pagó', tipo:'date', valor:hoy, requerido:true},
    {id:'nota', label:'Nota (opcional)', placeholder:'Ej: comprobante 1234'}
  ], extraHTML:`<p class="nota">El dueño o el ayudante del sistema lo confirman cuando vean el dinero.</p>`,
  onGuardar:(d)=>{
    const a=Dominio.cobros.nuevoAviso({id:uid(), negocio:neg, mes:d.mes, valor:d.valor, medio:d.medio, fecha:d.fecha, nota:d.nota,
      quien:STATE.user, creado:now()});
    if(Dominio.cobros.problemaDelAviso(a)){ toast(MSJ.revisaElPago,'error'); return; }
    Datos.guardarAvisoPago(a).then(ok=>{
      if(!ok){ toast(MSJ.noSeGuardoElAviso,'error'); return; }
      anotarEnSistema(Dominio.sistema.ACCION.avisarPago, neg, null, null, mesLegible(a.mes)+' · '+fmtMoney(a.valor)+' · '+a.medio);
      cerrarModal(); toast(MSJ.avisoDePagoEnviado,'success');
    }).catch(e=>{ reportarError('avisar el pago', e); toast(MSJ.noSeGuardoElAviso,'error'); });
  }});
}
function avisoPendiente(id){ return Dominio.cobros.avisosPendientes(_avisosPago).find(a=>a.id===id)||null; }
export function confirmarAvisoPago(id){
  if(!esAdminSistema()){ toast(MSJ.soloElDuenoOElAyudanteRegistranPagos,'error'); return; }
  const a=avisoPendiente(id); if(!a) return;
  const yo=STATE._superUser||STATE.user;
  const pago=Dominio.cobros.pagoDesdeAviso(a, {id:uid(), quien:yo, registrado:now()});
  if(Dominio.cobros.problemaDelPago(pago)){ toast(MSJ.revisaElPago,'error'); return; }
  guardarPagoYActualizar(pago, 'aviso de '+a.quien).then(ok=>{
    if(!ok) return;
    return Datos.guardarAvisoPago(Object.assign({}, a, {estado:'confirmado', pagoId:pago.id, resueltoPor:String((yo&&yo.nombre)||'—').slice(0,80), resueltoEn:now()}))
      .then(()=>{ toast('Pago confirmado: '+mesLegible(a.mes),'success'); render(); });
  }).catch(e=>reportarError('confirmar el aviso de pago', e));
}
export function rechazarAvisoPago(id){
  if(!esAdminSistema()){ toast(MSJ.soloElDuenoOElAyudanteRegistranPagos,'error'); return; }
  const a=avisoPendiente(id); if(!a) return;
  confirmarModal('¿Rechazar el aviso de '+a.quien+' ('+(a.negocioNombre||'')+', '+mesLegible(a.mes)+')? No se registra ningún pago.', ()=>{
    const yo=STATE._superUser||STATE.user;
    Datos.guardarAvisoPago(Object.assign({}, a, {estado:'rechazado', resueltoPor:String((yo&&yo.nombre)||'—').slice(0,80), resueltoEn:now()}))
      .then(ok=>{
        if(!ok){ toast(MSJ.noSeGuardoElAviso,'error'); return; }
        const neg=(DB.get('negocios')||[]).find(n=>n.id===a.negocioId)||{id:a.negocioId, nombre:a.negocioNombre};
        anotarEnSistema(Dominio.sistema.ACCION.rechazarAvisoPago, neg, null, null, mesLegible(a.mes)+' · aviso de '+a.quien);
        toast(MSJ.avisoRechazado,'info'); render();
      }).catch(e=>reportarError('rechazar el aviso de pago', e));
  }, 'Rechazar');
}
