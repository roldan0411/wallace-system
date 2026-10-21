// firebase-config.js: qué base usa cada dirección. Es lo que impide que el
// desarrollo toque producción (Documentation/-00-execution-protocol/paso-a-produccion.md). npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elegirEntorno, HOSTS_PRODUCCION, PRODUCCION, PRUEBAS, EMULADORES } from '../../firebase-config.js';

const en=(hostname, search)=>elegirEntorno({hostname, search:search||''});

test('localhost sin nada usa el proyecto de PRUEBAS, nunca producción', ()=>{
  const e=en('localhost');
  assert.equal(e.entorno, PRUEBAS ? 'pruebas' : 'local');
  assert.notEqual(e.config, PRODUCCION);
  assert.equal(e.emuladores, null);
});
test('?local fuerza el modo local (lo usan las pruebas y las capturas)', ()=>{
  for(const h of ['localhost', '127.0.0.1']) assert.deepEqual(en(h, '?local'), {entorno:'local', config:null, emuladores:null});
});
test('?emulador usa los emuladores con el proyecto ficticio demo-wallace', ()=>{
  const e=en('localhost', '?emulador');
  assert.equal(e.entorno, 'emulador');
  assert.equal(e.config.projectId, 'demo-wallace');
  assert.deepEqual(e.emuladores, EMULADORES);
});
test('?local y ?emulador solo valen en localhost: en un dominio público se ignoran', ()=>{
  assert.equal(en('wallacesys-dev-sandbox.web.app', '?local').entorno, PRUEBAS ? 'pruebas' : 'local');
  assert.equal(en('otro.onrender.com', '?emulador').entorno, PRUEBAS ? 'pruebas' : 'local');
});
test('un dominio que no está en HOSTS_PRODUCCION nunca usa producción', ()=>{
  for(const h of ['wallacesys-dev-sandbox.web.app', 'mi-fork.onrender.com', 'wallace-system.onrender.com.evil.com']){
    if(HOSTS_PRODUCCION.indexOf(h)>-1) continue;
    assert.notEqual(en(h).entorno, 'produccion', h);
    assert.notEqual(en(h).config, PRODUCCION, h);
  }
});
test('los dominios de HOSTS_PRODUCCION usan producción (si ya se llenó la lista)', ()=>{
  HOSTS_PRODUCCION.forEach(h=>{ const e=en(h); assert.equal(e.entorno, 'produccion'); assert.equal(e.config, PRODUCCION); });
  assert.ok(Array.isArray(HOSTS_PRODUCCION));
});
test('PRODUCCION es el proyecto de la empresa y PRUEBAS otro distinto', ()=>{
  assert.equal(PRODUCCION.projectId, 'wallace-system');
  if(PRUEBAS) assert.notEqual(PRUEBAS.projectId, PRODUCCION.projectId);
});
