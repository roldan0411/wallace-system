// Capturas comparables de la interfaz (regresión visual).
// Abre la app en modo local en Chrome sin ventana, con datos, azar y reloj FIJOS,
// y fotografía un conjunto de pantallas (escritorio y celular, tema claro y oscuro,
// modales). Sirve para cambiar CSS o plantillas sin alterar el aspecto.
//
//   node scripts/capturas.mjs tomar <carpeta>              toma las capturas
//   node scripts/capturas.mjs comparar <carpetaA> <carpetaB>  compara píxel a píxel
//   CAPTURAS_RAIZ=<carpeta>  sirve otra copia del proyecto (p. ej. un worktree con la versión anterior)
//
// Las carpetas de capturas no se versionan (.gitignore: capturas/).
import { spawn, execSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const NAVEGADORES=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome','/usr/bin/chromium','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
const NAVEGADOR=process.env.CHROME_PATH || NAVEGADORES.find(p=>existsSync(p));
const PUERTO=3950;
const espera=ms=>new Promise(r=>setTimeout(r,ms));
const [,, modo, a, b]=process.argv;

// Se ejecuta en la página antes que todo: azar con semilla, reloj fijo y sin animaciones
function determinista(){
  let s=20261008;
  Math.random=function(){ s|=0; s=s+0x6D2B79F5|0; let t=Math.imul(s^s>>>15,1|s); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; };
  // Se vuelve a fijar justo antes de crear los demos: así los datos no dependen de cuántos
  // números al azar gastaron las librerías al cargar (las de Firebase -compat gastaban uno)
  window.__semilla=n=>{ s=n; };
  // Hora FIJA (el reloj de la app consulta cada segundo: una hora que avanza daría capturas distintas)
  const BASE=new Date(2026,9,8,15,30,0).getTime();
  const D=Date;
  function F(...x){ return x.length ? new D(...x) : new D(BASE); }
  F.prototype=D.prototype; F.now=()=>BASE; F.parse=D.parse; F.UTC=D.UTC;
  window.Date=F;
  window.open=()=>({document:{open(){},write(){},close(){}}, print(){}, focus(){}, close(){}});
  document.addEventListener('DOMContentLoaded',()=>{
    const st=document.createElement('style');
    // Lo que cambia solo (reloj, avisos que aparecen y se van) no es diseño: se oculta
    st.textContent='*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}'
      +'#reloj{display:none!important}#toasts{display:none!important}';
    document.head.appendChild(st);
  });
}

async function tomar(dir){
  mkdirSync(dir,{recursive:true});
  const raiz=process.env.CAPTURAS_RAIZ || '.';
  const srv=spawn('npx serve -s "'+raiz+'" -l '+PUERTO,{shell:true, stdio:'ignore'});
  for(let i=0;i<60;i++){ try{ await fetch('http://localhost:'+PUERTO+'/'); break; }catch(e){ await espera(500); } }
  const nav=await puppeteer.launch({executablePath:NAVEGADOR, headless:true, args:['--no-sandbox','--font-render-hinting=none','--disable-gpu','--force-color-profile=srgb','--disable-lcd-text']});
  const errores=[];
  let n=0;
  try{
    const p=await nav.newPage();
    p.on('pageerror',e=>errores.push(e.message));
    await p.evaluateOnNewDocument(determinista);
    const foto=async (nombre, ancho)=>{
      await p.setViewport({width:ancho||1280, height:800});
      await espera(250);   // enfoques automáticos de campos (setTimeout 50 ms) y repintados
      await p.evaluate(()=>{ const r=document.getElementById('reloj'); if(r) r.textContent='00:00:00'; return document.fonts.ready; });
      await espera(60);
      await p.screenshot({path:join(dir, String(++n).padStart(3,'0')+'-'+nombre+'.png'), fullPage:true});
    };
    const en=async (fn, ...args)=>{ await p.evaluate(fn, ...args); await espera(80); };
    await p.goto('http://localhost:'+PUERTO+'/?local',{waitUntil:'networkidle2'});
    await p.waitForSelector('#ci-user');
    await foto('config-inicial');
    await foto('config-inicial-movil', 390);
    await en(()=>{ ['ci-nombre','ci-user'].forEach(i=>document.getElementById(i).value='dueno'); ['ci-pass','ci-pass2'].forEach(i=>document.getElementById(i).value='clave1234'); WS.crearDuenoInicial(); });
    await p.waitForSelector('#l-user');
    await foto('login');
    await foto('login-movil', 390);
    await en(()=>{ document.getElementById('l-user').value='dueno'; document.getElementById('l-pass').value='clave1234'; WS.hacerLogin(); });
    await en(()=>{ window.__semilla(20261008); ['Restaurante','Tienda / Accesorios','Barbería / Salón'].forEach(t=>WS.crearDemoDeTipo(t,false)); WS.render(); });
    await foto('panel');
    await foto('panel-movil', 390);
    await en(()=>{ WS.STATE.page='superadmins'; WS.render(); }); await foto('superadmins');
    const negs=await p.evaluate(()=>(DB.get('negocios')||[]).map(n=>n.id));
    for(const t of ['datos','comercial','operacion','ventanas','sucursales']){
      await en(t2=>{ WS.STATE.page='config:'+(DB.get('negocios')||[])[0].id; WS.cfgTab(t2); }, t);
      await p.evaluate(t2=>{ WS.cfgTab(t2); }, t);
      await foto('config-'+t);
    }
    await en(()=>{ WS.STATE.page='usuarios:'+(DB.get('negocios')||[])[0].id; WS.render(); }); await foto('usuarios-negocio');
    await en(()=>{ WS.nuevoNegocio(); }); await foto('modal-nuevo-negocio'); await en(()=>WS.cerrarModal());
    await en(()=>{ WS.STATE.page=''; WS.render(); });
    await en(()=>{ if(typeof (window.WS||{}).abrirMigracion==='function'){ WS.STATE.page='migracion'; WS.render(); } }); await foto('migracion-cuentas');
    await en(()=>{ WS.STATE.page=''; WS.render(); });
    // Pantallas de cada negocio (el primero en tema oscuro, el resto como vienen)
    for(let k=0;k<negs.length;k++){
      await en((id,oscuro)=>{
        if(oscuro){ const l=DB.get('negocios'); const x=l.find(n=>n.id===id); x.tema='oscuro'; DB.set('negocios',l); }
        WS.entrarComoNegocio(id);
      }, negs[k], k===0);
      const pantallas=await p.evaluate(()=>WS.armarMenu().filter(m=>m.id).map(m=>m.id));
      for(const pg of pantallas){
        await en(x=>{ WS.STATE.pageNeg=x; WS.render(); }, pg);
        await foto('neg'+k+'-'+pg);
      }
      // Móvil y modales representativos
      await en(()=>{ WS.STATE.pageNeg='ventas'; WS.render(); }); await foto('neg'+k+'-ventas-movil', 390);
      await en(()=>{ WS.STATE.pageNeg='inicio'; WS.render(); }); await foto('neg'+k+'-inicio-movil', 390);
      await en(()=>{ WS.STATE.pageNeg='ventas'; WS.render(); const pr=misDatos('productos').find(x=>!x.esCombo); if(pr){ WS.agregarAlCarrito(pr.id); WS.agregarAlCarrito(pr.id); } WS.render(); });
      await foto('neg'+k+'-carrito');
      await en(()=>{ Object.assign(WS._vCli,{nombre:'Cliente', tel:'3001234567', dir:'Calle 1', barrio:'Centro'}); if(WS.STATE.negocio.flujoPedido==='dos_pasos'){ WS.ponerMesa('1'); } WS.cobrarDirecto(); });
      await foto('neg'+k+'-modal-cobro'); await en(()=>{ WS.cerrarModal(); WS.vaciarCarrito(); });
      await en(()=>{ const pr=misDatos('productos')[0]; if(pr) WS.editarProducto(pr.id); }); await foto('neg'+k+'-modal-producto'); await en(()=>WS.cerrarModal());
      await en(()=>{ WS.STATE.pageNeg='caja'; WS.render(); if(WS.cajaActual()) WS.cerrarCaja(); }); await foto('neg'+k+'-modal-cierre'); await en(()=>WS.cerrarModal());
      // Modales de cada módulo (solo los que existen en este tipo de negocio)
      const modales=[
        ['movimiento-caja', ()=>{ WS.STATE.pageNeg='caja'; WS.render(); if(WS.cajaActual()) WS.movimientoCaja('gasto'); }],
        ['nuevo-gasto',     ()=>{ WS.STATE.pageNeg='gastosneg'; WS.render(); WS.nuevoGasto(); }],
        ['conceptos',       ()=>{ WS.STATE.pageNeg='gastosneg'; WS.render(); WS.administrarConceptos(); }],
        ['nueva-cita',      ()=>{ if(!WS.puedeVerPantalla('citas')) return; WS.STATE.pageNeg='citas'; WS.render(); WS.nuevaCita(); }],
        ['combo',           ()=>{ WS.STATE.pageNeg='combos'; WS.render(); WS.editarCombo(null); }],
        ['receta',          ()=>{ WS.STATE.negocio.usaRecetas=true; WS.STATE.pageNeg='inventario'; WS.render(); WS.editarProducto(null); WS.STATE.negocio.usaRecetas=false; }],
        ['entrada-stock',   ()=>{ const pr=misDatos('productos').find(x=>x.stock!=null); if(pr) WS.entradaStock(pr.id); }],
        ['conteo',          ()=>{ WS.STATE.pageNeg='conteo'; WS.render(); WS.iniciarConteo(); WS.render(); }],
        ['cliente',         ()=>{ WS.STATE.pageNeg='clientes'; WS.render(); WS.editarCliente(null); }],
        ['descuento',       ()=>{ WS.STATE.pageNeg='ventas'; WS.render(); const pr=misDatos('productos').find(x=>!x.esCombo); if(pr) WS.agregarAlCarrito(pr.id); WS.abrirDescuento(); }],
        ['reporte-descuadre', ()=>{ const c=misDatos('cierres')[0]; if(c) WS.reporteDescuadre(c); }]
      ];
      for(const [nom, fn] of modales){
        await en(fn); await foto('neg'+k+'-modal-'+nom);
        await en(()=>{ WS.cerrarModal(); if(WS._conteo){ WS.cancelarConteo(); document.getElementById('modal-ok').click(); } WS.vaciarCarrito(); });
      }
      await en(()=>WS.volverSuperAdmin());
    }
    // Panel rediseñado (etapa 3): al final para no cambiar el número de las capturas anteriores
    await en(()=>{ WS.STATE.page=''; WS.verTabNegocios('demos'); }); await foto('panel-demos');
    await en(()=>{ document.querySelectorAll('.topbar details.menu-sa').forEach(d=>{ d.open=true; }); }); await foto('panel-menus');
    await en(()=>{ document.querySelector('.contenido tbody details.menu-sa').open=true; }); await foto('panel-menu-negocio');
    await en(()=>{ WS.abrirFicha((DB.get('negocios')||[])[0].id); }); await foto('ficha-negocio'); await foto('ficha-negocio-movil', 390);
    // Cobros (etapa 4): un cliente que paga desde hoy aparece en "Cobros del mes"
    await en(()=>{ WS.STATE.page=''; WS.nuevoNegocio(); });
    await en(()=>{ document.getElementById('m-nombre').value='Cliente Ejemplo'; document.getElementById('m-usuario').value='cliente1';
      document.getElementById('m-prueba').value=''; document.getElementById('modal-ok').click(); });
    await en(()=>{ WS.cerrarModal(); WS.verTabNegocios('clientes'); }); await foto('panel-cobros');
    await en(()=>{ WS.cobrosNegocio((DB.get('negocios')||[]).find(x=>x.nombre==='Cliente Ejemplo').id); }); await foto('ficha-cobros');
  } catch(e){
    // Que se vea claro dónde se detuvo (la traza completa queda debajo)
    console.error('✖ Las capturas se detuvieron después de la '+n+' ('+(readdirSync(dir).filter(f=>f.endsWith('.png')).sort().pop()||'ninguna')+'): '+(e&&e.message));
    process.exitCode=1;
    throw e;
  } finally {
    await nav.close();
    try{ if(process.platform==='win32') execSync('taskkill /pid '+srv.pid+' /T /F',{stdio:'ignore'}); else srv.kill(); }catch(e){}
  }
  writeFileSync(join(dir,'errores.json'), JSON.stringify(errores,null,1));
  console.log(n+' capturas en '+dir+(errores.length?' · ⚠️ '+errores.length+' errores de JavaScript (errores.json)':''));
}

async function comparar(da, db){
  const fa=readdirSync(da).filter(f=>f.endsWith('.png')).sort(), fb=readdirSync(db).filter(f=>f.endsWith('.png')).sort();
  const todos=[...new Set(fa.concat(fb))].sort();
  const nav=await puppeteer.launch({executablePath:NAVEGADOR, headless:true});
  const p=await nav.newPage();
  const distintos=[];
  for(const f of todos){
    if(!fa.includes(f) || !fb.includes(f)){ distintos.push(f+': solo en '+(fa.includes(f)?da:db)); continue; }
    const A=readFileSync(join(da,f)), B=readFileSync(join(db,f));
    if(A.equals(B)) continue;
    const r=await p.evaluate(async (a64,b64)=>{
      const carga=s=>new Promise(res=>{ const i=new Image(); i.onload=()=>res(i); i.src='data:image/png;base64,'+s; });
      const [ia, ib]=await Promise.all([carga(a64), carga(b64)]);
      if(ia.width!==ib.width || ia.height!==ib.height) return {tam:ia.width+'x'+ia.height+' vs '+ib.width+'x'+ib.height};
      const c=document.createElement('canvas'); c.width=ia.width; c.height=ia.height; const x=c.getContext('2d');
      x.drawImage(ia,0,0); const pa=x.getImageData(0,0,c.width,c.height).data;
      x.clearRect(0,0,c.width,c.height); x.drawImage(ib,0,0); const pb=x.getImageData(0,0,c.width,c.height).data;
      let d=0, x0=1e9, y0=1e9, x1=-1, y1=-1;
      for(let i=0;i<pa.length;i+=4){
        // Diferencias de color menores a 32/255 son suavizado del navegador, no diseño
        if(Math.max(Math.abs(pa[i]-pb[i]),Math.abs(pa[i+1]-pb[i+1]),Math.abs(pa[i+2]-pb[i+2]))>=32){
          d++; const px=(i/4)%c.width, py=Math.floor(i/4/c.width);
          if(px<x0)x0=px; if(py<y0)y0=py; if(px>x1)x1=px; if(py>y1)y1=py;
        }
      }
      return {pix:d, zona:d?('x '+x0+'–'+x1+', y '+y0+'–'+y1):''};
    }, A.toString('base64'), B.toString('base64'));
    if(r.tam || r.pix) distintos.push(f+': '+(r.tam?'tamaño '+r.tam:r.pix+' píxeles distintos ('+r.zona+')'));
  }
  await nav.close();
  console.log(todos.length+' capturas comparadas · '+(distintos.length?distintos.length+' distintas:':'idénticas ✅'));
  distintos.forEach(x=>console.log('  ✖ '+x));
  process.exit(distintos.length?1:0);
}

if(modo==='tomar' && a) await tomar(a);
else if(modo==='comparar' && a && b) await comparar(a, b);
else { console.log('Uso: node scripts/capturas.mjs tomar <carpeta> | comparar <carpetaA> <carpetaB>'); process.exit(1); }
