// ============================================================
//  INTERFAZ · Ficha de un negocio (U3)
//  Una página por negocio con cuatro secciones: Resumen, Configurar,
//  Usuarios e Historial (esta, solo el dueño del sistema). Configurar y Usuarios
//  son las pantallas de siempre con la cabecera de la ficha (cabeceraFicha).
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/01-super-admin-panel/01-super-admin-panel.md
// ============================================================
import { STATE, escapeHtml, fmtMoney } from '../nucleo/estado.js';
import { MSJ } from '../nucleo/textos.js';
import { esAdminSistema } from '../nucleo/permisos.js';
import { ic, reportarError, toast } from '../nucleo/componentes.js';
import { render } from '../nucleo/navegacion.js';
import { resumenDe } from '../reportes/resumen.js';
import { pillPrueba } from './pruebas.js';
import { tablaHistorial } from './historial-sistema.js';
import { pillPago } from './cobros.js';

export function abrirFicha(id){
  if(!esAdminSistema()){ toast(MSJ.noTienesPermisoParaConfigurarNegocios,'error'); return; }
  STATE.page='negocio:'+id; render();
}
// Cabecera común de la ficha: nombre, estado y las secciones
export function cabeceraFicha(neg, seccion){
  const esDueno=STATE.user && STATE.user.rolSuper==='dueno';
  const secciones=[['resumen','Resumen','abrirFicha'],['config','Configurar','configNegocio'],['usuarios','Usuarios','usuariosNegocio'],['cobros','Cobros','cobrosNegocio']]
    .concat(esDueno?[['historial','Historial','historialNegocio']]:[]);
  return `
  <div class="topbar">
    <h1>${ic('building')} ${escapeHtml(neg.nombre)}
      ${neg.esDemo?'<span class="pill pill-azul">DEMO</span>':''}
      <span class="pill ${neg.activo?'pill-verde':'pill-rojo'}">${neg.activo?'Activo':(neg.esDemo?'Pausada':'Suspendido')}</span>
      ${pillPrueba(neg).replace('DEMO · ','')}</h1>
    <div class="tb-der"><button class="btn btn-ghost btn-sm" data-click="irPanel()">← Volver al panel</button></div>
  </div>
  <nav class="ficha-nav">${secciones.map(s=>`<button class="${seccion===s[0]?'on':''}" data-click="${escapeHtml(s[2])}('${escapeHtml(neg.id)}')">${s[1]}</button>`).join('')}</nav>`;
}

// ---------- Resumen ----------
function dato(etiqueta, valor){ return `<div class="ficha-dato"><span class="gris chico">${etiqueta}</span><strong>${valor}</strong></div>`; }
export function pantallaFicha(negId){
  const neg=(DB.get('negocios')||[]).find(n=>n.id===negId);
  if(!neg) return `<div class="contenido"><div class="tarjeta">Negocio no encontrado. <button class="btn btn-sm" data-click="irPanel()">← Volver al panel</button></div></div>`;
  const r=resumenDe(neg.id);
  const hoy=today(), mes=hoy.substring(0,7);
  const ultimo=r?Dominio.ventas.ultimoDiaConVentas(r):null;
  const diasSin=ultimo?-Dominio.fechas.diasHasta(ultimo, hoy):null;   // días locales (F2), no UTC
  const actividad=!r?'Sin cifras todavía':(ultimo===hoy?'Vendió hoy':(ultimo?'Última venta hace '+diasSin+' día'+(diasSin===1?'':'s'):'Sin ventas recientes'));
  const usuarios=(DB.get('usuarios')||[]).filter(u=>u.negocioId===neg.id);
  const vendedor=neg.vendedorId?(((DB.get('superadmins')||[]).find(v=>v.id===neg.vendedorId)||{}).nombre||neg.vendedorNombre||'—'):'Sin asignar';
  const prueba=typeof neg.pruebaHasta==='number' ? Pruebas.estado(neg.id) : null;
  const esDueno=STATE.user && STATE.user.rolSuper==='dueno';
  return `${cabeceraFicha(neg, 'resumen')}
  <div class="contenido">
    ${!neg.activo && !neg.esDemo?`<div class="tarjeta alerta"><strong>Suspendido</strong>${neg.suspendidoDesde?' desde '+escapeHtml(Dominio.fechas.diaDe(neg.suspendidoDesde)):''}${neg.motivoSuspension?' · '+escapeHtml(neg.motivoSuspension):''}</div>`:''}
    <div class="stats">
      <div class="stat verde"><div class="stat-lbl">Ventas de hoy</div><div class="stat-val">${fmtMoney(r?(r.dias||{})[hoy]||0:0)}</div><div class="stat-sub">${escapeHtml(actividad)}</div></div>
      <div class="stat gold"><div class="stat-lbl">Ventas del mes</div><div class="stat-val">${fmtMoney(r?(r.meses||{})[mes]||0:0)}</div><div class="stat-sub">${r?(r.pagadas||0)+' ventas en total':'sin cifras'}</div></div>
      <div class="stat azul"><div class="stat-lbl">Usuarios</div><div class="stat-val">${usuarios.length}</div><div class="stat-sub">${usuarios.filter(u=>u.activo===false).length} inactivo(s)</div></div>
    </div>
    <div class="tarjeta">
      <span class="t-tit">💼 Plan y cuenta</span>
      <div class="ficha-datos">
        ${dato('Plan', escapeHtml(neg.plan||'—'))}
        ${dato('Precio al mes', fmtMoney(neg.precioMes||0))}
        ${dato('Día de pago', neg.diaPago?escapeHtml(neg.diaPago):'—')}
        ${pillPago(neg)?dato('Pago', pillPago(neg)):''}
        ${dato('Vendedor', escapeHtml(vendedor))}
        ${dato('Tipo', escapeHtml(neg.tipo||'—'))}
        ${dato('Ciudad', escapeHtml(neg.ciudad||'—'))}
        ${dato('Cliente desde', neg.creado?escapeHtml(Dominio.fechas.diaDe(neg.creado)):'—')}
        ${prueba?dato('Prueba', escapeHtml(prueba.vencida?'Vencida (solo lectura)':prueba.diasRestantes+' día(s) restantes')):''}
      </div>
    </div>
    <div class="tarjeta">
      <span class="t-tit">Acciones</span>
      <div class="botones-fila mt-8">
        <button class="btn btn-verde" data-click="entrarComoNegocio('${escapeHtml(neg.id)}')">Entrar al negocio</button>
        <button class="btn" data-click="reporteMensualNegocio('${escapeHtml(neg.id)}')">📄 Informe</button>
        <button class="btn" data-click="asignarVendedor('${escapeHtml(neg.id)}')">👤 Vendedor</button>
        ${prueba?`<button class="btn" data-click="darMasDias('${escapeHtml(neg.id)}')">+ Días de prueba</button>
          ${neg.esDemo?'':`<button class="btn btn-gold" data-click="pasarAPago('${escapeHtml(neg.id)}')">Pasar a pago</button>`}`:''}
        <button class="btn ${neg.activo?'btn-naranja':'btn-verde'}" data-click="toggleNegocio('${escapeHtml(neg.id)}')">${neg.activo?(neg.esDemo?'Pausar':'Suspender'):'Activar'}</button>
      </div>
      ${esDueno?`<div class="ficha-peligro"><button class="btn btn-sm btn-rojo" data-click="eliminarNegocio('${escapeHtml(neg.id)}')">Eliminar el negocio</button>
        <span class="gris chico">Borra el negocio, sus usuarios y todos sus datos. No se puede deshacer.</span></div>`:''}
    </div>
  </div>`;
}

// ---------- Historial del negocio (solo el dueño del sistema) ----------
export let _historialFicha={negId:null, lista:null};
export function historialNegocio(negId){
  if(!(STATE.user && STATE.user.rolSuper==='dueno')){ toast(MSJ.soloElDuenoVeElHistorial,'error'); return; }
  STATE.page='historialneg:'+negId; _historialFicha={negId, lista:null}; render();
  Datos.leerHistorialSistema(500)
    .then(l=>{ if(_historialFicha.negId===negId){ _historialFicha={negId, lista:Dominio.sistema.recientesPrimero(Dominio.sistema.filtrar(l, {negocioId:negId}))}; render(); } })
    .catch(e=>{ _historialFicha={negId, lista:[]}; reportarError('leer el historial del negocio', e); render(); });
}
export function pantallaHistorialNegocio(negId){
  const neg=(DB.get('negocios')||[]).find(n=>n.id===negId);
  if(!neg) return pantallaFicha(negId);
  const esDueno=STATE.user && STATE.user.rolSuper==='dueno';
  const lista=_historialFicha.negId===negId ? _historialFicha.lista : null;
  return `${cabeceraFicha(neg, 'historial')}
  <div class="contenido">
    <div class="tarjeta">
      ${!esDueno?'<p class="gris">🔒 Solo el dueño del sistema ve el historial.</p>':`
      <span class="t-tit">Lo que se ha hecho con este negocio ${lista?`<span class="pill pill-gold">${lista.length}</span>`:''}</span>
      <p class="gris">Acciones de los super-admins sobre este negocio (entre las últimas 500 del sistema). El historial completo está en ⚙ Sistema → Historial.</p>
      ${tablaHistorial(lista, false)}`}
    </div>
  </div>`;
}
