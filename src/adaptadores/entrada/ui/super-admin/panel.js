// ============================================================
//  INTERFAZ · Panel del super-admin
//  Métricas, lista de negocios, panel del vendedor y respaldo.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/01-super-admin-panel/01-super-admin-panel.md
// ============================================================
import { STATE, escapeHtml, fmtDate, fmtMoney } from '../nucleo/estado.js';
import { BOTON, MSJ } from '../nucleo/textos.js';
import { esAdminSistema } from '../nucleo/permisos.js';
import { abrirModal, cerrarModal, confirmarModal, ic, reportarError, toast } from '../nucleo/componentes.js';
import { WALLACE_LOGO } from '../nucleo/logo.js';
import { render } from '../nucleo/navegacion.js';
import { conCuentasFirebase } from '../usuarios/sesion.js';
import { cuantasRecuperaciones, tarjetaRecuperaciones } from '../usuarios/recuperacion.js';
import { cuantasPorVencer, pillPrueba, tarjetaPorVencer } from './pruebas.js';
import { cuantosAvisosPago, cuantosPorCobrar, gravedadCobro, pillPago, tarjetaAvisosPago, tarjetaCobros } from './cobros.js';
import { textoArchivo } from './negocios.js';
import { resumenDe } from '../reportes/resumen.js';
import { anotarEnSistema } from './historial-sistema.js';


// ============================================================
//  PANEL DE SUPER-ADMIN
// ============================================================
export function panelSuperAdmin(){
  const negocios=DB.get('negocios')||[];
  // Los negocios DEMO son de práctica (dinero ficticio): NO cuentan en las métricas reales
  const reales=negocios.filter(n=>!n.esDemo && !n.archivado);   // demos (dinero ficticio) y archivados no cuentan
  const idsReales={}; reales.forEach(n=>idsReales[n.id]=true);
  const activos=reales.filter(n=>n.activo).length;
  const ingreso=reales.filter(n=>n.activo).reduce((a,n)=>a+(n.precioMes||0),0);
  let ventasHoy=0;
  const hoy=today();
  // R1: las cifras salen del resumen que publica cada negocio (reportes/resumen.js),
  // no de descargar las ventas de todos los negocios
  let sinCifras=0;
  reales.forEach(n=>{
    const r=resumenDe(n.id);
    if(!r){ sinCifras++; return; }
    ventasHoy+=(r.dias||{})[hoy]||0;
  });
  const q=(STATE.buscaNegocio||'').toLowerCase();
  let lista=q?negocios.filter(n=>(n.nombre||'').toLowerCase().includes(q)||(n.tipo||'').toLowerCase().includes(q)
      ||(n.ciudad||'').toLowerCase().includes(q)||(n.vendedorNombre||'').toLowerCase().includes(q)):negocios;
  // Filtro por vendedor a cargo
  if(STATE.filtroVendedor){
    lista = STATE.filtroVendedor==='sin' ? lista.filter(n=>!n.vendedorId) : lista.filter(n=>n.vendedorId===STATE.filtroVendedor);
  }
  // U6: plan, ciudad y orden
  if(STATE.filtroPlan) lista=lista.filter(n=>Dominio.negocio.planDe(n)===STATE.filtroPlan);
  if(STATE.filtroCiudad) lista=lista.filter(n=>Dominio.negocio.claveCiudad(n.ciudad)===STATE.filtroCiudad);
  const ciudades={};
  negocios.forEach(n=>{ const k=Dominio.negocio.claveCiudad(n.ciudad); if(k && !ciudades[k]) ciudades[k]=String(n.ciudad).trim(); });
  const sas=DB.get('superadmins')||[];
  const nombreVend=id=>{ const v=sas.find(x=>x.id===id); return v?v.nombre:''; };

  // ===== PANEL PARA VENDEDORES (equipo comercial): solo demos =====
  if(STATE.user.rolSuper==='vendedor'){
    const misClientes=negocios.filter(n=>!n.esDemo && n.vendedorId===STATE.user.id);
    const demos=(q?lista:negocios).filter(n=>n.esDemo);
    const misDemos=demos.filter(n=>!n.demoDe || n.demoDe===STATE.user.id);   // sus demos (o todos los demos si no hay dueño marcado)
    return `
    <div class="topbar">
      <h1><span class="sa-emblema">${WALLACE_LOGO}</span>
        <span class="sa-marca">Panel de <span>Ventas</span></span>
        <span class="pill pill-azul">Vendedor</span></h1>
      <div class="tb-der">
        <span class="fb-dot off" id="fb-status" title="Conexión"></span>
        <span class="reloj" id="reloj"></span>
        <button class="btn btn-sm" data-click="cambiarMiPassSuper()">🔑 Mi contraseña</button>
        <button class="btn btn-ghost btn-sm" data-click="logout()">${ic('logout')} Salir</button>
      </div>
    </div>
    <div class="contenido">
      <div class="tarjeta fondo-linear-gradient-135deg-acc-rgb-12-transparent">
        <span class="t-tit">👋 Hola, ${escapeHtml(STATE.user.nombre)}</span>
        <p class="gris mt-6">Aquí puedes crear negocios de demostración para mostrarle el sistema a tus clientes, o un negocio a prueba para un cliente nuevo. Las demos son solo de práctica y no afectan a los clientes reales.</p>
      </div>
      ${tarjetaPorVencer()}
      <div class="stats">
        <div class="stat azul"><div class="stat-ico azul">${ic('box')}</div><div class="stat-lbl">Tus demos</div><div class="stat-val">${misDemos.length}</div><div class="stat-sub">para mostrar</div></div>
        <div class="stat verde"><div class="stat-ico verde">${ic('building')}</div><div class="stat-lbl">Clientes a tu cargo</div><div class="stat-val">${misClientes.length}</div><div class="stat-sub">${misClientes.filter(n=>n.activo).length} activo(s)</div></div>
        <div class="stat gold"><div class="stat-ico gold">${ic('cash')}</div><div class="stat-lbl">Tu cartera al mes</div><div class="stat-val">${fmtMoney(misClientes.filter(n=>n.activo).reduce((a,n)=>a+(n.precioMes||0),0))}</div><div class="stat-sub">de los que están activos</div></div>
      </div>
      ${misClientes.length?`<div class="tarjeta">
        <span class="t-tit">${ic('building')} Tus clientes</span>
        <p class="gris">Negocios reales que tú vendiste. No puedes entrar a sus datos, solo ver cómo van.</p>
        <div class="tabla-wrap"><table class="tabla">
          <thead><tr><th>Negocio</th><th>Ciudad</th><th>Plan</th><th>Desde</th><th>Estado</th><th>Pago</th></tr></thead>
          <tbody>${misClientes.map(n=>`<tr>
            <td><strong>${escapeHtml(n.nombre)}</strong>${pillPrueba(n)}</td>
            <td class="gris">${escapeHtml(n.ciudad||'—')}</td>
            <td>${escapeHtml(n.plan||'—')}<br><span class="gris chico">${fmtMoney(n.precioMes||0)}/mes</span></td>
            <td class="gris chico">${n.creado?(n.creado||'').split('T')[0]:'—'}</td>
            <td>${n.activo?'<span class="pill pill-verde">Activo</span>':'<span class="pill pill-rojo">Suspendido</span>'}</td>
            <td>${pillPago(n)}${pillPago(n)&&n.activo?`<br><button class="btn btn-sm mt-8" data-click="avisarPago('${escapeHtml(n.id)}')">Avisar que pagó</button>`:''}</td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>`:''}
      <div class="tarjeta">
        <div class="t-cab">
          <span class="t-tit">${ic('building')} Mis demostraciones</span>
          <div class="t-acc">
            <button class="btn btn-ghost" data-click="crearNegocioDemo()">✨ Crear demo</button>
            <button class="btn btn-gold" data-click="nuevoNegocio()">${ic('plus')} Negocio a prueba</button>
          </div>
        </div>
        <div class="tabla-wrap"><table class="tabla tabla-cards">
          <thead><tr><th>Negocio demo</th><th>Tipo</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
          ${misDemos.length? misDemos.map(n=>`<tr>
            <td data-label="Negocio"><strong>${escapeHtml(n.nombre)}</strong> <span class="pill pill-azul fs-9">DEMO</span>${pillPrueba(n).replace('DEMO · ','')}${n.ciudad?`<br><span class="gris">${escapeHtml(n.ciudad)}</span>`:''}</td>
            <td data-label="Tipo">${escapeHtml(n.tipo)}</td>
            <td data-label="Estado">${n.activo?'<span class="pill pill-verde">Activo</span>':'<span class="pill pill-rojo">Pausado</span>'}</td>
            <td class="acciones" data-label="Acciones">
              <button class="btn btn-sm btn-verde" data-click="entrarComoNegocio('${escapeHtml(n.id)}')">Entrar</button>
              <button class="btn btn-sm ${n.activo?'btn-naranja':'btn-verde'}" data-click="toggleNegocio('${escapeHtml(n.id)}')">${n.activo?'Pausar':'Activar'}</button>
              <button class="btn btn-sm btn-rojo" data-click="eliminarDemoVendedor('${escapeHtml(n.id)}')" title="Borrar este demo">🗑️</button>
            </td>
          </tr>`).join('') : '<tr><td colspan="4" class="gris">Aún no tienes demos. Crea el primero con "✨ Crear demo".</td></tr>'}
          </tbody>
        </table></div>
      </div>
    </div>`;
  }

  // ===== PANEL DEL DUEÑO Y DEL AYUDANTE (U1–U4) =====
  const dueno=STATE.user.rolSuper==='dueno', cuentas=conCuentasFirebase() && esAdminSistema();
  const porAtender=cuantasPorVencer()+cuantasRecuperaciones()+cuantosPorCobrar()+cuantosAvisosPago();
  // U2: pestañas. Los contadores salen de la lista ya filtrada por búsqueda y vendedor.
  const conteo=Dominio.negocio.contarPorGrupo(lista);
  const tab=Dominio.negocio.GRUPOS_PANEL.indexOf(STATE.tabNegocios)>-1 ? STATE.tabNegocios : 'clientes';
  const enTab=Dominio.negocio.ordenarPanel(lista.filter(n=>Dominio.negocio.grupoPanel(n)===tab), STATE.ordenNegocios, gravedadCobro);
  const ORDENES=[['','Orden: como se crearon'],['nombre','Nombre (A–Z)'],['recientes','Más recientes'],['precio','Mayor precio'],['mora','Los que más deben']];
  const TABS=[['clientes','Clientes'],['prueba','A prueba'],['demos','Demos'],['suspendidos','Suspendidos'],['archivados','Archivados']];
  const vacio={clientes:'Aún no hay clientes que paguen. Crea un negocio o pasa a pago uno que esté a prueba.',
    prueba:'No hay negocios a prueba.', demos:'No hay demos. Crea una con "✨ Crear demo" para mostrar el sistema.',
    suspendidos:'No hay negocios suspendidos.',
    archivados:'No hay negocios archivados. "Eliminar" un cliente primero lo archiva; pasados '+Dominio.negocio.DIAS_ARCHIVO+' días se puede borrar del todo.'}[tab];
  return `
  <div class="topbar">
    <h1><span class="sa-emblema">${WALLACE_LOGO}</span>
      <span class="sa-marca">Panel de <span>Super-Admin</span></span>
      <span class="pill pill-oro">${STATE.user.rolSuper==='ayudante'?'Ayudante del sistema':'Dueño del sistema'}</span></h1>
    <div class="tb-der">
      <span class="fb-dot off" id="fb-status" title="Conexión"></span>
      <span class="reloj" id="reloj"></span>
      <details class="menu-sa">
        <summary class="btn btn-sm">⚙ Sistema${sinCifras?`<span class="punto-num">${sinCifras}</span>`:''} ▾</summary>
        <div class="menu-sa-lista">
          <button data-click="descargarRespaldo()">💾 Descargar respaldo</button>
          ${dueno?`<button data-click="elegirRespaldo()">♻️ Restaurar un negocio</button>`:''}
          ${sinCifras?`<button data-click="calcularResumenes()">📊 Calcular cifras (${sinCifras} sin calcular)</button>`:''}
          ${dueno?`<button data-click="irAdministradores()">👥 Administradores</button>`:''}
          ${dueno?`<button data-click="irHistorialSistema()">🕘 Historial</button>`:''}
          ${cuentas?`<button data-click="abrirMigracion()">🔐 Cuentas</button>`:''}
        </div>
      </details>
      <details class="menu-sa">
        <summary class="btn btn-sm">👤 ${escapeHtml(STATE.user.nombre||'Mi cuenta')} ▾</summary>
        <div class="menu-sa-lista">
          <div class="menu-sa-quien">${dueno?'Dueño del sistema':'Ayudante del sistema'}</div>
          <button data-click="cambiarMiPassSuper()">🔑 Mi contraseña</button>
          ${cuentas?`<button data-click="pasarAMiCorreo()" title="Entrar con tu correo real y poder recuperar la contraseña por correo">📧 Mi correo</button>`:''}
          <hr>
          <button data-click="logout()">${ic('logout')} Salir</button>
        </div>
      </details>
      ${dueno?`<input type="file" id="resp-archivo" accept=".json,application/json" class="oculto" data-change="cargarRespaldo(this)">`:''}
    </div>
  </div>
  <div class="contenido">
    ${bandejaPorAtender([tarjetaAvisosPago(), tarjetaRecuperaciones(), tarjetaPorVencer(), tarjetaCobros()])}
    <div class="stats">
      <div class="stat gold"><div class="stat-ico gold">${ic('box')}</div><div class="stat-lbl">Clientes activos</div><div class="stat-val">${activos}</div><div class="stat-sub">de ${reales.length} · ${conteo.prueba} a prueba</div></div>
      <div class="stat verde"><div class="stat-ico verde">${ic('cash')}</div><div class="stat-lbl">Ingreso del mes</div><div class="stat-val">${fmtMoney(ingreso)}</div><div class="stat-sub">suma de planes activos</div></div>
      <div class="stat azul"><div class="stat-ico azul">${ic('report')}</div><div class="stat-lbl">Ventas de hoy</div><div class="stat-val">${fmtMoney(ventasHoy)}</div><div class="stat-sub">todos los negocios (sin demos)</div></div>
      <div class="stat ${porAtender?'naranja':'verde'}"><div class="stat-ico ${porAtender?'naranja':'verde'}">${ic('history')}</div><div class="stat-lbl">Por atender</div><div class="stat-val">${porAtender}</div><div class="stat-sub">${porAtender?'avisos, contraseñas, pruebas y cobros':'todo al día ✓'}</div></div>
    </div>
    ${(()=>{ const sas2=DB.get('superadmins')||[];
      const porVend={};
      reales.forEach(n=>{ const k=n.vendedorId||'sin'; if(!porVend[k]) porVend[k]={n:0,mes:0,activos:0};
        porVend[k].n++; if(n.activo){ porVend[k].activos++; porVend[k].mes+=(n.precioMes||0); } });
      const filas=Object.keys(porVend);
      if(!filas.length || (filas.length<=1 && filas[0]==='sin')) return '';
      return `<div class="tarjeta">
        <span class="t-tit">${ic('users')} Cartera por vendedor</span>
        <p class="gris">Cuántos clientes atiende cada uno y cuánto factura su cartera al mes.</p>
        <div class="tabla-wrap"><table class="tabla">
          <thead><tr><th>Vendedor</th><th>Negocios</th><th>Activos</th><th>Factura al mes</th></tr></thead>
          <tbody>${filas.map(k=>{
            const v=sas2.find(x=>x.id===k);
            return `<tr>
              <td><strong>${k==='sin'?'<span class="rojo">Sin asignar</span>':escapeHtml(v?v.nombre:'(eliminado)')}</strong>${v&&v.rolSuper==='vendedor'?' <span class="pill pill-verde chico">vendedor</span>':''}</td>
              <td class="negrita">${porVend[k].n}</td>
              <td class="verde">${porVend[k].activos}</td>
              <td class="oro negrita">${fmtMoney(porVend[k].mes)}</td>
            </tr>`;}).join('')}</tbody>
        </table></div>
      </div>`; })()}
    <div class="tarjeta">
      <div class="t-cab">
        <span class="t-tit">${ic('building')} Negocios</span>
        <div class="t-acc">
          <input type="text" class="busca" placeholder="🔍 Buscar negocio, ciudad o vendedor..." value="${escapeHtml(STATE.buscaNegocio||'')}" data-input="buscarNegocios(this.value)">
          <select class="busca" data-change="filtrarVendedor(this.value)">
            <option value="">Todos los vendedores</option>
            <option value="sin" ${STATE.filtroVendedor==='sin'?'selected':''}>Sin asignar</option>
            ${sas.map(v=>`<option value="${escapeHtml(v.id)}" ${STATE.filtroVendedor===v.id?'selected':''}>${escapeHtml(v.nombre)}</option>`).join('')}
          </select>
          <select class="busca" data-change="filtrarPlan(this.value)">
            <option value="">Todos los planes</option>
            ${PLANES.map(x=>`<option value="${escapeHtml(x)}" ${STATE.filtroPlan===x?'selected':''}>${escapeHtml(x)}</option>`).join('')}
          </select>
          <select class="busca" data-change="filtrarCiudad(this.value)">
            <option value="">Todas las ciudades</option>
            ${Object.keys(ciudades).sort().map(k=>`<option value="${escapeHtml(k)}" ${STATE.filtroCiudad===k?'selected':''}>${escapeHtml(ciudades[k])}</option>`).join('')}
          </select>
          <select class="busca" data-change="ordenNegocios(this.value)">
            ${ORDENES.map(o=>`<option value="${escapeHtml(o[0])}" ${(STATE.ordenNegocios||'')===o[0]?'selected':''}>${escapeHtml(o[1])}</option>`).join('')}
          </select>
          <button class="btn btn-ghost" data-click="crearNegocioDemo()" title="Crea un negocio de ejemplo ya lleno para mostrar">✨ Crear demo</button>
          <button class="btn btn-gold" data-click="nuevoNegocio()">${ic('plus')} Crear negocio</button>
        </div>
      </div>
      <div class="cats mb-14">${TABS.map(x=>`<button class="cat ${tab===x[0]?'on':''}" data-click="verTabNegocios('${escapeHtml(x[0])}')">${x[1]} <span class="cat-num">${conteo[x[0]]}</span></button>`).join('')}</div>
      <div class="tabla-wrap"><table class="tabla tabla-cards" id="tabla-negocios">
        <thead><tr><th>Negocio</th><th>Tipo</th><th>Vendedor</th><th>Plan</th><th>Precio/mes</th><th>Estado</th><th>Acciones</th></tr></thead>
        <tbody>
        ${enTab.length? enTab.map(n=>`<tr>
          <td data-label="Negocio"><button class="link-negocio" data-click="abrirFicha('${escapeHtml(n.id)}')" title="Abrir la ficha">${escapeHtml(n.nombre)}</button>${n.esDemo?' <span class="pill pill-azul fs-9">DEMO</span>':''}${pillPrueba(n).replace('DEMO · ','')}${n.ciudad?`<br><span class="gris">${escapeHtml(n.ciudad)}</span>`:''}${(n.sucursales&&n.sucursales.length>1)?`<br><span class="gris">📍 ${n.sucursales.length} sedes</span>`:''}</td>
          <td data-label="Tipo">${escapeHtml(n.tipo)}</td>
          <td data-label="Vendedor">${n.vendedorId?escapeHtml(nombreVend(n.vendedorId)||n.vendedorNombre||'—'):'<span class="pill pill-rojo chico">Sin asignar</span>'}</td>
          <td data-label="Plan">${escapeHtml(n.plan||'—')}</td>
          <td data-label="Precio/mes">${fmtMoney(n.precioMes)}</td>
          <td data-label="Estado">${n.archivado?'<span class="pill pill-rojo">Archivado</span><br><span class="gris chico">'+escapeHtml(textoArchivo(n))+'</span>':n.activo?'<span class="pill pill-verde">Activo</span>'+(pillPago(n)?'<br>'+pillPago(n):''):'<span class="pill pill-rojo">'+(n.esDemo?'Pausada':'Suspendido')+'</span>'+(n.suspendidoDesde?'<br><span class="gris chico">desde '+escapeHtml(Dominio.fechas.diaDe(n.suspendidoDesde))+'</span>':'')+(n.motivoSuspension?'<br><span class="gris chico">'+escapeHtml(n.motivoSuspension)+'</span>':'')}</td>
          <td data-label="Acciones"><div class="acciones panel-acciones">
            <button class="btn btn-sm btn-verde" data-click="entrarComoNegocio('${escapeHtml(n.id)}')">Entrar</button>
            <details class="menu-sa en-linea">
              <summary class="btn btn-sm" title="Más acciones">⋯</summary>
              <div class="menu-sa-lista">
                <button data-click="abrirFicha('${escapeHtml(n.id)}')">📋 Abrir ficha</button>
                <button data-click="configNegocio('${escapeHtml(n.id)}')">⚙ Configurar</button>
                <button data-click="usuariosNegocio('${escapeHtml(n.id)}')">👥 Usuarios</button>
                <button data-click="reporteMensualNegocio('${escapeHtml(n.id)}')">📄 Informe mensual</button>
                <button data-click="asignarVendedor('${escapeHtml(n.id)}')">👤 Vendedor</button>
                ${n.archivado?'':`<button data-click="toggleNegocio('${escapeHtml(n.id)}')">${n.activo?(n.esDemo?'⏸ Pausar':'⏸ Suspender'):'▶ Activar'}</button>`}
                ${dueno&&n.archivado?`<button data-click="desarchivarNegocio('${escapeHtml(n.id)}')">♻ Sacar del archivo</button>`:''}
                ${dueno?`<hr><button class="peligro" data-click="eliminarNegocio('${escapeHtml(n.id)}')">${n.esDemo||n.archivado?'🗑️ Eliminar definitivamente':'🗄 Archivar (eliminar)'}</button>`:''}
              </div>
            </details>
          </div></td>
        </tr>`).join('') : `<tr><td colspan="7" class="gris">${escapeHtml(vacio)}</td></tr>`}
        </tbody>
      </table></div>
    </div>
  </div>`;
}
// U5: lo que hay que hacer hoy, en UNA bandeja (cada parte conserva sus botones)
function bandejaPorAtender(partes){
  const llenas=partes.filter(Boolean);
  if(!llenas.length) return `<p class="bandeja-vacia">✓ Todo al día: no hay avisos de pago, contraseñas, pruebas por vencer ni cobros pendientes.</p>`;
  return `<div class="tarjeta bandeja"><span class="t-tit">📋 Por atender</span>${llenas.join('')}</div>`;
}
// U6: filtros y orden de la lista (se recuerdan mientras dure la sesión)
export function filtrarPlan(v){ STATE.filtroPlan=PLANES.indexOf(v)>-1?v:''; render(); }
export function filtrarCiudad(v){ STATE.filtroCiudad=Dominio.negocio.claveCiudad(v); render(); }
export function ordenNegocios(v){ STATE.ordenNegocios=['nombre','recientes','precio','mora'].indexOf(v)>-1?v:''; render(); }
// U2: pestaña de la lista de negocios (se recuerda mientras dure la sesión)
export function verTabNegocios(t){
  if(Dominio.negocio.GRUPOS_PANEL.indexOf(t)<0) return;
  STATE.tabNegocios=t; render();
}

// ---------- Respaldo (copia de seguridad de TODO el sistema) ----------
export function descargarRespaldo(){
  if(!esAdminSistema()){ toast(MSJ.noTienesPermisoParaDescargarEl,'error'); return; }
  toast(MSJ.preparandoRespaldo,'info');
  const bajar=(data, parcial)=>{
    try{
      const respaldo={
        sistema:'Wallace System',
        fecha:new Date().toISOString(),
        parcial:!!parcial,
        datos:data
      };
      const blob=new Blob([JSON.stringify(respaldo,null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      const f=new Date();
      const nombre='respaldo-wallace-'+(parcial?'PARCIAL-':'')+f.getFullYear()+'-'
        +String(f.getMonth()+1).padStart(2,'0')+'-'
        +String(f.getDate()).padStart(2,'0')+'.json';
      a.href=url; a.download=nombre;
      document.body.appendChild(a); a.click();
      setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); },500);
      toast('Respaldo descargado: '+nombre,'success');
      anotarEnSistema(Dominio.sistema.ACCION.descargarRespaldo, null, null, null, parcial?'Parcial':'Completo');
    }catch(e){ reportarError('el respaldo', e); toast(MSJ.noSePudoGenerarElRespaldo,'error'); }
  };
  Datos.exportarTodo().then(r=>{
    // Sin la nube, la copia del equipo NO es un respaldo completo (con cuentas, el panel casi no tiene
    // datos de los negocios): se pregunta y el archivo dice PARCIAL
    if(r.origen==='local' && FB_READY){
      confirmarModal(MSJ.respaldoParcialSinNube, ()=>bajar(r.datos, true), 'Bajar parcial');
      return;
    }
    bajar(r.datos, false);
  }).catch(e=>reportarError('el respaldo', e));
}
// Baja un archivo de respaldo en el formato que "Restaurar un negocio" sabe leer. Devuelve su nombre.
export function bajarArchivoRespaldo(datos, parcial, sufijo){
  const f=new Date(), dd=x=>String(x).padStart(2,'0');
  const nombre='respaldo-wallace-'+(sufijo?sufijo+'-':'')+(parcial?'PARCIAL-':'')+f.getFullYear()+'-'+dd(f.getMonth()+1)+'-'+dd(f.getDate())+'.json';
  const blob=new Blob([JSON.stringify({sistema:'Wallace System', fecha:f.toISOString(), parcial:!!parcial, datos}, null, 2)], {type:'application/json'});
  const url=URL.createObjectURL(blob), a=document.createElement('a');
  a.href=url; a.download=nombre;
  document.body.appendChild(a); a.click();
  setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); }, 500);
  return nombre;
}
// ---------- Restaurar UN negocio desde un respaldo (solo el dueño del sistema) ----------
export function elegirRespaldo(){
  if(!(STATE.user && STATE.user.rolSuper==='dueno' && esAdminSistema())){ toast(MSJ.soloElDuenoDelSistemaRestaura,'error'); return; }
  const e=document.getElementById('resp-archivo'); if(e){ e.value=''; e.click(); }
}
export function cargarRespaldo(input){
  const f=input && input.files && input.files[0]; if(!f) return;
  const lector=new FileReader();
  lector.onload=()=>{
    let r=null; try{ r=JSON.parse(lector.result); }catch(e){}
    if(!r || r.sistema!=='Wallace System' || !r.datos){ toast(MSJ.esteArchivoNoEsUnRespaldo,'error'); return; }
    elegirNegocioARestaurar(r);
  };
  lector.readAsText(f);
}
export function negociosDelRespaldo(datos){
  const l=datos.negocios_r ? Object.values(datos.negocios_r) : (Array.isArray(datos.negocios)?datos.negocios:Object.values(datos.negocios||{}));
  return l.filter(n=>n && n.id);
}
export function elegirNegocioARestaurar(r){
  const negs=negociosDelRespaldo(r.datos);
  if(!negs.length){ toast(MSJ.elRespaldoNoTieneNegocios,'error'); return; }
  abrirModal({titulo:'♻️ Restaurar un negocio', textoBoton:BOTON.restaurar, campos:[
    {id:'neg', label:'Negocio', tipo:'select', opciones:negs.map(n=>({valor:n.id, label:n.nombre||n.id}))},
    {id:'confirma', label:'Escribe el nombre del negocio para confirmar', requerido:true}
  ], extraHTML:`<p class="nota">Respaldo del <strong>${escapeHtml(fmtDate(r.fecha))}</strong>${r.parcial?' · <span class="rojo">PARCIAL</span>':''}. Se <strong>reemplazan</strong> los datos de ese negocio (ventas, caja, inventario, clientes…) por los del respaldo; lo que se hizo después se pierde. Las cuentas de acceso no se tocan. Descarga un respaldo actual antes, por si acaso.</p>`,
  onGuardar:d=>{
    const n=negs.find(x=>x.id===d.neg); if(!n) return;
    if((d.confirma||'').trim()!==(n.nombre||n.id)){ toast(MSJ.elNombreNoCoincide,'error'); return; }
    restaurarNegocioDesde(r.datos, n.id).then(ok=>{ if(ok) cerrarModal(); });
  }});
}
export function restaurarNegocioDesde(datos, negId){
  return Datos.restaurarNegocio(negId, datos).then(res=>{
    toast('Negocio restaurado ('+res.claves+' tablas)','success');
    anotarEnSistema(Dominio.sistema.ACCION.restaurarNegocio, (DB.get('negocios')||[]).find(n=>n.id===negId)||{id:negId}, null, null, res.claves+' tablas');
    render(); return true;
  }).catch(e=>{ reportarError('restaurar el negocio', e); toast(MSJ.noSePudoRestaurar,'error'); return false; });
}
export function irPanel(){ STATE.page=''; render(); }
export function buscarNegocios(v){ STATE.buscaNegocio=v; render(); }
export function filtrarVendedor(v){ STATE.filtroVendedor=v; render(); }
