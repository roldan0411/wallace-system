// ============================================================
//  INTERFAZ · Componentes comunes
//  Iconos, vocabulario del negocio (pProd, pPedido…), avisos (toast) y modales.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/README.md
// ============================================================
import { STATE, escapeHtml } from './estado.js';
import { logAudit } from '../usuarios/auditoria.js';


// ============================================================
//  ICONOS
// ============================================================
export const ICONS = {
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
// Foto del producto si es una imagen válida (dominio/inventario.js); si no, su ícono
export function fotoProducto(p, icono){
  return (p && Dominio.inventario.imagenValida(p.imagen)) ? '<img src="'+escapeHtml(p.imagen)+'" alt="">' : ic(icono||'box');
}
// Logo del negocio como <img>, solo si es una imagen válida (S8); si no, '' (el que llama pone
// su alternativa con ||). atributos: texto FIJO del código (clases, estilos de impresión).
export function logoNegocio(neg, atributos){
  if(!neg || !Dominio.negocio.logoValido(neg.logo)) return '';
  return '<img src="'+escapeHtml(neg.logo)+'"'+(atributos?' '+atributos:'')+'>';
}
// Lee un archivo de imagen y lo reduce a "max" px de ancho/alto como JPEG (data: URL)
export function reducirImagen(archivo, max, calidad){
  return new Promise((ok, mal)=>{
    if(!archivo || !/^image\//.test(archivo.type||'')){ mal(new Error('El archivo no es una imagen')); return; }
    const lector=new FileReader();
    lector.onerror=()=>mal(new Error('No se pudo leer la imagen'));
    lector.onload=e=>{
      const img=new Image();
      img.onerror=()=>mal(new Error('La imagen no se pudo abrir'));
      img.onload=()=>{
        let w=img.width, h=img.height; const k=Math.min(1, max/Math.max(w,h)); w=Math.round(w*k); h=Math.round(h*k);
        const lienzo=document.createElement('canvas'); lienzo.width=w; lienzo.height=h;
        const cx=lienzo.getContext('2d'); cx.fillStyle='#ffffff'; cx.fillRect(0,0,w,h); cx.drawImage(img,0,0,w,h);
        ok(lienzo.toDataURL('image/jpeg', calidad||0.72));
      };
      img.src=e.target.result;
    };
    lector.readAsDataURL(archivo);
  });
}
export function ic(n){ return ICONS[n]||ICONS.dashboard; }

// ---- Vocabulario dinámico por negocio ----
// Cada empresa define cómo llama a sus productos (Plato, Producto, Artículo,
// Servicio…). Estos helpers devuelven esa palabra para usarla en TODO el sistema.
export function pProd(cap){ const n=STATE.negocio; let p=(n&&n.palabraProducto)?n.palabraProducto:'Producto'; return cap?p:p.toLowerCase(); }
export function pProds(cap){ const n=STATE.negocio; let p=(n&&n.palabraProductos)?n.palabraProductos:'Productos'; return cap?p:p.toLowerCase(); }
export function pPedido(cap){ const n=STATE.negocio; let p=(n&&n.palabraPedido)?n.palabraPedido:'Pedido'; return cap?p:p.toLowerCase(); }
// Plural del pedido/venta según su terminación (vocal → +s, consonante → +es)
export function pPedidos(cap){
  const base=pPedido(true);
  const ult=base.slice(-1).toLowerCase();
  const plural='aeiou'.indexOf(ult)>-1 ? base+'s' : base+'es';
  return cap?plural:plural.toLowerCase();
}
export function pPersonal(cap){ const n=STATE.negocio; let p=(n&&n.palabraPersonal)?n.palabraPersonal:'Personal'; return cap?p:p.toLowerCase(); }

// ============================================================
//  AVISOS Y MODALES
// ============================================================
export function toast(msg, tipo){
  const cont=document.getElementById('toasts');
  if(!cont){ console.log(msg); return; }
  const t=document.createElement('div');
  t.className='toast '+(tipo||'info');
  t.textContent=msg;
  cont.appendChild(t);
  setTimeout(()=>{ t.classList.add('salir'); setTimeout(()=>t.remove(),300); }, 3200);
}

export function abrirModal(cfg){
  const cont=document.getElementById('modal-container');
  if(!cont) return;
  const campos=(cfg.campos||[]).map(c=>{
    if(c.tipo==='select'){
      return `<div class="m-row"><label>${escapeHtml(c.label)}</label>
        <select id="m-${escapeHtml(c.id)}">${(c.opciones||[]).map(o=>`<option value="${escapeHtml(o.valor)}" ${o.valor===c.valor?'selected':''}>${escapeHtml(o.label)}</option>`).join('')}</select></div>`;
    }
    if(c.tipo==='textarea'){
      return `<div class="m-row"><label>${escapeHtml(c.label)}</label>
        <textarea id="m-${escapeHtml(c.id)}" rows="3" placeholder="${escapeHtml(c.placeholder||'')}">${escapeHtml(c.valor||'')}</textarea></div>`;
    }
    return `<div class="m-row"><label>${escapeHtml(c.label)}</label>
      <input id="m-${escapeHtml(c.id)}" type="${escapeHtml(c.tipo||'text')}" value="${escapeHtml(c.valor||'')}" placeholder="${escapeHtml(c.placeholder||'')}"></div>`;
  }).join('');
  cont.innerHTML=`<div class="modal-fondo" data-click="cerrarModal()"></div>
    <div class="modal">
      <div class="modal-cab"><h3>${escapeHtml(cfg.titulo||'')}</h3>
        <button class="modal-x" data-click="cerrarModal()">×</button></div>
      <div class="modal-cuerpo">${campos}${cfg.extraHTML||''}</div>
      <div class="modal-pie">
        <button class="btn btn-ghost" data-click="cerrarModal()">Cancelar</button>
        <button class="btn btn-gold" id="modal-ok">${escapeHtml(cfg.textoBoton||'Guardar')}</button>
      </div>
    </div>`;
  cont.classList.add('activo');
  _modalCancelar=typeof cfg.onCancelar==='function'?cfg.onCancelar:null;
  const ok=document.getElementById('modal-ok');
  if(ok) ok.onclick=()=>{
    const datos={};
    for(const c of (cfg.campos||[])){
      const el=document.getElementById('m-'+c.id);
      datos[c.id]=el?el.value:'';
      // Un obligatorio con solo espacios también falta (antes pasaba y quedaba un nombre en blanco)
      if(c.requerido && !String(datos[c.id]).trim()){ toast('Falta: '+c.label,'error'); if(el) el.focus(); return; }
    }
    if(cfg.onGuardar){ try{ cfg.onGuardar(datos); }catch(e){ reportarError('la ventana "'+(cfg.titulo||'')+'"', e); } }
  };
  setTimeout(()=>{
    const f=cont.querySelector('input,select,textarea'); if(f) f.focus();
    if(typeof cfg.onAbrir==='function') cfg.onAbrir();
  },50);
}
export let _modalCancelar=null;   // se llama una vez al cerrar el modal (cancelar, ×, fondo o guardar)
export function cerrarModal(){
  const cont=document.getElementById('modal-container');
  if(cont){ cont.classList.remove('activo'); cont.innerHTML=''; }
  const f=_modalCancelar; _modalCancelar=null;
  if(f){ try{ f(); }catch(e){} }
}
// Pregunta que se hace un momento después de otra acción (p. ej. "¿Imprimir factura?" tras
// cobrar). Si para entonces ya hay otro modal abierto, NO lo tapa (F16): lo impreso se
// puede repetir desde Reimpresiones, lo que se estaba escribiendo en el otro modal no.
export function preguntarDespues(mensaje, alConfirmar, textoBoton, ms){
  cuandoNoHayaVentana(()=>confirmarModal(mensaje, alConfirmar, textoBoton), ms||400);
}
// Abre una ventana cuando no haya otra abierta (nunca tapa ni reemplaza la que está a la vista).
// Espera hasta ~2 minutos; si sigue ocupado, se descarta (no aparece una ventana vieja de sorpresa).
export function cuandoNoHayaVentana(abrir, ms){
  let intentos=0;
  const probar=()=>{
    const cont=document.getElementById('modal-container');
    if(cont && cont.classList.contains('activo')){ if(++intentos<400) setTimeout(probar, 300); return; }
    abrir();
  };
  setTimeout(probar, ms||400);
}
// C2: un error que la app atrapa (para no dejar la pantalla en blanco) no debe quedar
// invisible. Va a la consola, se avisa a la persona y queda en la Auditoría del negocio.
// Cada error distinto se reporta una sola vez por sesión.
export const _erroresReportados=new Set();
export function reportarError(donde, e){
  console.error('Error en '+donde, e);
  const msg=String((e && e.message) || e || 'desconocido');
  const clave=donde+'|'+msg;
  if(_erroresReportados.has(clave)) return;
  _erroresReportados.add(clave);
  try{ logAudit('Error del sistema', (donde+': '+msg).slice(0,300)); }catch(x){}
  toast('Ocurrió un error en '+donde+'. Quedó registrado en la auditoría.','error');
}
export function confirmarModal(mensaje, alConfirmar, textoBoton){
  abrirModal({titulo:'Confirmar', textoBoton:textoBoton||'Sí, continuar', campos:[],
    extraHTML:`<p class="fs-15 lh-1_6 ws-pre-line">${escapeHtml(mensaje)}</p>`,
    onGuardar:()=>{ cerrarModal(); if(alConfirmar) alConfirmar(); }});
}
