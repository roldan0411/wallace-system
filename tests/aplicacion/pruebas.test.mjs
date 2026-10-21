// Servicio del periodo de prueba con un doble del puerto de datos (sin Firebase ni pantallas). npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearServicioPruebas } from '../../src/aplicacion/servicios/pruebas.js';
import * as prueba from '../../src/dominio/prueba.js';
import * as ejemplos from '../../src/dominio/ejemplos.js';

const DIA=86400000, HOY=Date.UTC(2026,9,12,15,0,0);
const DUENO={rol:'superadmin', rolSuper:'dueno', id:'s1'}, VEND={rol:'superadmin', rolSuper:'vendedor', id:'s3'};

// Doble del puerto de datos: lo justo que usa el servicio, en memoria
function datosFalsos(negocios){
  const t={negocios:negocios.map(n=>Object.assign({}, n))};
  return {
    t,
    get:k=>t[k]===undefined?null:t[k],
    set:(k,v)=>{ t[k]=JSON.parse(JSON.stringify(v)); },
    datosDe:(n,tabla)=>t['data_'+n+'_'+tabla]||[],
    guardarEn:(n,tabla,regs)=>{ const k='data_'+n+'_'+tabla; const m={}; (t[k]||[]).concat(regs).forEach(r=>{ m[r.id]=r; }); t[k]=Object.values(m); },
    eliminarEn:(n,tabla,id)=>{ const k='data_'+n+'_'+tabla; t[k]=(t[k]||[]).filter(r=>r.id!==id); }
  };
}
function servicio(negocios, usuario, ahora){
  const datos=datosFalsos(negocios); let k=0;
  const s=crearServicioPruebas({datos, dominio:{prueba, ejemplos}, usuario:()=>usuario, ahora:()=>ahora||HOY, nuevoId:()=>'p'+(++k)});
  return {s, datos};
}
const negocio=(id, extra)=>Object.assign({id, nombre:'Neg '+id, tipo:'Restaurante', activo:true}, extra||{});

test('iniciar: 30 días por defecto o los que se pidan, con o sin productos de ejemplo', ()=>{
  const {s, datos}=servicio([negocio('n1'), negocio('n2')], DUENO);
  const r=s.iniciar('n1');
  assert.equal(r.ok, true); assert.equal(r.estado.diasRestantes, 30); assert.equal(r.ejemplos, 0);
  assert.equal(datos.t.negocios[0].pruebaHasta, HOY+30*DIA);
  assert.equal(datos.t.data_n1_productos, undefined);
  const r2=s.iniciar('n2', {dias:7, conEjemplos:true});
  assert.equal(r2.estado.diasRestantes, 7);
  assert.ok(r2.ejemplos>5);
  assert.ok(datos.t.data_n2_productos.every(p=>p.ejemplo));
});
test('iniciar: días inválidos, negocio inexistente, demo y falta de permiso', ()=>{
  const {s}=servicio([negocio('n1'), negocio('d1', {esDemo:true}), negocio('n9', {vendedorId:'s9'})], VEND);
  assert.deepEqual(s.iniciar('n1', {dias:0}), {ok:false, motivo:'permiso'});    // n1 no es del vendedor s3
  assert.deepEqual(s.iniciar('zz'), {ok:false, motivo:'no_existe'});
  const {s:sd}=servicio([negocio('n1'), negocio('d1', {esDemo:true})], DUENO);
  assert.deepEqual(sd.iniciar('n1', {dias:500}), {ok:false, motivo:'dias'});
  assert.deepEqual(sd.iniciar('d1'), {ok:false, motivo:'es_demo'});            // las demos ya vencen solas
});
test('un vendedor maneja solo sus pruebas', ()=>{
  const {s}=servicio([negocio('n1', {vendedorId:'s3'}), negocio('n2', {vendedorId:'s9'})], VEND);
  assert.equal(s.iniciar('n1').ok, true);
  assert.equal(s.iniciar('n2').motivo, 'permiso');
});
test('extender (también una vencida) y pasar a pago', ()=>{
  const {s, datos}=servicio([negocio('n1', {pruebaDesde:HOY-40*DIA, pruebaHasta:HOY-10*DIA})], DUENO);
  assert.equal(s.estado('n1').vencida, true);
  const r=s.extender('n1', 15);
  assert.equal(r.ok, true); assert.equal(r.estado.vencida, false); assert.equal(r.estado.diasRestantes, 15);
  assert.deepEqual(s.convertirAPago('n1'), {ok:true});
  assert.ok(!('pruebaHasta' in datos.t.negocios[0]) && !('pruebaDesde' in datos.t.negocios[0]));
  assert.equal(s.estado('n1').tipo, null);
  assert.deepEqual(s.convertirAPago('n1'), {ok:false, motivo:'no_es_prueba'});
});
test('borrar ejemplos: solo los marcados; lo puede hacer el admin del propio negocio', ()=>{
  const {s, datos}=servicio([negocio('n1')], DUENO);
  s.iniciar('n1', {conEjemplos:true});
  datos.guardarEn('n1', 'productos', [{id:'mio', nombre:'Producto propio'}]);
  const admin=crearServicioPruebas({datos, dominio:{prueba, ejemplos}, usuario:()=>({rol:'admin', negocioId:'n1'}), ahora:()=>HOY, nuevoId:()=>'z'});
  const r=admin.borrarEjemplos('n1');
  assert.equal(r.ok, true); assert.ok(r.borrados>5);
  assert.deepEqual(datos.t.data_n1_productos.map(p=>p.id), ['mio']);
  const cajero=crearServicioPruebas({datos, dominio:{prueba, ejemplos}, usuario:()=>({rol:'cajero', negocioId:'n1'}), ahora:()=>HOY, nuevoId:()=>'z'});
  assert.equal(cajero.borrarEjemplos('n1').motivo, 'permiso');
});
test('por vencer: lo de este usuario que vence en los próximos días, demos incluidas', ()=>{
  const negs=[negocio('a', {pruebaHasta:HOY+DIA, vendedorId:'s3'}), negocio('b', {pruebaHasta:HOY+DIA, vendedorId:'s9'}),
    negocio('c', {esDemo:true, demoDe:'s3', pruebaHasta:HOY-DIA}), negocio('d', {pruebaHasta:HOY+20*DIA, vendedorId:'s3'})];
  assert.deepEqual(servicio(negs, VEND).s.porVencer(3).map(x=>x.id), ['c','a']);
  assert.deepEqual(servicio(negs, DUENO).s.porVencer(3).map(x=>x.id), ['c','a','b']);
  assert.equal(servicio(negs, VEND).s.porVencer(3)[0].esDemo, true);
});
