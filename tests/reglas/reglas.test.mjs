// Pruebas de las reglas de Realtime Database (S1) contra el EMULADOR de Firebase.
// No tocan ninguna base real: proyecto "demo-wallace", solo en memoria.
//   npm run test:firebase      (levanta el emulador, corre esto y lo apaga; requiere Java 11+)
// Con "npm test" a secas se omiten (no hay emulador).
import { test, describe, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';

const HAY_EMULADOR=!!process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const reglas=archivo=>readFileSync(new URL('../../'+archivo, import.meta.url), 'utf8');

// Datos de prueba: dos negocios (N1 activo, N10 para probar prefijos), perfiles de cada tipo
const PERFILES={
  sa:      {rol:'superadmin', rolSuper:'dueno', usuario:'dueno', activo:true},
  saOff:   {rol:'superadmin', rolSuper:'ayudante', usuario:'viejo', activo:false},
  admin1:  {rol:'admin', usuario:'admin1', negocioId:'N1', activo:true, editaNegocio:true},
  cajero1: {rol:'cajero', usuario:'caja1', negocioId:'N1', activo:true, editaNegocio:false},
  cajeroOff:{rol:'cajero', usuario:'caja2', negocioId:'N1', activo:false, editaNegocio:false},
  cajero10:{rol:'cajero', usuario:'caja10', negocioId:'N10', activo:true, editaNegocio:false},
  ayu:     {rol:'superadmin', rolSuper:'ayudante', usuario:'ayu', superId:'s2', activo:true},
  vend1:   {rol:'superadmin', rolSuper:'vendedor', usuario:'vende1', superId:'sv1', activo:true},
  vend2:   {rol:'superadmin', rolSuper:'vendedor', usuario:'vende2', superId:'sv2', activo:true},
  cajeroV: {rol:'cajero', usuario:'cajav', negocioId:'NV', activo:true, editaNegocio:false}
};
function datosBase(n1Activo){
  return {
    perfiles:PERFILES,
    login:{admin1:{correo:'ua@x.app', uid:'admin1'}, caja1:{correo:'uc@x.app', uid:'cajero1'}},
    data:{
      negocios_r:{
        N1:{id:'N1', nombre:'Uno', activo:n1Activo, plan:'Básico', funciones:['ventas']},
        N10:{id:'N10', nombre:'Diez', activo:true},
        NV:{id:'NV', nombre:'Prueba del vendedor 1', activo:true, vendedorId:'sv1', pruebaDesde:Date.now()-5*86400000, pruebaHasta:Date.now()+25*86400000},
        ND:{id:'ND', nombre:'Demo del vendedor 1', activo:true, esDemo:true, demoDe:'sv1', pruebaDesde:Date.now()-5*86400000, pruebaHasta:Date.now()+10*86400000}
      },
      superadmins:[{id:'s1', usuario:'dueno'}],
      usuarios:[{id:'u1', usuario:'caja1', passHash:'x'}],
      data_N1_ventas_r:{v1:{id:'v1', total:1000}},
      data_N1_usuarios_r:{u1:{id:'u1', usuario:'caja1', rol:'cajero'}},
      data_N1_factura_seq:7,
      data_N10_ventas_r:{v9:{id:'v9', total:9}},
      data_NV_ventas_r:{v5:{id:'v5', total:5}}
    }
  };
}

describe('reglas cerradas (database.rules.json)', {skip:!HAY_EMULADOR && 'sin emulador (npm run test:firebase)'}, ()=>{
  let env;
  const db=uid=>uid ? env.authenticatedContext(uid).database() : env.unauthenticatedContext().database();
  const sembrar=n1Activo=>env.withSecurityRulesDisabled(c=>c.database().ref().set(datosBase(n1Activo)));
  before(async ()=>{ env=await initializeTestEnvironment({projectId:'demo-wallace', database:{rules:reglas('database.rules.json')}}); });
  after(async ()=>{ if(env) await env.cleanup(); });
  beforeEach(async ()=>{ await env.clearDatabase(); await sembrar(true); });

  test('sin sesión no se lee nada salvo una entrada del índice de login', async ()=>{
    await assertFails(db(null).ref('data').once('value'));
    await assertFails(db(null).ref('data/negocios_r/N1').once('value'));
    await assertFails(db(null).ref('perfiles').once('value'));
    await assertFails(db(null).ref('login').once('value'));          // no se puede listar
    await assertSucceeds(db(null).ref('login/caja1').once('value'));
    await assertFails(db(null).ref('login/nuevo').set({correo:'a@b', uid:'z'}));
  });
  test('un empleado solo lee y escribe las tablas de su negocio', async ()=>{
    const d=db('cajero1');
    await assertSucceeds(d.ref('data/data_N1_ventas_r').once('value'));
    await assertSucceeds(d.ref('data/data_N1_ventas_r/v2').set({id:'v2', total:5}));
    await assertFails(d.ref('data/data_N10_ventas_r').once('value'));   // N1 no es prefijo de N10
    await assertFails(d.ref('data/data_N10_ventas_r/v3').set({id:'v3'}));
    await assertSucceeds(d.ref('data').update({'data_N1_ventas_r/v4':{id:'v4'}, 'data_N1_auditoria_r/a1':{id:'a1'}}));
  });
  test('una ruta prohibida en un update de varias rutas hace fallar todo el update', async ()=>{
    await assertFails(db('cajero1').ref('data').update({'data_N1_ventas_r/v5':{id:'v5'}, 'data_N10_ventas_r/v6':{id:'v6'}}));
  });
  test('transacción del consecutivo de factura', async ()=>{
    const r=await assertSucceeds(db('cajero1').ref('data/data_N1_factura_seq').transaction(c=>(c||0)+1));
    if(r.snapshot.val()!==8) throw new Error('esperaba 8, llegó '+r.snapshot.val());
  });
  test('un empleado lee los usuarios de su negocio pero no los modifica', async ()=>{
    const d=db('admin1');
    await assertSucceeds(d.ref('data/data_N1_usuarios_r').once('value'));
    await assertFails(d.ref('data/data_N1_usuarios_r/u1/rol').set('admin'));
    await assertFails(d.ref('data/data_N1_usuarios_x/u1').set(1));
  });
  test('ni credenciales ni tablas globales ni perfiles ajenos', async ()=>{
    const d=db('admin1');
    await assertFails(d.ref('data/usuarios').once('value'));
    await assertFails(d.ref('data/superadmins').once('value'));
    await assertFails(d.ref('perfiles/cajero1').once('value'));
    await assertSucceeds(d.ref('perfiles/admin1').once('value'));
    await assertFails(d.ref('perfiles/admin1/rol').set('superadmin'));
    await assertFails(d.ref('perfiles/admin1/negocioId').set('N10'));
    await assertFails(d.ref('login/admin1').set({correo:'x@y', uid:'admin1'}));
  });
  test('negocio: lo lee su gente; el admin edita Mi Negocio pero no estado, plan ni ventanas', async ()=>{
    await assertSucceeds(db('cajero1').ref('data/negocios_r/N1').once('value'));
    await assertFails(db('cajero1').ref('data/negocios_r/N10').once('value'));
    await assertFails(db('cajero1').ref('data/negocios_r/N1/nombre').set('X'));   // sin editaNegocio
    const a=db('admin1');
    await assertSucceeds(a.ref('data/negocios_r/N1/nombre').set('Uno SAS'));
    await assertSucceeds(a.ref('data').update({'negocios_r/N1/logo':'data:image/png;base64,iVBORw0KGgo=', 'negocios_r/N1/inventarioApagado':true}));
    for(const campo of ['activo','plan','funciones','precioMes','sucursales','vendedorId','esDemo','id','suspendidoDesde','motivoSuspension']){
      await assertFails(a.ref('data/negocios_r/N1/'+campo).set(campo==='activo'));
    }
    await assertFails(a.ref('data/negocios_r/N1').set({id:'N1', nombre:'todo'}));   // registro entero: solo super-admin
    await assertFails(a.ref('data/negocios_r/N10/nombre').set('ajeno'));
  });
  test('negocio suspendido: sus empleados pierden los datos pero ven el negocio', async ()=>{
    await env.clearDatabase(); await sembrar(false);
    await assertFails(db('cajero1').ref('data/data_N1_ventas_r').once('value'));
    await assertFails(db('cajero1').ref('data/data_N1_ventas_r/v7').set({id:'v7'}));
    await assertSucceeds(db('cajero1').ref('data/negocios_r/N1').once('value'));
    await assertFails(db('admin1').ref('data/negocios_r/N1/nombre').set('X'));
  });
  test('usuario desactivado: sin acceso', async ()=>{
    await assertFails(db('cajeroOff').ref('data/data_N1_ventas_r').once('value'));
    await assertFails(db('cajeroOff').ref('data/negocios_r/N1').once('value'));
  });
  test('una cuenta sin perfil (reemplazada o ajena) no lee nada', async ()=>{
    await assertFails(db('fantasma').ref('data/data_N1_ventas_r').once('value'));
    await assertFails(db('fantasma').ref('data/negocios_r/N1').once('value'));
    await assertFails(db('fantasma').ref('perfiles/fantasma').set({rol:'superadmin', usuario:'x'}));
  });
  test('el super-admin lee y escribe todo; inactivo, nada', async ()=>{
    const s=db('sa');
    await assertSucceeds(s.ref('data').once('value'));
    await assertSucceeds(s.ref('perfiles').once('value'));
    await assertSucceeds(s.ref('login').once('value'));
    await assertSucceeds(s.ref('perfiles/nuevo').set({rol:'cajero', usuario:'n', negocioId:'N1', activo:true}));
    await assertSucceeds(s.ref('login/n').set({correo:'n@x.app', uid:'nuevo'}));
    await assertSucceeds(s.ref('data/negocios_r/N1/activo').set(false));
    await assertFails(s.ref('perfiles/malo').set({sinRol:true}));     // validación
    await assertFails(db('saOff').ref('data').once('value'));
    await assertFails(db('saOff').ref('perfiles/x').set({rol:'superadmin', usuario:'x'}));
  });
  // Periodo de prueba (dominio/prueba.js): vencida = solo lectura para el negocio
  const ponerPrueba=hasta=>env.withSecurityRulesDisabled(c=>c.database().ref('data/negocios_r/N1').update({pruebaDesde:Date.now()-86400000, pruebaHasta:hasta}));
  test('prueba vigente: el negocio trabaja normal', async ()=>{
    await ponerPrueba(Date.now()+5*86400000);
    await assertSucceeds(db('cajero1').ref('data/data_N1_ventas_r/v2').set({id:'v2', total:5}));
    await assertSucceeds(db('admin1').ref('data/negocios_r/N1/nombre').set('Uno nuevo'));
  });
  test('prueba vencida: el negocio lee todo pero no escribe nada', async ()=>{
    await ponerPrueba(Date.now()-1000);
    const d=db('cajero1');
    await assertSucceeds(d.ref('data/data_N1_ventas_r').once('value'));
    await assertSucceeds(d.ref('data/negocios_r/N1').once('value'));
    await assertFails(d.ref('data/data_N1_ventas_r/v2').set({id:'v2', total:5}));
    await assertFails(d.ref('data/data_N1_factura_seq').set(8));
    await assertFails(db('admin1').ref('data/negocios_r/N1/nombre').set('Uno nuevo'));
  });
  test('los campos de la prueba solo los cambia el super-admin', async ()=>{
    await ponerPrueba(Date.now()+5*86400000);
    await assertFails(db('admin1').ref('data/negocios_r/N1/pruebaHasta').set(Date.now()+999*86400000));
    await assertFails(db('admin1').ref('data/negocios_r/N1/pruebaDesde').remove());
    await assertSucceeds(db('sa').ref('data/negocios_r/N1/pruebaHasta').set(Date.now()+30*86400000));
  });
  test('prueba vencida: el super-admin sí puede extenderla o pasarla a pago', async ()=>{
    await ponerPrueba(Date.now()-1000);
    await assertSucceeds(db('sa').ref('data/negocios_r/N1').update({pruebaDesde:null, pruebaHasta:null}));
    await assertSucceeds(db('cajero1').ref('data/data_N1_ventas_r/v2').set({id:'v2', total:5}));   // ya pagó: vuelve a escribir
  });
  // S8: el formato del logo y de los ids lo valida la base (ni la consola ni la API se lo saltan)
  test('S8: el logo solo como imagen data: y los ids sin comillas, para todos (también el super-admin)', async ()=>{
    const malo='x" onerror="alert(1)', bueno='data:image/png;base64,iVBORw0KGgo=';
    await assertFails(db('admin1').ref('data/negocios_r/N1/logo').set(malo));
    await assertFails(db('admin1').ref('data/negocios_r/N1/logo').set('data:image/svg+xml;base64,PHN2Zz4='));
    await assertSucceeds(db('admin1').ref('data/negocios_r/N1/logo').set(bueno));
    await assertSucceeds(db('admin1').ref('data/negocios_r/N1/logo').set(''));
    await assertSucceeds(db('admin1').ref('data/negocios_r/N1/logo').remove());
    await assertFails(db('sa').ref('data/negocios_r/N1/logo').set(malo));
    await assertFails(db('sa').ref('data/negocios_r/N1').update({logo:malo, nombre:'Uno'}));
    await assertFails(db('sa').ref('data/negocios_r/a"b').set({id:'a"b', nombre:'Malo', activo:true}));
    await assertFails(db('vend1').ref('data/negocios_r/NV/logo').set(malo));
    await assertFails(db('cajero1').ref('data/data_N1_ventas_r/x1').set({id:"x');alert(1);('", total:1}));
    await assertFails(db('cajero1').ref('data/data_N1_ventas_r/x2').set({id:'x" onmouseover="alert(1)', total:1}));
    await assertSucceeds(db('cajero1').ref('data/data_N1_ventas_r/idk2b9c').set({id:'idk2b9c', total:1}));
  });
  test('S10: auditoría y movimientos de solo agregar para la gente del negocio; el dueño del sistema sí los borra', async ()=>{
    await env.withSecurityRulesDisabled(c=>c.database().ref('data').update({
      'data_N1_auditoria_r/a0':{id:'a0', accion:'Anuló pedido', detalle:'F-1'},
      'data_N1_movimientos_r/m0':{id:'m0', tipo:'salida', cantidad:3}}));
    for(const quien of ['cajero1','admin1']){
      const d=db(quien);
      await assertSucceeds(d.ref('data/data_N1_auditoria_r/a'+quien).set({id:'a'+quien, accion:'Cobró'}));
      await assertFails(d.ref('data/data_N1_auditoria_r/a0/detalle').set('nada que ver'));
      await assertFails(d.ref('data/data_N1_auditoria_r/a0').remove());
      await assertFails(d.ref('data/data_N1_movimientos_r/m0/cantidad').set(0));
      await assertFails(d.ref('data/data_N1_movimientos_r/m0').remove());
      await assertSucceeds(d.ref('data/data_N1_movimientos_r/m'+quien).set({id:'m'+quien, tipo:'entrada', cantidad:1}));
    }
    await assertSucceeds(db('cajero1').ref('data/data_N1_ventas_r/v1/total').set(1200));   // lo demás, como siempre
    await assertSucceeds(db('sa').ref('data/data_N1_auditoria_r/a0').remove());
  });
  test('olvidé mi contraseña: sin sesión se pide (solo usuarios que existen, una por hora); solo el dueño o el ayudante la ven y resuelven', async ()=>{
    const serverTimestamp=()=>({'.sv':'timestamp'});
    const pedir=(quien, usuario, extra)=>db(quien).ref('recuperaciones/'+usuario).set(Object.assign({usuario, contacto:'300', estado:'pendiente', fecha:serverTimestamp()}, extra||{}));
    await assertSucceeds(pedir(null, 'caja1'));
    await assertFails(pedir(null, 'caja1'));                                   // otra antes de una hora
    await assertFails(pedir(null, 'inventado'));                               // no existe en login
    await assertFails(pedir(null, 'admin1', {fecha:123}));                     // la hora la pone el servidor
    await assertFails(pedir(null, 'admin1', {estado:'resuelta'}));
    await assertFails(pedir(null, 'admin1', {resueltaPor:'yo'}));
    await assertFails(pedir(null, 'admin1', {contacto:'x'.repeat(41)}));
    await assertFails(pedir(null, 'admin1', {otraCosa:1}));
    await assertFails(db(null).ref('recuperaciones').once('value'));
    await assertFails(db('cajero1').ref('recuperaciones').once('value'));
    await assertFails(db('vend1').ref('recuperaciones').once('value'));
    await assertSucceeds(db('sa').ref('recuperaciones').once('value'));
    await assertSucceeds(db('ayu').ref('recuperaciones/caja1').update({estado:'resuelta', resueltaPor:'ayu', resueltaEn:serverTimestamp()}));
    await assertSucceeds(pedir(null, 'caja1'));                                // resuelta: puede pedir otra
    // El cambio obligatorio: la persona solo lo quita (false), nunca lo pone ni toca el de otro
    await env.withSecurityRulesDisabled(c=>c.database().ref('perfiles/cajero1/debeCambiarPass').set(true));
    await assertFails(db('cajero10').ref('perfiles/cajero1/debeCambiarPass').set(false));
    await assertFails(db('cajero1').ref('perfiles/cajero1/debeCambiarPass').set('no'));
    await assertSucceeds(db('cajero1').ref('perfiles/cajero1/debeCambiarPass').set(false));
    await assertFails(db('cajero1').ref('perfiles/cajero1/debeCambiarPass').set(true));
    await assertSucceeds(db('sa').ref('perfiles/cajero1/debeCambiarPass').set(true));
  });
  // Super-admin vendedor: solo sus negocios (vendedorId) y sus demos (demoDe)
  const activo=(uid, neg)=>db(uid).ref('perfiles/'+uid+'/negocioActivo').set(neg);
  test('vendedor: lee solo sus negocios (y la lista, solo con la consulta por su id); nada global', async ()=>{
    const v=db('vend1');
    await assertSucceeds(v.ref('data/negocios_r/NV').once('value'));
    await assertSucceeds(v.ref('data/negocios_r/ND').once('value'));
    await assertFails(v.ref('data/negocios_r/N1').once('value'));
    await assertFails(v.ref('data/negocios_r').once('value'));
    await assertSucceeds(v.ref('data/negocios_r').orderByChild('vendedorId').equalTo('sv1').once('value'));
    await assertSucceeds(v.ref('data/negocios_r').orderByChild('demoDe').equalTo('sv1').once('value'));
    await assertFails(v.ref('data/negocios_r').orderByChild('vendedorId').equalTo('sv2').once('value'));
    await assertFails(v.ref('data').once('value'));
    await assertFails(v.ref('data/superadmins').once('value'));
    await assertFails(v.ref('data/usuarios').once('value'));
    await assertFails(v.ref('perfiles').once('value'));
    await assertFails(v.ref('login').once('value'));
    await assertFails(db('vend2').ref('data/negocios_r/NV').once('value'));
  });
  test('vendedor: las tablas de un negocio suyo solo con ese negocio activo; nunca las de otro', async ()=>{
    const v=db('vend1');
    await assertFails(v.ref('data/data_NV_ventas_r').once('value'));          // sin negocio activo
    await assertFails(activo('vend1', 'N1'));                                  // no es suyo
    await assertSucceeds(activo('vend1', 'NV'));
    await assertSucceeds(v.ref('data/data_NV_ventas_r').once('value'));
    await assertSucceeds(v.ref('data/data_NV_productos_r/p1').set({id:'p1', nombre:'Ejemplo', ejemplo:true}));
    await assertFails(v.ref('data/data_N1_ventas_r').once('value'));
    await assertFails(v.ref('data/data_N1_ventas_r/x').set({id:'x'}));
    await assertFails(db('vend1').ref('perfiles/vend1/rolSuper').set('dueno'));   // no se sube de rango
    await assertFails(db('vend2').ref('perfiles/vend1/negocioActivo').set('NV')); // ni toca el perfil de otro
  });
  test('vendedor: crea negocios a prueba (a su nombre, máximo un año) y demos; no quita la prueba ni cambia el dueño', async ()=>{
    const v=db('vend1'), hoy=Date.now();
    await assertSucceeds(v.ref('data/negocios_r/NN').set({id:'NN', nombre:'Nuevo', activo:true, vendedorId:'sv1', pruebaDesde:hoy, pruebaHasta:hoy+30*86400000}));
    await assertFails(v.ref('data/negocios_r/NX').set({id:'NX', nombre:'Sin prueba', activo:true, vendedorId:'sv1'}));
    await assertFails(v.ref('data/negocios_r/NY').set({id:'NY', nombre:'De otro', activo:true, vendedorId:'sv2', pruebaHasta:hoy+86400000}));
    await assertFails(v.ref('data/negocios_r/NZ').set({id:'NZ', nombre:'Eterno', activo:true, vendedorId:'sv1', pruebaHasta:hoy+400*86400000}));
    await assertFails(v.ref('data/negocios_r/A_B').set({id:'A_B', nombre:'Guion', activo:true, vendedorId:'sv1', pruebaHasta:hoy+86400000}));
    await assertSucceeds(v.ref('data/negocios_r/NV/pruebaHasta').set(hoy+60*86400000));    // más días
    await assertFails(v.ref('data/negocios_r/NV').update({pruebaDesde:null, pruebaHasta:null}));   // pasar a pago: no
    await assertFails(v.ref('data/negocios_r/NV/vendedorId').set('sv2'));
    await assertFails(v.ref('data/negocios_r/NV/esDemo').set(true));
    await assertFails(v.ref('data/negocios_r/N1/nombre').set('Ajeno'));
    await assertSucceeds(db('ayu').ref('data/negocios_r/NV').update({pruebaDesde:null, pruebaHasta:null}));   // el ayudante sí
  });
  test('vendedor: borra sus demos y deshace un alta reciente; no borra un cliente con tiempo', async ()=>{
    const v=db('vend1');
    await assertSucceeds(v.ref('data/negocios_r/ND').remove());
    await assertFails(v.ref('data/negocios_r/NV').remove());                                 // creado hace 5 días
    await v.ref('data/negocios_r/NN').set({id:'NN', nombre:'Nuevo', activo:true, vendedorId:'sv1', pruebaDesde:Date.now(), pruebaHasta:Date.now()+86400000});
    await assertSucceeds(v.ref('data/negocios_r/NN').remove());
    await assertFails(v.ref('data/negocios_r/N1').remove());
  });
  test('vendedor: crea y borra las cuentas de la gente de sus negocios; nunca super-admins ni cuentas ajenas', async ()=>{
    const v=db('vend1');
    const alta=(uid, perfil, usuario)=>v.ref().update({['perfiles/'+uid]:perfil, ['login/'+usuario]:{correo:uid+'@x.app', uid}});
    await assertSucceeds(alta('nuevoV', {rol:'admin', usuario:'adminv', negocioId:'NV', activo:true}, 'adminv'));
    await assertFails(alta('malo1', {rol:'admin', usuario:'admin1x', negocioId:'N1', activo:true}, 'admin1x'));          // negocio ajeno
    await assertFails(alta('malo2', {rol:'superadmin', rolSuper:'dueno', usuario:'jefe', activo:true}, 'jefe'));        // super-admin
    await assertFails(v.ref('login/caja1').set({correo:'otro@x.app', uid:'nuevoV'}));                                   // índice ajeno
    await assertFails(v.ref('perfiles/cajero1/activo').set(false));                                                      // perfil ajeno
    await assertFails(v.ref('perfiles/cajeroV/negocioId').set('N1'));                                                    // sacarlo a otro negocio
    await assertSucceeds(v.ref().update({'perfiles/nuevoV':null, 'login/adminv':null}));                                 // borrar la suya
    await assertFails(db('vend2').ref('perfiles/cajeroV').remove());
  });
});

describe('reglas de transición (database.rules.transicion.json)', {skip:!HAY_EMULADOR && 'sin emulador (npm run test:firebase)'}, ()=>{
  let env;
  const db=uid=>uid ? env.authenticatedContext(uid).database() : env.unauthenticatedContext().database();
  before(async ()=>{ env=await initializeTestEnvironment({projectId:'demo-wallace', database:{rules:reglas('database.rules.transicion.json')}}); });
  after(async ()=>{ if(env) await env.cleanup(); });
  beforeEach(async ()=>{ await env.clearDatabase(); await env.withSecurityRulesDisabled(c=>c.database().ref().set(datosBase(true))); });

  test('data sigue abierto como hoy (la app vieja y la migración lo necesitan)', async ()=>{
    await assertSucceeds(db(null).ref('data/usuarios').once('value'));
    await assertSucceeds(db(null).ref('data/negocios_r/N1/nombre').set('X'));
  });
  test('migración: cada uno crea SU perfil y SU entrada del índice una sola vez', async ()=>{
    const d=db('nuevoUid');
    await assertSucceeds(d.ref().update({
      'perfiles/nuevoUid':{rol:'cajero', usuario:'pepe', negocioId:'N1', activo:true},
      'login/pepe':{correo:'u1@x.app', uid:'nuevoUid'}
    }));
    await assertFails(d.ref('perfiles/nuevoUid/rol').set('superadmin'));   // ya existe: no puede subirse de rol
    await assertFails(d.ref('login/pepe').set({correo:'otro@x.app', uid:'nuevoUid'}));
  });
  test('nadie toma el índice o el perfil de otro', async ()=>{
    await assertFails(db('intruso').ref('login/caja1').set({correo:'i@x.app', uid:'intruso'}));
    await assertFails(db('intruso').ref('perfiles/cajero1').set({rol:'admin', usuario:'caja1'}));
    await assertFails(db(null).ref('perfiles/x').set({rol:'cajero', usuario:'x'}));
    await assertFails(db('cajero1').ref('perfiles').once('value'));
  });
  test('S8: con data abierta igual se valida el formato del logo y de los ids', async ()=>{
    const d=db('cualquiera');
    await assertFails(d.ref('data/negocios_r/N1/logo').set('x" onerror="alert(1)'));
    await assertFails(d.ref('data/negocios/0/logo').set('x" onerror="alert(1)'));
    await assertFails(d.ref('data/data_N1_productos/0').set({id:'p" onerror="x', nombre:'a'}));
    await assertSucceeds(d.ref('data/negocios_r/N1/logo').set('data:image/png;base64,iVBORw0KGgo='));
    await assertSucceeds(d.ref('data/data_N1_productos/0').set({id:'p1', nombre:'a'}));
  });
  test('olvidé mi contraseña también con las reglas de transición', async ()=>{
    const serverTimestamp=()=>({'.sv':'timestamp'});
    await assertSucceeds(db(null).ref('recuperaciones/caja1').set({usuario:'caja1', estado:'pendiente', fecha:serverTimestamp()}));
    await assertFails(db(null).ref('recuperaciones/nadie').set({usuario:'nadie', estado:'pendiente', fecha:serverTimestamp()}));
    await assertFails(db(null).ref('recuperaciones').once('value'));
  });
  test('el super-admin administra perfiles e índice', async ()=>{
    const s=db('sa');
    await assertSucceeds(s.ref('perfiles/cajero1/activo').set(false));
    await assertSucceeds(s.ref('login/caja1').set({correo:'nuevo@x.app', uid:'otro'}));
    await assertSucceeds(s.ref('perfiles').once('value'));
  });
});
