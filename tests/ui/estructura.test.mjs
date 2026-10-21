// Estructura de la interfaz: módulos ES en src/adaptadores/entrada/ui/ (fase 8).
// Se revisa sin navegador, con un analizador de JavaScript (acorn), lo que un
// error de importación o de nombre solo mostraría al usarse la pantalla. npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, posix } from 'node:path';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import { ARCHIVOS_UI } from '../../src/adaptadores/entrada/ui/manifiesto.js';

const RAIZ=new URL('../../src/adaptadores/entrada/ui/', import.meta.url);
const raizRuta=decodeURIComponent(RAIZ.pathname).replace(/^\/([A-Za-z]:)/,'$1');
const leer=a=>readFileSync(new URL(a, RAIZ),'utf8');
const ARCH=ARCHIVOS_UI.map(a=>({nombre:a, src:leer(a)}));
ARCH.forEach(f=>{ f.ast=acorn.parse(f.src,{ecmaVersion:'latest', sourceType:'module', locations:true}); });

// Nombres que publica el puente en window (se leen del propio puente-legado.js)
function nombresPuente(){
  const ast=acorn.parse(leer('puente-legado.js'),{ecmaVersion:'latest', sourceType:'module'});
  const n=new Set();
  walk.simple(ast,{
    AssignmentExpression(a){ if(a.left.type==='MemberExpression' && a.left.object.name==='win') n.add(a.left.property.name); },
    CallExpression(c){
      if(c.callee.name==='propiedad' && c.arguments[0]) n.add(c.arguments[0].value);
      if(c.callee.type==='MemberExpression' && c.callee.object.name==='Object' && c.callee.property.name==='assign' && c.arguments[1] && c.arguments[1].type==='ObjectExpression')
        c.arguments[1].properties.forEach(p=>n.add(p.key.name||p.key.value));
    }
  });
  return n;
}
const PUENTE=nombresPuente();
const NAVEGADOR=new Set(['window','document','localStorage','sessionStorage','navigator','location','console','setTimeout','clearTimeout',
 'setInterval','clearInterval','requestAnimationFrame','MutationObserver','Promise','JSON','Math','Date','Object','Array','String','Number',
 'Boolean','parseInt','parseFloat','isNaN','isFinite','Error','RegExp','Map','Set','encodeURIComponent','decodeURIComponent','escape','unescape',
 'alert','confirm','prompt','FileReader','Image','Blob','URL','AudioContext','webkitAudioContext','Infinity','NaN','undefined','performance',
 'Intl','Symbol','Uint8Array','fetch','atob','btoa','getComputedStyle','screen','history','globalThis','structuredClone','arguments','crypto',
 'Event','Proxy']);

// Declaraciones de nivel superior (exportadas o no) e importaciones de cada módulo
const decl={};   // nombre -> archivo
const repetidos=[];
ARCH.forEach(f=>{
  f.propios=new Set(); f.importados=new Map();   // nombre -> {archivo, nodo}
  f.ast.body.forEach(n=>{
    const d=n.type==='ExportNamedDeclaration'?n.declaration:n;
    if(n.type==='ImportDeclaration'){
      const archivo=posix.join(posix.dirname(f.nombre), n.source.value);
      n.specifiers.forEach(s=>f.importados.set(s.local.name, {archivo, nombre:s.imported?s.imported.name:null, linea:n.loc.start.line}));
      return;
    }
    if(!d) return;
    const nombres=d.type==='FunctionDeclaration'?[d.id.name]:d.type==='VariableDeclaration'?d.declarations.map(x=>x.id.name):[];
    nombres.forEach(x=>{ f.propios.add(x); if(decl[x]) repetidos.push(x+' ('+decl[x]+' y '+f.nombre+')'); else decl[x]=f.nombre; });
  });
});

test('el manifiesto lista todos los módulos de la interfaz, sin sobrantes', ()=>{
  const enDisco=[];
  (function rec(dir){ readdirSync(dir).forEach(x=>{ const r=join(dir,x); if(statSync(r).isDirectory()) rec(r); else if(x.endsWith('.js')) enDisco.push(relative(raizRuta,r).replace(/\\/g,'/')); }); })(raizRuta);
  const esperados=enDisco.filter(x=>x!=='manifiesto.js' && x!=='puente-legado.js').sort();
  assert.deepEqual([...ARCHIVOS_UI].sort(), esperados);
  assert.equal(new Set(ARCHIVOS_UI).size, ARCHIVOS_UI.length);
});
test('ningún nombre se declara en dos módulos ni tapa uno del puente', ()=>{
  // Las acciones de data-click y window.WS buscan por nombre: debe ser único
  assert.deepEqual(repetidos, []);
  assert.deepEqual(Object.keys(decl).filter(x=>PUENTE.has(x)), []);
});
test('cada import trae un nombre que ese módulo exporta, sin imports de más ni repetidos', ()=>{
  const malos=[];
  ARCH.forEach(f=>{
    f.importados.forEach((imp, local)=>{
      const donde=f.nombre+':'+imp.linea+' ';
      if(!ARCHIVOS_UI.includes(imp.archivo)) malos.push(donde+'importa de '+imp.archivo+' (no está en el manifiesto)');
      else if(imp.nombre===null || imp.nombre!==local) malos.push(donde+local+': usar import { nombre } sin renombrar');
      else if(decl[local]!==imp.archivo) malos.push(donde+local+' no lo exporta '+imp.archivo+(decl[local]?' (está en '+decl[local]+')':''));
      if(f.propios.has(local)) malos.push(donde+local+' se importa y se declara');
    });
    // un import sin usar: el nombre no aparece fuera de las líneas import
    const usos=new Set();
    f.ast.body.filter(n=>n.type!=='ImportDeclaration').forEach(n=>walk.full(n, x=>{ if(x.type==='Identifier') usos.add(x.name); }));
    f.importados.forEach((imp, local)=>{ if(!usos.has(local)) malos.push(f.nombre+':'+imp.linea+' importa '+local+' y no lo usa'); });
  });
  assert.deepEqual(malos, []);
});
test('ningún módulo asigna una variable importada (es de solo lectura: usar su fijarX)', ()=>{
  const malos=[];
  ARCH.forEach(f=>walk.full(f.ast, n=>{
    const t=n.type==='AssignmentExpression'?n.left:n.type==='UpdateExpression'?n.argument:null;
    if(t && t.type==='Identifier' && f.importados.has(t.name)) malos.push(f.nombre+':'+n.loc.start.line+' asigna '+t.name);
  }));
  assert.deepEqual(malos, []);
});
test('al cargar, ningún módulo ejecuta código de otro (solo declara)', ()=>{
  // Con importaciones circulares lo de otro módulo puede no estar evaluado aún
  const cruces=[];
  ARCH.forEach(f=>f.ast.body.forEach(n=>{
    const d=n.type==='ExportNamedDeclaration'?n.declaration:n;
    if(!d || d.type==='FunctionDeclaration' || d.type==='ImportDeclaration') return;
    walk.recursive(d, null, {
      Function(){},   // lo que está dentro de funciones corre después, no al cargar
      Identifier(id){ if(f.importados.has(id.name)) cruces.push(f.nombre+':'+id.loc.start.line+' usa '+id.name+' ('+f.importados.get(id.name).archivo+')'); }
    });
  }));
  assert.deepEqual(cruces, []);
});

// Identificadores libres: todo lo que se usa debe estar declarado, importado o venir del puente
function nombresPatron(p, out){
  if(!p) return;
  if(p.type==='Identifier') out.push(p.name);
  else if(p.type==='ObjectPattern') p.properties.forEach(pr=>nombresPatron(pr.type==='RestElement'?pr.argument:pr.value, out));
  else if(p.type==='ArrayPattern') p.elements.forEach(e=>nombresPatron(e, out));
  else if(p.type==='AssignmentPattern') nombresPatron(p.left, out);
  else if(p.type==='RestElement') nombresPatron(p.argument, out);
}
function localesDe(fn){
  const s=new Set(), ps=[];
  fn.params.forEach(p=>nombresPatron(p,ps)); ps.forEach(x=>s.add(x));
  if(fn.id && fn.type!=='FunctionDeclaration') s.add(fn.id.name);
  walk.recursive(fn.body, null, {
    Function(f){ if(f.type==='FunctionDeclaration' && f.id) s.add(f.id.name); },
    VariableDeclaration(v,st,c){ v.declarations.forEach(d=>{ const o=[]; nombresPatron(d.id,o); o.forEach(x=>s.add(x)); if(d.init) c(d.init,st); }); },
    CatchClause(cc,st,c){ const o=[]; nombresPatron(cc.param,o); o.forEach(x=>s.add(x)); c(cc.body,st); }
  });
  return s;
}
test('no hay identificadores sin declarar ni sin importar (serían ReferenceError al usarse)', ()=>{
  const libres=[];
  const revisar=(nodo, scopes, archivo, conocidos)=>walk.recursive(nodo, scopes, {
    Function(f, sc){ if(f.body) revisar(f.body, [...sc, localesDe(f)], archivo, conocidos); },
    Identifier(id, sc){ if(!conocidos.has(id.name) && !sc.some(s=>s.has(id.name))) libres.push(archivo+':'+id.loc.start.line+' '+id.name); },
    MemberExpression(m, sc, c){ c(m.object, sc); if(m.computed) c(m.property, sc); },
    Property(p, sc, c){ if(p.computed) c(p.key, sc); c(p.value, sc); },
    VariableDeclaration(v, sc, c){ v.declarations.forEach(d=>{ if(d.init) c(d.init, sc); }); },
    CatchClause(cc, sc, c){ c(cc.body, sc); },
    LabeledStatement(l, sc, c){ c(l.body, sc); }, BreakStatement(){}, ContinueStatement(){},
    ImportDeclaration(){}
  });
  ARCH.forEach(f=>{
    const conocidos=new Set([...f.propios, ...f.importados.keys(), ...PUENTE, ...NAVEGADOR]);
    f.ast.body.forEach(n=>revisar(n.type==='ExportNamedDeclaration'?n.declaration:n, [new Set()], f.nombre, conocidos));
  });
  assert.deepEqual(libres, []);
});

// Valor de cada atributo data-click="…" (o data-click=\"…\" dentro de un texto JS):
// se lee hasta su comilla de cierre saltando los ${…} de la plantilla
function atributosDelegados(src){
  const out=[]; const re=/data-(?:click|input|change|keydown|enter|blur|focus|mousedown|toggle)=(\\?)(["'])/g; let m;
  while((m=re.exec(src))){
    const cierre=m[1]+m[2]; let i=m.index+m[0].length, prof=0, cod='';
    for(;i<src.length;i++){
      if(src[i]==='$' && src[i+1]==='{'){ prof++; cod+='${'; i++; continue; }
      if(prof){ if(src[i]==='{') prof++; if(src[i]==='}') prof--; cod+=src[i]; continue; }
      if(src.startsWith(cierre,i) && (cierre.length===2 || src[i-1]!=='\\')) break;
      cod+=src[i];
    }
    out.push({cod, linea:src.slice(0,m.index).split('\n').length});
  }
  return out;
}
// eventos.js documenta la sintaxis en su comentario: no es HTML generado
const PLANTILLAS=ARCH.filter(f=>f.nombre!=='nucleo/eventos.js');
test('las acciones de data-click/data-input/… del HTML generado existen (exportadas) y tienen argumentos simples', ()=>{
  // Las acciones salen SOLO de lo que exportan los módulos (nucleo/eventos.js), no del puente
  const conocidos=new Set(Object.keys(decl));
  const rotos=[];
  const ARG=/^(?:'[^']*'|"[^"]*"|-?\d+(?:\.\d+)?|X|true|false|null|undefined|event|this(?:\.dataset)?(?:\.[\w$]+)?)$/;
  PLANTILLAS.forEach(f=>atributosDelegados(f.src).forEach(({cod, linea})=>{
    const donde=f.nombre+':'+linea;
    if(/^\$\{/.test(cod)){   // la plantilla elige la función: cada opción debe existir
      [...cod.matchAll(/'([A-Za-z_$][\w$]*)\(/g)].forEach(x=>{ if(!conocidos.has(x[1])) rotos.push(donde+' '+x[1]+' no existe'); });
      return;
    }
    // ${…} se vuelve un valor fijo y \' una comilla, como queda en el HTML
    const plano=cod.replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g,'X').replace(/\\'/g,"'").trim();
    const k=/^([A-Za-z_$][\w$]*)\(([\s\S]*)\)$/.exec(plano);
    if(!k){ rotos.push(donde+' no es una llamada: '+cod); return; }
    if(!conocidos.has(k[1])) rotos.push(donde+' '+k[1]+' no existe');
    const args=k[2].match(/'[^']*'|"[^"]*"|[^,]+/g)||[];
    args.map(a=>a.trim()).filter(a=>a && a!==',').forEach(a=>{ if(!ARG.test(a)) rotos.push(donde+' argumento no permitido «'+a+'» en '+cod); });
  }));
  assert.deepEqual(rotos, []);
});
test('no quedan manejadores en línea (onclick="…") en las plantillas de pantalla', ()=>{
  const quedan=[];
  PLANTILLAS.forEach(f=>{ const re=/\son(?:click|input|change|keydown|keyup|blur|focus|mousedown|toggle|submit)=\\?["']/g; let m;
    while((m=re.exec(f.src))) quedan.push(f.nombre+':'+f.src.slice(0,m.index).split('\n').length); });
  assert.deepEqual(quedan, []);
});
test('existen los nombres de la interfaz que usa src/arranque.js (ganchos e inicio)', ()=>{
  const arranque=readFileSync(new URL('../../src/arranque.js', import.meta.url),'utf8');
  const usadas=[...new Set([...arranque.matchAll(/\bui\.([A-Za-z_$][\w$]*)/g)].map(m=>m[1]))];
  assert.ok(usadas.includes('iniciarInterfaz'));
  usadas.forEach(x=>assert.ok(decl[x], 'falta '+x));
  assert.ok(decl.instalarEventosDelegados, 'cargarInterfaz instala los eventos delegados');
});

test('index.html carga todos los estilos de ui/estilos/, en orden y con la misma versión que el manifiesto', async ()=>{
  const { VERSION_UI } = await import('../../src/adaptadores/entrada/ui/manifiesto.js');
  const html=readFileSync(new URL('../../index.html', import.meta.url),'utf8');
  const enlazados=[...html.matchAll(/href="src\/adaptadores\/entrada\/ui\/estilos\/([^"?]+)\?v=([^"]+)"/g)];
  const enDisco=readdirSync(new URL('estilos/', RAIZ)).filter(f=>f.endsWith('.css')).sort();
  assert.deepEqual(enlazados.map(m=>m[1]), enDisco, 'cada archivo de estilos/ debe estar enlazado, en orden numérico');
  enlazados.forEach(m=>assert.equal(m[2], VERSION_UI, m[1]+' con ?v= distinto de VERSION_UI'));
  assert.ok(!/<style[\s>]/.test(html), 'index.html no debe volver a tener <style>');
});

test('la CSP publicada (firebase.hosting.json y render.yaml) es la de scripts/csp-politica.mjs', async ()=>{
  const { POLITICA_ENCABEZADO } = await import('../../scripts/csp-politica.mjs');
  const hosting=JSON.parse(readFileSync(new URL('../../firebase.hosting.json', import.meta.url),'utf8'));
  const enc=hosting.hosting.headers.flatMap(h=>h.headers).filter(h=>/^Content-Security-Policy/.test(h.key));
  assert.ok(enc.length, 'firebase.hosting.json debe llevar la CSP (Report-Only o activa)');
  enc.forEach(h=>assert.equal(h.value, POLITICA_ENCABEZADO, 'firebase.hosting.json: '+h.key+' distinta de csp-politica.mjs'));
  // render.yaml todavía no la lleva; cuando la lleve, debe ser la misma
  const render=readFileSync(new URL('../../render.yaml', import.meta.url),'utf8');
  const m=/name:\s*Content-Security-Policy(?:-Report-Only)?\s*\n\s*value:\s*"([^"]+)"/.exec(render);
  if(m) assert.equal(m[1], POLITICA_ENCABEZADO, 'render.yaml: CSP distinta de csp-politica.mjs');
});

test('sin globales viejos ni Firebase -compat: index.html solo carga src/arranque.js', ()=>{
  const html=readFileSync(new URL('../../index.html', import.meta.url),'utf8');
  const scripts=[...html.matchAll(/<script\b[^>]*>/g)].map(m=>m[0]);
  assert.deepEqual(scripts, ['<script type="module" src="src/arranque.js">'], 'index.html debe tener una sola entrada (módulo)');
  assert.ok(!/-compat\.js/.test(html), 'nada de firebase-*-compat.js');
  // Nadie lee los globales que dejaban los scripts clásicos de la raíz
  const viejos=/window\.(firebase|FIREBASE_CONFIG|FIREBASE_ENTORNO|FIREBASE_EMULADORES|WALLACE_LOGO|LOGO_DEFAULT)\b/;
  const fuentes=['../../src/arranque.js','../../prueba.js', ...ARCHIVOS_UI.map(a=>'../../src/adaptadores/entrada/ui/'+a),
    '../../src/adaptadores/salida/firebase-datos.js','../../src/adaptadores/salida/firebase-cuentas.js'];
  fuentes.forEach(f=>assert.ok(!viejos.test(readFileSync(new URL(f, import.meta.url),'utf8')), f+' usa un global viejo'));
});

test('el tema está centralizado: colores, tamaños de letra y radios solo en estilos/00-tokens.css', ()=>{
  const sueltos=[];
  readdirSync(new URL('estilos/', RAIZ)).filter(f=>f.endsWith('.css') && f!=='00-tokens.css').forEach(f=>{
    const css=readFileSync(new URL('estilos/'+f, RAIZ),'utf8').replace(/\/\*[\s\S]*?\*\//g,'');
    const linea=i=>css.slice(0,i).split('\n').length;
    for(const m of css.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\(\s*\d/g)) sueltos.push(f+':'+linea(m.index)+' color '+m[0]);
    for(const m of css.matchAll(/font-size:\s*[\d.]+px/g)) sueltos.push(f+':'+linea(m.index)+' '+m[0]);
    for(const m of css.matchAll(/border-radius:[^;}]*\d+px/g)) sueltos.push(f+':'+linea(m.index)+' '+m[0]);
    for(const m of css.matchAll(/font-family:\s*'/g)) sueltos.push(f+':'+linea(m.index)+' fuente escrita a mano');
  });
  assert.deepEqual(sueltos, [], 'usar un token de estilos/00-tokens.css');
  // El acento del negocio ya no se llama "verde" (tema.js lo cambia por negocio)
  const viejos=[];
  ARCH.forEach(f=>{ if(/--verde(-c|-o)?\b|--acc-(rgb|txt)\b/.test(f.src)) viejos.push(f.nombre); });
  readdirSync(new URL('estilos/', RAIZ)).filter(f=>f.endsWith('.css')).forEach(f=>{ if(/--verde(-c|-o)?\b|--acc-(rgb|txt)\b/.test(readFileSync(new URL('estilos/'+f, RAIZ),'utf8'))) viejos.push(f); });
  assert.deepEqual(viejos, [], 'usar --acento… (antes --verde…/--acc-…)');
});
test('catálogo de textos: mensajes fijos y botones de ventana solo en nucleo/textos.js, sin claves sobrantes ni inexistentes', async ()=>{
  const { MSJ, BOTON }=await import('../../src/adaptadores/entrada/ui/nucleo/textos.js');
  const fijo=n=>n && ((n.type==='Literal'&&typeof n.value==='string') || (n.type==='TemplateLiteral'&&!n.expressions.length));
  const sueltos=[], usadas={MSJ:new Set(), BOTON:new Set()}, faltan=[];
  let llamadas=0;
  ARCH.forEach(f=>walk.simple(f.ast,{
    CallExpression(n){
      if(!['toast','confirmarModal','preguntarDespues'].includes(n.callee.name) || !n.arguments[0]) return;
      llamadas++;
      if(fijo(n.arguments[0])) sueltos.push(f.nombre+':'+n.loc.start.line+' '+(n.arguments[0].value||''));
    },
    Property(n){ if(n.key && n.key.name==='textoBoton' && fijo(n.value)) sueltos.push(f.nombre+':'+n.loc.start.line+' textoBoton'); },
    MemberExpression(n){
      if(n.object.type!=='Identifier' || !(n.object.name in usadas) || n.computed) return;
      usadas[n.object.name].add(n.property.name);
      if(!(n.property.name in (n.object.name==='MSJ'?MSJ:BOTON))) faltan.push(f.nombre+': '+n.object.name+'.'+n.property.name);
    }
  }));
  assert.ok(llamadas>300, 'se revisaron '+llamadas+' llamadas');   // que no pase en vacío
  assert.deepEqual(sueltos, [], 'Texto fijo fuera del catálogo: pasarlo a MSJ/BOTON (ui/nucleo/textos.js)');
  assert.deepEqual(faltan, []);
  assert.deepEqual(Object.keys(MSJ).filter(k=>!usadas.MSJ.has(k)).concat(Object.keys(BOTON).filter(k=>!usadas.BOTON.has(k))), [], 'Claves sin usar');
});
// S8: todo dato que va DENTRO del valor de un atributo HTML (src, value, title, data-click…)
// pasa por escapeHtml, aunque sea un id: los ids y los campos del negocio los escribe
// gente con sesión y las reglas no revisan todo. Solo se aceptan sin escapar las
// expresiones que no pueden traer comillas (números, literales, fmtMoney…).
const SEGURAS=new Set(['escapeHtml','Math.round','Math.floor','Math.ceil','Math.max','Math.min','Number','parseInt','parseFloat','fmtMoney','fmtNum','fmtK']);
const nombreLlamada=c=>c.type==='Identifier'?c.name:(c.type==='MemberExpression'&&!c.computed&&c.object.type==='Identifier'?c.object.name+'.'+c.property.name:'');
function sinComillas(e){
  switch(e.type){
    case 'Literal': return true;
    case 'TemplateLiteral': return e.expressions.every(sinComillas);
    case 'CallExpression': return SEGURAS.has(nombreLlamada(e.callee)) || (e.callee.type==='MemberExpression' && !e.callee.computed && e.callee.property.name==='toFixed');
    case 'ConditionalExpression': return sinComillas(e.consequent) && sinComillas(e.alternate);
    case 'LogicalExpression': return sinComillas(e.left) && sinComillas(e.right);
    case 'BinaryExpression': return e.operator==='+' ? sinComillas(e.left) && sinComillas(e.right) : true;
    case 'UnaryExpression': return true;
    default: return false;
  }
}
// Estado de cada ${…} en el HTML de la plantilla: texto, etiqueta o valor de atributo
function estados(quasis){
  const res=[]; let est='texto', q='';
  quasis.forEach((t,k)=>{
    for(let i=0;i<t.length;i++){
      const ch=t[i];
      if(est==='texto'){ if(ch==='<' && /[A-Za-z]/.test(t[i+1]||'')) est='etiqueta'; }
      else if(est==='etiqueta'){ if(ch==='>') est='texto'; else if(ch==='"'||ch==="'"){ est='valor'; q=ch; } }
      else if(ch===q) est='etiqueta';
    }
    if(k<quasis.length-1) res.push(est);
  });
  return res;
}
test('S8: los datos dentro de atributos HTML van escapados; el logo y las fotos solo como imagen válida', ()=>{
  const sueltos=[]; let revisados=0;
  ARCH.forEach(f=>walk.simple(f.ast,{TemplateLiteral(t){
    if(!t.expressions.length) return;
    const est=estados(t.quasis.map(q=>q.value.cooked==null?q.value.raw:q.value.cooked));
    t.expressions.forEach((e,i)=>{ if(est[i]!=='valor') return; revisados++;
      if(!sinComillas(e)) sueltos.push(f.nombre+':'+e.loc.start.line+' ${'+f.src.slice(e.start,e.end)+'}'); });
  }}));
  assert.ok(revisados>250, 'se revisaron '+revisados);   // que no pase en vacío (285 el 2026-10-12)
  assert.deepEqual(sueltos, [], 'Usar escapeHtml(…) dentro del atributo');
  // Concatenaciones '<img src="'+x+'"…': solo con escapeHtml
  const concat=ARCH.flatMap(f=>(f.src.match(/src="'\s*\+\s*(?!escapeHtml\()[^+]+/g)||[]).map(m=>f.nombre+': '+m));
  assert.deepEqual(concat, []);
  // El logo solo lo dibuja logoNegocio (valida la imagen)
  const logos=ARCH.filter(f=>f.nombre!=='nucleo/componentes.js' && /\$\{\s*neg\.logo\s*\}|'\s*\+\s*neg\.logo/.test(f.src)).map(f=>f.nombre);
  assert.deepEqual(logos, []);
});
test('C2/C4: ningún error atrapado se queda en la consola con un aviso genérico (va por reportarError)', ()=>{
  const malos=ARCH.filter(f=>/console\.error\(e\);\s*toast\(/.test(f.src)).map(f=>f.nombre);
  assert.deepEqual(malos, [], 'Usar reportarError(donde, e)');
});
test('V6: los avisos (toast) se ven encima de las ventanas pero no reciben clics (no tapan sus botones)', ()=>{
  const css=readFileSync(new URL('estilos/09-modal-avisos.css', RAIZ),'utf8');
  const regla=(css.match(/#toasts\{[^}]*\}/)||[''])[0];
  assert.match(regla, /pointer-events:none/, 'Sin esto, en un celular un aviso tapa "Guardar" o "Sí, continuar" por 3 segundos');
});
