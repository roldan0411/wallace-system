// Prueba la Content-Security-Policy (Documentation/-03-architecture/csp.md) sin
// desplegar: sirve el proyecto con la política puesta en un <meta> de index.html
// (el archivo del repositorio no se toca), en modo local (?local), y cuenta las
// violaciones (evento securitypolicyviolation) al recorrer las pantallas de los
// 18 demos e imprimir una factura por negocio (ventanas reales: heredan la CSP).
//   node scripts/probar-csp.mjs            la política propuesta → debe dar 0
//   node scripts/probar-csp.mjs estricta   sin 'unsafe-inline' en style-src (ver qué falta)
// No prueba las conexiones a Firebase (modo local): eso se ve en el sandbox con Report-Only.
// La política está en scripts/csp-politica.mjs (una sola para todo el proyecto).
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import puppeteer from 'puppeteer-core';
import { POLITICA } from './csp-politica.mjs';
const RAIZ=decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/^\/([A-Za-z]:)/,'$1');
const estricta=process.argv[2]==='estricta';
// La política sale de scripts/csp-politica.mjs (la misma que publica firebase.hosting.json)
const CSP=estricta ? POLITICA.replace(" 'unsafe-inline'", '') : POLITICA;
const TIPOS={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
const srv=createServer((req,res)=>{
  let ruta=decodeURIComponent(req.url.split('?')[0]); if(ruta==='/') ruta='/index.html';
  const f=join(RAIZ, ruta);
  if(!existsSync(f) || statSync(f).isDirectory()){ res.writeHead(404); return res.end(); }
  let cuerpo=readFileSync(f);
  if(ruta==='/index.html') cuerpo=cuerpo.toString().replace(/<head>/i, '<head>\n<meta http-equiv="Content-Security-Policy" content="'+CSP+'">');
  res.writeHead(200, {'Content-Type':TIPOS[extname(f)]||'application/octet-stream'}); res.end(cuerpo);
}).listen(3931);
const NAV=process.env.CHROME_PATH || ['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome','/usr/bin/chromium','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync);
if(!NAV){ console.error('Falta Chrome o Edge (CHROME_PATH)'); process.exit(1); }
const nav=await puppeteer.launch({executablePath:NAV, headless:true, args:['--no-sandbox']});
const viol=new Map();
const vigilar=async pg=>{
  await pg.exposeFunction('__csp', t=>viol.set(t,(viol.get(t)||0)+1)).catch(()=>{});
  await pg.evaluateOnNewDocument(()=>document.addEventListener('securitypolicyviolation', e=>window.__csp(e.violatedDirective+' · '+(e.blockedURI||'en línea')+' · '+(e.sourceFile||'').split('/').pop()+':'+e.lineNumber)));
};
nav.on('targetcreated', async t=>{ if(t.type()==='page'){ const p=await t.page(); if(p){ p.on('console', m=>{ if(/Content Security Policy/.test(m.text())) viol.set('ventana impresión: '+m.text().slice(0,140),1); }); } } });
const p=await nav.newPage(); await vigilar(p);
await p.setViewport({width:1366, height:900});
p.on('dialog', d=>d.accept());
await p.goto('http://localhost:3931/?local', {waitUntil:'networkidle2'});
await p.waitForFunction(()=>window.WS && document.getElementById('ci-user'), {timeout:20000});
await p.evaluate(()=>{ for(const [i,v] of [['ci-nombre','Dueño'],['ci-user','dueno'],['ci-pass','clave1234'],['ci-pass2','clave1234']]) document.getElementById(i).value=v; WS.crearDuenoInicial(); });
await p.waitForSelector('#l-user', {visible:true});
await p.evaluate(()=>{ document.getElementById('l-user').value='dueno'; document.getElementById('l-pass').value='clave1234'; WS.hacerLogin(); });
await p.waitForFunction(()=>WS.STATE.esSuperAdmin===true);
const r=await p.evaluate(async ()=>{
  const esperar=ms=>new Promise(res=>setTimeout(res,ms));
  Object.keys(WS.DEMO_PLANTILLAS).forEach(t=>WS.crearDemoDeTipo(t,false)); WS.render();
  let n=0, impresiones=0;
  for(const neg of DB.get('negocios')||[]){
    WS.entrarComoNegocio(neg.id);
    for(const m of WS.armarMenu().filter(x=>x.id)){ WS.STATE.pageNeg=m.id; WS.render(); n++; await esperar(5); }
    // una impresión real por negocio (ventana nueva con la CSP heredada)
    const v=misDatos('ventas')[0]; if(v && WS.imprimirFactura){ try{ WS.imprimirFactura(v); impresiones++; }catch(e){} }
    WS.cerrarModal(); WS.volverSuperAdmin();
  }
  return {n, impresiones};
});
await new Promise(res=>setTimeout(res,1500));
console.log('CSP:', estricta?'estricta (style-src sin unsafe-inline)':'propuesta');
console.log('pantallas:', r.n, '· impresiones:', r.impresiones);
console.log('violaciones:', viol.size?'':'ninguna'); [...viol].sort((a,b)=>b[1]-a[1]).slice(0,12).forEach(([t,c])=>console.log(' ', c, t));
await nav.close(); srv.close();
if(!estricta && viol.size) process.exitCode=1;
