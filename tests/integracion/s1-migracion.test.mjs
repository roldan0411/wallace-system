// Ensayo completo de S1 (Plan B) con los adaptadores REALES contra los emuladores
// de Firebase Authentication y Realtime Database. Datos sintéticos con la misma
// forma que producción (negocios en array, contraseñas en texto plano y cortas).
//   npm run test:firebase     (levanta los emuladores; requiere Java 11+)
// Con "npm test" a secas se omite.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as fbApp from 'firebase/app';
import * as fbDatabase from 'firebase/database';
import * as fbAuth from 'firebase/auth';
import { crearAdaptadorFirebase } from '../../src/adaptadores/salida/firebase-datos.js';
import { crearAdaptadorCuentas } from '../../src/adaptadores/salida/firebase-cuentas.js';
import { crearAlmacenLocal } from '../../src/adaptadores/salida/almacen-local.js';
import { crearServicioSesion } from '../../src/aplicacion/servicios/sesion.js';
import * as cuentas from '../../src/dominio/cuentas.js';
import * as contrasenas from '../../src/dominio/contrasenas.js';
import { nuevaSal } from '../../src/adaptadores/salida/cripto-navegador.js';

const DB_HOST=process.env.FIREBASE_DATABASE_EMULATOR_HOST, AUTH_HOST=process.env.FIREBASE_AUTH_EMULATOR_HOST;
const omitir=!(DB_HOST && AUTH_HOST) && 'sin emuladores (npm run test:firebase)';
const PROYECTO='demo-wallace', NS=PROYECTO+'-default-rtdb';
const CONFIG={apiKey:'demo-key', authDomain:PROYECTO+'.firebaseapp.com', projectId:PROYECTO, databaseURL:'https://'+NS+'.firebaseio.com'};
const PANT={admin:['inicio','config'], cajero:['inicio','ventas'], dueno:['inicio','config']};

// REST del emulador con permisos de dueño (sin reglas)
const rest=(ruta, metodo, cuerpo)=>fetch('http://'+DB_HOST+'/'+ruta+'.json?ns='+NS, {method:metodo||'GET',
  headers:{Authorization:'Bearer owner'}, body:cuerpo===undefined?undefined:JSON.stringify(cuerpo)}).then(r=>r.json());
const ponerReglas=archivo=>rest('.settings/rules', 'PUT', JSON.parse(readFileSync(new URL('../../'+archivo, import.meta.url),'utf8')));
const borrarCuentasAuth=()=>fetch('http://'+AUTH_HOST+'/emulator/v1/projects/'+PROYECTO+'/accounts', {method:'DELETE'});

// El mismo SDK modular que usa el navegador, desde npm; los adaptadores se conectan a los emuladores
const SDK={app:fbApp, database:fbDatabase, auth:fbAuth};
const EMULADORES={database:DB_HOST, auth:AUTH_HOST};
function memoria(){ const m=new Map(); return {getItem:k=>m.has(k)?m.get(k):null, setItem:(k,v)=>m.set(k,String(v)),
  removeItem:k=>m.delete(k), key:i=>[...m.keys()][i]??null, get length(){ return m.size; }}; }

let datos, C, sesion;
const LEGADO={
  negocios:[
    {id:'n1', nombre:'Licorera', activo:true, plan:'Básico', funciones:['ventas','inventario'], creado:'2026-01-01T00:00:00Z', logo:'data:x'},
    {id:'n2', nombre:'Tienda', activo:true, plan:'Premium', funciones:['ventas'], creado:'2026-02-01T00:00:00Z'}
  ],
  usuarios:[
    {id:'u1', negocioId:'n1', usuario:'BURGOS', nombre:'Alejo', rol:'dueno', pass:'burgos1', activo:true},
    {id:'u2', negocioId:'n1', usuario:'MARCE', nombre:'Marcela', rol:'dueno', pass:'1234', activo:true},
    {id:'u3', negocioId:'n2', usuario:'vapeo', nombre:'Admin', rol:'admin', pass:'vape', activo:true}
  ],
  superadmins:[{id:'s1', usuario:'admin', nombre:'Roldán', rolSuper:'dueno', pass:'clavedueno'}],
  data_n1_ventas:[{id:'v1', total:1000, fecha:'2026-10-01T10:00:00Z'}],
  data_n2_ventas_r:{v9:{id:'v9', total:9}}
};

before(async ()=>{
  if(omitir) return;
  await borrarCuentasAuth();
  await ponerReglas('database.rules.transicion.json');
  await rest('', 'PUT', {data:LEGADO});
  datos=crearAdaptadorFirebase({local:crearAlmacenLocal(memoria(),'ws_'), sdk:SDK, config:CONFIG, emuladores:EMULADORES, ganchos:{}});
  assert.equal(datos.iniciar(), true);
  C=crearAdaptadorCuentas({sdk:SDK, config:CONFIG, emuladores:EMULADORES, cuentas, aleatorio:nuevaSal});
  assert.equal(C.iniciar(), true);
  datos.configurarSesion({cuentas:true});
  sesion=crearServicioSesion({cuentas:C, dominio:{cuentas, contrasenas}, pantallasPorRol:PANT,
    leerUsuarioNegocio:(n,id)=>datos.leerRegistro(n,'usuarios',id),
    retirarClaveVieja:({tipo,id})=>tipo==='super'
      ? datos.transaccionGlobal('superadmins', cur=>{ if(cur===null) return null; const l=Object.values(cur); const x=l.find(s=>s.id===id); cuentas.CAMPOS_PASS.forEach(k=>delete x[k]); return l; })
      : datos.modificarUsuariosLegado(l=>l.filter(x=>x.id!==id))});
});
after(async ()=>{ if(omitir) return; await C.salir(); await Promise.all(fbApp.getApps().map(a=>fbApp.deleteApp(a))); });

test('fase 2: el dueño del sistema migra su cuenta y las tablas globales', {skip:omitir}, async ()=>{
  const r=await sesion.iniciarSesion('admin', 'clavedueno');
  assert.equal(r.ok, true, r.motivo); assert.equal(r.perfil.rol, 'superadmin');
  datos.configurarSesion({cuentas:true, superAdmin:true});
  const m=await datos.migrarTablasGlobales();
  assert.deepEqual([m.hecho, m.negocios, m.usuarios], [true, 2, 3]);
  const d=await rest('data');
  assert.equal(d.negocios, undefined); assert.ok(d.negocios_bk);
  assert.equal(d.negocios_r.n1.nombre, 'Licorera');
  assert.equal(d.negocios_r.n1.logo, '');                       // S8: el logo 'data:x' no es imagen: se quita y la migración sigue
  assert.equal(d.data_n1_usuarios_r.u2.usuario, 'MARCE');
  for(const k of cuentas.CAMPOS_PASS) assert.equal(k in d.data_n1_usuarios_r.u2, false);
  assert.equal(d.superadmins[0].pass, undefined);               // su clave vieja se retiró
  assert.equal((await datos.migrarTablasGlobales()).motivo, 'ya_migrado');
  await C.salir();
});
test('fase 2: un empleado migra con su misma contraseña; otro con contraseña corta elige una nueva', {skip:omitir}, async ()=>{
  const r=await sesion.iniciarSesion('BURGOS', 'burgos1');
  assert.equal(r.ok, true, r.motivo); assert.equal(r.perfil.negocioId, 'n1'); assert.equal(r.perfil.editaNegocio, true);
  await C.salir();
  const r2=await sesion.iniciarSesion('vapeo', 'vape', {pedirPassNueva:async ()=>'vapeo2026'});
  assert.equal(r2.ok, true, r2.motivo); assert.equal(r2.passCambiada, true);
  await C.salir();
  assert.equal((await sesion.iniciarSesion('vapeo', 'vape')).motivo, 'credenciales');   // la vieja ya no sirve
  const d=await rest('data/usuarios');
  assert.deepEqual(Object.values(d).map(u=>u.usuario), ['MARCE']);                        // solo queda el pendiente
});
test('fase 4: con reglas cerradas cada negocio queda aislado', {skip:omitir}, async ()=>{
  await ponerReglas('database.rules.json');
  const r=await sesion.iniciarSesion('BURGOS', 'burgos1');
  assert.equal(r.ok, true, r.motivo);
  datos.configurarSesion({cuentas:true, superAdmin:false, negId:'n1'});
  const neg=await datos.cargarNegocioPropio('n1');
  assert.equal(neg.nombre, 'Licorera');
  const db=fbDatabase.getDatabase(fbApp.getApp());
  const leer=r=>fbDatabase.get(fbDatabase.ref(db, r));
  await assert.rejects(leer('data/data_n2_ventas_r'));
  await assert.rejects(leer('data/usuarios'));
  await assert.rejects(leer('data/negocios_r/n2'));
  assert.equal((await leer('data/data_n1_ventas')).val().length, 1);   // tabla vieja de su negocio: legible para migrarla
  // Mi Negocio: solo se envían los campos permitidos (el plan se ignora sin romper el resto)
  datos.set('negocios', [Object.assign({}, neg, {nombre:'Licorera La M', plan:'Premium', inventarioApagado:true})]);
  await new Promise(res=>setTimeout(res, 400));
  const n1=await rest('data/negocios_r/n1');
  assert.deepEqual([n1.nombre, n1.plan, n1.inventarioApagado], ['Licorera La M', 'Básico', true]);
  datos.detenerSincNegocio();
  await C.salir();
  // Quien no migró antes del cierre ya no puede migrar solo
  assert.equal((await sesion.iniciarSesion('MARCE', '1234', {pedirPassNueva:async ()=>'marce2026'})).motivo, 'credenciales');
});
test('fase 3/4: el super-admin crea la cuenta del pendiente sin perder su sesión', {skip:omitir}, async ()=>{
  const r=await sesion.iniciarSesion('admin', 'clavedueno');
  assert.equal(r.ok, true, r.motivo);
  const marce={id:'u2', negocioId:'n1', usuario:'MARCE', nombre:'Marcela', rol:'dueno', activo:true};
  const cuenta=await C.crearCuentaAjena('marce2026');
  const perfil=cuentas.perfilDesdeUsuario(marce, PANT); perfil.migradoEn=new Date().toISOString();
  await C.guardarCuenta({uid:cuenta.uid, correo:cuenta.correo, usuario:'MARCE', perfil});
  assert.equal(fbAuth.getAuth(fbApp.getApp()).currentUser.uid, r.uid);          // sigue siendo el super-admin
  const ix=await C.leerIndice();
  const filas=cuentas.estadoMigracion({superadmins:[{id:'s1', usuario:'admin', rolSuper:'dueno'}],
    usuarios:Object.values((await rest('data/data_n1_usuarios_r'))).concat(Object.values(await rest('data/data_n2_usuarios_r'))),
    perfiles:ix.perfiles, login:ix.login});
  assert.deepEqual(cuentas.resumenMigracion(filas), {total:4, migradas:4, pendientes:0, revisar:0});
  await C.salir();
  const r2=await sesion.iniciarSesion('MARCE', 'marce2026');
  assert.equal(r2.ok, true, r2.motivo);
  await C.salir();
});
test('desactivar un perfil corta el acceso aunque la contraseña sea correcta', {skip:omitir}, async ()=>{
  await sesion.iniciarSesion('admin', 'clavedueno');
  const ent=await C.buscarLogin('BURGOS');
  await C.actualizarPerfil(ent.uid, {activo:false});
  await C.salir();
  assert.equal((await sesion.iniciarSesion('BURGOS', 'burgos1')).motivo, 'inactivo');
});
test('avisos entre equipos (5425800): pedido nuevo y caja abierta/cerrada de otro equipo; lo propio y la carga no se avisan', {skip:omitir}, async ()=>{
  await ponerReglas('database.rules.transicion.json');
  await rest('data/data_n9_ventas_r', 'PUT', {v1:{id:'v1', total:5}});
  const nuevos=[], tablas=[];
  const d2=crearAdaptadorFirebase({local:crearAlmacenLocal(memoria(),'ws2_'), sdk:SDK, config:CONFIG, emuladores:EMULADORES, ganchos:{
    alRegistroNuevo:(t,v,o)=>nuevos.push([t,v.id,o.inicial]),
    alCambiarTabla:(t,v,antes,o)=>{ if(t==='caja_actual') tablas.push([v?v.length:0, o.inicial]); }}});
  assert.equal(d2.iniciar(), true);
  d2.sincronizarNegocio('n9');
  await new Promise(res=>setTimeout(res, 2800));              // pasa la carga inicial
  await rest('data/data_n9_ventas_r/v2', 'PUT', {id:'v2', total:7});      // otro equipo toma un pedido
  d2.guardarEn('n9', 'ventas', [{id:'v3', total:9}]);                     // este equipo toma uno
  await rest('data/data_n9_caja_actual', 'PUT', [{id:'c1', cajero:'Ana', sucursalId:'principal'}]);   // otro abre la caja
  await new Promise(res=>setTimeout(res, 500));
  await rest('data/data_n9_caja_actual', 'DELETE');                      // y la cierra
  await new Promise(res=>setTimeout(res, 500));
  d2.detenerSincNegocio();
  assert.deepEqual(nuevos, [['ventas','v2',false]]);   // ni v1 (ya estaba) ni v3 (propio)
  assert.deepEqual(tablas, [[1,false],[0,false]]);
});
test('D9: agregar a una cuenta con una copia vieja pisaba lo de otro equipo; con transaccionRegistro no', {skip:omitir}, async ()=>{
  await ponerReglas('database.rules.transicion.json');
  const ventas=await import('../../src/dominio/ventas.js');
  const it=(p,q)=>({prodId:p, nombre:p, qty:q, precio:1000});
  await rest('data/data_n8_ventas_r', 'PUT', {c1:{id:'c1', estado:'abierta', items:[it('a',1)], total:1000}, c2:{id:'c2', estado:'abierta', items:[it('a',1)], total:1000}});
  const d=crearAdaptadorFirebase({local:crearAlmacenLocal(memoria(),'ws8_'), sdk:SDK, config:CONFIG, emuladores:EMULADORES, ganchos:{negocioActual:()=>({id:'n8'})}});
  assert.equal(d.iniciar(), true);
  d.sincronizarNegocio('n8');
  await new Promise(res=>setTimeout(res, 1500));
  const viejo=id=>JSON.parse(JSON.stringify(d.misDatos('ventas').find(v=>v.id===id)));
  const copia1=viejo('c1'), copia2=viejo('c2');                   // este equipo abrió las dos cuentas
  // Otro equipo agrega "b" a las dos
  await rest('data/data_n8_ventas_r/c1/items', 'PUT', [it('a',1), it('b',1)]);
  await rest('data/data_n8_ventas_r/c2/items', 'PUT', [it('a',1), it('b',1)]);
  await new Promise(res=>setTimeout(res, 600));
  // Antes: este equipo suma "c" a SU copia y la guarda campo por campo -> "b" se pierde
  copia1.items.push(it('c',1)); d.guardarEn('n8', 'ventas', [copia1]);
  // Ahora: se suma "c" dentro de la transacción, sobre lo que tiene el servidor
  const r=await d.transaccionRegistro('ventas', 'c2', cur=>ventas.agregarACuenta(cur, [it('c',1)], {}));
  await new Promise(res=>setTimeout(res, 600));
  const srv=await rest('data/data_n8_ventas_r');
  assert.deepEqual(srv.c1.items.map(i=>i.prodId), ['a','c'], 'la forma vieja pierde lo del otro equipo');
  assert.equal(r.committed, true);
  assert.deepEqual(srv.c2.items.map(i=>i.prodId), ['a','b','c'], 'con la transacción no se pierde nada');
  // Cobrar con lo que se vio: si el otro equipo agregó algo, no se cobra a ciegas
  await rest('data/data_n8_ventas_r/c2/items', 'PUT', [it('a',1), it('b',1), it('c',1), it('d',1)]);
  await new Promise(res=>setTimeout(res, 600));
  const cobro=await d.transaccionRegistro('ventas', 'c2', cur=>ventas.cobrarSiSigueIgual(cur, srv.c2.items, {pagos:{efectivo:3000, banco:0, tarjeta:0}, total:3000}));
  assert.equal(cobro.committed, false);
  assert.equal((await rest('data/data_n8_ventas_r/c2/estado')), 'abierta');
  d.detenerSincNegocio();
});
test('restaurar un negocio desde un respaldo: vuelve todo como estaba y limpia lo que las reglas rechazarían', {skip:omitir}, async ()=>{
  await ponerReglas('database.rules.transicion.json');
  await rest('data/negocios_r/n7', 'PUT', {id:'n7', nombre:'Siete', activo:true, logo:''});
  await rest('data/data_n7_ventas_r', 'PUT', {v1:{id:'v1', total:1}, v2:{id:'v2', total:2}});
  await rest('data/data_n7_clientes_r', 'PUT', {c1:{id:'c1', nombre:'Ana'}});
  const d=crearAdaptadorFirebase({local:crearAlmacenLocal(memoria(),'ws7_'), sdk:SDK, config:CONFIG, emuladores:EMULADORES, ganchos:{}});
  assert.equal(d.iniciar(), true);
  const respaldo=(await d.exportarTodo()).datos;
  // Después del respaldo: ventas nuevas, cliente borrado, nombre cambiado
  await rest('data/data_n7_ventas_r/v3', 'PUT', {id:'v3', total:3});
  await rest('data/data_n7_clientes_r', 'DELETE');
  await rest('data/negocios_r/n7/nombre', 'PUT', 'Siete cambiado');
  // Un respaldo con algo que las reglas rechazarían (S8) no debe hacer fallar todo
  const copia=JSON.parse(JSON.stringify(respaldo));
  copia.negocios_r.n7.logo='x" onerror="alert(1)';
  copia.data_n7_ventas_r['malo']={id:'x" onmouseover="1', total:9};
  const r=await d.restaurarNegocio('n7', copia);
  assert.equal(r.ok, true);
  const srv=await rest('data');
  assert.deepEqual(Object.keys(srv.data_n7_ventas_r).sort(), ['v1','v2']);
  assert.equal(srv.data_n7_clientes_r.c1.nombre, 'Ana');
  assert.equal(srv.negocios_r.n7.nombre, 'Siete');
  assert.equal(srv.negocios_r.n7.logo, '');
  await assert.rejects(d.restaurarNegocio('no-existe', copia));
});
test('facturas: dos equipos apartan bloques a la vez y no se pisan', {skip:omitir}, async ()=>{
  await ponerReglas('database.rules.transicion.json');
  await rest('data/data_n6_factura_seq', 'PUT', 100);
  const nuevo=pre=>{ const d=crearAdaptadorFirebase({local:crearAlmacenLocal(memoria(),pre), sdk:SDK, config:CONFIG, emuladores:EMULADORES, ganchos:{}}); assert.equal(d.iniciar(), true); return d; };
  const a=nuevo('wsA_'), b=nuevo('wsB_');
  const [ha, hb, hc]=await Promise.all([a.reservarConsecutivo('n6', 0, 20), b.reservarConsecutivo('n6', 0, 20), a.reservarConsecutivo('n6', 130, 20)]);
  const bloques=[[ha-19,ha],[hb-19,hb],[hc-19,hc]].sort((x,y)=>x[0]-y[0]);
  for(let i=1;i<bloques.length;i++) assert.ok(bloques[i][0]>bloques[i-1][1], 'bloques sin cruzarse: '+JSON.stringify(bloques));
  assert.ok(bloques[0][0]>100);
  assert.equal(await rest('data/data_n6_factura_seq'), Math.max(ha,hb,hc));
});
