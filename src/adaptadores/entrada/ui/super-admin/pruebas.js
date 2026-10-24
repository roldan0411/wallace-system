// ============================================================
//  INTERFAZ · Periodo de prueba
//  Pantalla del servicio window.Pruebas (src/aplicacion/servicios/pruebas.js):
//  crear un negocio a prueba (con o sin productos de ejemplo), aviso de días
//  dentro del negocio, solo lectura al vencer, lista de pruebas y demos por
//  vencer en el panel (más días, pasar a pago, borrar demo) y "borrar ejemplos".
//  El bloqueo real al vencer lo hacen las reglas de la base; esto solo avisa.
//  Adaptador de entrada: módulo ES. Lo carga ui/manifiesto.js (cargarInterfaz).
//  Doc: Documentation/01-super-admin-panel/01-super-admin-panel.md (Periodo de prueba)
// ============================================================
import { STATE, escapeHtml } from '../nucleo/estado.js';
import { BOTON, MSJ } from '../nucleo/textos.js';
import { abrirModal, cerrarModal, confirmarModal, ic, toast } from '../nucleo/componentes.js';
import { render } from '../nucleo/navegacion.js';
import { logAudit } from '../usuarios/auditoria.js';
import { eliminarNegocio } from './negocios.js';
import { eliminarDemoVendedor } from './demos.js';
import { anotarEnSistema } from './historial-sistema.js';

const MOTIVOS={permiso:'No tienes permiso para manejar este negocio', no_existe:'El negocio ya no existe',
  dias:'Los días deben ser de 1 a '+Dominio.prueba.MAX_DIAS, es_demo:'Una demo no se pasa a pago: crea el negocio real',
  no_es_prueba:'Ese negocio no está a prueba'};
const motivo=r=>MOTIVOS[r.motivo]||('No se pudo: '+r.motivo);
const fechaCorta=ms=>new Date(ms).toLocaleDateString('es-CO');
const dias=n=>n+(n===1?' día':' días');

// ---------- Crear negocio a prueba (campos extra del formulario "Crear negocio") ----------
// soloPrueba: el vendedor solo puede crear negocios a prueba (a su nombre)
export function camposPruebaHTML(soloPrueba){
  return `<div class="m-row"><label>Periodo de prueba</label>
      <select id="m-prueba">
        ${soloPrueba?'':'<option value="">Sin prueba (ya paga)</option>'}
        <option value="si" selected>A prueba</option>
      </select></div>
    <div class="m-row"><label>Días de prueba</label>
      <input id="m-dias-prueba" type="number" min="1" max="${escapeHtml(Dominio.prueba.MAX_DIAS)}" value="${escapeHtml(Dominio.prueba.DIAS_PRUEBA)}">
      <label class="chk mt-8"><input type="checkbox" id="m-ejemplos"> Cargar productos de ejemplo de su tipo (se borran con un botón)</label>
      <p class="nota">Al vencer, el negocio queda en solo lectura hasta que le des más días o lo pases a pago.</p></div>`;
}
// Lee lo elegido en el formulario antes de cerrarlo: null = sin prueba
export function leerCamposPrueba(){
  const v=id=>document.getElementById(id);
  if(!v('m-prueba') || v('m-prueba').value!=='si') return null;
  return {dias:parseInt((v('m-dias-prueba')||{}).value,10), conEjemplos:!!(v('m-ejemplos')||{}).checked};
}
export function diasPruebaValidos(opc){ return !opc || (opc.dias>=1 && opc.dias<=Dominio.prueba.MAX_DIAS); }
// Después de guardar el negocio
export function iniciarPruebaDe(negId, opc){
  if(!opc) return;
  const r=Pruebas.iniciar(negId, opc);
  if(!r.ok){ toast('El negocio se creó, pero no quedó a prueba: '+motivo(r),'error'); return; }
  toast('A prueba por '+dias(r.estado.diasRestantes)+(r.ejemplos?' · '+r.ejemplos+' productos de ejemplo':''),'info');
  anotarEnSistema(Dominio.sistema.ACCION.iniciarPrueba, (DB.get('negocios')||[]).find(n=>n.id===negId), null, null, dias(r.estado.diasRestantes)+(r.ejemplos?' · con productos de ejemplo':''));
}

// ---------- Aviso dentro del negocio ----------
export function bannerPrueba(neg){
  const e=Dominio.prueba.estadoPrueba(neg, Date.now());
  if(!e.tipo) return '';
  const que=e.tipo==='demo'?'Demo':'Periodo de prueba';
  if(e.vencida) return `<div class="banner-prueba vencida">
      <span>🔒 ${que} vencido el ${fechaCorta(e.hasta)}: <strong>solo lectura</strong>. Puedes ver todo, pero no vender ni cambiar datos. ${e.tipo==='demo'?'':'Para seguir, comunícate con tu asesor.'}</span></div>`;
  return `<div class="banner-prueba ${e.diasRestantes<=3?'urgente':''}">
      <span>⏳ ${que}: ${e.diasRestantes===1?'vence hoy':'te quedan <strong>'+dias(e.diasRestantes)+'</strong>'} (hasta el ${fechaCorta(e.hasta)}).</span></div>`;
}
// Pill para la lista de negocios del panel
export function pillPrueba(neg){
  const e=Dominio.prueba.estadoPrueba(neg, Date.now());
  if(!e.tipo) return '';
  if(e.vencida) return ' <span class="pill pill-rojo fs-9">VENCIDA</span>';
  return ` <span class="pill ${e.diasRestantes<=3?'pill-rojo':'pill-gold'} fs-9" title="Vence el ${escapeHtml(fechaCorta(e.hasta))}">${e.tipo==='demo'?'DEMO':'PRUEBA'} · ${dias(e.diasRestantes)}</span>`;
}

// ---------- Panel: pruebas y demos por vencer ----------
export const DIAS_AVISO=7;
export function tarjetaPorVencer(){
  const lista=Pruebas.porVencer(DIAS_AVISO);
  if(!lista.length) return '';
  const vendedor=STATE.user.rolSuper==='vendedor';
  return `<div class="tarjeta alerta">
    <span class="t-tit">⏳ Pruebas y demos por vencer</span>
    <p class="gris">Vencen en los próximos ${DIAS_AVISO} días o ya vencieron (quedan en solo lectura). Dales más días, pásalas a pago o borra las demos que ya no sirven.</p>
    <div class="tabla-wrap"><table class="tabla tabla-cards">
      <thead><tr><th>Negocio</th><th>Vence</th><th>Acciones</th></tr></thead>
      <tbody>${lista.map(n=>`<tr>
        <td data-label="Negocio"><strong>${escapeHtml(n.nombre)}</strong> <span class="pill ${n.esDemo?'pill-azul':'pill-oro'} fs-9">${n.esDemo?'DEMO':'PRUEBA'}</span></td>
        <td data-label="Vence">${n.estado.vencida?'<span class="rojo negrita">Vencida</span>':(n.estado.diasRestantes===1?'Hoy':'En '+dias(n.estado.diasRestantes))}<br><span class="gris chico">${fechaCorta(n.estado.hasta)}</span></td>
        <td class="acciones" data-label="Acciones">
          <button class="btn btn-sm" data-click="darMasDias('${escapeHtml(n.id)}')">+ Días</button>
          ${n.esDemo?`<button class="btn btn-sm btn-rojo" data-click="borrarDemoVencida('${escapeHtml(n.id)}')" title="Borrar esta demo">🗑️</button>`
            :(vendedor?'':`<button class="btn btn-sm btn-verde" data-click="pasarAPago('${escapeHtml(n.id)}')">Pasar a pago</button>`)}
        </td>
      </tr>`).join('')}</tbody>
    </table></div>
  </div>`;
}
export function darMasDias(negId){
  abrirModal({titulo:'Dar más días', textoBoton:BOTON.guardar, campos:[
    {id:'dias', label:'Días más (si ya venció, se cuentan desde hoy)', tipo:'number', valor:String(Dominio.prueba.DIAS_PRUEBA), requerido:true}
  ], onGuardar:d=>{
    const r=Pruebas.extender(negId, parseInt(d.dias,10));
    if(!r.ok){ toast(motivo(r),'error'); return; }
    cerrarModal();
    toast('Ahora vence el '+fechaCorta(r.estado.hasta),'success');
    anotarEnSistema(Dominio.sistema.ACCION.darDias, (DB.get('negocios')||[]).find(n=>n.id===negId), null, null, '+'+parseInt(d.dias,10)+' días · vence el '+fechaCorta(r.estado.hasta));
    render();
  }});
}
export function pasarAPago(negId){
  if(STATE.user.rolSuper==='vendedor'){ toast(MSJ.pasarAPagoLoHaceEl,'error'); return; }
  confirmarModal(MSJ.pasarAPagoDejaDeSer, ()=>{
    const r=Pruebas.convertirAPago(negId);
    if(!r.ok){ toast(motivo(r),'error'); return; }
    toast(MSJ.negocioPasadoAPago,'success');
    anotarEnSistema(Dominio.sistema.ACCION.pasarAPago, (DB.get('negocios')||[]).find(n=>n.id===negId));
    render();
  }, 'Pasar a pago');
}
export function borrarDemoVencida(negId){
  if(STATE.user.rolSuper==='vendedor') return eliminarDemoVendedor(negId);
  eliminarNegocio(negId);
}

// ---------- Productos de ejemplo (dentro del negocio) ----------
export function avisoEjemplos(){
  if(!STATE.negocio) return '';
  const n=misDatos('productos').filter(p=>p && p.ejemplo).length;
  if(!n || !Dominio.prueba.puedeBorrarEjemplos(STATE.user, STATE.negocio.id)) return '';
  return `<div class="tarjeta d-flex items-centro gap-10 flex-wrap">
    <span class="flex-1">${ic('box')} Tienes <strong>${n}</strong> producto(s) de ejemplo para practicar.</span>
    <button class="btn btn-sm btn-rojo" data-click="borrarEjemplos()">Borrar ejemplos y empezar con los míos</button>
  </div>`;
}
export function borrarEjemplos(){
  const negId=STATE.negocio&&STATE.negocio.id; if(!negId) return;
  confirmarModal(MSJ.borrarLosProductosDeEjemploLos, ()=>{
    const r=Pruebas.borrarEjemplos(negId);
    if(!r.ok){ toast(motivo(r),'error'); return; }
    logAudit('Borró productos de ejemplo', r.borrados+' producto(s)');
    toast(r.borrados+' producto(s) de ejemplo borrados','success');
    render();
  }, 'Borrar');
}
