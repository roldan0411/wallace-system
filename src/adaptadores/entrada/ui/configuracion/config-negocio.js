// ============================================================
//  INTERFAZ · Configuración del negocio (super-admin)
//  Pestañas de configuración, plan, ventanas y sucursales.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/11-business-settings/11-business-settings.md
// ============================================================
import { STATE, escapeHtml, fmtDate, fmtMoney } from '../nucleo/estado.js';
import { BOTON, MSJ } from '../nucleo/textos.js';
import { esAdminSistema } from '../nucleo/permisos.js';
import { abrirModal, cerrarModal, confirmarModal, ic, logoNegocio, preguntarDespues, toast } from '../nucleo/componentes.js';
import { render } from '../nucleo/navegacion.js';
import { resumenDe } from '../reportes/resumen.js';
import { anotarEnSistema } from '../super-admin/historial-sistema.js';


// ============================================================
//  CONFIGURACIÓN DEL NEGOCIO (super-admin)
// ============================================================
export function configNegocio(id){
  if(!esAdminSistema()){ toast(MSJ.noTienesPermisoParaConfigurarNegocios,'error'); return; }
  window._logoNuevo=undefined; STATE.page='config:'+id; render();
}
export function usuariosNegocio(id){
  if(!esAdminSistema()){ toast(MSJ.noTienesPermisoParaGestionarUsuarios,'error'); return; }
  STATE.page='usuarios:'+id; render();
}

export let _cfgTab='datos';
export function cfgTab(t){ _cfgTab=t; render(); }
export function pantallaConfig(negId){
  const neg=(DB.get('negocios')||[]).find(n=>n.id===negId);
  if(!neg) return '<div class="tarjeta">Negocio no encontrado</div>';
  const F=neg.funciones||[];
  const vendedores=(DB.get('superadmins')||[]);
  const nUsuarios=(DB.get('usuarios')||[]).filter(u=>u.negocioId===negId).length;
  const dias=neg.creado?Math.floor((Date.now()-new Date(neg.creado).getTime())/86400000):null;
  const tabs=[['datos','Datos del negocio'],['comercial','Plan y vendedor'],['operacion','Cómo opera'],
              ['ventanas','Ventanas habilitadas'],['sucursales','Sucursales']];
  const t=_cfgTab;
  // --- Todas las ventanas del sistema, en UN SOLO lugar ---
  const GRUPOS=[
    ['Ventas y pedidos',[['ventas','Nueva Venta'],['facturas','Facturas e impresión']]],
    ['Catálogo e inventario',[['catalogo','Menú / Inventario / Combos'],['inventario','Control de stock y conteos']]],
    ['Dinero',[['caja','Caja'],['contable','Registro Contable'],['gastosneg','Gastos del Negocio']]],
    ['Operación',[['cocina','Pantalla de Cocina (KDS)'],['domicilios','Domicilios y cuadre'],['citas','Agenda de citas']]],
    ['Clientes y reportes',[['clientes','Clientes'],['reportes','Reportes']]]
  ];
  const sec=(titulo,cuerpo)=>`<div class="tarjeta"><span class="t-tit">${titulo}</span>${cuerpo}</div>`;
  let cuerpo='';
  if(t==='datos'){
    cuerpo=sec('Identificación', `
      <p class="nota">Estos datos salen en el encabezado de todas las facturas.</p>
      <div class="form2">
        <div class="m-row"><label>Nombre del negocio</label><input id="c-nombre" class="campo" value="${escapeHtml(neg.nombre)}"></div>
        <div class="m-row"><label>Tipo</label><select id="c-tipo" class="campo">${Object.keys(PERFILES).map(x=>`<option ${neg.tipo===x?'selected':''}>${x}</option>`).join('')}</select></div>
        <div class="m-row"><label>NIT / Cédula</label><input id="c-nit" class="campo" value="${escapeHtml(neg.nit||'')}"></div>
        <div class="m-row"><label>Teléfono</label><input id="c-tel" class="campo" value="${escapeHtml(neg.tel||'')}"></div>
        <div class="m-row"><label>Dirección</label><input id="c-dir" class="campo" value="${escapeHtml(neg.dir||'')}"></div>
        <div class="m-row"><label>Ciudad</label><input id="c-ciudad" class="campo" value="${escapeHtml(neg.ciudad||'')}"></div>
        <div class="m-row"><label>Eslogan (opcional)</label><input id="c-eslogan" class="campo" value="${escapeHtml(neg.eslogan||'')}"></div>
      </div>`)
    + sec(ic('box')+' Logo y apariencia', `
      <div class="logo-zona">
        <div class="logo-vista" id="logo-vista">${logoNegocio(neg,'alt="logo"')||`<div class="logo-vacio">Sin logo</div>`}</div>
        <div class="logo-acc">
          <input type="file" id="n-logo" accept="image/*" data-change="cargarLogo(this)" class="oculto">
          <button class="btn btn-gold" data-click="elegirLogo()">Subir logo</button>
          ${neg.logo?`<button class="btn btn-rojo btn-sm" data-click="quitarLogo()">Quitar</button>`:''}
          <p class="nota">Sale en el menú lateral y en las facturas.</p>
        </div>
      </div>
      <div class="form2 mt-14">
        <div class="m-row"><label>Tema</label><select id="c-tema" class="campo">
          <option value="oscuro" ${neg.tema!=='claro'?'selected':''}>Oscuro neón</option>
          <option value="claro" ${neg.tema==='claro'?'selected':''}>Claro / fondo blanco</option></select></div>
        <div class="m-row"><label>Color principal</label><input id="c-color" type="color" class="campo h-46 p-5 cursor-mano" value="${escapeHtml(/^#[0-9a-fA-F]{6}$/.test(neg.colorTema||'')?neg.colorTema:'#01c38e')}"></div>
        <div class="m-row"><label>Tamaño de factura</label><select id="c-fact" class="campo">
          <option value="pos" ${neg.tipoFactura==='pos'?'selected':''}>Tirilla POS (80mm)</option>
          <option value="media" ${neg.tipoFactura==='media'?'selected':''}>Media hoja</option>
          <option value="carta" ${neg.tipoFactura==='carta'?'selected':''}>Hoja completa</option></select></div>
        <div class="m-row"><label>Recargo del datáfono (%)</label><input id="c-pct" type="number" step="0.1" class="campo" value="${escapeHtml(neg.pctDatafono||0)}"></div>
      </div>`);
  }
  else if(t==='comercial'){
    cuerpo=sec('💼 Plan y cobro', `
      <div class="form2">
        <div class="m-row"><label>Plan</label><select id="c-plan" class="campo">${PLANES.map(x=>`<option ${(planDe(neg)===x)?'selected':''}>${x}</option>`).join('')}</select></div>
        <div class="m-row"><label>Precio mensual</label><input id="c-precio" type="number" class="campo" value="${escapeHtml(neg.precioMes||0)}"></div>
        <div class="m-row"><label>Día de pago del mes</label><input id="c-diapago" type="number" min="1" max="31" class="campo" value="${escapeHtml(neg.diaPago||'')}" placeholder="Ej: 5"></div>
        <div class="m-row"><label>Estado</label><div class="campo d-flex items-centro">${neg.activo?'<span class="pill pill-verde">Activo</span>':'<span class="pill pill-rojo">Suspendido</span>'}</div></div>
      </div>`)
    + sec(ic('users')+' Vendedor a cargo', `
      <p class="nota">Quién vendió este negocio y lo atiende. Sirve para saber a quién le corresponde cada cliente.</p>
      <div class="form2">
        <div class="m-row"><label>Vendedor asignado</label><select id="c-vendedor" class="campo">
          <option value="">— Sin asignar —</option>
          ${vendedores.map(v=>`<option value="${escapeHtml(v.id)}" ${neg.vendedorId===v.id?'selected':''}>${escapeHtml(v.nombre)}${v.rolSuper==='vendedor'?' (vendedor)':''}</option>`).join('')}
        </select></div>
        <div class="m-row"><label>Notas comerciales</label><input id="c-notas" class="campo" value="${escapeHtml(neg.notasComerciales||'')}" placeholder="Ej: referido por Portal Imperial"></div>
      </div>`)
    + sec(ic('history')+' Historia del cliente', `
      <div class="linea"><span>Fecha de creación</span><strong>${neg.creado?fmtDate(neg.creado):'—'}</strong></div>
      <div class="linea"><span>Antigüedad</span><strong>${dias!==null?(dias>=30?Math.floor(dias/30)+' mes(es) · '+dias+' días':dias+' días'):'—'}</strong></div>
      <div class="linea"><span>Usuarios creados</span><strong>${nUsuarios}</strong></div>
      <div class="linea"><span>Ventas registradas</span><strong>${(r=>r?r.pagadas:'—')(resumenDe(negId))}</strong></div>
      <div class="linea total-linea"><span>Facturado desde que entró</span><strong>${fmtMoney((neg.precioMes||0)*Math.max(1,Math.ceil((dias||0)/30)))}</strong></div>
      <div class="botones-fila mt-14">
        <button class="btn btn-gold" data-click="reporteMensualNegocio('${escapeHtml(negId)}')">📄 Reporte mensual en PDF</button>
      </div>`);
  }
  else if(t==='operacion'){
    const entregas=[['mesa','Mesa'],['llevar','Para llevar'],['domicilio','Domicilio'],['envio','Envío nacional']];
    cuerpo=sec('Cómo cobra', `
      <div class="m-row"><label>Flujo de cobro</label><select id="c-flujo" class="campo">
        <option value="directo" ${neg.flujoPedido!=='dos_pasos'?'selected':''}>Cobro directo — se cobra al instante (tiendas)</option>
        <option value="dos_pasos" ${neg.flujoPedido==='dos_pasos'?'selected':''}>Confirmar y luego cobrar (restaurantes)</option>
      </select></div>
      <div class="m-row"><label>Al editar un pedido ya cobrado</label><select id="c-ajustecobro" class="campo">
        <option value="diferencia" ${(neg.ajusteCobro!=='total')?'selected':''}>Cobrar solo la diferencia</option>
        <option value="total" ${(neg.ajusteCobro==='total')?'selected':''}>Cobrar el total nuevo completo</option>
      </select></div>
      <div class="m-row"><label>Tipos de entrega</label>
        <div class="checks">${entregas.map(e=>`<label class="chk"><input type="checkbox" class="c-ent" value="${escapeHtml(e[0])}" ${(neg.tiposEntrega||[]).indexOf(e[0])>-1?'checked':''}> ${e[1]}</label>`).join('')}</div></div>`)
    + sec('Funcionamiento del negocio', `
      <div class="checks">
        <label class="chk"><input type="checkbox" id="c-mesas" ${neg.usaMesas?'checked':''}> Usa mesas</label>
        <label class="chk"><input type="checkbox" id="c-cocina" ${neg.usaCocina?'checked':''}> Usa cocina (KDS)</label>
        <label class="chk"><input type="checkbox" id="c-recetas" ${neg.usaRecetas?'checked':''}> Usa recetas (descuenta insumos)</label>
        <label class="chk"><input type="checkbox" id="c-citas" ${neg.usaCitas?'checked':''}> Usa agenda de citas</label>
        <label class="chk"><input type="checkbox" id="c-cuentas" ${neg.usaCuentas?'checked':''}> Cuentas abiertas</label>
        <label class="chk"><input type="checkbox" id="c-descontarpedir" ${(neg.descontarAlPedir!==undefined?neg.descontarAlPedir:(neg.usaCuentas||neg.flujoPedido==='dos_pasos'))?'checked':''}> Descontar inventario al pedir</label>
        <label class="chk"><input type="checkbox" id="c-propina" ${(neg.usaPropina!==undefined?neg.usaPropina:neg.usaCocina)?'checked':''}> Cobra propina</label>
        <label class="chk"><input type="checkbox" id="c-domis" ${(neg.usaDomicilios!==undefined?neg.usaDomicilios:(neg.tiposEntrega||[]).indexOf('domicilio')>-1)?'checked':''}> Maneja domicilios</label>
        <label class="chk"><input type="checkbox" id="c-logistica" ${neg.esLogistica?'checked':''}> Modo logística (sin dinero)</label>
        <label class="chk"><input type="checkbox" id="c-clientefijo" ${neg.usaClienteFijo?'checked':''}> Venta rápida (cliente predeterminado)</label>
        <label class="chk"><input type="checkbox" id="c-barras" ${neg.usaCodBarras?'checked':''}> Lector de código de barras</label>
        <label class="chk"><input type="checkbox" id="c-verificarbanco" ${neg.verificarBanco?'checked':''}> Exigir verificar transferencias</label>
        <label class="chk"><input type="checkbox" id="c-sonidos" ${neg.sonidos!==false?'checked':''}> Sonidos</label>
        <label class="chk"><input type="checkbox" id="c-alerta" ${neg.alertaStock!==false?'checked':''}> Avisar stock bajo</label>
      </div>
      <div class="form2 mt-14">
        <div class="m-row"><label>Cliente predeterminado</label><input id="c-cfnom" class="campo" value="${escapeHtml(neg.clienteFijoNombre||'Consumidor Final')}"></div>
        <div class="m-row"><label>Teléfono predeterminado</label><input id="c-cftel" class="campo" value="${escapeHtml(neg.clienteFijoTel||'0000000')}"></div>
      </div>`)
    + sec('Vocabulario', `
      <p class="nota">Cómo llama este negocio a las cosas. Cambia los textos de todo el sistema.</p>
      <div class="form2">
        <div class="m-row"><label>Producto (singular)</label><input id="c-pal1" class="campo" value="${escapeHtml(neg.palabraProducto||'Producto')}"></div>
        <div class="m-row"><label>Productos (plural)</label><input id="c-pal2" class="campo" value="${escapeHtml(neg.palabraProductos||'Productos')}"></div>
        <div class="m-row"><label>Pedido / venta</label><input id="c-palped" class="campo" value="${escapeHtml(neg.palabraPedido||'Pedido')}"></div>
        <div class="m-row"><label>Personal</label><input id="c-palpers" class="campo" value="${escapeHtml(neg.palabraPersonal||'Personal')}"></div>
      </div>`);
  }
  else if(t==='ventanas'){
    cuerpo=sec('🪟 Ventanas habilitadas para este negocio', `
      <p class="nota">Todo lo que el negocio puede ver está aquí, en un solo lugar. Lo que desmarque no le aparece a nadie, ni al administrador del negocio. Los permisos de cada empleado se manejan aparte, dentro del negocio.</p>
      ${GRUPOS.map(g=>`<div class="mt-16">
        <div class="cc-sec"><span>${g[0]}</span><span>${g[1].filter(x=>F.indexOf(x[0])>-1).length}/${g[1].length}</span></div>
        <div class="checks">${g[1].map(x=>`<label class="chk"><input type="checkbox" class="c-fun" value="${escapeHtml(x[0])}" ${F.indexOf(x[0])>-1?'checked':''}> ${x[1]}</label>`).join('')}</div>
      </div>`).join('')}
      <div class="botones-fila mt-16">
        <button class="btn btn-sm" data-click="marcarVentanas(true)">Marcar todo</button>
        <button class="btn btn-sm btn-ghost" data-click="marcarVentanas(false)">Quitar todo</button>
        <button class="btn btn-sm btn-ghost" data-click="aplicarPlantillaPlan('${escapeHtml(neg.id)}')">Aplicar lo del plan ${escapeHtml(planDe(neg))}</button>
      </div>`);
  }
  else {
    cuerpo=sec('📍 Sucursales', `
      <p class="nota">Cada sucursal maneja su <strong>caja, base, pedidos y cierres</strong> por separado. Inventario, clientes, numeración de facturas, reportes y contabilidad son de todo el negocio.</p>
      ${(neg.sucursales||[]).length?(neg.sucursales||[]).map((x,i)=>`<div class="suc-fila">
        <input type="text" class="campo c-suc" value="${escapeHtml(x.nombre)}" placeholder="Nombre">
        <button class="btn btn-sm btn-rojo" data-click="quitarSucursal('${escapeHtml(negId)}',${escapeHtml(i)})">×</button>
      </div>`).join(''):'<p class="gris chico">Sin sucursales: funciona como un solo punto de venta.</p>'}
      <button class="btn btn-sm" data-click="agregarSucursal('${escapeHtml(negId)}')">+ Agregar sucursal</button>`);
  }
  return `
  <div class="topbar">
    <h1>${ic('cog')} ${escapeHtml(neg.nombre)}</h1>
    <div class="tb-der">
      <span class="pill ${neg.activo?'pill-verde':'pill-rojo'}">${neg.activo?'Activo':'Suspendido'}</span>
      <span class="pill pill-gold">${escapeHtml(neg.plan||'Sin plan')}</span>
      <button class="btn btn-ghost btn-sm" data-click="irPanel()">← Volver</button>
    </div>
  </div>
  <div class="contenido">
    <div class="cats mb-18">
      ${tabs.map(x=>`<button class="cat ${t===x[0]?'on':''}" data-click="cfgTab('${escapeHtml(x[0])}')">${x[1]}</button>`).join('')}
    </div>
    ${cuerpo}
    <div class="tarjeta">
      <button class="btn btn-gold btn-block btn-grande" data-click="guardarConfig('${escapeHtml(negId)}')">Guardar configuración</button>
      <p class="nota centrado mt-10">Se guarda todo lo de esta pestaña. Las demás conservan lo que ya tenían.</p>
    </div>
  </div>`;
}
// Deja marcadas las ventanas que corresponden al plan del negocio (VENTANAS_POR_PLAN: dominio/negocio.js)
// P8: el plan guardado del negocio (antes leía un select que no existe en esta pestaña y siempre era Profesional)
export function aplicarPlantillaPlan(negId){
  const plan=planDe((DB.get('negocios')||[]).find(n=>n.id===negId));
  const lista=VENTANAS_POR_PLAN[plan];
  document.querySelectorAll('.c-fun').forEach(c=>{ c.checked = lista.indexOf(c.value)>-1; });
  toast('Marcadas las ventanas del plan '+plan,'info');
}

export function guardarConfig(negId){
  if(!esAdminSistema()){ toast(MSJ.noTienesPermisoParaConfigurarNegocios,'error'); return; }
  const negocios=JSON.parse(JSON.stringify(DB.get('negocios')||[]));
  const i=negocios.findIndex(n=>n.id===negId);
  if(i<0){ toast(MSJ.negocioNoEncontrado,'error'); return; }
  const n=negocios[i];
  const planAntes=planDe(n), antesNeg=JSON.parse(JSON.stringify(n));
  // Solo se guarda lo que existe en la pestaña abierta: así una pestaña no
  // borra lo configurado en otra.
  const hay=id=>!!document.getElementById(id);
  const val=id=>{ const e=document.getElementById(id); return e?e.value:''; };
  const chk=id=>{ const e=document.getElementById(id); return e?e.checked:false; };
  if(hay('c-nombre')){
    n.nombre=val('c-nombre').trim()||n.nombre;
    n.tipo=val('c-tipo'); n.nit=val('c-nit').trim(); n.tel=val('c-tel').trim();
    n.dir=val('c-dir').trim(); n.ciudad=val('c-ciudad').trim(); n.eslogan=val('c-eslogan').trim();
    n.tema=val('c-tema')||'oscuro';
    const col=val('c-color'); n.colorTema=/^#[0-9a-fA-F]{6}$/.test(col)?col:'#01c38e';
    n.tipoFactura=val('c-fact'); n.pctDatafono=parseFloat(val('c-pct'))||0;
    if(!Dominio.pagos.porcentajeValido(n.pctDatafono)){ toast(MSJ.elPorcentajeDebeEstarEntre0Y100,'error'); return; }   // V3
    if(window._logoNuevo!==undefined){ if(window._logoNuevo==='' || Dominio.negocio.logoValido(window._logoNuevo)) n.logo=window._logoNuevo; window._logoNuevo=undefined; }
  }
  if(hay('c-plan')){
    n.plan=planDe({plan:val('c-plan')}); n.precioMes=Math.max(0, parseInt(val('c-precio'))||0);
    const dp=parseInt(val('c-diapago')); n.diaPago=isNaN(dp)?null:Math.min(31,Math.max(1,dp));
    n.vendedorId=val('c-vendedor')||null;
    const v=(DB.get('superadmins')||[]).find(x=>x.id===n.vendedorId);
    n.vendedorNombre=v?v.nombre:'';
    n.notasComerciales=val('c-notas').trim();
  }
  if(hay('c-flujo')){
    n.flujoPedido=val('c-flujo');
    n.ajusteCobro=val('c-ajustecobro')==='total'?'total':'diferencia';
    n.tiposEntrega=Array.prototype.slice.call(document.querySelectorAll('.c-ent:checked')).map(c=>c.value);
    if(!n.tiposEntrega.length) n.tiposEntrega=['llevar'];
    n.usaMesas=chk('c-mesas'); n.usaCocina=chk('c-cocina'); n.usaRecetas=chk('c-recetas');
    n.usaCitas=chk('c-citas'); n.usaCuentas=chk('c-cuentas'); n.descontarAlPedir=chk('c-descontarpedir');
    n.usaPropina=chk('c-propina'); n.usaDomicilios=chk('c-domis'); n.esLogistica=chk('c-logistica');
    n.usaClienteFijo=chk('c-clientefijo'); n.usaCodBarras=chk('c-barras');
    n.verificarBanco=chk('c-verificarbanco'); n.sonidos=chk('c-sonidos'); n.alertaStock=chk('c-alerta');
    n.clienteFijoNombre=val('c-cfnom').trim()||'Consumidor Final';
    n.clienteFijoTel=val('c-cftel').trim()||'0000000';
    n.palabraProducto=val('c-pal1').trim()||'Producto';
    n.palabraProductos=val('c-pal2').trim()||'Productos';
    n.palabraPedido=val('c-palped').trim()||'Pedido';
    n.palabraPersonal=val('c-palpers').trim()||'Personal';
  }
  if(document.querySelectorAll('.c-fun').length){
    n.funciones=Array.prototype.slice.call(document.querySelectorAll('.c-fun:checked')).map(c=>c.value);
  }
  const sucs=Array.prototype.slice.call(document.querySelectorAll('.c-suc'));
  if(sucs.length && n.sucursales){
    sucs.forEach((inp,x)=>{ if(n.sucursales[x]) n.sucursales[x].nombre=inp.value.trim()||n.sucursales[x].nombre; });
  }
  negocios[i]=n;
  DB.set('negocios',negocios);
  if(STATE.negocio && STATE.negocio.id===negId) STATE.negocio=JSON.parse(JSON.stringify(n));
  if(Object.keys(Dominio.sistema.cambios(antesNeg, n)).length) anotarEnSistema(Dominio.sistema.ACCION.editarNegocio, n, antesNeg, n);
  toast(MSJ.configuracionGuardada,'success');
  render();
  // P8: cambiar el plan no cambia las ventanas solo; se pregunta (puede haber ajustes a mano)
  if(n.plan!==planAntes) preguntarDespues('¿Aplicar las ventanas del plan '+n.plan+'? Se reemplazan las ventanas habilitadas de este negocio.', ()=>aplicarVentanasDelPlan(negId), BOTON.aplicar);
}
export function aplicarVentanasDelPlan(negId){
  if(!esAdminSistema()){ toast(MSJ.noTienesPermisoParaConfigurarNegocios,'error'); return; }
  const negocios=JSON.parse(JSON.stringify(DB.get('negocios')||[]));
  const n=negocios.find(x=>x.id===negId); if(!n) return;
  const antes=n.funciones;
  n.funciones=VENTANAS_POR_PLAN[planDe(n)].slice();
  DB.set('negocios',negocios);
  anotarEnSistema(Dominio.sistema.ACCION.aplicarPlan, n, {funciones:antes}, {funciones:n.funciones}, n.plan);
  if(STATE.negocio && STATE.negocio.id===negId) STATE.negocio=JSON.parse(JSON.stringify(n));
  toast('Ventanas del plan '+n.plan+' aplicadas','success'); render();
}

export function agregarSucursal(negId){
  if(!esAdminSistema()){ toast(MSJ.noTienesPermisoParaCrearSucursales,'error'); return; }
  abrirModal({titulo:'Nueva sucursal', textoBoton:BOTON.agregar, campos:[
    {id:'nombre', label:'Nombre de la sede', requerido:true, placeholder:'Ej: Sede Cabecera'}
  ], onGuardar:(d)=>{
    const negocios=JSON.parse(JSON.stringify(DB.get('negocios')||[]));
    const i=negocios.findIndex(n=>n.id===negId); if(i<0) return;
    if(!negocios[i].sucursales) negocios[i].sucursales=[];
    if(!negocios[i].sucursales.length){
      negocios[i].sucursales.push({id:'principal', nombre:'Principal'});
    }
    negocios[i].sucursales.push({id:uid(), nombre:d.nombre});
    DB.set('negocios',negocios);
    anotarEnSistema(Dominio.sistema.ACCION.agregarSucursal, negocios[i], null, null, d.nombre);
    cerrarModal(); toast(MSJ.sucursalAgregada,'success'); render();
  }});
}
export async function quitarSucursal(negId,idx){
  if(!esAdminSistema()){ toast(MSJ.noTienesPermisoParaQuitarSucursales,'error'); return; }
  const negocios=JSON.parse(JSON.stringify(DB.get('negocios')||[]));
  const i=negocios.findIndex(n=>n.id===negId); if(i<0) return;
  const s=(negocios[i].sucursales||[])[idx]; if(!s) return;
  // F1: una sede con caja abierta no se quita (esa caja quedaría sin cerrar e inaccesible)
  try{ if(FB_READY) await Datos.leerNegocioCompleto(negId); }catch(e){}
  // Si quedan 0 o 1 sedes, el negocio vuelve a una sola caja: ninguna otra sede puede tener caja abierta
  const conCaja=Dominio.caja.sucursalesConCaja(DB.get(claveDe(negId,'caja_actual')));
  const quedaUna=negocios[i].sucursales.length-1<=1;
  const bloquea=conCaja.filter(id=>id===s.id || (quedaUna && id!=='principal'));
  if(bloquea.length){
    toast('Hay una caja abierta en '+(bloquea.indexOf(s.id)>-1?'la sucursal "'+s.nombre+'"':'otra sucursal')+'. Ciérrenla antes de quitar la sede.','error'); return;
  }
  confirmarModal('¿Quitar la sucursal "'+s.nombre+'"?',()=>{
    negocios[i].sucursales.splice(idx,1);
    if(negocios[i].sucursales.length<=1) negocios[i].sucursales=[];
    DB.set('negocios',negocios);
    anotarEnSistema(Dominio.sistema.ACCION.quitarSucursal, negocios[i], null, null, s.nombre);
    toast(MSJ.sucursalQuitada,'info'); render();
  },'Quitar');
}
export function marcarVentanas(todas){ document.querySelectorAll('.c-fun').forEach(c=>{ c.checked=!!todas; }); }
