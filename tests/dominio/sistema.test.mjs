// Pruebas del historial del sistema (P2): entradas, cambios y filtros. npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as si from '../../src/dominio/sistema.js';

const QUIEN={nombre:'Ana', usuario:'ana', uid:'u1', rolSuper:'ayudante'};

test('cambios: solo los campos distintos, con antes y después', ()=>{
  assert.deepEqual(si.cambios({plan:'Básico', precioMes:1, nombre:'X'}, {plan:'Premium', precioMes:1, nombre:'X'}), {plan:{antes:'Básico', despues:'Premium'}});
  assert.deepEqual(si.cambios({}, {activo:false}), {activo:{antes:null, despues:'false'}});
  assert.deepEqual(si.cambios({motivo:'x'}, {}), {motivo:{antes:'x', despues:null}});
  assert.deepEqual(si.cambios({funciones:['a']}, {funciones:['a','b']}), {funciones:{antes:'["a"]', despues:'["a","b"]'}});
  assert.deepEqual(si.cambios(null, null), {});
});
test('cambios: logos, fotos y contraseñas no se copian; los textos largos se cortan', ()=>{
  const c=si.cambios({logo:'data:image/png;base64,AAAA', passHash:'h1'}, {logo:'data:image/png;base64,BBBB', passHash:'h2'});
  assert.deepEqual(c, {logo:{antes:'(oculto)', despues:'(cambió)'}, passHash:{antes:'(oculto)', despues:'(cambió)'}});
  assert.deepEqual(si.cambios({}, {logo:''}).logo, {antes:null, despues:'(cambió)'});
  const largo=si.cambios({}, {notas:'x'.repeat(500)}).notas.despues;
  assert.equal(largo.length, si.LARGO_MAX_VALOR);
  const muchos={}; for(let i=0;i<100;i++) muchos['c'+String(i).padStart(3,'0')]=i;
  assert.equal(Object.keys(si.cambios({}, muchos)).length, si.MAX_CAMBIOS);
});
test('entrada: quién, negocio, acción y cambios, sin campos vacíos (Firebase no los acepta)', ()=>{
  const e=si.entrada({id:'h1', fecha:5, accion:si.ACCION.suspenderNegocio, negocio:{id:'n1', nombre:'Tienda', logo:'x'},
    antes:{activo:true}, despues:{activo:false, motivoSuspension:'Falta de pago'}, detalle:'Falta de pago', quien:QUIEN});
  assert.deepEqual(e, {id:'h1', fecha:5, accion:'Suspendió el negocio', negocioId:'n1', negocioNombre:'Tienda',
    quien:'Ana', quienUsuario:'ana', quienUid:'u1', rolSuper:'ayudante', detalle:'Falta de pago',
    cambios:{activo:{antes:'true', despues:'false'}, motivoSuspension:{despues:'Falta de pago'}}});
  const sin=si.entrada({id:'h2', fecha:6, accion:si.ACCION.descargarRespaldo, quien:{nombre:'Dueño'}});
  assert.deepEqual(sin, {id:'h2', fecha:6, accion:'Descargó el respaldo', quien:'Dueño'});
  assert.ok(!JSON.stringify(si.entrada({id:'h3', accion:'x', quien:{}})).includes('undefined'));
});
test('filtros y orden de la pantalla', ()=>{
  const l=[
    {id:'a', fecha:1, negocioId:'n1', negocioNombre:'Tienda', quien:'Ana', quienUsuario:'ana', accion:'Suspendió el negocio'},
    {id:'b', fecha:3, negocioId:'n2', negocioNombre:'Café', quien:'Luis', quienUsuario:'luis', accion:'Creó el negocio'},
    {id:'c', fecha:2, quien:'Ana', quienUsuario:'ana', accion:'Descargó el respaldo', detalle:'completo'}
  ];
  assert.deepEqual(si.filtrar(l, {negocioId:'n1'}).map(e=>e.id), ['a']);
  assert.deepEqual(si.filtrar(l, {quien:'ana'}).map(e=>e.id), ['a','c']);
  assert.deepEqual(si.filtrar(l, {accion:'Creó el negocio'}).map(e=>e.id), ['b']);
  assert.deepEqual(si.filtrar(l, {texto:'café'}).map(e=>e.id), ['b']);
  assert.deepEqual(si.filtrar(l, {texto:'COMPLETO'}).map(e=>e.id), ['c']);
  assert.deepEqual(si.filtrar(l, {}).length, 3);
  assert.deepEqual(si.recientesPrimero(l).map(e=>e.id), ['b','c','a']);
});
