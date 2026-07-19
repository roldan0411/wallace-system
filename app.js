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
let _ultimoCambioLocal=0; // momento del último cambio hecho por este dispositivo

const DB = {
  get(k){
    if(CACHE[k]!==undefined) return CACHE[k];
    try{ const v=localStorage.getItem('posu_'+k); const val=v?JSON.parse(v):null; CACHE[k]=val; return val; }catch(e){ return null; }
  },
  set(k,val){
    CACHE[k]=val;
    try{ localStorage.setItem('posu_'+k, JSON.stringify(val)); }catch(e){}
    // Sincronizar a la nube si Firebase está activo
    if(FB){ try{ _ultimoCambioLocal=Date.now(); FB.ref('posu/'+k).set(val); }catch(e){} }
  },
};

// ============================================================
//  GUARDADO SEGURO (evita que dos dispositivos se borren datos)
// ============================================================
// Cuando dos personas guardan casi al mismo tiempo, el último sobrescribía al otro
// y se perdían pedidos. Esto fusiona por ID: nada se pierde.
function guardarFusionado(clave, arrayLocal, campoFecha){
  const porId={};
  // 1) Lo que ya hay (incluye lo que llegó de la nube por el listener)
  (CACHE[clave]||[]).forEach(x=>{ if(x&&x.id) porId[x.id]=x; });
  // 2) Los cambios locales encima (lo más reciente gana), marcando cuándo se editó
  (arrayLocal||[]).forEach(x=>{
    if(!x||!x.id) return;
    const anterior=porId[x.id];
    // Si cambió respecto a lo que había, marcar la hora de edición
    if(!anterior || JSON.stringify(anterior)!==JSON.stringify(x)){ x.editado=new Date().toISOString(); }
    porId[x.id]=x;
  });
  let fusionado=Object.values(porId);
  // Ordenar por fecha si la tiene (lo más nuevo primero)
  const campo=campoFecha||'fecha';
  if(fusionado.length && fusionado[0][campo]) fusionado.sort((a,b)=>new Date(b[campo]||0)-new Date(a[campo]||0));
  DB.set(clave,fusionado);
  return fusionado;
}
// Borra UN solo registro sin arrastrar ni borrar los demás
function borrarFusionado(clave, id){
  const porId={};
  (CACHE[clave]||[]).forEach(x=>{ if(x&&x.id) porId[x.id]=x; });
  delete porId[id];
  DB.set(clave,Object.values(porId));
}

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
    // Después de cargar, escuchar cambios en tiempo real (multi-dispositivo)
    escucharCambios();
  }).catch(()=>callback());
}
// Escucha cambios de otros dispositivos y actualiza la pantalla.
// IMPORTANTE: nunca descarta datos de la nube; los FUSIONA con lo local por id,
// así nunca se pierde un pedido aunque dos personas guarden al mismo tiempo.
function escucharCambios(){
  if(!FB) return;
  FB.ref('posu').on('value', snap=>{
    const data=snap.val()||{};
    let hayCambio=false;
    Object.keys(data).forEach(k=>{
      const remoto=data[k];
      const local=CACHE[k];
      // Si ambos son listas de registros con id, fusionamos (nada se pierde)
      if(Array.isArray(remoto) && Array.isArray(local) && esListaConId(remoto)){
        const porId={};
        local.forEach(x=>{ if(x&&x.id) porId[x.id]=x; });
        let cambio=false;
        remoto.forEach(x=>{
          if(!x||!x.id) return;
          const mio=porId[x.id];
          if(!mio){ porId[x.id]=x; cambio=true; }             // registro nuevo de otro equipo
          else if(JSON.stringify(mio)!==JSON.stringify(x)){
            // Gana el más reciente si tiene marca de tiempo
            const tR=new Date(x.editado||x.fecha||x.creado||0).getTime();
            const tL=new Date(mio.editado||mio.fecha||mio.creado||0).getTime();
            if(tR>=tL){ porId[x.id]=x; cambio=true; }
          }
        });
        if(cambio){
          const fusion=Object.values(porId);
          CACHE[k]=fusion;
          try{ localStorage.setItem('posu_'+k, JSON.stringify(fusion)); }catch(e){}
          hayCambio=true;
        }
      } else {
        // Datos simples (config, caja actual): se toma el de la nube si cambió
        if(JSON.stringify(remoto)!==JSON.stringify(local)){
          CACHE[k]=remoto;
          try{ localStorage.setItem('posu_'+k, JSON.stringify(remoto)); }catch(e){}
          hayCambio=true;
        }
      }
    });
    if(hayCambio && STATE.user && typeof render==='function'){
      // No refrescar si hay un modal abierto (para no interrumpir al usuario)
      const modal=document.getElementById('modal-container');
      if(!modal || !modal.classList.contains('activo')) render();
    }
  });
}
function esListaConId(arr){ return arr.length===0 || (typeof arr[0]==='object' && arr[0] && arr[0].id!==undefined); }

function uid(){ return 'id'+Date.now().toString(36)+Math.random().toString(36).slice(2,7); }

// ============================================================
//  SONIDOS (igual que Portal Imperial)
// ============================================================
let _audioCtx=null;
function beep(freq=800,dur=200,vol=0.3){
  try{ const ctx=new (window.AudioContext||window.webkitAudioContext)(); const o=ctx.createOscillator(),g=ctx.createGain();
  o.connect(g); g.connect(ctx.destination); o.frequency.value=freq; o.type='square'; g.gain.setValueAtTime(Math.min(1,vol),ctx.currentTime);
  o.start(); g.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+dur/1000); o.stop(ctx.currentTime+dur/1000);
  }catch(e){}
}
// Nota tipo campana: suave y musical
function campana(freq, t0, dur, vol){
  try{
    _audioCtx = _audioCtx || new (window.AudioContext||window.webkitAudioContext)();
    const ctx=_audioCtx; const t=ctx.currentTime+t0;
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.type='triangle'; o.frequency.value=freq;
    o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t+0.01);
    g.gain.exponentialRampToValueAtTime(0.0008, t+dur);
    o.start(t); o.stop(t+dur+0.02);
    // armónico (brillo de campana)
    const o2=ctx.createOscillator(), g2=ctx.createGain();
    o2.type='sine'; o2.frequency.value=freq*2.01;
    o2.connect(g2); g2.connect(ctx.destination);
    g2.gain.setValueAtTime(0, t);
    g2.gain.linearRampToValueAtTime(vol*0.4, t+0.01);
    g2.gain.exponentialRampToValueAtTime(0.0008, t+dur*0.7);
    o2.start(t); o2.stop(t+dur*0.7+0.02);
  }catch(e){}
}
function sonidoActivo(){ const n=STATE.negocio; return !n || n.sonidos!==false; }
function sonidoVenta(){ if(!sonidoActivo())return; campana(1047,0,0.15,0.6); campana(1568,0.09,0.2,0.6); }
function sonidoPedidoNuevo(){
  if(!sonidoActivo())return;
  const V=0.9;
  const melodia=(t)=>{ campana(1047,t,0.18,V); campana(1319,t+0.10,0.18,V); campana(1568,t+0.20,0.30,V); };
  melodia(0); melodia(0.42);
}
function sonidoListo(){ if(!sonidoActivo())return; campana(1319,0,0.2,0.7); campana(1760,0.12,0.3,0.7); }
function sonidoError(){ if(!sonidoActivo())return; beep(250,300,0.5); }
function sonidoAlerta(){ if(!sonidoActivo())return; beep(600,150,0.4); setTimeout(()=>beep(600,150,0.4),200); }
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
  setTimeout(()=>{ const f=cont.querySelector('input,select,textarea'); if(f)f.focus(); if(typeof cfg.onAbrir==='function') cfg.onAbrir(); },50);
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
  calendar:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="14" x2="10" y2="14"/><line x1="14" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="10" y2="18"/><line x1="14" y1="18" x2="16" y2="18"/></svg>',
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
  {id:'citas',     label:'Agendar (citas, turnos, entregas)'},
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
        logo:'', colorPrincipal:'#01c38e', colorSecundario:'#132d46',
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
// Guarda fusionando por ID: si otro dispositivo agregó algo al mismo tiempo, NO se pierde.
// Las tablas de un solo registro (caja_actual) se guardan directo.
const TABLAS_DIRECTAS=['caja_actual'];
// Ventas de la jornada actual, sin importar en qué dispositivo se hicieron.
// Antes se filtraba solo por cajaId y cada equipo tenía su propia caja,
// así que cada quien veía únicamente sus propios pedidos.
function ventasDeLaJornada(soloPagadas){
  const caja=misDatos('caja_actual')[0];
  let vs=misDatos('ventas');
  if(caja && caja.apertura){
    const desde=new Date(caja.apertura).getTime();
    vs=vs.filter(v=>v.cajaId===caja.id || new Date(v.fecha||0).getTime()>=desde);
  } else {
    const hoy=today();
    vs=vs.filter(v=>(v.fecha||'').startsWith(hoy));
  }
  return soloPagadas ? vs.filter(v=>v.estado==='pagada') : vs;
}
function guardarMisDatos(tabla, arr){
  if(!STATE.negocio) return;
  const clave='data_'+STATE.negocio.id+'_'+tabla;
  if(TABLAS_DIRECTAS.includes(tabla)){ DB.set(clave, arr); return; }
  const fechas={ventas:'fecha', cierres:'cierre', movimientos:'fecha', gastos_negocio:'fecha', citas:'fechaHora'};
  guardarFusionado(clave, arr, fechas[tabla]||'creado');
}
// Elimina un registro sin arrastrar los demás (seguro entre dispositivos)
function eliminarMisDatos(tabla, id){
  if(!STATE.negocio) return;
  borrarFusionado('data_'+STATE.negocio.id+'_'+tabla, id);
}

// ============================================================
//  PANEL DE SUPER-ADMIN
// ============================================================
function panelSuperAdmin(){
  const negocios = DB.get('negocios')||[];
  const totalActivos = negocios.filter(n=>n.activo).length;
  const ingresoMensual = negocios.filter(n=>n.activo).reduce((a,n)=>a+(n.precioMes||0),0);
  const totalUsuarios = (DB.get('usuarios')||[]).length;
  // Estadísticas de uso del sistema (ventas totales de todos los negocios)
  let ventasTotales=0, ventasHoyTotal=0, negocioTop={nombre:'—',total:0};
  const hoyKey=new Date().toISOString().split('T')[0];
  negocios.forEach(n=>{
    const vs=(datosDe(n.id,'ventas')||[]).filter(v=>v.estado==='pagada');
    const suma=vs.reduce((a,v)=>a+v.total,0);
    ventasTotales+=suma;
    ventasHoyTotal+=vs.filter(v=>(v.fecha||'').startsWith(hoyKey)).reduce((a,v)=>a+v.total,0);
    if(suma>negocioTop.total) negocioTop={nombre:n.nombre,total:suma};
  });
  const busca=(STATE.buscaNegocio||'').toLowerCase();
  const negociosFiltrados=busca?negocios.filter(n=>n.nombre.toLowerCase().includes(busca)||(n.tipo||'').toLowerCase().includes(busca)||(n.ciudad||'').toLowerCase().includes(busca)):negocios;

  return `
  <div class="topbar" style="position:sticky;">
    <h1><span class="sa-emblem">${window.WALLACE_LOGO||''}</span> <span class="sa-brand">Wallace<span>System</span></span> <span class="pill pill-gold" style="font-size:11px;">Panel de Super-Admin</span></h1>
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
      <div class="stat-card blue"><div class="stat-icon">${ic('users')}</div><div class="stat-label">Usuarios totales</div><div class="stat-value">${totalUsuarios}</div><div class="stat-sub">empleados en el sistema</div></div>
    </div>
    <div class="stats-grid">
      <div class="stat-card gold"><div class="stat-icon">${ic('report')}</div><div class="stat-label">Ventas hoy (todos)</div><div class="stat-value">${fmtMoney(ventasHoyTotal)}</div><div class="stat-sub">movimiento del sistema</div></div>
      <div class="stat-card green"><div class="stat-icon">${ic('cash')}</div><div class="stat-label">Ventas históricas</div><div class="stat-value">${fmtMoney(ventasTotales)}</div><div class="stat-sub">todos los negocios</div></div>
      <div class="stat-card"><div class="stat-icon">${ic('building')}</div><div class="stat-label">Negocio con más ventas</div><div class="stat-value" style="font-size:18px;">${escapeHtml(negocioTop.nombre)}</div><div class="stat-sub">${fmtMoney(negocioTop.total)}</div></div>
    </div>

    <div class="card">
      <div class="card-head" style="flex-wrap:wrap;gap:10px;">
        <div class="card-title">${ic('building')} Negocios del sistema</div>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
          <input type="text" placeholder="🔍 Buscar negocio..." value="${escapeHtml(STATE.buscaNegocio||'')}" oninput="STATE.buscaNegocio=this.value;render()" style="padding:10px 14px;background:var(--panel2);border:1px solid var(--line2);border-radius:10px;color:var(--txt);">
          <button class="btn btn-gold" onclick="abrirNuevoNegocio()">${ic('plus')} Crear negocio</button>
        </div>
      </div>
      <div class="table-wrap">
        <table class="tbl">
          <thead><tr><th>Negocio</th><th>Tipo</th><th>Plan</th><th>Precio/mes</th><th>Usuarios</th><th>Estado</th><th>Acciones</th></tr></thead>
          <tbody>
          ${negociosFiltrados.length? negociosFiltrados.map(n=>`
            <tr>
              <td><strong>${escapeHtml(n.nombre)}</strong><br><span class="muted">${escapeHtml(n.ciudad||'')}</span></td>
              <td>${escapeHtml(n.tipo)}</td>
              <td>${escapeHtml(n.plan||'—')}</td>
              <td>${fmtMoney(n.precioMes)}</td>
              <td>${(DB.get('usuarios')||[]).filter(u=>u.negocioId===n.id).length}</td>
              <td>${n.activo?'<span class="pill pill-green">Activo</span>':'<span class="pill pill-red">Suspendido</span>'}</td>
              <td class="actions">
                <button class="btn btn-sm btn-green" onclick="entrarComoNegocio('${n.id}')">${ic('cash')} Entrar</button>
                <button class="btn btn-sm" onclick="abrirConfigNegocio('${n.id}')">${ic('cog')} Configurar</button>
                <button class="btn btn-sm" onclick="abrirUsuariosNegocio('${n.id}')">${ic('users')} Usuarios</button>
                <button class="btn btn-sm ${n.activo?'btn-warn':'btn-green'}" onclick="toggleNegocio('${n.id}')">${n.activo?'Suspender':'Activar'}</button>
                <button class="btn btn-sm btn-danger" onclick="eliminarNegocio('${n.id}')">×</button>
              </td>
            </tr>`).join('') : '<tr><td colspan="7" class="muted">No se encontraron negocios.</td></tr>'}
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
  // Tomar el perfil del tipo de negocio (COPIA PROFUNDA para no compartir referencias)
  const perfil=JSON.parse(JSON.stringify(PERFILES[tipo]||PERFILES['Otro']));
  negocios.push({
    id:negId, nombre, tipo, ciudad, tel, plan, precioMes, activo:true,
    logo:'', colorPrincipal:'#01c38e', colorSecundario:'#132d46', nit:'', dir:'',
    // Vocabulario y comportamiento del perfil
    palabraProducto:perfil.palabraProducto, palabraProductos:perfil.palabraProductos,
    usaMesas:perfil.usaMesas, usaCocina:perfil.usaCocina, usaCitas:perfil.usaCitas, usaVariantes:perfil.usaVariantes,
    funciones:perfil.funciones.slice(), tipoFactura:'pos',
    tiposEntrega: perfil.usaMesas?['mesa','llevar','domicilio']:['llevar','domicilio'],
    tema:'oscuro', colorFondo:'',
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
        <div class="form-row"><label>Color principal</label><input id="c-color1" type="color" value="${neg.colorPrincipal||'#01c38e'}"></div>
        <div class="form-row"><label>Color secundario</label><input id="c-color2" type="color" value="${neg.colorSecundario||'#132d46'}"></div>
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
        <label class="check"><input type="checkbox" id="c-citas" ${neg.usaCitas?'checked':''}> Usa agenda (citas, turnos, entregas)</label>
        <label class="check"><input type="checkbox" id="c-variantes" ${neg.usaVariantes?'checked':''}> Usa tallas/colores (ropa)</label>
      </div>

      <hr class="sep">
      <div class="card-title">Tipos de pedido / entrega</div>
      <p class="muted" style="margin-bottom:10px;">Marca las formas de entrega que usa este negocio. Aparecerán como botones en Nueva Venta.</p>
      <div class="func-grid" style="margin-bottom:6px;">
        <label class="check"><input type="checkbox" class="c-entrega" value="mesa" ${(neg.tiposEntrega||[]).includes('mesa')?'checked':''}> Mesa (comer en el local)</label>
        <label class="check"><input type="checkbox" class="c-entrega" value="llevar" ${(neg.tiposEntrega||['llevar']).includes('llevar')?'checked':''}> Para llevar / recoger</label>
        <label class="check"><input type="checkbox" class="c-entrega" value="domicilio" ${(neg.tiposEntrega||[]).includes('domicilio')?'checked':''}> Domicilio local</label>
        <label class="check"><input type="checkbox" class="c-entrega" value="envio" ${(neg.tiposEntrega||[]).includes('envio')?'checked':''}> Envío nacional</label>
      </div>

      <hr class="sep">
      <div class="card-title">Datáfono</div>
      <p class="muted" style="margin-bottom:10px;">Si el negocio cobra un recargo por pagar con datáfono, escribe el porcentaje. Se sugerirá automáticamente al cobrar con tarjeta. Ese dinero no cuenta como venta del negocio.</p>
      <div class="form-row"><label>Recargo del datáfono (%)</label><input id="c-pctdatafono" type="number" step="0.1" value="${neg.pctDatafono||0}" placeholder="Ej: 4"></div>

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
  // Leer una copia FRESCA para no arrastrar referencias compartidas
  const negocios=JSON.parse(JSON.stringify(DB.get('negocios')||[]));
  const idx=negocios.findIndex(n=>n.id===id);
  if(idx<0){ toast('Negocio no encontrado','error'); return; }
  const neg=negocios[idx];
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
  neg.pctDatafono=parseFloat(document.getElementById('c-pctdatafono').value)||0;
  neg.precioMes=parseInt(document.getElementById('c-precio').value)||0;
  neg.palabraProducto=(document.getElementById('c-palabra1').value||'').trim()||'Producto';
  neg.palabraProductos=(document.getElementById('c-palabra2').value||'').trim()||'Productos';
  neg.usaMesas=document.getElementById('c-mesas').checked;
  neg.usaCocina=document.getElementById('c-cocina').checked;
  neg.usaCitas=document.getElementById('c-citas').checked;
  neg.usaVariantes=document.getElementById('c-variantes').checked;
  neg.tiposEntrega=Array.from(document.querySelectorAll('.c-entrega:checked')).map(c=>c.value);
  if(!neg.tiposEntrega.length) neg.tiposEntrega=['llevar'];
  neg.funciones=Array.from(document.querySelectorAll('.c-func:checked')).map(c=>c.value);
  negocios[idx]=neg;
  DB.set('negocios',negocios);
  // Si el negocio editado es el que estoy viendo, refrescar su copia en memoria
  if(STATE.negocio && STATE.negocio.id===id) STATE.negocio=JSON.parse(JSON.stringify(neg));
  toast('Configuración guardada para '+neg.nombre,'success');
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
// El super-admin entra a supervisar un negocio (modo supervisión)
function entrarComoNegocio(id){
  const neg=(DB.get('negocios')||[]).find(n=>n.id===id); if(!neg) return;
  STATE.negocio=neg;
  STATE.user={nombre:'Supervisor (Super-Admin)', rol:'admin', negocioId:id, esSupervisor:true};
  STATE.esSuperAdmin=false;
  STATE.modoSupervision=true;
  STATE.pageNeg='dashboard';
  aplicarTema(neg);
  toast('Entrando a '+neg.nombre+' como supervisor','info');
  render();
}
// Volver al panel de super-admin
function volverSuperAdmin(){
  const sa=(DB.get('superadmins')||[])[0];
  STATE.user=sa; STATE.esSuperAdmin=true; STATE.negocio=null; STATE.modoSupervision=false;
  aplicarTema({tema:'oscuro'});
  render();
}

// ============================================================
//  GESTIÓN DE USUARIOS DESDE EL SUPER-ADMIN
// ============================================================
const ROLES_DISPONIBLES=[
  ['admin','Administrador','Ve y maneja todo el negocio'],
  ['cajero','Cajero','Cobra y maneja caja'],
  ['mesero','Mesero','Toma pedidos, ve mesas'],
  ['cocina','Cocina','Solo ve la pantalla de cocina'],
  ['dueno','Dueño','Solo consulta: reportes, caja, contable'],
  ['vendedor','Vendedor','Vende y consulta inventario']
];
// Pantallas que puede tener cada usuario (para permisos personalizados)
const PANTALLAS_USUARIO=[
  ['dashboard','Dashboard'],['ventas','Nueva Venta'],['pedidos','Pedidos'],['catalogo','Catálogo/Inventario'],
  ['caja','Caja'],['cocina','Cocina'],['citas','Agendar'],['clientes','Clientes'],['domicilios','Domicilios'],
  ['reportes','Reportes'],['contable','Registro Contable'],['gastosneg','Gastos del Negocio']
];
function abrirUsuariosNegocio(id){ STATE.page='usuarios-negocio:'+id; render(); }
function pantallaUsuariosNegocio(id){
  const neg=(DB.get('negocios')||[]).find(n=>n.id===id);
  if(!neg) return '<div class="wrap"><div class="card">Negocio no encontrado.</div></div>';
  const us=(DB.get('usuarios')||[]).filter(u=>u.negocioId===id);
  return `
  <div class="topbar">
    <div class="topbar-title">${ic('users')} Usuarios de ${escapeHtml(neg.nombre)}</div>
    <div class="topbar-right"><button class="btn btn-ghost btn-sm" onclick="STATE.page='';render()">← Volver</button></div>
  </div>
  <div class="wrap">
    <div class="card">
      <div class="inv-head">
        <div class="card-title">Empleados del negocio</div>
        <button class="btn btn-gold btn-sm" onclick="nuevoUsuarioSuper('${id}')">+ Crear usuario</button>
      </div>
      <p class="muted" style="margin-bottom:10px;">Tú (super-admin) creas los usuarios de cada negocio con su rol y las pantallas que puede usar según lo que necesite el cliente.</p>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Pantallas habilitadas</th><th>Estado</th><th></th></tr></thead>
        <tbody>
        ${us.length?us.map(u=>`<tr>
          <td><strong>${escapeHtml(u.nombre)}</strong></td>
          <td>${escapeHtml(u.usuario)}</td>
          <td>${escapeHtml((ROLES_DISPONIBLES.find(r=>r[0]===u.rol)||['',u.rol])[1])}</td>
          <td class="muted" style="font-size:12px;">${u.pantallas&&u.pantallas.length?u.pantallas.length+' pantallas':'según su rol'}</td>
          <td>${u.activo!==false?'<span class="pill pill-green">Activo</span>':'<span class="pill pill-red">Inactivo</span>'}</td>
          <td class="actions">
            <button class="btn btn-sm" onclick="editarUsuarioSuper('${id}','${u.id}')">Editar</button>
            <button class="btn btn-sm btn-danger" onclick="eliminarUsuarioSuper('${id}','${u.id}')">×</button>
          </td>
        </tr>`).join(''):'<tr><td colspan="6" class="muted">Sin usuarios. Crea el primero.</td></tr>'}
        </tbody>
      </table></div>
    </div>
  </div>`;
}
function nuevoUsuarioSuper(negId){ editarUsuarioSuper(negId, null); }
function editarUsuarioSuper(negId, userId){
  const neg=(DB.get('negocios')||[]).find(n=>n.id===negId); if(!neg) return;
  const u = userId? (DB.get('usuarios')||[]).find(x=>x.id===userId) : null;
  // Sugerir usuario basado en el nombre del negocio
  const sugerencia=neg.nombre.toLowerCase().replace(/[^a-z0-9]/g,'').slice(0,8);
  const rolesOpts=ROLES_DISPONIBLES.map(r=>({valor:r[0],label:r[1]+' — '+r[2]}));
  abrirModal({titulo:(u?'Editar':'Nuevo')+' usuario · '+neg.nombre, textoBoton:'Guardar', campos:[
    {id:'nombre', label:'Nombre del empleado', valor:u?u.nombre:'', requerido:true},
    {id:'usuario', label:'Usuario para entrar', valor:u?u.usuario:sugerencia, requerido:true, placeholder:sugerencia},
    {id:'pass', label:'Contraseña', valor:u?u.pass:'', requerido:true},
    {id:'rol', label:'Rol', tipo:'select', opciones:rolesOpts, valor:u?u.rol:'cajero'}
  ], extraHTML:`
    <div class="m-row"><label>Pantallas habilitadas (opcional — si no marcas nada, usa las de su rol)</label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px;">
        ${PANTALLAS_USUARIO.map(([pid,plabel])=>`<label class="check" style="font-size:12px;padding:7px 9px;"><input type="checkbox" class="u-pantalla" value="${pid}" ${u&&u.pantallas&&u.pantallas.includes(pid)?'checked':''}> ${plabel}</label>`).join('')}
      </div>
    </div>`,
    onGuardar:(d)=>{
    if(!d.nombre||!d.usuario||!d.pass){ toast('Faltan datos','error'); return; }
    // Verificar usuario único (excepto si es el mismo)
    const existe=(DB.get('usuarios')||[]).find(x=>x.usuario===d.usuario && (!u||x.id!==u.id)) || (DB.get('superadmins')||[]).some(s=>s.usuario===d.usuario);
    if(existe){ toast('Ese usuario ya existe','error'); return; }
    const pantallas=Array.from(document.querySelectorAll('.u-pantalla:checked')).map(c=>c.value);
    const usuarios=DB.get('usuarios')||[];
    if(u){ Object.assign(u,{nombre:d.nombre,usuario:d.usuario,pass:d.pass,rol:d.rol,pantallas}); }
    else { usuarios.push({id:uid(), negocioId:negId, nombre:d.nombre, usuario:d.usuario, pass:d.pass, rol:d.rol, pantallas, activo:true, creado:now()}); }
    DB.set('usuarios',usuarios);
    cerrarModal(); toast('Usuario guardado','success'); render();
  }});
}
function eliminarUsuarioSuper(negId,userId){
  confirmarModal('¿Eliminar este usuario?',()=>{
    DB.set('usuarios',(DB.get('usuarios')||[]).filter(u=>u.id!==userId));
    toast('Usuario eliminado','info'); render();
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
function eliminarDomiciliario(id){ confirmarModal('¿Eliminar este domiciliario?',()=>{ eliminarMisDatos('domiciliarios',id); toast('Eliminado','info'); render(); },'Eliminar'); }

// ============================================================
//  USUARIOS DEL NEGOCIO (roles: cajero, mesero, cocina...)
// ============================================================
function usuariosNeg(){
  const us=(DB.get('usuarios')||[]).filter(u=>u.negocioId===STATE.negocio.id);
  return `
    <div class="card">
      <div class="card-title">${ic('users')} Usuarios del negocio</div>
      <p class="muted" style="margin-bottom:12px;">Empleados que pueden entrar a este negocio, con su rol y las pantallas que ven. Para crear, cambiar o quitar usuarios, contacta a tu proveedor del sistema (WALLACE COMPANY SYSTEM).</p>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Pantallas</th><th>Estado</th></tr></thead>
        <tbody>
        ${us.length?us.map(u=>`<tr>
          <td><strong>${escapeHtml(u.nombre)}</strong></td>
          <td>${escapeHtml(u.usuario)}</td>
          <td>${escapeHtml((ROLES_DISPONIBLES.find(r=>r[0]===u.rol)||['',u.rol])[1])}</td>
          <td class="muted" style="font-size:12px;">${u.pantallas&&u.pantallas.length?u.pantallas.length+' personalizadas':'según su rol'}</td>
          <td>${u.activo!==false?'<span class="pill pill-green">Activo</span>':'<span class="pill pill-red">Inactivo</span>'}</td>
        </tr>`).join(''):'<tr><td colspan="5" class="muted">Sin usuarios registrados.</td></tr>'}
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

      <hr class="sep">
      <div class="card-title" style="font-size:14px;">Sonidos y avisos</div>
      <div class="func-grid" style="margin-bottom:10px;">
        <label class="check"><input type="checkbox" id="cfg-sonidos" ${STATE.negocio.sonidos!==false?'checked':''}> Sonidos al vender y avisar</label>
        <label class="check"><input type="checkbox" id="cfg-alertastock" ${STATE.negocio.alertaStock!==false?'checked':''}> Avisar cuando un producto se está agotando</label>
      </div>
      <button class="btn btn-ghost btn-sm" onclick="sonidoVenta()">🔊 Probar sonido</button>

      <button class="btn btn-gold btn-block" style="margin-top:14px;" onclick="guardarConfigNeg()">Guardar</button>
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
  const sonEl=document.getElementById('cfg-sonidos');
  const alertaEl=document.getElementById('cfg-alertastock');
  actualizarNegocioActual({
    tel:(document.getElementById('cfg-tel').value||'').trim(),
    nit:(document.getElementById('cfg-nit').value||'').trim(),
    dir:(document.getElementById('cfg-dir').value||'').trim(),
    tema, colorFondo,
    sonidos: sonEl?sonEl.checked:true,
    alertaStock: alertaEl?alertaEl.checked:true
  });
  aplicarTema(STATE.negocio);
  toast('Configuración guardada','success'); render();
}
// Aplica el tema/color de fondo del negocio al sistema
const TEMAS={
  oscuro:{bg:'#0f1218', bg2:'#151a24', panel:'#1a1e29', panel2:'#212636', card:'#1a1e29', txt:'#f4f6f8', txt2:'#c6ccd6', muted:'#8b93a3', line:'rgba(1,195,142,.12)', line2:'rgba(255,255,255,.06)'},
  claro:{bg:'#eef2f5', bg2:'#f8fafb', panel:'#ffffff', panel2:'#ffffff', card:'#ffffff', txt:'#1a1e29', txt2:'#3a4250', muted:'#6b7280', line:'rgba(1,195,142,.2)', line2:'rgba(0,0,0,.06)'},
  azul:{bg:'#0d1b2a', bg2:'#102336', panel:'#132d46', panel2:'#1b3a53', card:'#132d46', txt:'#e8f0f7', txt2:'#c0d2e0', muted:'#8fa8bd', line:'rgba(1,195,142,.15)', line2:'rgba(255,255,255,.08)'},
  verde:{bg:'#0a1a16', bg2:'#0e2420', panel:'#12302a', panel2:'#173d35', card:'#12302a', txt:'#e8f5f0', txt2:'#c0dbd2', muted:'#8fada4', line:'rgba(1,195,142,.2)', line2:'rgba(255,255,255,.08)'},
  vino:{bg:'#150a0e', bg2:'#1a0f13', panel:'#26161c', panel2:'#301c24', card:'#28171d', txt:'#f5e8ec', txt2:'#d8c0c8', muted:'#bd8f9a', line:'rgba(1,195,142,.12)', line2:'rgba(255,255,255,.08)'}
};
function aplicarTema(neg){
  if(!neg) return;
  const root=document.documentElement;
  let t;
  if(neg.tema==='personalizado' && neg.colorFondo){
    const esOscuro=esColorOscuro(neg.colorFondo);
    t={bg:neg.colorFondo, bg2:aclararOscurecer(neg.colorFondo,esOscuro?6:-5), panel:aclararOscurecer(neg.colorFondo,esOscuro?12:-8), panel2:aclararOscurecer(neg.colorFondo,esOscuro?20:-14), card:aclararOscurecer(neg.colorFondo,esOscuro?14:-10),
      txt:esOscuro?'#f4f5f7':'#1a1d21', txt2:esOscuro?'#c8ccd2':'#3a3f47', muted:esOscuro?'#8b9199':'#6b7280',
      line:esOscuro?'rgba(1,195,142,.1)':'rgba(0,0,0,.08)', line2:esOscuro?'rgba(255,255,255,.08)':'rgba(0,0,0,.06)'};
  } else {
    t=TEMAS[neg.tema||'oscuro']||TEMAS.oscuro;
  }
  root.style.setProperty('--bg',t.bg);
  root.style.setProperty('--bg2',t.bg2);
  root.style.setProperty('--panel',t.panel);
  root.style.setProperty('--panel2',t.panel2);
  root.style.setProperty('--card',t.card);
  root.style.setProperty('--txt',t.txt);
  root.style.setProperty('--txt2',t.txt2);
  root.style.setProperty('--muted',t.muted);
  root.style.setProperty('--line',t.line);
  root.style.setProperty('--line2',t.line2);
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
  const tipo=neg.tipoFactura||'pos';
  let html, pagina, ventanaW;
  if(tipo==='carta'){ html=facturaCarta(v,neg); pagina='@page{size:letter;margin:14mm;}'; ventanaW=850; }
  else if(tipo==='media'){ html=facturaMedia(v,neg); pagina='@page{size:letter;margin:10mm;}'; ventanaW=760; }
  else { html=facturaPOS(v,neg); pagina='@page{size:80mm auto;margin:0;}'; ventanaW=400; }
  const w=window.open('','_blank','width='+ventanaW+',height=680');
  w.document.write('<html><head><title>Factura '+(v.factura||'')+'</title><meta charset="utf-8"><style>'+pagina+' body{margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact;}</style></head><body>'+html+'</body></html>');
  w.document.close(); setTimeout(()=>w.print(),350);
}
// Datos del cliente en filas (se usa en los 3 formatos)
function _filasCliente(v){
  const f=[];
  if(v.cliNombre) f.push(['Cliente',v.cliNombre]);
  if(v.cliTel) f.push(['Teléfono',v.cliTel]);
  if(v.cliDir) f.push(['Dirección',v.cliDir]);
  if(v.cliBarrio) f.push(['Barrio',v.cliBarrio]);
  if(v.cliCiudad) f.push(['Ciudad',v.cliCiudad]);
  if(v.cliDepto) f.push(['Departamento',v.cliDepto]);
  if(v.transportadora) f.push(['Transportadora',v.transportadora]);
  if(v.domiciliario) f.push(['Mensajero',v.domiciliario]);
  return f;
}
function _tipoLabel(t){ return {mesa:'Mesa',domicilio:'Domicilio',llevar:'Para llevar',envio:'Envío nacional'}[t]||'Venta'; }

// ---------- 1) FACTURA POS / TIRILLA TÉRMICA (igual a Portal Imperial) ----------
function facturaPOS(v,neg){
  const logo=neg.logo||window.LOGO_DEFAULT||'';
  const subtotal=v.subtotal!==undefined?v.subtotal:v.items.reduce((a,i)=>a+i.precio*i.qty,0);
  const cli=_filasCliente(v);
  let extras='';
  if(v.valorDom>0) extras+=`<div style="display:flex;justify-content:space-between;"><span>${v.tipo==='envio'?'Envío':'Domicilio'}</span><span>${fmtMoney(v.valorDom)}</span></div>`;
  if(v.propina>0) extras+=`<div style="display:flex;justify-content:space-between;"><span>Propina</span><span>${fmtMoney(v.propina)}</span></div>`;
  if(v.recargo>0) extras+=`<div style="display:flex;justify-content:space-between;"><span>Recargo datáfono</span><span>${fmtMoney(v.recargo)}</span></div>`;
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#000;width:72mm;padding:4mm;margin:0 auto;font-weight:500;-webkit-font-smoothing:none;">
    <div style="text-align:center;padding-bottom:6px;">
      ${logo?`<img src="${logo}" style="max-height:120px;max-width:240px;margin-bottom:6px;">`:''}
      <div style="font-size:30px;font-weight:800;line-height:1.1;">${escapeHtml(neg.nombre)}</div>
      ${neg.eslogan?`<div style="font-size:15px;font-family:Georgia,serif;font-style:italic;margin-top:2px;">${escapeHtml(neg.eslogan)}</div>`:''}
      ${neg.nit?`<div style="font-size:14px;margin-top:3px;">NIT: ${escapeHtml(neg.nit)}</div>`:''}
      ${neg.dir?`<div style="font-size:14px;">${escapeHtml(neg.dir)}</div>`:''}
      ${neg.tel?`<div style="font-size:14px;">Tel: ${escapeHtml(neg.tel)}</div>`:''}
    </div>
    <div style="border-top:2px solid #000;border-bottom:2px solid #000;padding:6px 0;text-align:center;margin:6px 0;">
      <div style="font-size:15px;font-weight:bold;">FACTURA DE VENTA</div>
      <div style="font-size:15px;font-weight:bold;">N° ${escapeHtml(v.factura||'—')}</div>
      <div style="font-size:14px;">${_tipoLabel(v.tipo).toUpperCase()}</div>
    </div>
    <div style="font-size:15px;line-height:1.65;margin:6px 0;">
      <div style="display:flex;justify-content:space-between;"><span>Fecha</span><span>${fmtDate(v.fecha)}</span></div>
      <div style="display:flex;justify-content:space-between;"><span>Atendió</span><span>${escapeHtml(v.vendedor||'')}</span></div>
      ${v.mesa?`<div style="display:flex;justify-content:space-between;"><span>Mesa</span><span>${escapeHtml(v.mesa)}</span></div>`:''}
      ${cli.map(([k,val])=>`<div style="display:flex;justify-content:space-between;gap:6px;"><span>${k}</span><span style="text-align:right;max-width:62%;">${escapeHtml(val)}</span></div>`).join('')}
    </div>
    <div style="border-top:1px dashed #000;padding-top:5px;">
      <div style="display:flex;justify-content:space-between;font-size:14px;font-weight:bold;border-bottom:1px solid #000;padding-bottom:4px;margin-bottom:5px;"><span>CANT / PRODUCTO</span><span>VALOR</span></div>
      ${v.items.map(i=>`<div style="display:flex;justify-content:space-between;font-size:15px;padding:4px 0;"><span style="flex:1;padding-right:8px;">${i.qty} × ${escapeHtml(i.nombre)}</span><span>${fmtMoney(i.precio*i.qty)}</span></div>`).join('')}
    </div>
    <div style="border-top:1px dashed #000;margin-top:6px;padding-top:6px;font-size:15px;">
      <div style="display:flex;justify-content:space-between;"><span>Subtotal</span><span>${fmtMoney(subtotal)}</span></div>
      ${extras}
    </div>
    <div style="border-top:2px solid #000;border-bottom:2px solid #000;margin-top:6px;padding:9px 0;display:flex;justify-content:space-between;font-size:22px;font-weight:800;">
      <span>TOTAL</span><span>${fmtMoney(v.total)}</span>
    </div>
    <div style="text-align:center;font-size:14px;margin-top:6px;">Forma de pago: <strong>${escapeHtml((v.metodo||'').toUpperCase())}</strong></div>
    ${v.obs?`<div style="border-top:1px dashed #000;margin-top:8px;padding-top:6px;font-size:13px;"><strong>Obs:</strong> ${escapeHtml(v.obs)}</div>`:''}
    <div style="text-align:center;margin-top:14px;font-size:17px;font-weight:800;">¡GRACIAS POR SU COMPRA!</div>
    <div style="text-align:center;font-size:13px;margin-top:3px;">Vuelva pronto</div>
    <div style="text-align:center;font-size:11px;margin-top:10px;border-top:1px dashed #000;padding-top:8px;">Software administrativo por WALLACE COMPANY SYSTEM<br>wallacecompany11@gmail.com</div>
  </div>`;
}

// ---------- 2) MEDIA HOJA — PROFESIONAL CON TABLA ----------
function facturaMedia(v,neg){
  const logo=neg.logo||window.LOGO_DEFAULT||'';
  const subtotal=v.subtotal!==undefined?v.subtotal:v.items.reduce((a,i)=>a+i.precio*i.qty,0);
  const cli=_filasCliente(v);
  const VERDE='#01c38e', NAVY='#132d46';
  let extras='';
  if(v.valorDom>0) extras+=`<tr><td style="padding:5px 10px;text-align:right;">${v.tipo==='envio'?'Envío':'Domicilio'}</td><td style="padding:5px 10px;text-align:right;">${fmtMoney(v.valorDom)}</td></tr>`;
  if(v.propina>0) extras+=`<tr><td style="padding:5px 10px;text-align:right;">Propina</td><td style="padding:5px 10px;text-align:right;">${fmtMoney(v.propina)}</td></tr>`;
  if(v.recargo>0) extras+=`<tr><td style="padding:5px 10px;text-align:right;">Recargo datáfono</td><td style="padding:5px 10px;text-align:right;">${fmtMoney(v.recargo)}</td></tr>`;
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;width:100%;max-width:190mm;margin:0 auto;font-size:12px;">
    <!-- Barra superior -->
    <div style="background:${NAVY};height:9px;"></div>
    <div style="text-align:center;padding:9px 0 7px;font-size:17px;font-weight:800;letter-spacing:5px;color:${NAVY};">FACTURA</div>
    <div style="background:${NAVY};height:3px;"></div>
    <div style="display:flex;justify-content:center;gap:26px;padding:7px 0;font-size:11px;border-bottom:1px solid #ddd;">
      <span><strong>FECHA:</strong> ${fmtDate(v.fecha)}</span>
      <span><strong>NÚMERO:</strong> ${escapeHtml(v.factura||'—')}</span>
      <span><strong>TIPO:</strong> ${_tipoLabel(v.tipo)}</span>
    </div>
    <!-- Emisor y cliente -->
    <div style="display:flex;gap:20px;padding:14px 4px;border-bottom:1px solid #ddd;">
      <div style="flex:0 0 150px;text-align:center;">
        ${logo?`<img src="${logo}" style="max-height:75px;max-width:145px;">`:`<div style="font-size:20px;font-weight:800;color:${NAVY};">${escapeHtml(neg.nombre)}</div>`}
      </div>
      <div style="flex:1;font-size:11px;line-height:1.55;">
        <div style="font-weight:800;font-size:13px;margin-bottom:2px;">${escapeHtml(neg.nombre)}</div>
        ${neg.nit?`<div>NIT: ${escapeHtml(neg.nit)}</div>`:''}
        ${neg.dir?`<div>${escapeHtml(neg.dir)}</div>`:''}
        ${neg.tel?`<div>Tel: ${escapeHtml(neg.tel)}</div>`:''}
      </div>
      <div style="flex:1;font-size:11px;line-height:1.55;">
        <div style="font-size:9px;letter-spacing:1.5px;color:#888;margin-bottom:3px;">CLIENTE</div>
        ${cli.length?cli.map(([k,val])=>`<div><strong>${k}:</strong> ${escapeHtml(val)}</div>`).join(''):'<div style="color:#999;">Consumidor final</div>'}
        ${v.mesa?`<div><strong>Mesa:</strong> ${escapeHtml(v.mesa)}</div>`:''}
      </div>
    </div>
    <!-- Tabla de productos -->
    <table style="width:100%;border-collapse:collapse;margin-top:14px;font-size:11px;">
      <thead>
        <tr style="background:${NAVY};color:#fff;">
          <th style="padding:7px 10px;text-align:left;width:60px;">CANTIDAD</th>
          <th style="padding:7px 10px;text-align:left;">CONCEPTO</th>
          <th style="padding:7px 10px;text-align:right;width:90px;">PRECIO</th>
          <th style="padding:7px 10px;text-align:right;width:95px;">IMPORTE</th>
        </tr>
      </thead>
      <tbody>
        ${v.items.map((i,idx)=>`<tr style="background:${idx%2?'#f7f9fa':'#fff'};border-bottom:1px solid #e8ecef;">
          <td style="padding:7px 10px;">${i.qty}</td>
          <td style="padding:7px 10px;">${escapeHtml(i.nombre)}</td>
          <td style="padding:7px 10px;text-align:right;">${fmtMoney(i.precio)}</td>
          <td style="padding:7px 10px;text-align:right;font-weight:600;">${fmtMoney(i.precio*i.qty)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <!-- Totales -->
    <div style="display:flex;justify-content:flex-end;margin-top:14px;">
      <table style="border-collapse:collapse;font-size:12px;min-width:265px;">
        <tr><td style="padding:5px 10px;text-align:right;">Subtotal</td><td style="padding:5px 10px;text-align:right;">${fmtMoney(subtotal)}</td></tr>
        ${extras}
        <tr style="background:${NAVY};color:#fff;">
          <td style="padding:9px 10px;text-align:right;font-weight:800;font-size:14px;">TOTAL FACTURA</td>
          <td style="padding:9px 10px;text-align:right;font-weight:800;font-size:14px;">${fmtMoney(v.total)}</td>
        </tr>
      </table>
    </div>
    <!-- Cobro -->
    <div style="margin-top:20px;">
      <div style="text-align:center;font-size:12px;font-weight:800;letter-spacing:3px;color:${NAVY};padding-bottom:6px;">COBRO</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <tr style="background:${NAVY};color:#fff;"><th style="padding:6px 10px;text-align:left;">FECHA</th><th style="padding:6px 10px;text-align:left;">IMPORTE</th><th style="padding:6px 10px;text-align:left;">FORMA DE PAGO</th><th style="padding:6px 10px;text-align:left;">ATENDIÓ</th></tr>
        <tr style="border-bottom:1px solid #e8ecef;"><td style="padding:7px 10px;">${(v.fecha||'').split('T')[0]}</td><td style="padding:7px 10px;font-weight:600;">${fmtMoney(v.total)}</td><td style="padding:7px 10px;">${escapeHtml((v.metodo||'').toUpperCase())}</td><td style="padding:7px 10px;">${escapeHtml(v.vendedor||'')}</td></tr>
      </table>
    </div>
    ${v.obs?`<div style="margin-top:12px;font-size:11px;padding:8px 10px;background:#f7f9fa;border-left:3px solid ${VERDE};"><strong>Observaciones:</strong> ${escapeHtml(v.obs)}</div>`:''}
    <div style="margin-top:20px;text-align:center;font-size:12px;font-weight:700;color:${NAVY};">¡Gracias por su compra!</div>
    <div style="margin-top:14px;border-top:1px solid #ddd;padding-top:8px;text-align:center;font-size:9px;color:#888;">
      Software administrativo por <strong style="color:${NAVY};">WALLACE COMPANY SYSTEM</strong> · wallacecompany11@gmail.com
    </div>
    <div style="background:${VERDE};height:5px;margin-top:8px;"></div>
  </div>`;
}

// ---------- 3) HOJA COMPLETA (CARTA) — VERSIÓN EXTENSA ----------
function facturaCarta(v,neg){
  const logo=neg.logo||window.LOGO_DEFAULT||'';
  const subtotal=v.subtotal!==undefined?v.subtotal:v.items.reduce((a,i)=>a+i.precio*i.qty,0);
  const cli=_filasCliente(v);
  const VERDE='#01c38e', NAVY='#132d46';
  const totalUnidades=v.items.reduce((a,i)=>a+i.qty,0);
  let extras='';
  if(v.valorDom>0) extras+=`<tr><td style="padding:7px 14px;text-align:right;">${v.tipo==='envio'?'Valor del envío':'Domicilio'}</td><td style="padding:7px 14px;text-align:right;">${fmtMoney(v.valorDom)}</td></tr>`;
  if(v.propina>0) extras+=`<tr><td style="padding:7px 14px;text-align:right;">Propina</td><td style="padding:7px 14px;text-align:right;">${fmtMoney(v.propina)}</td></tr>`;
  if(v.recargo>0) extras+=`<tr><td style="padding:7px 14px;text-align:right;">Recargo datáfono</td><td style="padding:7px 14px;text-align:right;">${fmtMoney(v.recargo)}</td></tr>`;
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;width:100%;max-width:190mm;margin:0 auto;font-size:13px;">
    <div style="background:${NAVY};height:12px;"></div>
    <div style="text-align:center;padding:14px 0 10px;font-size:24px;font-weight:800;letter-spacing:8px;color:${NAVY};">FACTURA DE VENTA</div>
    <div style="background:${NAVY};height:3px;"></div>
    <div style="display:flex;justify-content:center;gap:36px;padding:10px 0;font-size:12px;border-bottom:1px solid #ddd;">
      <span><strong>FECHA:</strong> ${fmtDate(v.fecha)}</span>
      <span><strong>NÚMERO:</strong> ${escapeHtml(v.factura||'—')}</span>
      <span><strong>TIPO:</strong> ${_tipoLabel(v.tipo)}</span>
    </div>
    <!-- Emisor / Cliente -->
    <div style="display:flex;gap:26px;padding:20px 6px;border-bottom:1px solid #ddd;">
      <div style="flex:0 0 190px;text-align:center;">
        ${logo?`<img src="${logo}" style="max-height:110px;max-width:180px;">`:`<div style="font-size:26px;font-weight:800;color:${NAVY};">${escapeHtml(neg.nombre)}</div>`}
      </div>
      <div style="flex:1;font-size:12px;line-height:1.7;">
        <div style="font-size:9px;letter-spacing:2px;color:#888;margin-bottom:4px;">EMITIDO POR</div>
        <div style="font-weight:800;font-size:16px;margin-bottom:3px;">${escapeHtml(neg.nombre)}</div>
        ${neg.nit?`<div>NIT: ${escapeHtml(neg.nit)}</div>`:''}
        ${neg.dir?`<div>${escapeHtml(neg.dir)}</div>`:''}
        ${neg.tel?`<div>Tel: ${escapeHtml(neg.tel)}</div>`:''}
        ${neg.tipo?`<div style="color:#888;">${escapeHtml(neg.tipo)}</div>`:''}
      </div>
      <div style="flex:1;font-size:12px;line-height:1.7;background:#f7f9fa;padding:12px 16px;border-left:3px solid ${VERDE};">
        <div style="font-size:9px;letter-spacing:2px;color:#888;margin-bottom:4px;">DATOS DEL CLIENTE</div>
        ${cli.length?cli.map(([k,val])=>`<div><strong>${k}:</strong> ${escapeHtml(val)}</div>`).join(''):'<div style="color:#999;">Consumidor final</div>'}
        ${v.mesa?`<div><strong>Mesa:</strong> ${escapeHtml(v.mesa)}</div>`:''}
      </div>
    </div>
    <!-- Detalle -->
    <div style="margin-top:22px;font-size:10px;letter-spacing:2px;color:#888;">DETALLE DE LA COMPRA</div>
    <table style="width:100%;border-collapse:collapse;margin-top:7px;font-size:12px;">
      <thead>
        <tr style="background:${NAVY};color:#fff;">
          <th style="padding:10px 14px;text-align:left;width:50px;">#</th>
          <th style="padding:10px 14px;text-align:left;width:75px;">CANT.</th>
          <th style="padding:10px 14px;text-align:left;">DESCRIPCIÓN</th>
          <th style="padding:10px 14px;text-align:right;width:110px;">VALOR UNIT.</th>
          <th style="padding:10px 14px;text-align:right;width:115px;">IMPORTE</th>
        </tr>
      </thead>
      <tbody>
        ${v.items.map((i,idx)=>`<tr style="background:${idx%2?'#f7f9fa':'#fff'};border-bottom:1px solid #e8ecef;">
          <td style="padding:9px 14px;color:#888;">${idx+1}</td>
          <td style="padding:9px 14px;">${i.qty}</td>
          <td style="padding:9px 14px;">${escapeHtml(i.nombre)}</td>
          <td style="padding:9px 14px;text-align:right;">${fmtMoney(i.precio)}</td>
          <td style="padding:9px 14px;text-align:right;font-weight:600;">${fmtMoney(i.precio*i.qty)}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div style="display:flex;justify-content:space-between;margin-top:18px;gap:26px;">
      <div style="flex:1;font-size:12px;">
        <div style="background:#f7f9fa;padding:12px 16px;border-radius:5px;">
          <div style="font-size:9px;letter-spacing:2px;color:#888;margin-bottom:6px;">RESUMEN</div>
          <div style="display:flex;justify-content:space-between;padding:3px 0;"><span>Artículos distintos</span><strong>${v.items.length}</strong></div>
          <div style="display:flex;justify-content:space-between;padding:3px 0;"><span>Unidades totales</span><strong>${totalUnidades}</strong></div>
          <div style="display:flex;justify-content:space-between;padding:3px 0;"><span>Forma de pago</span><strong>${escapeHtml((v.metodo||'').toUpperCase())}</strong></div>
          <div style="display:flex;justify-content:space-between;padding:3px 0;"><span>Atendido por</span><strong>${escapeHtml(v.vendedor||'')}</strong></div>
        </div>
        ${v.obs?`<div style="margin-top:12px;padding:11px 15px;background:#fff;border-left:3px solid ${VERDE};font-size:11px;"><strong>Observaciones:</strong><br>${escapeHtml(v.obs)}</div>`:''}
      </div>
      <div style="flex:0 0 320px;">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr style="border-bottom:1px solid #e8ecef;"><td style="padding:7px 14px;text-align:right;">Subtotal</td><td style="padding:7px 14px;text-align:right;">${fmtMoney(subtotal)}</td></tr>
          ${extras}
          <tr style="background:${NAVY};color:#fff;">
            <td style="padding:13px 14px;text-align:right;font-weight:800;font-size:16px;">TOTAL</td>
            <td style="padding:13px 14px;text-align:right;font-weight:800;font-size:16px;">${fmtMoney(v.total)}</td>
          </tr>
        </table>
      </div>
    </div>
    <!-- Cobro -->
    <div style="margin-top:26px;">
      <div style="font-size:10px;letter-spacing:2px;color:#888;">COBROS / PAGO</div>
      <table style="width:100%;border-collapse:collapse;font-size:12px;margin-top:7px;">
        <tr style="background:${NAVY};color:#fff;"><th style="padding:8px 14px;text-align:left;">FECHA</th><th style="padding:8px 14px;text-align:left;">IMPORTE</th><th style="padding:8px 14px;text-align:left;">FORMA DE PAGO</th><th style="padding:8px 14px;text-align:left;">ESTADO</th></tr>
        <tr style="border-bottom:1px solid #e8ecef;"><td style="padding:9px 14px;">${(v.fecha||'').split('T')[0]}</td><td style="padding:9px 14px;font-weight:600;">${fmtMoney(v.total)}</td><td style="padding:9px 14px;">${escapeHtml((v.metodo||'').toUpperCase())}</td><td style="padding:9px 14px;color:${VERDE};font-weight:700;">PAGADO</td></tr>
      </table>
    </div>
    <div style="margin-top:34px;display:flex;gap:60px;justify-content:center;font-size:11px;text-align:center;">
      <div style="flex:0 0 210px;"><div style="border-top:1px solid #999;padding-top:5px;">Firma de quien entrega</div></div>
      <div style="flex:0 0 210px;"><div style="border-top:1px solid #999;padding-top:5px;">Firma de quien recibe</div></div>
    </div>
    <div style="margin-top:26px;text-align:center;font-size:15px;font-weight:800;color:${NAVY};">¡Gracias por su compra!</div>
    <div style="text-align:center;font-size:11px;color:#666;margin-top:3px;">Vuelva pronto, será un placer atenderle</div>
    <div style="margin-top:18px;border-top:1px solid #ddd;padding-top:10px;text-align:center;font-size:10px;color:#888;">
      Software administrativo por <strong style="color:${NAVY};">WALLACE COMPANY SYSTEM</strong> · wallacecompany11@gmail.com<br>
      <span style="font-size:9px;">Documento interno de gestión. No es una factura electrónica DIAN.</span>
    </div>
    <div style="background:${VERDE};height:6px;margin-top:10px;"></div>
  </div>`;
}

// ============================================================
//  CLIENTES (universal)
// ============================================================
let _clientesBusca='';
function clientes(){
  let cls=misDatos('clientes');
  if(_clientesBusca){ const q=_clientesBusca.toLowerCase(); cls=cls.filter(c=>(c.nombre||'').toLowerCase().includes(q)||(c.tel||'').includes(q)||(c.dir||'').toLowerCase().includes(q)||(c.barrio||'').toLowerCase().includes(q)); }
  // Ordenar por los que más compran
  cls=cls.slice().sort((a,b)=>(b.pedidos||0)-(a.pedidos||0));
  const totalClientes=misDatos('clientes').length;
  const conCompras=misDatos('clientes').filter(c=>(c.pedidos||0)>0).length;
  const totalVendido=misDatos('clientes').reduce((a,c)=>a+(c.totalComprado||0),0);
  return `
    <div class="stats-grid">
      <div class="stat-card green"><div class="stat-icon">${ic('users')}</div><div class="stat-label">Clientes registrados</div><div class="stat-value">${totalClientes}</div><div class="stat-sub">${conCompras} con compras</div></div>
      <div class="stat-card gold"><div class="stat-icon">${ic('cash')}</div><div class="stat-label">Total comprado</div><div class="stat-value">${fmtMoney(totalVendido)}</div><div class="stat-sub">por todos los clientes</div></div>
      <div class="stat-card blue"><div class="stat-icon">${ic('report')}</div><div class="stat-label">Cliente top</div><div class="stat-value" style="font-size:17px;">${cls.length?escapeHtml(cls[0].nombre||'—'):'—'}</div><div class="stat-sub">${cls.length?(cls[0].pedidos||0)+' pedido(s)':''}</div></div>
    </div>
    <div class="card">
      <div class="inv-head" style="flex-wrap:wrap;gap:10px;">
        <div class="card-title">${ic('users')} Clientes</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <input type="text" placeholder="🔍 Buscar nombre, teléfono, barrio..." value="${escapeHtml(_clientesBusca)}" oninput="_clientesBusca=this.value;render()" style="padding:10px 14px;background:var(--panel2);border:1px solid var(--line2);border-radius:10px;color:var(--txt);">
          <button class="btn btn-gold btn-sm" onclick="nuevoCliente()">+ Agregar cliente</button>
        </div>
      </div>
      <p class="muted" style="margin-bottom:10px;">Los clientes se guardan solos cuando cobras un domicilio o envío con sus datos.</p>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Nombre</th><th>Teléfono</th><th>Dirección</th><th>Pedidos</th><th>Total comprado</th><th>Último pedido</th><th></th></tr></thead>
        <tbody>
        ${cls.length? cls.map(c=>`<tr>
          <td><strong>${escapeHtml(c.nombre||'—')}</strong></td>
          <td>${escapeHtml(c.tel||'—')}</td>
          <td>${escapeHtml(c.dir||'—')}${c.barrio?`<br><span class="muted" style="font-size:11px;">${escapeHtml(c.barrio)}</span>`:''}${c.ciudad?`<br><span class="muted" style="font-size:11px;">${escapeHtml(c.ciudad)}</span>`:''}</td>
          <td><strong>${c.pedidos||0}</strong></td>
          <td class="text-gold font-bold">${fmtMoney(c.totalComprado||0)}</td>
          <td class="muted" style="font-size:12px;">${c.ultimoPedido?fmtDate(c.ultimoPedido):'—'}</td>
          <td class="actions">
            <button class="btn btn-sm" onclick="editarCliente('${c.id}')">Editar</button>
            <button class="btn btn-sm btn-danger" onclick="eliminarCliente('${c.id}')">×</button>
          </td>
        </tr>`).join('') : `<tr><td colspan="7" class="muted">${_clientesBusca?'No se encontraron clientes.':'Sin clientes aún. Se guardan solos al cobrar domicilios, o agrégalos manualmente.'}</td></tr>`}
        </tbody>
      </table></div>
    </div>`;
}
function nuevoCliente(){ editarCliente(null); }
function editarCliente(id){
  const cls=misDatos('clientes');
  const c = id? cls.find(x=>x.id===id) : null;
  abrirModal({titulo:(c?'Editar':'Nuevo')+' cliente', textoBoton:'Guardar', campos:[
    {id:'nombre', label:'Nombre', valor:c?c.nombre:'', requerido:true},
    {id:'tel', label:'Teléfono', tipo:'tel', valor:c?c.tel:''},
    {id:'dir', label:'Dirección', valor:c?c.dir:''},
    {id:'barrio', label:'Barrio', valor:c?c.barrio:''},
    {id:'ciudad', label:'Ciudad', valor:c?c.ciudad:''}
  ], onGuardar:(d)=>{
    if(c){ Object.assign(c,{nombre:d.nombre,tel:d.tel,dir:d.dir,barrio:d.barrio,ciudad:d.ciudad}); }
    else { cls.unshift({id:uid(), nombre:d.nombre, tel:d.tel, dir:d.dir, barrio:d.barrio, ciudad:d.ciudad, pedidos:0, totalComprado:0, creado:now()}); }
    guardarMisDatos('clientes',cls);
    cerrarModal(); toast('Cliente guardado','success'); render();
  }});
}
function eliminarCliente(id){ confirmarModal('¿Eliminar este cliente?',()=>{ eliminarMisDatos('clientes',id); toast('Eliminado','info'); render(); },'Eliminar'); }

// ============================================================
//  CITAS / TURNOS (barbería, salón)
// ============================================================
function citas(){
  const neg=STATE.negocio;
  const cits=misDatos('citas').sort((a,b)=>new Date(a.fechaHora)-new Date(b.fechaHora));
  return `
    <div class="card">
      <div class="inv-head">
        <div class="card-title">${ic('calendar')} Agendar</div>
        <button class="btn btn-gold btn-sm" onclick="nuevaCita()">+ Nuevo agendamiento</button>
      </div>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Fecha y hora</th><th>Cliente</th><th>Detalle</th><th>Encargado</th><th>Estado</th><th></th></tr></thead>
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
        </tr>`).join('') : '<tr><td colspan="6" class="muted">Nada agendado todavía.</td></tr>'}
        </tbody>
      </table></div>
    </div>`;
}
function nuevaCita(){
  const neg=STATE.negocio;
  // El "servicio" se adapta: barbería → Corte; tienda → lo que va a entregar/preparar
  const esServicio=neg.usaCitas && (neg.palabraProducto==='Servicio');
  abrirModal({titulo:'Nuevo agendamiento', textoBoton:'Agendar', campos:[
    {id:'cliente', label:'Cliente', requerido:true},
    {id:'fecha', label:'Fecha', tipo:'date', valor:today()},
    {id:'hora', label:'Hora', tipo:'time', valor:'10:00'},
    {id:'servicio', label:esServicio?'Servicio':'Detalle (qué se agenda)', valor:esServicio?'Corte':'', placeholder:esServicio?'Corte, tinte, manicure...':'Ej: 2 collares chicle, entrega de pedido...'},
    {id:'profesional', label:'Encargado (opcional)'}
  ], onGuardar:(d)=>{
    const cits=misDatos('citas');
    cits.push({id:uid(), cliente:d.cliente, fechaHora:d.fecha+'T'+(d.hora||'10:00')+':00', servicio:d.servicio, profesional:d.profesional, estado:'pendiente', creado:now()});
    guardarMisDatos('citas',cits);
    cerrarModal(); toast('Agendado','success'); render();
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
let _mesGastos=null;
function gastosneg(){
  const gastos=misDatos('gastos_negocio');
  const mes=_mesGastos||today().substring(0,7);
  const delMes=gastos.filter(g=>(g.fecha||'').substring(0,7)===mes);
  const total=delMes.reduce((a,g)=>a+g.valor,0);
  const porConcepto={};
  delMes.forEach(g=>{ porConcepto[g.concepto]=(porConcepto[g.concepto]||0)+g.valor; });
  const conceptosOrd=Object.entries(porConcepto).sort((a,b)=>b[1]-a[1]);
  // Meses disponibles
  const mesesSet=new Set([today().substring(0,7)]);
  gastos.forEach(g=>{ if(g.fecha) mesesSet.add(g.fecha.substring(0,7)); });
  const meses=[...mesesSet].sort().reverse();
  window._gastosData={mes, nombreMes:nombreMesLargo(mes), delMes, total, conceptosOrd};
  return `
    <div class="card" style="background:linear-gradient(135deg,rgba(1,195,142,.06),transparent);">
      <div class="flex-between" style="flex-wrap:wrap;gap:12px;">
        <div>
          <div class="card-title" style="margin:0;">${ic('cash')} Gastos del Negocio</div>
          <p class="muted">Gastos que se pagan de la cuenta del negocio o del dinero retirado (arriendo, recibos, materia prima...). Son APARTE de la caja diaria. Se guardan por mes.</p>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <select onchange="_mesGastos=this.value;render()" style="padding:10px 14px;background:var(--panel2);border:1px solid var(--line2);border-radius:10px;color:var(--txt);">
            ${meses.map(m=>`<option value="${m}" ${m===mes?'selected':''}>${nombreMesLargo(m)}</option>`).join('')}
          </select>
          <button class="btn btn-sm" onclick="exportarGastosExcel()">Excel</button>
          <button class="btn btn-gold btn-sm" onclick="exportarGastosPDF()">🖨️ PDF / Imprimir</button>
        </div>
      </div>
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="card-title">+ Registrar nuevo gasto</div>
        <div class="form-row"><label>Concepto *</label><input id="gn-concepto" placeholder="Ej: Arriendo, Recibo de luz, Materia prima..." list="gn-conceptos"><datalist id="gn-conceptos">${[...new Set(gastos.map(g=>g.concepto))].map(c=>`<option>${escapeHtml(c)}</option>`).join('')}</datalist></div>
        <div class="grid2">
          <div class="form-row"><label>Valor *</label><input id="gn-valor" type="number" placeholder="0"></div>
          <div class="form-row"><label>Fecha *</label><input id="gn-fecha" type="date" value="${today()}"></div>
        </div>
        <div class="grid2">
          <div class="form-row"><label>N° Factura (opcional)</label><input id="gn-factura" placeholder="Ej: F-00123"></div>
          <div class="form-row"><label>Pagado con</label><select id="gn-metodo"><option>Efectivo (retiro de caja)</option><option>Banco / Transferencia</option><option>Tarjeta</option></select></div>
        </div>
        <div class="form-row"><label>Nota (opcional)</label><input id="gn-nota" placeholder="Detalle adicional..."></div>
        <button class="btn btn-gold btn-block" onclick="guardarGastoNeg()">✓ Guardar gasto</button>
      </div>
      <div class="card">
        <div class="card-title">${ic('report')} Resumen del mes</div>
        <div class="stat-card red" style="margin-bottom:14px;"><div class="stat-label">Total gastos del negocio</div><div class="stat-value">${fmtMoney(total)}</div><div class="stat-sub">${delMes.length} gasto(s) este mes</div></div>
        <div class="card-title" style="font-size:13px;">Por concepto</div>
        ${conceptosOrd.length?conceptosOrd.map(([c,v])=>`<div class="resumen-row"><span>${escapeHtml(c)}</span><strong class="text-red">${fmtMoney(v)}</strong></div>`).join(''):'<p class="muted">Sin gastos este mes.</p>'}
      </div>
    </div>
    <div class="card">
      <div class="card-title">${ic('history')} Gastos registrados</div>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Fecha</th><th>Concepto</th><th>N° Factura</th><th>Pagado con</th><th>Valor</th><th></th></tr></thead>
        <tbody>
        ${delMes.length? delMes.map(g=>`<tr><td>${escapeHtml((g.fecha||'').split('T')[0])}</td><td><strong>${escapeHtml(g.concepto)}</strong>${g.nota?`<br><span class="muted" style="font-size:11px;">${escapeHtml(g.nota)}</span>`:''}</td><td>${escapeHtml(g.factura||'—')}</td><td class="muted">${escapeHtml(g.metodo||'Efectivo')}</td><td class="text-red font-bold">${fmtMoney(g.valor)}</td><td class="actions"><button class="btn btn-sm btn-danger" onclick="eliminarGasto('${g.id}')">×</button></td></tr>`).join('') : '<tr><td colspan="6" class="muted">Sin gastos este mes.</td></tr>'}
        </tbody>
      </table></div>
    </div>`;
}
// Exportar los gastos del mes a PDF
function exportarGastosPDF(){
  const d=window._gastosData; if(!d){ toast('Abre primero los gastos','error'); return; }
  const neg=STATE.negocio;
  const html=`<div style="font-family:Arial,Helvetica,sans-serif;color:#000;max-width:800px;margin:0 auto;padding:18px;">
    <div style="text-align:center;border-bottom:2px solid #000;padding-bottom:10px;">
      ${neg.logo?`<img src="${neg.logo}" style="max-height:70px;margin-bottom:6px;">`:''}
      <div style="font-size:22px;font-weight:800;">${escapeHtml(neg.nombre)}</div>
      ${neg.nit?`<div style="font-size:12px;">NIT: ${escapeHtml(neg.nit)}</div>`:''}
      <div style="font-size:17px;font-weight:700;margin-top:6px;">Gastos del Negocio — ${escapeHtml(d.nombreMes)}</div>
    </div>
    <div style="text-align:center;margin:16px 0;padding:12px;border:2px solid #000;">
      <div style="font-size:12px;">TOTAL GASTOS DEL MES</div>
      <div style="font-size:26px;font-weight:800;">${fmtMoney(d.total)}</div>
      <div style="font-size:11px;color:#555;">${d.delMes.length} gasto(s) registrado(s)</div>
    </div>
    ${d.conceptosOrd.length?`<h3 style="font-size:15px;margin-top:16px;border-bottom:1px solid #999;padding-bottom:3px;">Resumen por concepto</h3>
    <table style="width:100%;font-size:13px;border-collapse:collapse;">
      ${d.conceptosOrd.map(([c,v])=>`<tr style="border-bottom:1px solid #eee;"><td style="padding:5px;">${escapeHtml(c)}</td><td style="text-align:right;padding:5px;font-weight:600;">${fmtMoney(v)}</td></tr>`).join('')}
      <tr style="border-top:2px solid #000;"><td style="padding:6px;font-weight:bold;">TOTAL</td><td style="text-align:right;padding:6px;font-weight:bold;">${fmtMoney(d.total)}</td></tr>
    </table>`:''}
    <h3 style="font-size:15px;margin-top:18px;border-bottom:1px solid #999;padding-bottom:3px;">Detalle de gastos</h3>
    <table style="width:100%;font-size:12px;border-collapse:collapse;">
      <tr style="background:#eee;">
        <th style="padding:6px;text-align:left;">Fecha</th><th style="padding:6px;text-align:left;">Concepto</th>
        <th style="padding:6px;text-align:left;">N° Factura</th><th style="padding:6px;text-align:left;">Pagado con</th>
        <th style="padding:6px;text-align:right;">Valor</th>
      </tr>
      ${d.delMes.map(g=>`<tr style="border-bottom:1px solid #ddd;">
        <td style="padding:5px;">${(g.fecha||'').split('T')[0]}</td>
        <td style="padding:5px;">${escapeHtml(g.concepto)}${g.nota?`<br><span style="font-size:10px;color:#666;">${escapeHtml(g.nota)}</span>`:''}</td>
        <td style="padding:5px;">${escapeHtml(g.factura||'—')}</td>
        <td style="padding:5px;">${escapeHtml(g.metodo||'Efectivo')}</td>
        <td style="padding:5px;text-align:right;font-weight:600;">${fmtMoney(g.valor)}</td>
      </tr>`).join('')}
      <tr style="border-top:2px solid #000;"><td colspan="4" style="padding:7px;font-weight:bold;">TOTAL DEL MES</td><td style="padding:7px;text-align:right;font-weight:bold;font-size:14px;">${fmtMoney(d.total)}</td></tr>
    </table>
    <div style="margin-top:26px;text-align:center;font-size:10px;color:#666;border-top:1px dashed #999;padding-top:8px;">
      Generado el ${new Date().toLocaleString('es-CO')} · Software administrativo por WALLACE COMPANY SYSTEM
    </div>
  </div>`;
  const w=window.open('','_blank','width=850,height=680');
  w.document.write('<html><head><title>Gastos '+d.nombreMes+'</title><meta charset="utf-8"><style>@page{size:letter;margin:12mm;}body{margin:0;}</style></head><body>'+html+'</body></html>');
  w.document.close(); setTimeout(()=>w.print(),350);
}
function exportarGastosExcel(){
  const d=window._gastosData; if(!d){ toast('Abre primero los gastos','error'); return; }
  const filas=[
    ['GASTOS DEL NEGOCIO',d.nombreMes],[''],
    ['Fecha','Concepto','N° Factura','Pagado con','Nota','Valor'],
    ...d.delMes.map(g=>[(g.fecha||'').split('T')[0],g.concepto,g.factura||'',g.metodo||'Efectivo',g.nota||'',g.valor]),
    [''],['TOTAL','','','','',d.total],
    [''],['POR CONCEPTO',''],
    ...d.conceptosOrd.map(([c,v])=>[c,'','','','',v])
  ];
  descargarCSV(filas,'gastos-'+d.mes+'.csv');
}
function guardarGastoNeg(){
  const concepto=(document.getElementById('gn-concepto').value||'').trim();
  const valor=parseFloat(document.getElementById('gn-valor').value)||0;
  const fecha=document.getElementById('gn-fecha').value||today();
  const factura=(document.getElementById('gn-factura').value||'').trim();
  const metodo=document.getElementById('gn-metodo').value;
  const nota=(document.getElementById('gn-nota').value||'').trim();
  if(!concepto){ toast('Escribe el concepto','error'); return; }
  if(valor<=0){ toast('Valor inválido','error'); return; }
  const gastos=misDatos('gastos_negocio');
  gastos.unshift({id:uid(), concepto, valor, fecha, factura, metodo, nota, por:STATE.user.nombre, creado:now()});
  guardarMisDatos('gastos_negocio',gastos);
  toast('Gasto registrado','success'); render();
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
function eliminarGasto(id){ confirmarModal('¿Eliminar este gasto?',()=>{ eliminarMisDatos('gastos_negocio',id); toast('Eliminado','info'); render(); },'Eliminar'); }

// ============================================================
//  REGISTRO CONTABLE MENSUAL (universal)
// ============================================================
let _mesContable=null;
function contable(){
  const mes=_mesContable||today().substring(0,7);
  // Mes anterior para comparativo
  const dPrev=new Date(mes+'-15'); dPrev.setMonth(dPrev.getMonth()-1);
  const mesPrev=dPrev.toISOString().substring(0,7);
  const todasV=misDatos('ventas').filter(v=>v.estado==='pagada');
  const ventasArr=todasV.filter(v=>(v.fecha||'').substring(0,7)===mes);
  const ventasPrev=todasV.filter(v=>(v.fecha||'').substring(0,7)===mesPrev);
  const totalVentas=ventasArr.reduce((a,v)=>a+(v.subtotal!==undefined?v.subtotal:v.total),0);
  const totalVentasPrev=ventasPrev.reduce((a,v)=>a+(v.subtotal!==undefined?v.subtotal:v.total),0);
  const cambioV=totalVentasPrev>0?Math.round((totalVentas-totalVentasPrev)/totalVentasPrev*100):0;
  const porMetodo={efectivo:0,banco:0,tarjeta:0};
  ventasArr.forEach(v=>{ const r=v.subtotal!==undefined?v.subtotal:v.total; if(porMetodo[v.metodo]!==undefined)porMetodo[v.metodo]+=r; });
  // Dinero de terceros (no es ingreso del negocio)
  const totalPropinas=ventasArr.reduce((a,v)=>a+(v.propina||0),0);
  const totalDomicilios=ventasArr.reduce((a,v)=>a+(v.valorDom||0),0);
  const totalRecargos=ventasArr.reduce((a,v)=>a+(v.recargo||0),0);
  // Gastos del negocio
  const gastos=misDatos('gastos_negocio').filter(g=>(g.fecha||'').substring(0,7)===mes);
  const totalGastos=gastos.reduce((a,g)=>a+g.valor,0);
  // Gastos de caja (movimientos de los cierres del mes)
  const cierres=misDatos('cierres').filter(c=>(c.cierre||'').substring(0,7)===mes);
  let gastosCaja=0, retirosCaja=0;
  cierres.forEach(c=>{ (c.movimientos||[]).forEach(m=>{ if(m.tipo==='gasto')gastosCaja+=m.valor; if(m.tipo==='retiro')retirosCaja+=m.valor; }); });
  const totalEgresos=totalGastos+gastosCaja;
  // Gastos agrupados por concepto
  const porConcepto={};
  gastos.forEach(g=>{ porConcepto[g.concepto]=(porConcepto[g.concepto]||0)+g.valor; });
  cierres.forEach(c=>{ (c.movimientos||[]).forEach(m=>{ if(m.tipo==='gasto'){ const k='(caja) '+m.concepto; porConcepto[k]=(porConcepto[k]||0)+m.valor; } }); });
  const conceptosOrd=Object.entries(porConcepto).sort((a,b)=>b[1]-a[1]);
  const sumDif=cierres.reduce((a,c)=>a+(c.diferencia||0),0);
  const utilidad=totalVentas-totalEgresos;
  // Meses disponibles para el selector
  const mesesSet=new Set([today().substring(0,7)]);
  todasV.forEach(v=>{ if(v.fecha) mesesSet.add(v.fecha.substring(0,7)); });
  misDatos('gastos_negocio').forEach(g=>{ if(g.fecha) mesesSet.add(g.fecha.substring(0,7)); });
  const meses=[...mesesSet].sort().reverse();
  // Guardar los datos para exportar
  window._contableData={mes, nombreMes:nombreMesLargo(mes), totalVentas, porMetodo, totalGastos, gastosCaja, retirosCaja, totalEgresos, utilidad, conceptosOrd, cierres, sumDif, totalPropinas, totalDomicilios, totalRecargos, cambioV};
  return `
    <div class="card" style="background:linear-gradient(135deg,rgba(1,195,142,.06),transparent);">
      <div class="flex-between" style="flex-wrap:wrap;gap:12px;">
        <div><div class="card-title" style="margin:0;">${ic('report')} Registro Contable Mensual</div>
        <p class="muted">Informe interno de gestión para el dueño. No es tributario ni tiene relación con la DIAN.</p></div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <select onchange="_mesContable=this.value;render()" style="padding:10px 14px;background:var(--panel2);border:1px solid var(--line2);border-radius:10px;color:var(--txt);">
            ${meses.map(m=>`<option value="${m}" ${m===mes?'selected':''}>${nombreMesLargo(m)}</option>`).join('')}
          </select>
          <button class="btn btn-sm" onclick="exportarContableExcel()">Excel</button>
          <button class="btn btn-gold btn-sm" onclick="exportarContablePDF()">🖨️ PDF / Imprimir</button>
        </div>
      </div>
    </div>
    <div class="stats-grid">
      <div class="stat-card green"><div class="stat-label">Ventas del mes</div><div class="stat-value">${fmtMoney(totalVentas)}</div><div class="stat-sub">${cambioV>=0?'▲ +':'▼ '}${cambioV}% vs mes anterior</div></div>
      <div class="stat-card red"><div class="stat-label">Gastos del mes</div><div class="stat-value">${fmtMoney(totalEgresos)}</div><div class="stat-sub">gastos caja + negocio</div></div>
      <div class="stat-card gold"><div class="stat-label">Utilidad estimada</div><div class="stat-value">${fmtMoney(utilidad)}</div><div class="stat-sub">ventas − egresos</div></div>
      <div class="stat-card blue"><div class="stat-label">Cierres del mes</div><div class="stat-value">${cierres.length}</div><div class="stat-sub">${sumDif===0?'cuadrados':sumDif>0?'sobró '+fmtMoney(sumDif):'faltó '+fmtMoney(Math.abs(sumDif))}</div></div>
    </div>
    <div class="grid-2">
      <div class="card">
        <div class="card-title">${ic('cash')} Ventas por método de pago</div>
        <div class="resumen-row"><span>Efectivo</span><strong class="text-green">${fmtMoney(porMetodo.efectivo)}</strong></div>
        <div class="resumen-row"><span>Banco / Transferencia</span><strong class="text-blue" style="color:var(--blue);">${fmtMoney(porMetodo.banco)}</strong></div>
        <div class="resumen-row"><span>Tarjeta</span><strong class="text-gold">${fmtMoney(porMetodo.tarjeta)}</strong></div>
        <div class="resumen-row big"><span>TOTAL VENTAS</span><strong>${fmtMoney(totalVentas)}</strong></div>
      </div>
      <div class="card">
        <div class="card-title">${ic('cash')} Egresos por concepto (lo que se gastó)</div>
        ${conceptosOrd.length?conceptosOrd.map(([c,v])=>`<div class="resumen-row"><span>${escapeHtml(c)}</span><strong class="text-red">${fmtMoney(v)}</strong></div>`).join(''):'<p class="muted">Sin gastos registrados este mes.</p>'}
        ${conceptosOrd.length?`<div class="resumen-row big"><span>TOTAL GASTOS</span><strong class="text-red">${fmtMoney(totalEgresos)}</strong></div>`:''}
      </div>
    </div>
    ${(totalPropinas+totalDomicilios+totalRecargos)>0?`
    <div class="card">
      <div class="card-title">${ic('users')} Dinero de terceros (no es ingreso del negocio)</div>
      <div class="grid-2">
        <div>
          ${totalPropinas>0?`<div class="resumen-row"><span>Propinas (de los meseros)</span><strong class="text-green">${fmtMoney(totalPropinas)}</strong></div>`:''}
          ${totalDomicilios>0?`<div class="resumen-row"><span>Domicilios (de los mensajeros)</span><strong class="text-green">${fmtMoney(totalDomicilios)}</strong></div>`:''}
        </div>
        <div>
          ${totalRecargos>0?`<div class="resumen-row"><span>Recargos datáfono</span><strong class="text-gold">${fmtMoney(totalRecargos)}</strong></div>`:''}
          ${retirosCaja>0?`<div class="resumen-row"><span>Retiros del dueño (no es gasto)</span><strong class="muted">${fmtMoney(retirosCaja)}</strong></div>`:''}
        </div>
      </div>
    </div>`:''}
    ${cierres.length?`
    <div class="card">
      <div class="card-title">${ic('history')} Cierres de caja del mes</div>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Fecha</th><th>Cajero</th><th>Base</th><th>Esperado</th><th>Contado</th><th>Diferencia</th></tr></thead>
        <tbody>
        ${cierres.map(c=>`<tr>
          <td>${(c.cierre||'').split('T')[0]}</td>
          <td>${escapeHtml(c.cajero||'—')}</td>
          <td>${fmtMoney(c.base||0)}</td>
          <td>${fmtMoney(c.esperado||0)}</td>
          <td>${fmtMoney(c.contado||0)}</td>
          <td class="${(c.diferencia||0)===0?'':(c.diferencia>0?'text-green':'text-red')}">${(c.diferencia||0)===0?'✓ cuadró':fmtMoney(c.diferencia)}</td>
        </tr>`).join('')}
        </tbody>
      </table></div>
    </div>`:''}`;
}
function nombreMesLargo(m){
  if(!m) return '';
  const [a,mm]=m.split('-');
  const nombres=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return (nombres[parseInt(mm)-1]||'')+' de '+a;
}
// Exportar el registro contable a PDF (usa la impresión del navegador)
function exportarContablePDF(){
  const d=window._contableData; if(!d){ toast('Abre primero el informe','error'); return; }
  const neg=STATE.negocio;
  const html=`<div style="font-family:Arial,Helvetica,sans-serif;color:#000;max-width:800px;margin:0 auto;padding:18px;">
    <div style="text-align:center;border-bottom:2px solid #000;padding-bottom:10px;">
      ${neg.logo?`<img src="${neg.logo}" style="max-height:70px;margin-bottom:6px;">`:''}
      <div style="font-size:22px;font-weight:800;">${escapeHtml(neg.nombre)}</div>
      ${neg.nit?`<div style="font-size:12px;">NIT: ${escapeHtml(neg.nit)}</div>`:''}
      <div style="font-size:17px;font-weight:700;margin-top:6px;">Registro Contable — ${escapeHtml(d.nombreMes)}</div>
      <div style="font-size:11px;color:#555;">Informe interno de gestión. No es tributario ni tiene relación con la DIAN.</div>
    </div>
    <h3 style="font-size:15px;margin-top:16px;border-bottom:1px solid #999;padding-bottom:3px;">Resumen del mes</h3>
    <table style="width:100%;font-size:13px;border-collapse:collapse;">
      <tr><td style="padding:4px;">Ventas del mes</td><td style="text-align:right;font-weight:bold;">${fmtMoney(d.totalVentas)}</td></tr>
      <tr><td style="padding:4px;color:#555;">· Efectivo</td><td style="text-align:right;color:#555;">${fmtMoney(d.porMetodo.efectivo)}</td></tr>
      <tr><td style="padding:4px;color:#555;">· Banco / Transferencia</td><td style="text-align:right;color:#555;">${fmtMoney(d.porMetodo.banco)}</td></tr>
      <tr><td style="padding:4px;color:#555;">· Tarjeta</td><td style="text-align:right;color:#555;">${fmtMoney(d.porMetodo.tarjeta)}</td></tr>
      <tr><td style="padding:4px;">Gastos de caja</td><td style="text-align:right;">-${fmtMoney(d.gastosCaja)}</td></tr>
      <tr><td style="padding:4px;">Gastos del negocio</td><td style="text-align:right;">-${fmtMoney(d.totalGastos)}</td></tr>
      <tr><td style="padding:4px;font-weight:bold;">Total egresos</td><td style="text-align:right;font-weight:bold;color:#a00;">-${fmtMoney(d.totalEgresos)}</td></tr>
      <tr style="border-top:2px solid #000;"><td style="padding:7px 4px;font-weight:bold;font-size:15px;">UTILIDAD ESTIMADA</td><td style="text-align:right;font-weight:bold;font-size:15px;">${fmtMoney(d.utilidad)}</td></tr>
      ${d.retirosCaja>0?`<tr><td style="padding:4px;color:#555;">Retiros del dueño (no es gasto)</td><td style="text-align:right;color:#555;">${fmtMoney(d.retirosCaja)}</td></tr>`:''}
    </table>
    ${d.conceptosOrd.length?`<h3 style="font-size:15px;margin-top:16px;border-bottom:1px solid #999;padding-bottom:3px;">Egresos por concepto</h3>
    <table style="width:100%;font-size:13px;border-collapse:collapse;">
      ${d.conceptosOrd.map(([c,v])=>`<tr><td style="padding:4px;">${escapeHtml(c)}</td><td style="text-align:right;">${fmtMoney(v)}</td></tr>`).join('')}
      <tr style="border-top:1px solid #000;"><td style="padding:5px 4px;font-weight:bold;">TOTAL</td><td style="text-align:right;font-weight:bold;">${fmtMoney(d.totalEgresos)}</td></tr>
    </table>`:''}
    ${(d.totalPropinas+d.totalDomicilios+d.totalRecargos)>0?`<h3 style="font-size:15px;margin-top:16px;border-bottom:1px solid #999;padding-bottom:3px;">Dinero de terceros (no es ingreso)</h3>
    <table style="width:100%;font-size:13px;">
      ${d.totalPropinas>0?`<tr><td style="padding:4px;">Propinas</td><td style="text-align:right;">${fmtMoney(d.totalPropinas)}</td></tr>`:''}
      ${d.totalDomicilios>0?`<tr><td style="padding:4px;">Domicilios</td><td style="text-align:right;">${fmtMoney(d.totalDomicilios)}</td></tr>`:''}
      ${d.totalRecargos>0?`<tr><td style="padding:4px;">Recargos datáfono</td><td style="text-align:right;">${fmtMoney(d.totalRecargos)}</td></tr>`:''}
    </table>`:''}
    ${d.cierres.length?`<h3 style="font-size:15px;margin-top:16px;border-bottom:1px solid #999;padding-bottom:3px;">Cierres de caja (${d.cierres.length})</h3>
    <table style="width:100%;font-size:12px;border-collapse:collapse;">
      <tr style="background:#eee;"><th style="padding:5px;text-align:left;">Fecha</th><th style="padding:5px;text-align:left;">Cajero</th><th style="padding:5px;text-align:right;">Esperado</th><th style="padding:5px;text-align:right;">Contado</th><th style="padding:5px;text-align:right;">Dif.</th></tr>
      ${d.cierres.map(c=>`<tr style="border-bottom:1px solid #ddd;"><td style="padding:4px;">${(c.cierre||'').split('T')[0]}</td><td style="padding:4px;">${escapeHtml(c.cajero||'')}</td><td style="padding:4px;text-align:right;">${fmtMoney(c.esperado||0)}</td><td style="padding:4px;text-align:right;">${fmtMoney(c.contado||0)}</td><td style="padding:4px;text-align:right;">${(c.diferencia||0)===0?'✓':fmtMoney(c.diferencia)}</td></tr>`).join('')}
    </table>`:''}
    <div style="margin-top:26px;text-align:center;font-size:10px;color:#666;border-top:1px dashed #999;padding-top:8px;">
      Generado el ${new Date().toLocaleString('es-CO')} · Software administrativo por WALLACE COMPANY SYSTEM
    </div>
  </div>`;
  const w=window.open('','_blank','width=850,height=680');
  w.document.write('<html><head><title>Registro Contable '+d.nombreMes+'</title><meta charset="utf-8"><style>@page{size:letter;margin:12mm;}body{margin:0;}</style></head><body>'+html+'</body></html>');
  w.document.close(); setTimeout(()=>w.print(),350);
}
// Exportar el registro contable a Excel (CSV que Excel abre)
function exportarContableExcel(){
  const d=window._contableData; if(!d){ toast('Abre primero el informe','error'); return; }
  const filas=[
    ['REGISTRO CONTABLE',d.nombreMes],[''],
    ['Concepto','Valor'],
    ['Ventas del mes',d.totalVentas],
    ['  Efectivo',d.porMetodo.efectivo],
    ['  Banco',d.porMetodo.banco],
    ['  Tarjeta',d.porMetodo.tarjeta],
    ['Gastos de caja',-d.gastosCaja],
    ['Gastos del negocio',-d.totalGastos],
    ['Total egresos',-d.totalEgresos],
    ['UTILIDAD ESTIMADA',d.utilidad],
    [''],['EGRESOS POR CONCEPTO',''],
    ...d.conceptosOrd.map(([c,v])=>[c,v]),
    [''],['DINERO DE TERCEROS',''],
    ['Propinas',d.totalPropinas],['Domicilios',d.totalDomicilios],['Recargos',d.totalRecargos]
  ];
  descargarCSV(filas,'contable-'+d.mes+'.csv');
}
// Descarga un CSV a partir de filas
function descargarCSV(filas,nombreArchivo){
  const csv='\uFEFF'+filas.map(f=>f.map(c=>{
    const s=String(c==null?'':c);
    return /[",;\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;
  }).join(';')).join('\n');
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.download=nombreArchivo;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Archivo descargado','success');
}

// ============================================================
//  CATÁLOGO DE PRODUCTOS/SERVICIOS (universal)
// ============================================================
let _catBusca='';
let _catCategoria='Todas';
function catalogo(){
  const neg=STATE.negocio;
  const todos=misDatos('productos');
  const pp=neg.palabraProducto||'Producto';
  const pps=neg.palabraProductos||'Productos';
  const usaRecetas=(neg.funciones||[]).includes('recetas');
  const titulo=usaRecetas?'Catálogo de '+pps:'Inventario de '+pps;
  // Filtrar
  let productos=todos;
  if(_catCategoria!=='Todas') productos=productos.filter(p=>(p.categoria||'General')===_catCategoria);
  if(_catBusca){ const q=_catBusca.toLowerCase(); productos=productos.filter(p=>p.nombre.toLowerCase().includes(q)||(p.categoria||'').toLowerCase().includes(q)); }
  const cats=['Todas',...new Set(todos.map(p=>p.categoria||'General'))];
  // Alertas de stock (solo si el producto lleva stock)
  const conStock=todos.filter(p=>p.stock!=null);
  const agotados=conStock.filter(p=>p.stock<=0);
  const bajos=conStock.filter(p=>p.stock>0 && p.stock<=(p.stockMin||0));
  const valorInventario=conStock.reduce((a,p)=>a+(p.stock*(p.precio||0)),0);
  return `
    ${conStock.length?`<div class="stats-grid">
      <div class="stat-card green"><div class="stat-icon">${ic('box')}</div><div class="stat-label">${escapeHtml(pps)} en inventario</div><div class="stat-value">${todos.length}</div><div class="stat-sub">${conStock.reduce((a,p)=>a+p.stock,0)} unidades</div></div>
      <div class="stat-card gold"><div class="stat-icon">${ic('cash')}</div><div class="stat-label">Valor del inventario</div><div class="stat-value">${fmtMoney(valorInventario)}</div><div class="stat-sub">a precio de venta</div></div>
      <div class="stat-card ${bajos.length?'red':''}"><div class="stat-icon">${ic('report')}</div><div class="stat-label">Quedan pocos</div><div class="stat-value">${bajos.length}</div><div class="stat-sub">por agotarse</div></div>
      <div class="stat-card ${agotados.length?'red':''}"><div class="stat-icon">${ic('box')}</div><div class="stat-label">Agotados</div><div class="stat-value">${agotados.length}</div><div class="stat-sub">sin unidades</div></div>
    </div>`:''}
    ${(agotados.length||bajos.length)?`<div class="card alerta-stock">
      <div class="card-title" style="font-size:14px;">⚠️ Alertas de inventario</div>
      ${agotados.length?`<p style="margin-bottom:6px;"><strong class="text-red">AGOTADOS (${agotados.length}):</strong> ${agotados.map(p=>escapeHtml(p.nombre)).join(', ')}</p>`:''}
      ${bajos.length?`<p><strong class="text-gold">Quedan pocos (${bajos.length}):</strong> ${bajos.map(p=>escapeHtml(p.nombre)+' ('+p.stock+')').join(', ')}</p>`:''}
    </div>`:''}
    <div class="card">
      <div class="inv-head" style="flex-wrap:wrap;gap:10px;">
        <div class="card-title">${ic('box')} ${escapeHtml(titulo)}</div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <input type="text" placeholder="🔍 Buscar ${escapeHtml(pp.toLowerCase())}..." value="${escapeHtml(_catBusca)}" oninput="_catBusca=this.value;render()" style="padding:10px 14px;background:var(--panel2);border:1px solid var(--line2);border-radius:10px;color:var(--txt);">
          <button class="btn btn-gold btn-sm" onclick="abrirNuevoProducto()">+ Agregar ${escapeHtml(pp.toLowerCase())}</button>
        </div>
      </div>
      ${cats.length>1?`<div class="category-tabs">
        ${cats.map(c=>`<button class="cat-tab ${_catCategoria===c?'active':''}" onclick="_catCategoria='${escapeHtml(c)}';render()">${escapeHtml(c)}${c!=='Todas'?' ('+todos.filter(p=>(p.categoria||'General')===c).length+')':''}</button>`).join('')}
      </div>`:''}
      ${productos.length?`<div class="catalogo-grid">
        ${productos.map(p=>{
          const sinStock=p.stock!=null && p.stock<=0;
          const pocoStock=p.stock!=null && p.stock>0 && p.stock<=(p.stockMin||0);
          return `<div class="cat-card ${p.agotado||sinStock?'agotado':''}">
          <div class="cat-card-img" style="${p.imagen?`background-image:url('${p.imagen}')`:''}">${!p.imagen?ic('box'):''}${p.agotado?'<span class="cat-agotado-badge">AGOTADO</span>':sinStock?'<span class="cat-agotado-badge">SIN STOCK</span>':pocoStock?'<span class="cat-agotado-badge" style="background:var(--gold);color:#0a0d14;">POCOS</span>':''}</div>
          <div class="cat-card-body">
            <div class="cat-card-nombre">${escapeHtml(p.nombre)}</div>
            <div class="cat-card-cat">${escapeHtml(p.categoria||'General')}</div>
            <div class="cat-card-precio">${fmtMoney(p.precio)}</div>
            ${p.stock!=null?`<div class="cat-card-stock ${sinStock||pocoStock?'bajo':''}">Stock: ${p.stock}${sinStock?' ⛔':pocoStock?' ⚠️':''}</div>`:''}
            ${neg.usaVariantes&&(p.variantes||[]).length?`<div class="cat-card-var">${p.variantes.map(v=>`<span>${escapeHtml(v)}</span>`).join('')}</div>`:''}
          </div>
          <div class="cat-card-actions">
            ${p.stock!=null?`<button class="btn btn-sm btn-green" onclick="entradaStock('${p.id}')" title="Agregar stock">+ Stock</button>`:''}
            <button class="btn btn-sm" onclick="editarProducto('${p.id}')">Editar</button>
            <button class="btn btn-sm" onclick="toggleAgotado('${p.id}')">${p.agotado?'Activar':'Agotar'}</button>
            <button class="btn btn-sm btn-danger" onclick="eliminarProducto('${p.id}')">×</button>
          </div>
        </div>`;}).join('')}
      </div>`:`<p class="muted">${_catBusca||_catCategoria!=='Todas'?'No se encontraron '+escapeHtml(pps.toLowerCase())+'.':'Sin '+escapeHtml(pps.toLowerCase())+'. Agrega el primero.'}</p>`}
    </div>`;
}
// Agregar stock a un producto (entrada de mercancía)
function entradaStock(id){
  const productos=misDatos('productos');
  const p=productos.find(x=>x.id===id); if(!p) return;
  abrirModal({titulo:'Entrada de stock · '+p.nombre, textoBoton:'Agregar', campos:[
    {id:'cant', label:'¿Cuántas unidades entran?', tipo:'number', requerido:true},
    {id:'motivo', label:'Motivo', valor:'Compra'}
  ], extraHTML:`<p class="muted" style="font-size:12px;margin-top:-4px;">Stock actual: <strong>${p.stock||0}</strong></p>`,
  onGuardar:(d)=>{
    const cant=parseFloat(d.cant)||0;
    if(cant<=0){ toast('Cantidad inválida','error'); return; }
    p.stock=(p.stock||0)+cant;
    guardarMisDatos('productos',productos);
    // Dejar constancia del movimiento
    const movs=misDatos('movimientos');
    movs.unshift({id:uid(), insumoId:p.id, insumoNombre:p.nombre, tipo:'entrada', cantidad:cant, motivo:d.motivo, por:STATE.user.nombre, fecha:now()});
    guardarMisDatos('movimientos',movs);
    cerrarModal(); toast('Stock actualizado: '+p.stock+' unidades','success'); render();
  }});
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
  // Para tiendas (sin recetas), el producto lleva su propio stock
  const usaRecetas=(neg.funciones||[]).includes('recetas');
  if(!usaRecetas){
    campos.push({id:'stock', label:'Cantidad en stock', tipo:'number', valor:p&&p.stock!=null?p.stock:'0'});
    campos.push({id:'stockMin', label:'Stock mínimo (alerta)', tipo:'number', valor:p&&p.stockMin!=null?p.stockMin:'3'});
  }
  abrirModal({titulo:(p?'Editar ':'Nuevo ')+pp, textoBoton:'Guardar', campos, extraHTML:`
    <div class="m-row"><label>Imagen (opcional)</label>
      <input type="file" accept="image/*" onchange="cargarImgProducto(event)">
      <div id="prod-img-preview" style="margin-top:8px;">${_prodImgTmp?`<img src="${_prodImgTmp}" style="max-height:90px;border-radius:10px;">`:''}</div>
    </div>`, onGuardar:(d)=>{
    if(!d.nombre){ toast('Escribe un nombre','error'); return; }
    const precio=parseFloat(d.precio)||0;
    let variantes=p?p.variantes:[];
    if(neg.usaVariantes && d.variantes!=null){ variantes=d.variantes.split(',').map(s=>s.trim()).filter(Boolean); }
    const stock=d.stock!=null?parseFloat(d.stock)||0:undefined;
    const stockMin=d.stockMin!=null?parseFloat(d.stockMin)||0:undefined;
    if(p){ p.nombre=d.nombre; p.precio=precio; p.categoria=d.categoria||'General'; p.variantes=variantes; p.imagen=_prodImgTmp; if(stock!=null)p.stock=stock; if(stockMin!=null)p.stockMin=stockMin; }
    else { const np={id:uid(), nombre:d.nombre, precio, categoria:d.categoria||'General', variantes, imagen:_prodImgTmp, agotado:false, receta:[], creado:now()}; if(stock!=null)np.stock=stock; if(stockMin!=null)np.stockMin=stockMin; productos.push(np); }
    guardarMisDatos('productos',productos);
    cerrarModal(); toast('Guardado','success'); render();
  }});
}
function cargarImgProducto(e){
  const file=e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=ev=>{
    // Redimensionar y comprimir la imagen para que no sea gigante
    const img=new Image();
    img.onload=()=>{
      const max=400; // tamaño máximo del lado
      let w=img.width, h=img.height;
      if(w>h && w>max){ h=Math.round(h*max/w); w=max; }
      else if(h>max){ w=Math.round(w*max/h); h=max; }
      const canvas=document.createElement('canvas');
      canvas.width=w; canvas.height=h;
      const ctx=canvas.getContext('2d');
      ctx.drawImage(img,0,0,w,h);
      _prodImgTmp=canvas.toDataURL('image/jpeg',0.75); // JPEG comprimido
      const pv=document.getElementById('prod-img-preview');
      if(pv) pv.innerHTML=`<img src="${_prodImgTmp}" style="max-height:90px;border-radius:10px;">`;
    };
    img.src=ev.target.result;
  };
  reader.readAsDataURL(file);
}
function toggleAgotado(id){
  const productos=misDatos('productos'); const p=productos.find(x=>x.id===id); if(!p) return;
  p.agotado=!p.agotado; guardarMisDatos('productos',productos); render();
}
function eliminarProducto(id){
  confirmarModal('¿Eliminar este producto?',()=>{
    eliminarMisDatos('productos',id);
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
let _descuento = 0;
let _descMotivo = '';

// Aplicar descuento al pedido (por valor o por porcentaje)
function abrirDescuento(){
  const bruto=_carrito.reduce((a,i)=>a+i.precio*i.qty,0);
  abrirModal({titulo:'Aplicar descuento', textoBoton:'Aplicar', campos:[
    {id:'tipo', label:'¿Cómo es el descuento?', tipo:'select', opciones:[{valor:'valor',label:'Por valor fijo ($)'},{valor:'pct',label:'Por porcentaje (%)'}]},
    {id:'cantidad', label:'Cantidad', tipo:'number', requerido:true, placeholder:'Ej: 5000 o 10'},
    {id:'motivo', label:'Motivo (opcional)', placeholder:'Cliente frecuente, promoción...'}
  ], extraHTML:`<p class="muted" style="font-size:12px;margin-top:-4px;">Subtotal actual: <strong>${fmtMoney(bruto)}</strong></p>`,
  onGuardar:(d)=>{
    const cant=parseFloat(d.cantidad)||0;
    if(cant<=0){ toast('Cantidad inválida','error'); return; }
    let desc = d.tipo==='pct' ? Math.round(bruto*cant/100) : cant;
    if(desc>bruto){ toast('El descuento no puede ser mayor al total','error'); return; }
    _descuento=desc;
    _descMotivo=d.motivo||(d.tipo==='pct'?cant+'%':'');
    cerrarModal(); toast('Descuento de '+fmtMoney(desc)+' aplicado','success'); render();
  }});
}
function quitarDescuento(){ _descuento=0; _descMotivo=''; render(); }

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
  const subtotalBruto=_carrito.reduce((a,i)=>a+i.precio*i.qty,0);
  const total=Math.max(0, subtotalBruto-_descuento);
  // Tipos de pedido configurados por el super-admin
  const tiposCfg=neg.tiposEntrega&&neg.tiposEntrega.length?neg.tiposEntrega:(neg.usaMesas?['mesa','llevar']:['llevar']);
  const labels={mesa:'Mesa',llevar:'Para llevar',domicilio:'Domicilio',envio:'Envío nacional'};
  const tipos=tiposCfg.map(t=>[t,labels[t]||t]);
  // Asegurar que _ventaTipo sea uno válido
  if(!tiposCfg.includes(_ventaTipo)) _ventaTipo=tiposCfg[0];
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
          <div class="carrito-desc">
            ${_descuento>0?`<div class="cd-aplicado">
              <span>Descuento${_descMotivo?' · '+escapeHtml(_descMotivo):''}</span>
              <span><strong class="text-red">−${fmtMoney(_descuento)}</strong> <button class="btn btn-sm" onclick="quitarDescuento()">×</button></span>
            </div>`:`<button class="btn btn-ghost btn-sm btn-block" onclick="abrirDescuento()">% Aplicar descuento</button>`}
          </div>
          ${_descuento>0?`<div class="carrito-sub"><span>Subtotal</span><span>${fmtMoney(subtotalBruto)}</span></div>`:''}
          <div class="carrito-total"><span>TOTAL</span><span>${fmtMoney(total+ ((_ventaTipo==='domicilio'||_ventaTipo==='envio')?(parseFloat(_ventaCli.valorDom)||0):0))}</span></div>
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
  if(_ventaTipo==='envio'){
    // Envío nacional: más campos (ciudad, departamento, transportadora)
    return `
      <input type="text" class="mini-input" placeholder="Nombre del cliente" value="${escapeHtml(_ventaCli.nombre)}" oninput="_ventaCli.nombre=this.value">
      <input type="text" class="mini-input" placeholder="Teléfono / WhatsApp" value="${escapeHtml(_ventaCli.tel)}" oninput="_ventaCli.tel=this.value" onblur="buscarClientePorTel()">
      <input type="text" class="mini-input" placeholder="Dirección completa" value="${escapeHtml(_ventaCli.dir)}" oninput="_ventaCli.dir=this.value">
      <input type="text" class="mini-input" placeholder="Ciudad" value="${escapeHtml(_ventaCli.ciudad||'')}" oninput="_ventaCli.ciudad=this.value">
      <input type="text" class="mini-input" placeholder="Departamento" value="${escapeHtml(_ventaCli.depto||'')}" oninput="_ventaCli.depto=this.value">
      <input type="text" class="mini-input" placeholder="Transportadora (Servientrega, Envía...)" value="${escapeHtml(_ventaCli.transportadora||'')}" oninput="_ventaCli.transportadora=this.value">
      <input type="number" class="mini-input" placeholder="Valor del envío" value="${_ventaCli.valorDom||''}" oninput="_ventaCli.valorDom=this.value">`;
  }
  if(_ventaTipo==='domicilio'){
    const doms=misDatos('domiciliarios').filter(d=>d.activo);
    return `
      <input type="text" class="mini-input" placeholder="Nombre del cliente" value="${escapeHtml(_ventaCli.nombre)}" oninput="_ventaCli.nombre=this.value">
      <input type="text" class="mini-input" placeholder="Teléfono" value="${escapeHtml(_ventaCli.tel)}" oninput="_ventaCli.tel=this.value" onblur="buscarClientePorTel()">
      <input type="text" class="mini-input" placeholder="Dirección" value="${escapeHtml(_ventaCli.dir)}" oninput="_ventaCli.dir=this.value">
      <input type="text" class="mini-input" placeholder="Barrio" value="${escapeHtml(_ventaCli.barrio)}" oninput="_ventaCli.barrio=this.value">
      <input type="number" class="mini-input" placeholder="Valor del domicilio" value="${_ventaCli.valorDom||''}" oninput="_ventaCli.valorDom=this.value">
      <select class="mini-input" onchange="_ventaCli.domiciliario=this.value"><option value="">Domiciliario...</option>${doms.map(d=>`<option ${_ventaCli.domiciliario===d.nombre?'selected':''}>${escapeHtml(d.nombre)}</option>`).join('')}</select>`;
  }
  // llevar / recoger
  return `<input type="text" class="mini-input" placeholder="Nombre del cliente (opcional)" value="${escapeHtml(_ventaCli.nombre)}" oninput="_ventaCli.nombre=this.value">`;
}
function setVentaTipo(t){ _ventaTipo=t; render(); }
// Al escribir el teléfono, si el cliente ya existe, llena sus datos solo
function buscarClientePorTel(){
  const tel=(_ventaCli.tel||'').trim();
  if(!tel || tel.length<7) return;
  const c=misDatos('clientes').find(x=>x.tel===tel);
  if(!c) return;
  // Solo llenar lo que esté vacío, para no pisar lo que el cajero escribió
  if(!_ventaCli.nombre) _ventaCli.nombre=c.nombre||'';
  if(!_ventaCli.dir) _ventaCli.dir=c.dir||'';
  if(!_ventaCli.barrio) _ventaCli.barrio=c.barrio||'';
  if(!_ventaCli.ciudad) _ventaCli.ciudad=c.ciudad||'';
  if(!_ventaCli.depto) _ventaCli.depto=c.depto||'';
  toast('Cliente encontrado: '+c.nombre+' ('+(c.pedidos||0)+' pedidos)','success');
  render();
}
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
function clearOrder(){ _carrito=[]; _ventaObs=''; _descuento=0; _descMotivo=''; _ventaCli={nombre:'',tel:'',dir:'',barrio:'',ciudad:'',depto:'',transportadora:'',domiciliario:'',valorDom:0}; _ventaMesa=''; render(); }
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
  const valorDom=(_ventaTipo==='domicilio'||_ventaTipo==='envio')?(parseFloat(_ventaCli.valorDom)||0):0;
  const usaPropina=neg.usaCocina; // solo restaurantes/cafeterías manejan propina de mesero
  // Recargo sugerido del datáfono (% que configura el super-admin, por defecto 0)
  const pctDatafono=neg.pctDatafono||0;
  const campos=[
    {id:'metodo', label:'Método de pago', tipo:'select', opciones:[{valor:'efectivo',label:'Efectivo'},{valor:'banco',label:'Transferencia / Banco'},{valor:'tarjeta',label:'Tarjeta / Datáfono'}]}
  ];
  if(usaPropina) campos.push({id:'propina', label:'Propina (para el mesero, no es del negocio)', tipo:'number', valor:'0'});
  campos.push({id:'recargo', label:'Recargo del datáfono (lo cobra el banco, no es del negocio)', tipo:'number', valor:'0'});
  campos.push({id:'recibido', label:'¿Con cuánto paga? (opcional, para el vuelto)', tipo:'number', placeholder:String(total+valorDom)});
  abrirModal({titulo:'Cobrar '+fmtMoney(total+valorDom), textoBoton:'Confirmar cobro',
    campos,
    extraHTML:`<div id="cobro-resumen" class="cobro-box">
      <div class="cb-row"><span>${escapeHtml(neg.palabraProductos||'Productos')}</span><strong>${fmtMoney(total)}</strong></div>
      ${valorDom>0?`<div class="cb-row"><span>${_ventaTipo==='envio'?'Envío':'Domicilio'}</span><strong>${fmtMoney(valorDom)}</strong></div>`:''}
      <div class="cb-row" id="cb-propina-row" style="display:none;"><span>Propina</span><strong id="cb-propina">$ 0</strong></div>
      <div class="cb-row" id="cb-recargo-row" style="display:none;"><span>Recargo datáfono</span><strong id="cb-recargo">$ 0</strong></div>
      <div class="cb-row cb-total"><span>TOTAL A COBRAR</span><strong id="cb-total">${fmtMoney(total+valorDom)}</strong></div>
      <div class="cb-nota" id="cb-nota"></div>
    </div>`,
    onAbrir:()=>{
      // Recalcular el total en vivo y sugerir el recargo si paga con datáfono
      const recalc=()=>{
        const met=(document.getElementById('m-metodo')||{}).value||'efectivo';
        const prop=parseFloat((document.getElementById('m-propina')||{}).value)||0;
        const rec=parseFloat((document.getElementById('m-recargo')||{}).value)||0;
        const t=total+valorDom+prop+rec;
        const setTxt=(id,v)=>{ const el=document.getElementById(id); if(el) el.textContent=v; };
        const show=(id,on)=>{ const el=document.getElementById(id); if(el) el.style.display=on?'flex':'none'; };
        setTxt('cb-propina',fmtMoney(prop)); show('cb-propina-row',prop>0);
        setTxt('cb-recargo',fmtMoney(rec)); show('cb-recargo-row',rec>0);
        setTxt('cb-total',fmtMoney(t));
        const nota=document.getElementById('cb-nota');
        if(nota){
          if(met==='tarjeta'){
            nota.innerHTML='💳 Pago con datáfono. El recargo lo cobra el banco por usar el datáfono, <strong>no es ingreso del negocio</strong>.';
            nota.style.display='block';
          } else if(rec>0){
            nota.innerHTML='⚠️ Registraste un recargo pero el pago no es con datáfono.';
            nota.style.display='block';
          } else { nota.style.display='none'; }
        }
      };
      // Al cambiar el método, sugerir el recargo automáticamente
      const selMet=document.getElementById('m-metodo');
      if(selMet) selMet.addEventListener('change',()=>{
        const recEl=document.getElementById('m-recargo');
        if(recEl && selMet.value==='tarjeta' && pctDatafono>0 && !parseFloat(recEl.value)){
          recEl.value=Math.round((total+valorDom)*pctDatafono/100);
        }
        if(recEl && selMet.value!=='tarjeta') recEl.value=0;
        recalc();
      });
      ['m-propina','m-recargo'].forEach(id=>{ const el=document.getElementById(id); if(el) el.addEventListener('input',recalc); });
      recalc();
    },
    onGuardar:(d)=>{
    const metodo=d.metodo||'efectivo';
    const recibido=parseFloat(d.recibido)||0;
    const propina=parseFloat(d.propina)||0;
    const recargo=parseFloat(d.recargo)||0;
    const ventasArr=misDatos('ventas');
    // TOTAL COBRADO al cliente = productos + domicilio + propina + recargo
    // Pero la VENTA REAL del negocio son solo los productos (subtotal)
    const totalCobrado=total+valorDom+propina+recargo;
    const numFactura='F-'+String((ventasArr.length+1)).padStart(5,'0');
    const venta={id:uid(), factura:numFactura, items:_carrito.slice(),
      subtotal:total,              // venta real del negocio (ya con descuento)
      subtotalBruto:_carrito.reduce((a,i)=>a+i.precio*i.qty,0), descuento:_descuento, descMotivo:_descMotivo,
      valorDom, propina, recargo,  // dinero de terceros (no es del negocio)
      total:totalCobrado,          // lo que pagó el cliente
      metodo, estado:'pagada', tipo:_ventaTipo, cajaId:caja?caja.id:null, vendedor:STATE.user.nombre, fecha:now(),
      obs:_ventaObs, mesa:_ventaTipo==='mesa'?_ventaMesa:'',
      cliNombre:_ventaCli.nombre, cliTel:_ventaCli.tel, cliDir:_ventaCli.dir, cliBarrio:_ventaCli.barrio, cliCiudad:_ventaCli.ciudad, cliDepto:_ventaCli.depto, transportadora:_ventaCli.transportadora, domiciliario:_ventaCli.domiciliario};
    if((neg.funciones||[]).includes('cocina') && neg.usaCocina){ venta.estadoCocina='pendiente'; }
    ventasArr.unshift(venta);
    guardarMisDatos('ventas',ventasArr);
    guardarClienteSiAplica(venta);
    descontarInventarioVenta(venta);
    sonidoVenta();
    // Avisar si algún producto quedó con stock bajo
    revisarStockBajo(venta);
    cerrarModal();
    if(metodo==='efectivo' && recibido>totalCobrado){ toast('Vuelto: '+fmtMoney(recibido-totalCobrado),'info'); }
    else { toast('Venta cobrada: '+fmtMoney(totalCobrado),'success'); }
    clearOrder();
    if((neg.funciones||[]).includes('facturas')){
      confirmarModal('¿Imprimir factura?', ()=>imprimirFactura(venta.id), 'Imprimir');
    }
    render();
  }});
}
// Guarda o actualiza el cliente automáticamente al cobrar (como Portal Imperial)
function guardarClienteSiAplica(venta){
  const nombre=(venta.cliNombre||'').trim();
  const tel=(venta.cliTel||'').trim();
  if(!nombre && !tel) return; // sin datos (ej: venta de mostrador), no guarda
  const cls=misDatos('clientes');
  // Buscar cliente existente: primero por teléfono, luego por nombre
  let ex=null;
  if(tel) ex=cls.find(c=>c.tel && c.tel===tel);
  if(!ex && nombre) ex=cls.find(c=>(c.nombre||'').toLowerCase()===nombre.toLowerCase() && (!c.tel || !tel));
  if(ex){
    // Actualizar sin borrar lo que ya había
    ex.pedidos=(ex.pedidos||0)+1;
    ex.totalComprado=(ex.totalComprado||0)+(venta.total||0);
    if(nombre) ex.nombre=nombre;
    if(tel) ex.tel=tel;
    if(venta.cliDir) ex.dir=venta.cliDir;
    if(venta.cliBarrio) ex.barrio=venta.cliBarrio;
    if(venta.cliCiudad) ex.ciudad=venta.cliCiudad;
    if(venta.cliDepto) ex.depto=venta.cliDepto;
    ex.ultimoPedido=now();
  } else {
    cls.unshift({id:uid(), nombre, tel, dir:venta.cliDir||'', barrio:venta.cliBarrio||'',
      ciudad:venta.cliCiudad||'', depto:venta.cliDepto||'',
      pedidos:1, totalComprado:venta.total||0, creado:now(), ultimoPedido:now()});
  }
  guardarMisDatos('clientes',cls);
}
// Avisa (con sonido) si algún producto de la venta quedó con stock bajo o agotado
function revisarStockBajo(venta){
  const neg=STATE.negocio;
  if(!(neg.funciones||[]).includes('inventario')) return;
  const usaRecetas=(neg.funciones||[]).includes('recetas');
  const avisos=[];
  if(usaRecetas){
    const insumos=misDatos('insumos');
    insumos.forEach(i=>{ if(i.stock<=0) avisos.push(['AGOTADO',i.nombre,i.stock,i.unidad]); else if(i.stock<=(i.minimo||0)) avisos.push(['BAJO',i.nombre,i.stock,i.unidad]); });
  } else {
    const productos=misDatos('productos');
    venta.items.forEach(item=>{
      const p=productos.find(x=>x.id===item.prodId);
      if(p && p.stock!=null){
        if(p.stock<=0) avisos.push(['AGOTADO',p.nombre,p.stock,'und']);
        else if(p.stock<=(p.stockMin||0)) avisos.push(['BAJO',p.nombre,p.stock,'und']);
      }
    });
  }
  if(!avisos.length) return;
  sonidoAlerta();
  const agotados=avisos.filter(a=>a[0]==='AGOTADO');
  const bajos=avisos.filter(a=>a[0]==='BAJO');
  let msg='';
  if(agotados.length) msg+='⛔ AGOTADO: '+agotados.map(a=>a[1]).join(', ')+'. ';
  if(bajos.length) msg+='⚠️ Quedan pocos: '+bajos.map(a=>a[1]+' ('+a[2]+')').join(', ');
  setTimeout(()=>toast(msg,'error'),900);
}
function descontarInventarioVenta(venta){
  const neg=STATE.negocio;
  if(!(neg.funciones||[]).includes('inventario')) return;
  const usaRecetas=(neg.funciones||[]).includes('recetas');
  const productos=misDatos('productos');
  const insumos=usaRecetas?misDatos('insumos'):[];
  let cambioProd=false, cambioIns=false;
  // Cada producto se descuenta según lo que tenga:
  //  - si tiene receta y el negocio usa recetas -> descuenta insumos
  //  - si tiene stock propio -> descuenta ese stock
  // Así funciona igual para restaurantes, tiendas y negocios mixtos.
  venta.items.forEach(item=>{
    const prod=productos.find(p=>p.id===item.prodId);
    if(!prod) return;
    const tieneReceta = usaRecetas && prod.receta && prod.receta.length;
    if(tieneReceta){
      prod.receta.forEach(r=>{
        const ins=insumos.find(i=>i.id===r.insumoId);
        if(ins){ ins.stock=Math.max(0,(ins.stock||0)-r.cantidad*item.qty); cambioIns=true; }
      });
    }
    if(prod.stock!=null){
      prod.stock=Math.max(0,prod.stock-item.qty);
      cambioProd=true;
    }
  });
  if(cambioIns) guardarMisDatos('insumos',insumos);
  if(cambioProd) guardarMisDatos('productos',productos);
}

// ============================================================
//  PEDIDOS (lista de ventas con acciones)
// ============================================================
let _pedidosBusca='';
function pedidos(){
  const neg=STATE.negocio;
  const caja=misDatos('caja_actual')[0];
  let vs=ventasDeLaJornada(false);
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
      const usaRecetas=(neg.funciones||[]).includes('recetas');
      const productos=misDatos('productos');
      const insumos=usaRecetas?misDatos('insumos'):[];
      let cambioIns=false, cambioProd=false;
      v.items.forEach(item=>{
        const prod=productos.find(p=>p.id===item.prodId);
        if(!prod) return;
        if(usaRecetas && prod.receta && prod.receta.length){
          prod.receta.forEach(r=>{ const ins=insumos.find(i=>i.id===r.insumoId); if(ins){ ins.stock=(ins.stock||0)+r.cantidad*item.qty; cambioIns=true; } });
        }
        if(prod.stock!=null){ prod.stock=(prod.stock||0)+item.qty; cambioProd=true; }
      });
      if(cambioIns) guardarMisDatos('insumos',insumos);
      if(cambioProd) guardarMisDatos('productos',productos);
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
  const ventasCaja=ventasDeLaJornada(true);
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
  // Dinero de terceros que ENTRÓ al cajón en efectivo (hay que sacarlo: se le paga al mesero/domiciliario)
  const efVentas=ventasCaja.filter(v=>v.metodo==='efectivo');
  const propinasEfectivo=efVentas.reduce((a,v)=>a+(v.propina||0),0);
  const domEfectivo=efVentas.reduce((a,v)=>a+(v.valorDom||0),0);
  const recargoEfectivo=efVentas.reduce((a,v)=>a+(v.recargo||0),0);
  // Dinero de terceros que entró por banco/tarjeta pero se paga en efectivo del cajón
  const noEfVentas=ventasCaja.filter(v=>v.metodo!=='efectivo');
  const propinasBanco=noEfVentas.reduce((a,v)=>a+(v.propina||0),0);
  const domBanco=noEfVentas.reduce((a,v)=>a+(v.valorDom||0),0);
  // Efectivo en el cajón:
  // base + venta real en efectivo + terceros que entraron en efectivo (propina/domi/recargo)
  //      + entradas − gastos − retiros
  //      − terceros que hay que pagar en efectivo (propinas y domicilios que entraron por banco)
  const efectivoEnCaja = cajaAct.base + porMetodo.efectivo
    + propinasEfectivo + domEfectivo + recargoEfectivo
    + entradas - gastos - retiros
    - propinasBanco - domBanco;
  // Solo restaurantes/negocios con cocina o domicilios ven la sección de "terceros" (propinas, domicilios)
  const usaDom=(neg.funciones||[]).includes('domicilios');
  const mostrarTerceros = neg.usaCocina || usaDom || recargos>0 || propinas>0;
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
        <p class="muted" style="margin-top:8px;font-size:12px;">Efectivo del cajón: base + ventas en efectivo + entradas − gastos − retiros${mostrarTerceros?' − domicilios pagados por banco':''}.</p>
        <div style="display:flex;gap:8px;margin-top:14px;">
          <button class="btn" style="flex:1;" onclick="movCaja('gasto')">$ Gasto</button>
          <button class="btn" style="flex:1;" onclick="movCaja('retiro')">$ Retiro</button>
          <button class="btn" style="flex:1;" onclick="movCaja('entrada')">$ Entrada</button>
        </div>
        <button class="btn btn-danger btn-block" style="margin-top:8px;" onclick="cerrarCaja()">🔒 Cerrar caja</button>
      </div>
      ${mostrarTerceros?`<div class="card">
        <div class="card-title">${ic('users')} No son ingreso del negocio</div>
        <p class="muted" style="margin-bottom:10px;">Estos valores se cobran al cliente pero pertenecen a terceros. No suman a las ventas reales.</p>
        ${propinas>0||neg.usaCocina?`<div class="resumen-row"><span>Propinas (del mesero)</span><strong class="text-green">${fmtMoney(propinas)}</strong></div>`:''}
        ${domicilios>0||usaDom?`<div class="resumen-row"><span>Domicilios (del domiciliario)</span><strong class="text-green">${fmtMoney(domicilios)}</strong></div>`:''}
        ${recargos>0?`<div class="resumen-row"><span>Recargo datáfono (lo cobra el banco)</span><strong class="text-gold">${fmtMoney(recargos)}</strong></div>`:''}
        ${recargos>0?`<p class="muted" style="font-size:12px;margin-top:8px;">💳 El recargo del datáfono se le cobra al cliente por usar la tarjeta, pero ese dinero no es del negocio: se lo queda el banco o proveedor del datáfono.</p>`:''}
        ${movs.length?`<div class="card-title" style="font-size:13px;margin-top:16px;">Movimientos del día</div>
          ${movs.map(m=>`<div class="resumen-row"><span>${m.tipo==='gasto'?'Gasto':m.tipo==='retiro'?'Retiro':'Entrada'}: ${escapeHtml(m.concepto||'')}</span><strong class="${m.tipo==='entrada'?'text-green':'text-red'}">${m.tipo==='entrada'?'+':'-'}${fmtMoney(m.valor)}</strong></div>`).join('')}`:''}
      </div>`
      :`<div class="card">
        <div class="card-title">${ic('report')} Movimientos del día</div>
        ${movs.length?movs.map(m=>`<div class="resumen-row"><span>${m.tipo==='gasto'?'Gasto':m.tipo==='retiro'?'Retiro':'Entrada'}: ${escapeHtml(m.concepto||'')}</span><strong class="${m.tipo==='entrada'?'text-green':'text-red'}">${m.tipo==='entrada'?'+':'-'}${fmtMoney(m.valor)}</strong></div>`).join(''):'<p class="muted">Sin movimientos registrados. Usa los botones de Gasto, Retiro o Entrada.</p>'}
      </div>`}
    </div>`;
}
function abrirCaja(){
  const base=parseFloat(document.getElementById('caja-base').value)||0;
  // Si otro dispositivo ya abrió caja, no crear una nueva (se perderían los pedidos)
  const yaAbierta=misDatos('caja_actual')[0];
  if(yaAbierta){ toast('Ya hay una caja abierta por '+(yaAbierta.cajero||'otro usuario'),'info'); render(); return; }
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
  const ventasCaja=ventasDeLaJornada(true);
  const efVentas=ventasCaja.filter(v=>v.metodo==='efectivo');
  const noEfVentas=ventasCaja.filter(v=>v.metodo!=='efectivo');
  const efectivoVentas=efVentas.reduce((a,v)=>a+(v.subtotal!==undefined?v.subtotal:v.total),0);
  const movs=cajaAct.movimientos||[];
  const gastos=movs.filter(m=>m.tipo==='gasto').reduce((a,m)=>a+m.valor,0);
  const retiros=movs.filter(m=>m.tipo==='retiro').reduce((a,m)=>a+m.valor,0);
  const entradas=movs.filter(m=>m.tipo==='entrada').reduce((a,m)=>a+m.valor,0);
  // Terceros que entraron en efectivo al cajón
  const propinasEfectivo=efVentas.reduce((a,v)=>a+(v.propina||0),0);
  const domEfectivo=efVentas.reduce((a,v)=>a+(v.valorDom||0),0);
  const recargoEfectivo=efVentas.reduce((a,v)=>a+(v.recargo||0),0);
  // Terceros que entraron por banco pero se pagan en efectivo
  const propinasBanco=noEfVentas.reduce((a,v)=>a+(v.propina||0),0);
  const domBanco=noEfVentas.reduce((a,v)=>a+(v.valorDom||0),0);
  const esperado=cajaAct.base+efectivoVentas+propinasEfectivo+domEfectivo+recargoEfectivo+entradas-gastos-retiros-propinasBanco-domBanco;
  abrirModal({titulo:'Cerrar caja', textoBoton:'Cerrar caja', campos:[
    {id:'contado', label:'Cuenta el efectivo del cajón. Esperado: '+fmtMoney(esperado), tipo:'number', valor:String(esperado), requerido:true}
  ], onGuardar:(d)=>{
    const contado=parseFloat(d.contado)||0;
    const dif=contado-esperado;
    const cierres=misDatos('cierres');
    cierres.unshift({id:uid(), ...cajaAct, cierre:now(), totalVentas:ventasCaja.reduce((a,v)=>a+(v.subtotal!==undefined?v.subtotal:v.total),0), esperado, contado, diferencia:dif});
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
    eliminarMisDatos('insumos',id);
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
  const usaRecetas=F.includes('recetas');
  // Tiendas (sin recetas): el catálogo ES el inventario (productos con stock). Un solo menú.
  // Restaurantes (con recetas): Catálogo de platos + Inventario de insumos por separado.
  if(F.includes('menu')) nav.push({id:'catalogo',icon:'box',label:usaRecetas?'Catálogo':'Inventario'});
  nav.push({grupo:'OPERACIONES'});
  if(F.includes('caja')) nav.push({id:'caja',icon:'cash',label:'Caja'});
  if(F.includes('cocina')&&neg.usaCocina) nav.push({id:'cocina',icon:'chef',label:'Cocina'});
  if(F.includes('citas')&&neg.usaCitas) nav.push({id:'citas',icon:'calendar',label:'Agendar'});
  if(F.includes('domicilios')) nav.push({id:'domicilios',icon:'truck',label:'Domicilios'});
  // Solo restaurantes (con recetas) tienen el inventario de insumos separado
  if(F.includes('inventario') && usaRecetas) nav.push({id:'inventario',icon:'box',label:'Insumos'});
  if(F.includes('clientes')) nav.push({id:'clientes',icon:'users',label:'Clientes'});
  nav.push({grupo:'GESTIÓN'});
  if(F.includes('reportes')) nav.push({id:'reportes',icon:'report',label:'Reportes'});
  if(F.includes('contable')) nav.push({id:'contable',icon:'report',label:'Registro Contable'});
  if(F.includes('gastosneg')) nav.push({id:'gastosneg',icon:'report',label:'Gastos del Negocio'});
  if(STATE.user.rol==='admin'){ nav.push({id:'usuariosneg',icon:'users',label:'Usuarios'}); nav.push({id:'confignegocio',icon:'cog',label:'Configuración'}); }

  // Filtrar el menú según los permisos del usuario
  const navFiltrado=filtrarNavPorUsuario(nav);

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
        ${navFiltrado.map(n=>n.grupo?`<div class="nav-group">${n.grupo}</div>`:`<div class="nav-item ${pg===n.id?'active':''}" onclick="irNeg('${n.id}')">${ic(n.icon)}<span>${n.label}</span></div>`).join('')}
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
        <div class="wallace-credit">
          <span class="wc-brand">Wallace<span>System</span></span>
          <span class="wc-sub">Software administrativo</span>
        </div>
      </div>
    </aside>
    <div class="main">
      ${STATE.modoSupervision?`<div style="background:linear-gradient(90deg,rgba(1,195,142,.18),rgba(1,195,142,.05));border-bottom:1px solid var(--gold);padding:10px 22px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
        <span style="font-size:13px;font-weight:600;color:var(--gold-l);">👁️ Modo supervisión — estás viendo este negocio como Super-Admin</span>
        <button class="btn btn-sm btn-gold" onclick="volverSuperAdmin()">← Volver al panel de Super-Admin</button>
      </div>`:''}
      <div class="topbar">
        <h1><button class="menu-toggle" onclick="document.getElementById('sidebar').classList.toggle('open')">☰</button> ${escapeHtml(titulo)}</h1>
        <div class="tb-right"><span class="clock" id="clock"></span></div>
      </div>
      <div class="content">${contenido}</div>
    </div>
  </div>`;
}
function irNeg(pg){ STATE.pageNeg=pg; if(pg==='inventario')_invTab='insumos'; render(); const sb=document.getElementById('sidebar'); if(sb)sb.classList.remove('open'); }

// Pantallas que ve cada rol por defecto (si el super-admin no personalizó)
const PANTALLAS_POR_ROL={
  admin:  ['inicio','ventas','pedidos','catalogo','caja','cocina','citas','domicilios','inventario','clientes','reportes','contable','gastosneg','usuariosneg','confignegocio'],
  cajero: ['inicio','ventas','pedidos','caja','clientes','domicilios'],
  mesero: ['inicio','ventas','pedidos','clientes'],
  cocina: ['cocina','pedidos'],
  dueno:  ['inicio','caja','pedidos','reportes','contable','gastosneg','catalogo'],
  vendedor:['inicio','ventas','pedidos','catalogo','clientes']
};
// Filtra el menú lateral según el rol del usuario y sus pantallas personalizadas
function filtrarNavPorUsuario(nav){
  const u=STATE.user;
  // El supervisor (super-admin) ve todo
  if(u.esSupervisor) return nav;
  // Pantallas permitidas: las personalizadas o las del rol
  let permitidas;
  if(u.pantallas && u.pantallas.length){
    permitidas=u.pantallas.slice();
    // Traducir nombres de pantalla a ids del menú
    if(permitidas.includes('dashboard')) permitidas.push('inicio');
    if(permitidas.includes('catalogo')) permitidas.push('inventario');
  } else {
    permitidas=PANTALLAS_POR_ROL[u.rol]||PANTALLAS_POR_ROL.cajero;
  }
  // Recorrer y quedarnos con los grupos que tengan al menos un item visible
  const salida=[]; let grupoPend=null;
  nav.forEach(n=>{
    if(n.grupo){ grupoPend=n; return; }
    if(permitidas.includes(n.id)){
      if(grupoPend){ salida.push(grupoPend); grupoPend=null; }
      salida.push(n);
    }
  });
  return salida;
}

// Dashboard del negocio
function dashboardNeg(){
  const neg=STATE.negocio;
  const vs=misDatos('ventas').filter(v=>v.estado==='pagada');
  const t=new Date().toISOString().split('T')[0];
  const caja=misDatos('caja_actual')[0];
  // Ventas de hoy = jornada (caja abierta) o día calendario
  let hoy, tituloHoy='Ventas de Hoy';
  if(caja){ hoy=ventasDeLaJornada(true); tituloHoy='Ventas de la Jornada'; }
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
  const neg=STATE.negocio;
  const vs=misDatos('ventas').filter(v=>v.estado==='pagada');
  const t=new Date().toISOString().split('T')[0];  const hoy=vs.filter(v=>(v.fecha||'').startsWith(t));
  const totalHoy=hoy.reduce((a,v)=>a+v.total,0);
  const ticketProm=hoy.length?Math.round(totalHoy/hoy.length):0;
  // Comparativo con mismo día semana pasada
  const hace7=new Date(Date.now()-7*864e5).toISOString().split('T')[0];
  const ventasHace7=vs.filter(v=>(v.fecha||'').startsWith(hace7)).reduce((a,v)=>a+v.total,0);
  const cambio=ventasHace7>0?Math.round((totalHoy-ventasHace7)/ventasHace7*100):0;
  // Terceros
  const propinas=hoy.reduce((a,v)=>a+(v.propina||0),0);
  const domicilios=hoy.filter(v=>v.valorDom>0).length;
  const recargos=hoy.reduce((a,v)=>a+(v.recargo||0),0);
  // Más vendidos hoy
  const items={};
  hoy.forEach(v=>v.items.forEach(i=>{ items[i.nombre]=(items[i.nombre]||0)+i.qty; }));
  const top=Object.entries(items).sort((a,b)=>b[1]-a[1]).slice(0,6);
  // Gráfico 7 días
  const days=[];
  for(let i=6;i>=0;i--){ const d=new Date(Date.now()-i*864e5); const dk=d.toISOString().split('T')[0];
    days.push({lbl:d.toLocaleDateString('es-CO',{weekday:'short'}), tot:vs.filter(v=>(v.fecha||'').startsWith(dk)).reduce((a,v)=>a+v.total,0)}); }
  const mx7=Math.max(...days.map(d=>d.tot),1);
  // Gráfico 12 meses
  const meses=[];
  for(let i=11;i>=0;i--){ const d=new Date(); d.setMonth(d.getMonth()-i); const mk=d.toISOString().substring(0,7);
    meses.push({lbl:d.toLocaleDateString('es-CO',{month:'short'}), tot:vs.filter(v=>(v.fecha||'').substring(0,7)===mk).reduce((a,v)=>a+v.total,0)}); }
  const mxM=Math.max(...meses.map(m=>m.tot),1);
  const usaMeseros=neg.usaCocina;
  // Datos del mes en curso para exportar
  const mesActual=t.substring(0,7);
  const ventasMes=vs.filter(v=>(v.fecha||'').substring(0,7)===mesActual);
  const totalMes=ventasMes.reduce((a,v)=>a+v.total,0);
  const metodosMes={efectivo:0,banco:0,tarjeta:0};
  ventasMes.forEach(v=>{ if(metodosMes[v.metodo]!==undefined) metodosMes[v.metodo]+=v.total; });
  const itemsMes={};
  ventasMes.forEach(v=>v.items.forEach(i=>{ itemsMes[i.nombre]=(itemsMes[i.nombre]||0)+i.qty; }));
  const topMes=Object.entries(itemsMes).sort((a,b)=>b[1]-a[1]).slice(0,20);
  window._reportesData={nombreMes:nombreMesLargo(mesActual), mes:mesActual, totalHoy, hoy, ticketProm, cambio, ventasHace7, days, meses, totalMes, ventasMes, metodosMes, topMes, propinas, domicilios, recargos};
  return `
    <div class="card" style="background:linear-gradient(135deg,rgba(1,195,142,.06),transparent);">
      <div class="flex-between" style="flex-wrap:wrap;gap:12px;">
        <div><div class="card-title" style="margin:0;">${ic('report')} Reportes de ${escapeHtml(neg.nombre)}</div>
        <p class="muted">Resumen del día, comparativos y ventas por período.</p></div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-sm" onclick="exportarReportesExcel()">Excel</button>
          <button class="btn btn-gold btn-sm" onclick="exportarReportesPDF()">🖨️ PDF / Imprimir</button>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">${ic('report')} Resumen del día (hoy)</div>
      <div class="stats-grid">
        <div class="stat-card green"><div class="stat-label">Vendido hoy</div><div class="stat-value">${fmtMoney(totalHoy)}</div><div class="stat-sub">${hoy.length} ventas</div></div>
        ${usaMeseros?`<div class="stat-card gold"><div class="stat-label">Propinas del día</div><div class="stat-value">${fmtMoney(propinas)}</div><div class="stat-sub">para los meseros</div></div>`:''}
        <div class="stat-card blue"><div class="stat-label">${usaMeseros?'Domicilios':'Pedidos'}</div><div class="stat-value">${domicilios||hoy.length}</div><div class="stat-sub">${recargos>0?'recargos: '+fmtMoney(recargos):'hoy'}</div></div>
      </div>
      ${top.length?`<div class="card-title" style="font-size:14px;margin-top:16px;">Más pedidos hoy</div>
      <div class="table-wrap"><table class="tbl"><tbody>${top.map(([n,q])=>`<tr><td>${escapeHtml(n)}</td><td style="text-align:right;"><strong>${q}</strong></td></tr>`).join('')}</tbody></table></div>`:''}
    </div>
    <div class="stats-grid">
      <div class="stat-card green"><div class="stat-label">Ventas hoy</div><div class="stat-value">${fmtMoney(totalHoy)}</div><div class="stat-sub">${hoy.length} transacciones</div></div>
      <div class="stat-card gold"><div class="stat-label">Ticket promedio</div><div class="stat-value">${fmtMoney(ticketProm)}</div></div>
      <div class="stat-card ${cambio>=0?'green':'red'}"><div class="stat-label">vs. mismo día semana pasada</div><div class="stat-value">${cambio>=0?'+':''}${cambio}%</div><div class="stat-sub">Hace 7 días: ${fmtMoney(ventasHace7)}</div></div>
    </div>
    <div class="grid-2">
      <div class="card"><div class="card-title">${ic('report')} Ventas por día (7 días)</div><div class="bar-chart">${days.map(d=>`<div class="bar-item"><div class="bar-val">${d.tot>0?(d.tot/1000).toFixed(0)+'k':''}</div><div class="bar-fill" style="height:${Math.max(4,(d.tot/mx7)*130)}px"></div><div class="bar-label">${d.lbl}</div></div>`).join('')}</div></div>
      <div class="card"><div class="card-title">${ic('report')} Ventas mensuales (12 meses)</div><div class="bar-chart">${meses.map(m=>`<div class="bar-item"><div class="bar-val">${m.tot>0?(m.tot/1000).toFixed(0)+'k':''}</div><div class="bar-fill" style="height:${Math.max(4,(m.tot/mxM)*130)}px"></div><div class="bar-label">${m.lbl}</div></div>`).join('')}</div></div>
    </div>`;
}
// Exportar reportes a PDF
function exportarReportesPDF(){
  const d=window._reportesData; if(!d){ toast('Abre primero los reportes','error'); return; }
  const neg=STATE.negocio;
  const html=`<div style="font-family:Arial,Helvetica,sans-serif;color:#000;max-width:800px;margin:0 auto;padding:18px;">
    <div style="text-align:center;border-bottom:2px solid #000;padding-bottom:10px;">
      ${neg.logo?`<img src="${neg.logo}" style="max-height:70px;margin-bottom:6px;">`:''}
      <div style="font-size:22px;font-weight:800;">${escapeHtml(neg.nombre)}</div>
      ${neg.nit?`<div style="font-size:12px;">NIT: ${escapeHtml(neg.nit)}</div>`:''}
      <div style="font-size:17px;font-weight:700;margin-top:6px;">Reporte de Ventas — ${escapeHtml(d.nombreMes)}</div>
      <div style="font-size:11px;color:#555;">Generado el ${new Date().toLocaleString('es-CO')}</div>
    </div>
    <h3 style="font-size:15px;margin-top:16px;border-bottom:1px solid #999;padding-bottom:3px;">Resumen de hoy</h3>
    <table style="width:100%;font-size:13px;border-collapse:collapse;">
      <tr><td style="padding:4px;">Vendido hoy</td><td style="text-align:right;font-weight:bold;">${fmtMoney(d.totalHoy)}</td></tr>
      <tr><td style="padding:4px;">Transacciones</td><td style="text-align:right;">${d.hoy.length}</td></tr>
      <tr><td style="padding:4px;">Ticket promedio</td><td style="text-align:right;">${fmtMoney(d.ticketProm)}</td></tr>
      <tr><td style="padding:4px;">vs. mismo día semana pasada</td><td style="text-align:right;">${d.cambio>=0?'+':''}${d.cambio}% (${fmtMoney(d.ventasHace7)})</td></tr>
      ${d.propinas>0?`<tr><td style="padding:4px;">Propinas del día</td><td style="text-align:right;">${fmtMoney(d.propinas)}</td></tr>`:''}
    </table>
    <h3 style="font-size:15px;margin-top:16px;border-bottom:1px solid #999;padding-bottom:3px;">Mes de ${escapeHtml(d.nombreMes)}</h3>
    <table style="width:100%;font-size:13px;border-collapse:collapse;">
      <tr><td style="padding:4px;">Total vendido en el mes</td><td style="text-align:right;font-weight:bold;">${fmtMoney(d.totalMes)}</td></tr>
      <tr><td style="padding:4px;">Número de ventas</td><td style="text-align:right;">${d.ventasMes.length}</td></tr>
      <tr><td style="padding:4px;color:#555;">· Efectivo</td><td style="text-align:right;color:#555;">${fmtMoney(d.metodosMes.efectivo)}</td></tr>
      <tr><td style="padding:4px;color:#555;">· Banco</td><td style="text-align:right;color:#555;">${fmtMoney(d.metodosMes.banco)}</td></tr>
      <tr><td style="padding:4px;color:#555;">· Tarjeta</td><td style="text-align:right;color:#555;">${fmtMoney(d.metodosMes.tarjeta)}</td></tr>
    </table>
    <h3 style="font-size:15px;margin-top:16px;border-bottom:1px solid #999;padding-bottom:3px;">Ventas por día (últimos 7 días)</h3>
    <table style="width:100%;font-size:12px;border-collapse:collapse;">
      <tr style="background:#eee;"><th style="padding:5px;text-align:left;">Día</th><th style="padding:5px;text-align:right;">Vendido</th></tr>
      ${d.days.map(x=>`<tr style="border-bottom:1px solid #ddd;"><td style="padding:4px;">${x.lbl}</td><td style="padding:4px;text-align:right;">${fmtMoney(x.tot)}</td></tr>`).join('')}
    </table>
    ${d.topMes.length?`<h3 style="font-size:15px;margin-top:16px;border-bottom:1px solid #999;padding-bottom:3px;">Más vendidos del mes</h3>
    <table style="width:100%;font-size:12px;border-collapse:collapse;">
      <tr style="background:#eee;"><th style="padding:5px;text-align:left;">Producto</th><th style="padding:5px;text-align:right;">Unidades</th></tr>
      ${d.topMes.map(([n,q])=>`<tr style="border-bottom:1px solid #ddd;"><td style="padding:4px;">${escapeHtml(n)}</td><td style="padding:4px;text-align:right;font-weight:600;">${q}</td></tr>`).join('')}
    </table>`:''}
    <div style="margin-top:26px;text-align:center;font-size:10px;color:#666;border-top:1px dashed #999;padding-top:8px;">
      Software administrativo por WALLACE COMPANY SYSTEM · wallacecompany11@gmail.com
    </div>
  </div>`;
  const w=window.open('','_blank','width=850,height=680');
  w.document.write('<html><head><title>Reporte '+d.nombreMes+'</title><meta charset="utf-8"><style>@page{size:letter;margin:12mm;}body{margin:0;}</style></head><body>'+html+'</body></html>');
  w.document.close(); setTimeout(()=>w.print(),350);
}
function exportarReportesExcel(){
  const d=window._reportesData; if(!d){ toast('Abre primero los reportes','error'); return; }
  const filas=[
    ['REPORTE DE VENTAS',d.nombreMes],[''],
    ['RESUMEN DE HOY',''],
    ['Vendido hoy',d.totalHoy],['Transacciones',d.hoy.length],['Ticket promedio',d.ticketProm],
    [''],['MES',''],
    ['Total del mes',d.totalMes],['Ventas del mes',d.ventasMes.length],
    ['Efectivo',d.metodosMes.efectivo],['Banco',d.metodosMes.banco],['Tarjeta',d.metodosMes.tarjeta],
    [''],['VENTAS POR DÍA (7 días)',''],
    ...d.days.map(x=>[x.lbl,x.tot]),
    [''],['MÁS VENDIDOS DEL MES','Unidades'],
    ...d.topMes.map(([n,q])=>[n,q])
  ];
  descargarCSV(filas,'reportes-'+d.mes+'.csv');
}
// ============================================================
// ============================================================
//  LOGIN VIEW
// ============================================================
function vistaLogin(){
  return `
  <div class="login-screen">
    <div class="login-box">
      <div class="login-emblem">${window.WALLACE_LOGO||''}</div>
      <div class="login-logo">Wallace<span> System</span></div>
      <p class="login-sub">Sistema para restaurantes y todo tipo de negocios</p>
      <div class="form-row"><label>Usuario</label><input id="l-user" placeholder="usuario" onkeydown="if(event.key==='Enter')hacerLogin()"></div>
      <div class="form-row"><label>Contraseña</label><input id="l-pass" type="password" placeholder="••••••" onkeydown="if(event.key==='Enter')hacerLogin()"></div>
      <button class="btn btn-gold btn-block" onclick="hacerLogin()">Entrar</button>
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
    if(STATE.page.startsWith('usuarios-negocio:')){ app.innerHTML=pantallaUsuariosNegocio(STATE.page.split(':')[1]); return; }
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
