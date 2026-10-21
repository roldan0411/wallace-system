// Periodo de prueba, vencimiento de demos y datos de ejemplo (dominio/prueba.js, dominio/ejemplos.js). npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as pr from '../../src/dominio/prueba.js';
import * as ej from '../../src/dominio/ejemplos.js';
import { PERFILES } from '../../src/dominio/negocio.js';
import { CAMPOS_NEGOCIO_RESERVADOS } from '../../src/dominio/cuentas.js';
import { cajaDe } from '../../src/dominio/caja.js';

const DIA=86400000, HOY=Date.UTC(2026,9,12,15,0,0);

test('prueba: por defecto 30 días; las demos, 15; días fuera de rango se rechazan', ()=>{
  assert.deepEqual(pr.nuevaPrueba(HOY), {pruebaDesde:HOY, pruebaHasta:HOY+30*DIA});
  assert.equal(pr.nuevaPrueba(HOY, pr.DIAS_DEMO).pruebaHasta, HOY+15*DIA);
  assert.equal(pr.nuevaPrueba(HOY, 7).pruebaHasta, HOY+7*DIA);
  for(const malo of [0, -3, 400, 'x', NaN]) assert.throws(()=>pr.nuevaPrueba(HOY, malo), /inválidos/);
});
test('estado: días restantes, vencida y tipo (prueba o demo)', ()=>{
  const neg={pruebaHasta:HOY+2.5*DIA};
  assert.deepEqual(pr.estadoPrueba(neg, HOY), {tipo:'prueba', vencida:false, diasRestantes:3, hasta:HOY+2.5*DIA});
  assert.equal(pr.estadoPrueba({pruebaHasta:HOY+1000}, HOY).diasRestantes, 1);    // vence hoy: queda 1
  assert.deepEqual(pr.estadoPrueba({pruebaHasta:HOY}, HOY), {tipo:'prueba', vencida:true, diasRestantes:0, hasta:HOY});
  assert.equal(pr.estadoPrueba({esDemo:true, pruebaHasta:HOY+DIA}, HOY).tipo, 'demo');
  assert.deepEqual(pr.estadoPrueba({id:'x'}, HOY), {tipo:null, vencida:false, diasRestantes:null, hasta:null});   // negocio pagado
});
test('vencida = solo lectura; un negocio sin prueba nunca vence', ()=>{
  assert.equal(pr.soloLectura({pruebaHasta:HOY-1}, HOY), true);
  assert.equal(pr.soloLectura({pruebaHasta:HOY+1}, HOY), false);
  assert.equal(pr.soloLectura({}, HOY), false);
  assert.equal(pr.soloLectura({pruebaHasta:'2026-01-01'}, HOY), false);   // solo cuenta un número (lo que comparan las reglas)
});
test('extender: desde el vencimiento si sigue vigente, desde hoy si ya venció', ()=>{
  assert.equal(pr.extenderPrueba({pruebaDesde:HOY-DIA, pruebaHasta:HOY+5*DIA}, 10, HOY).pruebaHasta, HOY+15*DIA);
  assert.equal(pr.extenderPrueba({pruebaDesde:HOY-40*DIA, pruebaHasta:HOY-10*DIA}, 10, HOY).pruebaHasta, HOY+10*DIA);
  assert.equal(pr.extenderPrueba({pruebaDesde:HOY-DIA, pruebaHasta:HOY+5*DIA}, 10, HOY).pruebaDesde, HOY-DIA);   // conserva el inicio
  assert.deepEqual(pr.camposConvertirAPago(), {pruebaDesde:null, pruebaHasta:null});
});
test('quién maneja pruebas y demos: dueño y ayudante todas; un vendedor solo las suyas', ()=>{
  const dueno={rol:'superadmin', rolSuper:'dueno', id:'s1'}, ayud={rol:'superadmin', rolSuper:'ayudante', id:'s2'};
  const vend={rol:'superadmin', rolSuper:'vendedor', id:'s3'};
  const suyo={vendedorId:'s3'}, suDemo={esDemo:true, demoDe:'s3'}, ajeno={vendedorId:'s9'};
  assert.equal(pr.puedeGestionarAlta(dueno, ajeno), true);
  assert.equal(pr.puedeGestionarAlta(ayud, ajeno), true);
  assert.equal(pr.puedeGestionarAlta(vend, suyo), true);
  assert.equal(pr.puedeGestionarAlta(vend, suDemo), true);
  assert.equal(pr.puedeGestionarAlta(vend, ajeno), false);
  assert.equal(pr.puedeGestionarAlta(vend, null), true);              // crear una nueva
  assert.equal(pr.puedeGestionarAlta({rol:'admin', negocioId:'n1'}, suyo), false);   // un empleado nunca
  assert.equal(pr.puedeGestionarAlta(null, suyo), false);
});
test('borrar ejemplos: el super-admin o alguien del propio negocio con permiso de eliminar', ()=>{
  assert.equal(pr.puedeBorrarEjemplos({rol:'superadmin'}, 'n1'), true);
  assert.equal(pr.puedeBorrarEjemplos({rol:'admin', negocioId:'n1'}, 'n1'), true);
  assert.equal(pr.puedeBorrarEjemplos({rol:'admin', negocioId:'n2'}, 'n1'), false);
  assert.equal(pr.puedeBorrarEjemplos({rol:'cajero', negocioId:'n1'}, 'n1'), false);   // el cajero no elimina
});
test('por vencer: solo pruebas y demos dentro del plazo, la más urgente primero', ()=>{
  const l=[{id:'a', pruebaHasta:HOY+10*DIA}, {id:'b', pruebaHasta:HOY+DIA}, {id:'c'}, {id:'d', pruebaHasta:HOY-DIA}];
  assert.deepEqual(pr.porVencer(l, HOY, 3).map(n=>n.id), ['d','b']);
});
test('los campos de la prueba están reservados en el dominio Y en database.rules.json (lista duplicada a propósito)', ()=>{
  pr.CAMPOS_PRUEBA.forEach(c=>assert.ok(CAMPOS_NEGOCIO_RESERVADOS.includes(c), c+' no está en CAMPOS_NEGOCIO_RESERVADOS'));
  const reglas=JSON.parse(readFileSync(new URL('../../database.rules.json', import.meta.url),'utf8'));
  const escritura=reglas.rules.data.negocios_r['$negId']['$campo']['.write'];
  const enReglas=[...escritura.matchAll(/\$campo !== '([^']+)'/g)].map(m=>m[1]).sort();
  assert.deepEqual(enReglas, [...CAMPOS_NEGOCIO_RESERVADOS].sort(), 'las dos listas de campos reservados deben ser iguales');
});

// ---------- Datos de ejemplo ----------
let n=0; const ids=()=>'id'+(++n);
function azarFijo(semilla){ let s=semilla; return ()=>{ s=(s*16807)%2147483647; return (s-1)/2147483646; }; }

test('plantillas: 18 tipos de negocio, todos con perfil, productos válidos y clientes', ()=>{
  const tipos=Object.keys(ej.PLANTILLAS);
  assert.equal(tipos.length, 18);
  tipos.forEach(t=>{
    const p=ej.PLANTILLAS[t];
    assert.ok(PERFILES[p.tipo], t+': su tipo no tiene perfil');
    assert.ok(p.sufijo && p.productos.length && p.clientes.length, t);
    p.productos.forEach(x=>{ assert.equal(typeof x[0],'string'); assert.ok(x[1]>0, t+' '+x[0]); assert.equal(typeof x[2],'string'); assert.ok(x[3]===null || x[3]>=0); });
  });
  assert.equal(ej.plantillaDeTipo('Restaurante').sufijo, 'Sabor & Sazón');
  assert.equal(ej.plantillaDeTipo('No existe'), null);
});
test('productos de ejemplo: marcados para poder borrarlos de una vez', ()=>{
  const prods=ej.productosDeEjemplo(ej.plantillaDeTipo('Restaurante'), {ahoraMs:HOY, nuevoId:ids});
  assert.ok(prods.length>5);
  prods.forEach(p=>{ assert.equal(p.ejemplo, true); assert.ok(p.id); assert.equal(p.creado, new Date(HOY).toISOString()); });
  assert.deepEqual(ej.productosDeEjemplo(null, {ahoraMs:HOY, nuevoId:ids}), []);
});
test('demo armada: vence en 15 días, ventas con ids, caja con la forma de abrirCaja y mismo azar = mismos datos', ()=>{
  const plant=ej.PLANTILLAS['Restaurante'], perfil=PERFILES[plant.tipo];
  const armar=()=>{ let k=0; return ej.armarDemo(plant, perfil, {ahoraMs:HOY, azar:azarFijo(42), nuevoId:()=>'x'+(++k), usuario:'demo', demoDe:'s3'}); };
  const d=armar();
  assert.equal(d.negocio.esDemo, true); assert.equal(d.negocio.demoDe, 's3');
  assert.equal(d.negocio.pruebaHasta, HOY+15*DIA);
  assert.equal(d.admin.usuario, 'demo'); assert.equal(d.admin.negocioId, d.negocio.id); assert.equal(d.admin.rol, 'admin');
  assert.ok(!('pass' in d.admin) && !('passHash' in d.admin));                 // la contraseña la pone quien guarda
  assert.equal(d.productos.length, plant.productos.length);
  assert.ok(d.ventas.length>=11*3);                                              // 11 días, mínimo 3 por día
  d.ventas.forEach(v=>{ assert.equal(v.vendedorId, d.admin.id); assert.equal(v.sucursalId, 'principal'); assert.equal(v.estado, 'pagada');
    assert.equal(v.total, v.items.reduce((a,i)=>a+i.precio*i.qty, 0)); });
  assert.ok(Array.isArray(d.cajaActual));                                        // forma de siempre: [caja]
  assert.equal(cajaDe(d.cajaActual).base, 50000);
  assert.ok(d.ventas.filter(v=>v.cajaId).every(v=>v.cajaId===cajaDe(d.cajaActual).id));
  assert.deepEqual(armar(), d);                                                  // determinista con el mismo azar
});
