// ============================================================
//  INTERFAZ · Eventos delegados (fase 8)
//  El HTML generado ya no lleva onclick="…": lleva data-click="accion(args)"
//  (y data-input, data-change, data-keydown, data-enter, data-focus,
//  data-blur, data-mousedown, data-toggle). Un solo escuchador por tipo de
//  evento en el documento busca el atributo y llama a la acción.
//
//  Sin eval: el texto se interpreta como UNA llamada con argumentos simples:
//  'texto', "texto", números, true/false/null, this, this.value,
//  this.checked, this.open, this.dataset.x, event. Algo distinto es un error
//  (se reporta con reportarError). Para pasar textos del usuario (pueden
//  traer comillas) usar data-x="${escapeHtml(v)}" y this.dataset.x.
//
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado. Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/-03-architecture/-03-architecture.md
// ============================================================
import { reportarError } from './componentes.js';

// Evento del navegador → atributo; "sube" = se buscan también los ancestros (burbujeo)
export const EVENTOS_DELEGADOS=[
  {ev:'click',     attr:'data-click',     sube:true},
  {ev:'mousedown', attr:'data-mousedown', sube:true},
  {ev:'input',     attr:'data-input',     sube:true},
  {ev:'change',    attr:'data-change',    sube:true},
  {ev:'keydown',   attr:'data-keydown',   sube:true},
  {ev:'focusin',   attr:'data-focus',     sube:false},   // focus/blur no burbujean: solo el propio elemento
  {ev:'focusout',  attr:'data-blur',      sube:false},
  {ev:'toggle',    attr:'data-toggle',    sube:false}    // <details>: se escucha en captura
];

// Dónde se buscan las acciones: en lo que exportan los módulos de la interfaz
// (el espacio de nombres que arma ui/manifiesto.js). Solo funciones, nunca window.
let _acciones=null;
export function accionDelegada(nombre){
  const f=_acciones && _acciones[nombre];
  return typeof f==='function' ? f : undefined;
}

// Argumentos de "accion(a, b, …)": solo valores simples, nunca código
export function argumentosDelegados(txt, el, ev){
  const out=[]; let i=0;
  const espacio=()=>{ while(i<txt.length && /\s/.test(txt[i])) i++; };
  while(true){
    espacio(); if(i>=txt.length) break;
    const c=txt[i];
    if(c==="'" || c==='"'){
      let v=''; i++;
      while(i<txt.length && txt[i]!==c){ if(txt[i]==='\\' && i+1<txt.length){ i++; } v+=txt[i]; i++; }
      if(txt[i]!==c) throw new Error('texto sin cerrar');
      i++; out.push(v);
    } else {
      const m=/^[^,]+/.exec(txt.slice(i)); const tok=m[0].trim(); i+=m[0].length;
      if(/^-?\d+(\.\d+)?$/.test(tok)) out.push(parseFloat(tok));
      else if(tok==='true') out.push(true); else if(tok==='false') out.push(false);
      else if(tok==='null') out.push(null); else if(tok==='undefined') out.push(undefined);
      else if(tok==='this') out.push(el); else if(tok==='event') out.push(ev);
      else if(/^this\.dataset\.[\w$]+$/.test(tok)) out.push(el.dataset[tok.slice(13)]);
      else if(/^this\.[\w$]+$/.test(tok)) out.push(el[tok.slice(5)]);
      else throw new Error('argumento no permitido: '+tok);
    }
    espacio();
    if(i<txt.length){ if(txt[i]!==',') throw new Error('se esperaba una coma'); i++; }
  }
  return out;
}
export function ejecutarDelegado(codigo, el, ev){
  try{
    const m=/^\s*([A-Za-z_$][\w$]*)\s*\(([\s\S]*)\)\s*;?\s*$/.exec(codigo);
    if(!m) throw new Error('no es una llamada: '+codigo);
    const fn=accionDelegada(m[1]);
    if(typeof fn!=='function') throw new Error('la acción "'+m[1]+'" no existe');
    return fn.apply(el, argumentosDelegados(m[2], el, ev));
  }catch(e){ reportarError('la acción '+codigo.slice(0,60), e); }
}
// Lo llama ui/manifiesto.js (cargarInterfaz) cuando ya cargaron todos los módulos
export function instalarEventosDelegados(acciones){
  if(_acciones){ _acciones=acciones; return; }   // ya instalados: solo se cambia de dónde salen las acciones
  _acciones=acciones;
  EVENTOS_DELEGADOS.forEach(({ev, attr, sube})=>{
    document.addEventListener(ev, e=>{
      for(let el=e.target; el && el.nodeType===1; el=sube?el.parentElement:null){
        // Enter en un campo: data-enter (y se evita el envío o salto por defecto)
        if(ev==='keydown' && e.key==='Enter' && el.hasAttribute('data-enter')){ e.preventDefault(); ejecutarDelegado(el.getAttribute('data-enter'), el, e); }
        const c=el.getAttribute(attr);
        if(c){ ejecutarDelegado(c, el, e); if(e.cancelBubble) break; }   // stopPropagation() corta como antes
      }
    }, ev==='toggle');
  });
}
