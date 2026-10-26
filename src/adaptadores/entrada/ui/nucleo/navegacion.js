// ============================================================
//  INTERFAZ · Navegación y render
//  irA, menú por rol (armarMenu), vista del negocio y render() principal.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/13-multitenant-isolation/13-multitenant-isolation.md
// ============================================================
import { STATE, escapeHtml, fijarEscribiendo } from './estado.js';
import { esAdminSistema, pantallaValida, puedeVerSucursal, sucursalActual, usaInventario } from './permisos.js';
import { ic, logoNegocio, pPedido, pPedidos, reportarError } from './componentes.js';
import { aplicarTema, quitarTema } from './tema.js';
import { necesitaConfigInicial, vistaConfigInicial, vistaLogin } from '../usuarios/sesion.js';
import { vistaCambioObligatorio } from '../usuarios/recuperacion.js';
import { auditoria } from '../usuarios/auditoria.js';
import { pantallaUsuarios } from '../usuarios/usuarios-admin.js';
import { usuariosNeg } from '../usuarios/usuarios-negocio.js';
import { pantallaMigracion } from '../usuarios/migracion-cuentas.js';
import { panelSuperAdmin } from '../super-admin/panel.js';
import { pantallaSuperAdmins } from '../super-admin/administradores.js';
import { pantallaHistorialSistema } from '../super-admin/historial-sistema.js';
import { pantallaFicha, pantallaHistorialNegocio } from '../super-admin/ficha-negocio.js';
import { bannerPrueba } from '../super-admin/pruebas.js';
import { nuevaVenta } from '../ventas/nueva-venta.js';
import { cuentas, usaCuentas } from '../ventas/cuentas-abiertas.js';
import { pedidos } from '../ventas/pedidos.js';
import { caja } from '../caja/caja.js';
import { cocina } from '../cocina/cocina.js';
import { tiempos } from '../cocina/tiempos.js';
import { citas } from '../citas/citas.js';
import { avisarVencimientos } from '../inventario/motor.js';
import { inventario } from '../inventario/catalogo.js';
import { combos } from '../inventario/combos.js';
import { pantallaInsumos } from '../inventario/insumos.js';
import { conteo } from '../inventario/conteo.js';
import { clientes } from '../clientes/clientes.js';
import { cuadreDomi, domicilios } from '../clientes/domicilios.js';
import { inicio } from '../reportes/dashboard.js';
import { reportes } from '../reportes/reportes.js';
import { historial } from '../reportes/historial.js';
import { contable } from '../gastos/contable.js';
import { gastosneg } from '../gastos/gastos.js';
import { pantallaConfig } from '../configuracion/config-negocio.js';
import { minegocio } from '../configuracion/mi-negocio.js';
import { reimpresiones } from '../impresion/reimpresiones.js';


export function irA(pg){
  if(pg!=='ventas') fijarEscribiendo(false);
  STATE.pageNeg=pg;
  const sb=document.getElementById('sidebar'); if(sb) sb.classList.remove('abierto');
  // Navegación suave: si ya estamos dentro del negocio, solo cambiamos el
  // contenido central y el título, sin reconstruir el sidebar (evita el "parpadeo").
  if(STATE.user && STATE.negocio && !STATE.esSuperAdmin && document.querySelector('.app-grid')){
    renderContenido();
  } else {
    render();
  }
  // Al entrar a Inventario, avisar si hay lotes vencidos o por vencer
  if(pg==='inventario' || pg==='catalogo'){ try{ avisarVencimientos(); }catch(e){ reportarError('las alertas de vencimiento', e); } }
}

// Redibuja SOLO el área de contenido, el título y el resaltado del menú.
// El sidebar y la topbar permanecen intactos, así la navegación es instantánea y sin saltos.
export function renderContenido(){
  const cont=document.querySelector('.main .contenido');
  if(!cont){ render(); return; }   // por si el layout aún no existe, redibujar completo
  const neg=STATE.negocio;
  const titulos={inicio:'Dashboard', ventas:'+ '+pPedido(true), pedidos:pPedidos(true),
    inventario:neg.usaRecetas?'Menú':'Inventario', insumos:'Insumos', caja:'Caja', cocina:'Cocina', citas:'Agendar',
    domicilios:'Domicilios', cuadredomi:'Cuadre de Domiciliarios', clientes:'Clientes', reportes:'Reportes',
    contable:'Registro Contable', gastosneg:'Gastos del Negocio', minegocio:'Mi Negocio',
    tiempos:'Tiempos de Entrega', historial:'Historial', auditoria:'Auditoría', reimpresiones:'Reimpresiones', conteo:'Conteo de Inventario', combos:'Menú y Combos', usuarios:'Usuarios', cuentas:'Cuentas Abiertas'};
  const pantallas={inicio, ventas:nuevaVenta, pedidos, inventario, insumos:pantallaInsumos, caja,
    clientes, domicilios, cuadredomi:cuadreDomi, reportes, contable, gastosneg, minegocio, citas, cocina,
    tiempos, historial, auditoria, reimpresiones, conteo, combos, usuarios:usuariosNeg, cuentas};
  pantallaValida();   // nunca mostrar una pantalla que el rol no tiene permitida
  const fn=pantallas[STATE.pageNeg];
  let contenido='';
  if(!fn){
    contenido='<div class="tarjeta centro-msg"><div class="msg-ico">🚧</div>'
      +'<div class="t-tit centrado">Pantalla no disponible</div>'
      +'<p class="gris">Esta sección todavía no está habilitada para tu negocio.</p>'
      +'<button class="btn btn-gold" data-click="irA(\'inicio\')">Volver al inicio</button></div>';
  } else {
    try{ contenido=fn(); }catch(e){ reportarError('la pantalla '+STATE.pageNeg, e);
      contenido='<div class="tarjeta"><p class="rojo">Ocurrió un error al mostrar esta pantalla.</p><button class="btn" data-click="irA(\'inicio\')">Volver al inicio</button></div>'; }
  }
  cont.innerHTML=contenido;
  cont.scrollTop=0;                         // subir al inicio de la nueva sección
  // Actualizar el título de la topbar
  const h1=document.querySelector('.main .topbar h1');
  if(h1){
    const btn=h1.querySelector('.menu-btn');
    h1.innerHTML=(btn?btn.outerHTML:'')+' '+escapeHtml(titulos[STATE.pageNeg]||'');
  }
  // Actualizar cuál ítem del menú queda resaltado
  document.querySelectorAll('.side-nav .nav-item').forEach(el=>{
    const oc=el.getAttribute('data-click')||'';
    const m=oc.match(/irA\('([^']+)'\)/);
    if(m) el.classList.toggle('on', m[1]===STATE.pageNeg);
  });
}
export function armarMenu(){
  const neg=STATE.negocio, u=STATE.user;
  const F=neg.funciones||[];
  const items=[];
  items.push({g:'PRINCIPAL'});
  items.push({id:'inicio', ic:'dashboard', txt:'Dashboard'});
  if(F.indexOf('ventas')>-1) items.push({id:'ventas', ic:'cart', txt:'+ '+pPedido(true)});
  items.push({id:'pedidos', ic:'report', txt:pPedidos(true)});
  if(usaCuentas()) items.push({id:'cuentas', ic:'cash', txt:'Cuentas Abiertas'});
  if(F.indexOf('catalogo')>-1){
    if(neg.usaRecetas){
      // Restaurante: el menú de platos y el inventario de insumos son cosas distintas
      items.push({id:'inventario', ic:'chef', txt:'Menú'});
      items.push({id:'insumos', ic:'box', txt:'Insumos'});
    } else {
      items.push({id:'inventario', ic:'box', txt:'Inventario'});
    }
  }
  // Combos: en todo negocio que venda (aunque no tenga marcado el catálogo)
  if(F.indexOf('catalogo')>-1 || F.indexOf('ventas')>-1) items.push({id:'combos', ic:'cart', txt:'Menú y Combos'});
  const ops=[];
  if(F.indexOf('caja')>-1) ops.push({id:'caja', ic:'cash', txt:'Caja'});
  if(F.indexOf('cocina')>-1 && neg.usaCocina) ops.push({id:'cocina', ic:'chef', txt:'Cocina'});
  if(F.indexOf('cocina')>-1 && neg.usaCocina) ops.push({id:'tiempos', ic:'history', txt:'Tiempos de Entrega'});
  if(F.indexOf('citas')>-1 && neg.usaCitas) ops.push({id:'citas', ic:'calendar', txt:'Agendar'});
  if(F.indexOf('domicilios')>-1) ops.push({id:'domicilios', ic:'truck', txt:'Domicilios'});
  if(F.indexOf('domicilios')>-1) ops.push({id:'cuadredomi', ic:'truck', txt:'Cuadre Domi'});
  if(F.indexOf('clientes')>-1) ops.push({id:'clientes', ic:'users', txt:'Clientes'});
  if(usaInventario(neg)) ops.push({id:'conteo', ic:'box', txt:'Conteo de Inventario'});
  if((F.indexOf('pedidos')>-1||F.indexOf('ventas')>-1)) ops.push({id:'reimpresiones', ic:'history', txt:'Reimpresiones'});
  if(ops.length){ items.push({g:'OPERACIONES'}); ops.forEach(o=>items.push(o)); }
  const ges=[];
  if(F.indexOf('reportes')>-1) ges.push({id:'reportes', ic:'report', txt:'Reportes'});
  if((F.indexOf('pedidos')>-1||F.indexOf('ventas')>-1)) ges.push({id:'historial', ic:'history', txt:'Historial'});
  if(F.indexOf('contable')>-1) ges.push({id:'contable', ic:'report', txt:'Registro Contable'});
  if(F.indexOf('gastosneg')>-1) ges.push({id:'gastosneg', ic:'cash', txt:'Gastos del Negocio'});
  if(u.rol==='admin'||u.esSupervisor) ges.push({id:'auditoria', ic:'history', txt:'Auditoría'});
  if(ges.length){ items.push({g:'GESTIÓN'}); ges.forEach(g=>items.push(g)); }
  const cfgs=[];
  cfgs.push({id:'minegocio', ic:'building', txt:'Mi Negocio'});
  cfgs.push({id:'usuarios', ic:'users', txt:'Usuarios'});
  items.push({g:'CONFIGURACIÓN'});
  cfgs.forEach(x=>items.push(x));
  // Filtrar por rol
  if(u.esSupervisor || u.rol==='admin') return items;
  const permitidas = Dominio.permisos.pantallasDe(u);
  const salida=[]; let grupo=null;
  items.forEach(it=>{
    if(it.g){ grupo=it; return; }
    let id = (it.id==='inventario'||it.id==='insumos')?'catalogo':it.id;
    if(it.id==='tiempos') id='cocina';
    if(it.id==='historial') id='pedidos';
    if(it.id==='reimpresiones') id='pedidos';
    if(it.id==='cuadredomi') id='domicilios';
    if(it.id==='conteo') id='catalogo';
    if(it.id==='combos') id='catalogo';
    if(it.id==='cuentas') id='pedidos';
    if(it.id==='minegocio') id='config';
    if(it.id==='auditoria') id='__solo_admin__';   // ya se filtró arriba por rol
    if(permitidas.indexOf(it.id)>-1 || permitidas.indexOf(id)>-1){
      if(grupo){ salida.push(grupo); grupo=null; }
      salida.push(it);
    }
  });
  return salida;
}

export function vistaNegocio(){
  const neg=STATE.negocio, u=STATE.user;
  const menu=armarMenu();
  const titulos={inicio:'Dashboard', ventas:'+ '+pPedido(true), pedidos:pPedidos(true),
    inventario:neg.usaRecetas?'Menú':'Inventario', insumos:'Insumos', caja:'Caja', cocina:'Cocina', citas:'Agendar',
    domicilios:'Domicilios', cuadredomi:'Cuadre de Domiciliarios', clientes:'Clientes', reportes:'Reportes',
    contable:'Registro Contable', gastosneg:'Gastos del Negocio', minegocio:'Mi Negocio',
    tiempos:'Tiempos de Entrega', historial:'Historial', auditoria:'Auditoría', reimpresiones:'Reimpresiones', conteo:'Conteo de Inventario', combos:'Menú y Combos', usuarios:'Usuarios', cuentas:'Cuentas Abiertas',
    citas:'Agendar', cocina:'Cocina'};
  const pantallas={inicio, ventas:nuevaVenta, pedidos, inventario, insumos:pantallaInsumos, caja,
    clientes, domicilios, cuadredomi:cuadreDomi, reportes, contable, gastosneg, minegocio, citas, cocina,
    tiempos, historial, auditoria, reimpresiones, conteo, combos, usuarios:usuariosNeg, cuentas};
  pantallaValida();   // nunca mostrar una pantalla que el rol no tiene permitida
  const fn=pantallas[STATE.pageNeg];
  let contenido='';
  if(!fn){
    contenido='<div class="tarjeta centro-msg"><div class="msg-ico">🚧</div>'
      +'<div class="t-tit centrado">Pantalla no disponible</div>'
      +'<p class="gris">Esta sección todavía no está habilitada para tu negocio.</p>'
      +'<button class="btn btn-gold" data-click="irA(\'inicio\')">Volver al inicio</button></div>';
  } else {
    try{ contenido=fn(); }catch(e){ reportarError('la pantalla '+STATE.pageNeg, e);
      contenido='<div class="tarjeta"><p class="rojo">Ocurrió un error al mostrar esta pantalla.</p><button class="btn" data-click="irA(\'inicio\')">Volver al inicio</button></div>'; }
  }
  const ini=(u.nombre||'?').charAt(0).toUpperCase();

  return `
  <div class="app-grid">
    <aside class="sidebar" id="sidebar">
      <div class="side-cab">
        ${logoNegocio(neg,'class="side-logo" alt=""')||`<div class="side-ini">${escapeHtml((neg.nombre||'?').charAt(0))}</div>`}
        <div class="side-nom">${escapeHtml(neg.nombre)}</div>
        <div class="side-tipo">${escapeHtml(neg.tipo||'')}</div>
      </div>
      <nav class="side-nav">
        ${menu.map(m=>m.g?`<div class="nav-grupo">${m.g}</div>`
          :`<div class="nav-item ${STATE.pageNeg===m.id?'on':''}" data-click="irA('${escapeHtml(m.id)}')">${ic(m.ic)}<span>${m.txt}</span></div>`).join('')}
      </nav>
      <div class="side-pie">
        <div class="user-box">
          <div class="avatar">${ini}</div>
          <div class="user-info">
            <div class="u-nom">${escapeHtml(u.nombre)}</div>
            <div class="u-est"><span class="fb-dot off" id="fb-status"></span> <span id="fb-txt">Conectando</span></div>
          </div>
          <button class="btn btn-ghost btn-sm" data-click="logout()" title="Salir">${ic('logout')}</button>
        </div>
        <div class="credito"><span class="c-marca">Wallace<span>System</span></span><span class="c-sub">Software administrativo</span></div>
      </div>
    </aside>
    <div class="main">
      ${STATE.modoSupervision?`<div class="banner-sup">
        <span>👁️ Supervisando ${escapeHtml(neg.nombre)} como ${escapeHtml((STATE._superUser&&STATE._superUser.nombre)||'Super-Admin')}</span>
        <button class="btn btn-sm btn-gold" data-click="volverSuperAdmin()">← Volver al panel</button>
      </div>`:''}
      ${bannerPrueba(neg)}
      <div class="topbar">
        <h1><button class="menu-btn" data-click="alternarMenu()">☰</button>
          ${escapeHtml(titulos[STATE.pageNeg]||'')}</h1>
        <div class="tb-der">
          ${usaSucursales(neg)?`<select class="suc-sel" data-change="cambiarSucursal(this.value)">
            ${sucursalesDe(neg).filter(s=>puedeVerSucursal(s.id)).map(s=>`<option value="${escapeHtml(s.id)}" ${s.id===sucursalActual()?'selected':''}>📍 ${escapeHtml(s.nombre)}</option>`).join('')}
          </select>`:''}
          <span class="reloj" id="reloj"></span>
        </div>
      </div>
      <div class="contenido">${contenido}</div>
    </div>
  </div>`;
}

export function render(){
  const app=document.getElementById('app');
  if(!app) return;
  // Guardar el campo enfocado (buscadores) para restaurarlo tras redibujar,
  // así el teclado no se cierra al escribir en cualquier búsqueda del sistema.
  let _foco=null;
  const _act=document.activeElement;
  if(_act && (_act.tagName==='INPUT'||_act.tagName==='TEXTAREA') && _act.closest('#app')){
    _foco={ph:_act.getAttribute('placeholder'), id:_act.id||'', pos:_act.selectionStart};
  }
  // El tema del negocio se aplica dentro del negocio; el login y el
  // panel del súper admin conservan el estilo de la marca Wallace.
  if(STATE.user && STATE.negocio && !STATE.esSuperAdmin){ aplicarTema(STATE.negocio); }
  else { quitarTema(); }
  if(!STATE.user){ app.innerHTML=necesitaConfigInicial()?vistaConfigInicial():vistaLogin(); return; }
  // Entró con una contraseña temporal: nada más hasta que elija una nueva
  if(STATE.debeCambiarPass){ app.innerHTML=vistaCambioObligatorio(); return; }
  if(STATE.esSuperAdmin){
    // Configuración y usuarios de negocios: solo dueño/ayudante (no vendedor)
    if(/^(config|usuarios|negocio|historialneg):/.test(STATE.page) && !esAdminSistema()) STATE.page='';
    if(STATE.page.indexOf('negocio:')===0){ app.innerHTML=pantallaFicha(STATE.page.split(':')[1]); return; }
    if(STATE.page.indexOf('historialneg:')===0){ app.innerHTML=pantallaHistorialNegocio(STATE.page.split(':')[1]); return; }
    if(STATE.page.indexOf('config:')===0){ app.innerHTML=pantallaConfig(STATE.page.split(':')[1]); return; }
    if(STATE.page.indexOf('usuarios:')===0){ app.innerHTML=pantallaUsuarios(STATE.page.split(':')[1]); return; }
    if(STATE.page==='superadmins'){ app.innerHTML=pantallaSuperAdmins(); return; }
    if(STATE.page==='historial'){ app.innerHTML=pantallaHistorialSistema(); return; }
    if(STATE.page==='migracion'){ app.innerHTML=esAdminSistema()?pantallaMigracion():panelSuperAdmin(); return; }
    app.innerHTML=panelSuperAdmin();
    return;
  }
  app.innerHTML=vistaNegocio();
  // Restaurar el foco del buscador que estaba activo (no cerrar el teclado)
  if(_foco && (_foco.ph||_foco.id)){
    let el=null;
    if(_foco.id) el=document.getElementById(_foco.id);
    if(!el && _foco.ph){
      const ins=app.querySelectorAll('input,textarea');
      for(let i=0;i<ins.length;i++){ if(ins[i].getAttribute('placeholder')===_foco.ph){ el=ins[i]; break; } }
    }
    if(el){ try{ el.focus(); if(_foco.pos!=null && el.value.length>=_foco.pos) el.setSelectionRange(_foco.pos,_foco.pos); }catch(e){} }
  }
  // Reflejar el estado de conexión
  const dot=document.getElementById('fb-status');
  const txt=document.getElementById('fb-txt');
  if(dot && txt){
    if(FB_READY){ dot.className='fb-dot ok'; txt.textContent='Sincronizado'; }
    else { dot.className='fb-dot off'; txt.textContent='Sin conexión'; }
  }
}
export function alternarMenu(){ const s=document.getElementById('sidebar'); if(s) s.classList.toggle('abierto'); }
