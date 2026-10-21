// Pruebas del dominio (reglas puras). Se ejecutan con:  npm test   (o: node --test tests/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as fechas from '../../src/dominio/fechas.js';
import * as pagos from '../../src/dominio/pagos.js';
import * as caja from '../../src/dominio/caja.js';
import * as inv from '../../src/dominio/inventario.js';
import * as fac from '../../src/dominio/facturas.js';
import * as pw from '../../src/dominio/contrasenas.js';

// ---------- Fechas y jornada ----------
test('fechaLocal usa la fecha local y rechaza fechas inválidas', ()=>{
  assert.equal(fechas.fechaLocal(new Date(2026,0,5,23,30)), '2026-01-05');
  assert.equal(fechas.fechaLocal('no es fecha'), '');
});
test('la jornada de una venta es la guardada o su fecha', ()=>{
  assert.equal(fechas.jornadaDe({jornada:'2026-03-01', fecha:'2026-03-02T05:00:00'}), '2026-03-01');
  assert.equal(fechas.jornadaDe({fecha:new Date(2026,2,2,10).toISOString()}), '2026-03-02');
  assert.equal(fechas.mesDeJornada({jornada:'2026-03-01'}), '2026-03');
  assert.equal(fechas.jornadaDe(null), '');
});
test('jornada de caja = día de apertura', ()=>{
  assert.equal(fechas.jornadaDeCaja({apertura:new Date(2026,4,10,22,0).toISOString()}), '2026-05-10');
  assert.equal(fechas.jornadaCierre({jornada:'2026-05-10', cierre:'2026-05-11T03:00:00'}), '2026-05-10');
});
test('diasHasta y diasDesde', ()=>{
  assert.equal(fechas.diasHasta('2026-01-10','2026-01-05'), 5);
  assert.equal(fechas.diasHasta('2026-01-01','2026-01-05'), -4);
  assert.equal(fechas.diasHasta('', '2026-01-05'), null);
  assert.equal(fechas.diasDesde('2026-01-01T00:00:00Z', Date.parse('2026-01-04T12:00:00Z')), 3);
});

// ---------- Pagos ----------
test('pagosDe: ventas viejas cargan todo a su método', ()=>{
  assert.deepEqual(pagos.pagosDe({total:5000, metodo:'banco'}), {efectivo:0, banco:5000, tarjeta:0});
  assert.deepEqual(pagos.pagosDe({total:5000, metodo:'raro'}), {efectivo:5000, banco:0, tarjeta:0});
  assert.deepEqual(pagos.pagosDe({total:9, pagos:{efectivo:4, banco:5}}), {efectivo:4, banco:5, tarjeta:0});
});
test('reparte un monto en proporción al pago', ()=>{
  const v={pagos:{efectivo:3000, banco:1000, tarjeta:0}};
  assert.deepEqual(pagos.reparte(v, 400), {efectivo:300, banco:100, tarjeta:0});
});
test('método principal y resumen', ()=>{
  assert.equal(pagos.metodoPrincipal({efectivo:1, banco:0, tarjeta:0}), 'efectivo');
  assert.equal(pagos.metodoPrincipal({efectivo:1, banco:1, tarjeta:0}), 'mixto');
  assert.equal(pagos.metodoResumen({estado:'pagada', pagos:{efectivo:1, banco:1}}), 'Mixto');
  assert.equal(pagos.metodoResumen({estado:'abierta'}), '—');
});
test('liquidarCobro: faltante, cambio solo del efectivo, exacto', ()=>{
  assert.deepEqual(pagos.liquidarCobro(10000, {efectivo:0}), {ok:false, error:'sin_pago'});
  assert.equal(pagos.liquidarCobro(10000, {efectivo:5000}).faltan, 5000);
  const r=pagos.liquidarCobro(10000, {efectivo:20000});
  assert.equal(r.cambio, 10000); assert.equal(r.pagos.efectivo, 10000);
  assert.equal(pagos.liquidarCobro(10000, {banco:15000}).error, 'cambio_sin_efectivo');
  assert.deepEqual(pagos.liquidarCobro(10000, {efectivo:4000, tarjeta:6000}).pagos, {efectivo:4000, banco:0, tarjeta:6000});
});
test('transferencia pendiente de verificar', ()=>{
  assert.equal(pagos.bancoPendiente({estado:'pagada', bancoVerificado:false, pagos:{banco:100}}), true);
  assert.equal(pagos.bancoPendiente({estado:'pagada', bancoVerificado:true, pagos:{banco:100}}), false);
});

// ---------- Caja ----------
test('efectivo esperado: base + efectivo + entradas − gastos − retiros − terceros por banco', ()=>{
  const c={base:50000, movimientos:[{tipo:'gasto',valor:5000},{tipo:'retiro',valor:10000},{tipo:'entrada',valor:2000}]};
  const ventas=[
    {total:20000, pagos:{efectivo:20000}},                                       // todo efectivo
    {total:12000, valorDom:2000, pagos:{banco:12000}},                           // domicilio pagado por banco: sale del cajón
  ];
  // 50000 + 20000 + 2000 − 5000 − 10000 − 2000 = 55000
  assert.equal(caja.efectivoEsperado(c, ventas), 55000);
});
test('cajaDe acepta las formas en que llega caja_actual', ()=>{
  const c={id:'c1'};
  assert.equal(caja.cajaDe([c]), c);
  assert.equal(caja.cajaDe({0:c}), c);
  assert.equal(caja.cajaDe(c), c);
  assert.equal(caja.cajaDe(null), null);
  assert.equal(caja.cajaDe([]), null);
});
test('liquidarCierre', ()=>{
  assert.deepEqual(caja.liquidarCierre(100000, 98000, 50000), {diferencia:-2000, retiroJefe:48000});
  assert.equal(caja.liquidarCierre(100000, 40000, 50000), null);
});

// ---------- Inventario ----------
test('FEFO: se descuenta primero lo que vence antes; los lotes sin fecha al final', ()=>{
  const p={stock:15, lotes:[{id:'a',cantidad:5,vence:''},{id:'b',cantidad:5,vence:'2026-03-01'},{id:'c',cantidad:5,vence:'2026-01-01'}]};
  inv.aplicarCambioStock(p, -7, 'x', 'ahora');
  assert.equal(p.stock, 8);
  assert.deepEqual(p.lotes.map(l=>[l.id,l.cantidad]), [['a',5],['b',3]]);
  inv.aplicarCambioStock(p, 2, 'x', 'ahora');
  assert.deepEqual(p.lotes.map(l=>[l.id,l.cantidad]), [['a',5],['b',5]]);   // reingresa al más próximo a vencer
  inv.aplicarCambioStock(p, -100);
  assert.equal(p.stock, 0);                                                     // nunca negativo
});
test('reingresar sin lotes crea un lote sin fecha', ()=>{
  const p={stock:0, lotes:[]};
  inv.reingresarALotes(p, 3, 'L1', 'ahora');
  assert.deepEqual(p.lotes, [{id:'L1', cantidad:3, vence:'', ingresado:'ahora', motivo:'Devolución'}]);
});
test('lotes con alerta de vencimiento', ()=>{
  const prods=[{nombre:'Leche', lotes:[{cantidad:2, vence:'2026-01-03'},{cantidad:1, vence:'2026-02-01'},{cantidad:0, vence:'2026-01-01'}]}];
  const al=inv.lotesConAlerta(prods, 7, '2026-01-05');
  assert.equal(al.length, 1); assert.equal(al[0].dias, -2);
});
const productos=[
  {id:'cerveza', nombre:'Cerveza', precio:3000, stock:10},
  {id:'six', nombre:'Six Pack', precio:16000, esCombo:true, componentes:[{prodId:'cerveza', cantidad:6}]},
  {id:'plato', nombre:'Bandeja', precio:20000, stock:null, receta:[{insumoId:'arroz', cantidad:0.2}]},
  {id:'servicio', nombre:'Corte', precio:15000, stock:null}
];
test('combos: disponibles, precio suelto y faltantes en el carrito', ()=>{
  assert.equal(inv.disponiblesCombo(productos[1], productos), 1);
  assert.equal(inv.precioSuelto(productos[1], productos), 18000);
  assert.deepEqual(inv.faltantesParaAgregar([{prodId:'six', qty:1}], 'cerveza', productos), []);          // 6 + 1 = 7 ≤ 10
  assert.deepEqual(inv.faltantesParaAgregar([{prodId:'six', qty:1}], 'six', productos), [{nombre:'Cerveza', hay:10}]);  // 12 > 10
});
test('requerimientos expande combos y recetas', ()=>{
  const req=inv.requerimientos([{prodId:'six',qty:2},{prodId:'plato',qty:3},{prodId:'servicio',qty:1}], productos, true);
  assert.deepEqual(req, {prod:{cerveza:12}, ins:{arroz:0.6000000000000001}});
  assert.deepEqual(inv.requerimientos([{prodId:'plato',qty:3}], productos, false), {prod:{}, ins:{}});
});
test('diferencia de requerimientos y faltantes', ()=>{
  const d=inv.difRequerimientos({prod:{cerveza:2}, ins:{}}, {prod:{cerveza:5}, ins:{arroz:1}});
  assert.deepEqual(d, {prod:{cerveza:3}, ins:{arroz:1}});
  assert.deepEqual(inv.faltantesPara({prod:{cerveza:11}, ins:{arroz:1}}, productos, [{id:'arroz', nombre:'Arroz', stock:0.5}]),
    [{nombre:'Cerveza', pide:11, hay:10}, {nombre:'Arroz', pide:1, hay:0.5}]);
});

// ---------- Facturas ----------
test('consecutivo: usa la reserva si es mayor; si no, el mayor conocido + 1', ()=>{
  assert.equal(fac.numeroDe('F-00042'), 42);
  assert.equal(fac.mayorNumero([{factura:'F-00007'},{factura:'F-00003'},{}]), 7);
  assert.equal(fac.formatearFactura(8), 'F-00008');
  assert.equal(fac.elegirNumero(9, 8, 9), 9);
  assert.equal(fac.elegirNumero(null, 8, 10), 11);
  assert.equal(fac.elegirNumero(5, 8, 5), 9);       // reserva vieja: no se usa
});

// ---------- Contraseñas ----------
test('sha256Hex coincide con el de Node (UTF-8 y límites de bloque)', ()=>{
  for(const s of ['', 'abc', 'contraseña ñ ü 漢字', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'a'.repeat(1000)]){
    assert.equal(pw.sha256Hex(s), createHash('sha256').update(s,'utf8').digest('hex'));
  }
});
test('ponerPass guarda hash con sal y borra el texto plano; verificarPass acepta lo viejo', ()=>{
  const u=pw.ponerPass({usuario:'ana', pass:'vieja'}, 'Nueva123', '0123456789abcdef');
  assert.equal('pass' in u, false);
  assert.equal(u.passIter, pw.PASS_ITER);
  assert.equal(pw.verificarPass(u, 'Nueva123'), true);
  assert.equal(pw.verificarPass(u, 'nueva123'), false);
  assert.equal(pw.verificarPass({pass:'abc'}, 'abc'), true);
  assert.equal(pw.necesitaMigrar({pass:'abc'}), true);
  assert.equal(pw.necesitaMigrar(u), false);
  // misma contraseña, distinta sal → distinto hash
  assert.notEqual(pw.ponerPass({}, 'x', 'sal1').passHash, pw.ponerPass({}, 'x', 'sal2').passHash);
});

// ---------- Foto del producto ----------
test('foto del producto: solo se acepta una imagen data: (nada que pueda romper el HTML)', ()=>{
  assert.equal(inv.imagenValida('data:image/jpeg;base64,/9j/4AAQSkZJRg=='), true);
  assert.equal(inv.imagenValida('data:image/png;base64,iVBORw0KGgo='), true);
  assert.equal(inv.imagenValida(''), false);
  assert.equal(inv.imagenValida(undefined), false);
  assert.equal(inv.imagenValida('https://ejemplo.com/a.jpg'), false);
  assert.equal(inv.imagenValida('x" onerror="alert(1)'), false);
  assert.equal(inv.imagenValida('data:image/jpeg;base64,AAA" onerror="alert(1)'), false);
  assert.equal(inv.imagenValida('data:image/svg+xml;base64,PHN2Zz4='), false);
  assert.equal(inv.imagenValida('data:image/jpeg;base64,'+'A'.repeat(inv.FOTO_MAX_BYTES)), false);
});

test('S9: el cobro rechaza montos negativos (sacar efectivo cuadrando la caja)', ()=>{
  assert.deepEqual(pagos.liquidarCobro(50000, {efectivo:-50000, banco:100000, tarjeta:0}), {ok:false, error:'negativo'});
  assert.deepEqual(pagos.liquidarCobro(50000, {efectivo:0, banco:60000, tarjeta:-10000}), {ok:false, error:'negativo'});
  assert.equal(pagos.liquidarCobro(50000, {efectivo:60000, banco:0, tarjeta:0}).cambio, 10000);
  assert.equal(pagos.montoValido(0), true);
  assert.equal(pagos.montoValido(-1), false);
  assert.equal(pagos.montoValido(NaN), false);
  assert.equal(pagos.montoValido(Infinity), false);
  assert.equal(pagos.pagosValidos({efectivo:1000, banco:0, tarjeta:0}), true);
  assert.equal(pagos.pagosValidos({efectivo:1000, banco:-1, tarjeta:0}), false);
});

test('facturas sin conexión: bloques por equipo, número provisional y repetidos', ()=>{
  let b=fac.agregarRango([], 21, 40);
  assert.equal(fac.quedanEnBloque(b), 20);
  assert.equal(fac.necesitaBloque(b), false);
  const t1=fac.tomarDelBloque(b); assert.equal(t1.numero, 21); assert.equal(fac.quedanEnBloque(t1.rangos), 19);
  assert.equal(fac.quedanEnBloque(b), 20);                                  // no toca el original
  b=fac.agregarRango([[39,40]], 61, 80);                                     // se acaba uno, sigue el otro
  const nums=[]; let r=b; for(let i=0;i<3;i++){ const x=fac.tomarDelBloque(r); nums.push(x.numero); r=x.rangos; }
  assert.deepEqual(nums, [39,40,61]);
  assert.equal(fac.tomarDelBloque([]), null);
  assert.equal(fac.necesitaBloque([[1,4]]), true);
  // Provisional: código del equipo + fecha y hora; no cuenta como consecutivo
  const p=fac.numeroProvisional('K7Q2', new Date(2026,9,12,14,30,52).getTime());
  assert.equal(p, 'P-K7Q2-261012143052');
  assert.equal(fac.esProvisional(p), true);
  assert.equal(fac.esProvisional('F-00124'), false);
  assert.equal(fac.equipoDeProvisional(p), 'K7Q2');
  assert.equal(fac.numeroDe(p), 0);
  assert.equal(fac.mayorNumero([{factura:'F-00124'}, {factura:p}]), 124);
  assert.deepEqual(fac.repetidas([{factura:'F-00124'}, {factura:'F-00124'}, {factura:'F-00125'}, {factura:p}, {factura:p}]), [{factura:'F-00124', veces:2}]);
});

test('V3/V5: porcentajes, cantidades y códigos de barras repetidos', ()=>{
  assert.equal(pagos.porcentajeValido(0), true); assert.equal(pagos.porcentajeValido(100), true);
  assert.equal(pagos.porcentajeValido(-1), false); assert.equal(pagos.porcentajeValido(101), false); assert.equal(pagos.porcentajeValido(NaN), false);
  assert.equal(inv.cantidadValida(0), true); assert.equal(inv.cantidadValida(2.5), true);
  assert.equal(inv.cantidadValida(-1), false); assert.equal(inv.cantidadValida(NaN), false); assert.equal(inv.cantidadValida('3'), false);
  const prods=[{id:'p1', nombre:'Agua', codBarras:'770123'}, {id:'p2', nombre:'Gaseosa', codBarras:''}];
  assert.equal(inv.codigoRepetido(prods, ' 770123 ', 'p2').nombre, 'Agua');
  assert.equal(inv.codigoRepetido(prods, '770123', 'p1'), null);      // el suyo propio
  assert.equal(inv.codigoRepetido(prods, '', 'p2'), null);
});
