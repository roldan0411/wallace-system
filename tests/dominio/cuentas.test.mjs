// Pruebas del dominio de cuentas (S1). npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as dc from '../../src/dominio/cuentas.js';

const PANT={admin:['inicio','config'], cajero:['inicio','ventas'], dueno:['inicio','config'], cocina:['cocina']};

test('claveUsuario: válida para Firebase y conserva mayúsculas', ()=>{
  assert.equal(dc.claveUsuario('DEISY'), 'DEISY');
  assert.equal(dc.claveUsuario(' ana.maría '), 'ana%2Emar%C3%ADa');
  assert.equal(dc.claveUsuario('a/b#c$[d]'), 'a%2Fb%23c%24%5Bd%5D');
  assert.notEqual(dc.claveUsuario('Ana'), dc.claveUsuario('ana'));
  assert.equal(dc.claveUsuario(''), '');
  assert.ok(!/[.#$\[\]\/]/.test(dc.claveUsuario('x.y#z$[w]/v')));
});
test('correoInterno aleatorio en el dominio interno', ()=>{
  assert.equal(dc.correoInterno('A1B2C3D4E5'), 'ua1b2c3d4e5@'+dc.DOMINIO_CORREO);
  assert.throws(()=>dc.correoInterno('abc'));
});
test('contraseña de cuenta: mínimo 6 (Firebase)', ()=>{
  assert.equal(dc.passValidaCuenta('12345'), false);
  assert.equal(dc.passValidaCuenta('123456'), true);
  assert.equal(dc.passValidaCuenta(null), false);
});
test('sinContrasenas quita pass, hash, sal e iteraciones', ()=>{
  const u={id:'u1', usuario:'x', pass:'1', passHash:'h', passSal:'s', passIter:3, rol:'cajero'};
  assert.deepEqual(dc.sinContrasenas(u), {id:'u1', usuario:'x', rol:'cajero'});
  assert.equal(u.pass, '1');   // no modifica el original
});
test('editaNegocio: admin o quien tenga la pantalla config (propia o del rol)', ()=>{
  assert.equal(dc.editaNegocio({rol:'admin'}, PANT), true);
  assert.equal(dc.editaNegocio({rol:'dueno'}, PANT), true);
  assert.equal(dc.editaNegocio({rol:'cajero'}, PANT), false);
  assert.equal(dc.editaNegocio({rol:'cajero', pantallas:['config']}, PANT), true);
  assert.equal(dc.editaNegocio({rol:'dueno', pantallas:['inicio']}, PANT), false);
});
test('perfil de empleado y de super-admin; usuario de sesión desde el perfil', ()=>{
  const p=dc.perfilDesdeUsuario({id:'u1', usuario:'caja1', nombre:'Ana', rol:'cajero', negocioId:'N1', permisos:['cobrar']}, PANT);
  assert.equal(p.negocioId, 'N1'); assert.equal(p.usuarioId, 'u1'); assert.equal(p.activo, true);
  assert.equal(p.editaNegocio, false); assert.deepEqual(p.permisos, ['cobrar']);
  const yo=dc.usuarioDesdePerfil(p, 'UID1');
  assert.deepEqual([yo.id, yo.rol, yo.negocioId, yo.uid], ['u1','cajero','N1','UID1']);
  const s=dc.perfilDesdeSuperAdmin({id:'s1', usuario:'admin', nombre:'R', rolSuper:'vendedor'});
  assert.equal(s.rol, 'superadmin'); assert.equal(s.negocioId, null); assert.equal(s.superId, 's1');
  assert.deepEqual(dc.usuarioDesdePerfil(s,'U2'), {id:'s1', nombre:'R', usuario:'admin', rol:'superadmin', rolSuper:'vendedor', uid:'U2'});
  assert.equal(dc.perfilDesdeUsuario({id:'u', usuario:'x', rol:'cajero', negocioId:'N', activo:false}, PANT).activo, false);
});
test('estado de migración: migrado, pendiente y por revisar', ()=>{
  const superadmins=[{id:'s1', usuario:'dueno', rolSuper:'dueno'}];
  const usuarios=[
    {id:'u1', usuario:'ok', rol:'cajero', negocioId:'N1'},
    {id:'u2', usuario:'pend', rol:'cajero', negocioId:'N1'},
    {id:'u3', usuario:'raro', rol:'cajero', negocioId:'N1'}
  ];
  const login={dueno:{uid:'A', correo:'a'}, ok:{uid:'B', correo:'b'}, raro:{uid:'C', correo:'c'}, falso:{uid:'D', correo:'d'}};
  const perfiles={
    A:{usuario:'dueno', rol:'superadmin', superId:'s1', migradoEn:'2026-10-01'},
    B:{usuario:'ok', rol:'cajero', negocioId:'N1', usuarioId:'u1'},
    C:{usuario:'raro', rol:'admin', negocioId:'N1', usuarioId:'u3'},        // se subió de rol
    D:{usuario:'falso', rol:'superadmin', superId:'zzz'}                     // no existe
  };
  const f=dc.estadoMigracion({superadmins, usuarios, perfiles, login});
  const de=u=>f.find(x=>x.usuario===u);
  assert.equal(de('dueno').estado, 'migrado'); assert.equal(de('dueno').migradoEn, '2026-10-01');
  assert.equal(de('ok').estado, 'migrado');
  assert.equal(de('pend').estado, 'pendiente');
  assert.equal(de('raro').estado, 'revisar');
  assert.equal(de('falso').estado, 'revisar'); assert.equal(de('falso').id, null);
  assert.deepEqual(dc.resumenMigracion(f), {total:4, migradas:2, pendientes:1, revisar:2});
});
test('estado de migración: índice sin perfil y uid distinto al registrado', ()=>{
  const f=dc.estadoMigracion({superadmins:[], usuarios:[{id:'u1', usuario:'a', rol:'cajero', negocioId:'N', uid:'OTRO'}],
    perfiles:{X:{usuario:'a', rol:'cajero', negocioId:'N', usuarioId:'u1'}}, login:{a:{uid:'X'}}});
  assert.equal(f[0].estado, 'revisar');
  const g=dc.estadoMigracion({superadmins:[], usuarios:[{id:'u1', usuario:'a', rol:'cajero', negocioId:'N'}], perfiles:{}, login:{a:{uid:'X'}}});
  assert.equal(g[0].estado, 'revisar');
});
test('camposCambiados: solo lo distinto, y null para lo que se quitó', ()=>{
  assert.deepEqual(dc.camposCambiados({a:1, b:[1], c:3}, {a:1, b:[1,2], d:4}), {b:[1,2], d:4, c:null});
  assert.deepEqual(dc.camposCambiados(null, {a:1}), {a:1});
});

test('olvidé mi contraseña: solicitud, pendientes y cambio obligatorio', ()=>{
  const s=dc.solicitudRecuperacion('  Ana.Pérez ', ' 300 123 4567 ');
  assert.deepEqual(s, {usuario:dc.claveUsuario('Ana.Pérez'), contacto:'300 123 4567', estado:'pendiente'});
  assert.equal(dc.solicitudRecuperacion('   ', 'x'), null);
  assert.equal(dc.solicitudRecuperacion('ana', 'x'.repeat(80)).contacto.length, dc.CONTACTO_MAX);
  const todas={b:{usuario:'b', estado:'pendiente', fecha:20}, a:{usuario:'a', estado:'pendiente', fecha:10}, c:{usuario:'c', estado:'resuelta', fecha:5}};
  assert.deepEqual(dc.recuperacionesPendientes(todas).map(r=>r.usuario), ['a','b']);
  assert.equal(dc.debeCambiarPass({debeCambiarPass:true}), true);
  assert.equal(dc.debeCambiarPass({debeCambiarPass:'si'}), false);
  assert.equal(dc.debeCambiarPass(null), false);
});

test('super-admin con correo real: qué es un correo real y la marca del índice', ()=>{
  assert.equal(dc.correoRealValido('dueno@ejemplo.com'), true);
  assert.equal(dc.correoRealValido(' dueno@ejemplo.com '), true);
  assert.equal(dc.correoRealValido('roldan'), false);
  assert.equal(dc.correoRealValido('a@b'), false);
  assert.equal(dc.correoRealValido(dc.correoInterno('abcdefgh12')), false);   // el interno no recibe correos
  assert.equal(dc.entraConCorreo({correo:dc.MARCA_SOLO_CORREO, uid:'x'}), true);
  assert.equal(dc.entraConCorreo({correo:'u1@'+dc.DOMINIO_CORREO, uid:'x'}), false);
  assert.equal(dc.entraConCorreo(null), false);
});

test('V4: nombres de usuario', ()=>{
  for(const u of ['admin','MARCE','ana.perez','Don José']) assert.equal(dc.usuarioValido(u), true, u);
  for(const u of ['', '  ', 'ab', 'ana@tienda.com', 'x'.repeat(41), 'a\tb']) assert.equal(dc.usuarioValido(u), false, JSON.stringify(u));
  assert.equal(dc.mismoUsuario('Ana', ' ana '), true);
  assert.equal(dc.mismoUsuario('Ana', 'Anna'), false);
});
