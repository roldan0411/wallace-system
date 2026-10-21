// ============================================================
//  INTERFAZ · Domicilios
//  Domiciliarios y cuadre de domicilios.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/07-customers-delivery/07-customers-delivery.md
// ============================================================
import { STATE, escapeHtml, fijarEscribiendo, fmtMoney, now } from '../nucleo/estado.js';
import { BOTON, MSJ } from '../nucleo/textos.js';
import { cajaActual, exigirEscritura, puedeVerPantalla, tienePermiso } from '../nucleo/permisos.js';
import { abrirModal, cerrarModal, confirmarModal, ic, pPedidos, pProds, reportarError, toast } from '../nucleo/componentes.js';
import { render } from '../nucleo/navegacion.js';
import { logAudit } from '../usuarios/auditoria.js';
import { ventasJornada } from '../ventas/pedidos.js';
import { usaCajaNegocio } from '../ventas/cobro.js';
import { agregarMovimientoCaja, puedeRetirarJefe } from '../caja/caja.js';


// ============================================================
//  DOMICILIARIOS
// ============================================================
// Cuadre de domiciliarios: cuánto debe entregar cada mensajero (fórmula visual como Portal Imperial)
export function cuadreDomi(){
  fijarEscribiendo(false);
  const neg=STATE.negocio;
  const vs=ventasJornada(true).filter(v=>v.tipo==='domicilio');
  const grupos={}, domsPorId={};
  misDatos('domiciliarios').forEach(d=>{ domsPorId[d.id]=d; });
  vs.forEach(v=>{
    // F15: se agrupa por id del domiciliario (las ventas viejas, por nombre)
    const dom=v.domiciliarioId ? domsPorId[v.domiciliarioId] : null;
    const clave=v.domiciliarioId || ('n:'+(v.domiciliario||''));
    const nom=(dom && dom.nombre) || v.domiciliario || '(sin asignar)';
    if(!grupos[clave]) grupos[clave]={clave, nombre:nom, pedidos:[], comidaEf:0, comidaBanco:0, comidaTarjeta:0, domEf:0, domBanco:0};
    const g=grupos[clave];
    g.pedidos.push(v);
    // Con pago dividido, cada parte va a donde corresponde
    const rc=reparte(v, v.subtotal||0);
    g.comidaEf+=rc.efectivo; g.comidaBanco+=rc.banco; g.comidaTarjeta+=rc.tarjeta;
    const rd=reparte(v, v.valorDom||0);
    g.domEf+=rd.efectivo; g.domBanco+=rd.banco+rd.tarjeta;
  });
  const lista=Object.values(grupos).sort((a,b)=>b.pedidos.length-a.pedidos.length);
  _cuadreDomi=lista;   // para pagarDomiciliario (se paga lo que muestra esta pantalla)
  const caja=cajaActual(), conCaja=usaCajaNegocio();
  const tot={pedidos:0,comidaEf:0,comidaBanco:0,domEf:0,domBanco:0};
  lista.forEach(g=>{ tot.pedidos+=g.pedidos.length; tot.comidaEf+=g.comidaEf; tot.comidaBanco+=g.comidaBanco; tot.domEf+=g.domEf; tot.domBanco+=g.domBanco; });

  if(!lista.length){
    return `<div class="tarjeta"><span class="t-tit">${ic('truck')} Cuadre de Domiciliarios</span>
      <p class="gris mt-10">No hay domicilios pagados en esta jornada.</p></div>`;
  }
  return `
    <div class="tarjeta">
      <span class="t-tit">${ic('truck')} Cuadre de Domiciliarios <span class="pill pill-azul">Hoy</span></span>
      <p class="gris mt-6">Cuánto debe entregar cada mensajero y cuánto le corresponde por domicilios. Si eliminas un domicilio, se descuenta automáticamente de este cuadre.</p>
    </div>
    <div class="stats">
      <div class="stat verde"><div class="stat-ico verde">${ic('cash')}</div><div class="stat-lbl">${pProds(true)} en efectivo</div><div class="stat-val">${fmtMoney(tot.comidaEf)}</div><div class="stat-sub">deben entregar los mensajeros</div></div>
      <div class="stat azul"><div class="stat-ico azul">${ic('cash')}</div><div class="stat-lbl">${pProds(true)} por banco</div><div class="stat-val">${fmtMoney(tot.comidaBanco)}</div><div class="stat-sub">ya está en la cuenta</div></div>
      <div class="stat gold"><div class="stat-ico gold">${ic('truck')}</div><div class="stat-lbl">Domicilios (para ellos)</div><div class="stat-val">${fmtMoney(tot.domEf+tot.domBanco)}</div><div class="stat-sub">efectivo ${fmtMoney(tot.domEf)} · banco ${fmtMoney(tot.domBanco)}</div></div>
      <div class="stat"><div class="stat-ico">${ic('report')}</div><div class="stat-lbl">Domicilios entregados</div><div class="stat-val">${tot.pedidos}</div><div class="stat-sub">${lista.length} mensajero(s)</div></div>
    </div>
    ${lista.map(g=>{
      const entregaCajon=g.comidaEf;
      const leTocaEf=g.domEf;
      const leTocaBanco=g.domBanco;
      const neto=entregaCajon-leTocaEf;
      return `<div class="tarjeta">
        <div class="t-cab"><span class="t-tit">${ic('truck')} ${escapeHtml(g.nombre)}</span><span class="pill pill-azul">${g.pedidos.length} domicilio(s)</span></div>
        <div class="grid2">
          <div>
            <p class="oro negrita mb-8">Valor de los ${pPedidos()} (${pProds()})</p>
            <div class="linea"><span>En efectivo (le pagaron en la mano)</span><strong class="verde">${fmtMoney(g.comidaEf)}</strong></div>
            <div class="linea"><span>Por banco / transferencia</span><strong class="azul">${fmtMoney(g.comidaBanco)}</strong></div>
            ${g.comidaTarjeta>0?`<div class="linea"><span>Por tarjeta</span><strong>${fmtMoney(g.comidaTarjeta)}</strong></div>`:''}
            <div class="linea total-linea"><span>Total en pedidos</span><strong>${fmtMoney(g.comidaEf+g.comidaBanco+g.comidaTarjeta)}</strong></div>
          </div>
          <div>
            <p class="oro negrita mb-8">Domicilios (le corresponden a él)</p>
            <div class="linea"><span>Domicilios cobrados en efectivo</span><strong class="verde">${fmtMoney(g.domEf)}</strong></div>
            <div class="linea"><span>Domicilios que entraron por banco</span><strong class="azul">${fmtMoney(g.domBanco)}</strong></div>
            <div class="linea total-linea"><span>Total domicilios</span><strong class="oro">${fmtMoney(g.domEf+g.domBanco)}</strong></div>
          </div>
        </div>
        <div class="d-flex items-estirar gap-10 flex-wrap mt-14 p-14 fondo-linear-gradient-135deg-acc-rgb-08-245-197-24-05 borde-1-solid-linea2 radio-12">
          <div class="flex-1 minw-130"><div class="gris chico">DEBE ENTREGAR EN EL CAJÓN</div><div class="verde fs-22 fw-800">${fmtMoney(entregaCajon)}</div></div>
          <div class="d-flex items-centro fs-26 color-gris">−</div>
          <div class="flex-1 minw-130"><div class="gris chico">SE QUEDA CON (DOMICILIOS EFECTIVO)</div><div class="oro fs-22 fw-800">${fmtMoney(leTocaEf)}</div></div>
          <div class="d-flex items-centro fs-26 color-gris">=</div>
          <div class="flex-1 minw-130 txt-der"><div class="gris chico">ENTREGA NETA</div><div class="fs-26 fw-900 color-verde-c sombra-txt-glow-txt">${fmtMoney(neto)}</div></div>
        </div>
        ${leTocaBanco>0?(()=>{
          const pagado=Dominio.caja.pagadoADomiciliario(caja, g.clave), falta=Math.max(0, Math.round(leTocaBanco-pagado));
          return `<div class="d-flex items-centro gap-10 flex-wrap mt-8">
            <p class="gris chico flex-1">↳ Además se le deben pagar ${fmtMoney(leTocaBanco)} en efectivo del cajón, porque esos domicilios entraron por banco.${pagado>0?' Ya se le pagaron '+fmtMoney(pagado)+'.':''}</p>
            ${falta<=0?'<span class="pill pill-verde">✓ Pagado</span>'
              :(conCaja && caja)?`<button class="btn btn-sm btn-gold" data-click="pagarDomiciliario('${escapeHtml(g.clave)}')">💵 Pagarle ${fmtMoney(falta)} del cajón</button>`
              :conCaja?'<span class="gris chico">Abre la caja para registrar el pago</span>':''}
          </div>`; })():''}
      </div>`;
    }).join('')}`;
}

export function domicilios(){
  fijarEscribiendo(false);
  const doms=misDatos('domiciliarios');
  const vs=ventasJornada(true).filter(v=>v.tipo==='domicilio');
  // Cuadre: por domiciliario, cuánto en domicilios y cómo entró (efectivo vs banco)
  // Misma regla que el Cuadre (F4): el domicilio se reparte según cómo pagó el cliente
  // (pago dividido incluido); banco y tarjeta = no entró en efectivo.
  const domNoEf=v=>{ const r=reparte(v, v.valorDom||0); return r.banco+r.tarjeta; };
  const totalDom=vs.reduce((a,v)=>a+(v.valorDom||0),0);
  const domBanco=Math.round(vs.reduce((a,v)=>a+domNoEf(v),0));
  const domEfectivo=totalDom-domBanco;
  const comoEntro=v=>{
    const nb=domNoEf(v), dom=v.valorDom||0;
    if(dom<=0 || nb<=0.5) return '<span class="pill pill-verde">Efectivo</span>';
    if(nb>=dom-0.5) return '<span class="pill pill-azul">Banco</span>';
    return '<span class="pill pill-gold">Mixto</span><br><span class="gris chico">'+fmtMoney(dom-nb)+' ef. · '+fmtMoney(nb)+' banco</span>';
  };
  return `
    <div class="stats">
      <div class="stat gold"><div class="stat-ico gold">${ic('truck')}</div><div class="stat-lbl">Domicilios de la jornada</div><div class="stat-val">${vs.length}</div><div class="stat-sub">${fmtMoney(totalDom)} en total</div></div>
      <div class="stat verde"><div class="stat-ico verde">${ic('cash')}</div><div class="stat-lbl">Cobrados en efectivo</div><div class="stat-val">${fmtMoney(domEfectivo)}</div><div class="stat-sub">los cobra el domiciliario</div></div>
      <div class="stat azul"><div class="stat-ico azul">${ic('report')}</div><div class="stat-lbl">Entraron por banco</div><div class="stat-val">${fmtMoney(domBanco)}</div><div class="stat-sub">se le pagan al domiciliario</div></div>
    </div>
    <div class="tarjeta">
      <div class="t-cab">
        <span class="t-tit">${ic('truck')} Domiciliarios</span>
        <button class="btn btn-gold" data-click="editarDomiciliario(null)">+ Agregar</button>
      </div>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Nombre</th><th>Teléfono</th><th>Entregas</th><th>Domicilios cobrados</th><th></th></tr></thead>
        <tbody>
        ${doms.length? doms.map(d=>{
          const suyos=vs.filter(v=>Dominio.ventas.esDelDomiciliario(v,d));
          return `<tr>
            <td><strong>${escapeHtml(d.nombre)}</strong></td>
            <td>${escapeHtml(d.tel||'—')}</td>
            <td>${suyos.length}</td>
            <td class="oro">${fmtMoney(suyos.reduce((a,v)=>a+(v.valorDom||0),0))}</td>
            <td class="acciones"><button class="btn btn-sm btn-rojo" data-click="eliminarDomiciliario('${escapeHtml(d.id)}')">×</button></td>
          </tr>`;
        }).join('') : '<tr><td colspan="5" class="gris">Sin domiciliarios.</td></tr>'}
        </tbody>
      </table></div>
    </div>
    <div class="tarjeta">
      <div class="t-cab">
        <span class="t-tit">${ic('report')} Domicilios de la jornada</span>
        <button class="btn btn-sm btn-gold" data-click="irA('cuadredomi')">📊 Ver cuadre completo</button>
      </div>
      <p class="nota">Detalle de cada domicilio y cómo se cobró. El domicilio en efectivo lo recibe el domiciliario directo; el que entra por banco se le paga del cajón.</p>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Pedido</th><th>Cliente</th><th>Domiciliario</th><th>Valor domicilio</th><th>Cómo entró</th></tr></thead>
        <tbody>${vs.length? vs.map(v=>`<tr>
          <td><strong class="oro">${escapeHtml(v.factura||'—')}</strong></td>
          <td>${escapeHtml(v.cliNombre||'—')}${v.cliDir?`<br><span class="gris chico">${escapeHtml(v.cliDir)}</span>`:''}</td>
          <td>${escapeHtml(v.domiciliario||'—')}</td>
          <td class="negrita">${fmtMoney(v.valorDom||0)}</td>
          <td>${comoEntro(v)}</td>
        </tr>`).join('') : '<tr><td colspan="5" class="gris">Sin domicilios en esta jornada.</td></tr>'}</tbody>
      </table></div>
    </div>`;
}
// Paga al domiciliario, del cajón, los domicilios que entraron por banco: queda como un retiro
// de la caja (antes la pantalla lo decía pero no había cómo registrarlo y el cierre quedaba corto)
export let _cuadreDomi=[];
export function pagarDomiciliario(clave){
  if(!exigirEscritura()) return;
  if(!(tienePermiso('abrircaja')||puedeRetirarJefe())){ toast(MSJ.noTienesPermisoParaRegistrarMovimientos,'error'); return; }
  const caja=cajaActual(); if(!caja){ toast(MSJ.noHayCajaAbierta,'error'); return; }
  const g=_cuadreDomi.find(x=>x.clave===clave); if(!g) return;
  const falta=Math.max(0, Math.round(g.domBanco-Dominio.caja.pagadoADomiciliario(caja, clave)));
  if(falta<=0){ toast(MSJ.yaSeLePagoAlDomiciliario,'info'); return; }
  confirmarModal('¿Registrar un retiro de '+fmtMoney(falta)+' del cajón para pagarle a '+g.nombre+' los domicilios que entraron por banco?', ()=>{
    agregarMovimientoCaja({id:uid(), tipo:'retiro', concepto:'Domicilios por banco · '+g.nombre, valor:falta, pagoDomi:clave,
      por:STATE.user.nombre, fecha:now()})
      .then(ok=>{
        if(!ok){ toast(MSJ.noSeRegistroLaCajaYa,'error'); render(); return; }
        logAudit('Pagó domicilios al domiciliario', g.nombre+' · '+fmtMoney(falta));
        toast('Pagado a '+g.nombre+': '+fmtMoney(falta),'success'); render();
      }).catch(e=>reportarError('el pago al domiciliario', e));
  }, 'Registrar pago');
}
export function editarDomiciliario(id){
  if(!exigirEscritura()) return;   // D10: solo lectura
  if(!puedeVerPantalla('domicilios')){ toast(MSJ.noTienesAccesoADomicilios,'error'); return; }
  abrirModal({titulo:'Nuevo domiciliario', textoBoton:BOTON.agregar, campos:[
    {id:'nombre', label:'Nombre', requerido:true},
    {id:'tel', label:'Teléfono'}
  ], onGuardar:(d)=>{
    const arr=misDatos('domiciliarios');
    arr.push({id:uid(), nombre:d.nombre, tel:d.tel, creado:now()});
    guardarMisDatos('domiciliarios',arr);
    cerrarModal(); toast(MSJ.agregado,'success'); render();
  }});
}
export function eliminarDomiciliario(id){
  if(!exigirEscritura()) return;   // D10: solo lectura
  if(!puedeVerPantalla('domicilios')){ toast(MSJ.noTienesAccesoADomicilios,'error'); return; }
  confirmarModal(MSJ.eliminarEsteDomiciliario,()=>{
    eliminarMisDatos('domiciliarios',id); toast(MSJ.eliminado,'info'); render();
  },'Eliminar');
}
