/* ============================================================
   POS UNIVERSAL — Sistema multi-negocio (SaaS)
   WALLACE COMPANY SYSTEM — Ing. Roldán Aldana
   wallacecompany11@gmail.com

   FASE 1: Base multi-negocio + panel de super-admin
   ============================================================ */

// ---------- Almacenamiento híbrido: localStorage + Firebase (nube) ----------
// Escribe siempre en local (rápido) y, si Firebase está configurado, también en la nube.
// Al arrancar carga de la nube para sincronizar entre dispositivos.
let FB = null; // referencia a Firebase Realtime Database si está disponible
const CACHE = {}; // espejo en memoria

const DB = {
  get(k){
    if(CACHE[k]!==undefined) return CACHE[k];
    try{ const v=localStorage.getItem('posu_'+k); const val=v?JSON.parse(v):null; CACHE[k]=val; return val; }catch(e){ return null; }
  },
  set(k,val){
    CACHE[k]=val;
    try{ localStorage.setItem('posu_'+k, JSON.stringify(val)); }catch(e){}
    // Sincronizar a la nube si Firebase está activo
    if(FB){ try{ FB.ref('posu/'+k).set(val); }catch(e){} }
  },
};

// Inicializa Firebase si hay configuración válida
function initFirebase(){
  try{
    const cfg=window.FIREBASE_CONFIG;
    if(!cfg || !cfg.databaseURL || cfg.apiKey==='TU_API_KEY') return false;
    if(typeof firebase==='undefined' || !firebase.initializeApp) return false;
    firebase.initializeApp(cfg);
    FB=firebase.database();
    return true;
  }catch(e){ console.warn('Firebase no disponible, usando modo local.',e); FB=null; return false; }
}
// Carga inicial desde la nube (sincroniza todos los datos)
function cargarDeLaNube(callback){
  if(!FB){ callback(); return; }
  FB.ref('posu').once('value').then(snap=>{
    const data=snap.val()||{};
    Object.keys(data).forEach(k=>{ CACHE[k]=data[k]; try{ localStorage.setItem('posu_'+k, JSON.stringify(data[k])); }catch(e){} });
    callback();
  }).catch(()=>callback());
}

function uid(){ return 'id'+Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function now(){ return new Date().toISOString(); }
function fmtMoney(n){ return '$ '+(n||0).toLocaleString('es-CO'); }
function fmtDate(iso){ if(!iso) return ''; const d=new Date(iso); return d.toLocaleDateString('es-CO')+' '+d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}); }
function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function toast(msg,tipo){ const t=document.getElementById('toast'); if(!t) return; t.textContent=msg; t.className='toast show '+(tipo||'info'); setTimeout(()=>t.className='toast',2600); }

// ============================================================
//  SISTEMA DE MODALES ELEGANTES (reemplaza los prompt feos)
// ============================================================
// abrirModal({titulo, campos:[{id,label,tipo,valor,opciones,placeholder,requerido}], onGuardar, textoBoton})
// tipos de campo: text, number, tel, date, time, select, textarea
function abrirModal(cfg){
  const cont=document.getElementById('modal-container');
  if(!cont) return;
  const campos=(cfg.campos||[]).map(c=>{
    const val=c.valor!=null?String(c.valor):'';
    if(c.tipo==='select'){
      return `<div class="m-row"><label>${escapeHtml(c.label)}</label>
        <select id="m-${c.id}">${(c.opciones||[]).map(o=>{const ov=typeof o==='object'?o.valor:o; const ol=typeof o==='object'?o.label:o; return `<option value="${escapeHtml(String(ov))}" ${String(ov)===val?'selected':''}>${escapeHtml(ol)}</option>`;}).join('')}</select></div>`;
    }
    if(c.tipo==='textarea'){
      return `<div class="m-row"><label>${escapeHtml(c.label)}</label><textarea id="m-${c.id}" placeholder="${escapeHtml(c.placeholder||'')}" rows="3">${escapeHtml(val)}</textarea></div>`;
    }
    return `<div class="m-row"><label>${escapeHtml(c.label)}${c.requerido?' *':''}</label><input id="m-${c.id}" type="${c.tipo||'text'}" value="${escapeHtml(val)}" placeholder="${escapeHtml(c.placeholder||'')}" ${c.tipo==='number'?'inputmode="numeric"':''}></div>`;
  }).join('');
  cont.innerHTML=`
    <div class="modal-back" onclick="if(event.target===this)cerrarModal()">
      <div class="modal-box">
        <div class="modal-head"><span>${escapeHtml(cfg.titulo||'')}</span><button class="modal-x" onclick="cerrarModal()">×</button></div>
        <div class="modal-body">${campos}${cfg.extraHTML||''}</div>
        <div class="modal-foot">
          <button class="btn btn-ghost" onclick="cerrarModal()">Cancelar</button>
          <button class="btn btn-gold" id="modal-guardar">${escapeHtml(cfg.textoBoton||'Guardar')}</button>
        </div>
      </div>
    </div>`;
  cont.classList.add('activo');
  // Guardar recoge los valores y llama onGuardar
  document.getElementById('modal-guardar').onclick=()=>{
    const datos={};
    (cfg.campos||[]).forEach(c=>{ const el=document.getElementById('m-'+c.id); datos[c.id]=el?el.value.trim():''; });
    // Validar requeridos
    const falta=(cfg.campos||[]).find(c=>c.requerido && !datos[c.id]);
    if(falta){ toast('Falta: '+falta.label,'error'); return; }
    cfg.onGuardar(datos);
  };
  // Foco al primer campo
  setTimeout(()=>{ const f=cont.querySelector('input,select,textarea'); if(f)f.focus(); },50);
}
function cerrarModal(){ const c=document.getElementById('modal-container'); if(c){ c.classList.remove('activo'); c.innerHTML=''; } }
// Confirmación elegante (reemplaza confirm feo)
function confirmarModal(mensaje, onSi, textoBoton){
  const cont=document.getElementById('modal-container'); if(!cont) return;
  cont.innerHTML=`
    <div class="modal-back" onclick="if(event.target===this)cerrarModal()">
      <div class="modal-box modal-sm">
        <div class="modal-body" style="padding-top:24px;"><p style="font-size:15px;line-height:1.5;">${escapeHtml(mensaje)}</p></div>
        <div class="modal-foot">
          <button class="btn btn-ghost" onclick="cerrarModal()">Cancelar</button>
          <button class="btn btn-danger" id="modal-si">${escapeHtml(textoBoton||'Confirmar')}</button>
        </div>
      </div>
    </div>`;
  cont.classList.add('activo');
  document.getElementById('modal-si').onclick=()=>{ cerrarModal(); onSi(); };
}

// ---------- Iconos SVG (línea, estilo premium) ----------
const ICONS={
  dashboard:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>',
  cart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>',
  menu:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
  cash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="3"/></svg>',
  box:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>',
  report:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
  chef:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6z"/><line x1="6" y1="17" x2="18" y2="17"/></svg>',
  scissors:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>',
  users:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>',
  cog:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  truck:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
  clock:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  shield:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  logout:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  building:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="9" y1="9" x2="9" y2="9"/><line x1="15" y1="9" x2="15" y2="9"/><line x1="9" y1="13" x2="9" y2="13"/><line x1="15" y1="13" x2="15" y2="13"/><line x1="10" y1="21" x2="14" y2="21"/></svg>',
  history:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><polyline points="12 7 12 12 15 15"/></svg>',
};
function ic(name){ return ICONS[name]||''; }

// ---------- Catálogo de funciones que se pueden activar por negocio ----------
const FUNCIONES = [
  {id:'ventas',    label:'Punto de venta / Nueva Venta'},
  {id:'menu',      label:'Gestión de catálogo (productos/servicios)'},
  {id:'caja',      label:'Caja: apertura, cierre y movimientos'},
  {id:'facturas',  label:'Facturación e impresión'},
  {id:'clientes',  label:'Clientes'},
  {id:'mesas',     label:'Mesas (restaurante)'},
  {id:'cocina',    label:'Cocina / KDS'},
  {id:'citas',     label:'Citas / Turnos (barbería, salón)'},
  {id:'variantes', label:'Variantes: talla/color (ropa)'},
  {id:'barras',    label:'Código de barras'},
  {id:'domicilios',label:'Domicilios'},
  {id:'inventario',label:'Inventario / Stock'},
  {id:'recetas',   label:'Recetas (materia prima por producto)'},
  {id:'reportes',  label:'Reportes'},
  {id:'contable',  label:'Registro Contable Mensual'},
  {id:'gastosneg', label:'Gastos del Negocio'},
  {id:'asistencia',label:'Control de asistencia'},
  {id:'auditoria', label:'Auditoría'},
];

// ---------- Perfiles predefinidos por tipo de negocio ----------
// Cada perfil trae: el nombre que se le da al "producto", si usa mesas/cocina/citas/variantes,
// y las funciones que vienen activadas por defecto. El super-admin puede ajustar todo después.
const PERFILES = {
  'Restaurante': {
    palabraProducto:'Plato', palabraProductos:'Platos', usaMesas:true, usaCocina:true, usaCitas:false, usaVariantes:false,
    funciones:['ventas','menu','caja','facturas','clientes','mesas','cocina','domicilios','inventario','recetas','reportes','contable','gastosneg']
  },
  'Cafetería': {
    palabraProducto:'Producto', palabraProductos:'Productos', usaMesas:true, usaCocina:true, usaCitas:false, usaVariantes:false,
    funciones:['ventas','menu','caja','facturas','clientes','mesas','cocina','inventario','reportes','contable','gastosneg']
  },
  'Comida rápida': {
    palabraProducto:'Producto', palabraProductos:'Productos', usaMesas:false, usaCocina:true, usaCitas:false, usaVariantes:false,
    funciones:['ventas','menu','caja','facturas','clientes','cocina','domicilios','inventario','recetas','reportes','contable','gastosneg']
  },
  'Barbería': {
    palabraProducto:'Servicio', palabraProductos:'Servicios', usaMesas:false, usaCocina:false, usaCitas:true, usaVariantes:false,
    funciones:['ventas','menu','caja','facturas','clientes','citas','inventario','reportes','contable','gastosneg']
  },
  'Salón de belleza': {
    palabraProducto:'Servicio', palabraProductos:'Servicios', usaMesas:false, usaCocina:false, usaCitas:true, usaVariantes:false,
    funciones:['ventas','menu','caja','facturas','clientes','citas','inventario','reportes','contable','gastosneg']
  },
  'Tienda de ropa': {
    palabraProducto:'Prenda', palabraProductos:'Prendas', usaMesas:false, usaCocina:false, usaCitas:false, usaVariantes:true,
    funciones:['ventas','menu','caja','facturas','clientes','variantes','barras','inventario','reportes','contable','gastosneg']
  },
  'Accesorios': {
    palabraProducto:'Artículo', palabraProductos:'Artículos', usaMesas:false, usaCocina:false, usaCitas:false, usaVariantes:true,
    funciones:['ventas','menu','caja','facturas','clientes','variantes','barras','inventario','reportes','contable','gastosneg']
  },
  'Minimercado': {
    palabraProducto:'Producto', palabraProductos:'Productos', usaMesas:false, usaCocina:false, usaCitas:false, usaVariantes:false,
    funciones:['ventas','menu','caja','facturas','clientes','barras','inventario','reportes','contable','gastosneg']
  },
  'Ferretería': {
    palabraProducto:'Producto', palabraProductos:'Productos', usaMesas:false, usaCocina:false, usaCitas:false, usaVariantes:false,
    funciones:['ventas','menu','caja','facturas','clientes','barras','inventario','reportes','contable','gastosneg']
  },
  'Papelería': {
    palabraProducto:'Producto', palabraProductos:'Productos', usaMesas:false, usaCocina:false, usaCitas:false, usaVariantes:false,
    funciones:['ventas','menu','caja','facturas','clientes','barras','inventario','reportes','contable','gastosneg']
  },
  'Farmacia': {
    palabraProducto:'Producto', palabraProductos:'Productos', usaMesas:false, usaCocina:false, usaCitas:false, usaVariantes:false,
    funciones:['ventas','menu','caja','facturas','clientes','barras','inventario','reportes','contable','gastosneg']
  },
  'Otro': {
    palabraProducto:'Producto', palabraProductos:'Productos', usaMesas:false, usaCocina:false, usaCitas:false, usaVariantes:false,
    funciones:['ventas','menu','caja','facturas','clientes','inventario','reportes','contable','gastosneg']
  }
};
const TIPOS_NEGOCIO = Object.keys(PERFILES);

// ---------- Estado en memoria ----------
const STATE = { user:null, negocio:null, page:'', esSuperAdmin:false };

// ---------- Semilla inicial ----------
function seed(){
  // Super-admin (dueño del sistema)
  if(!DB.get('superadmins')){
    DB.set('superadmins', [
      {id:'sa1', nombre:'Súper Administrador', usuario:'superadmin', pass:'super123', creado:now()}
    ]);
  }
  // Negocios (cada uno con su config y funciones)
  if(!DB.get('negocios')){
    DB.set('negocios', [
      {
        id:'neg1', nombre:'Negocio de Ejemplo', tipo:'Restaurante',
        logo:'', colorPrincipal:'#D4AF37', colorSecundario:'#C0392B',
        nit:'', dir:'', tel:'', ciudad:'',
        plan:'Profesional', precioMes:149900, activo:true,
        palabraProducto:'Plato', palabraProductos:'Platos',
        usaMesas:true, usaCocina:true, usaCitas:false, usaVariantes:false,
        funciones:['ventas','menu','caja','facturas','clientes','mesas','cocina','domicilios','inventario','recetas','reportes','contable','gastosneg'], tipoFactura:'pos',
        creado:now()
      }
    ]);
  }
  // Usuarios de negocio (llevan negocioId)
  if(!DB.get('usuarios')){
    DB.set('usuarios', [
      {id:'u1', negocioId:'neg1', nombre:'Administrador', usuario:'admin', pass:'admin123', rol:'admin', activo:true, creado:now()}
    ]);
  }
}

// ---------- LOGIN ----------
function login(usuario, pass){
  // 1) ¿Es super-admin?
  const sa = (DB.get('superadmins')||[]).find(s=>s.usuario===usuario && s.pass===pass);
  if(sa){
    STATE.user = sa; STATE.esSuperAdmin = true; STATE.negocio = null;
    return {ok:true, tipo:'superadmin'};
  }
  // 2) ¿Es usuario de un negocio?
  const u = (DB.get('usuarios')||[]).find(x=>x.usuario===usuario && x.pass===pass && x.activo);
  if(u){
    const neg = (DB.get('negocios')||[]).find(n=>n.id===u.negocioId);
    if(!neg){ return {ok:false, msg:'El negocio no existe.'}; }
    if(!neg.activo){ return {ok:false, msg:'Este negocio está suspendido. Contacte al administrador del sistema.'}; }
    STATE.user = u; STATE.esSuperAdmin = false; STATE.negocio = neg;
    return {ok:true, tipo:'negocio'};
  }
  return {ok:false, msg:'Usuario o contraseña incorrectos.'};
}
function logout(){ STATE.user=null; STATE.negocio=null; STATE.esSuperAdmin=false; render(); }

// ---------- Helpers de datos POR NEGOCIO (aislamiento) ----------
// Todos los datos operativos se guardan por negocio: la clave incluye el negocioId.
function datosDe(negocioId, tabla){ return DB.get('data_'+negocioId+'_'+tabla) || []; }
function guardarDatosDe(negocioId, tabla, arr){ DB.set('data_'+negocioId+'_'+tabla, arr); }
// Atajos para el negocio actual
function misDatos(tabla){ return STATE.negocio ? datosDe(STATE.negocio.id, tabla) : []; }
function guardarMisDatos(tabla, arr){ if(STATE.negocio) guardarDatosDe(STATE.negocio.id, tabla, arr); }

// ============================================================
//  PANEL DE SUPER-ADMIN
// ============================================================
function panelSuperAdmin(){
  const negocios = DB.get('negocios')||[];
  const totalActivos = negocios.filter(n=>n.activo).length;
  const ingresoMensual = negocios.filter(n=>n.activo).reduce((a,n)=>a+(n.precioMes||0),0);

  return `
  <div class="topbar" style="position:sticky;">
    <h1>${ic('shield')} Panel de Super-Admin <span class="pill pill-gold" style="font-size:11px;">Dueño del sistema</span></h1>
    <div class="tb-right">
      <span class="clock" id="clock"></span>
      <div class="avatar" style="width:34px;height:34px;font-size:13px;">${(STATE.user.nombre||'S').charAt(0)}</div>
      <button class="btn btn-ghost btn-sm" onclick="logout()">${ic('logout')} Salir</button>
    </div>
  </div>

  <div class="content">
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-icon">${ic('building')}</div><div class="stat-label">Negocios activos</div><div class="stat-value">${totalActivos}</div><div class="stat-sub">de ${negocios.length} en total</div></div>
      <div class="stat-card green"><div class="stat-icon">${ic('cash')}</div><div class="stat-label">Ingreso mensual</div><div class="stat-value">${fmtMoney(ingresoMensual)}</div><div class="stat-sub">suma de planes activos</div></div>
      <div class="stat-card red"><div class="stat-icon">${ic('shield')}</div><div class="stat-label">Suspendidos</div><div class="stat-value">${negocios.length-totalActivos}</div><div class="stat-sub">no pagan / pausados</div></div>
    </div>

    <div class="card">
      <div class="card-head">
        <div class="card-title">${ic('building')} Negocios del sistema</div>
        <button class="btn btn-gold" onclick="abrirNuevoNegocio()">${ic('plus')} Crear negocio</button>
      </div>
      <div class="table-wrap">
        <table class="tbl">
          <thead><tr><th>Negocio</th><th>Tipo</th><th>Plan</th><th>Precio/mes</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
          ${negocios.length? negocios.map(n=>`
            <tr>
              <td><strong>${escapeHtml(n.nombre)}</strong><br><span class="muted">${escapeHtml(n.ciudad||'')}</span></td>
              <td>${escapeHtml(n.tipo)}</td>
              <td>${escapeHtml(n.plan||'—')}</td>
              <td>${fmtMoney(n.precioMes)}</td>
              <td>${n.activo?'<span class="pill pill-green">Activo</span>':'<span class="pill pill-red">Suspendido</span>'}</td>
              <td class="actions">
                <button class="btn btn-sm" onclick="abrirConfigNegocio('${n.id}')">${ic('cog')} Configurar</button>
                <button class="btn btn-sm ${n.activo?'btn-warn':'btn-green'}" onclick="toggleNegocio('${n.id}')">${n.activo?'Suspender':'Activar'}</button>
                <button class="btn btn-sm btn-danger" onclick="eliminarNegocio('${n.id}')">×</button>
              </td>
            </tr>`).join('') : '<tr><td colspan="6" class="muted">Aún no hay negocios. Crea el primero.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  </div>`;
}

// Crear negocio nuevo
function abrirNuevoNegocio(){
  STATE.page='nuevo-negocio'; render();
}
function pantallaNuevoNegocio(){
  return `
  <div class="topbar">
    <div class="topbar-title">Crear negocio nuevo</div>
    <div class="topbar-right"><button class="btn btn-ghost btn-sm" onclick="STATE.page='';render()">← Volver</button></div>
  </div>
  <div class="content">
    <div class="card" style="max-width:640px;margin:0 auto;">
      <div class="card-title">Datos del negocio</div>
      <div class="form-row"><label>Nombre del negocio *</label><input id="n-nombre" placeholder="Ej: Restaurante La Brasa"></div>
      <div class="form-row"><label>Tipo de negocio</label><select id="n-tipo">${TIPOS_NEGOCIO.map(t=>`<option>${t}</option>`).join('')}</select></div>
      <div class="grid2">
        <div class="form-row"><label>Ciudad</label><input id="n-ciudad" placeholder="Ej: Floridablanca"></div>
        <div class="form-row"><label>Teléfono</label><input id="n-tel" placeholder="Ej: 3001234567"></div>
      </div>
      <div class="grid2">
        <div class="form-row"><label>Plan</label><select id="n-plan"><option>Básico</option><option selected>Profesional</option><option>Empresarial</option></select></div>
        <div class="form-row"><label>Precio mensual (COP)</label><input id="n-precio" type="number" value="149900"></div>
      </div>
      <hr class="sep">
      <div class="card-title" style="font-size:14px;">Usuario administrador del negocio</div>
      <p class="muted" style="margin-bottom:8px;">Con esta cuenta el dueño del negocio entrará a administrar su sistema.</p>
      <div class="grid2">
        <div class="form-row"><label>Usuario *</label><input id="n-admin-user" placeholder="Ej: labrasa"></div>
        <div class="form-row"><label>Contraseña *</label><input id="n-admin-pass" placeholder="Ej: labrasa123"></div>
      </div>
      <button class="btn btn-gold btn-block" onclick="crearNegocio()">Crear negocio</button>
    </div>
  </div>`;
}
function crearNegocio(){
  const nombre=(document.getElementById('n-nombre').value||'').trim();
  const tipo=document.getElementById('n-tipo').value;
  const ciudad=(document.getElementById('n-ciudad').value||'').trim();
  const tel=(document.getElementById('n-tel').value||'').trim();
  const plan=document.getElementById('n-plan').value;
  const precioMes=parseInt(document.getElementById('n-precio').value)||0;
  const adminUser=(document.getElementById('n-admin-user').value||'').trim();
  const adminPass=(document.getElementById('n-admin-pass').value||'').trim();
  if(!nombre){ toast('Escribe el nombre del negocio','error'); return; }
  if(!adminUser||!adminPass){ toast('Escribe usuario y contraseña del admin','error'); return; }
  // ¿usuario repetido?
  if((DB.get('usuarios')||[]).some(u=>u.usuario===adminUser) || (DB.get('superadmins')||[]).some(s=>s.usuario===adminUser)){
    toast('Ese nombre de usuario ya existe','error'); return;
  }
  const negocios=DB.get('negocios')||[];
  const negId=uid();
  // Tomar el perfil del tipo de negocio (vocabulario + funciones ya adaptadas)
  const perfil=PERFILES[tipo]||PERFILES['Otro'];
  negocios.push({
    id:negId, nombre, tipo, ciudad, tel, plan, precioMes, activo:true,
    logo:'', colorPrincipal:'#D4AF37', colorSecundario:'#C0392B', nit:'', dir:'',
    // Vocabulario y comportamiento del perfil
    palabraProducto:perfil.palabraProducto, palabraProductos:perfil.palabraProductos,
    usaMesas:perfil.usaMesas, usaCocina:perfil.usaCocina, usaCitas:perfil.usaCitas, usaVariantes:perfil.usaVariantes,
    funciones:perfil.funciones.slice(), tipoFactura:'pos',
    creado:now()
  });
  DB.set('negocios',negocios);
  // Crear el admin del negocio
  const usuarios=DB.get('usuarios')||[];
  usuarios.push({id:uid(), negocioId:negId, nombre:'Administrador', usuario:adminUser, pass:adminPass, rol:'admin', activo:true, creado:now()});
  DB.set('usuarios',usuarios);
  toast('Negocio creado: '+nombre+' ('+tipo+')','success');
  STATE.page=''; render();
}

// Configurar un negocio (funciones, marca, plan)
function abrirConfigNegocio(id){ STATE.page='config-negocio:'+id; render(); }
function pantallaConfigNegocio(id){
  const neg=(DB.get('negocios')||[]).find(n=>n.id===id);
  if(!neg) return '<div class="content"><div class="card">Negocio no encontrado.</div></div>';
  return `
  <div class="topbar">
    <div class="topbar-title">Configurar: ${escapeHtml(neg.nombre)}</div>
    <div class="topbar-right"><button class="btn btn-ghost btn-sm" onclick="STATE.page='';render()">← Volver</button></div>
  </div>
  <div class="content">
    <div class="card" style="max-width:720px;margin:0 auto;">
      <div class="card-title">Datos y marca</div>
      <div class="form-row"><label>Nombre</label><input id="c-nombre" value="${escapeHtml(neg.nombre)}"></div>
      <div class="grid2">
        <div class="form-row"><label>Tipo</label><select id="c-tipo">${TIPOS_NEGOCIO.map(t=>`<option ${t===neg.tipo?'selected':''}>${t}</option>`).join('')}</select></div>
        <div class="form-row"><label>Ciudad</label><input id="c-ciudad" value="${escapeHtml(neg.ciudad||'')}"></div>
      </div>
      <div class="grid2">
        <div class="form-row"><label>Color principal</label><input id="c-color1" type="color" value="${neg.colorPrincipal||'#D4AF37'}"></div>
        <div class="form-row"><label>Color secundario</label><input id="c-color2" type="color" value="${neg.colorSecundario||'#C0392B'}"></div>
      </div>
      <div class="grid2">
        <div class="form-row"><label>NIT</label><input id="c-nit" value="${escapeHtml(neg.nit||'')}"></div>
        <div class="form-row"><label>Teléfono</label><input id="c-tel" value="${escapeHtml(neg.tel||'')}"></div>
      </div>
      <div class="form-row"><label>Dirección</label><input id="c-dir" value="${escapeHtml(neg.dir||'')}"></div>

      <hr class="sep">
      <div class="card-title">Plan y cobro</div>
      <div class="grid2">
        <div class="form-row"><label>Plan</label><select id="c-plan"><option ${neg.plan==='Básico'?'selected':''}>Básico</option><option ${neg.plan==='Profesional'?'selected':''}>Profesional</option><option ${neg.plan==='Empresarial'?'selected':''}>Empresarial</option></select></div>
        <div class="form-row"><label>Precio mensual (COP)</label><input id="c-precio" type="number" value="${neg.precioMes||0}"></div>
      </div>

      <hr class="sep">
      <div class="card-title">Comportamiento del negocio</div>
      <p class="muted" style="margin-bottom:10px;">Cómo se llama lo que vende este negocio y qué usa. Se adapta según el tipo (barbería usa "servicio" y citas; ropa usa "prenda" y tallas).</p>
      <div class="grid2">
        <div class="form-row"><label>¿Cómo se llama un producto? (singular)</label><input id="c-palabra1" value="${escapeHtml(neg.palabraProducto||'Producto')}" placeholder="Plato / Servicio / Prenda"></div>
        <div class="form-row"><label>En plural</label><input id="c-palabra2" value="${escapeHtml(neg.palabraProductos||'Productos')}" placeholder="Platos / Servicios / Prendas"></div>
      </div>
      <div class="func-grid" style="margin-bottom:6px;">
        <label class="check"><input type="checkbox" id="c-mesas" ${neg.usaMesas?'checked':''}> Usa mesas (restaurante)</label>
        <label class="check"><input type="checkbox" id="c-cocina" ${neg.usaCocina?'checked':''}> Usa cocina/preparación</label>
        <label class="check"><input type="checkbox" id="c-citas" ${neg.usaCitas?'checked':''}> Usa citas/turnos (barbería, salón)</label>
        <label class="check"><input type="checkbox" id="c-variantes" ${neg.usaVariantes?'checked':''}> Usa tallas/colores (ropa)</label>
      </div>

      <hr class="sep">
      <div class="card-title">Tipo de factura</div>
      <p class="muted" style="margin-bottom:10px;">Elige cómo se imprime la factura de este negocio.</p>
      <div class="form-row"><label>Tamaño / formato de factura</label>
        <select id="c-factura">
          <option value="pos" ${(neg.tipoFactura||'pos')==='pos'?'selected':''}>POS / Tirilla térmica (80mm, angosta)</option>
          <option value="media" ${neg.tipoFactura==='media'?'selected':''}>Media hoja (media carta)</option>
          <option value="carta" ${neg.tipoFactura==='carta'?'selected':''}>Hoja completa (tamaño carta)</option>
        </select>
      </div>

      <hr class="sep">
      <div class="card-title">Funciones activadas</div>
      <p class="muted" style="margin-bottom:10px;">Marca las funciones que este negocio podrá usar. Las demás quedan ocultas para ellos.</p>
      <div class="func-grid">
        ${FUNCIONES.map(f=>`<label class="check"><input type="checkbox" class="c-func" value="${f.id}" ${neg.funciones&&neg.funciones.includes(f.id)?'checked':''}> ${f.label}</label>`).join('')}
      </div>

      <button class="btn btn-gold btn-block" onclick="guardarConfigNegocio('${id}')">Guardar configuración</button>
    </div>
  </div>`;
}
function guardarConfigNegocio(id){
  const negocios=DB.get('negocios')||[];
  const neg=negocios.find(n=>n.id===id); if(!neg) return;
  neg.nombre=(document.getElementById('c-nombre').value||'').trim()||neg.nombre;
  neg.tipo=document.getElementById('c-tipo').value;
  neg.ciudad=(document.getElementById('c-ciudad').value||'').trim();
  neg.colorPrincipal=document.getElementById('c-color1').value;
  neg.colorSecundario=document.getElementById('c-color2').value;
  neg.nit=(document.getElementById('c-nit').value||'').trim();
  neg.tel=(document.getElementById('c-tel').value||'').trim();
  neg.dir=(document.getElementById('c-dir').value||'').trim();
  neg.plan=document.getElementById('c-plan').value;
  neg.tipoFactura=document.getElementById('c-factura').value;
  neg.precioMes=parseInt(document.getElementById('c-precio').value)||0;
  neg.palabraProducto=(document.getElementById('c-palabra1').value||'').trim()||'Producto';
  neg.palabraProductos=(document.getElementById('c-palabra2').value||'').trim()||'Productos';
  neg.usaMesas=document.getElementById('c-mesas').checked;
  neg.usaCocina=document.getElementById('c-cocina').checked;
  neg.usaCitas=document.getElementById('c-citas').checked;
  neg.usaVariantes=document.getElementById('c-variantes').checked;
  neg.funciones=Array.from(document.querySelectorAll('.c-func:checked')).map(c=>c.value);
  DB.set('negocios',negocios);
  toast('Configuración guardada','success');
  STATE.page=''; render();
}
function toggleNegocio(id){
  const negocios=DB.get('negocios')||[];
  const neg=negocios.find(n=>n.id===id); if(!neg) return;
  neg.activo=!neg.activo; DB.set('negocios',negocios);
  toast(neg.activo?'Negocio activado':'Negocio suspendido', neg.activo?'success':'info');
  render();
}
function eliminarNegocio(id){
  confirmarModal('¿Eliminar este negocio y todos sus usuarios? Esta acción no se puede deshacer.',()=>{
    DB.set('negocios',(DB.get('negocios')||[]).filter(n=>n.id!==id));
    DB.set('usuarios',(DB.get('usuarios')||[]).filter(u=>u.negocioId!==id));
    toast('Negocio eliminado','info');
    render();
  },'Eliminar');
}

// ============================================================
//  DOMICILIOS (universal)
// ============================================================
function domicilios(){
  const doms=misDatos('domiciliarios');
  return `
    <div class="card">
      <div class="inv-head">
        <div class="card-title">🛵 Domiciliarios</div>
        <button class="btn btn-gold btn-sm" onclick="nuevoDomiciliario()">+ Agregar domiciliario</button>
      </div>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Nombre</th><th>Teléfono</th><th>Estado</th><th></th></tr></thead>
        <tbody>
        ${doms.length? doms.map(d=>`<tr><td><strong>${escapeHtml(d.nombre)}</strong></td><td>${escapeHtml(d.tel||'—')}</td><td>${d.activo?'<span class="pill pill-green">Activo</span>':'<span class="pill pill-red">Inactivo</span>'}</td><td class="actions"><button class="btn btn-sm" onclick="toggleDomiciliario('${d.id}')">${d.activo?'Desactivar':'Activar'}</button><button class="btn btn-sm btn-danger" onclick="eliminarDomiciliario('${d.id}')">×</button></td></tr>`).join('') : '<tr><td colspan="4" class="muted">Sin domiciliarios.</td></tr>'}
        </tbody>
      </table></div>
    </div>`;
}
function nuevoDomiciliario(){
  abrirModal({titulo:'Nuevo domiciliario', textoBoton:'Agregar', campos:[
    {id:'nombre', label:'Nombre', requerido:true},
    {id:'tel', label:'Teléfono', tipo:'tel'}
  ], onGuardar:(d)=>{
    const doms=misDatos('domiciliarios');
    doms.push({id:uid(), nombre:d.nombre, tel:d.tel, activo:true, creado:now()});
    guardarMisDatos('domiciliarios',doms);
    cerrarModal(); toast('Domiciliario agregado','success'); render();
  }});
}
function toggleDomiciliario(id){ const d=misDatos('domiciliarios'); const x=d.find(y=>y.id===id); if(x){x.activo=!x.activo; guardarMisDatos('domiciliarios',d); render();} }
function eliminarDomiciliario(id){ confirmarModal('¿Eliminar este domiciliario?',()=>{ guardarMisDatos('domiciliarios',misDatos('domiciliarios').filter(d=>d.id!==id)); toast('Eliminado','info'); render(); },'Eliminar'); }

// ============================================================
//  USUARIOS DEL NEGOCIO (roles: cajero, mesero, cocina...)
// ============================================================
const ROLES_NEGOCIO=[['admin','Administrador'],['cajero','Cajero'],['mesero','Mesero'],['cocina','Cocina']];
function usuariosNeg(){
  const us=(DB.get('usuarios')||[]).filter(u=>u.negocioId===STATE.negocio.id);
  return `
    <div class="card">
      <div class="inv-head">
        <div class="card-title">👤 Usuarios del negocio</div>
        <button class="btn btn-gold btn-sm" onclick="nuevoUsuarioNeg()">+ Agregar usuario</button>
      </div>
      <p class="muted" style="margin-bottom:10px;">Empleados que pueden entrar a tu negocio. Cada uno con su rol.</p>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Estado</th><th></th></tr></thead>
        <tbody>
        ${us.map(u=>`<tr><td><strong>${escapeHtml(u.nombre)}</strong></td><td>${escapeHtml(u.usuario)}</td><td>${escapeHtml((ROLES_NEGOCIO.find(r=>r[0]===u.rol)||['',u.rol])[1])}</td><td>${u.activo?'<span class="pill pill-green">Activo</span>':'<span class="pill pill-red">Inactivo</span>'}</td><td class="actions">${u.rol!=='admin'?`<button class="btn btn-sm btn-danger" onclick="eliminarUsuarioNeg('${u.id}')">×</button>`:'<span class="muted">principal</span>'}</td></tr>`).join('')}
        </tbody>
      </table></div>
    </div>`;
}
function nuevoUsuarioNeg(){
  abrirModal({titulo:'Nuevo usuario del negocio', textoBoton:'Crear usuario', campos:[
    {id:'nombre', label:'Nombre del empleado', requerido:true},
    {id:'usuario', label:'Usuario (para entrar)', requerido:true},
    {id:'pass', label:'Contraseña', requerido:true},
    {id:'rol', label:'Rol', tipo:'select', opciones:[{valor:'cajero',label:'Cajero'},{valor:'mesero',label:'Mesero'},{valor:'cocina',label:'Cocina'}]}
  ], onGuardar:(d)=>{
    if((DB.get('usuarios')||[]).some(u=>u.usuario===d.usuario)){ toast('Ese usuario ya existe','error'); return; }
    const us=DB.get('usuarios')||[];
    us.push({id:uid(), negocioId:STATE.negocio.id, nombre:d.nombre, usuario:d.usuario, pass:d.pass, rol:d.rol, activo:true, creado:now()});
    DB.set('usuarios',us);
    cerrarModal(); toast('Usuario creado','success'); render();
  }});
}
function eliminarUsuarioNeg(id){ confirmarModal('¿Eliminar este usuario?',()=>{ DB.set('usuarios',(DB.get('usuarios')||[]).filter(u=>u.id!==id)); toast('Eliminado','info'); render(); },'Eliminar'); }

// ============================================================
//  CONFIGURACIÓN DEL NEGOCIO (logo, datos) — la ve el admin del negocio
// ============================================================
function configNeg(){
  const neg=STATE.negocio;
  return `
    <div class="card" style="max-width:640px;">
      <div class="card-title">⚙️ Configuración de mi negocio</div>
      <div class="form-row"><label>Logo del negocio</label>
        <input type="file" id="cfg-logo" accept="image/*" onchange="subirLogoNeg(event)">
        ${neg.logo?`<div style="margin-top:10px;"><img src="${neg.logo}" style="max-height:80px;border-radius:8px;"><br><button class="btn btn-sm btn-danger" style="margin-top:6px;" onclick="quitarLogoNeg()">Quitar logo</button></div>`:'<p class="muted" style="margin-top:6px;">Sin logo. Sube uno para que salga en las facturas.</p>'}
      </div>
      <div class="grid2">
        <div class="form-row"><label>Teléfono</label><input id="cfg-tel" value="${escapeHtml(neg.tel||'')}"></div>
        <div class="form-row"><label>NIT</label><input id="cfg-nit" value="${escapeHtml(neg.nit||'')}"></div>
      </div>
      <div class="form-row"><label>Dirección</label><input id="cfg-dir" value="${escapeHtml(neg.dir||'')}"></div>

      <hr class="sep">
      <div class="card-title" style="font-size:14px;">Apariencia del sistema</div>
      <p class="muted" style="margin-bottom:10px;">Elige el color de fondo con el que quieres trabajar.</p>
      <div class="form-row"><label>Tema de fondo</label>
        <select id="cfg-tema" onchange="previewTema()">
          <option value="oscuro" ${(neg.tema||'oscuro')==='oscuro'?'selected':''}>Oscuro (por defecto)</option>
          <option value="claro" ${neg.tema==='claro'?'selected':''}>Claro (blanco)</option>
          <option value="azul" ${neg.tema==='azul'?'selected':''}>Azul noche</option>
          <option value="verde" ${neg.tema==='verde'?'selected':''}>Verde bosque</option>
          <option value="vino" ${neg.tema==='vino'?'selected':''}>Vino / burdeos</option>
          <option value="personalizado" ${neg.tema==='personalizado'?'selected':''}>Personalizado (elijo el color)</option>
        </select>
      </div>
      <div class="form-row" id="cfg-color-row" style="${neg.tema==='personalizado'?'':'display:none;'}">
        <label>Color de fondo personalizado</label>
        <input type="color" id="cfg-colorfondo" value="${neg.colorFondo||'#0f1113'}">
      </div>

      <button class="btn btn-gold btn-block" onclick="guardarConfigNeg()">Guardar</button>
    </div>`;
}
function subirLogoNeg(e){
  const file=e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=ev=>{ actualizarNegocioActual({logo:ev.target.result}); toast('Logo cargado','success'); render(); };
  reader.readAsDataURL(file);
}
function quitarLogoNeg(){ actualizarNegocioActual({logo:''}); render(); }
function previewTema(){
  const row=document.getElementById('cfg-color-row');
  const tema=document.getElementById('cfg-tema').value;
  if(row) row.style.display = tema==='personalizado'?'':'none';
}
function guardarConfigNeg(){
  const tema=document.getElementById('cfg-tema').value;
  const colorFondo=document.getElementById('cfg-colorfondo')?document.getElementById('cfg-colorfondo').value:'';
  actualizarNegocioActual({
    tel:(document.getElementById('cfg-tel').value||'').trim(),
    nit:(document.getElementById('cfg-nit').value||'').trim(),
    dir:(document.getElementById('cfg-dir').value||'').trim(),
    tema, colorFondo
  });
  aplicarTema(STATE.negocio);
  toast('Configuración guardada','success'); render();
}
// Aplica el tema/color de fondo del negocio al sistema
const TEMAS={
  oscuro:{bg:'#0a0b0d', bg2:'#101215', panel:'#16191e', panel2:'#1c2026', card:'#16191e', txt:'#f2f3f5', muted:'#9aa0a6'},
  claro:{bg:'#eef0f3', bg2:'#f6f7f9', panel:'#ffffff', panel2:'#ffffff', card:'#ffffff', txt:'#1a1d21', muted:'#6b7280'},
  azul:{bg:'#0a1420', bg2:'#0d1b2a', panel:'#12263a', panel2:'#1b3a53', card:'#12263a', txt:'#e8f0f7', muted:'#8fa8bd'},
  verde:{bg:'#0a1510', bg2:'#0f1a14', panel:'#16241c', panel2:'#1d2f24', card:'#16241c', txt:'#e8f2ea', muted:'#8fad9a'},
  vino:{bg:'#150a0e', bg2:'#1a0f13', panel:'#26161c', panel2:'#301c24', card:'#26161c', txt:'#f5e8ec', muted:'#bd8f9a'}
};
function aplicarTema(neg){
  if(!neg) return;
  const root=document.documentElement;
  let t;
  if(neg.tema==='personalizado' && neg.colorFondo){
    const esOscuro=esColorOscuro(neg.colorFondo);
    t={bg:neg.colorFondo, bg2:aclararOscurecer(neg.colorFondo,esOscuro?6:-5), panel:aclararOscurecer(neg.colorFondo,esOscuro?12:-8), panel2:aclararOscurecer(neg.colorFondo,esOscuro?20:-14), card:aclararOscurecer(neg.colorFondo,esOscuro?12:-8), txt:esOscuro?'#f2f3f5':'#1a1d21', muted:esOscuro?'#9aa0a6':'#6b7280'};
  } else {
    t=TEMAS[neg.tema||'oscuro']||TEMAS.oscuro;
  }
  root.style.setProperty('--bg',t.bg);
  root.style.setProperty('--bg2',t.bg2);
  root.style.setProperty('--panel',t.panel);
  root.style.setProperty('--panel2',t.panel2);
  root.style.setProperty('--card',t.card);
  root.style.setProperty('--txt',t.txt);
  root.style.setProperty('--muted',t.muted);
}
function esColorOscuro(hex){
  const c=hex.replace('#',''); const r=parseInt(c.substr(0,2),16),g=parseInt(c.substr(2,2),16),b=parseInt(c.substr(4,2),16);
  return (0.299*r+0.587*g+0.114*b)<140;
}
function aclararOscurecer(hex,amt){
  const c=hex.replace('#',''); let r=parseInt(c.substr(0,2),16),g=parseInt(c.substr(2,2),16),b=parseInt(c.substr(4,2),16);
  r=Math.max(0,Math.min(255,r+amt)); g=Math.max(0,Math.min(255,g+amt)); b=Math.max(0,Math.min(255,b+amt));
  return '#'+[r,g,b].map(x=>x.toString(16).padStart(2,'0')).join('');
}
// Actualiza el negocio actual tanto en la lista global como en STATE
function actualizarNegocioActual(cambios){
  const negocios=DB.get('negocios')||[];
  const neg=negocios.find(n=>n.id===STATE.negocio.id);
  if(neg){ Object.assign(neg,cambios); DB.set('negocios',negocios); Object.assign(STATE.negocio,cambios); }
}

// ============================================================
//  COCINA / KDS (restaurantes)
// ============================================================
function cocina(){
  const neg=STATE.negocio;
  // Pedidos que van a cocina: ventas marcadas como 'en_cocina' o recién cobradas con estado cocina
  const pedidos=misDatos('ventas').filter(v=>v.estadoCocina && v.estadoCocina!=='entregado');
  return `
    <div class="card">
      <div class="card-title">👨‍🍳 Cocina</div>
      <p class="muted" style="margin-bottom:12px;">Pedidos en preparación. Marca cada uno cuando esté listo.</p>
      <div class="kds-grid">
        ${pedidos.length? pedidos.map(v=>{
          const mins=Math.floor((Date.now()-new Date(v.fecha))/60000);
          const color=mins<5?'#27ae60':mins<12?'#e67e22':'#c0392b';
          return `<div class="kds-card" style="border-top:4px solid ${color};">
            <div class="kds-head"><strong>${v.mesa?escapeHtml(v.mesa):'Pedido'}</strong><span class="kds-time" style="color:${color};">${mins} min</span></div>
            <div class="kds-items">${v.items.map(i=>`<div>${i.qty}× ${escapeHtml(i.nombre)}</div>`).join('')}</div>
            <div class="kds-actions">
              ${v.estadoCocina==='pendiente'?`<button class="btn btn-sm" onclick="estadoCocina('${v.id}','preparando')">Preparar</button>`:''}
              ${v.estadoCocina==='preparando'?`<button class="btn btn-sm btn-green" onclick="estadoCocina('${v.id}','listo')">Listo ✓</button>`:''}
              ${v.estadoCocina==='listo'?`<button class="btn btn-sm" onclick="estadoCocina('${v.id}','entregado')">Entregar</button>`:''}
            </div>
          </div>`;
        }).join('') : '<p class="muted">No hay pedidos en cocina.</p>'}
      </div>
    </div>`;
}
function estadoCocina(id,estado){
  const ventasArr=misDatos('ventas'); const v=ventasArr.find(x=>x.id===id); if(!v)return;
  v.estadoCocina=estado; guardarMisDatos('ventas',ventasArr);
  toast(estado==='listo'?'¡Pedido listo!':'Actualizado', estado==='listo'?'success':'info'); render();
}

// ============================================================
//  IMPRESIÓN DE FACTURA (universal)
// ============================================================
function imprimirFactura(ventaId){
  const v=misDatos('ventas').find(x=>x.id===ventaId); if(!v) return;
  const neg=STATE.negocio;
  const subtotal=v.items.reduce((a,i)=>a+i.precio*i.qty,0);
  const logo=neg.logo||window.LOGO_DEFAULT||'';
  const tipo=neg.tipoFactura||'pos';
  // Dimensiones y estilos según el tipo de factura
  let ancho, pagina, ventanaW;
  if(tipo==='carta'){ ancho='190mm'; pagina='@page{size:letter;margin:12mm;}'; ventanaW=800; }
  else if(tipo==='media'){ ancho='140mm'; pagina='@page{size:half-letter;margin:8mm;}'; ventanaW=650; }
  else { ancho='72mm'; pagina='@page{size:80mm auto;margin:0;}'; ventanaW=400; }
  const grande = tipo!=='pos'; // en hoja carta/media usamos layout más amplio
  const html=`<div style="font-family:'Inter',Arial,sans-serif;color:#000;width:${ancho};padding:${grande?'6mm':'4mm'};margin:0 auto;">
    <div style="text-align:center;padding-bottom:6px;${grande?'display:flex;align-items:center;gap:14px;text-align:left;justify-content:center;':''}">
      ${logo?`<img src="${logo}" style="max-height:${grande?'90px':'120px'};max-width:240px;margin-bottom:6px;">`:''}
      <div>
        <div style="font-size:26px;font-weight:800;">${escapeHtml(neg.nombre)}</div>
        ${neg.nit?`<div style="font-size:14px;margin-top:2px;">NIT: ${escapeHtml(neg.nit)}</div>`:''}
        ${neg.tel?`<div style="font-size:14px;">Tel: ${escapeHtml(neg.tel)}</div>`:''}
        ${neg.dir?`<div style="font-size:14px;">${escapeHtml(neg.dir)}</div>`:''}
      </div>
    </div>
    <div style="border-top:2px solid #000;border-bottom:2px solid #000;padding:6px 0;text-align:center;margin:6px 0;">
      <div style="font-size:15px;font-weight:bold;">FACTURA DE VENTA</div>
    </div>
    <div style="font-size:15px;line-height:1.7;margin:6px 0;font-weight:500;">
      <div style="display:flex;justify-content:space-between;"><span>Fecha</span><span>${fmtDate(v.fecha)}</span></div>
      <div style="display:flex;justify-content:space-between;"><span>Atendió</span><span>${escapeHtml(v.vendedor||'')}</span></div>
      ${v.mesa?`<div style="display:flex;justify-content:space-between;"><span>Mesa</span><span>${escapeHtml(v.mesa)}</span></div>`:''}
    </div>
    <div style="border-top:1px dashed #000;padding-top:5px;">
      <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:bold;border-bottom:1px solid #000;padding-bottom:4px;margin-bottom:5px;"><span>CANT / PRODUCTO</span><span>VALOR</span></div>
      ${v.items.map(i=>`<div style="display:flex;justify-content:space-between;font-size:15px;padding:4px 0;font-weight:500;"><span style="flex:1;padding-right:8px;">${i.qty} × ${escapeHtml(i.nombre)}</span><span>${fmtMoney(i.precio*i.qty)}</span></div>`).join('')}
    </div>
    <div style="border-top:1px dashed #000;margin-top:6px;padding-top:6px;font-size:15px;font-weight:500;">
      <div style="display:flex;justify-content:space-between;"><span>Subtotal</span><span>${fmtMoney(subtotal)}</span></div>
    </div>
    <div style="border-top:2px solid #000;border-bottom:2px solid #000;margin-top:6px;padding:9px 0;display:flex;justify-content:space-between;font-size:20px;font-weight:800;">
      <span>TOTAL</span><span>${fmtMoney(v.total)}</span>
    </div>
    <div style="text-align:center;font-size:14px;margin-top:6px;font-weight:500;">Forma de pago: ${escapeHtml((v.metodo||'').toUpperCase())}</div>
    <div style="text-align:center;margin-top:12px;font-size:16px;font-weight:800;">¡GRACIAS POR SU COMPRA!</div>
    <div style="text-align:center;font-size:12px;color:#000;margin-top:10px;border-top:1px dashed #000;padding-top:8px;font-weight:500;">Wallace System · WALLACE COMPANY SYSTEM</div>
  </div>`;
  const w=window.open('','_blank','width='+ventanaW+',height=650');
  w.document.write('<html><head><title>Factura</title><style>'+pagina+' body{margin:0;}</style></head><body>'+html+'</body></html>');
  w.document.close(); setTimeout(()=>w.print(),300);
}

// ============================================================
//  CLIENTES (universal)
// ============================================================
function clientes(){
  const cls=misDatos('clientes');
  return `
    <div class="card">
      <div class="inv-head">
        <div class="card-title">👥 Clientes</div>
        <button class="btn btn-gold btn-sm" onclick="nuevoCliente()">+ Agregar cliente</button>
      </div>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Nombre</th><th>Teléfono</th><th>Dirección</th><th></th></tr></thead>
        <tbody>
        ${cls.length? cls.map(c=>`<tr><td><strong>${escapeHtml(c.nombre)}</strong></td><td>${escapeHtml(c.tel||'—')}</td><td>${escapeHtml(c.dir||'—')}</td><td class="actions"><button class="btn btn-sm btn-danger" onclick="eliminarCliente('${c.id}')">×</button></td></tr>`).join('') : '<tr><td colspan="4" class="muted">Sin clientes aún.</td></tr>'}
        </tbody>
      </table></div>
    </div>`;
}
function nuevoCliente(){
  abrirModal({titulo:'Nuevo cliente', textoBoton:'Agregar', campos:[
    {id:'nombre', label:'Nombre', requerido:true},
    {id:'tel', label:'Teléfono', tipo:'tel'},
    {id:'dir', label:'Dirección'}
  ], onGuardar:(d)=>{
    const cls=misDatos('clientes');
    cls.push({id:uid(), nombre:d.nombre, tel:d.tel, dir:d.dir, creado:now()});
    guardarMisDatos('clientes',cls);
    cerrarModal(); toast('Cliente agregado','success'); render();
  }});
}
function eliminarCliente(id){ confirmarModal('¿Eliminar este cliente?',()=>{ guardarMisDatos('clientes',misDatos('clientes').filter(c=>c.id!==id)); toast('Eliminado','info'); render(); },'Eliminar'); }

// ============================================================
//  CITAS / TURNOS (barbería, salón)
// ============================================================
function citas(){
  const cits=misDatos('citas').sort((a,b)=>new Date(a.fechaHora)-new Date(b.fechaHora));
  return `
    <div class="card">
      <div class="inv-head">
        <div class="card-title">📅 Citas / Turnos</div>
        <button class="btn btn-gold btn-sm" onclick="nuevaCita()">+ Agendar cita</button>
      </div>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Fecha y hora</th><th>Cliente</th><th>Servicio</th><th>Profesional</th><th>Estado</th><th></th></tr></thead>
        <tbody>
        ${cits.length? cits.map(c=>`<tr>
          <td>${fmtDate(c.fechaHora)}</td>
          <td><strong>${escapeHtml(c.cliente)}</strong></td>
          <td>${escapeHtml(c.servicio||'—')}</td>
          <td>${escapeHtml(c.profesional||'—')}</td>
          <td>${c.estado==='atendida'?'<span class="pill pill-green">Atendida</span>':c.estado==='cancelada'?'<span class="pill pill-red">Cancelada</span>':'<span class="pill">Pendiente</span>'}</td>
          <td class="actions">
            ${c.estado==='pendiente'?`<button class="btn btn-sm btn-green" onclick="marcarCita('${c.id}','atendida')">✓</button><button class="btn btn-sm btn-danger" onclick="marcarCita('${c.id}','cancelada')">×</button>`:''}
          </td>
        </tr>`).join('') : '<tr><td colspan="6" class="muted">Sin citas agendadas.</td></tr>'}
        </tbody>
      </table></div>
    </div>`;
}
function nuevaCita(){
  abrirModal({titulo:'Agendar cita', textoBoton:'Agendar', campos:[
    {id:'cliente', label:'Cliente', requerido:true},
    {id:'fecha', label:'Fecha', tipo:'date', valor:today()},
    {id:'hora', label:'Hora', tipo:'time', valor:'10:00'},
    {id:'servicio', label:'Servicio', valor:'Corte'},
    {id:'profesional', label:'Profesional'}
  ], onGuardar:(d)=>{
    const cits=misDatos('citas');
    cits.push({id:uid(), cliente:d.cliente, fechaHora:d.fecha+'T'+(d.hora||'10:00')+':00', servicio:d.servicio, profesional:d.profesional, estado:'pendiente', creado:now()});
    guardarMisDatos('citas',cits);
    cerrarModal(); toast('Cita agendada','success'); render();
  }});
}
function marcarCita(id,estado){
  const cits=misDatos('citas'); const c=cits.find(x=>x.id===id); if(!c)return;
  c.estado=estado; guardarMisDatos('citas',cits);
  toast(estado==='atendida'?'Cita atendida':'Cita cancelada','info'); render();
}
function today(){ return new Date().toISOString().split('T')[0]; }

// (versión alternativa de reportes, no usada; se usa reportesNeg)
function reportesAlt(){
  const ventasArr=misDatos('ventas').filter(v=>v.estado==='pagada');
  const hoy=today();
  const ventasHoy=ventasArr.filter(v=>(v.fecha||'').startsWith(hoy));
  const totalHoy=ventasHoy.reduce((a,v)=>a+v.total,0);
  const totalMes=ventasArr.filter(v=>(v.fecha||'').substring(0,7)===hoy.substring(0,7)).reduce((a,v)=>a+v.total,0);
  // Productos más vendidos
  const prods={};
  ventasArr.forEach(v=>v.items.forEach(i=>{ prods[i.nombre]=(prods[i.nombre]||0)+i.qty; }));
  const top=Object.entries(prods).sort((a,b)=>b[1]-a[1]).slice(0,10);
  return `
    <div class="stats-grid">
      <div class="stat-card green"><div class="stat-label">Ventas hoy</div><div class="stat-value">${fmtMoney(totalHoy)}</div><div class="stat-sub">${ventasHoy.length} venta(s)</div></div>
      <div class="stat-card gold"><div class="stat-label">Ventas del mes</div><div class="stat-value">${fmtMoney(totalMes)}</div></div>
      <div class="stat-card"><div class="stat-label">Ventas totales</div><div class="stat-value">${fmtMoney(ventasArr.reduce((a,v)=>a+v.total,0))}</div><div class="stat-sub">${ventasArr.length} en total</div></div>
    </div>
    <div class="card">
      <div class="card-title">Más vendidos</div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>Producto</th><th>Cantidad</th></tr></thead>
      <tbody>${top.length? top.map(([n,q])=>`<tr><td>${escapeHtml(n)}</td><td class="font-bold">${q}</td></tr>`).join('') : '<tr><td colspan="2" class="muted">Sin ventas aún</td></tr>'}</tbody></table></div>
    </div>`;
}

// ============================================================
//  GASTOS DEL NEGOCIO (universal)
// ============================================================
function gastosneg(){
  const gastos=misDatos('gastos_negocio');
  const mes=today().substring(0,7);
  const delMes=gastos.filter(g=>(g.fecha||'').substring(0,7)===mes);
  const total=delMes.reduce((a,g)=>a+g.valor,0);
  return `
    <div class="card">
      <div class="inv-head">
        <div class="card-title">🧾 Gastos del Negocio</div>
        <button class="btn btn-gold btn-sm" onclick="nuevoGasto()">+ Registrar gasto</button>
      </div>
      <p class="muted" style="margin-bottom:10px;">Gastos aparte de la caja (arriendo, recibos, materia prima...). Total del mes: <strong>${fmtMoney(total)}</strong></p>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Fecha</th><th>Concepto</th><th>N° Factura</th><th>Valor</th><th></th></tr></thead>
        <tbody>
        ${delMes.length? delMes.map(g=>`<tr><td>${escapeHtml((g.fecha||'').split('T')[0])}</td><td><strong>${escapeHtml(g.concepto)}</strong></td><td>${escapeHtml(g.factura||'—')}</td><td class="txt-red">${fmtMoney(g.valor)}</td><td class="actions"><button class="btn btn-sm btn-danger" onclick="eliminarGasto('${g.id}')">×</button></td></tr>`).join('') : '<tr><td colspan="5" class="muted">Sin gastos este mes.</td></tr>'}
        </tbody>
      </table></div>
    </div>`;
}
function nuevoGasto(){
  abrirModal({titulo:'Registrar gasto', textoBoton:'Registrar', campos:[
    {id:'concepto', label:'Concepto (arriendo, luz, materia prima...)', requerido:true},
    {id:'valor', label:'Valor', tipo:'number', requerido:true},
    {id:'fecha', label:'Fecha', tipo:'date', valor:today()},
    {id:'factura', label:'N° de factura (opcional)'}
  ], onGuardar:(d)=>{
    const valor=parseFloat(d.valor)||0; if(valor<=0){toast('Valor inválido','error');return;}
    const gastos=misDatos('gastos_negocio');
    gastos.unshift({id:uid(), concepto:d.concepto, valor, fecha:d.fecha||today(), factura:d.factura, por:STATE.user.nombre, creado:now()});
    guardarMisDatos('gastos_negocio',gastos);
    cerrarModal(); toast('Gasto registrado','success'); render();
  }});
}
function eliminarGasto(id){ confirmarModal('¿Eliminar este gasto?',()=>{ guardarMisDatos('gastos_negocio',misDatos('gastos_negocio').filter(g=>g.id!==id)); toast('Eliminado','info'); render(); },'Eliminar'); }

// ============================================================
//  REGISTRO CONTABLE MENSUAL (universal)
// ============================================================
function contable(){
  const mes=today().substring(0,7);
  const ventasArr=misDatos('ventas').filter(v=>v.estado==='pagada' && (v.fecha||'').substring(0,7)===mes);
  const totalVentas=ventasArr.reduce((a,v)=>a+v.total,0);
  const porMetodo={efectivo:0,banco:0,tarjeta:0};
  ventasArr.forEach(v=>{ porMetodo[v.metodo]=(porMetodo[v.metodo]||0)+v.total; });
  const gastos=misDatos('gastos_negocio').filter(g=>(g.fecha||'').substring(0,7)===mes);
  const totalGastos=gastos.reduce((a,g)=>a+g.valor,0);
  const utilidad=totalVentas-totalGastos;
  return `
    <div class="stats-grid">
      <div class="stat-card green"><div class="stat-label">Ventas del mes</div><div class="stat-value">${fmtMoney(totalVentas)}</div></div>
      <div class="stat-card"><div class="stat-label">Gastos del mes</div><div class="stat-value">${fmtMoney(totalGastos)}</div></div>
      <div class="stat-card gold"><div class="stat-label">Utilidad estimada</div><div class="stat-value">${fmtMoney(utilidad)}</div><div class="stat-sub">ventas − gastos</div></div>
    </div>
    <div class="card">
      <div class="card-title">Ventas por método de pago</div>
      <div class="resumen-row"><span>Efectivo</span><strong>${fmtMoney(porMetodo.efectivo)}</strong></div>
      <div class="resumen-row"><span>Banco</span><strong>${fmtMoney(porMetodo.banco)}</strong></div>
      <div class="resumen-row"><span>Tarjeta</span><strong>${fmtMoney(porMetodo.tarjeta)}</strong></div>
      <div class="resumen-row big"><span>TOTAL</span><strong>${fmtMoney(totalVentas)}</strong></div>
      <p class="muted" style="margin-top:8px;">Informe interno de gestión. No es tributario ni tiene relación con la DIAN.</p>
    </div>`;
}

// ============================================================
//  CATÁLOGO DE PRODUCTOS/SERVICIOS (universal)
// ============================================================
function catalogo(){
  const neg=STATE.negocio;
  const productos=misDatos('productos');
  const pp=neg.palabraProducto||'Producto';
  const pps=neg.palabraProductos||'Productos';
  return `
    <div class="card">
      <div class="inv-head">
        <div class="card-title">🍽️ Catálogo de ${escapeHtml(pps)}</div>
        <button class="btn btn-gold btn-sm" onclick="abrirNuevoProducto()">+ Agregar ${escapeHtml(pp.toLowerCase())}</button>
      </div>
      ${productos.length?`<div class="catalogo-grid">
        ${productos.map(p=>`<div class="cat-card ${p.agotado?'agotado':''}">
          <div class="cat-card-img" style="${p.imagen?`background-image:url('${p.imagen}')`:''}">${!p.imagen?ic('menu'):''}${p.agotado?'<span class="cat-agotado-badge">AGOTADO</span>':''}</div>
          <div class="cat-card-body">
            <div class="cat-card-nombre">${escapeHtml(p.nombre)}</div>
            <div class="cat-card-cat">${escapeHtml(p.categoria||'General')}</div>
            <div class="cat-card-precio">${fmtMoney(p.precio)}</div>
            ${neg.usaVariantes&&(p.variantes||[]).length?`<div class="cat-card-var">${p.variantes.map(v=>`<span>${escapeHtml(v)}</span>`).join('')}</div>`:''}
          </div>
          <div class="cat-card-actions">
            <button class="btn btn-sm" onclick="editarProducto('${p.id}')">Editar</button>
            <button class="btn btn-sm" onclick="toggleAgotado('${p.id}')">${p.agotado?'Activar':'Agotar'}</button>
            <button class="btn btn-sm btn-danger" onclick="eliminarProducto('${p.id}')">×</button>
          </div>
        </div>`).join('')}
      </div>`:`<p class="muted">Sin ${escapeHtml(pps.toLowerCase())}. Agrega el primero.</p>`}
    </div>`;
}
function abrirNuevoProducto(){ editarProducto(null); }
let _prodImgTmp=null;
function editarProducto(id){
  const neg=STATE.negocio;
  const productos=misDatos('productos');
  const p = id? productos.find(x=>x.id===id) : null;
  const pp=neg.palabraProducto||'Producto';
  _prodImgTmp = p?p.imagen||'' : '';
  const cats=[...new Set(productos.map(x=>x.categoria||'General'))];
  const campos=[
    {id:'nombre', label:'Nombre', valor:p?p.nombre:'', requerido:true},
    {id:'precio', label:'Precio', tipo:'number', valor:p?p.precio:''},
    {id:'categoria', label:'Categoría', valor:p?p.categoria:'General'}
  ];
  if(neg.usaVariantes){ campos.push({id:'variantes', label:'Variantes (tallas/colores, separadas por coma)', valor:p&&p.variantes?p.variantes.join(', '):'', placeholder:'S, M, L, XL'}); }
  abrirModal({titulo:(p?'Editar ':'Nuevo ')+pp, textoBoton:'Guardar', campos, extraHTML:`
    <div class="m-row"><label>Imagen (opcional)</label>
      <input type="file" accept="image/*" onchange="cargarImgProducto(event)">
      <div id="prod-img-preview" style="margin-top:8px;">${_prodImgTmp?`<img src="${_prodImgTmp}" style="max-height:90px;border-radius:10px;">`:''}</div>
    </div>`, onGuardar:(d)=>{
    if(!d.nombre){ toast('Escribe un nombre','error'); return; }
    const precio=parseFloat(d.precio)||0;
    let variantes=p?p.variantes:[];
    if(neg.usaVariantes && d.variantes!=null){ variantes=d.variantes.split(',').map(s=>s.trim()).filter(Boolean); }
    if(p){ p.nombre=d.nombre; p.precio=precio; p.categoria=d.categoria||'General'; p.variantes=variantes; p.imagen=_prodImgTmp; }
    else { productos.push({id:uid(), nombre:d.nombre, precio, categoria:d.categoria||'General', variantes, imagen:_prodImgTmp, agotado:false, receta:[], creado:now()}); }
    guardarMisDatos('productos',productos);
    cerrarModal(); toast('Guardado','success'); render();
  }});
}
function cargarImgProducto(e){
  const file=e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=ev=>{ _prodImgTmp=ev.target.result; const pv=document.getElementById('prod-img-preview'); if(pv) pv.innerHTML=`<img src="${_prodImgTmp}" style="max-height:90px;border-radius:10px;">`; };
  reader.readAsDataURL(file);
}
function toggleAgotado(id){
  const productos=misDatos('productos'); const p=productos.find(x=>x.id===id); if(!p) return;
  p.agotado=!p.agotado; guardarMisDatos('productos',productos); render();
}
function eliminarProducto(id){
  confirmarModal('¿Eliminar este producto?',()=>{
    guardarMisDatos('productos', misDatos('productos').filter(p=>p.id!==id));
    toast('Eliminado','info'); render();
  },'Eliminar');
}

// ============================================================
//  NUEVA VENTA (universal)
// ============================================================
let _carrito = [];
let _ventaTipo = 'llevar';   // mesa | llevar | domicilio
let _ventaCat = 'Todas';
let _ventaBusca = '';
let _ventaMesa = '';
let _ventaCli = {nombre:'',tel:'',dir:'',barrio:'',domiciliario:'',valorDom:0};
let _ventaObs = '';

function ventas(){
  const neg=STATE.negocio;
  // Caja obligatoria si el negocio usa caja
  if((neg.funciones||[]).includes('caja') && !misDatos('caja_actual')[0]){
    return `<div class="card" style="max-width:520px;margin:40px auto;text-align:center;padding:40px;">
      <div style="font-size:44px;margin-bottom:12px;">🔒</div>
      <div class="card-title" style="justify-content:center;">Caja cerrada</div>
      <p class="muted" style="margin-bottom:16px;">Debes abrir la caja antes de vender, para que el cuadre sea correcto.</p>
      <button class="btn btn-gold" onclick="irNeg('caja')">Ir a abrir caja</button>
    </div>`;
  }
  let productos=misDatos('productos').filter(p=>!p.agotado);
  if(_ventaCat!=='Todas') productos=productos.filter(p=>(p.categoria||'General')===_ventaCat);
  if(_ventaBusca) productos=productos.filter(p=>p.nombre.toLowerCase().includes(_ventaBusca.toLowerCase()));
  const catsAll=['Todas',...new Set(misDatos('productos').filter(p=>!p.agotado).map(p=>p.categoria||'General'))];
  const total=_carrito.reduce((a,i)=>a+i.precio*i.qty,0);
  const usaMesas=neg.usaMesas;
  const usaDom=(neg.funciones||[]).includes('domicilios');
  // Tipos de pedido según el negocio
  const tipos=[];
  if(usaMesas) tipos.push(['mesa','Mesa','table']);
  tipos.push(['llevar','Llevar','bag']);
  if(usaDom) tipos.push(['domicilio','Domicilio','truck']);
  return `
    <div class="venta-layout">
      <div style="display:flex;flex-direction:column;gap:12px;overflow:hidden;">
        <div style="position:relative;">
          <input type="text" id="v-busca" placeholder="🔍 Buscar ${escapeHtml((neg.palabraProducto||'producto').toLowerCase())}..." value="${escapeHtml(_ventaBusca)}" oninput="_ventaBusca=this.value;filtrarVenta()" class="venta-search">
        </div>
        <div class="category-tabs">${catsAll.map(c=>`<button class="cat-tab ${_ventaCat===c?'active':''}" onclick="_ventaCat='${escapeHtml(c)}';render()">${escapeHtml(c)}</button>`).join('')}</div>
        <div class="menu-grid" id="menu-grid">${productos.length?productos.map(menuCard).join(''):'<p class="muted" style="padding:20px;">Sin productos aquí. Agrégalos en el Catálogo.</p>'}</div>
      </div>
      <div class="card carrito-card">
        <div class="flex-between" style="margin-bottom:12px;"><span class="card-title" style="margin:0;">🛒 Pedido</span>${_carrito.length?`<button class="btn btn-ghost btn-sm" onclick="clearOrder()">🗑️</button>`:''}</div>
        ${tipos.length>1?`<div class="tipo-toggle">${tipos.map(([t,l])=>`<button class="btn btn-sm ${_ventaTipo===t?'btn-gold':'btn-ghost'}" onclick="setVentaTipo('${t}')">${l}</button>`).join('')}</div>`:''}
        <div id="campos-tipo">${camposTipo()}</div>
        <input type="text" placeholder="Observaciones del pedido..." class="mini-input" value="${escapeHtml(_ventaObs)}" oninput="_ventaObs=this.value">
        <div class="order-items">
        ${_carrito.length? _carrito.map((i,idx)=>`<div class="carrito-item">
          <div class="ci-info"><strong>${escapeHtml(i.nombre)}</strong><span class="muted">${fmtMoney(i.precio)} c/u</span></div>
          <div class="ci-controls"><button class="btn btn-sm" onclick="cambiarQty(${idx},-1)">−</button><span class="ci-qty">${i.qty}</span><button class="btn btn-sm" onclick="cambiarQty(${idx},1)">+</button></div>
          <div class="ci-total">${fmtMoney(i.precio*i.qty)}</div>
        </div>`).join('') : '<div class="empty-cart">🛒<p>Seleccione productos</p></div>'}
        </div>
        ${_carrito.length?`
          <div class="carrito-total"><span>TOTAL</span><span>${fmtMoney(total+ (_ventaTipo==='domicilio'?(parseFloat(_ventaCli.valorDom)||0):0))}</span></div>
          <button class="btn btn-gold btn-block" onclick="cobrarVenta()">Cobrar</button>
        `:''}
      </div>
    </div>`;
}
function camposTipo(){
  const neg=STATE.negocio;
  if(_ventaTipo==='mesa'){
    const nMesas=neg.numMesas||20;
    return `<select class="mini-input" onchange="_ventaMesa=this.value"><option value="">Seleccionar mesa...</option>${Array.from({length:nMesas},(_,i)=>`<option ${_ventaMesa==='Mesa '+(i+1)?'selected':''}>Mesa ${i+1}</option>`).join('')}</select>`;
  }
  if(_ventaTipo==='domicilio'){
    const doms=misDatos('domiciliarios').filter(d=>d.activo);
    return `
      <input type="text" class="mini-input" placeholder="Nombre del cliente" value="${escapeHtml(_ventaCli.nombre)}" oninput="_ventaCli.nombre=this.value">
      <input type="text" class="mini-input" placeholder="Teléfono" value="${escapeHtml(_ventaCli.tel)}" oninput="_ventaCli.tel=this.value">
      <input type="text" class="mini-input" placeholder="Dirección" value="${escapeHtml(_ventaCli.dir)}" oninput="_ventaCli.dir=this.value">
      <input type="text" class="mini-input" placeholder="Barrio" value="${escapeHtml(_ventaCli.barrio)}" oninput="_ventaCli.barrio=this.value">
      <input type="number" class="mini-input" placeholder="Valor del domicilio" value="${_ventaCli.valorDom||''}" oninput="_ventaCli.valorDom=this.value">
      <select class="mini-input" onchange="_ventaCli.domiciliario=this.value"><option value="">Domiciliario...</option>${doms.map(d=>`<option ${_ventaCli.domiciliario===d.nombre?'selected':''}>${escapeHtml(d.nombre)}</option>`).join('')}</select>`;
  }
  // llevar
  return `<input type="text" class="mini-input" placeholder="Nombre del cliente (opcional)" value="${escapeHtml(_ventaCli.nombre)}" oninput="_ventaCli.nombre=this.value">`;
}
function setVentaTipo(t){ _ventaTipo=t; render(); }
function filtrarVenta(){
  const neg=STATE.negocio;
  let productos=misDatos('productos').filter(p=>!p.agotado);
  if(_ventaCat!=='Todas') productos=productos.filter(p=>(p.categoria||'General')===_ventaCat);
  if(_ventaBusca) productos=productos.filter(p=>p.nombre.toLowerCase().includes(_ventaBusca.toLowerCase()));
  const g=document.getElementById('menu-grid');
  if(g) g.innerHTML=productos.length?productos.map(menuCard).join(''):'<p class="muted" style="padding:20px;">Sin resultados</p>';
}
function menuCard(p){
  const img=p.imagen?`<div class="item-img" style="background-image:url('${p.imagen}')"></div>`:`<div class="item-ic">${ic('menu')}</div>`;
  return `<div class="menu-item-card" onclick="agregarAlCarrito('${p.id}')">${img}<div class="item-name">${escapeHtml(p.nombre)}</div><div class="item-price">${fmtMoney(p.precio)}</div></div>`;
}
function clearOrder(){ _carrito=[]; _ventaObs=''; _ventaCli={nombre:'',tel:'',dir:'',barrio:'',domiciliario:'',valorDom:0}; _ventaMesa=''; render(); }
function agregarAlCarrito(prodId){
  const p=misDatos('productos').find(x=>x.id===prodId); if(!p) return;
  const ex=_carrito.find(i=>i.prodId===prodId);
  if(ex) ex.qty++; else _carrito.push({prodId, nombre:p.nombre, precio:p.precio, qty:1});
  render();
}
function cambiarQty(idx,d){ _carrito[idx].qty+=d; if(_carrito[idx].qty<=0) _carrito.splice(idx,1); render(); }
function cobrarVenta(){
  if(!_carrito.length) return;
  const neg=STATE.negocio;
  // ¿Caja abierta?
  const caja=misDatos('caja_actual')[0];
  if((neg.funciones||[]).includes('caja') && !caja){ toast('Primero abre la caja','error'); return; }
  const total=_carrito.reduce((a,i)=>a+i.precio*i.qty,0);
  abrirModal({titulo:'Cobrar '+fmtMoney(total), textoBoton:'Confirmar cobro', campos:[
    {id:'metodo', label:'Método de pago', tipo:'select', opciones:[{valor:'efectivo',label:'Efectivo'},{valor:'banco',label:'Transferencia / Banco'},{valor:'tarjeta',label:'Tarjeta / Datáfono'}]},
    {id:'recibido', label:'¿Con cuánto paga? (opcional, para calcular vuelto)', tipo:'number', placeholder:String(total)}
  ], onGuardar:(d)=>{
    const metodo=d.metodo||'efectivo';
    const recibido=parseFloat(d.recibido)||0;
    const ventasArr=misDatos('ventas');
    const valorDom=_ventaTipo==='domicilio'?(parseFloat(_ventaCli.valorDom)||0):0;
    // Numeración de factura simple
    const numFactura='F-'+String((misDatos('ventas').length+1)).padStart(5,'0');
    const venta={id:uid(), factura:numFactura, items:_carrito.slice(), total:total+valorDom, subtotal:total, valorDom,
      metodo, estado:'pagada', tipo:_ventaTipo, cajaId:caja?caja.id:null, vendedor:STATE.user.nombre, fecha:now(),
      obs:_ventaObs, mesa:_ventaTipo==='mesa'?_ventaMesa:'',
      cliNombre:_ventaCli.nombre, cliTel:_ventaCli.tel, cliDir:_ventaCli.dir, cliBarrio:_ventaCli.barrio, domiciliario:_ventaCli.domiciliario};
    if((neg.funciones||[]).includes('cocina') && neg.usaCocina){ venta.estadoCocina='pendiente'; }
    ventasArr.unshift(venta);
    guardarMisDatos('ventas',ventasArr);
    descontarInventarioVenta(venta);
    cerrarModal();
    if(metodo==='efectivo' && recibido>venta.total){ toast('Vuelto: '+fmtMoney(recibido-venta.total),'info'); }
    else { toast('Venta cobrada: '+fmtMoney(venta.total),'success'); }
    clearOrder();
    if((neg.funciones||[]).includes('facturas')){
      confirmarModal('¿Imprimir factura?', ()=>imprimirFactura(venta.id), 'Imprimir');
    }
    render();
  }});
}
function descontarInventarioVenta(venta){
  const neg=STATE.negocio;
  if(!(neg.funciones||[]).includes('inventario')) return;
  const productos=misDatos('productos');
  const insumos=misDatos('insumos');
  let cambio=false;
  venta.items.forEach(item=>{
    const prod=productos.find(p=>p.id===item.prodId);
    if(prod && prod.receta && prod.receta.length){
      prod.receta.forEach(r=>{ const ins=insumos.find(i=>i.id===r.insumoId); if(ins){ ins.stock-=r.cantidad*item.qty; if(ins.stock<0)ins.stock=0; cambio=true; } });
    }
  });
  if(cambio) guardarMisDatos('insumos',insumos);
}

// ============================================================
//  PEDIDOS (lista de ventas con acciones)
// ============================================================
let _pedidosBusca='';
function pedidos(){
  const neg=STATE.negocio;
  const caja=misDatos('caja_actual')[0];
  let vs=misDatos('ventas');
  // Mostrar los de la caja actual si hay caja abierta
  if(caja) vs=vs.filter(v=>v.cajaId===caja.id || !v.cajaId);
  if(_pedidosBusca){ const q=_pedidosBusca.toLowerCase(); vs=vs.filter(v=>(v.factura||'').toLowerCase().includes(q)||(v.cliNombre||'').toLowerCase().includes(q)||(v.cliTel||'').includes(q)||(v.mesa||'').toLowerCase().includes(q)); }
  return `
    <div class="card">
      <div class="flex-between" style="margin-bottom:16px;flex-wrap:wrap;gap:10px;">
        <span class="card-title" style="margin:0;">${ic('report')} Pedidos ${caja?'(caja actual)':''}</span>
        <div style="display:flex;gap:10px;">
          <input type="text" placeholder="🔍 Factura, cliente, teléfono..." value="${escapeHtml(_pedidosBusca)}" oninput="_pedidosBusca=this.value;render()" style="padding:10px 14px;background:var(--panel2);border:1px solid var(--line2);border-radius:10px;color:var(--txt);">
          <button class="btn btn-gold" onclick="irNeg('ventas')">+ Nueva</button>
        </div>
      </div>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Pedido</th><th>Tipo</th><th>Cliente/Mesa</th><th>Total</th><th>Estado</th><th>Fecha</th><th>Acciones</th></tr></thead>
        <tbody>
        ${vs.length? vs.slice(0,60).map(v=>`<tr>
          <td><strong class="text-gold">${escapeHtml(v.factura||'—')}</strong></td>
          <td>${tipoLabelU(v.tipo)}</td>
          <td>${escapeHtml(v.cliNombre||v.mesa||'—')}${v.cliTel?`<br><span class="muted" style="font-size:11px;">${escapeHtml(v.cliTel)}</span>`:''}</td>
          <td class="font-bold">${fmtMoney(v.total)}</td>
          <td>${v.estado==='anulada'?'<span class="pill pill-red">Anulada</span>':'<span class="pill pill-green">Pagada</span>'}</td>
          <td class="muted" style="font-size:12px;">${fmtDate(v.fecha)}</td>
          <td class="actions">
            ${(neg.funciones||[]).includes('facturas')?`<button class="btn btn-sm" title="Imprimir" onclick="imprimirFactura('${v.id}')">🖨️</button>`:''}
            ${v.estado!=='anulada'?`<button class="btn btn-sm btn-danger" title="Anular" onclick="anularVenta('${v.id}')">✕</button>`:''}
          </td>
        </tr>`).join('') : '<tr><td colspan="7" class="muted">Sin pedidos aún.</td></tr>'}
        </tbody>
      </table></div>
    </div>`;
}
function tipoLabelU(t){ return {mesa:'Mesa',domicilio:'Domicilio',llevar:'Para llevar'}[t]||'—'; }
function anularVenta(id){
  confirmarModal('¿Anular este pedido? Se devolverá el inventario si aplica.',()=>{
    const ventasArr=misDatos('ventas'); const v=ventasArr.find(x=>x.id===id); if(!v)return;
    v.estado='anulada';
    // Devolver inventario
    const neg=STATE.negocio;
    if((neg.funciones||[]).includes('inventario')){
      const productos=misDatos('productos'); const insumos=misDatos('insumos'); let cambio=false;
      v.items.forEach(item=>{ const prod=productos.find(p=>p.id===item.prodId); if(prod&&prod.receta){ prod.receta.forEach(r=>{ const ins=insumos.find(i=>i.id===r.insumoId); if(ins){ins.stock+=r.cantidad*item.qty;cambio=true;} }); } });
      if(cambio) guardarMisDatos('insumos',insumos);
    }
    guardarMisDatos('ventas',ventasArr);
    toast('Pedido anulado','info'); render();
  },'Anular');
}

// ============================================================
//  CAJA (universal)
// ============================================================
function caja(){
  const neg=STATE.negocio;
  const cajaAct=misDatos('caja_actual')[0];
  if(!cajaAct){
    return `<div class="card" style="max-width:480px;margin:40px auto;text-align:center;padding:40px;">
      <div style="font-size:44px;margin-bottom:10px;">💰</div>
      <div class="card-title" style="justify-content:center;">Abrir caja</div>
      <p class="muted" style="margin-bottom:14px;">Escribe con cuánto dinero base abres la caja hoy. Esto es necesario para que el cuadre sea correcto.</p>
      <div class="form-row"><label>Base inicial (COP)</label><input id="caja-base" type="number" placeholder="0"></div>
      <button class="btn btn-gold btn-block" onclick="abrirCaja()">Abrir caja</button>
    </div>`;
  }
  const ventasCaja=misDatos('ventas').filter(v=>v.cajaId===cajaAct.id && v.estado==='pagada');
  // Ventas por método (solo la venta real de productos, sin domicilio)
  const porMetodo={efectivo:0,banco:0,tarjeta:0};
  ventasCaja.forEach(v=>{ const real=v.subtotal!==undefined?v.subtotal:v.total; if(porMetodo[v.metodo]!==undefined) porMetodo[v.metodo]+=real; });
  const totalVentas=porMetodo.efectivo+porMetodo.banco+porMetodo.tarjeta;
  // Dinero de terceros (no es ingreso del negocio)
  const propinas=ventasCaja.reduce((a,v)=>a+(v.propina||0),0);
  const domicilios=ventasCaja.reduce((a,v)=>a+(v.valorDom||0),0);
  const recargos=ventasCaja.reduce((a,v)=>a+(v.recargo||0),0);
  // Movimientos de caja (gastos y retiros)
  const movs=(cajaAct.movimientos||[]);
  const gastos=movs.filter(m=>m.tipo==='gasto').reduce((a,m)=>a+m.valor,0);
  const retiros=movs.filter(m=>m.tipo==='retiro').reduce((a,m)=>a+m.valor,0);
  const entradas=movs.filter(m=>m.tipo==='entrada').reduce((a,m)=>a+m.valor,0);
  // Domicilios pagados en efectivo del cajón (si el domicilio entró por banco)
  const domBanco=ventasCaja.filter(v=>v.valorDom>0 && v.metodo!=='efectivo').reduce((a,v)=>a+v.valorDom,0);
  // Efectivo en caja
  const efectivoEnCaja=cajaAct.base + porMetodo.efectivo + entradas - gastos - retiros - domBanco;
  return `
    <div class="stats-grid">
      <div class="stat-card green"><div class="stat-icon">${ic('cash')}</div><div class="stat-label">Efectivo</div><div class="stat-value">${fmtMoney(porMetodo.efectivo)}</div></div>
      <div class="stat-card blue"><div class="stat-icon">${ic('cash')}</div><div class="stat-label">Banco</div><div class="stat-value">${fmtMoney(porMetodo.banco)}</div></div>
      <div class="stat-card gold"><div class="stat-icon">${ic('cash')}</div><div class="stat-label">Tarjeta</div><div class="stat-value">${fmtMoney(porMetodo.tarjeta)}</div></div>
    </div>
    <p class="muted" style="margin-bottom:14px;">Venta recibida por cada método. Total venta: <strong>${fmtMoney(totalVentas)}</strong>.</p>
    <div class="grid-2">
      <div class="card">
        <div class="card-title">${ic('cash')} Resumen de caja</div>
        <div class="resumen-row"><span>Apertura</span><strong>${fmtDate(cajaAct.apertura)}</strong></div>
        <div class="resumen-row"><span>Base inicial</span><strong>${fmtMoney(cajaAct.base)}</strong></div>
        <div class="resumen-row"><span>Ventas (solo productos)</span><strong class="text-green">${fmtMoney(totalVentas)}</strong></div>
        <div class="resumen-row"><span>Entradas extra</span><strong class="text-green">${fmtMoney(entradas)}</strong></div>
        <div class="resumen-row"><span>Gastos / Nómina</span><strong class="text-red">-${fmtMoney(gastos)}</strong></div>
        <div class="resumen-row"><span>Retiros</span><strong class="text-red">-${fmtMoney(retiros)}</strong></div>
        <div class="resumen-row big"><span>Efectivo en caja</span><strong>${fmtMoney(efectivoEnCaja)}</strong></div>
        <p class="muted" style="margin-top:8px;font-size:12px;">Efectivo del cajón: base + ventas en efectivo + entradas − gastos − retiros − domicilios pagados por banco. Solo la venta de productos es del negocio.</p>
        <div style="display:flex;gap:8px;margin-top:14px;">
          <button class="btn" style="flex:1;" onclick="movCaja('gasto')">$ Gasto</button>
          <button class="btn" style="flex:1;" onclick="movCaja('retiro')">$ Retiro</button>
          <button class="btn" style="flex:1;" onclick="movCaja('entrada')">$ Entrada</button>
        </div>
        <button class="btn btn-danger btn-block" style="margin-top:8px;" onclick="cerrarCaja()">🔒 Cerrar caja</button>
      </div>
      <div class="card">
        <div class="card-title">${ic('users')} No son ingreso del negocio</div>
        <p class="muted" style="margin-bottom:10px;">Estos valores se cobran pero pertenecen a terceros. No suman a las ventas reales.</p>
        <div class="resumen-row"><span>Propinas (del mesero)</span><strong class="text-green">${fmtMoney(propinas)}</strong></div>
        <div class="resumen-row"><span>Domicilios (del domiciliario)</span><strong class="text-green">${fmtMoney(domicilios)}</strong></div>
        <div class="resumen-row"><span>Recargos datáfono</span><strong class="text-gold">${fmtMoney(recargos)}</strong></div>
        ${movs.length?`<div class="card-title" style="font-size:13px;margin-top:16px;">Movimientos del día</div>
          ${movs.map(m=>`<div class="resumen-row"><span>${m.tipo==='gasto'?'Gasto':m.tipo==='retiro'?'Retiro':'Entrada'}: ${escapeHtml(m.concepto||'')}</span><strong class="${m.tipo==='entrada'?'text-green':'text-red'}">${m.tipo==='entrada'?'+':'-'}${fmtMoney(m.valor)}</strong></div>`).join('')}`:'<p class="muted" style="margin-top:14px;">Sin movimientos registrados.</p>'}
      </div>
    </div>`;
}
function abrirCaja(){
  const base=parseFloat(document.getElementById('caja-base').value)||0;
  guardarMisDatos('caja_actual',[{id:uid(), base, apertura:now(), cajero:STATE.user.nombre, movimientos:[]}]);
  toast('Caja abierta','success'); render();
}
function movCaja(tipo){
  const titulos={gasto:'Registrar gasto de caja',retiro:'Registrar retiro',entrada:'Registrar entrada de efectivo'};
  abrirModal({titulo:titulos[tipo], textoBoton:'Registrar', campos:[
    {id:'concepto', label:'Concepto', requerido:true, placeholder:tipo==='gasto'?'Ej: compra de servilletas':tipo==='retiro'?'Ej: retiro del dueño':'Ej: préstamo caja'},
    {id:'valor', label:'Valor', tipo:'number', requerido:true}
  ], onGuardar:(d)=>{
    const valor=parseFloat(d.valor)||0; if(valor<=0){toast('Valor inválido','error');return;}
    const cajas=misDatos('caja_actual'); const c=cajas[0]; if(!c)return;
    if(!c.movimientos) c.movimientos=[];
    c.movimientos.push({id:uid(), tipo, concepto:d.concepto, valor, por:STATE.user.nombre, fecha:now()});
    guardarMisDatos('caja_actual',cajas);
    cerrarModal(); toast('Registrado','success'); render();
  }});
}
function cerrarCaja(){
  const cajaAct=misDatos('caja_actual')[0]; if(!cajaAct) return;
  const ventasCaja=misDatos('ventas').filter(v=>v.cajaId===cajaAct.id && v.estado==='pagada');
  const efectivoVentas=ventasCaja.filter(v=>v.metodo==='efectivo').reduce((a,v)=>a+(v.subtotal!==undefined?v.subtotal:v.total),0);
  const movs=cajaAct.movimientos||[];
  const gastos=movs.filter(m=>m.tipo==='gasto').reduce((a,m)=>a+m.valor,0);
  const retiros=movs.filter(m=>m.tipo==='retiro').reduce((a,m)=>a+m.valor,0);
  const entradas=movs.filter(m=>m.tipo==='entrada').reduce((a,m)=>a+m.valor,0);
  const domBanco=ventasCaja.filter(v=>v.valorDom>0 && v.metodo!=='efectivo').reduce((a,v)=>a+v.valorDom,0);
  const esperado=cajaAct.base+efectivoVentas+entradas-gastos-retiros-domBanco;
  abrirModal({titulo:'Cerrar caja', textoBoton:'Cerrar caja', campos:[
    {id:'contado', label:'Cuenta el efectivo del cajón. Esperado: '+fmtMoney(esperado), tipo:'number', valor:String(esperado), requerido:true}
  ], onGuardar:(d)=>{
    const contado=parseFloat(d.contado)||0;
    const dif=contado-esperado;
    const cierres=misDatos('cierres');
    cierres.unshift({id:uid(), ...cajaAct, cierre:now(), totalVentas:ventasCaja.reduce((a,v)=>a+v.total,0), esperado, contado, diferencia:dif});
    guardarMisDatos('cierres',cierres);
    guardarMisDatos('caja_actual',[]);
    cerrarModal();
    toast(dif===0?'Caja cuadrada ✓':dif>0?'Sobró '+fmtMoney(dif):'Faltó '+fmtMoney(Math.abs(dif)), dif===0?'success':'info');
    render();
  }});
}

// ============================================================
//  MÓDULO DE INVENTARIO (universal, para cualquier negocio)
//  - Restaurantes: insumos + recetas (materia prima por plato)
//  - Tiendas/ropa/accesorios: productos por unidades (stock directo)
//  Se guarda por negocio (aislado).
// ============================================================
let _invTab = 'insumos';

function inventario(){
  const neg=STATE.negocio;
  const usaRecetas=(neg.funciones||[]).includes('recetas');
  const tabs=[['insumos','Insumos/Stock'],['movimientos','Movimientos'],['alertas','Alertas']];
  if(usaRecetas) tabs.splice(1,0,['recetas','Recetas']);
  tabs.push(['reportes','Reportes']);

  let contenido='';
  if(_invTab==='insumos') contenido=invInsumos();
  else if(_invTab==='recetas') contenido=invRecetas();
  else if(_invTab==='movimientos') contenido=invMovimientos();
  else if(_invTab==='alertas') contenido=invAlertas();
  else if(_invTab==='reportes') contenido=invReportes();

  return `
    <div class="card">
      <div class="card-title">📦 Inventario</div>
      <div class="tabs">
        ${tabs.map(([id,label])=>`<button class="tab ${_invTab===id?'active':''}" onclick="_invTab='${id}';render()">${label}</button>`).join('')}
      </div>
      ${contenido}
    </div>`;
}

// --- Pestaña INSUMOS / STOCK ---
function invInsumos(){
  const insumos=misDatos('insumos');
  return `
    <div class="inv-head">
      <p class="muted">Cada insumo/producto con su stock. Cuando baja del mínimo, se avisa.</p>
      <button class="btn btn-gold btn-sm" onclick="abrirNuevoInsumo()">+ Agregar</button>
    </div>
    <div class="table-wrap"><table class="tbl">
      <thead><tr><th>Nombre</th><th>Unidad</th><th>Stock actual</th><th>Mínimo</th><th>Costo</th><th>Estado</th><th></th></tr></thead>
      <tbody>
      ${insumos.length? insumos.map(i=>{
        const bajo=i.stock<=i.minimo;
        return `<tr>
          <td><strong>${escapeHtml(i.nombre)}</strong></td>
          <td>${escapeHtml(i.unidad||'und')}</td>
          <td class="${bajo?'txt-red':''}">${i.stock}</td>
          <td>${i.minimo}</td>
          <td>${i.costo?fmtMoney(i.costo):'—'}</td>
          <td>${bajo?'<span class="pill pill-red">Bajo</span>':'<span class="pill pill-green">OK</span>'}</td>
          <td class="actions">
            <button class="btn btn-sm" onclick="movimientoInsumo('${i.id}','entrada')">+ Entrada</button>
            <button class="btn btn-sm" onclick="movimientoInsumo('${i.id}','salida')">− Salida</button>
            <button class="btn btn-sm btn-danger" onclick="eliminarInsumo('${i.id}')">×</button>
          </td>
        </tr>`;
      }).join('') : '<tr><td colspan="7" class="muted">Sin insumos. Agrega el primero.</td></tr>'}
      </tbody>
    </table></div>`;
}
function abrirNuevoInsumo(){
  abrirModal({titulo:'Agregar insumo/producto', textoBoton:'Agregar', campos:[
    {id:'nombre', label:'Nombre', requerido:true},
    {id:'unidad', label:'Unidad', tipo:'select', opciones:['und','g','ml','kg','l','paquete'], valor:'und'},
    {id:'stock', label:'Stock inicial', tipo:'number', valor:'0'},
    {id:'minimo', label:'Stock mínimo (para alertas)', tipo:'number', valor:'5'},
    {id:'costo', label:'Costo de compra (opcional)', tipo:'number', valor:'0'}
  ], onGuardar:(d)=>{
    const insumos=misDatos('insumos');
    insumos.push({id:uid(), nombre:d.nombre, unidad:d.unidad||'und', stock:parseFloat(d.stock)||0, minimo:parseFloat(d.minimo)||0, costo:parseFloat(d.costo)||0, creado:now()});
    guardarMisDatos('insumos',insumos);
    cerrarModal(); toast('Insumo agregado','success'); render();
  }});
}
function movimientoInsumo(id,tipo){
  const insumos=misDatos('insumos');
  const ins=insumos.find(i=>i.id===id); if(!ins) return;
  abrirModal({titulo:(tipo==='entrada'?'Entrada de ':'Salida de ')+ins.nombre, textoBoton:'Registrar', campos:[
    {id:'cant', label:'¿Cuánto '+(tipo==='entrada'?'entra':'sale')+'? ('+ins.unidad+')', tipo:'number', requerido:true},
    {id:'motivo', label:'Motivo', valor:tipo==='entrada'?'Compra':'Merma'}
  ], onGuardar:(d)=>{
    const cant=parseFloat(d.cant)||0; if(cant<=0){toast('Cantidad inválida','error');return;}
    ins.stock += (tipo==='entrada'?cant:-cant);
    if(ins.stock<0) ins.stock=0;
    guardarMisDatos('insumos',insumos);
    const movs=misDatos('movimientos');
    movs.unshift({id:uid(), insumoId:id, insumoNombre:ins.nombre, tipo, cantidad:cant, motivo:d.motivo, por:STATE.user.nombre, fecha:now()});
    guardarMisDatos('movimientos',movs);
    cerrarModal(); toast('Movimiento registrado','success'); render();
  }});
}
function eliminarInsumo(id){
  confirmarModal('¿Eliminar este insumo?',()=>{
    guardarMisDatos('insumos', misDatos('insumos').filter(i=>i.id!==id));
    toast('Eliminado','info'); render();
  },'Eliminar');
}

// --- Pestaña RECETAS (solo si el negocio usa recetas) ---
function invRecetas(){
  const productos=misDatos('productos');
  const insumos=misDatos('insumos');
  return `
    <p class="muted" style="margin-bottom:10px;">Define qué insumos consume cada ${escapeHtml((STATE.negocio.palabraProducto||'producto').toLowerCase())}. Al vender, se descuentan solos del stock.</p>
    ${productos.length? productos.map(p=>{
      const receta=p.receta||[];
      return `<div class="receta-card">
        <div class="receta-head"><strong>${escapeHtml(p.nombre)}</strong><button class="btn btn-sm" onclick="editarReceta('${p.id}')">Editar receta</button></div>
        ${receta.length? '<div class="receta-items">'+receta.map(r=>{ const ins=insumos.find(i=>i.id===r.insumoId); return `<span class="receta-pill">${ins?escapeHtml(ins.nombre):'?'}: ${r.cantidad} ${ins?ins.unidad:''}</span>`; }).join('')+'</div>' : '<span class="muted">Sin receta definida</span>'}
      </div>`;
    }).join('') : '<p class="muted">Primero crea productos en el catálogo.</p>'}`;
}
function editarReceta(prodId){
  const productos=misDatos('productos');
  const p=productos.find(x=>x.id===prodId); if(!p) return;
  const insumos=misDatos('insumos');
  if(!insumos.length){ toast('Primero agrega insumos','error'); return; }
  const recetaActual=p.receta||[];
  // Un campo por insumo, con la cantidad actual (0 = no se usa)
  const campos=insumos.map(ins=>{
    const r=recetaActual.find(x=>x.insumoId===ins.id);
    return {id:'ins_'+ins.id, label:ins.nombre+' ('+ins.unidad+')', tipo:'number', valor:r?String(r.cantidad):'0'};
  });
  abrirModal({titulo:'Receta de '+p.nombre, textoBoton:'Guardar receta', campos, onGuardar:(d)=>{
    const receta=[];
    insumos.forEach(ins=>{ const cant=parseFloat(d['ins_'+ins.id])||0; if(cant>0){ receta.push({insumoId:ins.id, cantidad:cant}); } });
    p.receta=receta;
    guardarMisDatos('productos',productos);
    cerrarModal(); toast('Receta guardada','success'); render();
  }});
}

// --- Pestaña MOVIMIENTOS ---
function invMovimientos(){
  const movs=misDatos('movimientos').slice(0,50);
  return `
    <div class="table-wrap"><table class="tbl">
      <thead><tr><th>Fecha</th><th>Insumo</th><th>Tipo</th><th>Cantidad</th><th>Motivo</th><th>Por</th></tr></thead>
      <tbody>
      ${movs.length? movs.map(m=>`<tr>
        <td>${fmtDate(m.fecha)}</td>
        <td>${escapeHtml(m.insumoNombre)}</td>
        <td>${m.tipo==='entrada'?'<span class="pill pill-green">Entrada</span>':'<span class="pill pill-red">Salida</span>'}</td>
        <td>${m.cantidad}</td>
        <td>${escapeHtml(m.motivo||'')}</td>
        <td>${escapeHtml(m.por||'')}</td>
      </tr>`).join('') : '<tr><td colspan="6" class="muted">Sin movimientos aún.</td></tr>'}
      </tbody>
    </table></div>`;
}

// --- Pestaña ALERTAS ---
function invAlertas(){
  const bajos=misDatos('insumos').filter(i=>i.stock<=i.minimo);
  return `
    ${bajos.length? `
      <p class="muted" style="margin-bottom:10px;">${bajos.length} insumo(s) por agotarse. Lista de compras sugerida:</p>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Insumo</th><th>Stock actual</th><th>Mínimo</th><th>Falta</th></tr></thead>
        <tbody>${bajos.map(i=>`<tr><td><strong>${escapeHtml(i.nombre)}</strong></td><td class="txt-red">${i.stock} ${i.unidad}</td><td>${i.minimo}</td><td>${Math.max(0,i.minimo-i.stock)} ${i.unidad}</td></tr>`).join('')}</tbody>
      </table></div>` : '<p class="muted">✓ Todo el inventario está por encima del mínimo. No hay nada por comprar.</p>'}`;
}

// --- Pestaña REPORTES ---
function invReportes(){
  const insumos=misDatos('insumos');
  const valorTotal=insumos.reduce((a,i)=>a+(i.stock*(i.costo||0)),0);
  const ok=insumos.filter(i=>i.stock>i.minimo).length;
  const bajos=insumos.filter(i=>i.stock<=i.minimo).length;
  return `
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-label">Insumos en total</div><div class="stat-value">${insumos.length}</div></div>
      <div class="stat-card green"><div class="stat-label">Stock OK</div><div class="stat-value">${ok}</div></div>
      <div class="stat-card gold"><div class="stat-label">Por agotarse</div><div class="stat-value">${bajos}</div></div>
      <div class="stat-card"><div class="stat-label">Valor del inventario</div><div class="stat-value">${fmtMoney(valorTotal)}</div><div class="stat-sub">stock × costo</div></div>
    </div>
    <div class="table-wrap"><table class="tbl">
      <thead><tr><th>Insumo</th><th>Stock</th><th>Costo unit.</th><th>Valor total</th></tr></thead>
      <tbody>${insumos.map(i=>`<tr><td>${escapeHtml(i.nombre)}</td><td>${i.stock} ${i.unidad}</td><td>${i.costo?fmtMoney(i.costo):'—'}</td><td>${fmtMoney(i.stock*(i.costo||0))}</td></tr>`).join('')||'<tr><td colspan="4" class="muted">Sin datos</td></tr>'}</tbody>
    </table></div>`;
}

// ============================================================
//  VISTA DEL NEGOCIO
// ============================================================
function vistaNegocio(){
  const neg=STATE.negocio;
  const F=(neg.funciones||[]);
  const pg=STATE.pageNeg||'inicio';
  // Items de menú según funciones activas y tipo de negocio
  const nav=[];
  nav.push({grupo:'PRINCIPAL'});
  nav.push({id:'inicio',icon:'dashboard',label:'Dashboard'});
  if(F.includes('ventas')) nav.push({id:'ventas',icon:'cart',label:'Nueva Venta'});
  if(F.includes('ventas')) nav.push({id:'pedidos',icon:'report',label:'Pedidos'});
  if(F.includes('menu')) nav.push({id:'catalogo',icon:'menu',label:neg.usaVariantes?'Catálogo':'Catálogo'});
  nav.push({grupo:'OPERACIONES'});
  if(F.includes('caja')) nav.push({id:'caja',icon:'cash',label:'Caja'});
  if(F.includes('cocina')&&neg.usaCocina) nav.push({id:'cocina',icon:'chef',label:'Cocina'});
  if(F.includes('citas')&&neg.usaCitas) nav.push({id:'citas',icon:'scissors',label:'Citas'});
  if(F.includes('domicilios')) nav.push({id:'domicilios',icon:'truck',label:'Domicilios'});
  if(F.includes('inventario')) nav.push({id:'inventario',icon:'box',label:'Inventario'});
  if(F.includes('clientes')) nav.push({id:'clientes',icon:'users',label:'Clientes'});
  nav.push({grupo:'GESTIÓN'});
  if(F.includes('reportes')) nav.push({id:'reportes',icon:'report',label:'Reportes'});
  if(F.includes('contable')) nav.push({id:'contable',icon:'report',label:'Registro Contable'});
  if(F.includes('gastosneg')) nav.push({id:'gastosneg',icon:'cash',label:'Gastos del Negocio'});
  if(STATE.user.rol==='admin'){ nav.push({id:'usuariosneg',icon:'users',label:'Usuarios'}); nav.push({id:'confignegocio',icon:'cog',label:'Configuración'}); }

  // Contenido según página
  let contenido='';
  if(pg==='ventas'&&F.includes('ventas')) contenido=ventas();
  else if(pg==='pedidos'&&F.includes('ventas')) contenido=pedidos();
  else if(pg==='catalogo'&&F.includes('menu')) contenido=catalogo();
  else if(pg==='caja'&&F.includes('caja')) contenido=caja();
  else if(pg==='cocina'&&F.includes('cocina')&&neg.usaCocina) contenido=cocina();
  else if(pg==='citas'&&F.includes('citas')) contenido=citas();
  else if(pg==='clientes'&&F.includes('clientes')) contenido=clientes();
  else if(pg==='domicilios'&&F.includes('domicilios')) contenido=domicilios();
  else if(pg==='inventario'&&F.includes('inventario')) contenido=inventario();
  else if(pg==='reportes'&&F.includes('reportes')) contenido=reportesNeg();
  else if(pg==='gastosneg'&&F.includes('gastosneg')) contenido=gastosneg();
  else if(pg==='contable'&&F.includes('contable')) contenido=contable();
  else if(pg==='usuariosneg'&&STATE.user.rol==='admin') contenido=usuariosNeg();
  else if(pg==='confignegocio'&&STATE.user.rol==='admin') contenido=configNeg();
  else contenido=dashboardNeg();

  const titulo=(nav.find(n=>n.id===pg)||{}).label||'Dashboard';
  const inicial=(STATE.user.nombre||'U').charAt(0).toUpperCase();

  return `
  <div class="layout">
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-logo">
        ${neg.logo?`<img src="${neg.logo}" class="neg-logo-img" alt="${escapeHtml(neg.nombre)}">
        <div class="neg-logo-nombre">${escapeHtml(neg.nombre)}</div>
        <div class="sub">${escapeHtml(neg.tipo)}</div>`
        :`<div class="brand">Wallace<span> System</span></div>
        <div class="sub">${escapeHtml(neg.tipo)}</div>
        <div class="neg-badge">${escapeHtml(neg.nombre)}</div>`}
      </div>
      <nav class="nav">
        ${nav.map(n=>n.grupo?`<div class="nav-group">${n.grupo}</div>`:`<div class="nav-item ${pg===n.id?'active':''}" onclick="irNeg('${n.id}')">${ic(n.icon)}<span>${n.label}</span></div>`).join('')}
      </nav>
      <div class="sidebar-foot">
        <div class="user-box">
          <div class="avatar">${inicial}</div>
          <div class="user-info">
            <div class="n">${escapeHtml(STATE.user.nombre)}</div>
            <div class="r"><span class="sync-dot"></span> Sincronizado</div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="logout()" title="Salir">${ic('logout')}</button>
        </div>
      </div>
    </aside>
    <div class="main">
      <div class="topbar">
        <h1><button class="menu-toggle" onclick="document.getElementById('sidebar').classList.toggle('open')">☰</button> ${escapeHtml(titulo)}</h1>
        <div class="tb-right"><span class="clock" id="clock"></span></div>
      </div>
      <div class="content">${contenido}</div>
    </div>
  </div>`;
}
function irNeg(pg){ STATE.pageNeg=pg; if(pg==='inventario')_invTab='insumos'; render(); const sb=document.getElementById('sidebar'); if(sb)sb.classList.remove('open'); }

// Dashboard del negocio
function dashboardNeg(){
  const neg=STATE.negocio;
  const vs=misDatos('ventas').filter(v=>v.estado==='pagada');
  const t=new Date().toISOString().split('T')[0];
  const caja=misDatos('caja_actual')[0];
  // Ventas de hoy = jornada (caja abierta) o día calendario
  let hoy, tituloHoy='Ventas de Hoy';
  if(caja){ hoy=vs.filter(v=>v.cajaId===caja.id); tituloHoy='Ventas de la Jornada'; }
  else { hoy=vs.filter(v=>(v.fecha||'').startsWith(t)); }
  const totalHoy=hoy.reduce((a,v)=>a+v.total,0);
  // Semana y mes
  const weekAgo=new Date(Date.now()-7*864e5).toISOString().split('T')[0];
  const sem=vs.filter(v=>(v.fecha||'')>=weekAgo);
  const mesIni=t.substring(0,7);
  const mes=vs.filter(v=>(v.fecha||'').substring(0,7)===mesIni);
  const activos=misDatos('ventas').filter(v=>v.estadoCocina && v.estadoCocina!=='entregado').length;
  // Métodos de pago de hoy
  const metodos={efectivo:0,banco:0,tarjeta:0};
  hoy.forEach(v=>{ if(metodos[v.metodo]!==undefined) metodos[v.metodo]+=v.total; });
  // Gráfico últimos 7 días
  const days=[];
  for(let i=6;i>=0;i--){ const d=new Date(Date.now()-i*864e5); const dk=d.toISOString().split('T')[0];
    days.push({lbl:d.toLocaleDateString('es-CO',{weekday:'short'}), tot:vs.filter(v=>(v.fecha||'').startsWith(dk)).reduce((a,v)=>a+v.total,0)}); }
  const mx=Math.max(...days.map(d=>d.tot),1);
  const bars=days.map(d=>`<div class="bar-item"><div class="bar-val">${d.tot>0?(d.tot/1000).toFixed(0)+'k':''}</div><div class="bar-fill" style="height:${Math.max(4,(d.tot/mx)*90)}px"></div><div class="bar-label">${d.lbl}</div></div>`).join('');
  const nombreMetodo={efectivo:'Efectivo',banco:'Banco',tarjeta:'Tarjeta'};
  return `
    <div class="stats-grid">
      <div class="stat-card red"><div class="stat-icon">${ic('cash')}</div><div class="stat-label">${tituloHoy}</div><div class="stat-value">${fmtMoney(totalHoy)}</div><div class="stat-sub">${hoy.length} pedidos</div></div>
      <div class="stat-card gold"><div class="stat-icon">${ic('history')}</div><div class="stat-label">Esta Semana</div><div class="stat-value">${fmtMoney(sem.reduce((a,v)=>a+v.total,0))}</div><div class="stat-sub">${sem.length} pedidos</div></div>
      <div class="stat-card green"><div class="stat-icon">${ic('report')}</div><div class="stat-label">Este Mes</div><div class="stat-value">${fmtMoney(mes.reduce((a,v)=>a+v.total,0))}</div><div class="stat-sub">${mes.length} pedidos</div></div>
      <div class="stat-card blue"><div class="stat-icon">${ic('cart')}</div><div class="stat-label">Pedidos Activos</div><div class="stat-value">${activos}</div><div class="stat-sub">en proceso</div></div>
    </div>
    <div class="grid-2">
      <div class="card"><div class="card-title">${ic('report')} Ventas Últimos 7 Días</div><div class="bar-chart">${bars}</div></div>
      <div class="card"><div class="card-title">${ic('cash')} Métodos de Pago (${caja?'Jornada':'Hoy'})</div>
        ${Object.keys(metodos).map(k=>`<div class="flex-between" style="padding:10px 0;border-bottom:1px solid var(--line)"><span>${nombreMetodo[k]}</span><span class="text-gold font-bold">${fmtMoney(metodos[k])}</span></div>`).join('')}
      </div>
    </div>
    <div class="card"><div class="card-title">${ic('history')} Últimas Ventas</div>
      ${vs.length===0?`<p class="muted">No hay ventas aún.</p>`:
      `<div class="table-wrap"><table class="tbl"><thead><tr><th>Cliente/Mesa</th><th>Método</th><th>Total</th><th>Fecha</th></tr></thead><tbody>
      ${vs.slice(0,10).map(v=>`<tr><td><strong>${escapeHtml(v.cliNombre||v.mesa||'Venta')}</strong></td><td>${escapeHtml(v.metodo||'—')}</td><td class="font-bold">${fmtMoney(v.total)}</td><td class="muted">${fmtDate(v.fecha)}</td></tr>`).join('')}
      </tbody></table></div>`}
    </div>`;
}
function reportesNeg(){
  const vs=misDatos('ventas').filter(v=>v.estado==='pagada');
  const t=new Date().toISOString().split('T')[0];
  const hoy=vs.filter(v=>(v.fecha||'').startsWith(t));
  const weekAgo=new Date(Date.now()-7*864e5).toISOString().split('T')[0];
  const sem=vs.filter(v=>(v.fecha||'')>=weekAgo);
  const mes=vs.filter(v=>(v.fecha||'').substring(0,7)===t.substring(0,7));
  const porMetodo={efectivo:0,banco:0,tarjeta:0};
  vs.forEach(v=>{ if(porMetodo[v.metodo]!==undefined) porMetodo[v.metodo]+=v.total; });
  const items={};
  vs.forEach(v=>v.items.forEach(i=>{ items[i.nombre]=(items[i.nombre]||0)+i.qty; }));
  const top=Object.entries(items).sort((a,b)=>b[1]-a[1]).slice(0,10);
  return `
    <div class="stats-grid">
      <div class="stat-card green"><div class="stat-icon">${ic('cash')}</div><div class="stat-label">Ventas hoy</div><div class="stat-value">${fmtMoney(hoy.reduce((a,v)=>a+v.total,0))}</div><div class="stat-sub">${hoy.length} pedidos</div></div>
      <div class="stat-card gold"><div class="stat-icon">${ic('history')}</div><div class="stat-label">Esta semana</div><div class="stat-value">${fmtMoney(sem.reduce((a,v)=>a+v.total,0))}</div><div class="stat-sub">${sem.length} pedidos</div></div>
      <div class="stat-card blue"><div class="stat-icon">${ic('report')}</div><div class="stat-label">Este mes</div><div class="stat-value">${fmtMoney(mes.reduce((a,v)=>a+v.total,0))}</div><div class="stat-sub">${mes.length} pedidos</div></div>
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="card-title">${ic('cash')} Ventas por método (total)</div>
        <div class="resumen-row"><span>Efectivo</span><strong class="text-gold">${fmtMoney(porMetodo.efectivo)}</strong></div>
        <div class="resumen-row"><span>Banco</span><strong class="text-gold">${fmtMoney(porMetodo.banco)}</strong></div>
        <div class="resumen-row"><span>Tarjeta</span><strong class="text-gold">${fmtMoney(porMetodo.tarjeta)}</strong></div>
        <div class="resumen-row big"><span>Total</span><strong>${fmtMoney(vs.reduce((a,v)=>a+v.total,0))}</strong></div>
      </div>
      <div class="card">
        <div class="card-title">${ic('report')} Más vendidos</div>
        <div class="table-wrap"><table class="tbl"><thead><tr><th>Producto</th><th>Cant.</th></tr></thead><tbody>
        ${top.length?top.map(([n,q])=>`<tr><td>${escapeHtml(n)}</td><td><strong>${q}</strong></td></tr>`).join(''):'<tr><td colspan="2" class="muted">Sin ventas aún</td></tr>'}
        </tbody></table></div>
      </div>
    </div>`;
}

// ============================================================
//  LOGIN VIEW
// ============================================================
function vistaLogin(){
  return `
  <div class="login-screen">
    <div class="login-box">
      <div class="login-logo">Wallace<span> System</span></div>
      <p class="login-sub">Sistema para restaurantes y todo tipo de negocios</p>
      <div class="form-row"><label>Usuario</label><input id="l-user" placeholder="usuario" onkeydown="if(event.key==='Enter')hacerLogin()"></div>
      <div class="form-row"><label>Contraseña</label><input id="l-pass" type="password" placeholder="••••••" onkeydown="if(event.key==='Enter')hacerLogin()"></div>
      <button class="btn btn-gold btn-block" onclick="hacerLogin()">Entrar</button>
      <div class="login-demo">
        <div><strong>Demo super-admin:</strong> superadmin / super123</div>
        <div><strong>Demo negocio:</strong> admin / admin123</div>
      </div>
      <div class="login-credit">WALLACE COMPANY SYSTEM</div>
    </div>
  </div>`;
}
function hacerLogin(){
  const u=(document.getElementById('l-user').value||'').trim();
  const p=(document.getElementById('l-pass').value||'').trim();
  const r=login(u,p);
  if(!r.ok){ toast(r.msg||'No se pudo entrar','error'); return; }
  STATE.page=''; render();
}

// ============================================================
//  RENDER PRINCIPAL
// ============================================================
function render(){
  const app=document.getElementById('app');
  if(!STATE.user){ aplicarTema({tema:'oscuro'}); app.innerHTML=vistaLogin(); return; }
  if(STATE.esSuperAdmin){
    aplicarTema({tema:'oscuro'});
    if(STATE.page==='nuevo-negocio'){ app.innerHTML=pantallaNuevoNegocio(); return; }
    if(STATE.page.startsWith('config-negocio:')){ app.innerHTML=pantallaConfigNegocio(STATE.page.split(':')[1]); return; }
    app.innerHTML=panelSuperAdmin(); return;
  }
  // Usuario de negocio: aplicar su tema personalizado
  aplicarTema(STATE.negocio);
  app.innerHTML=vistaNegocio();
}

// ---------- Arranque (a prueba de fallos: siempre renderiza) ----------
function arrancar(){
  try{ seed(); }catch(e){ console.error('seed error',e); }
  try{ render(); }catch(e){ console.error('render error',e); document.getElementById('app').innerHTML='<div style="padding:40px;color:#fff;text-align:center;">Error al cargar. Recarga la página (Ctrl+Shift+R).</div>'; }
}
try{
  const fbOk = initFirebase(); // conecta a la nube si hay config válida
  if(fbOk){
    // Con Firebase: intenta cargar de la nube, pero si tarda o falla, arranca igual
    let arrancado=false;
    const forzar=setTimeout(()=>{ if(!arrancado){ arrancado=true; arrancar(); } }, 2500);
    cargarDeLaNube(()=>{ if(!arrancado){ arrancado=true; clearTimeout(forzar); arrancar(); } });
  } else {
    // Sin Firebase: arranca de una vez en modo local
    arrancar();
  }
}catch(e){
  console.error('Error de arranque, usando modo local:',e);
  arrancar();
}
// Reloj en vivo
setInterval(()=>{ const c=document.getElementById('clock'); if(c){ c.textContent=new Date().toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit',second:'2-digit'}); } },1000);
