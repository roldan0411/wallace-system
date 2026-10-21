// ============================================================
//  INTERFAZ · Tema por negocio
//  Colores y modo claro/oscuro del negocio.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/11-business-settings/11-business-settings.md
// ============================================================


// ============================================================
//  TEMA POR NEGOCIO (oscuro neón / claro + color a gusto)
// ============================================================
export function _hexRgb(hex){
  hex=(hex||'').replace('#','');
  if(hex.length===3) hex=hex.split('').map(c=>c+c).join('');
  const n=parseInt(hex,16);
  if(isNaN(n)||hex.length!==6) return [1,195,142];
  return [(n>>16)&255,(n>>8)&255,n&255];
}
export function _rgbHex(r,g,b){
  const h=x=>Math.max(0,Math.min(255,Math.round(x))).toString(16).padStart(2,'0');
  return '#'+h(r)+h(g)+h(b);
}
export function _aclarar(hex,p){ const [r,g,b]=_hexRgb(hex); return _rgbHex(r+(255-r)*p, g+(255-g)*p, b+(255-b)*p); }
export function _oscurecer(hex,p){ const [r,g,b]=_hexRgb(hex); return _rgbHex(r*(1-p), g*(1-p), b*(1-p)); }
export function aplicarTema(neg){
  const b=document.body; if(!b) return;
  const claro = !!(neg && neg.tema==='claro');
  b.classList.toggle('tema-claro', claro);
  let base=(neg && neg.colorTema && /^#[0-9a-fA-F]{6}$/.test(neg.colorTema)) ? neg.colorTema : '#01c38e';
  let [r,g,bl]=_hexRgb(base);
  let lum=(0.299*r+0.587*g+0.114*bl)/255;
  // Si el color elegido es casi blanco, las letras de acento desaparecen sobre
  // fondos claros. Lo oscurecemos hasta un nivel legible antes de usarlo.
  if(lum>0.82){ base=_oscurecer(base,.35); [r,g,bl]=_hexRgb(base); lum=(0.299*r+0.587*g+0.114*bl)/255; }
  b.style.setProperty('--acento', base);
  // --acento-c (acento de texto): en claro va más oscuro; en oscuro, más claro.
  b.style.setProperty('--acento-c', claro ? _oscurecer(base,.15) : _aclarar(base,.25));
  b.style.setProperty('--acento-o', _oscurecer(base,.22));
  b.style.setProperty('--acento-rgb', r+','+g+','+bl);
  b.style.setProperty('--acento-txt', lum>0.55 ? '#141821' : '#ffffff');
}
export function quitarTema(){
  const b=document.body; if(!b) return;
  b.classList.remove('tema-claro');
  ['--acento','--acento-c','--acento-o','--acento-rgb','--acento-txt'].forEach(v=>b.style.removeProperty(v));
}
