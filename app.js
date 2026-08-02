// ============================================================
//  WALLACE SYSTEM — NÚCLEO DE DATOS Y SINCRONIZACIÓN
//  WALLACE COMPANY SYSTEM — Ing. Roldán Aldana
//  wallacecompany11@gmail.com
//
//  Arquitectura copiada de Portal Imperial (probada en producción):
//   · Lista fija de tablas que se sincronizan
//   · Un listener POR TABLA (no un paquete gigante)
//   · La nube manda: lo que llega se acepta
//   · La protección contra pérdida está en el GUARDADO (fusión por id)
//   · caja_actual se propaga tal cual (para que el cierre llegue a todos)
// ============================================================

let CACHE = {};
let FB = null;
let FB_READY = false;
let ESCRIBIENDO = false;   // true mientras el usuario arma un pedido
let NUBE_LISTA = false;    // true cuando ya sabemos qué hay en la nube

// Tablas que viven en la nube. Cada negocio tiene las suyas: data_<negocio>_<tabla>
const TABLAS = ['usuarios','productos','insumos','ventas','clientes','cierres',
  'caja_actual','movimientos','domiciliarios','citas','gastos_negocio','config','factura_seq','auditoria'];
// Tablas globales (no dependen del negocio)
const TABLAS_GLOBALES = ['negocios','superadmins','usuarios'];

// ---------- Almacenamiento ----------
const DB = {
  get(k){
    if(CACHE[k]!==undefined) return CACHE[k];
    try{
      const v=localStorage.getItem('ws_'+k);
      const val = v ? JSON.parse(v) : null;
      CACHE[k]=val;
      return val;
    }catch(e){ return null; }
  },
  set(k,v){
    CACHE[k]=v;
    try{ localStorage.setItem('ws_'+k, JSON.stringify(v)); }catch(e){}
    if(FB_READY && FB){
      try{
        // IMPORTANTE: Firebase RECHAZA objetos con campos undefined adentro.
        // Por eso las ventas no llegaban a la nube y solo las veía el equipo
        // que las creó. El viaje por JSON elimina los undefined antes de enviar.
        const limpio = (v===undefined || v===null) ? null : JSON.parse(JSON.stringify(v));
        const p = FB.ref('data/'+k).set(limpio);
        if(p && p.catch) p.catch(e=>{ console.warn('FB set (nube)',k,e&&e.message); mostrarConexion('error'); });
      }catch(e){ console.warn('FB set',k,e&&e.message); mostrarConexion('error'); }
    }
  }
};

// ---------- Claves por negocio ----------
function claveDe(negocioId, tabla){ return 'data_'+negocioId+'_'+tabla; }
function misDatos(tabla){
  if(!STATE.negocio) return [];
  return DB.get(claveDe(STATE.negocio.id,tabla)) || [];
}
function datosDe(negocioId, tabla){ return DB.get(claveDe(negocioId,tabla)) || []; }

// ---------- Guardado seguro (fusión por id, como Portal Imperial) ----------
// Nunca reescribe a ciegas: conserva lo que exista en cache (incluido lo que
// acaba de llegar de otro dispositivo) y le monta encima los cambios locales.
function guardarMisDatos(tabla, arr){
  if(!STATE.negocio) return;
  const clave = claveDe(STATE.negocio.id, tabla);
  // caja_actual va directo: si se cierra, debe quedar vacía para todos
  if(tabla==='caja_actual' || tabla==='config' || tabla==='factura_seq'){
    DB.set(clave, arr);
    return;
  }
  const porId = {};
  (CACHE[clave]||[]).forEach(x=>{ if(x&&x.id) porId[x.id]=x; });
  (arr||[]).forEach(x=>{ if(x&&x.id) porId[x.id]=x; });
  let fusionado = Object.values(porId);
  const campo = {ventas:'fecha', cierres:'cierre', movimientos:'fecha',
                 gastos_negocio:'fecha', citas:'fechaHora'}[tabla] || 'creado';
  if(fusionado.length && fusionado[0][campo]!==undefined){
    fusionado.sort((a,b)=> new Date(b[campo]||0) - new Date(a[campo]||0));
  }
  DB.set(clave, fusionado);
}
// Borra UN registro sin arrastrar los demás
function eliminarMisDatos(tabla, id){
  if(!STATE.negocio) return;
  const clave = claveDe(STATE.negocio.id, tabla);
  const porId = {};
  (CACHE[clave]||[]).forEach(x=>{ if(x&&x.id) porId[x.id]=x; });
  delete porId[id];
  DB.set(clave, Object.values(porId));
}

// ---------- Firebase ----------
function initFirebase(){
  // 1) Respaldo local primero: arranque instantáneo aunque la nube tarde
  try{
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(k && k.indexOf('ws_')===0){
        try{ const v=localStorage.getItem(k); if(v!==null) CACHE[k.substring(3)]=JSON.parse(v); }catch(e){}
      }
    }
  }catch(e){}
  // 2) Conectar
  try{
    const cfg=window.FIREBASE_CONFIG;
    if(!cfg || !cfg.databaseURL || cfg.apiKey==='TU_API_KEY') return false;
    if(typeof firebase==='undefined' || !firebase.initializeApp) return false;
    firebase.initializeApp(cfg);
    FB=firebase.database();
    FB_READY=true;
    // Estado de conexión en vivo
    try{
      FB.ref('.info/connected').on('value', s=>{
        mostrarConexion(s.val()?'ok':'off');
      });
    }catch(e){}
    return true;
  }catch(e){
    console.error('Firebase no disponible:',e);
    FB=null; FB_READY=false;
    return false;
  }
}
function mostrarConexion(estado){
  const el=document.getElementById('fb-status');
  if(!el) return;
  if(estado==='ok'){ el.className='fb-dot ok'; el.title='Sincronizado'; }
  else if(estado==='error'){ el.className='fb-dot err'; el.title='Error de nube'; }
  else { el.className='fb-dot off'; el.title='Sin conexión'; }
}

// ============================================================
//  SINCRONIZACIÓN SEPARADA POR NEGOCIO
//  · Al arrancar solo se bajan las tablas globales (negocios,
//    usuarios, superadmins) para poder iniciar sesión.
//  · Al entrar a un negocio se sincronizan SOLO sus tablas.
//  · El súper admin sincroniza todo (es el dueño del sistema).
//  Así el equipo de un cliente nunca descarga los datos de otro.
// ============================================================
let _listenersNeg = [];     // refs de las tablas del negocio activo
let _sincTodoOn = false;    // true si el súper admin escucha todo
let _globalesOn = false;    // true si ya escuchamos las tablas globales

function _guardarLocal(k,v){
  CACHE[k]=(v===undefined?null:v);
  try{ localStorage.setItem('ws_'+k, JSON.stringify(CACHE[k])); }catch(e){}
}
function _aceptarDeNube(k,v){
  const nuevo=JSON.stringify(v===undefined?null:v);
  const viejo=JSON.stringify(CACHE[k]===undefined?null:CACHE[k]);
  if(nuevo!==viejo){ _guardarLocal(k,v); refrescarSiSePuede(); }
}
function _escucharClave(k){
  const ref=FB.ref('data/'+k);
  ref.on('value', s=>_aceptarDeNube(k, s.val()));
  return ref;
}

// Carga inicial: SOLO las tablas globales, para poder entrar
function cargarDeLaNube(callback){
  if(!FB_READY || !FB){ NUBE_LISTA=true; callback(); return; }
  Promise.all(TABLAS_GLOBALES.map(k=>FB.ref('data/'+k).once('value').then(s=>_guardarLocal(k,s.val()))))
  .then(()=>{
    NUBE_LISTA=true;
    mostrarConexion('ok');
    callback();
    escucharGlobales();
  }).catch(err=>{
    console.error('No se pudo leer de la nube:',err && err.message);
    mostrarConexion('error');
    NUBE_LISTA=true;   // permitimos arrancar en local
    callback();
    escucharGlobales();
  });
}
function escucharGlobales(){
  if(!FB_READY || !FB || _globalesOn) return;
  _globalesOn=true;
  TABLAS_GLOBALES.forEach(k=>_escucharClave(k));
}

// Al entrar a un negocio: bajar y escuchar SOLO sus tablas
function sincronizarNegocio(negId){
  if(!FB_READY || !FB || !negId) return;
  detenerSincNegocio();
  TABLAS.forEach(t=>{
    const k=claveDe(negId,t);
    _listenersNeg.push(_escucharClave(k));
  });
}
function detenerSincNegocio(){
  _listenersNeg.forEach(ref=>{ try{ ref.off('value'); }catch(e){} });
  _listenersNeg=[];
}

// Súper admin: escucha TODO el nodo data (dashboard de todos los negocios)
function sincronizarTodo(){
  if(!FB_READY || !FB || _sincTodoOn) return;
  _sincTodoOn=true;
  FB.ref('data').on('value', snap=>{
    const data=snap.val()||{};
    let cambio=false;
    Object.keys(data).forEach(k=>{
      const nuevo=JSON.stringify(data[k]);
      const viejo=JSON.stringify(CACHE[k]);
      if(nuevo!==viejo){ _guardarLocal(k,data[k]); cambio=true; }
    });
    Object.keys(CACHE).forEach(k=>{
      if(k.indexOf('data_')===0 && data[k]===undefined && CACHE[k]!==null){
        _guardarLocal(k,null); cambio=true;
      }
    });
    if(cambio) refrescarSiSePuede();
  });
}
function detenerSincTodo(){
  if(!_sincTodoOn) return;
  try{ FB.ref('data').off('value'); }catch(e){}
  _sincTodoOn=false;
}

// Privacidad: al entrar un empleado normal, se borran del equipo
// los datos que hayan quedado de OTROS negocios
function limpiarDatosAjenos(negId){
  try{
    const borrar=[];
    for(let i=0;i<localStorage.length;i++){
      const k=localStorage.key(i);
      if(k && k.indexOf('ws_data_')===0 && k.indexOf('ws_data_'+negId+'_')!==0) borrar.push(k);
    }
    borrar.forEach(k=>{
      localStorage.removeItem(k);
      delete CACHE[k.substring(3)];
    });
  }catch(e){}
}
// Refresca la pantalla salvo que el usuario esté ocupado
function refrescarSiSePuede(){
  if(!STATE.user) return;
  // Si el usuario está escribiendo en CUALQUIER campo (texto, número, select
  // abierto, textarea), NO refrescamos: redibujar destruiría el campo y se
  // perdería el foco / el teclado en móvil. Esperamos a que termine.
  const a=document.activeElement;
  if(a){
    const tag=(a.tagName||'').toLowerCase();
    if(tag==='input'||tag==='textarea'||tag==='select'||a.isContentEditable){
      _refrescoPendiente=true;   // recordamos que hay cambios sin pintar
      return;
    }
  }
  // Solo se evita refrescar mientras se ARMA una venta (pantalla 'ventas')
  if(ESCRIBIENDO && STATE.pageNeg==='ventas') return;
  const modal=document.getElementById('modal-container');
  if(modal && modal.classList.contains('activo')) return;   // modal abierto
  _refrescoPendiente=false;
  try{ render(); }catch(e){}
}
let _refrescoPendiente=false;
// Cuando el usuario deja de escribir (quita el foco), pintamos lo que llegó
document.addEventListener('focusout', function(){
  setTimeout(function(){
    if(!_refrescoPendiente) return;
    const a=document.activeElement;
    const tag=a?(a.tagName||'').toLowerCase():'';
    if(tag==='input'||tag==='textarea'||tag==='select'||(a&&a.isContentEditable)) return;
    _refrescoPendiente=false;
    refrescarSiSePuede();
  },150);
}, true);

// Botón "Actualizar": fuerza traer de la nube lo que corresponda
function refrescarDeLaNube(){
  if(!FB_READY || !FB){ toast('Sin conexión a la nube','error'); return; }
  toast('Actualizando...','info');
  let promesa;
  if(STATE.esSuperAdmin){
    promesa=FB.ref('data').once('value').then(snap=>{
      const data=snap.val()||{};
      Object.keys(data).forEach(k=>_guardarLocal(k,data[k]));
    });
  } else if(STATE.negocio){
    const claves=TABLAS.map(t=>claveDe(STATE.negocio.id,t)).concat(TABLAS_GLOBALES);
    promesa=Promise.all(claves.map(k=>FB.ref('data/'+k).once('value').then(s=>_guardarLocal(k,s.val()))));
  } else {
    promesa=Promise.all(TABLAS_GLOBALES.map(k=>FB.ref('data/'+k).once('value').then(s=>_guardarLocal(k,s.val()))));
  }
  promesa.then(()=>{ toast('Actualizado','success'); render(); })
    .catch(()=>toast('No se pudo actualizar','error'));
}

// ============================================================
//  ESTADO Y CONFIGURACIÓN
// ============================================================
const STATE = {
  user:null, negocio:null, esSuperAdmin:false, modoSupervision:false,
  page:'', pageNeg:'inicio', sucursal:null, buscaNegocio:''
};

function uid(){ return 'id'+Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
function now(){ return new Date().toISOString(); }
function today(){ return new Date().toISOString().split('T')[0]; }
function fmtMoney(n){ return '$ '+(Math.round(n||0)).toLocaleString('es-CO'); }
function fmtDate(f){
  if(!f) return '—';
  const d=new Date(f);
  return d.toLocaleDateString('es-CO')+' '+d.toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'});
}
function escapeHtml(s){
  return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ============================================================
//  PERFILES DE NEGOCIO (el super-admin elige uno al crear)
// ============================================================
const PERFILES = {
  'Restaurante':{
    palabraProducto:'Plato', palabraProductos:'Platos',
    usaMesas:true, usaCocina:true, usaRecetas:true, usaCitas:false,
    flujoPedido:'dos_pasos',           // confirmar y luego cobrar
    tiposEntrega:['mesa','llevar','domicilio'],
    funciones:['ventas','catalogo','caja','facturas','clientes','cocina','domicilios','inventario','reportes','contable','gastosneg']
  },
  'Cafetería':{
    palabraProducto:'Producto', palabraProductos:'Productos',
    usaMesas:true, usaCocina:true, usaRecetas:true, usaCitas:false,
    flujoPedido:'dos_pasos',
    tiposEntrega:['mesa','llevar','domicilio'],
    funciones:['ventas','catalogo','caja','facturas','clientes','cocina','domicilios','inventario','reportes','contable','gastosneg']
  },
  'Tienda / Accesorios':{
    palabraProducto:'Artículo', palabraProductos:'Artículos',
    usaMesas:false, usaCocina:false, usaRecetas:false, usaCitas:false,
    flujoPedido:'directo',             // cobra de una vez
    tiposEntrega:['llevar','domicilio','envio'],
    funciones:['ventas','catalogo','caja','facturas','clientes','domicilios','inventario','reportes','contable','gastosneg']
  },
  'Barbería / Salón':{
    palabraProducto:'Servicio', palabraProductos:'Servicios',
    usaMesas:false, usaCocina:false, usaRecetas:false, usaCitas:true,
    flujoPedido:'directo',
    tiposEntrega:['llevar'],
    funciones:['ventas','catalogo','caja','facturas','clientes','citas','inventario','reportes','contable','gastosneg']
  },
  'Panadería':{
    palabraProducto:'Producto', palabraProductos:'Productos',
    usaMesas:false, usaCocina:true, usaRecetas:true, usaCitas:false,
    flujoPedido:'directo',
    tiposEntrega:['llevar','domicilio'],
    funciones:['ventas','catalogo','caja','facturas','clientes','domicilios','inventario','reportes','contable','gastosneg']
  },
  'Ferretería':{
    palabraProducto:'Producto', palabraProductos:'Productos',
    usaMesas:false, usaCocina:false, usaRecetas:false, usaCitas:false,
    flujoPedido:'directo',
    tiposEntrega:['llevar','domicilio','envio'],
    funciones:['ventas','catalogo','caja','facturas','clientes','domicilios','inventario','reportes','contable','gastosneg']
  },
  'Logística / Bodega':{
    palabraProducto:'Producto', palabraProductos:'Productos',
    usaMesas:false, usaCocina:false, usaRecetas:false, usaCitas:false,
    usaCaja:false, esLogistica:true,   // no maneja dinero: entradas y salidas de mercancía
    flujoPedido:'directo',
    tiposEntrega:['entrega','despacho'],
    funciones:['ventas','catalogo','clientes','domicilios','inventario','reportes']
  },
  'Otro':{
    palabraProducto:'Producto', palabraProductos:'Productos',
    usaMesas:false, usaCocina:false, usaRecetas:false, usaCitas:false,
    flujoPedido:'directo',
    tiposEntrega:['llevar','domicilio'],
    funciones:['ventas','catalogo','caja','facturas','clientes','inventario','reportes','contable','gastosneg']
  }
};

const ROLES = [['admin','Administrador'],['cajero','Cajero'],['mesero','Mesero'],
  ['cocina','Cocina'],['vendedor','Vendedor'],['dueno','Dueño']];

const PANTALLAS_POR_ROL = {
  admin:   ['inicio','ventas','pedidos','catalogo','caja','cocina','citas','domicilios','clientes','reportes','contable','gastosneg','usuarios','config'],
  cajero:  ['inicio','ventas','pedidos','caja','clientes','domicilios'],
  mesero:  ['inicio','ventas','pedidos','clientes'],
  cocina:  ['cocina','pedidos'],
  vendedor:['inicio','ventas','pedidos','catalogo','clientes'],
  dueno:   ['inicio','caja','pedidos','reportes','contable','gastosneg','catalogo']
};

// ---- Permisos de ACCIÓN (además del rol y de las pantallas) ----
// El jefe habilita/deshabilita cada acción por empleado. Si un empleado no
// tiene una lista de permisos propia, se usan los del rol por defecto.
const ACCIONES = [
  ['cobrar','Cobrar pedidos'],
  ['editar','Editar pedidos'],
  ['anular','Anular facturas'],
  ['cambiarpago','Cambiar forma de pago'],
  ['imprimir','Reimprimir factura'],
  ['comanda','Reimprimir comanda de cocina'],
  ['eliminar','Eliminar definitivamente'],
  ['abrircaja','Abrir / cerrar caja'],
  ['descuento','Aplicar descuentos']
];
const PERMISOS_POR_ROL = {
  admin:   ['cobrar','editar','anular','cambiarpago','imprimir','comanda','eliminar','abrircaja','descuento'],
  cajero:  ['cobrar','editar','cambiarpago','imprimir','comanda','abrircaja'],
  mesero:  ['editar','comanda'],
  cocina:  ['comanda'],
  vendedor:['cobrar','editar','imprimir','descuento'],
  dueno:   ['anular','eliminar','imprimir']
};
// ¿El usuario actual puede hacer esta acción?
function tienePermiso(accion){
  const u=STATE.user;
  if(!u) return false;
  if(u.esSupervisor || u.rol==='admin' || u.rol==='superadmin') return true;
  // Lista propia del empleado (la que asignó el jefe) o la del rol por defecto
  const lista = (u.permisos && u.permisos.length) ? u.permisos : (PERMISOS_POR_ROL[u.rol]||[]);
  return lista.indexOf(accion)>-1;
}

// ============================================================
//  SUCURSALES
// ============================================================
const TABLAS_POR_SUCURSAL = ['ventas','caja_actual','cierres','movimientos'];
function sucursalesDe(neg){
  if(!neg) return [];
  if(neg.sucursales && neg.sucursales.length) return neg.sucursales;
  return [{id:'principal', nombre:'Principal'}];
}
function usaSucursales(neg){ return !!(neg && neg.sucursales && neg.sucursales.length>1); }
function sucursalActual(){
  if(!usaSucursales(STATE.negocio)) return 'principal';
  return STATE.sucursal || (sucursalesDe(STATE.negocio)[0]||{}).id || 'principal';
}
function puedeVerSucursal(sucId){
  const u=STATE.user;
  if(!u) return false;
  if(u.esSupervisor || u.rol==='admin') return true;
  if(!u.sucursales || !u.sucursales.length) return true;
  return u.sucursales.indexOf(sucId)>-1;
}

// ============================================================
//  SONIDOS (iguales a Portal Imperial)
// ============================================================
let _audioCtx=null;
function beep(freq,dur,vol){
  try{
    const ctx=new (window.AudioContext||window.webkitAudioContext)();
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value=freq||800; o.type='square';
    g.gain.setValueAtTime(Math.min(1,vol||0.3), ctx.currentTime);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+(dur||200)/1000);
    o.stop(ctx.currentTime+(dur||200)/1000);
  }catch(e){}
}
function campana(freq,t0,dur,vol){
  try{
    _audioCtx = _audioCtx || new (window.AudioContext||window.webkitAudioContext)();
    const ctx=_audioCtx, t=ctx.currentTime+t0;
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.type='triangle'; o.frequency.value=freq;
    o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(vol,t+0.01);
    g.gain.exponentialRampToValueAtTime(0.0008,t+dur);
    o.start(t); o.stop(t+dur+0.02);
    const o2=ctx.createOscillator(), g2=ctx.createGain();
    o2.type='sine'; o2.frequency.value=freq*2.01;
    o2.connect(g2); g2.connect(ctx.destination);
    g2.gain.setValueAtTime(0,t);
    g2.gain.linearRampToValueAtTime(vol*0.4,t+0.01);
    g2.gain.exponentialRampToValueAtTime(0.0008,t+dur*0.7);
    o2.start(t); o2.stop(t+dur*0.7+0.02);
  }catch(e){}
}
function sonidosOn(){ const n=STATE.negocio; return !n || n.sonidos!==false; }
function sonidoVenta(){ if(sonidosOn()){ campana(1047,0,0.15,0.6); campana(1568,0.09,0.2,0.6); } }
function sonidoPedido(){ if(sonidosOn()){ campana(1047,0,0.18,0.9); campana(1319,0.10,0.18,0.9); campana(1568,0.20,0.30,0.9); } }
function sonidoAlerta(){ if(sonidosOn()){ beep(600,150,0.4); setTimeout(()=>beep(600,150,0.4),200); } }
function sonidoError(){ if(sonidosOn()) beep(250,300,0.5); }

// ============================================================
//  ICONOS
// ============================================================
const ICONS = {
  dashboard:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  cart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"/></svg>',
  report:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
  box:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.3 7 12 12 20.7 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>',
  cash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>',
  users:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>',
  chef:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 13.87A4 4 0 0 1 7.41 6a5.11 5.11 0 0 1 1.05-1.54 5 5 0 0 1 7.08 0A5.11 5.11 0 0 1 16.59 6 4 4 0 0 1 18 13.87V21H6z"/><line x1="6" y1="17" x2="18" y2="17"/></svg>',
  truck:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13" rx="1"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>',
  calendar:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  cog:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09A1.65 1.65 0 0 0 10.6 3.09V3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 15 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  building:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="9" y1="6" x2="9" y2="6.01"/><line x1="15" y1="6" x2="15" y2="6.01"/><line x1="9" y1="11" x2="9" y2="11.01"/><line x1="15" y1="11" x2="15" y2="11.01"/><path d="M10 22v-4h4v4"/></svg>',
  logout:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  history:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><polyline points="12 7 12 12 15 15"/></svg>'
};
function ic(n){ return ICONS[n]||ICONS.dashboard; }

// ============================================================
//  AVISOS Y MODALES
// ============================================================
function toast(msg, tipo){
  const cont=document.getElementById('toasts');
  if(!cont){ console.log(msg); return; }
  const t=document.createElement('div');
  t.className='toast '+(tipo||'info');
  t.textContent=msg;
  cont.appendChild(t);
  setTimeout(()=>{ t.classList.add('salir'); setTimeout(()=>t.remove(),300); }, 3200);
}

function abrirModal(cfg){
  const cont=document.getElementById('modal-container');
  if(!cont) return;
  const campos=(cfg.campos||[]).map(c=>{
    if(c.tipo==='select'){
      return `<div class="m-row"><label>${escapeHtml(c.label)}</label>
        <select id="m-${c.id}">${(c.opciones||[]).map(o=>`<option value="${escapeHtml(o.valor)}" ${o.valor===c.valor?'selected':''}>${escapeHtml(o.label)}</option>`).join('')}</select></div>`;
    }
    if(c.tipo==='textarea'){
      return `<div class="m-row"><label>${escapeHtml(c.label)}</label>
        <textarea id="m-${c.id}" rows="3" placeholder="${escapeHtml(c.placeholder||'')}">${escapeHtml(c.valor||'')}</textarea></div>`;
    }
    return `<div class="m-row"><label>${escapeHtml(c.label)}</label>
      <input id="m-${c.id}" type="${c.tipo||'text'}" value="${escapeHtml(c.valor||'')}" placeholder="${escapeHtml(c.placeholder||'')}"></div>`;
  }).join('');
  cont.innerHTML=`<div class="modal-fondo" onclick="cerrarModal()"></div>
    <div class="modal">
      <div class="modal-cab"><h3>${escapeHtml(cfg.titulo||'')}</h3>
        <button class="modal-x" onclick="cerrarModal()">×</button></div>
      <div class="modal-cuerpo">${campos}${cfg.extraHTML||''}</div>
      <div class="modal-pie">
        <button class="btn btn-ghost" onclick="cerrarModal()">Cancelar</button>
        <button class="btn btn-gold" id="modal-ok">${escapeHtml(cfg.textoBoton||'Guardar')}</button>
      </div>
    </div>`;
  cont.classList.add('activo');
  const ok=document.getElementById('modal-ok');
  if(ok) ok.onclick=()=>{
    const datos={};
    (cfg.campos||[]).forEach(c=>{
      const el=document.getElementById('m-'+c.id);
      datos[c.id]=el?el.value:'';
      if(c.requerido && !datos[c.id]){ toast('Falta: '+c.label,'error'); throw new Error('falta campo'); }
    });
    if(cfg.onGuardar) cfg.onGuardar(datos);
  };
  setTimeout(()=>{
    const f=cont.querySelector('input,select,textarea'); if(f) f.focus();
    if(typeof cfg.onAbrir==='function') cfg.onAbrir();
  },50);
}
function cerrarModal(){
  const cont=document.getElementById('modal-container');
  if(cont){ cont.classList.remove('activo'); cont.innerHTML=''; }
}
function confirmarModal(mensaje, alConfirmar, textoBoton){
  abrirModal({titulo:'Confirmar', textoBoton:textoBoton||'Sí, continuar', campos:[],
    extraHTML:`<p style="font-size:15px;line-height:1.6;">${escapeHtml(mensaje)}</p>`,
    onGuardar:()=>{ cerrarModal(); if(alConfirmar) alConfirmar(); }});
}

// ============================================================
//  LOGIN
// ============================================================
function login(usuario, pass){
  const sa=(DB.get('superadmins')||[]).find(s=>s.usuario===usuario && s.pass===pass);
  if(sa){
    STATE.user={id:sa.id, nombre:sa.nombre, rol:'superadmin', rolSuper:sa.rolSuper||'dueno'};
    STATE.esSuperAdmin=true; STATE.negocio=null; STATE.page='';
    return {ok:true, tipo:'super'};
  }
  const u=(DB.get('usuarios')||[]).find(x=>x.usuario===usuario && x.pass===pass && x.activo!==false);
  if(!u) return {ok:false, msg:'Usuario o contraseña incorrectos'};
  const neg=(DB.get('negocios')||[]).find(n=>n.id===u.negocioId);
  if(!neg) return {ok:false, msg:'Este usuario no tiene negocio asignado'};
  if(!neg.activo) return {ok:false, msg:'Este negocio está suspendido. Contacta al proveedor.'};
  STATE.user=u; STATE.esSuperAdmin=false; STATE.negocio=neg;
  STATE.pageNeg='inicio';
  // Sucursal: la última usada o la primera permitida
  if(neg.sucursales && neg.sucursales.length>1){
    let guardada=null;
    try{ guardada=localStorage.getItem('ws_suc_'+neg.id); }catch(e){}
    const permitidas=(u.sucursales && u.sucursales.length)
      ? neg.sucursales.filter(s=>u.sucursales.indexOf(s.id)>-1)
      : neg.sucursales;
    const valida=permitidas.find(s=>s.id===guardada);
    STATE.sucursal = valida ? valida.id : (permitidas[0]||neg.sucursales[0]).id;
  } else {
    STATE.sucursal='principal';
  }
  return {ok:true, tipo:'negocio'};
}
function hacerLogin(){
  const u=(document.getElementById('l-user')||{}).value||'';
  const p=(document.getElementById('l-pass')||{}).value||'';
  const r=login(u.trim(), p);
  if(!r.ok){ toast(r.msg,'error'); sonidoError(); return; }
  // Arrancar la sincronización que corresponde
  if(r.tipo==='super'){
    detenerSincNegocio();
    sincronizarTodo();
  } else {
    detenerSincTodo();
    limpiarDatosAjenos(STATE.negocio.id);   // privacidad: fuera datos de otros negocios
    sincronizarNegocio(STATE.negocio.id);
  }
  render();
}
function logout(){
  STATE.user=null; STATE.negocio=null; STATE.esSuperAdmin=false;
  STATE.modoSupervision=false; STATE.sucursal=null;
  STATE.page=''; STATE.pageNeg='inicio';
  ESCRIBIENDO=false;
  detenerSincNegocio();
  detenerSincTodo();
  render();
}
function cambiarSucursal(sucId){
  STATE.sucursal=sucId;
  try{ localStorage.setItem('ws_suc_'+STATE.negocio.id, sucId); }catch(e){}
  const s=sucursalesDe(STATE.negocio).find(x=>x.id===sucId);
  toast('Trabajando en: '+(s?s.nombre:sucId),'success');
  render();
}

// ============================================================
//  DATOS INICIALES (solo si la nube ya respondió)
// ============================================================
function seed(){
  if(FB_READY && !NUBE_LISTA){ console.warn('seed omitido: la nube no ha respondido'); return; }
  if(!DB.get('superadmins')){
    DB.set('superadmins',[{id:'sa1', nombre:'Roldán Aldana', usuario:'superadmin', pass:'ROLYSANTCCIAWALLACEPOS54321', rolSuper:'dueno', creado:now()}]);
  }
  if(!DB.get('negocios')) DB.set('negocios',[]);
  if(!DB.get('usuarios')) DB.set('usuarios',[]);
}

// ============================================================
//  PANEL DE SUPER-ADMIN
// ============================================================
function panelSuperAdmin(){
  const negocios=DB.get('negocios')||[];
  const activos=negocios.filter(n=>n.activo).length;
  const ingreso=negocios.filter(n=>n.activo).reduce((a,n)=>a+(n.precioMes||0),0);
  const usuarios=(DB.get('usuarios')||[]).length;
  let ventasHoy=0, ventasTot=0, top={nombre:'—',total:0};
  const hoy=today();
  negocios.forEach(n=>{
    // Las ventas viven en la clave plana data_<negocio>_ventas (igual que Portal
    // Imperial). Antes se buscaba en claves por sucursal que nunca se escriben,
    // por eso el súper admin veía todo en cero.
    let vs=(datosDe(n.id,'ventas')||[]).slice();
    (n.sucursales||[]).forEach(s=>{ vs=vs.concat(DB.get('data_'+n.id+'_ventas-'+s.id)||[]); });
    const _vistos={};
    vs=vs.filter(v=>{ if(!v||!v.id||_vistos[v.id]) return false; _vistos[v.id]=true; return true; });
    vs=vs.filter(v=>v.estado==='pagada');
    const suma=vs.reduce((a,v)=>a+(v.total||0),0);
    ventasTot+=suma;
    ventasHoy+=vs.filter(v=>(v.fecha||'').startsWith(hoy)).reduce((a,v)=>a+(v.total||0),0);
    if(suma>top.total) top={nombre:n.nombre, total:suma};
  });
  const q=(STATE.buscaNegocio||'').toLowerCase();
  const lista=q?negocios.filter(n=>(n.nombre||'').toLowerCase().includes(q)||(n.tipo||'').toLowerCase().includes(q)||(n.ciudad||'').toLowerCase().includes(q)):negocios;

  return `
  <div class="topbar">
    <h1><span class="sa-emblema">${window.WALLACE_LOGO||''}</span>
      <span class="sa-marca">Panel de <span>Super-Admin</span></span>
      <span class="pill pill-oro">Dueño del sistema</span></h1>
    <div class="tb-der">
      <span class="fb-dot off" id="fb-status" title="Conexión"></span>
      <span class="reloj" id="reloj"></span>
      <button class="btn btn-sm" onclick="descargarRespaldo()">💾 Respaldo</button>
      ${(STATE.user.rolSuper==='dueno')?`<button class="btn btn-sm" onclick="STATE.page='superadmins';render()">👥 Administradores</button>`:''}
      <button class="btn btn-sm" onclick="cambiarMiPassSuper()">🔑 Mi contraseña</button>
      <button class="btn btn-ghost btn-sm" onclick="logout()">${ic('logout')} Salir</button>
    </div>
  </div>
  <div class="contenido">
    <div class="stats">
      <div class="stat gold"><div class="stat-ico gold">${ic('box')}</div><div class="stat-lbl">Negocios activos</div><div class="stat-val">${activos}</div><div class="stat-sub">de ${negocios.length} en total</div></div>
      <div class="stat verde"><div class="stat-ico verde">${ic('cash')}</div><div class="stat-lbl">Ingreso mensual</div><div class="stat-val">${fmtMoney(ingreso)}</div><div class="stat-sub">suma de planes activos</div></div>
      <div class="stat naranja"><div class="stat-ico naranja">${ic('history')}</div><div class="stat-lbl">Suspendidos</div><div class="stat-val">${negocios.length-activos}</div><div class="stat-sub">no pagan / pausados</div></div>
      <div class="stat azul"><div class="stat-ico azul">${ic('users')}</div><div class="stat-lbl">Usuarios totales</div><div class="stat-val">${usuarios}</div><div class="stat-sub">empleados en el sistema</div></div>
    </div>
    <div class="stats">
      <div class="stat gold"><div class="stat-ico gold">${ic('report')}</div><div class="stat-lbl">Ventas hoy (todos)</div><div class="stat-val">${fmtMoney(ventasHoy)}</div><div class="stat-sub">movimiento del sistema</div></div>
      <div class="stat verde"><div class="stat-ico verde">${ic('cash')}</div><div class="stat-lbl">Ventas históricas</div><div class="stat-val">${fmtMoney(ventasTot)}</div><div class="stat-sub">todos los negocios</div></div>
      <div class="stat gold"><div class="stat-ico gold">${ic('building')}</div><div class="stat-lbl">Negocio con más ventas</div><div class="stat-val" style="font-size:19px;">${escapeHtml(top.nombre)}</div><div class="stat-sub">${fmtMoney(top.total)}</div></div>
    </div>
    <div class="tarjeta">
      <div class="t-cab">
        <span class="t-tit">${ic('building')} Negocios</span>
        <div class="t-acc">
          <input type="text" class="busca" placeholder="🔍 Buscar negocio..." value="${escapeHtml(STATE.buscaNegocio||'')}" oninput="STATE.buscaNegocio=this.value;render()">
          <button class="btn btn-gold" onclick="nuevoNegocio()">${ic('plus')} Crear negocio</button>
        </div>
      </div>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Negocio</th><th>Tipo</th><th>Flujo</th><th>Plan</th><th>Precio/mes</th><th>Usuarios</th><th>Estado</th><th>Acciones</th></tr></thead>
        <tbody>
        ${lista.length? lista.map(n=>`<tr>
          <td><strong>${escapeHtml(n.nombre)}</strong>${n.ciudad?`<br><span class="gris">${escapeHtml(n.ciudad)}</span>`:''}${(n.sucursales&&n.sucursales.length>1)?`<br><span class="gris">📍 ${n.sucursales.length} sedes</span>`:''}</td>
          <td>${escapeHtml(n.tipo)}</td>
          <td><span class="pill ${n.flujoPedido==='dos_pasos'?'pill-gold':''}">${n.flujoPedido==='dos_pasos'?'Confirmar → Cobrar':'Cobro directo'}</span></td>
          <td>${escapeHtml(n.plan||'—')}</td>
          <td>${fmtMoney(n.precioMes)}</td>
          <td>${(DB.get('usuarios')||[]).filter(u=>u.negocioId===n.id).length}</td>
          <td>${n.activo?'<span class="pill pill-verde">Activo</span>':'<span class="pill pill-rojo">Suspendido</span>'}</td>
          <td class="acciones">
            <button class="btn btn-sm btn-verde" onclick="entrarComoNegocio('${n.id}')">Entrar</button>
            <button class="btn btn-sm" onclick="configNegocio('${n.id}')">Configurar</button>
            <button class="btn btn-sm" onclick="usuariosNegocio('${n.id}')">Usuarios</button>
            <button class="btn btn-sm ${n.activo?'btn-naranja':'btn-verde'}" onclick="toggleNegocio('${n.id}')">${n.activo?'Suspender':'Activar'}</button>
            ${STATE.user.rolSuper==='dueno'?`<button class="btn btn-sm btn-rojo" onclick="eliminarNegocio('${n.id}')" title="Eliminar empresa">🗑️</button>`:''}
          </td>
        </tr>`).join('') : '<tr><td colspan="8" class="gris">No hay negocios. Crea el primero.</td></tr>'}
        </tbody>
      </table></div>
    </div>
  </div>`;
}

// ---------- Respaldo (copia de seguridad de TODO el sistema) ----------
function descargarRespaldo(){
  toast('Preparando respaldo...','info');
  const bajar=(data)=>{
    try{
      const respaldo={
        sistema:'Wallace System',
        fecha:new Date().toISOString(),
        datos:data
      };
      const blob=new Blob([JSON.stringify(respaldo,null,2)],{type:'application/json'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      const f=new Date();
      const nombre='respaldo-wallace-'+f.getFullYear()+'-'
        +String(f.getMonth()+1).padStart(2,'0')+'-'
        +String(f.getDate()).padStart(2,'0')+'.json';
      a.href=url; a.download=nombre;
      document.body.appendChild(a); a.click();
      setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); },500);
      toast('Respaldo descargado: '+nombre,'success');
    }catch(e){ console.error(e); toast('No se pudo generar el respaldo','error'); }
  };
  if(FB_READY && FB){
    FB.ref('data').once('value')
      .then(snap=>bajar(snap.val()||{}))
      .catch(()=>{ toast('Sin nube: respaldo con datos locales','info'); bajar(JSON.parse(JSON.stringify(CACHE))); });
  } else {
    bajar(JSON.parse(JSON.stringify(CACHE)));
  }
}

// ============================================================
//  GESTIÓN DE SUPER ADMINS (solo el dueño del sistema)
// ============================================================
function pantallaSuperAdmins(){
  const esDueno = STATE.user.rolSuper==='dueno';
  const sas=DB.get('superadmins')||[];
  return `
  <div class="topbar">
    <h1><span class="sa-marca">👥 Administradores del sistema</span></h1>
    <div class="tb-der">
      <button class="btn btn-ghost btn-sm" onclick="STATE.page='';render()">← Volver</button>
    </div>
  </div>
  <div class="contenido">
    ${!esDueno?`<div class="tarjeta"><p class="gris">🔒 Solo el dueño del sistema puede gestionar administradores.</p></div>`:`
    <div class="tarjeta">
      <div class="t-cab">
        <span class="t-tit">👥 Súper administradores</span>
        <button class="btn btn-gold" onclick="editarSuperAdmin(null)">+ Crear administrador</button>
      </div>
      <p class="nota">El <strong>dueño</strong> puede todo (crear negocios, otros admins, respaldos). El <strong>ayudante</strong> puede gestionar negocios pero no crear ni borrar otros administradores.</p>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Creado</th><th></th></tr></thead>
        <tbody>${sas.map(s=>`<tr>
          <td class="negrita">${escapeHtml(s.nombre)}</td>
          <td>${escapeHtml(s.usuario)}</td>
          <td>${s.rolSuper==='dueno'?'<span class="pill pill-oro">Dueño</span>':'<span class="pill pill-azul">Ayudante</span>'}</td>
          <td class="gris chico">${s.creado?fmtDate(s.creado):'—'}</td>
          <td class="acciones">
            <button class="btn btn-sm" onclick="editarSuperAdmin('${s.id}')">Editar</button>
            ${s.rolSuper!=='dueno'||sas.filter(x=>x.rolSuper==='dueno').length>1?`<button class="btn btn-sm btn-rojo" onclick="eliminarSuperAdmin('${s.id}')">×</button>`:''}
          </td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`}
  </div>`;
}
function editarSuperAdmin(id){
  if(STATE.user.rolSuper!=='dueno'){ toast('Solo el dueño puede crear administradores','error'); return; }
  const sas=DB.get('superadmins')||[];
  const s=id?sas.find(x=>x.id===id):null;
  abrirModal({titulo:(s?'Editar':'Crear')+' administrador', textoBoton:'Guardar', campos:[
    {id:'nombre', label:'Nombre completo', valor:s?s.nombre:'', requerido:true},
    {id:'usuario', label:'Usuario para entrar', valor:s?s.usuario:'', requerido:true},
    {id:'pass', label:'Contraseña', valor:s?s.pass:'', requerido:true},
    {id:'rolSuper', label:'Rol', tipo:'select', valor:s?s.rolSuper:'ayudante',
      opciones:[{valor:'ayudante',label:'Ayudante (gestiona negocios)'},{valor:'dueno',label:'Dueño (control total)'}]}
  ], onGuardar:(d)=>{
    const usuario=d.usuario.trim();
    // No permitir usuarios repetidos (ni con empleados de negocios)
    const dup=(DB.get('superadmins')||[]).some(x=>x.usuario===usuario && (!s||x.id!==s.id))
           || (DB.get('usuarios')||[]).some(u=>u.usuario===usuario);
    if(dup){ toast('Ese usuario ya existe','error'); return; }
    if(d.pass.trim().length<5){ toast('La contraseña debe tener al menos 5 caracteres','error'); return; }
    const list=DB.get('superadmins')||[];
    if(s){
      const x=list.find(y=>y.id===id);
      // Evitar quitar el último dueño
      if(x.rolSuper==='dueno' && d.rolSuper!=='dueno' && list.filter(y=>y.rolSuper==='dueno').length<=1){
        toast('Debe quedar al menos un dueño','error'); return;
      }
      Object.assign(x,{nombre:d.nombre.trim(), usuario:usuario, pass:d.pass.trim(), rolSuper:d.rolSuper});
    } else {
      list.push({id:uid(), nombre:d.nombre.trim(), usuario:usuario, pass:d.pass.trim(), rolSuper:d.rolSuper, creado:now()});
    }
    DB.set('superadmins',list);
    cerrarModal(); toast('Administrador guardado','success'); render();
  }});
}
function eliminarSuperAdmin(id){
  if(STATE.user.rolSuper!=='dueno'){ toast('Solo el dueño puede eliminar','error'); return; }
  const sas=DB.get('superadmins')||[];
  const s=sas.find(x=>x.id===id); if(!s) return;
  if(s.id===STATE.user.id){ toast('No puedes eliminarte a ti mismo','error'); return; }
  if(s.rolSuper==='dueno' && sas.filter(x=>x.rolSuper==='dueno').length<=1){ toast('Debe quedar al menos un dueño','error'); return; }
  confirmarModal('¿Eliminar al administrador "'+s.nombre+'"? No podrá volver a entrar.',()=>{
    DB.set('superadmins', sas.filter(x=>x.id!==id));
    toast('Administrador eliminado','info'); render();
  },'Eliminar');
}
function cambiarMiPassSuper(){
  const sas=DB.get('superadmins')||[];
  const yo=sas.find(x=>x.id===STATE.user.id);
  if(!yo){ toast('No se encontró tu cuenta','error'); return; }
  abrirModal({titulo:'🔑 Cambiar mi contraseña', textoBoton:'Guardar', campos:[
    {id:'actual', label:'Contraseña actual', requerido:true},
    {id:'nueva', label:'Nueva contraseña', requerido:true},
    {id:'nueva2', label:'Repite la nueva contraseña', requerido:true}
  ], onGuardar:(d)=>{
    if(d.actual!==yo.pass){ toast('La contraseña actual no coincide','error'); return; }
    if(d.nueva.trim().length<5){ toast('La nueva debe tener al menos 5 caracteres','error'); return; }
    if(d.nueva!==d.nueva2){ toast('Las contraseñas nuevas no coinciden','error'); return; }
    const list=DB.get('superadmins')||[];
    const x=list.find(y=>y.id===yo.id);
    if(x){ x.pass=d.nueva.trim(); DB.set('superadmins',list); }
    cerrarModal(); toast('Contraseña actualizada','success');
  }});
}

// ---------- Crear negocio ----------
function nuevoNegocio(){
  abrirModal({titulo:'Crear negocio', textoBoton:'Crear', campos:[
    {id:'nombre', label:'Nombre del negocio', requerido:true, placeholder:'Ej: MANILLASNET'},
    {id:'tipo', label:'Tipo de negocio', tipo:'select', opciones:Object.keys(PERFILES).map(t=>({valor:t,label:t}))},
    {id:'ciudad', label:'Ciudad'},
    {id:'plan', label:'Plan', tipo:'select', opciones:[
      {valor:'Básico',label:'Básico'},{valor:'Profesional',label:'Profesional'},{valor:'Premium',label:'Premium'}]},
    {id:'precio', label:'Precio mensual', tipo:'number', valor:'149900'},
    {id:'usuario', label:'Usuario del administrador', requerido:true, placeholder:'admin'},
    {id:'pass', label:'Contraseña', requerido:true, valor:'admin123'}
  ], extraHTML:`<div class="m-row"><label>¿Cómo cobra este negocio?</label>
      <select id="m-flujo">
        <option value="directo">Cobro directo (tienda: se cobra al instante)</option>
        <option value="dos_pasos">Confirmar y luego cobrar (restaurante: se toma el pedido y se cobra después)</option>
      </select>
      <p class="nota">Esto se puede cambiar después en Configurar.</p>
    </div>`,
  onGuardar:(d)=>{
    const perfil=JSON.parse(JSON.stringify(PERFILES[d.tipo]||PERFILES['Otro']));
    const flujo=(document.getElementById('m-flujo')||{}).value||perfil.flujoPedido;
    const existe=(DB.get('usuarios')||[]).some(u=>u.usuario===d.usuario)
              || (DB.get('superadmins')||[]).some(s=>s.usuario===d.usuario);
    if(existe){ toast('Ese usuario ya existe','error'); return; }
    const negId=uid();
    const negocios=DB.get('negocios')||[];
    negocios.push({
      id:negId, nombre:d.nombre, tipo:d.tipo, ciudad:d.ciudad||'',
      plan:d.plan, precioMes:parseInt(d.precio)||0, activo:true,
      logo:'', nit:'', tel:'', dir:'', eslogan:'',
      palabraProducto:perfil.palabraProducto, palabraProductos:perfil.palabraProductos,
      usaMesas:perfil.usaMesas, usaCocina:perfil.usaCocina,
      usaRecetas:perfil.usaRecetas, usaCitas:perfil.usaCitas,
      usaCaja: perfil.usaCaja!==false, esLogistica: !!perfil.esLogistica,
      flujoPedido:flujo,
      tiposEntrega:perfil.tiposEntrega.slice(),
      funciones:perfil.funciones.slice(),
      tipoFactura:'pos', pctDatafono:0, sonidos:true, tema:'claro',
      sucursales:[], creado:now()
    });
    DB.set('negocios',negocios);
    const usuarios=DB.get('usuarios')||[];
    usuarios.push({id:uid(), negocioId:negId, nombre:'Administrador',
      usuario:d.usuario, pass:d.pass, rol:'admin', activo:true, creado:now()});
    DB.set('usuarios',usuarios);
    cerrarModal();
    toast('Negocio creado: '+d.nombre,'success');
    render();
  }});
}
function toggleNegocio(id){
  const negocios=DB.get('negocios')||[];
  const n=negocios.find(x=>x.id===id); if(!n) return;
  n.activo=!n.activo;
  DB.set('negocios',negocios);
  toast(n.activo?'Negocio activado':'Negocio suspendido','info');
  render();
}
function eliminarNegocio(id){
  if(STATE.user.rolSuper!=='dueno'){ toast('Solo el dueño del sistema puede eliminar empresas','error'); return; }
  const negocios=DB.get('negocios')||[];
  const n=negocios.find(x=>x.id===id); if(!n) return;
  const nUsuarios=(DB.get('usuarios')||[]).filter(u=>u.negocioId===id).length;
  // Primera confirmación
  confirmarModal(
    '⚠️ Vas a ELIMINAR la empresa "'+escapeHtml(n.nombre)+'".\n\nSe borrarán TODOS sus datos: '+nUsuarios+' usuario(s), productos, ventas, inventario, caja e historial. Esto NO se puede deshacer.\n\n¿Continuar?',
  ()=>{
    // Segunda confirmación: escribir el nombre
    abrirModal({titulo:'Confirmar eliminación', textoBoton:'Eliminar definitivamente', campos:[
      {id:'conf', label:'Escribe el nombre exacto de la empresa para confirmar', valor:'', requerido:true, placeholder:n.nombre}
    ], extraHTML:`<p class="nota rojo">Empresa a eliminar: <strong>${escapeHtml(n.nombre)}</strong></p>`,
    onGuardar:(d)=>{
      if((d.conf||'').trim()!==n.nombre){ toast('El nombre no coincide. No se eliminó nada.','error'); return; }
      // Borrar la empresa
      DB.set('negocios', (DB.get('negocios')||[]).filter(x=>x.id!==id));
      // Borrar sus usuarios
      DB.set('usuarios', (DB.get('usuarios')||[]).filter(u=>u.negocioId!==id));
      // Borrar TODAS sus tablas de datos (data_<id>_*)
      TABLAS.forEach(t=>{
        const clave='data_'+id+'_'+t;
        DB.set(clave, null);
        try{ localStorage.removeItem('ws_'+clave); }catch(e){}
        delete CACHE[clave];
      });
      // Borrar también claves por sucursal si existieran
      try{
        Object.keys(CACHE).forEach(k=>{ if(k.indexOf('data_'+id+'_')===0){ DB.set(k,null); delete CACHE[k]; try{localStorage.removeItem('ws_'+k);}catch(e){} } });
      }catch(e){}
      cerrarModal();
      toast('Empresa "'+n.nombre+'" eliminada por completo','error');
      render();
    }});
  },'Sí, continuar');
}
function entrarComoNegocio(id){
  const neg=(DB.get('negocios')||[]).find(n=>n.id===id); if(!neg) return;
  STATE.negocio=neg;
  STATE.user={nombre:'Supervisor', rol:'admin', negocioId:id, esSupervisor:true};
  STATE.esSuperAdmin=false;
  STATE.modoSupervision=true;
  STATE.sucursal=(sucursalesDe(neg)[0]||{id:'principal'}).id;
  STATE.pageNeg='inicio';
  toast('Supervisando '+neg.nombre,'info');
  render();
}
function volverSuperAdmin(){
  STATE.esSuperAdmin=true; STATE.modoSupervision=false;
  STATE.negocio=null; STATE.sucursal=null;
  STATE.user={nombre:'Súper Administrador', rol:'superadmin'};
  STATE.page='';
  render();
}

// ============================================================
//  NUEVA VENTA
// ============================================================
let _carrito=[];
let _vTipo='llevar';
let _vCli={nombre:'',tel:'',dir:'',barrio:'',ciudad:'',depto:'',transportadora:'',domiciliario:'',valorDom:0};
let _vMesa='';
let _vObs='';
let _vCat='Todas';
let _vBusca='';
let _desc=0;
let _descMot='';
let _guardando=false;   // bloquea doble clic

function nuevaVenta(){
  const neg=STATE.negocio;
  ESCRIBIENDO=true;   // proteger: no refrescar mientras arma el pedido
  const caja=misDatos('caja_actual');
  const cajaAbierta = Array.isArray(caja) ? caja[0] : caja;
  if((neg.funciones||[]).indexOf('caja')>-1 && !cajaAbierta){
    return `<div class="tarjeta centro-msg">
      <div class="msg-ico">🔒</div>
      <div class="t-tit centrado">Caja cerrada</div>
      <p class="gris">Nadie puede vender hasta que se abra la caja. Es <strong>una sola caja para todo el negocio</strong>: cuando alguien la abra, todos podrán vender.</p>
      <button class="btn btn-gold" onclick="irA('caja')">Ir a abrir caja</button>
      <button class="btn btn-ghost btn-sm" onclick="refrescarDeLaNube()">🔄 Ya la abrieron, actualizar</button>
    </div>`;
  }
  let productos=misDatos('productos').filter(p=>!p.agotado);
  if(_vCat!=='Todas') productos=productos.filter(p=>(p.categoria||'General')===_vCat);
  if(_vBusca){ const q=_vBusca.toLowerCase(); productos=productos.filter(p=>(p.nombre||'').toLowerCase().includes(q)); }
  const cats=['Todas'].concat(Array.from(new Set(misDatos('productos').filter(p=>!p.agotado).map(p=>p.categoria||'General'))));
  const bruto=_carrito.reduce((a,i)=>a+i.precio*i.qty,0);
  const total=Math.max(0,bruto-_desc);
  const tiposCfg=(neg.tiposEntrega&&neg.tiposEntrega.length)?neg.tiposEntrega:['llevar'];
  if(tiposCfg.indexOf(_vTipo)<0) _vTipo=tiposCfg[0];
  const etiquetas={mesa:'Mesa',llevar:'Para llevar',domicilio:'Domicilio',envio:'Envío nacional'};
  const valorDom=(_vTipo==='domicilio'||_vTipo==='envio')?(parseFloat(_vCli.valorDom)||0):0;
  const dosPasos = neg.flujoPedido==='dos_pasos';

  return `
    <div class="caja-aviso">🟢 Caja abierta por <strong>${escapeHtml(cajaAbierta.cajero||'—')}</strong> · base ${fmtMoney(cajaAbierta.base||0)}${usaSucursales(neg)?' · 📍 '+escapeHtml((sucursalesDe(neg).find(s=>s.id===sucursalActual())||{}).nombre||''):''}</div>
    <div class="venta-grid">
      <div class="venta-izq">
        <input type="text" class="busca-grande" placeholder="🔍 Buscar ${escapeHtml((neg.palabraProducto||'producto').toLowerCase())}..." value="${escapeHtml(_vBusca)}" oninput="_vBusca=this.value;render()">
        ${cats.length>1?`<div class="cats">${cats.map(c=>`<button class="cat ${_vCat===c?'on':''}" onclick="_vCat='${escapeHtml(c)}';render()">${escapeHtml(c)}</button>`).join('')}</div>`:''}
        ${productos.length?`<div class="prods">
          ${productos.map(p=>`<div class="prod" onclick="agregarAlCarrito('${p.id}')">
            <div class="prod-ico">${p.imagen?`<img src="${p.imagen}" alt="">`:ic('box')}</div>
            <div class="prod-nom">${escapeHtml(p.nombre)}</div>
            <div class="prod-pre">${fmtMoney(p.precio)}</div>
            ${p.stock!=null?`<div class="prod-stock ${p.stock<=0?'sin':p.stock<=(p.stockMin||0)?'poco':''}">${p.stock<=0?'Sin stock':'Stock: '+p.stock}</div>`:''}
          </div>`).join('')}
        </div>`:`<p class="gris">${_vBusca||_vCat!=='Todas'?'No se encontraron.':'Sin '+escapeHtml((neg.palabraProductos||'productos').toLowerCase())+'. Agrégalos en Inventario.'}</p>`}
      </div>
      <div class="tarjeta carrito">
        <div class="t-cab">
          <span class="t-tit">${ic('cart')} Pedido</span>
          ${_carrito.length?`<button class="btn btn-sm btn-ghost" onclick="vaciarCarrito()" title="Vaciar">🗑</button>`:''}
        </div>
        ${tiposCfg.length>1?`<div class="tipos">
          ${tiposCfg.map(t=>`<button class="tipo ${_vTipo===t?'on':''}" onclick="_vTipo='${t}';render()">${etiquetas[t]||t}</button>`).join('')}
        </div>`:''}
        ${camposCliente()}
        <div class="items">
          ${_carrito.length? _carrito.map((i,idx)=>`<div class="item">
            <div class="item-info"><div class="item-nom">${escapeHtml(i.nombre)}</div><div class="item-uni">${fmtMoney(i.precio)} c/u</div></div>
            <div class="item-qty">
              <button onclick="cambiarQty(${idx},-1)">−</button>
              <span>${i.qty}</span>
              <button onclick="cambiarQty(${idx},1)">+</button>
            </div>
            <div class="item-tot">${neg.esLogistica?(i.qty+' und'):fmtMoney(i.precio*i.qty)}</div>
          </div>`).join('') : '<div class="carrito-vacio">🛒<p>Toca un producto para agregarlo</p></div>'}
        </div>
        ${_carrito.length?`
          ${neg.esLogistica?`
            <div class="total"><span>A DESPACHAR</span><span>${_carrito.reduce((a,i)=>a+i.qty,0)} und</span></div>
          `:`
          ${_desc>0?`<div class="linea"><span>Subtotal</span><span>${fmtMoney(bruto)}</span></div>
            <div class="linea desc"><span>Descuento${_descMot?' · '+escapeHtml(_descMot):''}</span>
              <span>−${fmtMoney(_desc)} <button class="mini-x" onclick="quitarDescuento()">×</button></span></div>`
           :`<button class="btn btn-ghost btn-block btn-sm" onclick="abrirDescuento()">% Aplicar descuento</button>`}
          <div id="linea-dom">${valorDom>0?`<div class="linea"><span>${_vTipo==='envio'?'Envío':'Domicilio'}</span><span>${fmtMoney(valorDom)}</span></div>`:''}</div>
          <div class="total"><span>TOTAL</span><span id="venta-total">${fmtMoney(total+valorDom)}</span></div>
          `}
          <button class="btn btn-gold btn-block btn-grande" id="btn-confirmar" onclick="${neg.esLogistica?'registrarSalida()':(dosPasos?'confirmarPedido()':'cobrarDirecto()')}">
            ${neg.esLogistica?'📦 Registrar salida':(dosPasos?'✓ Confirmar pedido':'💵 Cobrar ahora')}
          </button>
        `:''}
      </div>
    </div>`;
}

function camposCliente(){
  const c=_vCli;
  if(_vTipo==='mesa'){
    return `<input type="text" class="campo" placeholder="Número de mesa" value="${escapeHtml(_vMesa)}" oninput="_vMesa=this.value">
      <input type="text" class="campo" placeholder="Observaciones..." value="${escapeHtml(_vObs)}" oninput="_vObs=this.value">`;
  }
  if(_vTipo==='domicilio'){
    const doms=misDatos('domiciliarios');
    return `<input type="text" class="campo" placeholder="Nombre del cliente" value="${escapeHtml(c.nombre)}" oninput="_vCli.nombre=this.value">
      <input type="text" class="campo" placeholder="Teléfono" value="${escapeHtml(c.tel)}" oninput="_vCli.tel=this.value" onblur="buscarCliente()">
      <input type="text" class="campo" placeholder="Dirección" value="${escapeHtml(c.dir)}" oninput="_vCli.dir=this.value">
      <input type="text" class="campo" placeholder="Barrio" value="${escapeHtml(c.barrio)}" oninput="_vCli.barrio=this.value">
      <input type="number" class="campo" placeholder="Valor del domicilio" value="${c.valorDom||''}" oninput="_vCli.valorDom=this.value;actualizarTotalVenta()">
      ${doms.length?`<select class="campo" onchange="_vCli.domiciliario=this.value">
        <option value="">Domiciliario...</option>
        ${doms.map(d=>`<option ${c.domiciliario===d.nombre?'selected':''}>${escapeHtml(d.nombre)}</option>`).join('')}
      </select>`:''}
      <input type="text" class="campo" placeholder="Observaciones..." value="${escapeHtml(_vObs)}" oninput="_vObs=this.value">`;
  }
  if(_vTipo==='envio'){
    return `<input type="text" class="campo" placeholder="Nombre del cliente" value="${escapeHtml(c.nombre)}" oninput="_vCli.nombre=this.value">
      <input type="text" class="campo" placeholder="Teléfono / WhatsApp" value="${escapeHtml(c.tel)}" oninput="_vCli.tel=this.value" onblur="buscarCliente()">
      <input type="text" class="campo" placeholder="Dirección" value="${escapeHtml(c.dir)}" oninput="_vCli.dir=this.value">
      <input type="text" class="campo" placeholder="Ciudad" value="${escapeHtml(c.ciudad)}" oninput="_vCli.ciudad=this.value">
      <input type="text" class="campo" placeholder="Departamento" value="${escapeHtml(c.depto)}" oninput="_vCli.depto=this.value">
      <input type="text" class="campo" placeholder="Transportadora" value="${escapeHtml(c.transportadora)}" oninput="_vCli.transportadora=this.value">
      <input type="number" class="campo" placeholder="Valor del envío" value="${c.valorDom||''}" oninput="_vCli.valorDom=this.value;actualizarTotalVenta()">
      <input type="text" class="campo" placeholder="Observaciones..." value="${escapeHtml(_vObs)}" oninput="_vObs=this.value">`;
  }
  return `<input type="text" class="campo" placeholder="Nombre del cliente (opcional)" value="${escapeHtml(c.nombre)}" oninput="_vCli.nombre=this.value">
    <input type="tel" class="campo" placeholder="Teléfono (obligatorio)" value="${escapeHtml(c.tel)}" oninput="_vCli.tel=this.value" onblur="buscarCliente()">
    <input type="text" class="campo" placeholder="Observaciones..." value="${escapeHtml(_vObs)}" oninput="_vObs=this.value">`;
}

// Actualiza SOLO el total y la línea de domicilio en la pantalla de venta,
// sin redibujar todo (así no se pierde el foco del campo = no se sale el teclado).
function actualizarTotalVenta(){
  const bruto=_carrito.reduce((a,i)=>a+i.precio*i.qty,0);
  const total=Math.max(0,bruto-_desc);
  const valorDom=(_vTipo==='domicilio'||_vTipo==='envio')?(parseFloat(_vCli.valorDom)||0):0;
  const elTot=document.getElementById('venta-total');
  if(elTot) elTot.textContent=fmtMoney(total+valorDom);
  const elDom=document.getElementById('linea-dom');
  if(elDom) elDom.innerHTML = valorDom>0?`<div class="linea"><span>${_vTipo==='envio'?'Envío':'Domicilio'}</span><span>${fmtMoney(valorDom)}</span></div>`:'';
}

function agregarAlCarrito(id){
  const neg=STATE.negocio;
  const p=misDatos('productos').find(x=>x.id===id); if(!p) return;
  // Producto con stock propio (tienda): no dejar pedir si no hay
  if(p.stock!=null && p.stock<=0){ toast('Sin existencias: '+p.nombre,'error'); sonidoError(); return; }
  // Plato de restaurante: revisar los insumos de su receta
  if(neg.usaRecetas && p.receta && p.receta.length){
    const insumos=misDatos('insumos');
    const yaEnCarrito=(_carrito.find(i=>i.prodId===id)||{}).qty||0;
    const faltantes=[];
    p.receta.forEach(r=>{
      const ins=insumos.find(x=>x.id===r.insumoId);
      if(ins){
        const necesita=r.cantidad*(yaEnCarrito+1);
        if((ins.stock||0)<necesita) faltantes.push(ins.nombre+(ins.stock<=0?' (agotado)':' (solo quedan '+ins.stock+' '+(ins.unidad||'')+')'));
      }
    });
    if(faltantes.length){
      toast('⛔ No se puede pedir '+p.nombre+': falta '+faltantes.join(', '),'error');
      sonidoError(); return;
    }
  }
  const ex=_carrito.find(i=>i.prodId===id);
  if(ex) ex.qty++; else _carrito.push({prodId:id, nombre:p.nombre, precio:p.precio, qty:1});
  render();
}
function cambiarQty(idx,delta){
  if(!_carrito[idx]) return;
  _carrito[idx].qty+=delta;
  if(_carrito[idx].qty<=0) _carrito.splice(idx,1);
  render();
}
function vaciarCarrito(){ _carrito=[]; _desc=0; _descMot=''; render(); }
function limpiarPedido(){
  _carrito=[]; _vObs=''; _desc=0; _descMot=''; _vMesa='';
  STATE.editandoVentaId=null;
  _vCli={nombre:'',tel:'',dir:'',barrio:'',ciudad:'',depto:'',transportadora:'',domiciliario:'',valorDom:0};
}
function abrirDescuento(){
  const bruto=_carrito.reduce((a,i)=>a+i.precio*i.qty,0);
  abrirModal({titulo:'Aplicar descuento', textoBoton:'Aplicar', campos:[
    {id:'tipo', label:'Tipo', tipo:'select', opciones:[{valor:'valor',label:'Valor fijo ($)'},{valor:'pct',label:'Porcentaje (%)'}]},
    {id:'cantidad', label:'Cantidad', tipo:'number', requerido:true, placeholder:'Ej: 5000 o 10'},
    {id:'motivo', label:'Motivo (opcional)'}
  ], extraHTML:`<p class="nota">Subtotal actual: <strong>${fmtMoney(bruto)}</strong></p>`,
  onGuardar:(d)=>{
    const c=parseFloat(d.cantidad)||0;
    if(c<=0){ toast('Cantidad inválida','error'); return; }
    const desc = d.tipo==='pct' ? Math.round(bruto*c/100) : c;
    if(desc>bruto){ toast('El descuento no puede superar el total','error'); return; }
    _desc=desc; _descMot=d.motivo||(d.tipo==='pct'?c+'%':'');
    cerrarModal(); toast('Descuento aplicado','success'); render();
  }});
}
function quitarDescuento(){ _desc=0; _descMot=''; render(); }
function buscarCliente(){
  const tel=(_vCli.tel||'').trim();
  if(tel.length<7) return;
  const c=misDatos('clientes').find(x=>x.tel===tel);
  if(!c) return;
  if(!_vCli.nombre) _vCli.nombre=c.nombre||'';
  if(!_vCli.dir) _vCli.dir=c.dir||'';
  if(!_vCli.barrio) _vCli.barrio=c.barrio||'';
  if(!_vCli.ciudad) _vCli.ciudad=c.ciudad||'';
  toast('Cliente: '+c.nombre+' ('+(c.pedidos||0)+' pedidos)','success');
  render();
}

// ---------- Crear la venta (base común) ----------
function armarVenta(estado){
  const neg=STATE.negocio;
  const caja=misDatos('caja_actual');
  const cajaAbierta=Array.isArray(caja)?caja[0]:caja;
  const bruto=_carrito.reduce((a,i)=>a+i.precio*i.qty,0);
  const total=Math.max(0,bruto-_desc);
  const valorDom=(_vTipo==='domicilio'||_vTipo==='envio')?(parseFloat(_vCli.valorDom)||0):0;
  const ventas=misDatos('ventas');
  // Si estamos EDITANDO un pedido, reusamos su id, factura, fecha y caja
  const orig = STATE.editandoVentaId ? ventas.find(x=>x.id===STATE.editandoVentaId) : null;
  let factura, id, fecha, cajaId;
  if(orig){
    id=orig.id; factura=orig.factura; fecha=orig.fecha; cajaId=orig.cajaId;
  } else {
    let mayor=0;
    ventas.forEach(v=>{ const n=parseInt(String(v.factura||'').replace(/\D/g,''))||0; if(n>mayor) mayor=n; });
    id=uid(); factura='F-'+String(mayor+1).padStart(5,'0'); fecha=now(); cajaId=cajaAbierta?cajaAbierta.id:null;
  }
  return {
    id:id, factura:factura,
    items:_carrito.slice(),
    subtotal:total, subtotalBruto:bruto, descuento:_desc, descMotivo:_descMot,
    valorDom, propina:orig?(orig.propina||0):0, recargo:orig?(orig.recargo||0):0, total:total+valorDom,
    metodo:orig?orig.metodo:'', estado: orig?orig.estado:estado,
    tipo:_vTipo, cajaId:cajaId,
    vendedor:orig?orig.vendedor:STATE.user.nombre, fecha:fecha,
    editadoPor: orig?STATE.user.nombre:undefined,
    obs:_vObs, mesa:_vTipo==='mesa'?_vMesa:'',
    cliNombre:_vCli.nombre||'', cliTel:_vCli.tel||'', cliDir:_vCli.dir||'', cliBarrio:_vCli.barrio||'',
    cliCiudad:_vCli.ciudad||'', cliDepto:_vCli.depto||'',
    transportadora:_vCli.transportadora||'', domiciliario:_vCli.domiciliario||'',
    estadoCocina: orig?(orig.estadoCocina||''):(neg.usaCocina?'pendiente':'')
  };
}

// Valida datos mínimos del cliente según el tipo de pedido.
// Teléfono obligatorio en Llevar y Domicilio (para poder guardar el cliente).
function validarClientePedido(){
  const tel=(_vCli.tel||'').trim();
  if((_vTipo==='llevar'||_vTipo==='domicilio'||_vTipo==='envio')){
    if(!tel){ toast('El teléfono es obligatorio para '+(_vTipo==='llevar'?'pedidos para llevar':'domicilios')+' (así se guarda el cliente)','error'); return false; }
    if(tel.replace(/\D/g,'').length<7){ toast('Escribe un teléfono válido','error'); return false; }
  }
  if(_vTipo==='domicilio' && !(_vCli.dir||'').trim()){ toast('La dirección es obligatoria para domicilios','error'); return false; }
  return true;
}

// ---------- LOGÍSTICA: registrar salida/entrega de mercancía (sin dinero) ----------
function registrarSalida(){
  if(_guardando) return;
  if(!_carrito.length){ toast('Agrega productos primero','error'); return; }
  if(!validarClientePedido()) return;
  _guardando=true;
  bloquearBoton('btn-confirmar','Guardando…');
  try{
    const venta=armarVenta('pagada');   // en logística la "salida" queda cerrada de una
    venta.esSalida=true; venta.metodo='—';
    venta.cobrado=now(); venta.cobradoPor=STATE.user.nombre;
    const ventas=misDatos('ventas');
    ventas.unshift(venta);
    guardarMisDatos('ventas',ventas);
    guardarClienteAuto(venta);
    descontarStock(venta);
    logAudit('Registró salida', (venta.factura||'')+' · '+(venta.cliNombre||''));
    sonidoPedido();
    avisarStockBajo(venta);
    limpiarPedido(); ESCRIBIENDO=false;
    STATE.pageNeg='pedidos'; render();
    toast('Salida '+venta.factura+' registrada','success');
    if((STATE.negocio.funciones||[]).indexOf('facturas')>-1 || true){
      setTimeout(()=>confirmarModal('¿Imprimir remisión de entrega?',()=>imprimirFactura(venta.id),'Imprimir'),400);
    }
  }catch(e){ console.error(e); toast('Error al registrar salida','error'); }
  finally{ _guardando=false; }
}

// ---------- FLUJO A: confirmar ahora, cobrar después ----------
function confirmarPedido(){
  if(_guardando) return;
  if(!_carrito.length){ toast('Agrega productos primero','error'); return; }
  if(!validarClientePedido()) return;
  _guardando=true;
  bloquearBoton('btn-confirmar','Guardando…');
  try{
    const editando=!!STATE.editandoVentaId;
    const venta=armarVenta('abierta');
    const ventas=misDatos('ventas');
    if(editando){
      const i=ventas.findIndex(x=>x.id===venta.id);
      if(i>-1) ventas[i]=venta; else ventas.unshift(venta);
      logAudit('Editó pedido', venta.factura||'');
    } else {
      ventas.unshift(venta);
    }
    guardarMisDatos('ventas',ventas);
    sonidoPedido();
    // Restaurante: al confirmar un pedido NUEVO, sale la comanda para cocina
    if(!editando && STATE.negocio.usaCocina){ try{ imprimirComanda(venta); }catch(e){} }
    limpiarPedido();
    ESCRIBIENDO=false;
    STATE.pageNeg='pedidos';
    render();
    toast('Pedido '+venta.factura+(editando?' actualizado':' confirmado'),'success');
  }catch(e){
    console.error(e); toast('Error al guardar','error');
  }finally{ _guardando=false; }
}

// ---------- FLUJO B: cobrar de una vez ----------
function cobrarDirecto(){
  if(_guardando) return;
  if(!_carrito.length){ toast('Agrega productos primero','error'); return; }
  if(!validarClientePedido()) return;
  const venta=armarVenta('abierta');
  abrirCobro(venta, true);
}

function bloquearBoton(id,texto){
  try{
    const b=document.getElementById(id);
    if(b){ b.disabled=true; b.style.opacity='.55'; b.style.pointerEvents='none'; b.textContent=texto; }
  }catch(e){}
}

// ============================================================
//  AUDITORÍA (registro de acciones importantes)
// ============================================================
function logAudit(accion, detalle){
  try{
    if(!STATE.negocio || !STATE.user) return;
    const arr=misDatos('auditoria');
    arr.unshift({id:uid(), usuario:STATE.user.nombre||'—', rol:STATE.user.rol||'',
      accion:accion||'', detalle:detalle||'', fecha:now()});
    // Mantener acotado (últimos 800 registros)
    guardarMisDatos('auditoria', arr.slice(0,800));
  }catch(e){}
}

// ============================================================
//  COMANDA DE COCINA (tiquete de preparación)
// ============================================================
function comandaHTML(v){
  const neg=STATE.negocio||{};
  const tipo=(v.tipo==='mesa')?('MESA '+(v.mesa||'').toUpperCase())
    :(v.tipo==='domicilio')?'DOMICILIO':(v.tipo==='envio')?'ENVÍO':'PARA LLEVAR';
  const items=(v.items||[]).map(i=>`<div style="font-size:22px;font-weight:bold;margin-bottom:8px;line-height:1.2;">
      ${i.qty} x ${escapeHtml(i.nombre)}${i.obs?`<div style="font-size:14px;font-weight:normal;padding-left:12px;">&gt;&gt; ${escapeHtml(i.obs)}</div>`:''}</div>`).join('');
  return `<div style="font-family:'Courier New',monospace;color:#000;text-align:center;">
    <div style="font-size:16px;letter-spacing:2px;font-weight:bold;">*** COCINA ***</div>
    <div style="font-size:30px;font-weight:bold;margin:6px 0;">${escapeHtml(v.factura||'')}</div>
    <div style="border:3px solid #000;border-radius:6px;padding:8px;margin:8px 0;font-size:26px;font-weight:bold;">${tipo}</div>
    ${v.tipo==='domicilio'?`<div style="font-size:15px;font-weight:bold;margin-bottom:6px;line-height:1.5;">
       ${v.cliNombre?escapeHtml(v.cliNombre)+'<br>':''}${v.cliDir?escapeHtml(v.cliDir):''}${v.cliBarrio?' · '+escapeHtml(v.cliBarrio):''}<br>
       Tel: ${escapeHtml(v.cliTel||'')}${v.domiciliario?'<br>Mensajero: '+escapeHtml(v.domiciliario):''}</div>`:''}
    ${v.tipo==='llevar'&&v.cliNombre?`<div style="font-size:17px;margin-bottom:6px;"><strong>${escapeHtml(v.cliNombre)}</strong></div>`:''}
    <div style="font-size:13px;font-weight:bold;">${fmtDate(v.fecha)}</div>
  </div>
  <hr style="border:1px dashed #000;margin:8px 0;">
  <div style="font-family:'Courier New',monospace;color:#000;">
    <div style="text-align:center;font-size:13px;font-weight:bold;margin-bottom:6px;">— PEDIDO —</div>
    ${items}
    ${v.obs?`<hr style="border:1px dashed #000;margin:8px 0;"><div style="font-size:15px;font-weight:bold;">NOTA: ${escapeHtml(v.obs)}</div>`:''}
  </div>
  <div style="text-align:center;font-size:16px;margin-top:10px;">--- &#9986; ---</div>`;
}
function imprimirComanda(v){
  if(!v){ return; }
  const w=window.open('','_blank','width=400,height=680');
  if(!w){ toast('Permite las ventanas emergentes para imprimir','error'); return; }
  const estilo='@page{size:80mm auto;margin:0;}'
    +'body{margin:0;padding:4mm 3mm;width:80mm;box-sizing:border-box;'
    +'-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#fff;}';
  w.document.write('<html><head><title>Comanda '+(v.factura||'')+'</title><meta charset="utf-8"><style>'+estilo+'</style></head><body>'+comandaHTML(v)+'</body></html>');
  w.document.close();
  setTimeout(()=>w.print(),400);
}

// ============================================================
//  PEDIDOS
// ============================================================
let _pBusca='';

// Ventas de la jornada: desde que se abrió la caja, sin importar el dispositivo
function ventasJornada(soloPagadas){
  const caja=misDatos('caja_actual');
  const cajaAbierta=Array.isArray(caja)?caja[0]:caja;
  let vs=misDatos('ventas');
  if(cajaAbierta && cajaAbierta.apertura){
    const desde=new Date(cajaAbierta.apertura).getTime();
    vs=vs.filter(v=> v.cajaId===cajaAbierta.id || new Date(v.fecha||0).getTime()>=desde);
  } else {
    const h=today();
    vs=vs.filter(v=>(v.fecha||'').startsWith(h));
  }
  return soloPagadas ? vs.filter(v=>v.estado==='pagada') : vs;
}

function pedidos(){
  const neg=STATE.negocio;
  ESCRIBIENDO=false;
  const caja=misDatos('caja_actual');
  const cajaAbierta=Array.isArray(caja)?caja[0]:caja;
  let vs=ventasJornada(false);
  if(_pBusca){
    const q=_pBusca.toLowerCase();
    vs=vs.filter(v=>(v.factura||'').toLowerCase().includes(q)
      ||(v.cliNombre||'').toLowerCase().includes(q)
      ||(v.cliTel||'').includes(q)
      ||(v.mesa||'').toLowerCase().includes(q));
  }
  const pend=vs.filter(v=>v.estado==='abierta');
  const cerr=vs.filter(v=>v.estado!=='abierta');
  const totPend=pend.reduce((a,v)=>a+(v.total||0),0);
  const etiq={mesa:'Mesa',llevar:'Para llevar',domicilio:'Domicilio',envio:'Envío'};

  const usaCocina=neg.usaCocina;
  const fila=(v)=>`<tr class="${v.estado==='abierta'?'fila-pend':''}">
    <td><strong class="oro">${escapeHtml(v.factura||'—')}</strong>${v.editadoPor?`<br><span class="gris chico">editado: ${escapeHtml(v.editadoPor)}</span>`:''}</td>
    <td>${etiq[v.tipo]||'—'}${v.mesa?' '+escapeHtml(v.mesa):''}</td>
    <td>${escapeHtml(v.cliNombre||'—')}${v.cliTel?`<br><span class="gris chico">${escapeHtml(v.cliTel)}</span>`:''}</td>
    <td class="negrita">${fmtMoney(v.total)}</td>
    <td>${v.estado==='anulada'?'<span class="pill pill-rojo">Anulada</span>'
        :v.estado==='abierta'?'<span class="pill pill-gold">Por cobrar</span>'
        :'<span class="pill pill-verde">Pagada</span>'}${v.estado==='pagada'&&v.metodo?`<br><span class="gris chico">${escapeHtml(v.metodo)}</span>`:''}</td>
    <td class="gris chico">${fmtDate(v.fecha)}${v.vendedor?`<br>por ${escapeHtml(v.vendedor)}`:''}</td>
    <td class="acciones">
      ${v.estado==='abierta'&&tienePermiso('cobrar')?`<button class="btn btn-sm btn-gold" onclick="cobrarPedido('${v.id}')" title="Cobrar">💵 Cobrar</button>`:''}
      ${v.estado!=='anulada'&&tienePermiso('editar')?`<button class="btn btn-sm" onclick="editarPedido('${v.id}')" title="Editar pedido">✏️</button>`:''}
      ${usaCocina&&v.estado!=='anulada'&&tienePermiso('comanda')?`<button class="btn btn-sm" onclick="reimprimirComanda('${v.id}')" title="Comanda de cocina">👨‍🍳</button>`:''}
      ${v.estado!=='anulada'&&tienePermiso('imprimir')?`<button class="btn btn-sm" onclick="imprimirFactura('${v.id}')" title="${v.estado==='pagada'?'Reimprimir factura':'Imprimir cuenta (cobro pendiente)'}">🖨️</button>`:''}
      ${v.estado==='pagada'&&tienePermiso('cambiarpago')?`<button class="btn btn-sm" onclick="cambiarFormaPago('${v.id}')" title="Cambiar forma de pago">💳</button>`:''}
      ${v.estado!=='anulada'&&tienePermiso('anular')?`<button class="btn btn-sm btn-rojo" onclick="anularPedido('${v.id}')" title="Anular factura">✕</button>`:''}
      ${tienePermiso('eliminar')?`<button class="btn btn-sm btn-rojo" onclick="eliminarDefinitivo('${v.id}')" title="Eliminar por completo">🗑️</button>`:''}
    </td>
  </tr>`;

  return `
    ${pend.length?`<div class="tarjeta tarjeta-pend">
      <div class="t-cab">
        <span class="t-tit">⏳ Por cobrar (${pend.length})</span>
        <span class="pill pill-gold grande">${fmtMoney(totPend)}</span>
      </div>
      <p class="gris">Pedidos confirmados que todavía no se han cobrado.</p>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Pedido</th><th>Tipo</th><th>Cliente</th><th>Total</th><th>Estado</th><th>Fecha</th><th>Acciones</th></tr></thead>
        <tbody>${pend.map(fila).join('')}</tbody>
      </table></div>
    </div>`:''}
    <div class="tarjeta">
      <div class="t-cab">
        <span class="t-tit">${ic('report')} Pedidos ${cajaAbierta?'(jornada actual)':'(hoy)'}</span>
        <div class="t-acc">
          <input type="text" class="busca" placeholder="🔍 Factura, cliente, teléfono..." value="${escapeHtml(_pBusca)}" oninput="_pBusca=this.value;render()">
          <button class="btn btn-sm" onclick="refrescarDeLaNube()">🔄 Actualizar</button>
          <button class="btn btn-gold" onclick="irA('ventas')">+ Nueva</button>
        </div>
      </div>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Pedido</th><th>Tipo</th><th>Cliente</th><th>Total</th><th>Estado</th><th>Fecha</th><th>Acciones</th></tr></thead>
        <tbody>${cerr.length? cerr.slice(0,80).map(fila).join('')
          : `<tr><td colspan="7" class="gris">${pend.length?'Todos los pedidos están por cobrar.':'Sin pedidos en esta jornada.'}</td></tr>`}</tbody>
      </table></div>
    </div>`;
}

// ---------- COBRAR ----------
function cobrarPedido(id){
  const v=misDatos('ventas').find(x=>x.id===id);
  if(!v){ toast('Pedido no encontrado','error'); return; }
  if(v.estado==='pagada'){ toast('Ya fue cobrado','info'); return; }
  abrirCobro(v,false);
}

// Modal de cobro. esNuevo=true cuando viene de "Cobrar ahora" (flujo directo)
function abrirCobro(v, esNuevo){
  const neg=STATE.negocio;
  const base=v.subtotal||0;
  const dom=v.valorDom||0;
  const usaPropina=neg.usaCocina;
  const pct=neg.pctDatafono||0;
  const campos=[{id:'metodo', label:'Método de pago', tipo:'select', opciones:[
    {valor:'efectivo',label:'Efectivo'},{valor:'banco',label:'Transferencia / Banco'},{valor:'tarjeta',label:'Tarjeta / Datáfono'}]}];
  if(usaPropina) campos.push({id:'propina', label:'Propina (del mesero, no es del negocio)', tipo:'number', valor:'0'});
  campos.push({id:'recargo', label:'Recargo del datáfono (lo cobra el banco)', tipo:'number', valor:'0'});

  abrirModal({titulo:'Cobrar '+(v.factura||'')+' · '+fmtMoney(base+dom), textoBoton:'Confirmar cobro',
    campos,
    extraHTML:`<div class="cobro-caja">
      <div class="c-row"><span>${escapeHtml(neg.palabraProductos||'Productos')}</span><strong>${fmtMoney(v.subtotalBruto!==undefined?v.subtotalBruto:base)}</strong></div>
      ${v.descuento>0?`<div class="c-row"><span>Descuento${v.descMotivo?' · '+escapeHtml(v.descMotivo):''}</span><strong class="rojo">−${fmtMoney(v.descuento)}</strong></div>`:''}
      ${dom>0?`<div class="c-row"><span>${v.tipo==='envio'?'Envío':'Domicilio'}</span><strong>${fmtMoney(dom)}</strong></div>`:''}
      <div class="c-row" id="r-prop" style="display:none;"><span>Propina</span><strong id="v-prop">$ 0</strong></div>
      <div class="c-row" id="r-rec" style="display:none;"><span>Recargo datáfono</span><strong id="v-rec">$ 0</strong></div>
      <div class="c-row c-total"><span>TOTAL A COBRAR</span><strong id="v-total">${fmtMoney(base+dom)}</strong></div>
      <div class="c-nota" id="c-nota"></div>
    </div>`,
    onAbrir:()=>{
      const recalc=()=>{
        const met=(document.getElementById('m-metodo')||{}).value||'efectivo';
        const prop=parseFloat((document.getElementById('m-propina')||{}).value)||0;
        const rec=parseFloat((document.getElementById('m-recargo')||{}).value)||0;
        const set=(id,val)=>{ const e=document.getElementById(id); if(e) e.textContent=val; };
        const ver=(id,on)=>{ const e=document.getElementById(id); if(e) e.style.display=on?'flex':'none'; };
        set('v-prop',fmtMoney(prop)); ver('r-prop',prop>0);
        set('v-rec',fmtMoney(rec));  ver('r-rec',rec>0);
        set('v-total',fmtMoney(base+dom+prop+rec));
        const n=document.getElementById('c-nota');
        if(n){
          if(met==='tarjeta'){ n.innerHTML='💳 El recargo lo cobra el banco por usar el datáfono, <strong>no es ingreso del negocio</strong>.'; n.style.display='block'; }
          else if(rec>0){ n.innerHTML='⚠️ Registraste recargo pero el pago no es con datáfono.'; n.style.display='block'; }
          else n.style.display='none';
        }
      };
      const sel=document.getElementById('m-metodo');
      if(sel) sel.addEventListener('change',()=>{
        const r=document.getElementById('m-recargo');
        if(r && sel.value==='tarjeta' && pct>0 && !parseFloat(r.value)) r.value=Math.round((base+dom)*pct/100);
        if(r && sel.value!=='tarjeta') r.value=0;
        recalc();
      });
      ['m-propina','m-recargo'].forEach(id=>{ const e=document.getElementById(id); if(e) e.addEventListener('input',recalc); });
      recalc();
    },
    onGuardar:(d)=>{
      if(_guardando) return;
      _guardando=true;
      try{
        const metodo=d.metodo||'efectivo';
        const propina=parseFloat(d.propina)||0;
        const recargo=parseFloat(d.recargo)||0;
        const ventas=misDatos('ventas');
        let venta;
        if(esNuevo){
          venta=v;
          venta.estado='pagada';
          ventas.unshift(venta);
        } else {
          venta=ventas.find(x=>x.id===v.id);
          if(!venta){ toast('El pedido ya no existe','error'); cerrarModal(); _guardando=false; return; }
          venta.estado='pagada';
        }
        venta.metodo=metodo; venta.propina=propina; venta.recargo=recargo;
        venta.total=(venta.subtotal||0)+(venta.valorDom||0)+propina+recargo;
        venta.cobrado=now(); venta.cobradoPor=STATE.user.nombre;
        guardarMisDatos('ventas',ventas);
        guardarClienteAuto(venta);
        descontarStock(venta);
        sonidoVenta();
        avisarStockBajo(venta);
        if(esNuevo){ limpiarPedido(); ESCRIBIENDO=false; }
        cerrarModal();
        toast('Cobrado: '+fmtMoney(venta.total),'success');
        if((neg.funciones||[]).indexOf('facturas')>-1){
          const fid=venta.id;
          setTimeout(()=>confirmarModal('¿Imprimir factura?',()=>imprimirFactura(fid),'Imprimir'),400);
        }
        STATE.pageNeg='pedidos';
        render();
      }catch(e){ console.error(e); toast('Error al cobrar','error'); }
      finally{ _guardando=false; }
    }});
}

// ---------- ANULAR ----------
function anularPedido(id){
  const v=misDatos('ventas').find(x=>x.id===id);
  if(!v){ toast('Pedido no encontrado','error'); return; }
  if(v.estado==='anulada'){ toast('Ya está anulado','info'); return; }
  confirmarModal('¿Anular el pedido '+(v.factura||'')+' de '+fmtMoney(v.total)+'? Si ya estaba cobrado, se devuelve el stock.', ()=>{
    const ventas=misDatos('ventas');
    const venta=ventas.find(x=>x.id===id);
    if(!venta){ toast('El pedido ya no existe','error'); return; }
    const estabaPagada = venta.estado==='pagada';
    venta.estado='anulada';
    venta.anulada=now();
    venta.anuladaPor=STATE.user.nombre;
    guardarMisDatos('ventas',ventas);
    if(estabaPagada) devolverStock(venta);
    logAudit('Anuló pedido', (venta.factura||'')+' · '+fmtMoney(venta.total));
    toast('Pedido anulado','info');
    render();
  },'Sí, anular');
}

// ---------- EDITAR PEDIDO ----------
function editarPedido(id){
  if(!tienePermiso('editar')){ toast('No tienes permiso para editar pedidos','error'); return; }
  const v=misDatos('ventas').find(x=>x.id===id);
  if(!v){ toast('Pedido no encontrado','error'); return; }
  if(v.estado==='anulada'){ toast('No se puede editar un pedido anulado','error'); return; }
  // Cargar el pedido en el carrito para modificarlo
  _carrito=(v.items||[]).map(i=>({prodId:i.prodId, nombre:i.nombre, precio:i.precio, qty:i.qty, obs:i.obs||''}));
  _vTipo=v.tipo||'llevar'; _vMesa=v.mesa||''; _vObs=v.obs||'';
  _desc=v.descuento||0; _descMot=v.descMot||'';
  _vCli={nombre:v.cliNombre||'', tel:v.cliTel||'', dir:v.cliDir||'', barrio:v.cliBarrio||'',
    ciudad:v.cliCiudad||'', depto:v.cliDepto||'', transportadora:v.transportadora||'',
    domiciliario:v.domiciliario||'', valorDom:v.valorDom||0};
  STATE.editandoVentaId=id;   // marca que estamos editando, no creando
  ESCRIBIENDO=true;
  STATE.pageNeg='ventas';
  toast('Editando '+(v.factura||'pedido')+'. Guarda para aplicar cambios.','info');
  render();
}

// ---------- CAMBIAR FORMA DE PAGO (después de cobrado) ----------
function cambiarFormaPago(id){
  if(!tienePermiso('cambiarpago')){ toast('No tienes permiso para cambiar la forma de pago','error'); return; }
  const v=misDatos('ventas').find(x=>x.id===id);
  if(!v){ toast('Pedido no encontrado','error'); return; }
  if(v.estado!=='pagada'){ toast('Solo aplica a pedidos ya cobrados','error'); return; }
  abrirModal({titulo:'Cambiar forma de pago', textoBoton:'Guardar', campos:[
    {id:'metodo', label:'Forma de pago', tipo:'select', valor:v.metodo||'efectivo',
      opciones:[{valor:'efectivo',label:'Efectivo'},{valor:'tarjeta',label:'Tarjeta / Datáfono'},{valor:'banco',label:'Banco / Transferencia'}]}
  ], extraHTML:`<p class="nota">Total cobrado: <strong>${fmtMoney(v.total)}</strong>. Esto corrige cómo se contabiliza en caja y reportes.</p>`,
  onGuardar:(d)=>{
    const ventas=misDatos('ventas');
    const x=ventas.find(y=>y.id===id);
    if(!x){ cerrarModal(); return; }
    const antes=x.metodo;
    x.metodo=d.metodo;
    x.pagoEditadoPor=STATE.user.nombre; x.pagoEditadoEn=now();
    guardarMisDatos('ventas',ventas);
    logAudit('Cambió forma de pago', (x.factura||'')+': '+antes+' → '+d.metodo);
    cerrarModal(); toast('Forma de pago actualizada','success'); render();
  }});
}

// ---------- REIMPRIMIR COMANDA (cocina) ----------
function reimprimirComanda(id){
  if(!tienePermiso('comanda')){ toast('No tienes permiso para imprimir comandas','error'); return; }
  const v=misDatos('ventas').find(x=>x.id===id);
  if(!v){ toast('Pedido no encontrado','error'); return; }
  imprimirComanda(v);
}

// ---------- ELIMINAR DEFINITIVAMENTE ----------
function eliminarDefinitivo(id){
  if(!tienePermiso('eliminar')){ toast('No tienes permiso para eliminar','error'); return; }
  const v=misDatos('ventas').find(x=>x.id===id);
  if(!v){ toast('Pedido no encontrado','error'); return; }
  confirmarModal('⚠️ Eliminar PERMANENTEMENTE '+(v.factura||'este pedido')+' ('+fmtMoney(v.total)+'). Se descuenta de ventas, caja y reportes. No se puede deshacer. ¿Continuar?', ()=>{
    const estabaPagada=v.estado==='pagada';
    if(estabaPagada) devolverStock(v);
    eliminarMisDatos('ventas',id);
    logAudit('Eliminó definitivamente', (v.factura||'')+' · '+fmtMoney(v.total));
    toast('Pedido eliminado por completo','error'); render();
  },'Sí, eliminar');
}

// ---------- INVENTARIO ----------
function descontarStock(venta){
  const neg=STATE.negocio;
  if((neg.funciones||[]).indexOf('inventario')<0) return;
  const productos=misDatos('productos');
  const insumos=neg.usaRecetas?misDatos('insumos'):[];
  let cambioP=false, cambioI=false;
  const agotadosAhora=[];
  (venta.items||[]).forEach(item=>{
    const p=productos.find(x=>x.id===item.prodId);
    if(!p) return;
    if(neg.usaRecetas && p.receta && p.receta.length){
      p.receta.forEach(r=>{
        const ins=insumos.find(i=>i.id===r.insumoId);
        if(ins){
          const antes=ins.stock||0;
          ins.stock=Math.max(0,antes-r.cantidad*item.qty); cambioI=true;
          if(antes>0 && ins.stock<=0 && agotadosAhora.indexOf(ins.nombre)<0) agotadosAhora.push(ins.nombre);
        }
      });
    }
    if(p.stock!=null){ p.stock=Math.max(0,p.stock-item.qty); cambioP=true; }
  });
  if(cambioI) guardarMisDatos('insumos',insumos);
  if(cambioP) guardarMisDatos('productos',productos);
  if(agotadosAhora.length){ toast('⚠️ Se agotó: '+agotadosAhora.join(', ')+'. Revisa Insumos.','error'); }
}
function devolverStock(venta){
  const neg=STATE.negocio;
  if((neg.funciones||[]).indexOf('inventario')<0) return;
  const productos=misDatos('productos');
  const insumos=neg.usaRecetas?misDatos('insumos'):[];
  let cambioP=false, cambioI=false;
  (venta.items||[]).forEach(item=>{
    const p=productos.find(x=>x.id===item.prodId);
    if(!p) return;
    if(neg.usaRecetas && p.receta && p.receta.length){
      p.receta.forEach(r=>{
        const ins=insumos.find(i=>i.id===r.insumoId);
        if(ins){ ins.stock=(ins.stock||0)+r.cantidad*item.qty; cambioI=true; }
      });
    }
    if(p.stock!=null){ p.stock=(p.stock||0)+item.qty; cambioP=true; }
  });
  if(cambioI) guardarMisDatos('insumos',insumos);
  if(cambioP) guardarMisDatos('productos',productos);
}
function avisarStockBajo(venta){
  const neg=STATE.negocio;
  if((neg.funciones||[]).indexOf('inventario')<0) return;
  if(neg.alertaStock===false) return;
  const productos=misDatos('productos');
  const insumos=neg.usaRecetas?misDatos('insumos'):[];
  const agotado=[], bajo=[];
  const revisar=(nombre,stock,min,unidad)=>{
    if(stock<=0) agotado.push(nombre);
    else if(stock<=(min||0)) bajo.push(nombre+' ('+stock+(unidad?' '+unidad:'')+')');
  };
  (venta.items||[]).forEach(item=>{
    const p=productos.find(x=>x.id===item.prodId);
    if(!p) return;
    if(p.stock!=null) revisar(p.nombre, p.stock, p.stockMin);
    if(neg.usaRecetas && p.receta){
      p.receta.forEach(r=>{ const ins=insumos.find(x=>x.id===r.insumoId); if(ins) revisar(ins.nombre, ins.stock||0, ins.stockMin, ins.unidad); });
    }
  });
  // Quitar repetidos
  const ag=Array.from(new Set(agotado)), bj=Array.from(new Set(bajo));
  if(!ag.length && !bj.length) return;
  sonidoAlerta();
  // ALERTA REAL: modal que obliga a enterarse, no un aviso que se va solo
  const cuerpo=`
    ${ag.length?`<div class="alerta" style="border-radius:10px;padding:12px 15px;margin-bottom:10px;">
      <strong class="rojo" style="font-size:15px;">⛔ SE AGOTARON</strong>
      <p style="margin-top:6px;line-height:1.7;">${ag.map(x=>escapeHtml(x)).join('<br>')}</p>
      <p class="nota" style="margin-top:8px;">No se podrán vender hasta que registres una entrada en ${neg.usaRecetas?'Insumos':'Inventario'}.</p>
    </div>`:''}
    ${bj.length?`<div class="tarjeta-pend" style="border-radius:10px;padding:12px 15px;">
      <strong class="oro" style="font-size:15px;">⚠️ QUEDAN POCOS</strong>
      <p style="margin-top:6px;line-height:1.7;">${bj.map(x=>escapeHtml(x)).join('<br>')}</p>
    </div>`:''}`;
  setTimeout(()=>{
    abrirModal({titulo:'🔔 Alerta de inventario', textoBoton:'Entendido', campos:[],
      extraHTML:cuerpo, onGuardar:()=>cerrarModal()});
  },700);
}
// ---------- CLIENTES AUTOMÁTICOS ----------
function guardarClienteAuto(venta){
  const nombre=(venta.cliNombre||'').trim();
  const tel=(venta.cliTel||'').trim();
  if(!nombre && !tel) return;
  const cls=misDatos('clientes');
  let ex=null;
  if(tel) ex=cls.find(c=>c.tel && c.tel===tel);
  if(!ex && nombre) ex=cls.find(c=>(c.nombre||'').toLowerCase()===nombre.toLowerCase());
  if(ex){
    ex.pedidos=(ex.pedidos||0)+1;
    ex.totalComprado=(ex.totalComprado||0)+(venta.total||0);
    if(nombre) ex.nombre=nombre;
    if(tel) ex.tel=tel;
    if(venta.cliDir) ex.dir=venta.cliDir;
    if(venta.cliBarrio) ex.barrio=venta.cliBarrio;
    if(venta.cliCiudad) ex.ciudad=venta.cliCiudad;
    ex.ultimoPedido=now();
  } else {
    cls.unshift({id:uid(), nombre, tel, dir:venta.cliDir||'', barrio:venta.cliBarrio||'',
      ciudad:venta.cliCiudad||'', pedidos:1, totalComprado:venta.total||0,
      creado:now(), ultimoPedido:now()});
  }
  guardarMisDatos('clientes',cls);
}

// ============================================================
//  DASHBOARD
// ============================================================
function inicio(){
  const neg=STATE.negocio;
  ESCRIBIENDO=false;
  // Monto de venta (comida) tolerante: si no hay subtotal, usa total. Antes las
  // ventas sin 'subtotal' sumaban 0 y el dashboard no mostraba lo cobrado.
  const montoVenta=v=>(v.subtotal!=null?v.subtotal:(v.total||0));
  const vs=misDatos('ventas').filter(v=>v.estado==='pagada');
  const h=today();
  const hoy=ventasJornada(true);
  const totHoy=hoy.reduce((a,v)=>a+montoVenta(v),0);
  // Semana y mes
  const d7=new Date(); d7.setDate(d7.getDate()-7);
  const sem=vs.filter(v=>new Date(v.fecha)>=d7).reduce((a,v)=>a+montoVenta(v),0);
  const mes=vs.filter(v=>(v.fecha||'').substring(0,7)===h.substring(0,7)).reduce((a,v)=>a+montoVenta(v),0);
  const pend=ventasJornada(false).filter(v=>v.estado==='abierta');
  // Gráfico 7 días
  const dias=[];
  for(let i=6;i>=0;i--){
    const d=new Date(); d.setDate(d.getDate()-i);
    const k=d.toISOString().split('T')[0];
    dias.push({lbl:['D','L','M','X','J','V','S'][d.getDay()],
      tot:vs.filter(v=>(v.fecha||'').startsWith(k)).reduce((a,v)=>a+montoVenta(v),0)});
  }
  const mx=Math.max.apply(null,dias.map(d=>d.tot).concat([1]));
  const metodos={efectivo:0,banco:0,tarjeta:0};
  hoy.forEach(v=>{ if(metodos[v.metodo]!==undefined) metodos[v.metodo]+=montoVenta(v); });
  // Últimas ventas (las 10 más recientes, como Portal Imperial)
  const ultimas=misDatos('ventas').filter(v=>v.estado!=='anulada')
    .slice().sort((a,b)=>new Date(b.fecha||0)-new Date(a.fecha||0)).slice(0,10);

  return `
    <div class="stats">
      <div class="stat verde"><div class="stat-lbl">Vendido en la jornada</div><div class="stat-val">${fmtMoney(totHoy)}</div><div class="stat-sub">${hoy.length} venta(s)</div></div>
      <div class="stat gold"><div class="stat-lbl">Por cobrar</div><div class="stat-val">${fmtMoney(pend.reduce((a,v)=>a+(v.total||0),0))}</div><div class="stat-sub">${pend.length} pedido(s)</div></div>
      <div class="stat azul"><div class="stat-lbl">Últimos 7 días</div><div class="stat-val">${fmtMoney(sem)}</div><div class="stat-sub">semana</div></div>
      <div class="stat"><div class="stat-lbl">Este mes</div><div class="stat-val">${fmtMoney(mes)}</div><div class="stat-sub">acumulado</div></div>
    </div>
    <div class="grid2">
      <div class="tarjeta">
        <span class="t-tit">${ic('report')} Ventas por día</span>
        <div class="barras">${dias.map(d=>`<div class="barra">
          <div class="b-val">${d.tot>0?(d.tot/1000).toFixed(0)+'k':''}</div>
          <div class="b-fill" style="height:${Math.max(4,(d.tot/mx)*130)}px"></div>
          <div class="b-lbl">${d.lbl}</div></div>`).join('')}</div>
      </div>
      <div class="tarjeta">
        <span class="t-tit">${ic('cash')} Métodos de pago (jornada)</span>
        <div class="linea"><span>Efectivo</span><strong class="verde">${fmtMoney(metodos.efectivo)}</strong></div>
        <div class="linea"><span>Banco / Transferencia</span><strong class="azul">${fmtMoney(metodos.banco)}</strong></div>
        <div class="linea"><span>Tarjeta / Datáfono</span><strong>${fmtMoney(metodos.tarjeta)}</strong></div>
        <div class="linea total-linea"><span>TOTAL</span><strong>${fmtMoney(totHoy)}</strong></div>
      </div>
    </div>
    ${pend.length?`<div class="tarjeta tarjeta-pend">
      <span class="t-tit">⏳ Pedidos por cobrar</span>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Pedido</th><th>Cliente</th><th>Total</th><th>Quién lo tomó</th><th></th></tr></thead>
        <tbody>${pend.slice(0,8).map(v=>`<tr>
          <td><strong class="oro">${escapeHtml(v.factura)}</strong></td>
          <td>${escapeHtml(v.cliNombre||v.mesa||'—')}</td>
          <td class="negrita">${fmtMoney(v.total)}</td>
          <td class="gris">${escapeHtml(v.vendedor||'—')}</td>
          <td><button class="btn btn-sm btn-gold" onclick="cobrarPedido('${v.id}')">Cobrar</button></td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`:''}
    <div class="tarjeta">
      <span class="t-tit">${ic('history')} Últimas ventas</span>
      ${ultimas.length?`<div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Pedido</th><th>Tipo</th><th>Cliente/Mesa</th><th>Método</th><th>Total</th><th>Estado</th><th>Fecha</th></tr></thead>
        <tbody>${ultimas.map(v=>`<tr>
          <td><strong class="oro">${escapeHtml(v.factura||'—')}</strong></td>
          <td>${escapeHtml(tipoVentaLabel(v.tipo))}</td>
          <td>${escapeHtml(v.cliNombre||v.mesa||'—')}</td>
          <td class="gris">${escapeHtml(v.estado==='pagada'?(v.metodo||'—'):'—')}</td>
          <td class="negrita">${fmtMoney(v.total)}</td>
          <td>${v.estado==='pagada'?'<span class="pill pill-verde">Pagada</span>':v.estado==='abierta'?'<span class="pill pill-gold">Abierta</span>':'<span class="pill pill-rojo">'+escapeHtml(v.estado||'')+'</span>'}</td>
          <td class="gris chico">${fmtDate(v.fecha)}</td>
        </tr>`).join('')}</tbody>
      </table></div>`:'<p class="gris">No hay ventas aún.</p>'}
    </div>`;
}
function tipoVentaLabel(t){ return {mesa:'Mesa',domicilio:'Domicilio',llevar:'Para llevar',rapida:'Directa'}[t]||'Venta'; }

// ============================================================
//  CAJA
// ============================================================
function caja(){
  ESCRIBIENDO=false;
  const neg=STATE.negocio;
  const arr=misDatos('caja_actual');
  const c=Array.isArray(arr)?arr[0]:arr;
  if(!c){
    return `<div class="tarjeta centro-msg">
      <div class="msg-ico">${ic('cash')}</div>
      <div class="t-tit centrado">Caja cerrada</div>
      <p class="gris">Abre la caja para empezar la jornada. Queda abierta para todos los empleados.</p>
      <div class="m-row" style="max-width:280px;margin:16px auto;">
        <label>Base inicial (efectivo con el que arrancas)</label>
        <input type="number" id="caja-base" value="0" class="campo">
      </div>
      <button class="btn btn-gold" onclick="abrirCaja()">Abrir caja</button>
    </div>`;
  }
  const ventas=ventasJornada(true);
  const metodos={efectivo:0,banco:0,tarjeta:0};
  ventas.forEach(v=>{ if(metodos[v.metodo]!==undefined) metodos[v.metodo]+=(v.subtotal||0); });
  const totalVenta=metodos.efectivo+metodos.banco+metodos.tarjeta;
  const propinas=ventas.reduce((a,v)=>a+(v.propina||0),0);
  const domis=ventas.reduce((a,v)=>a+(v.valorDom||0),0);
  const recargos=ventas.reduce((a,v)=>a+(v.recargo||0),0);
  const movs=c.movimientos||[];
  const gastos=movs.filter(m=>m.tipo==='gasto').reduce((a,m)=>a+m.valor,0);
  const retiros=movs.filter(m=>m.tipo==='retiro').reduce((a,m)=>a+m.valor,0);
  const entradas=movs.filter(m=>m.tipo==='entrada').reduce((a,m)=>a+m.valor,0);
  const ef=ventas.filter(v=>v.metodo==='efectivo');
  const noEf=ventas.filter(v=>v.metodo!=='efectivo');
  const propEf=ef.reduce((a,v)=>a+(v.propina||0),0);
  const domEf=ef.reduce((a,v)=>a+(v.valorDom||0),0);
  const recEf=ef.reduce((a,v)=>a+(v.recargo||0),0);
  const propBanco=noEf.reduce((a,v)=>a+(v.propina||0),0);
  const domBanco=noEf.reduce((a,v)=>a+(v.valorDom||0),0);
  const enCaja=(c.base||0)+metodos.efectivo+propEf+domEf+recEf+entradas-gastos-retiros-propBanco-domBanco;
  const terceros=(propinas+domis+recargos)>0;

  return `
    <div class="stats">
      <div class="stat verde"><div class="stat-lbl">Efectivo en el cajón</div><div class="stat-val">${fmtMoney(enCaja)}</div><div class="stat-sub">base ${fmtMoney(c.base||0)}</div></div>
      <div class="stat gold"><div class="stat-lbl">Vendido en la jornada</div><div class="stat-val">${fmtMoney(totalVenta)}</div><div class="stat-sub">${ventas.length} venta(s)</div></div>
      <div class="stat azul"><div class="stat-lbl">Abierta por</div><div class="stat-val" style="font-size:17px;">${escapeHtml(c.cajero||'—')}</div><div class="stat-sub">${fmtDate(c.apertura)}</div></div>
    </div>
    <div class="grid2">
      <div class="tarjeta">
        <span class="t-tit">${ic('cash')} Resumen de ventas</span>
        <div class="linea"><span>Efectivo</span><strong class="verde">${fmtMoney(metodos.efectivo)}</strong></div>
        <div class="linea"><span>Banco / Transferencia</span><strong class="azul">${fmtMoney(metodos.banco)}</strong></div>
        <div class="linea"><span>Tarjeta / Datáfono</span><strong>${fmtMoney(metodos.tarjeta)}</strong></div>
        <div class="linea total-linea"><span>TOTAL VENDIDO</span><strong>${fmtMoney(totalVenta)}</strong></div>
      </div>
      <div class="tarjeta">
        <span class="t-tit">${ic('report')} Movimientos</span>
        <div class="botones-fila">
          <button class="btn btn-sm btn-rojo" onclick="movimientoCaja('gasto')">− Gasto</button>
          <button class="btn btn-sm" onclick="movimientoCaja('retiro')">↑ Retiro</button>
          <button class="btn btn-sm btn-verde" onclick="movimientoCaja('entrada')">+ Entrada</button>
        </div>
        ${movs.length?movs.map(m=>`<div class="linea">
          <span>${m.tipo==='gasto'?'Gasto':m.tipo==='retiro'?'Retiro':'Entrada'}: ${escapeHtml(m.concepto||'')}<br><span class="gris chico">${escapeHtml(m.por||'')}</span></span>
          <strong class="${m.tipo==='entrada'?'verde':'rojo'}">${m.tipo==='entrada'?'+':'−'}${fmtMoney(m.valor)}</strong>
        </div>`).join(''):'<p class="gris">Sin movimientos.</p>'}
      </div>
    </div>
    ${terceros?`<div class="tarjeta">
      <span class="t-tit">${ic('users')} Dinero que no es del negocio</span>
      <p class="gris">Se cobra al cliente pero pertenece a terceros. No cuenta como venta.</p>
      ${propinas>0?`<div class="linea"><span>Propinas (del mesero)</span><strong class="verde">${fmtMoney(propinas)}</strong></div>`:''}
      ${domis>0?`<div class="linea"><span>Domicilios (del domiciliario)</span><strong class="verde">${fmtMoney(domis)}</strong></div>`:''}
      ${recargos>0?`<div class="linea"><span>Recargo datáfono (del banco)</span><strong class="oro">${fmtMoney(recargos)}</strong></div>`:''}
    </div>`:''}
    <div class="tarjeta">
      <button class="btn btn-rojo btn-block" onclick="cerrarCaja()">Cerrar caja y hacer el cuadre</button>
    </div>`;
}

function abrirCaja(){
  const ya=misDatos('caja_actual');
  const abierta=Array.isArray(ya)?ya[0]:ya;
  if(abierta){ toast('Ya hay una caja abierta por '+(abierta.cajero||'otro usuario'),'info'); render(); return; }
  const base=parseFloat((document.getElementById('caja-base')||{}).value)||0;
  guardarMisDatos('caja_actual',[{id:uid(), base, apertura:now(), cajero:STATE.user.nombre, movimientos:[]}]);
  toast('Caja abierta','success');
  render();
}
function movimientoCaja(tipo){
  const titulos={gasto:'Registrar gasto de caja',retiro:'Registrar retiro',entrada:'Registrar entrada'};
  abrirModal({titulo:titulos[tipo], textoBoton:'Registrar', campos:[
    {id:'concepto', label:'Concepto', requerido:true},
    {id:'valor', label:'Valor', tipo:'number', requerido:true}
  ], onGuardar:(d)=>{
    const arr=misDatos('caja_actual');
    const c=Array.isArray(arr)?arr[0]:arr;
    if(!c){ toast('No hay caja abierta','error'); return; }
    const valor=parseFloat(d.valor)||0;
    if(valor<=0){ toast('Valor inválido','error'); return; }
    c.movimientos=c.movimientos||[];
    c.movimientos.unshift({id:uid(), tipo, concepto:d.concepto, valor, por:STATE.user.nombre, fecha:now()});
    guardarMisDatos('caja_actual',[c]);
    // Un GASTO de caja es un egreso del negocio: queda en Gastos del Negocio
    // y por tanto en el Reporte Contable (restando de ingresos).
    if(tipo==='gasto'){
      const g=misDatos('gastos_negocio');
      g.unshift({id:uid(), concepto:d.concepto, valor, categoria:'Caja', origen:'caja',
        por:STATE.user.nombre, fecha:now()});
      guardarMisDatos('gastos_negocio',g);
    }
    logAudit(tipo==='gasto'?'Gasto de caja':tipo==='retiro'?'Retiro de caja':'Entrada a caja',
      d.concepto+' · '+fmtMoney(valor));
    cerrarModal(); toast('Registrado','success'); render();
  }});
}
function cerrarCaja(){
  const arr=misDatos('caja_actual');
  const c=Array.isArray(arr)?arr[0]:arr;
  if(!c) return;
  const ventas=ventasJornada(true);
  const ef=ventas.filter(v=>v.metodo==='efectivo');
  const noEf=ventas.filter(v=>v.metodo!=='efectivo');
  const efVenta=ef.reduce((a,v)=>a+(v.subtotal||0),0);
  const movs=c.movimientos||[];
  const gastos=movs.filter(m=>m.tipo==='gasto').reduce((a,m)=>a+m.valor,0);
  const retiros=movs.filter(m=>m.tipo==='retiro').reduce((a,m)=>a+m.valor,0);
  const entradas=movs.filter(m=>m.tipo==='entrada').reduce((a,m)=>a+m.valor,0);
  const propEf=ef.reduce((a,v)=>a+(v.propina||0),0);
  const domEf=ef.reduce((a,v)=>a+(v.valorDom||0),0);
  const recEf=ef.reduce((a,v)=>a+(v.recargo||0),0);
  const propBanco=noEf.reduce((a,v)=>a+(v.propina||0),0);
  const domBanco=noEf.reduce((a,v)=>a+(v.valorDom||0),0);
  const esperado=(c.base||0)+efVenta+propEf+domEf+recEf+entradas-gastos-retiros-propBanco-domBanco;
  abrirModal({titulo:'Cerrar caja', textoBoton:'Cerrar caja', campos:[
    {id:'contado', label:'Cuenta el efectivo del cajón. Esperado: '+fmtMoney(esperado), tipo:'number', valor:String(esperado), requerido:true}
  ], onGuardar:(d)=>{
    const contado=parseFloat(d.contado)||0;
    const dif=contado-esperado;
    const cierre=Object.assign({}, c, {id:uid(), cierre:now(), cerradaPor:STATE.user.nombre,
      totalVentas:ventas.reduce((a,v)=>a+(v.subtotal||0),0),
      efVenta, gastos, retiros, entradas, propEf, domEf,
      esperado, contado, diferencia:dif, motivoDescuadre:(d.motivo||'')});
    const cierres=misDatos('cierres');
    cierres.unshift(cierre);
    guardarMisDatos('cierres',cierres);
    logAudit('Cerró caja', 'Esperado '+fmtMoney(esperado)+' · Contado '+fmtMoney(contado)+
      (dif===0?' · Cuadró':dif>0?' · Sobró '+fmtMoney(dif):' · Faltó '+fmtMoney(Math.abs(dif))));
    // Cierre real: la caja queda vacía para TODOS
    DB.set(claveCajaActual(),[]);
    cerrarModal();
    // Imprimir el cuadre de caja (tirilla 80mm), como Portal Imperial
    imprimirCierre(cierre);
    // Si hubo descuadre, mostramos el reporte para revisar en pantalla
    if(dif!==0){ setTimeout(()=>reporteDescuadre(cierre),300); }
    toast(dif===0?'Caja cerrada, cuadró exacto':dif>0?'Caja cerrada, sobró '+fmtMoney(dif):'Caja cerrada, faltó '+fmtMoney(Math.abs(dif)),
      dif===0?'success':'error');
    render();
  }});
}
// Imprime el cuadre de caja en tirilla POS 80mm
function imprimirCierre(c){
  const neg=STATE.negocio||{};
  const dif=c.diferencia||0;
  const metodos=[['efectivo','Efectivo'],['banco','Banco'],['tarjeta','Tarjeta']];
  const porMet={efectivo:0,banco:0,tarjeta:0};
  const ventasCierre=(c.ventasCierre||[]);
  // Recalcular por método desde las ventas de la jornada guardadas, o usar totales
  const html=`<div style="font-family:Arial,sans-serif;color:#000;width:72mm;padding:4mm;margin:0 auto;font-weight:600;">
    <div style="text-align:center;">
      ${neg.logo?`<img src="${neg.logo}" style="max-height:90px;max-width:200px;margin-bottom:4px;">`:''}
      <div style="font-size:20px;font-weight:800;">${escapeHtml(neg.nombre||'')}</div>
    </div>
    <div style="text-align:center;font-size:17px;font-weight:800;border-top:2px solid #000;border-bottom:2px solid #000;padding:6px 0;margin:8px 0;">CIERRE DE CAJA</div>
    <div style="font-size:13px;line-height:1.7;">
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
    ${c.motivoDescuadre?`<div style="font-size:12px;margin-top:8px;">Obs: ${escapeHtml(c.motivoDescuadre)}</div>`:''}
    <div style="text-align:center;font-size:13px;margin-top:18px;">Firma: _______________</div>
    <div style="text-align:center;font-size:9px;margin-top:12px;border-top:1px dashed #000;padding-top:6px;">Software por WALLACE COMPANY SYSTEM</div>
  </div>`;
  const w=window.open('','_blank','width=400,height=680');
  if(!w){ toast('Permite las ventanas emergentes para imprimir','error'); return; }
  w.document.write('<html><head><title>Cierre '+fmtDate(c.cierre)+'</title><meta charset="utf-8"><style>@page{size:80mm auto;margin:0;}body{margin:0;padding:4mm 3mm;width:80mm;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;background:#fff;}</style></head><body>'+html+'</body></html>');
  w.document.close();
  setTimeout(()=>w.print(),400);
}
// Reporte de descuadre (cuando la caja no cuadra al cerrar)
function reporteDescuadre(c){
  const dif=c.diferencia||0;
  const cuerpo=`
    <div class="${dif<0?'alerta':'tarjeta-pend'}" style="border-radius:10px;padding:14px 16px;">
      <div style="font-size:17px;font-weight:800;" class="${dif<0?'rojo':'oro'}">
        ${dif<0?'⚠️ FALTÓ '+fmtMoney(Math.abs(dif)):'💰 SOBRÓ '+fmtMoney(dif)}
      </div>
      <p class="nota" style="margin-top:6px;">Cerró: ${escapeHtml(c.cerradaPor||'')} · ${fmtDate(c.cierre)}</p>
    </div>
    <div class="cobro-caja" style="margin-top:12px;">
      <div class="c-row"><span>Base de apertura</span><span>${fmtMoney(c.base||0)}</span></div>
      <div class="c-row"><span>Ventas en efectivo</span><span>${fmtMoney(c.efVenta||0)}</span></div>
      <div class="c-row"><span>Entradas</span><span>+${fmtMoney(c.entradas||0)}</span></div>
      <div class="c-row"><span>Gastos</span><span class="rojo">−${fmtMoney(c.gastos||0)}</span></div>
      <div class="c-row"><span>Retiros</span><span class="rojo">−${fmtMoney(c.retiros||0)}</span></div>
      <div class="c-row c-total"><span>Esperado en cajón</span><strong>${fmtMoney(c.esperado||0)}</strong></div>
      <div class="c-row"><span>Contado real</span><span class="negrita">${fmtMoney(c.contado||0)}</span></div>
      <div class="c-row c-total"><span>Diferencia</span><strong class="${dif<0?'rojo':'oro'}">${dif<0?'−':'+'}${fmtMoney(Math.abs(dif))}</strong></div>
    </div>`;
  abrirModal({titulo:'📋 Reporte de descuadre', textoBoton:'Entendido', campos:[
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
function claveCajaActual(){
  return claveDe(STATE.negocio.id,'caja_actual');
}

// ============================================================
//  INVENTARIO / CATÁLOGO
// ============================================================
let _iBusca='';
let _iCat='Todas';

function inventario(){
  ESCRIBIENDO=false;
  const neg=STATE.negocio;
  const esResto=!!neg.usaRecetas;
  const todos=misDatos('productos');
  const insumos=esResto?misDatos('insumos'):[];
  const pp=esResto?'Plato':(neg.palabraProducto||'Producto');
  const pps=esResto?'Platos':(neg.palabraProductos||'Productos');
  let lista=todos;
  if(_iCat!=='Todas') lista=lista.filter(p=>(p.categoria||'General')===_iCat);
  if(_iBusca){ const q=_iBusca.toLowerCase(); lista=lista.filter(p=>(p.nombre||'').toLowerCase().includes(q)); }
  const cats=['Todas'].concat(Array.from(new Set(todos.map(p=>p.categoria||'General'))));

  // ----- MODO RESTAURANTE: menú de platos (sin stock propio) -----
  if(esResto){
    const conReceta=todos.filter(p=>(p.receta||[]).length).length;
    return `
      <div class="stats">
        <div class="stat gold"><div class="stat-ico gold">${ic('chef')}</div><div class="stat-lbl">Platos en el menú</div><div class="stat-val">${todos.length}</div><div class="stat-sub">${cats.length-1} categoría(s)</div></div>
        <div class="stat verde"><div class="stat-ico verde">${ic('box')}</div><div class="stat-lbl">Con receta</div><div class="stat-val">${conReceta}</div><div class="stat-sub">descuentan insumos</div></div>
        <div class="stat"><div class="stat-ico">${ic('cart')}</div><div class="stat-lbl">Insumos disponibles</div><div class="stat-val">${insumos.length}</div><div class="stat-sub">para armar recetas</div></div>
      </div>
      <div class="tarjeta">
        <div class="t-cab">
          <span class="t-tit">${ic('chef')} Menú de platos</span>
          <div class="t-acc">
            <input type="text" class="busca" placeholder="🔍 Buscar plato..." value="${escapeHtml(_iBusca)}" oninput="_iBusca=this.value;render()">
            <button class="btn btn-gold" onclick="editarProducto(null)">+ Agregar plato</button>
          </div>
        </div>
        <p class="nota">Estos platos son los que aparecen en <strong>Nueva Venta</strong>. Cada plato puede tener una receta que descuenta insumos al venderse.</p>
        ${cats.length>1?`<div class="cats">${cats.map(c=>`<button class="cat ${_iCat===c?'on':''}" onclick="_iCat='${escapeHtml(c)}';render()">${escapeHtml(c)}${c!=='Todas'?' ('+todos.filter(p=>(p.categoria||'General')===c).length+')':''}</button>`).join('')}</div>`:''}
        ${lista.length?`<div class="prods inv">
          ${lista.map(p=>{
            const nRec=(p.receta||[]).length;
            return `<div class="prod">
              <div class="prod-ico">${p.imagen?`<img src="${p.imagen}" alt="">`:ic('chef')}</div>
              <div class="prod-nom">${escapeHtml(p.nombre)}</div>
              <div class="prod-cat">${escapeHtml(p.categoria||'General')}</div>
              <div class="prod-pre">${fmtMoney(p.precio)}</div>
              <div class="prod-stock ${nRec?'':'poco'}">${nRec?nRec+' insumo(s)':'Sin receta'}</div>
              <div class="prod-acc">
                <button class="btn btn-sm btn-verde" onclick="editarProducto('${p.id}')">Receta</button>
                <button class="btn btn-sm btn-rojo" onclick="eliminarProducto('${p.id}')">×</button>
              </div>
            </div>`;
          }).join('')}
        </div>`:`<p class="gris">${_iBusca||_iCat!=='Todas'?'No se encontraron platos.':'Sin platos aún. Agrega el primero con "+ Agregar plato".'}</p>`}
      </div>`;
  }

  // ----- MODO NORMAL: inventario por producto (con stock) -----
  const conStock=todos.filter(p=>p.stock!=null);
  const agotados=conStock.filter(p=>p.stock<=0);
  const bajos=conStock.filter(p=>p.stock>0 && p.stock<=(p.stockMin||0));
  const valor=conStock.reduce((a,p)=>a+(p.stock*(p.precio||0)),0);

  return `
    ${conStock.length?`<div class="stats">
      <div class="stat"><div class="stat-lbl">${escapeHtml(pps)}</div><div class="stat-val">${todos.length}</div><div class="stat-sub">${conStock.reduce((a,p)=>a+p.stock,0)} unidades</div></div>
      <div class="stat gold"><div class="stat-lbl">Valor del inventario</div><div class="stat-val">${fmtMoney(valor)}</div><div class="stat-sub">a precio de venta</div></div>
      <div class="stat ${bajos.length?'rojo':''}"><div class="stat-lbl">Quedan pocos</div><div class="stat-val">${bajos.length}</div><div class="stat-sub">por agotarse</div></div>
      <div class="stat ${agotados.length?'rojo':''}"><div class="stat-lbl">Agotados</div><div class="stat-val">${agotados.length}</div><div class="stat-sub">sin unidades</div></div>
    </div>`:''}
    ${(agotados.length||bajos.length)?`<div class="tarjeta alerta">
      <span class="t-tit chico">⚠️ Alertas de inventario</span>
      ${agotados.length?`<p><strong class="rojo">AGOTADOS (${agotados.length}):</strong> ${agotados.map(p=>escapeHtml(p.nombre)).join(', ')}</p>`:''}
      ${bajos.length?`<p><strong class="oro">Quedan pocos (${bajos.length}):</strong> ${bajos.map(p=>escapeHtml(p.nombre)+' ('+p.stock+')').join(', ')}</p>`:''}
    </div>`:''}
    <div class="tarjeta">
      <div class="t-cab">
        <span class="t-tit">${ic('box')} Inventario de ${escapeHtml(pps)}</span>
        <div class="t-acc">
          <input type="text" class="busca" placeholder="🔍 Buscar..." value="${escapeHtml(_iBusca)}" oninput="_iBusca=this.value;render()">
          <button class="btn btn-gold" onclick="editarProducto(null)">+ Agregar ${escapeHtml(pp.toLowerCase())}</button>
        </div>
      </div>
      ${cats.length>1?`<div class="cats">${cats.map(c=>`<button class="cat ${_iCat===c?'on':''}" onclick="_iCat='${escapeHtml(c)}';render()">${escapeHtml(c)}${c!=='Todas'?' ('+todos.filter(p=>(p.categoria||'General')===c).length+')':''}</button>`).join('')}</div>`:''}
      ${lista.length?`<div class="prods inv">
        ${lista.map(p=>{
          const sin=p.stock!=null&&p.stock<=0;
          const poco=p.stock!=null&&p.stock>0&&p.stock<=(p.stockMin||0);
          return `<div class="prod ${p.agotado||sin?'off':''}">
            <div class="prod-ico">${p.imagen?`<img src="${p.imagen}" alt="">`:ic('box')}
              ${p.agotado?'<span class="badge-off">AGOTADO</span>':sin?'<span class="badge-off">SIN STOCK</span>':poco?'<span class="badge-off amarillo">POCOS</span>':''}</div>
            <div class="prod-nom">${escapeHtml(p.nombre)}</div>
            <div class="prod-cat">${escapeHtml(p.categoria||'General')}</div>
            <div class="prod-pre">${fmtMoney(p.precio)}</div>
            ${p.stock!=null?`<div class="prod-stock ${sin?'sin':poco?'poco':''}">Stock: ${p.stock}</div>`:''}
            <div class="prod-acc">
              ${p.stock!=null?`<button class="btn btn-sm btn-verde" onclick="entradaStock('${p.id}')">+ Stock</button>`:''}
              <button class="btn btn-sm" onclick="editarProducto('${p.id}')">Editar</button>
              <button class="btn btn-sm btn-rojo" onclick="eliminarProducto('${p.id}')">×</button>
            </div>
          </div>`;
        }).join('')}
      </div>`:`<p class="gris">${_iBusca||_iCat!=='Todas'?'No se encontraron.':'Sin '+escapeHtml(pps.toLowerCase())+'. Agrega el primero.'}</p>`}
    </div>`;
}

let _recetaTmp=[];   // receta que se está armando en el modal del plato
function editarProducto(id){
  const productos=misDatos('productos');
  const p=id?productos.find(x=>x.id===id):null;
  const neg=STATE.negocio;
  const esResto=!!neg.usaRecetas;
  const cats=Array.from(new Set(productos.map(x=>x.categoria||'General')));
  _recetaTmp = p&&p.receta ? JSON.parse(JSON.stringify(p.receta)) : [];

  const campos=[
    {id:'nombre', label:'Nombre', valor:p?p.nombre:'', requerido:true},
    {id:'precio', label:'Precio de venta', tipo:'number', valor:p?String(p.precio):'', requerido:true},
    {id:'categoria', label:'Categoría', valor:p?(p.categoria||''):'', placeholder:cats.length?cats.join(', '):'Ej: Bebidas'}
  ];
  // Solo los negocios SIN recetas manejan stock por producto.
  // En restaurante el plato no tiene stock propio: se controla por sus insumos.
  if(!esResto){
    campos.push({id:'stock', label:'Stock (deja vacío si no llevas inventario)', tipo:'number', valor:p&&p.stock!=null?String(p.stock):''});
    campos.push({id:'stockmin', label:'Avisar cuando queden menos de', tipo:'number', valor:p&&p.stockMin!=null?String(p.stockMin):'5'});
  }

  abrirModal({
    titulo:(p?'Editar':'Nuevo')+' '+(neg.palabraProducto||'producto').toLowerCase(),
    textoBoton:'Guardar', campos:campos,
    extraHTML: esResto ? recetaEditorHTML() : '',
    onGuardar:(d)=>{
      const arr=misDatos('productos');
      const datos={
        nombre:d.nombre, precio:parseFloat(d.precio)||0,
        categoria:(d.categoria||'General').trim()||'General'
      };
      if(esResto){
        datos.stock=null;                                  // el plato no lleva stock propio
        datos.receta=_recetaTmp.filter(r=>r.insumoId && r.cantidad>0);
      } else {
        datos.stock = d.stock===''?null:(parseFloat(d.stock)||0);
        datos.stockMin = parseFloat(d.stockmin)||0;
      }
      if(p){ const x=arr.find(y=>y.id===id); if(x) Object.assign(x,datos); }
      else { arr.unshift(Object.assign({id:uid(), agotado:false, creado:now(), imagen:''}, datos)); }
      guardarMisDatos('productos',arr);
      _recetaTmp=[];
      cerrarModal(); toast('Guardado','success'); render();
    }});
}

// --- Editor de receta (se muestra dentro del modal del plato) ---
function recetaEditorHTML(){
  const insumos=misDatos('insumos');
  if(!insumos.length){
    return `<div class="cobro-caja" style="margin-top:14px;">
      <strong>Receta</strong>
      <p class="nota" style="margin-top:8px;">Aún no tienes insumos. Ve a <strong>Insumos</strong> y agrega arroz, pollo, etc. Luego podrás armar la receta de este plato. Sin receta, el plato se vende sin descontar inventario.</p>
    </div>`;
  }
  return `<div class="cobro-caja" style="margin-top:14px;">
    <strong>Receta <span class="gris chico">(opcional — qué insumos gasta este plato)</span></strong>
    <div id="receta-lista" style="margin:10px 0;">${recetaFilasHTML()}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
      <select id="rec-insumo" class="campo" style="flex:2;min-width:130px;margin:0;">
        ${insumos.map(i=>`<option value="${i.id}">${escapeHtml(i.nombre)}${i.unidad?' ('+escapeHtml(i.unidad)+')':''}</option>`).join('')}
      </select>
      <input id="rec-cant" type="number" class="campo" placeholder="Cant." style="flex:1;min-width:70px;margin:0;">
      <button type="button" class="btn btn-verde btn-sm" onclick="agregarInsumoReceta()">+ Añadir</button>
    </div>
  </div>`;
}
function recetaFilasHTML(){
  const insumos=misDatos('insumos');
  if(!_recetaTmp.length) return '<p class="nota">Sin insumos en la receta. Este plato se venderá sin descontar inventario.</p>';
  return _recetaTmp.map((r,idx)=>{
    const ins=insumos.find(i=>i.id===r.insumoId);
    return `<div class="c-row" style="padding:6px 0;">
      <span>${ins?escapeHtml(ins.nombre):'(insumo eliminado)'}</span>
      <span><strong>${r.cantidad}</strong> ${ins?escapeHtml(ins.unidad||''):''}
        <button type="button" class="mini-x" onclick="quitarInsumoReceta(${idx})">×</button></span>
    </div>`;
  }).join('');
}
function agregarInsumoReceta(){
  const sel=document.getElementById('rec-insumo');
  const cant=parseFloat((document.getElementById('rec-cant')||{}).value)||0;
  if(!sel||!sel.value){ toast('Elige un insumo','error'); return; }
  if(cant<=0){ toast('Escribe la cantidad','error'); return; }
  const ya=_recetaTmp.find(r=>r.insumoId===sel.value);
  if(ya){ ya.cantidad=cant; } else { _recetaTmp.push({insumoId:sel.value, cantidad:cant}); }
  const cont=document.getElementById('receta-lista');
  if(cont) cont.innerHTML=recetaFilasHTML();
  const ci=document.getElementById('rec-cant'); if(ci) ci.value='';
}
function quitarInsumoReceta(idx){
  _recetaTmp.splice(idx,1);
  const cont=document.getElementById('receta-lista');
  if(cont) cont.innerHTML=recetaFilasHTML();
}
function eliminarProducto(id){
  const p=misDatos('productos').find(x=>x.id===id);
  confirmarModal('¿Eliminar "'+(p?p.nombre:'')+'"?',()=>{
    eliminarMisDatos('productos',id);
    toast('Eliminado','info'); render();
  },'Eliminar');
}
function entradaStock(id){
  const productos=misDatos('productos');
  const p=productos.find(x=>x.id===id); if(!p) return;
  abrirModal({titulo:'Entrada de stock · '+p.nombre, textoBoton:'Agregar', campos:[
    {id:'cant', label:'¿Cuántas unidades entran?', tipo:'number', requerido:true},
    {id:'motivo', label:'Motivo', valor:'Compra'}
  ], extraHTML:`<p class="nota">Stock actual: <strong>${p.stock||0}</strong></p>`,
  onGuardar:(d)=>{
    const cant=parseFloat(d.cant)||0;
    if(cant<=0){ toast('Cantidad inválida','error'); return; }
    const arr=misDatos('productos');
    const x=arr.find(y=>y.id===id);
    if(x){ x.stock=(x.stock||0)+cant; guardarMisDatos('productos',arr); }
    const movs=misDatos('movimientos');
    movs.unshift({id:uid(), productoId:id, nombre:p.nombre, tipo:'entrada', cantidad:cant,
      motivo:d.motivo, por:STATE.user.nombre, fecha:now()});
    guardarMisDatos('movimientos',movs);
    cerrarModal(); toast('Stock actualizado','success'); render();
  }});
}

// ============================================================
//  INSUMOS (inventario de compra de un restaurante)
//  Se descuentan solos por la receta de cada plato.
// ============================================================
let _insBusca='';
function pantallaInsumos(){
  ESCRIBIENDO=false;
  const todos=misDatos('insumos');
  let lista=todos;
  if(_insBusca){ const q=_insBusca.toLowerCase(); lista=lista.filter(i=>(i.nombre||'').toLowerCase().includes(q)); }
  const agotados=todos.filter(i=>(i.stock||0)<=0);
  const bajos=todos.filter(i=>(i.stock||0)>0 && (i.stock||0)<=(i.stockMin||0));
  const valor=todos.reduce((a,i)=>a+((i.stock||0)*(i.costo||0)),0);

  return `
    ${todos.length?`<div class="stats">
      <div class="stat"><div class="stat-ico">${ic('box')}</div><div class="stat-lbl">Insumos</div><div class="stat-val">${todos.length}</div><div class="stat-sub">materias primas</div></div>
      <div class="stat gold"><div class="stat-ico gold">${ic('cash')}</div><div class="stat-lbl">Valor en bodega</div><div class="stat-val">${fmtMoney(valor)}</div><div class="stat-sub">a costo</div></div>
      <div class="stat ${bajos.length?'naranja':''}"><div class="stat-ico ${bajos.length?'naranja':''}">${ic('history')}</div><div class="stat-lbl">Quedan pocos</div><div class="stat-val">${bajos.length}</div><div class="stat-sub">por agotarse</div></div>
      <div class="stat ${agotados.length?'rojo':''}"><div class="stat-ico ${agotados.length?'rojo':''}">${ic('box')}</div><div class="stat-lbl">Agotados</div><div class="stat-val">${agotados.length}</div><div class="stat-sub">sin existencias</div></div>
    </div>`:''}
    ${(agotados.length||bajos.length)?`<div class="tarjeta alerta">
      <span class="t-tit chico">⚠️ Alertas de insumos</span>
      ${agotados.length?`<p><strong class="rojo">AGOTADOS (${agotados.length}):</strong> ${agotados.map(i=>escapeHtml(i.nombre)).join(', ')}</p>`:''}
      ${bajos.length?`<p><strong class="oro">Quedan pocos (${bajos.length}):</strong> ${bajos.map(i=>escapeHtml(i.nombre)+' ('+(i.stock||0)+' '+escapeHtml(i.unidad||'')+')').join(', ')}</p>`:''}
    </div>`:''}
    <div class="tarjeta">
      <div class="t-cab">
        <span class="t-tit">${ic('box')} Insumos e inventario</span>
        <div class="t-acc">
          <input type="text" class="busca" placeholder="🔍 Buscar insumo..." value="${escapeHtml(_insBusca)}" oninput="_insBusca=this.value;render()">
          <button class="btn btn-gold" onclick="editarInsumo(null)">+ Agregar insumo</button>
        </div>
      </div>
      ${lista.length?`<div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Insumo</th><th>Existencias</th><th>Unidad</th><th>Costo unit.</th><th>Avisar bajo</th><th></th></tr></thead>
        <tbody>${lista.map(i=>{
          const sin=(i.stock||0)<=0, poco=(i.stock||0)>0 && (i.stock||0)<=(i.stockMin||0);
          return `<tr>
            <td class="negrita">${escapeHtml(i.nombre)}</td>
            <td><span class="${sin?'rojo':poco?'oro':'verde'} negrita">${i.stock||0}</span>${sin?' <span class="pill pill-rojo">Agotado</span>':poco?' <span class="pill pill-gold">Pocos</span>':''}</td>
            <td class="gris">${escapeHtml(i.unidad||'—')}</td>
            <td>${fmtMoney(i.costo||0)}</td>
            <td class="gris">${i.stockMin||0}</td>
            <td><div class="acciones">
              <button class="btn btn-sm btn-verde" onclick="entradaInsumo('${i.id}')">+ Entrada</button>
              <button class="btn btn-sm" onclick="editarInsumo('${i.id}')">Editar</button>
              <button class="btn btn-sm btn-rojo" onclick="eliminarInsumo('${i.id}')">×</button>
            </div></td>
          </tr>`;
        }).join('')}</tbody>
      </table></div>`:`<p class="gris">${_insBusca?'No se encontraron insumos.':'Aún no hay insumos. Agrega el primero (arroz, pollo, aceite…) y luego los asignas a los platos con una receta.'}</p>`}
    </div>`;
}

function editarInsumo(id){
  const arr=misDatos('insumos');
  const i=id?arr.find(x=>x.id===id):null;
  abrirModal({titulo:(i?'Editar':'Nuevo')+' insumo', textoBoton:'Guardar', campos:[
    {id:'nombre', label:'Nombre del insumo', valor:i?i.nombre:'', requerido:true, placeholder:'Ej: Pollo, Arroz, Aceite'},
    {id:'unidad', label:'Unidad de medida', valor:i?(i.unidad||''):'', placeholder:'g, kg, ml, litro, unidad…'},
    {id:'stock', label:'Existencias actuales', tipo:'number', valor:i&&i.stock!=null?String(i.stock):'0'},
    {id:'costo', label:'Costo por unidad (opcional)', tipo:'number', valor:i&&i.costo!=null?String(i.costo):''},
    {id:'stockmin', label:'Avisar cuando queden menos de', tipo:'number', valor:i&&i.stockMin!=null?String(i.stockMin):'5'}
  ], onGuardar:(d)=>{
    const list=misDatos('insumos');
    const datos={
      nombre:d.nombre.trim(),
      unidad:(d.unidad||'').trim(),
      stock:parseFloat(d.stock)||0,
      costo:d.costo===''?0:(parseFloat(d.costo)||0),
      stockMin:parseFloat(d.stockmin)||0
    };
    if(i){ const x=list.find(y=>y.id===id); if(x) Object.assign(x,datos); }
    else { list.unshift(Object.assign({id:uid(), creado:now()}, datos)); }
    guardarMisDatos('insumos',list);
    cerrarModal(); toast('Insumo guardado','success'); render();
  }});
}
function eliminarInsumo(id){
  const i=misDatos('insumos').find(x=>x.id===id);
  // Avisar si algún plato lo usa en su receta
  const platos=misDatos('productos').filter(p=>(p.receta||[]).some(r=>r.insumoId===id));
  const aviso=platos.length?' Lo usan '+platos.length+' plato(s): quedarán sin ese insumo en la receta.':'';
  confirmarModal('¿Eliminar el insumo "'+(i?i.nombre:'')+'"?'+aviso,()=>{
    eliminarMisDatos('insumos',id);
    // Limpiarlo de las recetas
    const prods=misDatos('productos'); let cambio=false;
    prods.forEach(p=>{ if(p.receta){ const n=p.receta.length; p.receta=p.receta.filter(r=>r.insumoId!==id); if(p.receta.length!==n) cambio=true; } });
    if(cambio) guardarMisDatos('productos',prods);
    toast('Insumo eliminado','info'); render();
  },'Eliminar');
}
function entradaInsumo(id){
  const arr=misDatos('insumos');
  const i=arr.find(x=>x.id===id); if(!i) return;
  abrirModal({titulo:'Entrada de insumo · '+i.nombre, textoBoton:'Agregar', campos:[
    {id:'cant', label:'¿Cuánto entra? ('+(i.unidad||'unidades')+')', tipo:'number', requerido:true},
    {id:'motivo', label:'Motivo', valor:'Compra'}
  ], extraHTML:`<p class="nota">Existencias actuales: <strong>${i.stock||0} ${escapeHtml(i.unidad||'')}</strong></p>`,
  onGuardar:(d)=>{
    const cant=parseFloat(d.cant)||0;
    if(cant<=0){ toast('Cantidad inválida','error'); return; }
    const list=misDatos('insumos');
    const x=list.find(y=>y.id===id);
    if(x){ x.stock=(x.stock||0)+cant; guardarMisDatos('insumos',list); }
    const movs=misDatos('movimientos');
    movs.unshift({id:uid(), insumoId:id, nombre:i.nombre, tipo:'entrada-insumo', cantidad:cant,
      motivo:d.motivo, por:STATE.user.nombre, fecha:now()});
    guardarMisDatos('movimientos',movs);
    cerrarModal(); toast('Entrada registrada','success'); render();
  }});
}

// ============================================================
//  CLIENTES
// ============================================================
let _cBusca='';
function clientes(){
  ESCRIBIENDO=false;
  let cls=misDatos('clientes');
  if(_cBusca){ const q=_cBusca.toLowerCase();
    cls=cls.filter(c=>(c.nombre||'').toLowerCase().includes(q)||(c.tel||'').includes(q)||(c.barrio||'').toLowerCase().includes(q)); }
  cls=cls.slice().sort((a,b)=>(b.pedidos||0)-(a.pedidos||0));
  const todos=misDatos('clientes');
  const totalComprado=todos.reduce((a,c)=>a+(c.totalComprado||0),0);

  return `
    <div class="stats">
      <div class="stat verde"><div class="stat-lbl">Clientes registrados</div><div class="stat-val">${todos.length}</div><div class="stat-sub">${todos.filter(c=>(c.pedidos||0)>0).length} con compras</div></div>
      <div class="stat gold"><div class="stat-lbl">Total comprado</div><div class="stat-val">${fmtMoney(totalComprado)}</div><div class="stat-sub">por todos</div></div>
      <div class="stat azul"><div class="stat-lbl">Cliente top</div><div class="stat-val" style="font-size:17px;">${cls.length?escapeHtml(cls[0].nombre||'—'):'—'}</div><div class="stat-sub">${cls.length?(cls[0].pedidos||0)+' pedido(s)':''}</div></div>
    </div>
    <div class="tarjeta">
      <div class="t-cab">
        <span class="t-tit">${ic('users')} Clientes</span>
        <div class="t-acc">
          <input type="text" class="busca" placeholder="🔍 Nombre, teléfono, barrio..." value="${escapeHtml(_cBusca)}" oninput="_cBusca=this.value;render()">
          <button class="btn btn-gold" onclick="editarCliente(null)">+ Agregar</button>
        </div>
      </div>
      <p class="gris">Se guardan solos cuando cobras un domicilio o envío con datos del cliente.</p>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Nombre</th><th>Teléfono</th><th>Dirección</th><th>Pedidos</th><th>Total comprado</th><th>Último</th><th></th></tr></thead>
        <tbody>
        ${cls.length? cls.map(c=>`<tr>
          <td><strong>${escapeHtml(c.nombre||'—')}</strong></td>
          <td>${escapeHtml(c.tel||'—')}</td>
          <td>${escapeHtml(c.dir||'—')}${c.barrio?`<br><span class="gris chico">${escapeHtml(c.barrio)}</span>`:''}</td>
          <td><strong>${c.pedidos||0}</strong></td>
          <td class="oro negrita">${fmtMoney(c.totalComprado||0)}</td>
          <td class="gris chico">${c.ultimoPedido?fmtDate(c.ultimoPedido):'—'}</td>
          <td class="acciones">
            <button class="btn btn-sm" onclick="editarCliente('${c.id}')">Editar</button>
            <button class="btn btn-sm btn-rojo" onclick="eliminarCliente('${c.id}')">×</button>
          </td>
        </tr>`).join('') : `<tr><td colspan="7" class="gris">${_cBusca?'No se encontraron.':'Sin clientes aún.'}</td></tr>`}
        </tbody>
      </table></div>
    </div>`;
}
function editarCliente(id){
  const cls=misDatos('clientes');
  const c=id?cls.find(x=>x.id===id):null;
  abrirModal({titulo:(c?'Editar':'Nuevo')+' cliente', textoBoton:'Guardar', campos:[
    {id:'nombre', label:'Nombre', valor:c?c.nombre:'', requerido:true},
    {id:'tel', label:'Teléfono', valor:c?c.tel:''},
    {id:'dir', label:'Dirección', valor:c?c.dir:''},
    {id:'barrio', label:'Barrio', valor:c?c.barrio:''},
    {id:'ciudad', label:'Ciudad', valor:c?c.ciudad:''}
  ], onGuardar:(d)=>{
    const arr=misDatos('clientes');
    if(c){ const x=arr.find(y=>y.id===id); if(x) Object.assign(x,{nombre:d.nombre,tel:d.tel,dir:d.dir,barrio:d.barrio,ciudad:d.ciudad}); }
    else { arr.unshift({id:uid(), nombre:d.nombre, tel:d.tel, dir:d.dir, barrio:d.barrio, ciudad:d.ciudad, pedidos:0, totalComprado:0, creado:now()}); }
    guardarMisDatos('clientes',arr);
    cerrarModal(); toast('Guardado','success'); render();
  }});
}
function eliminarCliente(id){
  confirmarModal('¿Eliminar este cliente?',()=>{
    eliminarMisDatos('clientes',id); toast('Eliminado','info'); render();
  },'Eliminar');
}

// ============================================================
//  DOMICILIARIOS
// ============================================================
function domicilios(){
  ESCRIBIENDO=false;
  const doms=misDatos('domiciliarios');
  const vs=ventasJornada(true).filter(v=>v.tipo==='domicilio');
  // Cuadre: por domiciliario, cuánto en domicilios y cómo entró (efectivo vs banco)
  const totalDom=vs.reduce((a,v)=>a+(v.valorDom||0),0);
  const domBanco=vs.filter(v=>v.domPorBanco||v.metodo==='banco').reduce((a,v)=>a+(v.valorDom||0),0);
  const domEfectivo=totalDom-domBanco;
  return `
    <div class="stats">
      <div class="stat gold"><div class="stat-ico gold">${ic('truck')}</div><div class="stat-lbl">Domicilios de la jornada</div><div class="stat-val">${vs.length}</div><div class="stat-sub">${fmtMoney(totalDom)} en total</div></div>
      <div class="stat verde"><div class="stat-ico verde">${ic('cash')}</div><div class="stat-lbl">Cobrados en efectivo</div><div class="stat-val">${fmtMoney(domEfectivo)}</div><div class="stat-sub">los cobra el domiciliario</div></div>
      <div class="stat azul"><div class="stat-ico azul">${ic('report')}</div><div class="stat-lbl">Entraron por banco</div><div class="stat-val">${fmtMoney(domBanco)}</div><div class="stat-sub">se le pagan al domiciliario</div></div>
    </div>
    <div class="tarjeta">
      <div class="t-cab">
        <span class="t-tit">${ic('truck')} Domiciliarios</span>
        <button class="btn btn-gold" onclick="editarDomiciliario(null)">+ Agregar</button>
      </div>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Nombre</th><th>Teléfono</th><th>Entregas</th><th>Domicilios cobrados</th><th></th></tr></thead>
        <tbody>
        ${doms.length? doms.map(d=>{
          const suyos=vs.filter(v=>v.domiciliario===d.nombre);
          return `<tr>
            <td><strong>${escapeHtml(d.nombre)}</strong></td>
            <td>${escapeHtml(d.tel||'—')}</td>
            <td>${suyos.length}</td>
            <td class="oro">${fmtMoney(suyos.reduce((a,v)=>a+(v.valorDom||0),0))}</td>
            <td class="acciones"><button class="btn btn-sm btn-rojo" onclick="eliminarDomiciliario('${d.id}')">×</button></td>
          </tr>`;
        }).join('') : '<tr><td colspan="5" class="gris">Sin domiciliarios.</td></tr>'}
        </tbody>
      </table></div>
    </div>
    <div class="tarjeta">
      <span class="t-tit">${ic('report')} Cuadre de domicilios de la jornada</span>
      <p class="nota">Detalle de cada domicilio y cómo se cobró. El domicilio en efectivo lo recibe el domiciliario directo; el que entra por banco se le paga del cajón.</p>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Pedido</th><th>Cliente</th><th>Domiciliario</th><th>Valor domicilio</th><th>Cómo entró</th></tr></thead>
        <tbody>${vs.length? vs.map(v=>`<tr>
          <td><strong class="oro">${escapeHtml(v.factura||'—')}</strong></td>
          <td>${escapeHtml(v.cliNombre||'—')}${v.cliDir?`<br><span class="gris chico">${escapeHtml(v.cliDir)}</span>`:''}</td>
          <td>${escapeHtml(v.domiciliario||'—')}</td>
          <td class="negrita">${fmtMoney(v.valorDom||0)}</td>
          <td>${(v.domPorBanco||v.metodo==='banco')?'<span class="pill pill-azul">Banco</span>':'<span class="pill pill-verde">Efectivo</span>'}</td>
        </tr>`).join('') : '<tr><td colspan="5" class="gris">Sin domicilios en esta jornada.</td></tr>'}</tbody>
      </table></div>
    </div>`;
}
function editarDomiciliario(id){
  abrirModal({titulo:'Nuevo domiciliario', textoBoton:'Agregar', campos:[
    {id:'nombre', label:'Nombre', requerido:true},
    {id:'tel', label:'Teléfono'}
  ], onGuardar:(d)=>{
    const arr=misDatos('domiciliarios');
    arr.push({id:uid(), nombre:d.nombre, tel:d.tel, creado:now()});
    guardarMisDatos('domiciliarios',arr);
    cerrarModal(); toast('Agregado','success'); render();
  }});
}
function eliminarDomiciliario(id){
  confirmarModal('¿Eliminar este domiciliario?',()=>{
    eliminarMisDatos('domiciliarios',id); toast('Eliminado','info'); render();
  },'Eliminar');
}

// ============================================================
//  REPORTES
// ============================================================
function reportes(){
  ESCRIBIENDO=false;
  const neg=STATE.negocio;
  const vs=misDatos('ventas').filter(v=>v.estado==='pagada');
  const h=today();
  const hoy=vs.filter(v=>(v.fecha||'').startsWith(h));
  const totHoy=hoy.reduce((a,v)=>a+(v.subtotal||0),0);
  const ticket=hoy.length?Math.round(totHoy/hoy.length):0;
  const d7=new Date(); d7.setDate(d7.getDate()-7);
  const k7=d7.toISOString().split('T')[0];
  const hace7=vs.filter(v=>(v.fecha||'').startsWith(k7)).reduce((a,v)=>a+(v.subtotal||0),0);
  const cambio=hace7>0?Math.round((totHoy-hace7)/hace7*100):0;
  const dias=[];
  for(let i=6;i>=0;i--){
    const d=new Date(); d.setDate(d.getDate()-i);
    const k=d.toISOString().split('T')[0];
    dias.push({lbl:['D','L','M','X','J','V','S'][d.getDay()],
      tot:vs.filter(v=>(v.fecha||'').startsWith(k)).reduce((a,v)=>a+(v.subtotal||0),0)});
  }
  const mx=Math.max.apply(null,dias.map(d=>d.tot).concat([1]));
  const meses=[];
  for(let i=11;i>=0;i--){
    const d=new Date(); d.setMonth(d.getMonth()-i);
    const k=d.toISOString().substring(0,7);
    meses.push({lbl:['E','F','M','A','M','J','J','A','S','O','N','D'][d.getMonth()],
      tot:vs.filter(v=>(v.fecha||'').substring(0,7)===k).reduce((a,v)=>a+(v.subtotal||0),0)});
  }
  const mxM=Math.max.apply(null,meses.map(m=>m.tot).concat([1]));
  const items={};
  vs.filter(v=>(v.fecha||'').substring(0,7)===h.substring(0,7))
    .forEach(v=>(v.items||[]).forEach(i=>{ items[i.nombre]=(items[i.nombre]||0)+i.qty; }));
  const top=Object.entries(items).sort((a,b)=>b[1]-a[1]).slice(0,10);
  window._repData={totHoy,hoy,ticket,cambio,hace7,dias,meses,top,mes:h.substring(0,7)};

  return `
    <div class="tarjeta">
      <div class="t-cab">
        <span class="t-tit">${ic('report')} Reportes de ${escapeHtml(neg.nombre)}</span>
        <div class="t-acc"><button class="btn btn-gold btn-sm" onclick="imprimirReporte()">🖨️ PDF / Imprimir</button></div>
      </div>
    </div>
    <div class="stats">
      <div class="stat verde"><div class="stat-lbl">Vendido hoy</div><div class="stat-val">${fmtMoney(totHoy)}</div><div class="stat-sub">${hoy.length} venta(s)</div></div>
      <div class="stat gold"><div class="stat-lbl">Ticket promedio</div><div class="stat-val">${fmtMoney(ticket)}</div><div class="stat-sub">por venta</div></div>
      <div class="stat azul"><div class="stat-lbl">vs. semana pasada</div><div class="stat-val">${cambio>=0?'+':''}${cambio}%</div><div class="stat-sub">${fmtMoney(hace7)} ese día</div></div>
    </div>
    <div class="grid2">
      <div class="tarjeta"><span class="t-tit">Ventas por día (7 días)</span>
        <div class="barras">${dias.map(d=>`<div class="barra"><div class="b-val">${d.tot>0?(d.tot/1000).toFixed(0)+'k':''}</div><div class="b-fill" style="height:${Math.max(4,(d.tot/mx)*130)}px"></div><div class="b-lbl">${d.lbl}</div></div>`).join('')}</div></div>
      <div class="tarjeta"><span class="t-tit">Ventas por mes (12 meses)</span>
        <div class="barras">${meses.map(m=>`<div class="barra"><div class="b-val">${m.tot>0?(m.tot/1000).toFixed(0)+'k':''}</div><div class="b-fill" style="height:${Math.max(4,(m.tot/mxM)*130)}px"></div><div class="b-lbl">${m.lbl}</div></div>`).join('')}</div></div>
    </div>
    ${top.length?`<div class="tarjeta"><span class="t-tit">Más vendidos del mes</span>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>#</th><th>Producto</th><th>Unidades</th></tr></thead>
        <tbody>${top.map((t,i)=>`<tr><td class="gris">${i+1}</td><td><strong>${escapeHtml(t[0])}</strong></td><td class="negrita">${t[1]}</td></tr>`).join('')}</tbody>
      </table></div></div>`:''}`;
}

// ============================================================
//  CONTABLE
// ============================================================
let _mesCont=null;
function contable(){
  ESCRIBIENDO=false;
  const neg=STATE.negocio;
  const mes=_mesCont||today().substring(0,7);
  const vs=misDatos('ventas').filter(v=>v.estado==='pagada');
  const delMes=vs.filter(v=>(v.fecha||'').substring(0,7)===mes);
  const totalVentas=delMes.reduce((a,v)=>a+(v.subtotal||0),0);
  const metodos={efectivo:0,banco:0,tarjeta:0};
  delMes.forEach(v=>{ if(metodos[v.metodo]!==undefined) metodos[v.metodo]+=(v.subtotal||0); });
  const propinas=delMes.reduce((a,v)=>a+(v.propina||0),0);
  const domis=delMes.reduce((a,v)=>a+(v.valorDom||0),0);
  const recargos=delMes.reduce((a,v)=>a+(v.recargo||0),0);
  const gastos=misDatos('gastos_negocio').filter(g=>(g.fecha||'').substring(0,7)===mes);
  const totalGastos=gastos.reduce((a,g)=>a+g.valor,0);
  const cierres=misDatos('cierres').filter(c=>(c.cierre||'').substring(0,7)===mes);
  let retiros=0;
  cierres.forEach(c=>(c.movimientos||[]).forEach(m=>{
    if(m.tipo==='retiro') retiros+=m.valor; }));
  // Los gastos de caja YA están en gastos_negocio (origen:'caja'), no se suman
  // aparte para no contarlos doble.
  const gastosCaja=gastos.filter(g=>g.origen==='caja').reduce((a,g)=>a+g.valor,0);
  const egresos=totalGastos;
  const utilidad=totalVentas-egresos;
  const porConcepto={};
  gastos.forEach(g=>{ const k=(g.origen==='caja'?'(caja) ':'')+g.concepto; porConcepto[k]=(porConcepto[k]||0)+g.valor; });
  const conceptos=Object.entries(porConcepto).sort((a,b)=>b[1]-a[1]);
  const mesesSet={}; mesesSet[today().substring(0,7)]=1;
  vs.forEach(v=>{ if(v.fecha) mesesSet[v.fecha.substring(0,7)]=1; });
  misDatos('gastos_negocio').forEach(g=>{ if(g.fecha) mesesSet[g.fecha.substring(0,7)]=1; });
  const meses=Object.keys(mesesSet).sort().reverse();
  window._contData={mes,nombreMes:nombreMes(mes),totalVentas,metodos,totalGastos,gastosCaja,egresos,utilidad,conceptos,cierres,propinas,domis,recargos,retiros};

  return `
    <div class="tarjeta">
      <div class="t-cab">
        <div><span class="t-tit">${ic('report')} Registro Contable</span>
          <p class="gris">Informe interno de gestión. No es tributario ni tiene relación con la DIAN.</p></div>
        <div class="t-acc">
          <select class="busca" onchange="_mesCont=this.value;render()">
            ${meses.map(m=>`<option value="${m}" ${m===mes?'selected':''}>${nombreMes(m)}</option>`).join('')}
          </select>
          <button class="btn btn-gold btn-sm" onclick="imprimirContable()">🖨️ PDF</button>
        </div>
      </div>
    </div>
    <div class="stats">
      <div class="stat verde"><div class="stat-lbl">Ventas del mes</div><div class="stat-val">${fmtMoney(totalVentas)}</div><div class="stat-sub">${delMes.length} venta(s)</div></div>
      <div class="stat rojo"><div class="stat-lbl">Egresos</div><div class="stat-val">${fmtMoney(egresos)}</div><div class="stat-sub">caja + negocio</div></div>
      <div class="stat gold"><div class="stat-lbl">Utilidad estimada</div><div class="stat-val">${fmtMoney(utilidad)}</div><div class="stat-sub">ventas − egresos</div></div>
      <div class="stat azul"><div class="stat-lbl">Cierres</div><div class="stat-val">${cierres.length}</div><div class="stat-sub">del mes</div></div>
    </div>
    <div class="grid2">
      <div class="tarjeta"><span class="t-tit">Ventas por método</span>
        <div class="linea"><span>Efectivo</span><strong class="verde">${fmtMoney(metodos.efectivo)}</strong></div>
        <div class="linea"><span>Banco</span><strong class="azul">${fmtMoney(metodos.banco)}</strong></div>
        <div class="linea"><span>Tarjeta</span><strong>${fmtMoney(metodos.tarjeta)}</strong></div>
        <div class="linea total-linea"><span>TOTAL</span><strong>${fmtMoney(totalVentas)}</strong></div>
      </div>
      <div class="tarjeta"><span class="t-tit">Egresos por concepto</span>
        ${conceptos.length?conceptos.map(c=>`<div class="linea"><span>${escapeHtml(c[0])}</span><strong class="rojo">${fmtMoney(c[1])}</strong></div>`).join(''):'<p class="gris">Sin gastos este mes.</p>'}
        ${conceptos.length?`<div class="linea total-linea"><span>TOTAL</span><strong class="rojo">${fmtMoney(egresos)}</strong></div>`:''}
      </div>
    </div>
    ${(propinas+domis+recargos)>0?`<div class="tarjeta">
      <span class="t-tit">Dinero de terceros (no es ingreso)</span>
      ${propinas>0?`<div class="linea"><span>Propinas</span><strong>${fmtMoney(propinas)}</strong></div>`:''}
      ${domis>0?`<div class="linea"><span>Domicilios</span><strong>${fmtMoney(domis)}</strong></div>`:''}
      ${recargos>0?`<div class="linea"><span>Recargos datáfono</span><strong>${fmtMoney(recargos)}</strong></div>`:''}
      ${retiros>0?`<div class="linea"><span>Retiros del dueño (no es gasto)</span><strong class="gris">${fmtMoney(retiros)}</strong></div>`:''}
    </div>`:''}
    ${cierres.length?`<div class="tarjeta"><span class="t-tit">Cierres de caja</span>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Fecha</th><th>Cajero</th><th>Esperado</th><th>Contado</th><th>Diferencia</th><th></th></tr></thead>
        <tbody>${cierres.map((c,ci)=>`<tr>
          <td>${(c.cierre||'').split('T')[0]}</td>
          <td>${escapeHtml(c.cerradaPor||c.cajero||'—')}</td>
          <td>${fmtMoney(c.esperado||0)}</td>
          <td>${fmtMoney(c.contado||0)}</td>
          <td class="${(c.diferencia||0)===0?'':(c.diferencia>0?'verde':'rojo')}">${(c.diferencia||0)===0?'✓ cuadró':fmtMoney(c.diferencia)}</td>
          <td><button class="btn btn-sm" onclick="reimprimirCierre('${c.id}')" title="Reimprimir cuadre">🖨️</button></td>
        </tr>`).join('')}</tbody>
      </table></div></div>`:''}`;
}
function reimprimirCierre(id){
  const c=misDatos('cierres').find(x=>x.id===id);
  if(!c){ toast('Cierre no encontrado','error'); return; }
  imprimirCierre(c);
}
function nombreMes(m){
  if(!m) return '';
  const p=m.split('-');
  const n=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return (n[parseInt(p[1])-1]||'')+' de '+p[0];
}

// ============================================================
//  GASTOS DEL NEGOCIO
// ============================================================
let _mesGas=null;
function gastosneg(){
  ESCRIBIENDO=false;
  const gastos=misDatos('gastos_negocio');
  const mes=_mesGas||today().substring(0,7);
  const delMes=gastos.filter(g=>(g.fecha||'').substring(0,7)===mes);
  const total=delMes.reduce((a,g)=>a+g.valor,0);
  const porConcepto={};
  delMes.forEach(g=>{ porConcepto[g.concepto]=(porConcepto[g.concepto]||0)+g.valor; });
  const conceptos=Object.entries(porConcepto).sort((a,b)=>b[1]-a[1]);
  const mesesSet={}; mesesSet[today().substring(0,7)]=1;
  gastos.forEach(g=>{ if(g.fecha) mesesSet[g.fecha.substring(0,7)]=1; });
  const meses=Object.keys(mesesSet).sort().reverse();

  return `
    <div class="tarjeta">
      <div class="t-cab">
        <div><span class="t-tit">${ic('cash')} Gastos del Negocio</span>
          <p class="gris">Gastos que paga el dueño aparte de la caja: arriendo, servicios, mercancía.</p></div>
        <div class="t-acc">
          <select class="busca" onchange="_mesGas=this.value;render()">
            ${meses.map(m=>`<option value="${m}" ${m===mes?'selected':''}>${nombreMes(m)}</option>`).join('')}
          </select>
          <button class="btn btn-gold" onclick="nuevoGasto()">+ Registrar gasto</button>
        </div>
      </div>
    </div>
    <div class="grid2">
      <div class="tarjeta"><span class="t-tit">Resumen de ${nombreMes(mes)}</span>
        <div class="stat-grande">${fmtMoney(total)}</div>
        <p class="gris centrado">${delMes.length} gasto(s)</p>
        ${conceptos.map(c=>`<div class="linea"><span>${escapeHtml(c[0])}</span><strong>${fmtMoney(c[1])}</strong></div>`).join('')}
      </div>
      <div class="tarjeta"><span class="t-tit">Detalle</span>
        <div class="tabla-wrap"><table class="tabla">
          <thead><tr><th>Fecha</th><th>Concepto</th><th>Valor</th><th></th></tr></thead>
          <tbody>${delMes.length?delMes.map(g=>`<tr>
            <td class="gris chico">${(g.fecha||'').split('T')[0]}</td>
            <td>${escapeHtml(g.concepto)}${g.origen==='caja'?' <span class="pill pill-azul">de caja</span>':''}${g.nota?`<br><span class="gris chico">${escapeHtml(g.nota)}</span>`:''}</td>
            <td class="negrita">${fmtMoney(g.valor)}</td>
            <td><button class="btn btn-sm btn-rojo" onclick="eliminarGasto('${g.id}')">×</button></td>
          </tr>`).join(''):'<tr><td colspan="4" class="gris">Sin gastos este mes.</td></tr>'}</tbody>
        </table></div>
      </div>
    </div>`;
}
function nuevoGasto(){
  abrirModal({titulo:'Registrar gasto', textoBoton:'Guardar', campos:[
    {id:'concepto', label:'Concepto', requerido:true, placeholder:'Arriendo, servicios, mercancía...'},
    {id:'valor', label:'Valor', tipo:'number', requerido:true},
    {id:'fecha', label:'Fecha', tipo:'date', valor:today()},
    {id:'metodo', label:'Pagado con', tipo:'select', opciones:[
      {valor:'Efectivo',label:'Efectivo'},{valor:'Banco',label:'Banco'},{valor:'Tarjeta',label:'Tarjeta'}]},
    {id:'nota', label:'Nota (opcional)'}
  ], onGuardar:(d)=>{
    const arr=misDatos('gastos_negocio');
    arr.unshift({id:uid(), concepto:d.concepto, valor:parseFloat(d.valor)||0,
      fecha:d.fecha||today(), metodo:d.metodo, nota:d.nota, por:STATE.user.nombre, creado:now()});
    guardarMisDatos('gastos_negocio',arr);
    logAudit('Registró gasto', d.concepto+' · '+fmtMoney(parseFloat(d.valor)||0));
    cerrarModal(); toast('Gasto registrado','success'); render();
  }});
}
function eliminarGasto(id){
  const g=misDatos('gastos_negocio').find(x=>x.id===id);
  if(!g){ return; }
  const aviso = g.origen==='caja'
    ? '⚠️ Este gasto se hizo desde la CAJA. Si lo borras aquí, la caja de ese día quedará descuadrada. ¿Eliminar de todas formas?'
    : '¿Eliminar el gasto "'+escapeHtml(g.concepto)+'" de '+fmtMoney(g.valor)+'?';
  confirmarModal(aviso,()=>{
    eliminarMisDatos('gastos_negocio',id);
    logAudit('Eliminó gasto', (g.concepto||'')+' · '+fmtMoney(g.valor));
    toast('Gasto eliminado','info'); render();
  },'Eliminar');
}

// ============================================================
//  FACTURAS
// ============================================================
function imprimirFactura(id){
  const v=misDatos('ventas').find(x=>x.id===id); if(!v) return;
  const neg=STATE.negocio;
  const tipo=neg.tipoFactura||'pos';
  let html, pagina, ancho;
  if(tipo==='carta'){ html=facturaCarta(v,neg); pagina='@page{size:letter;margin:14mm;}'; ancho=850; }
  else if(tipo==='media'){ html=facturaMedia(v,neg); pagina='@page{size:letter;margin:10mm;}'; ancho=760; }
  else { html=facturaPOS(v,neg); pagina='@page{size:80mm auto;margin:0;}'; ancho=400; }
  const w=window.open('','_blank','width='+ancho+',height=680');
  if(!w){ toast('Permite las ventanas emergentes para imprimir','error'); return; }
  w.document.write('<html><head><title>Factura '+(v.factura||'')+'</title><meta charset="utf-8"><style>'+pagina+' body{margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;}</style></head><body>'+html+'</body></html>');
  w.document.close();
  setTimeout(()=>w.print(),400);
}
function datosCliente(v){
  const f=[];
  if(v.cliNombre) f.push(['Cliente',v.cliNombre]);
  if(v.cliTel) f.push(['Teléfono',v.cliTel]);
  if(v.cliDir) f.push(['Dirección',v.cliDir]);
  if(v.cliBarrio) f.push(['Barrio',v.cliBarrio]);
  if(v.cliCiudad) f.push(['Ciudad',v.cliCiudad]);
  if(v.cliDepto) f.push(['Departamento',v.cliDepto]);
  if(v.transportadora) f.push(['Transportadora',v.transportadora]);
  if(v.domiciliario) f.push(['Domiciliario',v.domiciliario]);
  return f;
}
function tipoTexto(t){ return {mesa:'Mesa',domicilio:'Domicilio',llevar:'Para llevar',envio:'Envío nacional'}[t]||'Venta'; }

function facturaPOS(v,neg){
  const cli=datosCliente(v);
  // ---- MODO LOGÍSTICA: remisión de entrega, sin valores ni cobro ----
  if(neg.esLogistica || v.esSalida){
    return `<div style="font-family:Arial,sans-serif;color:#000;width:72mm;padding:4mm;margin:0 auto;font-weight:500;">
      <div style="text-align:center;padding-bottom:6px;">
        ${neg.logo?`<img src="${neg.logo}" style="max-height:110px;max-width:230px;margin-bottom:6px;">`:''}
        <div style="font-size:28px;font-weight:800;line-height:1.1;">${escapeHtml(neg.nombre)}</div>
        ${neg.eslogan?`<div style="font-size:14px;font-style:italic;">${escapeHtml(neg.eslogan)}</div>`:''}
        ${neg.nit?`<div style="font-size:13px;margin-top:3px;">NIT: ${escapeHtml(neg.nit)}</div>`:''}
        ${neg.dir?`<div style="font-size:13px;">${escapeHtml(neg.dir)}</div>`:''}
        ${neg.tel?`<div style="font-size:13px;">Tel: ${escapeHtml(neg.tel)}</div>`:''}
      </div>
      <div style="border-top:2px solid #000;border-bottom:2px solid #000;padding:6px 0;text-align:center;margin:6px 0;">
        <div style="font-size:16px;font-weight:bold;">REMISIÓN DE ENTREGA</div>
        <div style="font-size:15px;font-weight:bold;">N° ${escapeHtml(v.factura||'—')}</div>
        <div style="font-size:12px;">(No es factura de venta · sin valor comercial)</div>
      </div>
      <div style="font-size:14px;line-height:1.6;margin:6px 0;">
        <div style="display:flex;justify-content:space-between;"><span>Fecha</span><span>${fmtDate(v.fecha)}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>Despachó</span><span>${escapeHtml(v.vendedor||'')}</span></div>
        ${cli.map(f=>`<div style="display:flex;justify-content:space-between;gap:6px;"><span>${f[0]}</span><span style="text-align:right;max-width:62%;">${escapeHtml(f[1])}</span></div>`).join('')}
      </div>
      <div style="border-top:1px dashed #000;padding-top:5px;">
        <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:bold;border-bottom:1px solid #000;padding-bottom:4px;margin-bottom:5px;"><span>CANTIDAD</span><span>PRODUCTO</span></div>
        ${(v.items||[]).map(i=>`<div style="display:flex;justify-content:space-between;font-size:15px;padding:4px 0;"><span style="font-weight:bold;min-width:40px;">${i.qty} und</span><span style="flex:1;text-align:right;">${escapeHtml(i.nombre)}</span></div>`).join('')}
      </div>
      <div style="border-top:2px solid #000;border-bottom:2px solid #000;margin-top:6px;padding:9px 0;display:flex;justify-content:space-between;font-size:18px;font-weight:800;">
        <span>TOTAL UNIDADES</span><span>${(v.items||[]).reduce((a,i)=>a+i.qty,0)} und</span>
      </div>
      ${v.obs?`<div style="border-top:1px dashed #000;margin-top:8px;padding-top:6px;font-size:12px;"><strong>Obs:</strong> ${escapeHtml(v.obs)}</div>`:''}
      <div style="margin-top:22px;font-size:13px;">
        <div style="border-top:1px solid #000;padding-top:4px;text-align:center;">Firma de quien recibe</div>
      </div>
      <div style="text-align:center;font-size:10px;margin-top:14px;border-top:1px dashed #000;padding-top:8px;">Software por WALLACE COMPANY SYSTEM<br>wallacecompany11@gmail.com</div>
    </div>`;
  }
  // ---- MODO NORMAL: factura de venta ----
  const sub=v.subtotalBruto!==undefined?v.subtotalBruto:(v.subtotal||0);
  let extras='';
  if(v.descuento>0) extras+='<div style="display:flex;justify-content:space-between;"><span>Descuento</span><span>-'+fmtMoney(v.descuento)+'</span></div>';
  if(v.valorDom>0) extras+='<div style="display:flex;justify-content:space-between;"><span>'+(v.tipo==='envio'?'Envío':'Domicilio')+'</span><span>'+fmtMoney(v.valorDom)+'</span></div>';
  if(v.propina>0) extras+='<div style="display:flex;justify-content:space-between;"><span>Propina</span><span>'+fmtMoney(v.propina)+'</span></div>';
  if(v.recargo>0) extras+='<div style="display:flex;justify-content:space-between;"><span>Recargo datáfono</span><span>'+fmtMoney(v.recargo)+'</span></div>';
  return `<div style="font-family:Arial,sans-serif;color:#000;width:72mm;padding:4mm;margin:0 auto;font-weight:500;">
    <div style="text-align:center;padding-bottom:6px;">
      ${neg.logo?`<img src="${neg.logo}" style="max-height:110px;max-width:230px;margin-bottom:6px;">`:''}
      <div style="font-size:28px;font-weight:800;line-height:1.1;">${escapeHtml(neg.nombre)}</div>
      ${neg.eslogan?`<div style="font-size:14px;font-style:italic;">${escapeHtml(neg.eslogan)}</div>`:''}
      ${neg.nit?`<div style="font-size:13px;margin-top:3px;">NIT: ${escapeHtml(neg.nit)}</div>`:''}
      ${neg.dir?`<div style="font-size:13px;">${escapeHtml(neg.dir)}</div>`:''}
      ${neg.tel?`<div style="font-size:13px;">Tel: ${escapeHtml(neg.tel)}</div>`:''}
    </div>
    <div style="border-top:2px solid #000;border-bottom:2px solid #000;padding:6px 0;text-align:center;margin:6px 0;">
      <div style="font-size:15px;font-weight:bold;">FACTURA DE VENTA</div>
      <div style="font-size:15px;font-weight:bold;">N° ${escapeHtml(v.factura||'—')}</div>
      <div style="font-size:13px;">${tipoTexto(v.tipo).toUpperCase()}</div>
    </div>
    <div style="font-size:14px;line-height:1.6;margin:6px 0;">
      <div style="display:flex;justify-content:space-between;"><span>Fecha</span><span>${fmtDate(v.fecha)}</span></div>
      <div style="display:flex;justify-content:space-between;"><span>Atendió</span><span>${escapeHtml(v.vendedor||'')}</span></div>
      ${v.mesa?`<div style="display:flex;justify-content:space-between;"><span>Mesa</span><span>${escapeHtml(v.mesa)}</span></div>`:''}
      ${cli.map(f=>`<div style="display:flex;justify-content:space-between;gap:6px;"><span>${f[0]}</span><span style="text-align:right;max-width:62%;">${escapeHtml(f[1])}</span></div>`).join('')}
    </div>
    <div style="border-top:1px dashed #000;padding-top:5px;">
      <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:bold;border-bottom:1px solid #000;padding-bottom:4px;margin-bottom:5px;"><span>CANT / PRODUCTO</span><span>VALOR</span></div>
      ${(v.items||[]).map(i=>`<div style="display:flex;justify-content:space-between;font-size:14px;padding:3px 0;"><span style="flex:1;padding-right:8px;">${i.qty} × ${escapeHtml(i.nombre)}</span><span>${fmtMoney(i.precio*i.qty)}</span></div>`).join('')}
    </div>
    <div style="border-top:1px dashed #000;margin-top:6px;padding-top:6px;font-size:14px;">
      <div style="display:flex;justify-content:space-between;"><span>Subtotal</span><span>${fmtMoney(sub)}</span></div>
      ${extras}
    </div>
    <div style="border-top:2px solid #000;border-bottom:2px solid #000;margin-top:6px;padding:9px 0;display:flex;justify-content:space-between;font-size:21px;font-weight:800;">
      <span>TOTAL</span><span>${fmtMoney(v.total)}</span>
    </div>
    <div style="text-align:center;font-size:13px;margin-top:6px;">Pago: <strong>${v.estado==='pagada'?escapeHtml((v.metodo||'').toUpperCase()):'—'}</strong></div>
    ${v.estado!=='pagada'?`<div style="border:3px solid #000;border-radius:6px;margin-top:8px;padding:8px;text-align:center;font-size:17px;font-weight:800;">*** COBRO PENDIENTE ***<div style="font-size:12px;font-weight:600;margin-top:3px;">Esta cuenta aún no ha sido pagada</div></div>`:''}
    ${v.obs?`<div style="border-top:1px dashed #000;margin-top:8px;padding-top:6px;font-size:12px;"><strong>Obs:</strong> ${escapeHtml(v.obs)}</div>`:''}
    <div style="text-align:center;margin-top:14px;font-size:16px;font-weight:800;">${v.estado==='pagada'?'¡GRACIAS POR SU COMPRA!':'CUENTA DE COBRO'}</div>
    <div style="text-align:center;font-size:10px;margin-top:10px;border-top:1px dashed #000;padding-top:8px;">Software por WALLACE COMPANY SYSTEM<br>wallacecompany11@gmail.com</div>
  </div>`;
}
function facturaMedia(v,neg){
  const sub=v.subtotalBruto!==undefined?v.subtotalBruto:(v.subtotal||0);
  const cli=datosCliente(v);
  const N='#132d46';
  let extras='';
  if(v.descuento>0) extras+='<tr><td style="padding:5px 10px;text-align:right;">Descuento</td><td style="padding:5px 10px;text-align:right;">-'+fmtMoney(v.descuento)+'</td></tr>';
  if(v.valorDom>0) extras+='<tr><td style="padding:5px 10px;text-align:right;">'+(v.tipo==='envio'?'Envío':'Domicilio')+'</td><td style="padding:5px 10px;text-align:right;">'+fmtMoney(v.valorDom)+'</td></tr>';
  if(v.propina>0) extras+='<tr><td style="padding:5px 10px;text-align:right;">Propina</td><td style="padding:5px 10px;text-align:right;">'+fmtMoney(v.propina)+'</td></tr>';
  if(v.recargo>0) extras+='<tr><td style="padding:5px 10px;text-align:right;">Recargo datáfono</td><td style="padding:5px 10px;text-align:right;">'+fmtMoney(v.recargo)+'</td></tr>';
  return `<div style="font-family:Arial,sans-serif;color:#111;max-width:190mm;margin:0 auto;font-size:12px;">
    <div style="background:${N};height:9px;"></div>
    <div style="text-align:center;padding:9px 0 7px;font-size:17px;font-weight:800;letter-spacing:5px;color:${N};">FACTURA</div>
    <div style="background:${N};height:3px;"></div>
    <div style="display:flex;justify-content:center;gap:26px;padding:7px 0;font-size:11px;border-bottom:1px solid #ddd;">
      <span><strong>FECHA:</strong> ${fmtDate(v.fecha)}</span>
      <span><strong>NÚMERO:</strong> ${escapeHtml(v.factura||'—')}</span>
      <span><strong>TIPO:</strong> ${tipoTexto(v.tipo)}</span>
    </div>
    <div style="display:flex;gap:20px;padding:14px 4px;border-bottom:1px solid #ddd;">
      <div style="flex:0 0 150px;text-align:center;">
        ${neg.logo?`<img src="${neg.logo}" style="max-height:75px;max-width:145px;">`:`<div style="font-size:20px;font-weight:800;color:${N};">${escapeHtml(neg.nombre)}</div>`}
      </div>
      <div style="flex:1;font-size:11px;line-height:1.55;">
        <div style="font-weight:800;font-size:13px;">${escapeHtml(neg.nombre)}</div>
        ${neg.nit?`<div>NIT: ${escapeHtml(neg.nit)}</div>`:''}
        ${neg.dir?`<div>${escapeHtml(neg.dir)}</div>`:''}
        ${neg.tel?`<div>Tel: ${escapeHtml(neg.tel)}</div>`:''}
      </div>
      <div style="flex:1;font-size:11px;line-height:1.55;">
        <div style="font-size:9px;letter-spacing:1.5px;color:#888;">CLIENTE</div>
        ${cli.length?cli.map(f=>`<div><strong>${f[0]}:</strong> ${escapeHtml(f[1])}</div>`).join(''):'<div style="color:#999;">Consumidor final</div>'}
      </div>
    </div>
    <table style="width:100%;border-collapse:collapse;margin-top:14px;font-size:11px;">
      <thead><tr style="background:${N};color:#fff;">
        <th style="padding:7px 10px;text-align:left;width:60px;">CANT</th>
        <th style="padding:7px 10px;text-align:left;">CONCEPTO</th>
        <th style="padding:7px 10px;text-align:right;width:90px;">PRECIO</th>
        <th style="padding:7px 10px;text-align:right;width:95px;">IMPORTE</th>
      </tr></thead>
      <tbody>${(v.items||[]).map((i,x)=>`<tr style="background:${x%2?'#f7f9fa':'#fff'};border-bottom:1px solid #e8ecef;">
        <td style="padding:7px 10px;">${i.qty}</td>
        <td style="padding:7px 10px;">${escapeHtml(i.nombre)}</td>
        <td style="padding:7px 10px;text-align:right;">${fmtMoney(i.precio)}</td>
        <td style="padding:7px 10px;text-align:right;font-weight:600;">${fmtMoney(i.precio*i.qty)}</td>
      </tr>`).join('')}</tbody>
    </table>
    <div style="display:flex;justify-content:flex-end;margin-top:14px;">
      <table style="border-collapse:collapse;font-size:12px;min-width:265px;">
        <tr><td style="padding:5px 10px;text-align:right;">Subtotal</td><td style="padding:5px 10px;text-align:right;">${fmtMoney(sub)}</td></tr>
        ${extras}
        <tr style="background:${N};color:#fff;">
          <td style="padding:9px 10px;text-align:right;font-weight:800;font-size:14px;">TOTAL</td>
          <td style="padding:9px 10px;text-align:right;font-weight:800;font-size:14px;">${fmtMoney(v.total)}</td>
        </tr>
      </table>
    </div>
    ${v.obs?`<div style="margin-top:12px;font-size:11px;padding:8px 10px;background:#f7f9fa;border-left:3px solid #01c38e;"><strong>Obs:</strong> ${escapeHtml(v.obs)}</div>`:''}
    <div style="margin-top:20px;text-align:center;font-size:12px;font-weight:700;color:${N};">¡Gracias por su compra!</div>
    <div style="margin-top:14px;border-top:1px solid #ddd;padding-top:8px;text-align:center;font-size:9px;color:#888;">
      Software por <strong style="color:${N};">WALLACE COMPANY SYSTEM</strong> · wallacecompany11@gmail.com
    </div>
    <div style="background:#01c38e;height:5px;margin-top:8px;"></div>
  </div>`;
}
function facturaCarta(v,neg){
  return facturaMedia(v,neg).replace('max-width:190mm','max-width:190mm;font-size:13px');
}
function imprimirReporte(){
  const d=window._repData; if(!d){ toast('Abre primero los reportes','error'); return; }
  const neg=STATE.negocio;
  const html=`<div style="font-family:Arial,sans-serif;color:#000;max-width:800px;margin:0 auto;padding:18px;">
    <div style="text-align:center;border-bottom:2px solid #000;padding-bottom:10px;">
      ${neg.logo?`<img src="${neg.logo}" style="max-height:70px;">`:''}
      <div style="font-size:22px;font-weight:800;">${escapeHtml(neg.nombre)}</div>
      <div style="font-size:16px;font-weight:700;margin-top:6px;">Reporte de Ventas</div>
      <div style="font-size:11px;color:#555;">Generado el ${new Date().toLocaleString('es-CO')}</div>
    </div>
    <table style="width:100%;font-size:13px;margin-top:16px;">
      <tr><td style="padding:5px;">Vendido hoy</td><td style="text-align:right;font-weight:bold;">${fmtMoney(d.totHoy)}</td></tr>
      <tr><td style="padding:5px;">Transacciones</td><td style="text-align:right;">${d.hoy.length}</td></tr>
      <tr><td style="padding:5px;">Ticket promedio</td><td style="text-align:right;">${fmtMoney(d.ticket)}</td></tr>
    </table>
    ${d.top.length?`<h3 style="font-size:14px;margin-top:18px;border-bottom:1px solid #999;">Más vendidos</h3>
    <table style="width:100%;font-size:12px;border-collapse:collapse;">
      ${d.top.map(t=>`<tr style="border-bottom:1px solid #eee;"><td style="padding:5px;">${escapeHtml(t[0])}</td><td style="padding:5px;text-align:right;font-weight:600;">${t[1]}</td></tr>`).join('')}
    </table>`:''}
    <div style="margin-top:24px;text-align:center;font-size:10px;color:#666;border-top:1px dashed #999;padding-top:8px;">
      Software por WALLACE COMPANY SYSTEM
    </div></div>`;
  const w=window.open('','_blank','width=850,height=680');
  if(!w){ toast('Permite las ventanas emergentes','error'); return; }
  w.document.write('<html><head><title>Reporte</title><meta charset="utf-8"><style>@page{size:letter;margin:12mm;}body{margin:0;}</style></head><body>'+html+'</body></html>');
  w.document.close(); setTimeout(()=>w.print(),400);
}
function imprimirContable(){
  const d=window._contData; if(!d){ toast('Abre primero el informe','error'); return; }
  const neg=STATE.negocio;
  const html=`<div style="font-family:Arial,sans-serif;color:#000;max-width:800px;margin:0 auto;padding:18px;">
    <div style="text-align:center;border-bottom:2px solid #000;padding-bottom:10px;">
      ${neg.logo?`<img src="${neg.logo}" style="max-height:70px;">`:''}
      <div style="font-size:22px;font-weight:800;">${escapeHtml(neg.nombre)}</div>
      ${neg.nit?`<div style="font-size:12px;">NIT: ${escapeHtml(neg.nit)}</div>`:''}
      <div style="font-size:16px;font-weight:700;margin-top:6px;">Registro Contable — ${escapeHtml(d.nombreMes)}</div>
      <div style="font-size:10px;color:#555;">Informe interno. No es tributario ni tiene relación con la DIAN.</div>
    </div>
    <table style="width:100%;font-size:13px;margin-top:16px;">
      <tr><td style="padding:4px;">Ventas del mes</td><td style="text-align:right;font-weight:bold;">${fmtMoney(d.totalVentas)}</td></tr>
      <tr><td style="padding:4px;color:#555;">· Efectivo</td><td style="text-align:right;color:#555;">${fmtMoney(d.metodos.efectivo)}</td></tr>
      <tr><td style="padding:4px;color:#555;">· Banco</td><td style="text-align:right;color:#555;">${fmtMoney(d.metodos.banco)}</td></tr>
      <tr><td style="padding:4px;color:#555;">· Tarjeta</td><td style="text-align:right;color:#555;">${fmtMoney(d.metodos.tarjeta)}</td></tr>
      <tr><td style="padding:4px;">Gastos de caja</td><td style="text-align:right;">-${fmtMoney(d.gastosCaja)}</td></tr>
      <tr><td style="padding:4px;">Gastos del negocio</td><td style="text-align:right;">-${fmtMoney(d.totalGastos)}</td></tr>
      <tr style="border-top:2px solid #000;"><td style="padding:7px 4px;font-weight:bold;font-size:15px;">UTILIDAD</td><td style="text-align:right;font-weight:bold;font-size:15px;">${fmtMoney(d.utilidad)}</td></tr>
    </table>
    ${d.conceptos.length?`<h3 style="font-size:14px;margin-top:18px;border-bottom:1px solid #999;">Egresos por concepto</h3>
    <table style="width:100%;font-size:12px;border-collapse:collapse;">
      ${d.conceptos.map(c=>`<tr style="border-bottom:1px solid #eee;"><td style="padding:5px;">${escapeHtml(c[0])}</td><td style="padding:5px;text-align:right;">${fmtMoney(c[1])}</td></tr>`).join('')}
    </table>`:''}
    <div style="margin-top:24px;text-align:center;font-size:10px;color:#666;border-top:1px dashed #999;padding-top:8px;">
      Generado el ${new Date().toLocaleString('es-CO')} · WALLACE COMPANY SYSTEM
    </div></div>`;
  const w=window.open('','_blank','width=850,height=680');
  if(!w){ toast('Permite las ventanas emergentes','error'); return; }
  w.document.write('<html><head><title>Contable</title><meta charset="utf-8"><style>@page{size:letter;margin:12mm;}body{margin:0;}</style></head><body>'+html+'</body></html>');
  w.document.close(); setTimeout(()=>w.print(),400);
}

// ============================================================
//  CONFIGURACIÓN DEL NEGOCIO (super-admin)
// ============================================================
function configNegocio(id){ window._logoNuevo=undefined; STATE.page='config:'+id; render(); }
function usuariosNegocio(id){ STATE.page='usuarios:'+id; render(); }

function pantallaConfig(negId){
  const neg=(DB.get('negocios')||[]).find(n=>n.id===negId);
  if(!neg) return '<div class="tarjeta">Negocio no encontrado</div>';
  const F=neg.funciones||[];
  const todas=[['ventas','Nueva Venta'],['catalogo','Inventario'],['caja','Caja'],['facturas','Facturas'],
    ['clientes','Clientes'],['cocina','Cocina'],['citas','Agendar'],['domicilios','Domicilios'],
    ['inventario','Control de stock'],['reportes','Reportes'],['contable','Contable'],['gastosneg','Gastos del negocio']];
  const entregas=[['mesa','Mesa'],['llevar','Para llevar'],['domicilio','Domicilio'],['envio','Envío nacional']];
  return `
  <div class="topbar">
    <h1>${ic('cog')} Configurar: ${escapeHtml(neg.nombre)}</h1>
    <div class="tb-der"><button class="btn btn-ghost btn-sm" onclick="STATE.page='';render()">← Volver</button></div>
  </div>
  <div class="contenido">
    <div class="tarjeta">
      <span class="t-tit">Datos del negocio</span>
      <div class="form2">
        <div class="m-row"><label>Nombre</label><input id="c-nombre" class="campo" value="${escapeHtml(neg.nombre)}"></div>
        <div class="m-row"><label>Tipo</label><select id="c-tipo" class="campo">${Object.keys(PERFILES).map(t=>`<option ${neg.tipo===t?'selected':''}>${t}</option>`).join('')}</select></div>
        <div class="m-row"><label>NIT</label><input id="c-nit" class="campo" value="${escapeHtml(neg.nit||'')}"></div>
        <div class="m-row"><label>Teléfono</label><input id="c-tel" class="campo" value="${escapeHtml(neg.tel||'')}"></div>
        <div class="m-row"><label>Dirección</label><input id="c-dir" class="campo" value="${escapeHtml(neg.dir||'')}"></div>
        <div class="m-row"><label>Ciudad</label><input id="c-ciudad" class="campo" value="${escapeHtml(neg.ciudad||'')}"></div>
        <div class="m-row"><label>Eslogan (opcional)</label><input id="c-eslogan" class="campo" value="${escapeHtml(neg.eslogan||'')}" placeholder="Ej: Accesorios con estilo"></div>
        <div class="m-row"><label>Plan</label><select id="c-plan" class="campo">${['Básico','Profesional','Premium'].map(p=>`<option ${neg.plan===p?'selected':''}>${p}</option>`).join('')}</select></div>
        <div class="m-row"><label>Precio mensual</label><input id="c-precio" type="number" class="campo" value="${neg.precioMes||0}"></div>
      </div>
      <p class="nota">Estos datos salen en el encabezado de todas las facturas del negocio.</p>
    </div>
    <div class="tarjeta">
      <span class="t-tit">${ic('box')} Logo del negocio</span>
      <p class="gris">Aparece en el menú lateral del sistema y en todas las facturas.</p>
      <div class="logo-zona">
        <div class="logo-vista" id="logo-vista">
          ${neg.logo?`<img src="${neg.logo}" alt="logo">`:`<div class="logo-vacio">Sin logo</div>`}
        </div>
        <div class="logo-acc">
          <input type="file" id="n-logo" accept="image/*" onchange="cargarLogo(this)" style="display:none;">
          <button class="btn btn-gold" onclick="document.getElementById('n-logo').click()">Subir logo</button>
          ${neg.logo?`<button class="btn btn-rojo btn-sm" onclick="quitarLogo()">Quitar</button>`:''}
          <p class="nota">La imagen se reduce sola para no pesar.</p>
        </div>
      </div>
    </div>
    <div class="tarjeta">
      <span class="t-tit">¿Cómo cobra este negocio?</span>
      <p class="gris">Define si se toma el pedido y se cobra después, o si se cobra de una vez.</p>
      <select id="c-flujo" class="campo" style="max-width:420px;">
        <option value="directo" ${neg.flujoPedido!=='dos_pasos'?'selected':''}>Cobro directo — se cobra al instante (tiendas)</option>
        <option value="dos_pasos" ${neg.flujoPedido==='dos_pasos'?'selected':''}>Confirmar y luego cobrar (restaurantes)</option>
      </select>
    </div>
    <div class="tarjeta">
      <span class="t-tit">Vocabulario</span>
      <div class="form2">
        <div class="m-row"><label>Singular</label><input id="c-pal1" class="campo" value="${escapeHtml(neg.palabraProducto||'Producto')}"></div>
        <div class="m-row"><label>Plural</label><input id="c-pal2" class="campo" value="${escapeHtml(neg.palabraProductos||'Productos')}"></div>
      </div>
    </div>
    <div class="tarjeta">
      <span class="t-tit">Tipos de entrega</span>
      <div class="checks">${entregas.map(e=>`<label class="chk"><input type="checkbox" class="c-ent" value="${e[0]}" ${(neg.tiposEntrega||[]).indexOf(e[0])>-1?'checked':''}> ${e[1]}</label>`).join('')}</div>
    </div>
    <div class="tarjeta">
      <span class="t-tit">Pantallas habilitadas</span>
      <div class="checks">${todas.map(f=>`<label class="chk"><input type="checkbox" class="c-fun" value="${f[0]}" ${F.indexOf(f[0])>-1?'checked':''}> ${f[1]}</label>`).join('')}</div>
    </div>
    <div class="tarjeta">
      <span class="t-tit">Opciones</span>
      <div class="checks">
        <label class="chk"><input type="checkbox" id="c-mesas" ${neg.usaMesas?'checked':''}> Usa mesas</label>
        <label class="chk"><input type="checkbox" id="c-cocina" ${neg.usaCocina?'checked':''}> Usa cocina (KDS y propinas)</label>
        <label class="chk"><input type="checkbox" id="c-recetas" ${neg.usaRecetas?'checked':''}> Usa recetas (descuenta insumos)</label>
        <label class="chk"><input type="checkbox" id="c-citas" ${neg.usaCitas?'checked':''}> Usa agenda</label>
        <label class="chk"><input type="checkbox" id="c-sonidos" ${neg.sonidos!==false?'checked':''}> Sonidos</label>
        <label class="chk"><input type="checkbox" id="c-alerta" ${neg.alertaStock!==false?'checked':''}> Avisar stock bajo</label>
      </div>
      <div class="form2" style="margin-top:14px;">
        <div class="m-row"><label>Apariencia del sistema</label><select id="c-tema" class="campo">
          <option value="oscuro" ${neg.tema!=='claro'?'selected':''}>Oscuro neón</option>
          <option value="claro" ${neg.tema==='claro'?'selected':''}>Claro / fondo blanco</option>
        </select></div>
        <div class="m-row"><label>Color principal</label>
          <input id="c-color" type="color" class="campo" style="height:46px;padding:5px;cursor:pointer;" value="${/^#[0-9a-fA-F]{6}$/.test(neg.colorTema||'')?neg.colorTema:'#01c38e'}"></div>
        <div class="m-row"><label>Tamaño de factura</label><select id="c-fact" class="campo">
          <option value="pos" ${neg.tipoFactura==='pos'?'selected':''}>Tirilla POS (80mm)</option>
          <option value="media" ${neg.tipoFactura==='media'?'selected':''}>Media hoja</option>
          <option value="carta" ${neg.tipoFactura==='carta'?'selected':''}>Hoja completa</option>
        </select></div>
        <div class="m-row"><label>Recargo del datáfono (%)</label><input id="c-pct" type="number" step="0.1" class="campo" value="${neg.pctDatafono||0}"></div>
      </div>
    </div>
    <div class="tarjeta">
      <span class="t-tit">Sucursales</span>
      <p class="gris">Cada sucursal maneja su <strong>caja, pedidos y cierres</strong> por separado. El inventario, clientes, gastos y contabilidad se comparten.</p>
      ${(neg.sucursales||[]).length?(neg.sucursales||[]).map((s,i)=>`<div class="suc-fila">
        <input type="text" class="campo c-suc" value="${escapeHtml(s.nombre)}" placeholder="Nombre">
        <button class="btn btn-sm btn-rojo" onclick="quitarSucursal('${negId}',${i})">×</button>
      </div>`).join(''):'<p class="gris chico">Sin sucursales: funciona como un solo punto de venta.</p>'}
      <button class="btn btn-sm" onclick="agregarSucursal('${negId}')">+ Agregar sucursal</button>
    </div>
    <div class="tarjeta">
      <button class="btn btn-gold btn-block btn-grande" onclick="guardarConfig('${negId}')">Guardar configuración</button>
    </div>
  </div>`;
}
function guardarConfig(negId){
  const negocios=JSON.parse(JSON.stringify(DB.get('negocios')||[]));
  const i=negocios.findIndex(n=>n.id===negId);
  if(i<0){ toast('Negocio no encontrado','error'); return; }
  const n=negocios[i];
  const val=id=>{ const e=document.getElementById(id); return e?e.value:''; };
  const chk=id=>{ const e=document.getElementById(id); return e?e.checked:false; };
  n.nombre=val('c-nombre').trim()||n.nombre;
  n.tipo=val('c-tipo'); n.nit=val('c-nit').trim(); n.tel=val('c-tel').trim();
  n.dir=val('c-dir').trim(); n.ciudad=val('c-ciudad').trim();
  n.eslogan=val('c-eslogan').trim();
  if(window._logoNuevo!==undefined){ n.logo=window._logoNuevo; window._logoNuevo=undefined; }
  n.plan=val('c-plan'); n.precioMes=parseInt(val('c-precio'))||0;
  n.flujoPedido=val('c-flujo');
  n.palabraProducto=val('c-pal1').trim()||'Producto';
  n.palabraProductos=val('c-pal2').trim()||'Productos';
  n.usaMesas=chk('c-mesas'); n.usaCocina=chk('c-cocina');
  n.usaRecetas=chk('c-recetas'); n.usaCitas=chk('c-citas');
  n.sonidos=chk('c-sonidos'); n.alertaStock=chk('c-alerta');
  n.tipoFactura=val('c-fact'); n.pctDatafono=parseFloat(val('c-pct'))||0;
  n.tema=val('c-tema')||'oscuro';
  const _colc=val('c-color');
  n.colorTema=/^#[0-9a-fA-F]{6}$/.test(_colc)?_colc:'#01c38e';
  n.tiposEntrega=Array.prototype.slice.call(document.querySelectorAll('.c-ent:checked')).map(c=>c.value);
  if(!n.tiposEntrega.length) n.tiposEntrega=['llevar'];
  n.funciones=Array.prototype.slice.call(document.querySelectorAll('.c-fun:checked')).map(c=>c.value);
  const sucs=Array.prototype.slice.call(document.querySelectorAll('.c-suc'));
  if(sucs.length && n.sucursales){
    sucs.forEach((inp,x)=>{ if(n.sucursales[x]) n.sucursales[x].nombre=inp.value.trim()||n.sucursales[x].nombre; });
  }
  negocios[i]=n;
  DB.set('negocios',negocios);
  if(STATE.negocio && STATE.negocio.id===negId) STATE.negocio=JSON.parse(JSON.stringify(n));
  toast('Configuración guardada','success');
  STATE.page=''; render();
}
function agregarSucursal(negId){
  abrirModal({titulo:'Nueva sucursal', textoBoton:'Agregar', campos:[
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
    cerrarModal(); toast('Sucursal agregada','success'); render();
  }});
}
function quitarSucursal(negId,idx){
  const negocios=JSON.parse(JSON.stringify(DB.get('negocios')||[]));
  const i=negocios.findIndex(n=>n.id===negId); if(i<0) return;
  const s=(negocios[i].sucursales||[])[idx]; if(!s) return;
  confirmarModal('¿Quitar la sucursal "'+s.nombre+'"?',()=>{
    negocios[i].sucursales.splice(idx,1);
    if(negocios[i].sucursales.length<=1) negocios[i].sucursales=[];
    DB.set('negocios',negocios);
    toast('Sucursal quitada','info'); render();
  },'Quitar');
}

// ---------- Usuarios del negocio ----------
function pantallaUsuarios(negId){
  const neg=(DB.get('negocios')||[]).find(n=>n.id===negId);
  if(!neg) return '<div class="tarjeta">Negocio no encontrado</div>';
  const us=(DB.get('usuarios')||[]).filter(u=>u.negocioId===negId);
  return `
  <div class="topbar">
    <h1>${ic('users')} Usuarios de ${escapeHtml(neg.nombre)}</h1>
    <div class="tb-der"><button class="btn btn-ghost btn-sm" onclick="STATE.page='';render()">← Volver</button></div>
  </div>
  <div class="contenido">
    <div class="tarjeta">
      <div class="t-cab">
        <span class="t-tit">Empleados</span>
        <button class="btn btn-gold" onclick="editarUsuario('${negId}',null)">+ Crear usuario</button>
      </div>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Nombre</th><th>Usuario</th><th>Contraseña</th><th>Rol</th><th>Sucursales</th><th>Estado</th><th></th></tr></thead>
        <tbody>${us.length?us.map(u=>`<tr>
          <td><strong>${escapeHtml(u.nombre)}</strong></td>
          <td>${escapeHtml(u.usuario)}</td>
          <td class="gris">${escapeHtml(u.pass)}</td>
          <td>${escapeHtml((ROLES.find(r=>r[0]===u.rol)||['',u.rol])[1])}</td>
          <td class="gris chico">${(u.sucursales&&u.sucursales.length)?u.sucursales.length+' asignada(s)':'todas'}</td>
          <td>${u.activo!==false?'<span class="pill pill-verde">Activo</span>':'<span class="pill pill-rojo">Inactivo</span>'}</td>
          <td class="acciones">
            <button class="btn btn-sm" onclick="editarUsuario('${negId}','${u.id}')">Editar</button>
            <button class="btn btn-sm btn-rojo" onclick="eliminarUsuario('${u.id}')">×</button>
          </td>
        </tr>`).join(''):'<tr><td colspan="7" class="gris">Sin usuarios. Crea el primero.</td></tr>'}</tbody>
      </table></div>
    </div>
  </div>`;
}
function editarUsuario(negId,userId){
  const neg=(DB.get('negocios')||[]).find(n=>n.id===negId);
  const u=userId?(DB.get('usuarios')||[]).find(x=>x.id===userId):null;
  const sugerido = u?u.usuario:(neg.nombre||'').toLowerCase().replace(/[^a-z0-9]/g,'').substring(0,8);
  // Pantallas y permisos actuales del usuario (o los del rol por defecto)
  const pantActuales = (u&&u.pantallas&&u.pantallas.length)?u.pantallas:(PANTALLAS_POR_ROL[(u?u.rol:'cajero')]||[]);
  const permActuales = (u&&u.permisos&&u.permisos.length)?u.permisos:(PERMISOS_POR_ROL[(u?u.rol:'cajero')]||[]);
  const TODAS_PANTALLAS=[['inicio','Dashboard'],['ventas','Nueva Venta'],['pedidos','Pedidos'],
    ['catalogo','Menú / Inventario'],['caja','Caja'],['cocina','Cocina'],['citas','Agendar'],
    ['domicilios','Domicilios'],['clientes','Clientes'],['reimpresiones','Reimpresiones'],
    ['tiempos','Tiempos de Entrega'],['reportes','Reportes'],['historial','Historial'],
    ['contable','Contable'],['gastosneg','Gastos'],['auditoria','Auditoría'],
    ['usuarios','Usuarios'],['config','Configuración']];
  const sucHTML=(neg.sucursales&&neg.sucursales.length>1)?`<div class="m-row">
      <label>Sucursales a las que puede entrar (vacío = todas)</label>
      <div class="checks">${neg.sucursales.map(s=>`<label class="chk"><input type="checkbox" class="u-suc" value="${escapeHtml(s.id)}" ${(u&&u.sucursales&&u.sucursales.indexOf(s.id)>-1)?'checked':''}> 📍 ${escapeHtml(s.nombre)}</label>`).join('')}</div>
    </div>`:'';
  const permisosHTML=`
    <div class="cobro-caja" style="margin-top:14px;">
      <strong>Ventanas que puede ver <span class="gris chico">(según lo que necesite)</span></strong>
      <div class="checks" style="margin-top:8px;">${TODAS_PANTALLAS.map(p=>`<label class="chk"><input type="checkbox" class="u-pant" value="${p[0]}" ${pantActuales.indexOf(p[0])>-1?'checked':''}> ${escapeHtml(p[1])}</label>`).join('')}</div>
    </div>
    <div class="cobro-caja" style="margin-top:12px;">
      <strong>Acciones que puede hacer</strong>
      <div class="checks" style="margin-top:8px;">${ACCIONES.map(a=>`<label class="chk"><input type="checkbox" class="u-perm" value="${a[0]}" ${permActuales.indexOf(a[0])>-1?'checked':''}> ${escapeHtml(a[1])}</label>`).join('')}</div>
      <p class="nota" style="margin-top:8px;">Si el rol es <strong>Administrador</strong>, puede hacer todo sin importar estas casillas.</p>
    </div>`;
  abrirModal({titulo:(u?'Editar':'Crear')+' usuario', textoBoton:'Guardar', campos:[
    {id:'nombre', label:'Nombre completo', valor:u?u.nombre:'', requerido:true},
    {id:'usuario', label:'Usuario para entrar', valor:sugerido, requerido:true},
    {id:'pass', label:'Contraseña', valor:u?u.pass:'123456', requerido:true},
    {id:'rol', label:'Rol (define permisos por defecto)', tipo:'select', valor:u?u.rol:'cajero',
      opciones:ROLES.map(r=>({valor:r[0],label:r[1]}))}
  ], extraHTML: sucHTML + permisosHTML,
  onGuardar:(d)=>{
    const existe=(DB.get('usuarios')||[]).find(x=>x.usuario===d.usuario && (!u||x.id!==u.id))
              || (DB.get('superadmins')||[]).some(s=>s.usuario===d.usuario);
    if(existe){ toast('Ese usuario ya existe','error'); return; }
    const sucs=Array.prototype.slice.call(document.querySelectorAll('.u-suc:checked')).map(c=>c.value);
    const pants=Array.prototype.slice.call(document.querySelectorAll('.u-pant:checked')).map(c=>c.value);
    const perms=Array.prototype.slice.call(document.querySelectorAll('.u-perm:checked')).map(c=>c.value);
    const usuarios=DB.get('usuarios')||[];
    if(u){
      const x=usuarios.find(y=>y.id===userId);
      if(x) Object.assign(x,{nombre:d.nombre,usuario:d.usuario,pass:d.pass,rol:d.rol,sucursales:sucs,pantallas:pants,permisos:perms});
    } else {
      usuarios.push({id:uid(), negocioId:negId, nombre:d.nombre, usuario:d.usuario,
        pass:d.pass, rol:d.rol, sucursales:sucs, pantallas:pants, permisos:perms, activo:true, creado:now()});
    }
    DB.set('usuarios',usuarios);
    cerrarModal(); toast('Usuario guardado','success'); render();
  }});
}
function eliminarUsuario(id){
  confirmarModal('¿Eliminar este usuario?',()=>{
    DB.set('usuarios',(DB.get('usuarios')||[]).filter(u=>u.id!==id));
    toast('Eliminado','info'); render();
  },'Eliminar');
}

// ============================================================
//  NAVEGACIÓN Y RENDER
// ============================================================
function irA(pg){
  if(pg!=='ventas') ESCRIBIENDO=false;
  STATE.pageNeg=pg;
  render();
  const sb=document.getElementById('sidebar'); if(sb) sb.classList.remove('abierto');
}
function armarMenu(){
  const neg=STATE.negocio, u=STATE.user;
  const F=neg.funciones||[];
  const items=[];
  items.push({g:'PRINCIPAL'});
  items.push({id:'inicio', ic:'dashboard', txt:'Dashboard'});
  if(F.indexOf('ventas')>-1) items.push({id:'ventas', ic:'cart', txt:'Nueva Venta'});
  items.push({id:'pedidos', ic:'report', txt:'Pedidos'});
  if(F.indexOf('catalogo')>-1){
    if(neg.usaRecetas){
      // Restaurante: el menú de platos y el inventario de insumos son cosas distintas
      items.push({id:'inventario', ic:'chef', txt:'Menú'});
      items.push({id:'insumos', ic:'box', txt:'Insumos'});
    } else {
      items.push({id:'inventario', ic:'box', txt:'Inventario'});
    }
  }
  const ops=[];
  if(F.indexOf('caja')>-1) ops.push({id:'caja', ic:'cash', txt:'Caja'});
  if(F.indexOf('cocina')>-1 && neg.usaCocina) ops.push({id:'cocina', ic:'chef', txt:'Cocina'});
  if(F.indexOf('cocina')>-1 && neg.usaCocina) ops.push({id:'tiempos', ic:'history', txt:'Tiempos de Entrega'});
  if(F.indexOf('citas')>-1 && neg.usaCitas) ops.push({id:'citas', ic:'calendar', txt:'Agendar'});
  if(F.indexOf('domicilios')>-1) ops.push({id:'domicilios', ic:'truck', txt:'Domicilios'});
  if(F.indexOf('clientes')>-1) ops.push({id:'clientes', ic:'users', txt:'Clientes'});
  if((F.indexOf('pedidos')>-1||F.indexOf('ventas')>-1)) ops.push({id:'reimpresiones', ic:'history', txt:'Reimpresiones'});
  if(ops.length){ items.push({g:'OPERACIONES'}); ops.forEach(o=>items.push(o)); }
  const ges=[];
  if(F.indexOf('reportes')>-1) ges.push({id:'reportes', ic:'report', txt:'Reportes'});
  if((F.indexOf('pedidos')>-1||F.indexOf('ventas')>-1)) ges.push({id:'historial', ic:'history', txt:'Historial'});
  if(F.indexOf('contable')>-1) ges.push({id:'contable', ic:'report', txt:'Registro Contable'});
  if(F.indexOf('gastosneg')>-1) ges.push({id:'gastosneg', ic:'cash', txt:'Gastos del Negocio'});
  if(u.rol==='admin'||u.esSupervisor) ges.push({id:'auditoria', ic:'history', txt:'Auditoría'});
  if(ges.length){ items.push({g:'GESTIÓN'}); ges.forEach(g=>items.push(g)); }
  if(u.rol==='admin' || u.esSupervisor){
    items.push({g:'CONFIGURACIÓN'});
    items.push({id:'minegocio', ic:'building', txt:'Mi Negocio'});
  }
  // Filtrar por rol
  if(u.esSupervisor || u.rol==='admin') return items;
  const permitidas = (u.pantallas && u.pantallas.length) ? u.pantallas : (PANTALLAS_POR_ROL[u.rol]||PANTALLAS_POR_ROL.cajero);
  const salida=[]; let grupo=null;
  items.forEach(it=>{
    if(it.g){ grupo=it; return; }
    let id = (it.id==='inventario'||it.id==='insumos')?'catalogo':it.id;
    if(it.id==='tiempos') id='cocina';
    if(it.id==='historial') id='pedidos';
    if(it.id==='reimpresiones') id='pedidos';
    if(it.id==='auditoria') id='__solo_admin__';   // ya se filtró arriba por rol
    if(permitidas.indexOf(it.id)>-1 || permitidas.indexOf(id)>-1){
      if(grupo){ salida.push(grupo); grupo=null; }
      salida.push(it);
    }
  });
  return salida;
}
// ============================================================
//  MI NEGOCIO (lo edita el propio administrador)
// ============================================================
function minegocio(){
  ESCRIBIENDO=false;
  const neg=STATE.negocio;
  return `
    <div class="tarjeta">
      <span class="t-tit">${ic('building')} Datos de tu negocio</span>
      <p class="gris">Esta información sale en las facturas que entregas a tus clientes.</p>
      <div class="form2" style="margin-top:14px;">
        <div class="m-row"><label>Nombre del negocio</label><input id="n-nombre" class="campo" value="${escapeHtml(neg.nombre||'')}"></div>
        <div class="m-row"><label>NIT / Cédula</label><input id="n-nit" class="campo" value="${escapeHtml(neg.nit||'')}" placeholder="Ej: 900123456-7"></div>
        <div class="m-row"><label>Teléfono</label><input id="n-tel" class="campo" value="${escapeHtml(neg.tel||'')}" placeholder="Ej: 3125214210"></div>
        <div class="m-row"><label>Dirección</label><input id="n-dir" class="campo" value="${escapeHtml(neg.dir||'')}" placeholder="Ej: Calle 45 #23-11"></div>
        <div class="m-row"><label>Ciudad</label><input id="n-ciudad" class="campo" value="${escapeHtml(neg.ciudad||'')}"></div>
        <div class="m-row"><label>Eslogan (opcional)</label><input id="n-eslogan" class="campo" value="${escapeHtml(neg.eslogan||'')}" placeholder="Ej: Accesorios con estilo"></div>
      </div>
    </div>
    <div class="tarjeta">
      <span class="t-tit">${ic('box')} Logo del negocio</span>
      <p class="gris">Aparece en el menú lateral y en todas las facturas. Usa una imagen cuadrada.</p>
      <div class="logo-zona">
        <div class="logo-vista" id="logo-vista">
          ${neg.logo?`<img src="${neg.logo}" alt="logo">`:`<div class="logo-vacio">Sin logo</div>`}
        </div>
        <div class="logo-acc">
          <input type="file" id="n-logo" accept="image/*" onchange="cargarLogo(this)" style="display:none;">
          <button class="btn btn-gold" onclick="document.getElementById('n-logo').click()">Subir logo</button>
          ${neg.logo?`<button class="btn btn-rojo btn-sm" onclick="quitarLogo()">Quitar</button>`:''}
          <p class="nota">La imagen se reduce sola para no pesar.</p>
        </div>
      </div>
    </div>
    <div class="tarjeta">
      <span class="t-tit">${ic('cog')} Preferencias</span>
      <div class="form2">
        <div class="m-row"><label>Apariencia del sistema</label>
          <select id="n-tema" class="campo">
            <option value="oscuro" ${neg.tema!=='claro'?'selected':''}>Oscuro neón</option>
            <option value="claro" ${neg.tema==='claro'?'selected':''}>Claro / fondo blanco</option>
          </select></div>
        <div class="m-row"><label>Color principal</label>
          <input id="n-color" type="color" class="campo" style="height:46px;padding:5px;cursor:pointer;" value="${/^#[0-9a-fA-F]{6}$/.test(neg.colorTema||'')?neg.colorTema:'#01c38e'}">
          <p class="nota">Pinta botones, menú y detalles en todos los equipos. El verde original es #01c38e.</p></div>
        <div class="m-row"><label>Tamaño de la factura</label>
          <select id="n-fact" class="campo">
            <option value="pos" ${neg.tipoFactura==='pos'?'selected':''}>Tirilla POS (80mm)</option>
            <option value="media" ${neg.tipoFactura==='media'?'selected':''}>Media hoja</option>
            <option value="carta" ${neg.tipoFactura==='carta'?'selected':''}>Hoja completa</option>
          </select></div>
        <div class="m-row"><label>Recargo del datáfono (%)</label>
          <input id="n-pct" type="number" step="0.1" class="campo" value="${neg.pctDatafono||0}" placeholder="Ej: 4"></div>
      </div>
      <div class="checks">
        <label class="chk"><input type="checkbox" id="n-sonidos" ${neg.sonidos!==false?'checked':''}> Sonidos al vender</label>
        <label class="chk"><input type="checkbox" id="n-alerta" ${neg.alertaStock!==false?'checked':''}> Avisar cuando se agote un producto</label>
      </div>
      <button class="btn btn-ghost btn-sm" style="margin-top:12px;" onclick="sonidoVenta()">🔊 Probar sonido</button>
    </div>
    <div class="tarjeta">
      <button class="btn btn-gold btn-block btn-grande" onclick="guardarMiNegocio()">Guardar cambios</button>
      <p class="nota centrado" style="margin-top:10px;">Los cambios se ven en todos los equipos al instante.</p>
    </div>`;
}
function cargarLogo(input){
  const f=input.files && input.files[0];
  if(!f) return;
  if(f.size>5*1024*1024){ toast('La imagen es muy pesada (máx 5MB)','error'); return; }
  const lector=new FileReader();
  lector.onload=e=>{
    const img=new Image();
    img.onload=()=>{
      // Reducir a 300px de ancho máximo para que no pese
      const max=300;
      let w=img.width, h=img.height;
      if(w>max){ h=Math.round(h*max/w); w=max; }
      const lienzo=document.createElement('canvas');
      lienzo.width=w; lienzo.height=h;
      lienzo.getContext('2d').drawImage(img,0,0,w,h);
      const dataUrl=lienzo.toDataURL('image/png');
      const vista=document.getElementById('logo-vista');
      if(vista) vista.innerHTML='<img src="'+dataUrl+'" alt="logo">';
      window._logoNuevo=dataUrl;
      toast('Logo listo. Dale a Guardar cambios.','info');
    };
    img.src=e.target.result;
  };
  lector.readAsDataURL(f);
}
function quitarLogo(){
  window._logoNuevo='';
  const vista=document.getElementById('logo-vista');
  if(vista) vista.innerHTML='<div class="logo-vacio">Sin logo</div>';
  toast('Logo quitado. Dale a Guardar cambios.','info');
}
function guardarMiNegocio(){
  const val=id=>{ const e=document.getElementById(id); return e?e.value:''; };
  const chk=id=>{ const e=document.getElementById(id); return e?e.checked:false; };
  const negocios=JSON.parse(JSON.stringify(DB.get('negocios')||[]));
  const i=negocios.findIndex(n=>n.id===STATE.negocio.id);
  if(i<0){ toast('No se encontró el negocio','error'); return; }
  const n=negocios[i];
  n.nombre=val('n-nombre').trim()||n.nombre;
  n.nit=val('n-nit').trim();
  n.tel=val('n-tel').trim();
  n.dir=val('n-dir').trim();
  n.ciudad=val('n-ciudad').trim();
  n.eslogan=val('n-eslogan').trim();
  n.tipoFactura=val('n-fact');
  n.tema=val('n-tema')||'oscuro';
  const _col=val('n-color');
  n.colorTema=/^#[0-9a-fA-F]{6}$/.test(_col)?_col:'#01c38e';
  n.pctDatafono=parseFloat(val('n-pct'))||0;
  n.sonidos=chk('n-sonidos');
  n.alertaStock=chk('n-alerta');
  if(window._logoNuevo!==undefined){ n.logo=window._logoNuevo; window._logoNuevo=undefined; }
  negocios[i]=n;
  DB.set('negocios',negocios);
  STATE.negocio=JSON.parse(JSON.stringify(n));
  toast('Datos guardados','success');
  render();
}

// ============================================================
//  AGENDAR (citas, turnos, entregas)
// ============================================================
function citas(){
  ESCRIBIENDO=false;
  const neg=STATE.negocio;
  const lista=misDatos('citas').slice().sort((a,b)=>new Date(a.fechaHora)-new Date(b.fechaHora));
  const hoy=today();
  const deHoy=lista.filter(c=>(c.fechaHora||'').startsWith(hoy));
  const pendientes=lista.filter(c=>c.estado==='pendiente');
  return `
    <div class="stats">
      <div class="stat verde"><div class="stat-lbl">Agendado hoy</div><div class="stat-val">${deHoy.length}</div><div class="stat-sub">para el día de hoy</div></div>
      <div class="stat gold"><div class="stat-lbl">Pendientes</div><div class="stat-val">${pendientes.length}</div><div class="stat-sub">sin atender</div></div>
      <div class="stat azul"><div class="stat-lbl">Total agendado</div><div class="stat-val">${lista.length}</div><div class="stat-sub">en el sistema</div></div>
    </div>
    <div class="tarjeta">
      <div class="t-cab">
        <span class="t-tit">${ic('calendar')} Agendar</span>
        <button class="btn btn-gold" onclick="nuevaCita()">+ Nuevo agendamiento</button>
      </div>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Fecha y hora</th><th>Cliente</th><th>Detalle</th><th>Encargado</th><th>Estado</th><th>Acciones</th></tr></thead>
        <tbody>
        ${lista.length? lista.map(c=>`<tr>
          <td>${fmtDate(c.fechaHora)}</td>
          <td><strong>${escapeHtml(c.cliente||'—')}</strong>${c.tel?`<br><span class="gris chico">${escapeHtml(c.tel)}</span>`:''}</td>
          <td>${escapeHtml(c.detalle||'—')}</td>
          <td>${escapeHtml(c.encargado||'—')}</td>
          <td>${c.estado==='atendida'?'<span class="pill pill-verde">Atendida</span>'
              :c.estado==='cancelada'?'<span class="pill pill-rojo">Cancelada</span>'
              :'<span class="pill pill-gold">Pendiente</span>'}</td>
          <td class="acciones">
            ${c.estado==='pendiente'?`
              <button class="btn btn-sm btn-verde" onclick="marcarCita('${c.id}','atendida')" title="Marcar atendida">✓</button>
              <button class="btn btn-sm btn-rojo" onclick="marcarCita('${c.id}','cancelada')" title="Cancelar">✕</button>`:''}
            <button class="btn btn-sm" onclick="eliminarCita('${c.id}')" title="Eliminar">🗑</button>
          </td>
        </tr>`).join('') : '<tr><td colspan="6" class="gris">Nada agendado todavía.</td></tr>'}
        </tbody>
      </table></div>
    </div>`;
}
function nuevaCita(){
  const neg=STATE.negocio;
  const esServicio=(neg.palabraProducto||'')==='Servicio';
  abrirModal({titulo:'Nuevo agendamiento', textoBoton:'Agendar', campos:[
    {id:'cliente', label:'Cliente', requerido:true},
    {id:'tel', label:'Teléfono (opcional)'},
    {id:'fecha', label:'Fecha', tipo:'date', valor:today()},
    {id:'hora', label:'Hora', tipo:'time', valor:'10:00'},
    {id:'detalle', label:esServicio?'Servicio':'Detalle (qué se agenda)',
      valor:esServicio?'Corte':'',
      placeholder:esServicio?'Corte, tinte, manicure...':'Ej: 2 collares chicle, entrega de pedido...'},
    {id:'encargado', label:'Encargado (opcional)'}
  ], onGuardar:(d)=>{
    const arr=misDatos('citas');
    arr.push({id:uid(), cliente:d.cliente, tel:d.tel,
      fechaHora:d.fecha+'T'+(d.hora||'10:00')+':00',
      detalle:d.detalle, encargado:d.encargado,
      estado:'pendiente', creado:now(), por:STATE.user.nombre});
    guardarMisDatos('citas',arr);
    cerrarModal(); toast('Agendado','success'); render();
  }});
}
function marcarCita(id,estado){
  const arr=misDatos('citas');
  const c=arr.find(x=>x.id===id); if(!c) return;
  c.estado=estado;
  c.cerrada=now();
  guardarMisDatos('citas',arr);
  toast(estado==='atendida'?'Marcado como atendido':'Cancelado','info');
  render();
}
function eliminarCita(id){
  confirmarModal('¿Eliminar este agendamiento?',()=>{
    eliminarMisDatos('citas',id); toast('Eliminado','info'); render();
  },'Eliminar');
}

// ============================================================
//  COCINA (pantalla para preparar los pedidos)
// ============================================================
let _ultimoCountCocina=-1;
function cocina(){
  ESCRIBIENDO=false;
  const vs=ventasJornada(false).filter(v=>v.estado!=='anulada' && v.estadoCocina
      && v.estadoCocina!=='entregado')
    .sort((a,b)=>new Date(a.fecha||0)-new Date(b.fecha||0));
  // Sonar cuando entra un pedido nuevo (más pendientes que antes)
  const nPend=vs.filter(v=>v.estadoCocina==='pendiente'||v.estadoCocina==='preparando').length;
  if(_ultimoCountCocina>=0 && nPend>_ultimoCountCocina){ try{ sonidoPedido(); }catch(e){} }
  _ultimoCountCocina=nPend;
  const enPrep=vs.filter(v=>v.estadoCocina==='pendiente'||v.estadoCocina==='preparando');
  const listos=vs.filter(v=>v.estadoCocina==='listo');
  const etiq={mesa:'Mesa',llevar:'Para llevar',domicilio:'Domicilio',envio:'Envío'};
  const usaComanda=(STATE.negocio||{}).usaCocina;

  const tarjeta=(v)=>{
    const min=Math.floor((Date.now()-new Date(v.fecha||Date.now()).getTime())/60000);
    const cls=min<15?'krono-verde':min<25?'krono-amar':'krono-rojo';
    const prep=v.estadoCocina==='preparando';
    return `<div class="kds-card ${cls}">
      <div class="kds-top">
        <span class="kds-ref">${escapeHtml(v.factura||'')}</span>
        <span class="kds-krono">${min} min</span>
      </div>
      <div class="kds-tipo">${etiq[v.tipo]||''}${v.mesa?' · '+escapeHtml(v.mesa):''}${v.cliNombre?' · '+escapeHtml(v.cliNombre):''}</div>
      ${v.tipo==='domicilio'?`<div class="gris chico" style="margin-bottom:6px;">📍 ${escapeHtml(v.cliDir||'')}${v.cliTel?' · ☎ '+escapeHtml(v.cliTel):''}</div>`:''}
      <div class="kds-items">
        ${(v.items||[]).map(i=>`<div class="kds-item"><strong>${i.qty}×</strong> ${escapeHtml(i.nombre)}${i.obs?`<div class="rojo chico">⚠ ${escapeHtml(i.obs)}</div>`:''}</div>`).join('')}
      </div>
      ${v.obs?`<div class="kds-nota">${escapeHtml(v.obs)}</div>`:''}
      <div class="kds-acc">
        ${!prep&&v.estadoCocina!=='listo'?`<button class="btn btn-sm btn-verde" onclick="marcarCocina('${v.id}','preparando')">👨‍🍳 Preparando</button>`:''}
        ${v.estadoCocina!=='listo'?`<button class="btn btn-sm btn-gold" onclick="marcarCocina('${v.id}','listo')">✓ Listo</button>`:'<span class="pill pill-verde">✓ Listo</span>'}
        ${usaComanda?`<button class="btn btn-sm btn-ghost" onclick="imprimirComanda(misDatos('ventas').find(x=>x.id==='${v.id}'))" title="Comanda">🖨️</button>`:''}
      </div>
    </div>`;
  };
  return `
    <div class="stats">
      <div class="stat gold"><div class="stat-ico gold">${ic('chef')}</div><div class="stat-lbl">En preparación</div><div class="stat-val">${enPrep.length}</div><div class="stat-sub">pedidos en cocina</div></div>
      <div class="stat verde"><div class="stat-ico verde">${ic('report')}</div><div class="stat-lbl">Listos</div><div class="stat-val">${listos.length}</div><div class="stat-sub">para entregar</div></div>
    </div>
    <div class="tarjeta">
      <span class="t-tit">${ic('chef')} En preparación · <span class="gris chico">ordenado por tiempo de espera</span></span>
      ${enPrep.length?`<div class="kds-grid">${enPrep.map(tarjeta).join('')}</div>`:'<p class="gris">No hay pedidos en cocina.</p>'}
    </div>
    ${listos.length?`<div class="tarjeta">
      <span class="t-tit">✅ Listos para entregar</span>
      <div class="kds-grid">${listos.map(v=>`<div class="kds-card krono-verde">
        <div class="kds-top"><span class="kds-ref">${escapeHtml(v.factura||'')}</span><span class="pill pill-verde">Listo</span></div>
        <div class="kds-tipo">${etiq[v.tipo]||''}${v.mesa?' · '+escapeHtml(v.mesa):''}${v.cliNombre?' · '+escapeHtml(v.cliNombre):''}</div>
        <div class="kds-acc">
          <button class="btn btn-sm btn-verde" onclick="marcarCocina('${v.id}','entregado')">✓ Entregado</button>
          <button class="btn btn-sm btn-ghost" onclick="marcarCocina('${v.id}','pendiente')">← Volver</button>
        </div>
      </div>`).join('')}</div>
    </div>`:''}`;
}
function marcarCocina(id,estado){
  const arr=misDatos('ventas');
  const v=arr.find(x=>x.id===id); if(!v) return;
  v.estadoCocina=estado;
  if(estado==='preparando' && !v.horaPreparando) v.horaPreparando=now();
  if(estado==='listo'){ if(!v.horaListo) v.horaListo=now(); sonidoPedido(); }
  if(estado==='entregado') v.horaEntregado=now();
  guardarMisDatos('ventas',arr);
  toast(estado==='listo'?'Pedido listo para entregar':estado==='entregado'?'Pedido entregado':estado==='preparando'?'En preparación':'Vuelve a pendiente',
    estado==='listo'?'success':'info');
  render();
}


// ============================================================
//  REIMPRESIONES (Centro de Impresión)
// ============================================================
let _reimpBusca='';
function reimpresiones(){
  ESCRIBIENDO=false;
  const neg=STATE.negocio;
  let vs=misDatos('ventas').filter(v=>v.estado!=='anulada')
    .slice().sort((a,b)=>new Date(b.fecha||0)-new Date(a.fecha||0));
  if(_reimpBusca){ const q=_reimpBusca.toLowerCase();
    vs=vs.filter(v=>(v.factura||'').toLowerCase().includes(q)||(v.cliNombre||'').toLowerCase().includes(q)||(v.mesa||'').toLowerCase().includes(q)); }
  vs=vs.slice(0,60);
  const etiq={mesa:'Mesa',llevar:'Para llevar',domicilio:'Domicilio',envio:'Envío',rapida:'Directa'};
  return `
    <div class="tarjeta">
      <div class="t-cab">
        <div><span class="t-tit">🖨️ Centro de Impresión</span>
          <p class="gris">Reimprime facturas y comandas. Las cuentas sin cobrar salen marcadas como "cobro pendiente".</p></div>
        <input type="text" class="busca" placeholder="🔍 Factura, cliente, mesa..." value="${escapeHtml(_reimpBusca)}" oninput="_reimpBusca=this.value;render()">
      </div>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Pedido</th><th>Tipo</th><th>Cliente/Mesa</th><th>Total</th><th>Estado</th><th>Fecha</th><th>Reimprimir</th></tr></thead>
        <tbody>${vs.length?vs.map(v=>`<tr>
          <td><strong class="oro">${escapeHtml(v.factura||'—')}</strong></td>
          <td>${etiq[v.tipo]||'—'}${v.mesa?' '+escapeHtml(v.mesa):''}</td>
          <td>${escapeHtml(v.cliNombre||v.mesa||'—')}</td>
          <td class="negrita">${fmtMoney(v.total)}</td>
          <td>${v.estado==='pagada'?'<span class="pill pill-verde">Pagada</span>':'<span class="pill pill-gold">Por cobrar</span>'}</td>
          <td class="gris chico">${fmtDate(v.fecha)}</td>
          <td class="acciones">
            <button class="btn btn-sm" onclick="imprimirFactura('${v.id}')" title="${v.estado==='pagada'?'Factura':'Cuenta (cobro pendiente)'}">${v.estado==='pagada'?'🧾 Factura':'🧾 Cuenta'}</button>
            ${neg.usaCocina?`<button class="btn btn-sm" onclick="reimprimirComanda('${v.id}')" title="Comanda de cocina">👨‍🍳</button>`:''}
          </td>
        </tr>`).join(''):'<tr><td colspan="7" class="gris">No hay pedidos para reimprimir.</td></tr>'}</tbody>
      </table></div>
    </div>`;
}

// ============================================================
//  TIEMPOS DE ENTREGA (como Portal Imperial)
// ============================================================
function tiempos(){
  ESCRIBIENDO=false;
  const vs=misDatos('ventas');
  const conTiempo=vs.filter(v=>v.fecha && v.horaListo)
    .map(v=>({tipo:v.tipo, min:(new Date(v.horaListo)-new Date(v.fecha))/60000, fecha:v.horaListo, ref:v.factura||'—'}))
    .filter(x=>x.min>0 && x.min<240)
    .sort((a,b)=>new Date(b.fecha)-new Date(a.fecha));
  const prom=arr=>arr.length?arr.reduce((a,b)=>a+b,0)/arr.length:0;
  const ultimos5=conTiempo.slice(0,5).map(x=>x.min);
  const ultimos3=conTiempo.slice(0,3).map(x=>x.min);
  const promVivo=ultimos5.length>=3?prom(ultimos5):(ultimos3.length?prom(ultimos3):0);
  const promGeneral=prom(conTiempo.map(x=>x.min));
  const porTipo={};
  ['mesa','llevar','domicilio'].forEach(t=>{ const a=conTiempo.filter(x=>x.tipo===t).slice(0,5).map(x=>x.min); porTipo[t]={prom:prom(a),n:a.length}; });
  const base=promVivo||promGeneral;
  const estimado=base?Math.ceil(base/5)*5:0;
  const estimadoMax=estimado?estimado+10:0;
  const enCocina=vs.filter(v=>v.estado!=='anulada'&&v.estadoCocina&&v.estadoCocina!=='listo'&&v.estadoCocina!=='entregado').length;
  const fmtMin=m=>m>0?(m>=60?Math.floor(m/60)+'h '+Math.round(m%60)+'min':Math.round(m)+' min'):'—';
  const etiq={mesa:'Mesa',llevar:'Para llevar',domicilio:'Domicilio'};
  return `
    <div class="tarjeta" style="text-align:center;">
      <span class="t-tit centrado">${ic('history')} Tiempo estimado para el cliente</span>
      ${estimado?`<div class="stat-grande">${estimado} – ${estimadoMax} min</div>
        <p class="gris">Basado en los últimos ${Math.min(5,conTiempo.length)} pedidos preparados. Dile este tiempo al cliente.</p>
        ${enCocina>=4?`<p class="rojo chico" style="margin-top:6px;">⚠ Hay ${enCocina} pedidos en cocina ahora. El tiempo puede ser mayor.</p>`:''}`
        :`<p class="gris" style="margin-top:10px;">Aún no hay suficientes datos. Se necesitan al menos 3 pedidos marcados como "listo". Llevan ${conTiempo.length}.</p>`}
    </div>
    <div class="stats">
      <div class="stat gold"><div class="stat-lbl">Promedio en vivo</div><div class="stat-val">${fmtMin(promVivo)}</div><div class="stat-sub">últimos ${Math.min(5,conTiempo.length)} pedidos</div></div>
      <div class="stat verde"><div class="stat-lbl">Promedio histórico</div><div class="stat-val">${fmtMin(promGeneral)}</div><div class="stat-sub">${conTiempo.length} medidos</div></div>
      <div class="stat azul"><div class="stat-lbl">En cocina ahora</div><div class="stat-val">${enCocina}</div><div class="stat-sub">preparándose</div></div>
    </div>
    <div class="tarjeta">
      <span class="t-tit">${ic('report')} Tiempo promedio por tipo</span>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Tipo</th><th>Promedio</th><th>Medidos</th></tr></thead>
        <tbody>
          <tr><td>Mesa</td><td class="oro negrita">${fmtMin(porTipo.mesa.prom)}</td><td>${porTipo.mesa.n}</td></tr>
          <tr><td>Para llevar</td><td class="oro negrita">${fmtMin(porTipo.llevar.prom)}</td><td>${porTipo.llevar.n}</td></tr>
          <tr><td>Domicilio</td><td class="oro negrita">${fmtMin(porTipo.domicilio.prom)}</td><td>${porTipo.domicilio.n}</td></tr>
        </tbody>
      </table></div>
    </div>
    ${conTiempo.length?`<div class="tarjeta">
      <span class="t-tit">${ic('history')} Últimos pedidos preparados</span>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Pedido</th><th>Tipo</th><th>Tiempo</th></tr></thead>
        <tbody>${conTiempo.slice(0,10).map(x=>`<tr><td><strong class="oro">${escapeHtml(x.ref)}</strong></td><td>${etiq[x.tipo]||'—'}</td><td class="negrita ${x.min>25?'rojo':x.min>15?'oro':'verde'}">${fmtMin(x.min)}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>`:''}`;
}

// ============================================================
//  HISTORIAL (todas las ventas, con filtros)
// ============================================================
let _hBusca='', _hFiltro='todas', _hMes=null;
function historial(){
  ESCRIBIENDO=false;
  const mes=_hMes||today().substring(0,7);
  let vs=misDatos('ventas').slice().sort((a,b)=>new Date(b.fecha||0)-new Date(a.fecha||0));
  // Por defecto se muestra el mes seleccionado (como Portal Imperial)
  if(mes!=='todos') vs=vs.filter(v=>(v.fecha||'').substring(0,7)===mes);
  if(_hFiltro==='pagadas') vs=vs.filter(v=>v.estado==='pagada');
  else if(_hFiltro==='anuladas') vs=vs.filter(v=>v.estado==='anulada');
  else if(_hFiltro==='abiertas') vs=vs.filter(v=>v.estado==='abierta');
  if(_hBusca){ const q=_hBusca.toLowerCase();
    vs=vs.filter(v=>(v.factura||'').toLowerCase().includes(q)||(v.cliNombre||'').toLowerCase().includes(q)||(v.cliTel||'').includes(q)); }
  const etiq={mesa:'Mesa',llevar:'Para llevar',domicilio:'Domicilio',envio:'Envío'};
  const totalPag=vs.filter(v=>v.estado==='pagada').reduce((a,v)=>a+(v.total||0),0);
  // Meses disponibles
  const mesesSet={}; mesesSet[today().substring(0,7)]=1;
  misDatos('ventas').forEach(v=>{ if(v.fecha) mesesSet[v.fecha.substring(0,7)]=1; });
  const meses=Object.keys(mesesSet).sort().reverse();
  return `
    <div class="tarjeta">
      <div class="t-cab">
        <span class="t-tit">${ic('history')} Historial de ventas</span>
        <div class="t-acc">
          <select class="busca" onchange="_hMes=this.value;render()">
            ${meses.map(m=>`<option value="${m}" ${m===mes?'selected':''}>${nombreMes(m)}</option>`).join('')}
            <option value="todos" ${mes==='todos'?'selected':''}>Todo el historial</option>
          </select>
          <input type="text" class="busca" placeholder="🔍 Factura, cliente, teléfono..." value="${escapeHtml(_hBusca)}" oninput="_hBusca=this.value">
        </div>
      </div>
      <div class="cats">
        ${[['todas','Todas'],['pagadas','Pagadas'],['abiertas','Por cobrar'],['anuladas','Anuladas']].map(f=>`<button class="cat ${_hFiltro===f[0]?'on':''}" onclick="_hFiltro='${f[0]}';render()">${f[1]}</button>`).join('')}
      </div>
      <p class="nota">${vs.length} venta(s) · Total pagado: <strong class="oro">${fmtMoney(totalPag)}</strong></p>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Factura</th><th>Tipo</th><th>Cliente</th><th>Método</th><th>Total</th><th>Estado</th><th>Fecha</th><th></th></tr></thead>
        <tbody>${vs.length? vs.slice(0,200).map(v=>`<tr>
          <td><strong class="oro">${escapeHtml(v.factura||'—')}</strong></td>
          <td>${etiq[v.tipo]||'—'}</td>
          <td>${escapeHtml(v.cliNombre||v.mesa||'—')}</td>
          <td class="gris">${escapeHtml(v.estado==='pagada'?(v.metodo||'—'):'—')}</td>
          <td class="negrita">${fmtMoney(v.total)}</td>
          <td>${v.estado==='pagada'?'<span class="pill pill-verde">Pagada</span>':v.estado==='anulada'?'<span class="pill pill-rojo">Anulada</span>':'<span class="pill pill-gold">Por cobrar</span>'}</td>
          <td class="gris chico">${fmtDate(v.fecha)}</td>
          <td>${tienePermiso('imprimir')&&v.estado==='pagada'?`<button class="btn btn-sm" onclick="imprimirFactura('${v.id}')" title="Reimprimir">🖨️</button>`:''}</td>
        </tr>`).join('') : '<tr><td colspan="8" class="gris">Sin ventas.</td></tr>'}</tbody>
      </table></div>
    </div>`;
}

// ============================================================
//  AUDITORÍA (solo admin/supervisor)
// ============================================================
let _aFiltro='';
function auditoria(){
  ESCRIBIENDO=false;
  const u=STATE.user;
  if(!(u.rol==='admin'||u.esSupervisor)){
    return `<div class="tarjeta"><p class="gris">🔒 Solo el administrador puede ver la auditoría.</p></div>`;
  }
  const logs=misDatos('auditoria');
  const usuarios=Array.from(new Set(logs.map(l=>l.usuario))).sort();
  const filtrados=_aFiltro?logs.filter(l=>l.usuario===_aFiltro):logs;
  return `
    <div class="tarjeta">
      <div class="t-cab">
        <span class="t-tit">${ic('history')} Registro de auditoría</span>
        <div class="t-acc">
          <select class="busca" onchange="_aFiltro=this.value;render()">
            <option value="">Todos los usuarios</option>
            ${usuarios.map(us=>`<option value="${escapeHtml(us)}" ${us===_aFiltro?'selected':''}>${escapeHtml(us)}</option>`).join('')}
          </select>
          <span class="pill pill-gold">${filtrados.length} registros</span>
        </div>
      </div>
      <p class="nota">Queda registro de quién anula, edita, cambia pagos o elimina pedidos.</p>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Usuario</th><th>Acción</th><th>Detalle</th><th>Fecha</th></tr></thead>
        <tbody>${filtrados.length? filtrados.slice(0,300).map(l=>`<tr>
          <td><strong>${escapeHtml(l.usuario)}</strong>${l.rol?`<br><span class="gris chico">${escapeHtml(l.rol)}</span>`:''}</td>
          <td>${escapeHtml(l.accion)}</td>
          <td class="gris chico">${escapeHtml(l.detalle||'—')}</td>
          <td class="gris chico">${fmtDate(l.fecha)}</td>
        </tr>`).join('') : '<tr><td colspan="4" class="gris">Sin registros aún.</td></tr>'}</tbody>
      </table></div>
    </div>`;
}

function vistaNegocio(){
  const neg=STATE.negocio, u=STATE.user;
  const menu=armarMenu();
  const titulos={inicio:'Dashboard', ventas:'Nueva Venta', pedidos:'Pedidos',
    inventario:neg.usaRecetas?'Menú':'Inventario', insumos:'Insumos', caja:'Caja', cocina:'Cocina', citas:'Agendar',
    domicilios:'Domicilios', clientes:'Clientes', reportes:'Reportes',
    contable:'Registro Contable', gastosneg:'Gastos del Negocio', minegocio:'Mi Negocio',
    tiempos:'Tiempos de Entrega', historial:'Historial', auditoria:'Auditoría', reimpresiones:'Reimpresiones',
    citas:'Agendar', cocina:'Cocina'};
  const pantallas={inicio, ventas:nuevaVenta, pedidos, inventario, insumos:pantallaInsumos, caja,
    clientes, domicilios, reportes, contable, gastosneg, minegocio, citas, cocina,
    tiempos, historial, auditoria, reimpresiones};
  const fn=pantallas[STATE.pageNeg];
  let contenido='';
  if(!fn){
    contenido='<div class="tarjeta centro-msg"><div class="msg-ico">🚧</div>'
      +'<div class="t-tit centrado">Pantalla no disponible</div>'
      +'<p class="gris">Esta sección todavía no está habilitada para tu negocio.</p>'
      +'<button class="btn btn-gold" onclick="irA(\'inicio\')">Volver al inicio</button></div>';
  } else {
    try{ contenido=fn(); }catch(e){ console.error('Error en pantalla',STATE.pageNeg,e);
      contenido='<div class="tarjeta"><p class="rojo">Ocurrió un error al mostrar esta pantalla.</p><button class="btn" onclick="irA(\'inicio\')">Volver al inicio</button></div>'; }
  }
  const ini=(u.nombre||'?').charAt(0).toUpperCase();

  return `
  <div class="app-grid">
    <aside class="sidebar" id="sidebar">
      <div class="side-cab">
        ${neg.logo?`<img src="${neg.logo}" class="side-logo" alt="">`:`<div class="side-ini">${(neg.nombre||'?').charAt(0)}</div>`}
        <div class="side-nom">${escapeHtml(neg.nombre)}</div>
        <div class="side-tipo">${escapeHtml(neg.tipo||'')}</div>
      </div>
      <nav class="side-nav">
        ${menu.map(m=>m.g?`<div class="nav-grupo">${m.g}</div>`
          :`<div class="nav-item ${STATE.pageNeg===m.id?'on':''}" onclick="irA('${m.id}')">${ic(m.ic)}<span>${m.txt}</span></div>`).join('')}
      </nav>
      <div class="side-pie">
        <div class="user-box">
          <div class="avatar">${ini}</div>
          <div class="user-info">
            <div class="u-nom">${escapeHtml(u.nombre)}</div>
            <div class="u-est"><span class="fb-dot off" id="fb-status"></span> <span id="fb-txt">Conectando</span></div>
          </div>
          <button class="btn btn-ghost btn-sm" onclick="logout()" title="Salir">${ic('logout')}</button>
        </div>
        <div class="credito"><span class="c-marca">Wallace<span>System</span></span><span class="c-sub">Software administrativo</span></div>
      </div>
    </aside>
    <div class="main">
      ${STATE.modoSupervision?`<div class="banner-sup">
        <span>👁️ Modo supervisión — viendo como Super-Admin</span>
        <button class="btn btn-sm btn-gold" onclick="volverSuperAdmin()">← Volver al panel</button>
      </div>`:''}
      <div class="topbar">
        <h1><button class="menu-btn" onclick="document.getElementById('sidebar').classList.toggle('abierto')">☰</button>
          ${escapeHtml(titulos[STATE.pageNeg]||'')}</h1>
        <div class="tb-der">
          ${usaSucursales(neg)?`<select class="suc-sel" onchange="cambiarSucursal(this.value)">
            ${sucursalesDe(neg).filter(s=>puedeVerSucursal(s.id)).map(s=>`<option value="${escapeHtml(s.id)}" ${s.id===sucursalActual()?'selected':''}>📍 ${escapeHtml(s.nombre)}</option>`).join('')}
          </select>`:''}
          <span class="reloj" id="reloj"></span>
        </div>
      </div>
      <div class="contenido">${contenido}</div>
    </div>
  </div>`;
}
function vistaLogin(){
  return `<div class="login-fondo">
    <div class="login-caja">
      <div class="login-emblema">${window.WALLACE_LOGO||''}</div>
      <div class="login-marca">Wallace<span>System</span></div>
      <p class="login-sub">Sistema administrativo para tu negocio</p>
      <div class="m-row"><label>Usuario</label>
        <input id="l-user" class="campo" placeholder="usuario" onkeydown="if(event.key==='Enter')hacerLogin()"></div>
      <div class="m-row"><label>Contraseña</label>
        <input id="l-pass" type="password" class="campo" placeholder="••••••" onkeydown="if(event.key==='Enter')hacerLogin()"></div>
      <button class="login-btn" onclick="hacerLogin()">Entrar</button>
      <div class="login-pie">WALLACE COMPANY SYSTEM</div>
    </div>
  </div>`;
}
// ============================================================
//  TEMA POR NEGOCIO (oscuro neón / claro + color a gusto)
// ============================================================
function _hexRgb(hex){
  hex=(hex||'').replace('#','');
  if(hex.length===3) hex=hex.split('').map(c=>c+c).join('');
  const n=parseInt(hex,16);
  if(isNaN(n)||hex.length!==6) return [1,195,142];
  return [(n>>16)&255,(n>>8)&255,n&255];
}
function _rgbHex(r,g,b){
  const h=x=>Math.max(0,Math.min(255,Math.round(x))).toString(16).padStart(2,'0');
  return '#'+h(r)+h(g)+h(b);
}
function _aclarar(hex,p){ const [r,g,b]=_hexRgb(hex); return _rgbHex(r+(255-r)*p, g+(255-g)*p, b+(255-b)*p); }
function _oscurecer(hex,p){ const [r,g,b]=_hexRgb(hex); return _rgbHex(r*(1-p), g*(1-p), b*(1-p)); }
function aplicarTema(neg){
  const b=document.body; if(!b) return;
  const claro = !!(neg && neg.tema==='claro');
  b.classList.toggle('tema-claro', claro);
  let base=(neg && neg.colorTema && /^#[0-9a-fA-F]{6}$/.test(neg.colorTema)) ? neg.colorTema : '#01c38e';
  let [r,g,bl]=_hexRgb(base);
  let lum=(0.299*r+0.587*g+0.114*bl)/255;
  // Si el color elegido es casi blanco, las letras de acento desaparecen sobre
  // fondos claros. Lo oscurecemos hasta un nivel legible antes de usarlo.
  if(lum>0.82){ base=_oscurecer(base,.35); [r,g,bl]=_hexRgb(base); lum=(0.299*r+0.587*g+0.114*bl)/255; }
  b.style.setProperty('--verde', base);
  // --verde-c (acento de texto): en claro va más oscuro; en oscuro, más claro.
  b.style.setProperty('--verde-c', claro ? _oscurecer(base,.15) : _aclarar(base,.25));
  b.style.setProperty('--verde-o', _oscurecer(base,.22));
  b.style.setProperty('--acc-rgb', r+','+g+','+bl);
  b.style.setProperty('--acc-txt', lum>0.55 ? '#141821' : '#ffffff');
}
function quitarTema(){
  const b=document.body; if(!b) return;
  b.classList.remove('tema-claro');
  ['--verde','--verde-c','--verde-o','--acc-rgb','--acc-txt'].forEach(v=>b.style.removeProperty(v));
}

function render(){
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
  if(!STATE.user){ app.innerHTML=vistaLogin(); return; }
  if(STATE.esSuperAdmin){
    if(STATE.page.indexOf('config:')===0){ app.innerHTML=pantallaConfig(STATE.page.split(':')[1]); return; }
    if(STATE.page.indexOf('usuarios:')===0){ app.innerHTML=pantallaUsuarios(STATE.page.split(':')[1]); return; }
    if(STATE.page==='superadmins'){ app.innerHTML=pantallaSuperAdmins(); return; }
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

// ============================================================
//  ARRANQUE
// ============================================================
function arrancar(){
  try{ seed(); }catch(e){ console.error('seed',e); }
  try{ render(); }catch(e){
    console.error('render',e);
    const app=document.getElementById('app');
    if(app) app.innerHTML='<div style="padding:40px;text-align:center;color:#fff;">Error al cargar. Recarga con Ctrl+Shift+R.</div>';
  }
}
(function(){
  const ok=initFirebase();
  if(ok){
    const app=document.getElementById('app');
    if(app) app.innerHTML='<div class="cargando"><div class="spin"></div><div>Conectando…</div></div>';
    let listo=false;
    const forzar=setTimeout(()=>{ if(!listo){ listo=true; console.warn('Nube lenta: modo local'); arrancar(); } }, 12000);
    cargarDeLaNube(()=>{ if(!listo){ listo=true; clearTimeout(forzar); arrancar(); } });
  } else {
    NUBE_LISTA=true;
    arrancar();
  }
})();
setInterval(function(){
  const r=document.getElementById('reloj');
  if(r) r.textContent=new Date().toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
},1000);
// Refrescar la cocina cada 30s para que el cronómetro avance solo
setInterval(function(){
  if(STATE.user && !STATE.esSuperAdmin && STATE.pageNeg==='cocina'){
    try{ refrescarSiSePuede(); }catch(e){}
  }
},30000);
