// Pruebas del servicio de inicio de sesión y migración de cuentas (S1, Plan B)
// con un doble del puerto de cuentas en memoria. npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearServicioSesion, mensajeDeFallo } from '../../src/aplicacion/servicios/sesion.js';
import { verificarPuertoCuentas, ERRORES_CUENTA } from '../../src/aplicacion/puertos/cuentas.js';
import * as cuentas from '../../src/dominio/cuentas.js';
import * as contrasenas from '../../src/dominio/contrasenas.js';

const PANT={admin:['inicio','config'], cajero:['inicio','ventas']};
const err=codigo=>Object.assign(new Error(codigo), {codigo});

// Firebase Auth + login/ + perfiles/ en memoria. reglasCerradas = leerLegado devuelve null.
function dobleCuentas({legado, reglasCerradas}={}){
  const auth={}, perfiles={}, login={};
  let n=0, sesion=null;
  const d={
    auth, perfiles, login, get sesion(){ return sesion; },
    iniciar:()=>true, disponible:()=>true, alCambiarSesion(){},
    async buscarLogin(u){ return login[cuentas.claveUsuario(u)]||null; },
    async entrar(correo, pass){ const c=auth[correo]; if(!c||c.pass!==pass) throw err(ERRORES_CUENTA.CREDENCIALES); sesion=c.uid; return {uid:c.uid}; },
    async salir(){ sesion=null; },
    async leerPerfil(uid){ return perfiles[uid]||null; },
    escucharPerfil(){ return ()=>{}; },
    async crearCuentaPropia(pass){
      if(!cuentas.passValidaCuenta(pass)) throw err(ERRORES_CUENTA.PASS_DEBIL);
      const uid='uid'+(++n), correo=cuentas.correoInterno('aleatorio'+n); auth[correo]={uid, pass}; sesion=uid; return {uid, correo};
    },
    async crearCuentaAjena(pass){ const uid='uid'+(++n), correo=cuentas.correoInterno('aleatorio'+n); auth[correo]={uid, pass}; return {uid, correo}; },
    escrituras:[],
    async guardarCuenta(x){ perfiles[x.uid]=x.perfil; login[cuentas.claveUsuario(x.usuario)]={correo:x.correo, uid:x.uid}; d.escrituras.push(x.extra||{}); },
    async borrarCuenta(){}, async actualizarPerfil(){}, async cambiarMiPass(){},
    async leerIndice(){ return {perfiles, login}; },
    legado: legado||{superadmins:[], usuarios:[]},
    async leerLegado(){ return reglasCerradas ? null : JSON.parse(JSON.stringify(d.legado)); },
    async necesitaDueno(){ return false; },
    async fijarNegocioActivo(){},
    async pedirRecuperacion(){}, escucharRecuperaciones(){ return ()=>{}; }, async cerrarRecuperacion(){}, async quitarDebeCambiarPass(){},
    async restablecerPorCorreo(){}, async confirmarMiPass(){}, async crearCuentaConCorreo(){ return {uid:'x', correo:'x'}; }, async pasarCuentaACorreo(){}
  };
  return verificarPuertoCuentas(d);
}
function legadoDePrueba(){
  const conHash=contrasenas.ponerPass({id:'u2', usuario:'MARCE', rol:'dueno', negocioId:'N1', activo:true}, 'clave99', 'sal1');
  return {
    superadmins:[{id:'s1', usuario:'admin', nombre:'R', rolSuper:'dueno', pass:'superclave'}],
    usuarios:[
      {id:'u1', usuario:'ROLDANS', nombre:'Roldán', rol:'cajero', negocioId:'N1', pass:'123', activo:true},
      conHash,
      {id:'u3', usuario:'baja', rol:'cajero', negocioId:'N1', pass:'123456', activo:false}
    ]
  };
}
function servicio(C, publico){
  return crearServicioSesion({cuentas:C, dominio:{cuentas, contrasenas}, pantallasPorRol:PANT,
    leerUsuarioNegocio: async (n,id)=>(publico||{})[id]||null, ahora:()=>'2026-10-08T00:00:00Z',
    retirarClaveVieja: async ({tipo, id})=>{
      if(tipo==='super'){ const s=C.legado.superadmins.find(x=>x.id===id); cuentas.CAMPOS_PASS.forEach(k=>{ delete s[k]; }); }
      else C.legado.usuarios=C.legado.usuarios.filter(x=>x.id!==id);
    }});
}

test('migra a un super-admin con su misma contraseña (texto plano viejo)', async ()=>{
  const C=dobleCuentas({legado:legadoDePrueba()});
  const r=await servicio(C).iniciarSesion('admin', 'superclave');
  assert.equal(r.ok, true); assert.equal(r.migrado, true);
  assert.equal(r.perfil.rol, 'superadmin'); assert.equal(r.perfil.superId, 's1');
  assert.equal(r.perfil.migradoEn, '2026-10-08T00:00:00Z');
  assert.ok(C.login.admin && C.login.admin.uid===r.uid);
  assert.equal(C.legado.superadmins[0].pass, undefined);   // la clave vieja se retiró
  // Segunda vez ya no migra: entra con Firebase
  const r2=await servicio(C).iniciarSesion('admin', 'superclave');
  assert.equal(r2.ok, true); assert.equal(r2.migrado, false); assert.equal(r2.uid, r.uid);
});
test('migra a un empleado con contraseña con hash y escribe su registro del negocio sin contraseña', async ()=>{
  const C=dobleCuentas({legado:legadoDePrueba()});
  const r=await servicio(C).iniciarSesion('MARCE', 'clave99');
  assert.equal(r.ok, true);
  assert.equal(r.perfil.negocioId, 'N1'); assert.equal(r.perfil.usuarioId, 'u2'); assert.equal(r.perfil.editaNegocio, false);
  const reg=C.escrituras[0]['data/data_N1_usuarios_r/u2'];
  assert.equal(reg.uid, r.uid);
  for(const k of cuentas.CAMPOS_PASS) assert.equal(k in reg, false);
  assert.equal(C.legado.usuarios.some(x=>x.id==='u2'), false);   // ya no se puede migrar otra vez con la clave vieja
});
test('el registro del negocio (cambios del super-admin) manda sobre el viejo', async ()=>{
  const C=dobleCuentas({legado:legadoDePrueba()});
  const r=await servicio(C, {u2:{id:'u2', usuario:'MARCE', rol:'admin', negocioId:'N1', activo:true}}).iniciarSesion('MARCE','clave99');
  assert.equal(r.perfil.rol, 'admin'); assert.equal(r.perfil.editaNegocio, true);
  const C2=dobleCuentas({legado:legadoDePrueba()});
  const r2=await servicio(C2, {u2:{id:'u2', usuario:'MARCE', rol:'dueno', negocioId:'N1', activo:false}}).iniciarSesion('MARCE','clave99');
  assert.equal(r2.ok, false); assert.equal(r2.motivo, 'inactivo');
});
test('contraseña corta: pide una nueva de 6+ y entra con ella', async ()=>{
  const C=dobleCuentas({legado:legadoDePrueba()});
  let pedida=0;
  const r=await servicio(C).iniciarSesion('ROLDANS', '123', {pedirPassNueva: async ()=>{ pedida++; return 'nueva123'; }});
  assert.equal(pedida, 1); assert.equal(r.ok, true); assert.equal(r.passCambiada, true);
  const r2=await servicio(C).iniciarSesion('ROLDANS', 'nueva123');
  assert.equal(r2.ok, true); assert.equal(r2.migrado, false);
  const r3=await servicio(C).iniciarSesion('ROLDANS', '123');
  assert.equal(r3.ok, false); assert.equal(r3.motivo, 'credenciales');
});
test('contraseña corta y la persona cancela (o elige otra corta): no se crea nada', async ()=>{
  const C=dobleCuentas({legado:legadoDePrueba()});
  assert.equal((await servicio(C).iniciarSesion('ROLDANS', '123', {pedirPassNueva: async ()=>null})).motivo, 'cancelado');
  assert.equal((await servicio(C).iniciarSesion('ROLDANS', '123', {pedirPassNueva: async ()=>'12'})).motivo, 'pass_debil');
  assert.equal(Object.keys(C.auth).length, 0);
});
test('contraseña equivocada, usuario inexistente o desactivado', async ()=>{
  const C=dobleCuentas({legado:legadoDePrueba()});
  assert.equal((await servicio(C).iniciarSesion('MARCE', 'mala')).motivo, 'credenciales');
  assert.equal((await servicio(C).iniciarSesion('nadie', 'x123456')).motivo, 'credenciales');
  assert.equal((await servicio(C).iniciarSesion('baja', '123456')).motivo, 'inactivo');
  assert.equal((await servicio(C).iniciarSesion('', 'x')).motivo, 'credenciales');
  assert.equal(Object.keys(C.auth).length, 0);
});
test('con reglas cerradas no hay migración: quien no tiene cuenta no entra', async ()=>{
  const C=dobleCuentas({legado:legadoDePrueba(), reglasCerradas:true});
  assert.equal((await servicio(C).iniciarSesion('admin', 'superclave')).motivo, 'credenciales');
});
test('cuenta tomada por otro antes que su dueño: avisa "ya activada"', async ()=>{
  const C=dobleCuentas({legado:legadoDePrueba()});
  const correo=cuentas.correoInterno('intruso123'); C.auth[correo]={uid:'X', pass:'otraclave'};
  C.login.MARCE={correo, uid:'X'}; C.perfiles.X={usuario:'MARCE', rol:'dueno', negocioId:'N1'};
  const r=await servicio(C).iniciarSesion('MARCE', 'clave99');
  assert.equal(r.ok, false); assert.equal(r.motivo, 'ya_activada');
});
test('cuenta sin perfil o con perfil desactivado: fuera y sin sesión', async ()=>{
  const C=dobleCuentas({legado:legadoDePrueba()});
  const correo=cuentas.correoInterno('cuentasola1'); C.auth[correo]={uid:'Z', pass:'abcdef'};
  C.login.solo={correo, uid:'Z'};
  assert.equal((await servicio(C).iniciarSesion('solo', 'abcdef')).motivo, 'sin_perfil');
  assert.equal(C.sesion, null);
  C.perfiles.Z={usuario:'solo', rol:'cajero', activo:false};
  assert.equal((await servicio(C).iniciarSesion('solo', 'abcdef')).motivo, 'inactivo');
  assert.equal(C.sesion, null);
});
test('restaurar sesión guardada y mensajes para la persona', async ()=>{
  const C=dobleCuentas(); C.perfiles.U={usuario:'a', rol:'cajero', activo:true};
  assert.equal((await servicio(C).restaurar('U')).ok, true);
  assert.equal((await servicio(C).restaurar('NO')).motivo, 'sin_perfil');
  assert.match(mensajeDeFallo('credenciales'), /incorrectos/);
  assert.match(mensajeDeFallo('desconocido'), /No se pudo/);
  assert.match(mensajeDeFallo('auth_desactivado'), /Correo electrónico\/contraseña/);
});

test('super-admin con correo real: entra escribiendo el correo; con el usuario se le dice que use el correo', async ()=>{
  const C=dobleCuentas({reglasCerradas:true});
  C.auth['dueno@ejemplo.com']={uid:'uidReal', pass:'clave2027'};
  C.perfiles.uidReal={rol:'superadmin', rolSuper:'dueno', usuario:'admin', superId:'s1', activo:true, correoReal:'dueno@ejemplo.com'};
  C.login.admin={correo:cuentas.MARCA_SOLO_CORREO, uid:'uidReal'};
  const r=await servicio(C).iniciarSesion(' dueno@ejemplo.com ', 'clave2027');
  assert.equal(r.ok, true); assert.equal(r.uid, 'uidReal');
  assert.equal((await servicio(C).iniciarSesion('admin', 'clave2027')).motivo, 'usa_correo');
  assert.equal((await servicio(C).iniciarSesion('dueno@ejemplo.com', 'otra')).motivo, 'credenciales');
  assert.match(mensajeDeFallo('usa_correo'), /correo/);
});
