// Prueba de humo de S1 con la interfaz REAL (index.html + src/adaptadores/entrada/ui/) en Chrome/Edge sin
// ventana, contra los emuladores de Firebase. Datos sintéticos; no toca ninguna base real.
//   npm run test:firebase    (la incluye; requiere Java 11+ y Chrome o Edge instalados)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawn, execSync } from 'node:child_process';

const DB_HOST=process.env.FIREBASE_DATABASE_EMULATOR_HOST, AUTH_HOST=process.env.FIREBASE_AUTH_EMULATOR_HOST;
const NAVEGADORES=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome','/usr/bin/chromium','/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
const NAVEGADOR=process.env.CHROME_PATH || NAVEGADORES.find(p=>existsSync(p));
const omitir=!(DB_HOST && AUTH_HOST) ? 'sin emuladores (npm run test:firebase)' : (!NAVEGADOR && 'sin Chrome/Edge (CHROME_PATH)');
const NS='demo-wallace-default-rtdb', PUERTO=3917, URL_APP='http://localhost:'+PUERTO+'/?emulador';
const rest=(ruta, metodo, cuerpo)=>fetch('http://'+DB_HOST+'/'+ruta+'.json?ns='+NS, {method:metodo||'GET',
  headers:{Authorization:'Bearer owner'}, body:cuerpo===undefined?undefined:JSON.stringify(cuerpo)}).then(r=>r.json());
const ponerReglas=a=>rest('.settings/rules','PUT',JSON.parse(readFileSync(new URL('../../'+a, import.meta.url),'utf8')));
const espera=ms=>new Promise(r=>setTimeout(r,ms));

const NEG=(id,nombre)=>({id, nombre, tipo:'Otro', activo:true, plan:'Básico', precioMes:0, creado:'2026-0'+(id==='n1'?1:2)+'-01T00:00:00Z',
  funciones:['ventas','catalogo','caja','facturas','clientes','inventario','reportes'], flujoPedido:'directo', tiposEntrega:['llevar'],
  tema:'oscuro', palabraProducto:'Producto', palabraProductos:'Productos', palabraPedido:'Pedido', palabraPersonal:'Personal', logo:''});
const DATOS={
  negocios:[NEG('n1','Licorera'), NEG('n2','Tienda')],
  usuarios:[
    {id:'u1', negocioId:'n1', usuario:'MARCE', nombre:'Marcela', rol:'admin', pass:'1234', activo:true},
    {id:'u2', negocioId:'n2', usuario:'vapeo', nombre:'Otro', rol:'admin', pass:'vapeo99', activo:true}
  ],
  superadmins:[{id:'s1', usuario:'admin', nombre:'Roldán', rolSuper:'dueno', pass:'clavedueno'}],
  data_n1_productos:[{id:'p1', nombre:'Aguardiente', precio:50000, stock:10, creado:'2026-01-01T00:00:00Z'}],
  data_n2_ventas_r:{v9:{id:'v9', total:9, fecha:'2026-10-01T00:00:00Z'}}
};

let navegador, pagina, servidor;
const errores=[];
async function escribir(sel, texto){ await pagina.waitForSelector(sel, {visible:true, timeout:15000}); await pagina.$eval(sel, e=>{ e.value=''; }); await pagina.type(sel, texto); }
async function textoApp(){ return pagina.$eval('#app', e=>e.innerText); }
async function esperarTexto(t, ms){
  const fin=Date.now()+(ms||20000);
  while(Date.now()<fin){ if((await textoApp()).includes(t)) return; await espera(250); }
  throw new Error('No apareció "'+t+'". Pantalla:\n'+(await textoApp()).slice(0,600));
}
async function entrar(usuario, pass){
  await escribir('#l-user', usuario); await escribir('#l-pass', pass);
  await pagina.click('.login-btn');
}
async function salir(){
  await pagina.evaluate(()=>WS.logout());
  await pagina.waitForSelector('#l-user', {visible:true, timeout:15000});
}

before(async ()=>{
  if(omitir) return;
  await fetch('http://'+AUTH_HOST+'/emulator/v1/projects/demo-wallace/accounts', {method:'DELETE'});
  await ponerReglas('database.rules.transicion.json');
  await rest('', 'PUT', {data:DATOS});
  servidor=spawn('npx serve -s . -l '+PUERTO, {shell:true, stdio:'ignore'});
  for(let i=0;i<60;i++){ try{ await fetch('http://localhost:'+PUERTO+'/'); break; }catch(e){ await espera(500); } }
  const puppeteer=(await import('puppeteer-core')).default;
  navegador=await puppeteer.launch({executablePath:NAVEGADOR, headless:true, args:['--no-sandbox']});
  pagina=await navegador.newPage();
  pagina.on('pageerror', e=>errores.push('pageerror: '+e.message));
  pagina.on('console', m=>{ if(process.env.DEBUG_NAV) console.log('[nav]', m.type(), m.text().slice(0,300)); if(m.type()==='error' && !/permission|PERMISSION|favicon|fonts\.g/i.test(m.text())) errores.push('console: '+m.text()); });
  await pagina.goto(URL_APP, {waitUntil:'networkidle2'});
});
after(async ()=>{
  if(navegador) await navegador.close();
  if(servidor){ try{ if(process.platform==='win32') execSync('taskkill /pid '+servidor.pid+' /T /F', {stdio:'ignore'}); else servidor.kill(); }catch(e){} }
});

test('login con aviso de entorno y migración del dueño del sistema', {skip:omitir}, async ()=>{
  await esperarTexto('Emuladores locales');
  await entrar('admin', 'clavedueno');
  await esperarTexto('Licorera');
  await esperarTexto('Tienda');
  const d=await rest('data');
  assert.ok(d.negocios_r && d.negocios_r.n1, 'negocios_r creado');
  assert.equal(d.superadmins[0].pass, undefined, 'clave vieja del dueño retirada');
  await espera(1500);
  const leg=Object.values((await rest('data/usuarios'))||{});
  assert.ok(leg.every(u=>!u.pass && u.passHash), 'contraseñas viejas pasadas a hash');
  await salir();
});
test('empleado con contraseña corta: elige una nueva y entra a su negocio', {skip:omitir}, async ()=>{
  await entrar('MARCE', '1234');
  await pagina.waitForSelector('#m-n1', {visible:true, timeout:20000});
  await pagina.type('#m-n1', 'marce2026'); await pagina.type('#m-n2', 'marce2026');
  await pagina.click('#modal-ok');
  await esperarTexto('Mi Negocio');
  const yo=await pagina.evaluate(()=>({user:WS.STATE.user, neg:WS.STATE.negocio&&WS.STATE.negocio.id, otros:Object.keys(Datos.cache).filter(k=>k.startsWith('data_n2'))}));
  assert.equal(yo.neg, 'n1'); assert.equal(yo.user.rol, 'admin'); assert.ok(yo.user.uid);
  assert.deepEqual(yo.otros, [], 'sin datos de otros negocios en el equipo');
});
test('Mi Negocio guarda por campo en negocios_r', {skip:omitir}, async ()=>{
  await pagina.evaluate(()=>{ WS.irA('minegocio'); });
  await escribir('#n-nombre', 'Licorera La M');
  await pagina.evaluate(()=>WS.guardarMiNegocio());
  await espera(800);
  assert.equal((await rest('data/negocios_r/n1/nombre')), 'Licorera La M');
  assert.equal((await rest('data/negocios_r/n1/plan')), 'Básico');
});
test('reglas cerradas: al recargar la sesión sigue y no se ve otro negocio', {skip:omitir}, async ()=>{
  await ponerReglas('database.rules.json');
  await pagina.reload({waitUntil:'networkidle2'});
  await esperarTexto('Mi Negocio');
  // Con la misma sesión y el mismo SDK modular que cargó la app (firebase-sdk.js → sdkCargado)
  const r=await pagina.evaluate(async ()=>{
    const { database:D, app:A }=(await import('/src/adaptadores/salida/firebase-sdk.js')).sdkCargado();
    const db=D.getDatabase(A.getApp()), leer=ruta=>D.get(D.ref(db, ruta));
    return Promise.all([
      leer('data/data_n2_ventas_r').then(()=>'leyó', e=>'negado'),
      leer('data/usuarios').then(()=>'leyó', e=>'negado'),
      leer('data/data_n1_productos_r').then(s=>s.exists()?'propio':'vacío', e=>'negado')
    ]);
  });
  assert.deepEqual(r, ['negado','negado','propio']);
  await salir();
});
test('super-admin con reglas cerradas: panel y pantalla de migración', {skip:omitir}, async ()=>{
  await entrar('admin', 'clavedueno');
  await esperarTexto('Licorera La M');
  await pagina.evaluate(()=>WS.abrirMigracion());
  await esperarTexto('cuentas migradas');
  const t=await textoApp();
  assert.match(t, /2 de 3 cuentas migradas · 1 pendientes · 0 por revisar/);
  await salir();
});
test('modo local (sin nube): configuración inicial, crear negocio, F12 de inventario', {skip:omitir}, async ()=>{
  const ctx=await navegador.createBrowserContext();   // localStorage limpio
  const p=await ctx.newPage();
  p.on('pageerror', e=>errores.push('local pageerror: '+e.message));
  const txt=()=>p.$eval('#app', e=>e.innerText);
  const hasta=async t=>{ const fin=Date.now()+15000; while(Date.now()<fin){ if((await txt()).includes(t)) return; await espera(200); } throw new Error('No apareció "'+t+'": '+(await txt()).slice(0,400)); };
  const poner=async (sel,v)=>{ await p.waitForSelector(sel,{visible:true}); await p.$eval(sel,e=>{ e.value=''; }); await p.type(sel,v); };
  await p.goto('http://localhost:'+PUERTO+'/?local', {waitUntil:'networkidle2'});
  await hasta('Modo local');
  await hasta('Configuración inicial');
  await poner('#ci-nombre','Dueño'); await poner('#ci-user','dueno'); await poner('#ci-pass','clave1234'); await poner('#ci-pass2','clave1234');
  await p.evaluate(()=>WS.crearDuenoInicial());
  await p.waitForSelector('#l-user',{visible:true});
  await poner('#l-user','dueno'); await poner('#l-pass','clave1234'); await p.click('.login-btn');
  await p.evaluate(()=>WS.nuevoNegocio());
  await poner('#m-nombre','Local Uno'); await poner('#m-usuario','jefe');
  const planes=await p.$$eval('#m-plan option', os=>os.map(o=>o.value));
  assert.deepEqual(planes, ['Básico','Profesional','Premium']);                 // F6
  await p.click('#modal-ok');
  await hasta('Local Uno');
  await p.waitForSelector('#pass-inicial', {visible:true});                      // P1: clave al azar, se ve una vez
  const clave=await p.$eval('#pass-inicial', e=>e.textContent);
  assert.notEqual(clave, 'admin123');
  await p.evaluate(()=>WS.cerrarModal());
  await p.evaluate(()=>WS.logout());
  await poner('#l-user','jefe'); await poner('#l-pass',clave); await p.click('.login-btn');
  await hasta('Mi Negocio');
  await p.evaluate(()=>WS.irA('minegocio'));
  await p.waitForSelector('#n-inventario');
  await p.$eval('#n-inventario', e=>{ e.checked=false; });
  await p.evaluate(()=>WS.guardarMiNegocio());
  const n=await p.evaluate(()=>({usa:WS.usaInventario(WS.STATE.negocio), fun:WS.STATE.negocio.funciones.indexOf('inventario')>-1, apagado:WS.STATE.negocio.inventarioApagado}));
  assert.deepEqual(n, {usa:false, fun:true, apagado:true});                     // F12: no toca funciones
  await ctx.close();
});
test('R1: el panel no descarga ventas; usa el resumen y supervisar carga el negocio bajo demanda', {skip:omitir}, async ()=>{
  // El equipo de MARCE (n1) publicó su resumen al bajar sus ventas
  const r1=await rest('data/data_n1_resumen');
  assert.ok(r1 && r1.pagadas===0, 'resumen de n1 publicado');
  await entrar('admin', 'clavedueno');
  await esperarTexto('Licorera La M');
  await espera(800);
  const antes=await pagina.evaluate(()=>Object.keys(Datos.cache).filter(k=>/_ventas$/.test(k) && (Datos.cache[k]||[]).length));
  assert.deepEqual(antes, [], 'el panel no tiene ventas de ningún negocio');
  await pagina.evaluate(()=>WS.entrarComoNegocio('n2'));
  await pagina.waitForFunction(()=>datosDe('n2','ventas').length===1, {timeout:15000});
  await pagina.evaluate(()=>WS.volverSuperAdmin());
  await salir();
});
test('vendedor con reglas cerradas: ve solo lo suyo, crea un negocio a prueba con ejemplos, entra a su demo y la borra', {skip:omitir}, async ()=>{
  // Cuenta del vendedor (como la crearía el dueño en Administradores) y una demo suya
  const alta=await (await fetch('http://'+AUTH_HOST+'/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-key', {method:'POST',
    headers:{'Content-Type':'application/json'}, body:JSON.stringify({email:'vende@usuarios.wallace-system.app', password:'vende2026', returnSecureToken:true})})).json();
  await rest('perfiles/'+alta.localId, 'PUT', {rol:'superadmin', rolSuper:'vendedor', superId:'sv1', usuario:'vende', nombre:'Vendedora', activo:true});
  await rest('login/vende', 'PUT', {correo:'vende@usuarios.wallace-system.app', uid:alta.localId});
  const hoy=Date.now();
  await rest('data/negocios_r/ndemo', 'PUT', Object.assign(NEG('ndemo','Demo de Vendedora'), {esDemo:true, demoDe:'sv1', pruebaDesde:hoy, pruebaHasta:hoy+15*86400000}));
  await rest('data/data_ndemo_productos_r/pd', 'PUT', {id:'pd', nombre:'Producto demo', precio:1000, creado:'2026-10-01T00:00:00Z'});

  const negados=[]; const oirNegados=m=>{ if(/permission/i.test(m.text())) negados.push(m.text().slice(0,200)); };
  pagina.on('console', oirNegados);
  await entrar('vende', 'vende2026');
  await esperarTexto('Panel de');
  await pagina.waitForFunction(()=>(DB.get('negocios')||[]).length===1, {timeout:15000});
  assert.deepEqual(await pagina.evaluate(()=>DB.get('negocios').map(n=>n.id)), ['ndemo'], 'solo su demo, ni n1 ni n2');

  // Negocio a prueba con ejemplos, a su nombre
  await pagina.evaluate(()=>WS.nuevoNegocio());
  // Valores directos (escribir con el teclado en un modal recién abierto a veces pierde el foco)
  await pagina.waitForSelector('#m-nombre', {visible:true});
  await pagina.evaluate(()=>{ const v={'m-nombre':'Cliente de Vendedora', 'm-tipo':'Restaurante', 'm-usuario':'clientev'};
    Object.keys(v).forEach(id=>{ document.getElementById(id).value=v[id]; }); });
  await pagina.$eval('#m-ejemplos', e=>{ e.checked=true; });
  await pagina.click('#modal-ok');
  let neg=null;
  for(let i=0;i<60 && !neg;i++){ await espera(250); neg=Object.values((await rest('data/negocios_r'))||{}).find(n=>n.nombre==='Cliente de Vendedora'); }
  assert.ok(neg, 'negocio creado. Avisos: '+(await pagina.$$eval('#toasts .toast', l=>l.map(t=>t.textContent).join(' | ')))+' · negados: '+negados.join(' || ')+' · local: '+(await pagina.evaluate(()=>JSON.stringify((DB.get('negocios')||[]).map(n=>[n.id,n.nombre,n.vendedorId,n.pruebaHasta]))))+' · modal: '+(await pagina.$eval('#modal-container', e=>e.className+' '+e.innerText.slice(0,300)).catch(()=>'')));
  assert.equal(neg.vendedorId, 'sv1');
  assert.ok(neg.pruebaHasta > hoy+29*86400000);
  let ejemplos=0, login=null;
  for(let i=0;i<60 && !(ejemplos && login);i++){ await espera(250);
    ejemplos=Object.values((await rest('data/data_'+neg.id+'_productos_r'))||{}).filter(x=>x.ejemplo).length;
    login=await rest('login/clientev'); }
  assert.ok(ejemplos>0, 'productos de ejemplo');
  assert.ok(login && login.uid, 'cuenta del administrador');
  const us=Object.values((await rest('data/data_'+neg.id+'_usuarios_r'))||{});
  assert.ok(us.some(u=>u.usuario==='clientev' && u.uid===login.uid), 'registro del administrador en su negocio');
  assert.equal(await rest('perfiles/'+login.uid+'/debeCambiarPass'), true, 'P1: cambia la clave al primer ingreso');
  await pagina.waitForSelector('#pass-inicial', {visible:true});
  await pagina.evaluate(()=>WS.cerrarModal());

  // Entrar a su demo: carga sus datos (negocio activo); borrarla: se va todo
  await pagina.evaluate(()=>WS.entrarComoNegocio('ndemo'));
  await pagina.waitForFunction(()=>datosDe('ndemo','productos').length===1, {timeout:15000});
  assert.equal(await rest('perfiles/'+alta.localId+'/negocioActivo'), 'ndemo');
  await pagina.evaluate(()=>WS.volverSuperAdmin());
  await pagina.evaluate(()=>WS.eliminarDemoVendedor('ndemo'));
  await pagina.click('#modal-ok');
  let queda=true;
  for(let i=0;i<60 && queda;i++){ await espera(250); queda=!!(await rest('data/negocios_r/ndemo')) || !!(await rest('data/data_ndemo_productos_r')); }
  assert.equal(queda, false, 'demo y sus datos borrados');
  await salir();
  pagina.off('console', oirNegados);
  assert.deepEqual(negados, [], 'ninguna escritura o lectura negada por las reglas');
});
test('facturas con la nube: bloque por equipo, provisional sin bloque y número definitivo al reconectar', {skip:omitir}, async ()=>{
  await entrar('admin', 'clavedueno');
  await esperarTexto('Licorera');
  await pagina.evaluate(()=>{ localStorage.removeItem('ws_bloque_n1'); WS.fijarFacturaReservada(); WS.entrarComoNegocio('n1'); });
  await pagina.waitForFunction(()=>WS.leerBloque('n1').length>0, {timeout:15000});   // al entrar aparta su bloque
  const r=await pagina.evaluate(async ()=>{
    const espera=ms=>new Promise(res=>setTimeout(res,ms));
    const res={};
    const bloque=WS.leerBloque('n1');
    res.bloque=Dominio.facturas.quedanEnBloque(bloque);
    res.normal=WS.siguienteFactura();
    res.delBloque=Dominio.facturas.numeroDe(res.normal)===bloque[0][0];
    // Sin bloque (como un equipo que arrancó sin internet): provisional que no se repite
    localStorage.setItem('ws_bloque_n1','[]');
    const p1=WS.siguienteFactura(), p2=WS.siguienteFactura();
    res.provisional=Dominio.facturas.esProvisional(p1) && p1!==p2 && Dominio.facturas.equipoDeProvisional(p1)===WS.codigoEquipo();
    Datos.guardarEn('n1', 'ventas', [{id:'vprov1', factura:p1, estado:'pagada', items:[], total:1000, fecha:new Date().toISOString(), pagos:{efectivo:1000, banco:0, tarjeta:0}}]);
    await espera(800);
    // "Reconecta": aparta bloque y la venta recibe su número definitivo
    WS.reservarFactura();
    for(let i=0;i<40;i++){ const v=misDatos('ventas').find(x=>x.id==='vprov1'); if(v && !Dominio.facturas.esProvisional(v.factura)) break; await espera(250); }
    const v=misDatos('ventas').find(x=>x.id==='vprov1');
    res.definitiva=/^F-\d+$/.test(v.factura) && v.facturaProvisional===p1;
    res.unicas=Dominio.facturas.repetidas(misDatos('ventas')).length===0;
    WS.volverSuperAdmin();
    return res;
  });
  assert.equal(r.bloque, 20);
  assert.deepEqual([r.delBloque, r.provisional, r.definitiva, r.unicas], [true, true, true, true]);
  const enBase=await rest('data/data_n1_ventas_r/vprov1');
  assert.match(enBase.factura, /^F-\d+$/);
  assert.ok(enBase.facturaProvisional.startsWith('P-'));
  await salir();
});
test('olvidé mi contraseña: pedir desde el login, el dueño genera una temporal y al entrar se obliga a cambiarla', {skip:omitir}, async ()=>{
  await pagina.waitForSelector('.login-olvide', {visible:true, timeout:15000});
  await escribir('#l-user', 'MARCE');
  await pagina.click('.login-olvide');
  await pagina.waitForSelector('#m-usuario', {visible:true});
  await pagina.$eval('#m-contacto', e=>{ e.value='3001234567'; });
  await pagina.evaluate(()=>document.getElementById('modal-ok').click());   // directo: un aviso puede tapar el botón
  await pagina.waitForFunction(()=>((document.getElementById('modal-container')||{}).innerText||'').includes('Solicitud enviada'), {timeout:20000});
  await pagina.evaluate(()=>WS.cerrarModal());
  const sol=await rest('recuperaciones/MARCE');
  assert.equal(sol.estado, 'pendiente'); assert.equal(sol.contacto, '3001234567'); assert.ok(sol.fecha>0);
  // El dueño del sistema la ve y genera la temporal
  await entrar('admin', 'clavedueno');
  await esperarTexto('Solicitudes de contraseña');
  // El botón aparece cuando el panel ya tiene los usuarios del negocio (llegan después de las solicitudes)
  await pagina.waitForSelector("[data-click=\"generarTemporal('MARCE')\"]", {visible:true, timeout:20000});
  // Su PROPIA solicitud: sin botón, y aunque se llame la acción no cambia nada ni lo saca de la sesión
  // (antes reemplazaba su cuenta, la app cerraba la sesión y la temporal se perdía sin mostrarse)
  const uidAntes=(await rest('login/admin')).uid;
  await rest('recuperaciones/admin', 'PUT', {usuario:'admin', estado:'pendiente', fecha:Date.now()});
  await esperarTexto('Es tu cuenta');
  assert.equal(await pagina.$("[data-click=\"generarTemporal('admin')\"]"), null);
  await pagina.evaluate(()=>WS.generarTemporal('admin'));
  await espera(800);
  assert.equal(await pagina.evaluate(()=>!!document.querySelector('#modal-container.activo')), false, 'no pide confirmar');
  assert.equal((await rest('login/admin')).uid, uidAntes, 'su cuenta sigue igual');
  assert.equal(await pagina.evaluate(()=>WS.STATE.user && WS.STATE.user.usuario), 'admin', 'sigue en su sesión');
  await rest('recuperaciones/admin', 'DELETE');
  await pagina.evaluate(()=>WS.generarTemporal('MARCE'));
  await pagina.waitForSelector('#modal-ok', {visible:true}); await pagina.evaluate(()=>document.getElementById('modal-ok').click());   // directo: un aviso puede tapar el botón
  await pagina.waitForSelector('#pass-temporal', {visible:true, timeout:20000}).catch(async e=>{
    const info=await pagina.evaluate(()=>({toasts:Array.from(document.querySelectorAll('#toasts .toast')).map(t=>t.textContent),
      modal:((document.getElementById('modal-container')||{}).innerText||'').slice(0,300), user:WS.STATE.user&&WS.STATE.user.usuario}));
    throw new Error('No apareció la temporal: '+JSON.stringify(info));
  });
  const temporal=await pagina.$eval('#pass-temporal', e=>e.textContent.trim());
  assert.equal(temporal.length, 10);
  await pagina.evaluate(()=>WS.cerrarModal());
  assert.equal((await rest('recuperaciones/MARCE')).estado, 'resuelta');
  const aud=Object.values((await rest('data/data_n1_auditoria_r'))||{});
  assert.ok(aud.some(a=>a.accion==='Restableció la contraseña'), 'queda en la auditoría del negocio');
  await salir();
  // La vieja ya no sirve; con la temporal, cambio obligatorio
  const antes=errores.length;
  await entrar('MARCE', 'marce2026');
  await espera(1500);
  // Entrar con la contraseña vieja falla a propósito: el 400 de Authentication que anota el navegador es el esperado
  errores.splice(antes, errores.length-antes, ...errores.slice(antes).filter(e=>!/status of 400/.test(e)));
  assert.equal(await pagina.evaluate(()=>!!WS.STATE.user), false, 'la contraseña vieja ya no entra');
  await entrar('MARCE', temporal);
  await esperarTexto('Entraste con una contraseña temporal');
  await escribir('#cp-nueva', 'marce2027'); await escribir('#cp-nueva2', 'marce2027');
  await pagina.click('.login-btn');
  await pagina.waitForFunction(()=>WS.STATE.user && !WS.STATE.debeCambiarPass, {timeout:20000});
  await salir();
  await entrar('MARCE', 'marce2027');
  await pagina.waitForFunction(()=>WS.STATE.user && WS.STATE.negocio && !WS.STATE.debeCambiarPass, {timeout:20000});
  await salir();
});
test('el dueño pasa su cuenta a su correo real: entra con el correo y recupera la contraseña con el enlace de Firebase', {skip:omitir}, async ()=>{
  const AUTH='http://'+AUTH_HOST;
  // Empezar limpio aunque la prueba anterior haya fallado a mitad
  await pagina.evaluate(()=>{ try{ WS.cerrarModal(); }catch(e){} if(WS.STATE.user) WS.logout(); });
  await pagina.waitForSelector('#l-user', {visible:true, timeout:15000});
  await entrar('admin', 'clavedueno');
  await pagina.waitForSelector('[data-click="pasarAMiCorreo()"]', {timeout:15000});   // está en el menú "👤 Mi cuenta" (cerrado)
  await pagina.evaluate(()=>WS.pasarAMiCorreo());
  await pagina.waitForSelector('#m-correo', {visible:true});
  await pagina.evaluate(()=>{ const v={'m-correo':'dueno@ejemplo.com', 'm-actual':'clavedueno', 'm-nueva':'dueno2027', 'm-nueva2':'dueno2027'};
    Object.keys(v).forEach(id=>{ document.getElementById(id).value=v[id]; }); });
  await pagina.evaluate(()=>document.getElementById('modal-ok').click());   // directo: un aviso puede tapar el botón
  await pagina.waitForFunction(()=>!WS.STATE.user && ((document.getElementById('modal-container')||{}).innerText||'').includes('dueno@ejemplo.com'), {timeout:20000});
  await pagina.evaluate(()=>WS.cerrarModal());
  // El índice público no tiene el correo: solo la marca
  const ix=await rest('login/admin');
  assert.equal(ix.correo, '@correo');
  assert.equal(JSON.stringify(await rest('login')).includes('dueno@ejemplo.com'), false);
  // Con el usuario ya no entra (se le dice que use el correo); con el correo sí
  const antes=errores.length;
  await entrar('admin', 'dueno2027');
  await espera(1500);
  assert.equal(await pagina.evaluate(()=>!!WS.STATE.user), false);
  await entrar('dueno@ejemplo.com', 'dueno2027');
  await pagina.waitForFunction(()=>WS.STATE.user && WS.STATE.esSuperAdmin, {timeout:20000});
  await salir();
  // Olvidó la contraseña: "¿Olvidaste tu contraseña?" con el correo → enlace de Firebase
  await escribir('#l-user', 'dueno@ejemplo.com');
  await pagina.click('.login-olvide');
  await pagina.waitForSelector('#m-usuario', {visible:true});
  await pagina.evaluate(()=>document.getElementById('modal-ok').click());   // directo: un aviso puede tapar el botón
  await pagina.waitForFunction(()=>((document.getElementById('modal-container')||{}).innerText||'').includes('Revisa tu correo'), {timeout:20000});
  await pagina.evaluate(()=>WS.cerrarModal());
  const codigos=(await (await fetch(AUTH+'/emulator/v1/projects/demo-wallace/oobCodes')).json()).oobCodes||[];
  assert.ok(codigos.some(c=>c.email==='dueno@ejemplo.com' && c.requestType==='VERIFY_EMAIL'), 'se mandó la verificación del correo');
  const reset=codigos.reverse().find(c=>c.email==='dueno@ejemplo.com' && c.requestType==='PASSWORD_RESET');
  assert.ok(reset, 'se mandó el enlace para cambiar la contraseña');
  const r=await (await fetch(AUTH+'/identitytoolkit.googleapis.com/v1/accounts:resetPassword?key=demo-key', {method:'POST',
    headers:{'Content-Type':'application/json'}, body:JSON.stringify({oobCode:reset.oobCode, newPassword:'dueno2028'})})).json();
  assert.equal(r.email, 'dueno@ejemplo.com');
  await entrar('dueno@ejemplo.com', 'dueno2028');
  await pagina.waitForFunction(()=>WS.STATE.user && WS.STATE.esSuperAdmin, {timeout:20000});
  await salir();
  // Los intentos fallidos a propósito dejan un 400 de Authentication en la consola: es lo esperado
  errores.splice(antes, errores.length-antes, ...errores.slice(antes).filter(e=>!/status of 400/.test(e)));
});
test('sin errores de JavaScript en la página', {skip:omitir}, ()=>{
  assert.deepEqual(errores, []);
});
