// Pruebas del cobro mensual a los clientes (P6). npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as co from '../../src/dominio/cobros.js';

const CLIENTE={activo:true, precioMes:149900, diaPago:10, cobroDesde:'2026-09'};

test('meses y vencimientos', ()=>{
  assert.equal(co.mesSiguiente('2026-12'), '2027-01');
  assert.equal(co.mesAnterior('2027-01'), '2026-12');
  assert.equal(co.vencimiento('2026-10', 10), '2026-10-10');
  assert.equal(co.vencimiento('2026-02', 31), '2026-02-28');     // el último día si el mes es corto
  assert.equal(co.vencimiento('2026-10', null), '2026-10-01');
  assert.equal(co.diaPagoPorDefecto('2026-10-31'), 28);
  assert.equal(co.diaPagoPorDefecto('2026-10-05'), 5);
  assert.equal(co.primerMesCobro('2026-10-05', 5), '2026-10');   // paga al empezar
  assert.equal(co.primerMesCobro('2026-10-20', 10), '2026-11');  // ya pasó el día de pago de este mes
  assert.equal(co.mesValido('2026-13'), false);
  assert.equal(co.mesValido('2026-1'), false);
});
test('estado: 5 días de gracia y después mora (contada desde el vencimiento)', ()=>{
  const pagoSept=Object.assign({}, CLIENTE, {pagadoHasta:'2026-09'});
  assert.deepEqual(co.estadoPago(pagoSept, '2026-10-09'), {estado:'al_dia', mes:'2026-10', vence:'2026-10-10'});
  assert.deepEqual(co.estadoPago(pagoSept, '2026-10-10'), {estado:'por_pagar', mes:'2026-10', vence:'2026-10-10', pendientes:1});
  assert.equal(co.estadoPago(pagoSept, '2026-10-15').estado, 'por_pagar');
  assert.deepEqual(co.estadoPago(pagoSept, '2026-10-16'), {estado:'en_mora', mes:'2026-10', vence:'2026-10-10', diasMora:6, pendientes:1});
  // Dos meses sin pagar: la mora cuenta desde el más viejo
  const e=co.estadoPago(pagoSept, '2026-11-12');
  assert.equal(e.estado, 'en_mora'); assert.equal(e.pendientes, 2); assert.equal(e.diasMora, 33);
  // Sin ningún pago: el primer mes es cobroDesde
  assert.equal(co.estadoPago(CLIENTE, '2026-09-11').mes, '2026-09');
  // Pagó por adelantado
  assert.equal(co.estadoPago(Object.assign({}, CLIENTE, {pagadoHasta:'2026-12'}), '2026-10-20').estado, 'al_dia');
  assert.equal(co.estadoPago(pagoSept, '2026-10-16', 10).estado, 'por_pagar');   // otra gracia
});
test('estado: lo que no se cobra y lo que aún no tiene control', ()=>{
  assert.equal(co.estadoPago(Object.assign({}, CLIENTE, {esDemo:true}), '2026-10-20').estado, 'no_aplica');
  assert.equal(co.estadoPago(Object.assign({}, CLIENTE, {pruebaHasta:5}), '2026-10-20').estado, 'no_aplica');
  assert.equal(co.estadoPago(Object.assign({}, CLIENTE, {precioMes:0}), '2026-10-20').estado, 'no_aplica');
  assert.equal(co.estadoPago({activo:true, precioMes:1000}, '2026-10-20').estado, 'sin_iniciar');
  assert.equal(co.estadoPago(null, '2026-10-20').estado, 'no_aplica');
});
test('pagos: validación, último mes pagado, total y mes sugerido', async ()=>{
  const p=co.nuevoPago({id:'p1', negocioId:'n1', mes:'2026-10', valor:'149900', medio:'Nequi', fecha:'2026-10-11', nota:'  ok ', quien:{nombre:'Ana'}, registrado:'x'});
  assert.deepEqual(p, {id:'p1', negocioId:'n1', mes:'2026-10', valor:149900, medio:'Nequi', fecha:'2026-10-11', registrado:'x', quien:'Ana', nota:'ok'});
  assert.equal(co.problemaDelPago(p), '');
  assert.equal(co.problemaDelPago(Object.assign({}, p, {valor:0})), 'valor');
  assert.equal(co.problemaDelPago(Object.assign({}, p, {valor:-5})), 'valor');
  assert.equal(co.problemaDelPago(Object.assign({}, p, {medio:'Bitcoin'})), 'medio');
  assert.equal(co.problemaDelPago(Object.assign({}, p, {mes:'2026-13'})), 'mes');
  assert.equal(co.problemaDelPago(Object.assign({}, p, {fecha:'ayer'})), 'fecha');
  const pagos=[{mes:'2026-09', valor:100}, {mes:'2026-11', valor:100, anulado:true}, {mes:'2026-10', valor:50}];
  assert.equal(co.pagadoHasta(pagos), '2026-10');
  assert.equal(co.pagadoHasta([]), null);
  // Sin huecos desde el inicio del cobro: pagar noviembre no tapa la deuda de octubre
  assert.equal(co.pagadoHasta([{mes:'2026-09'}, {mes:'2026-11'}], '2026-09'), '2026-09');
  assert.equal(co.pagadoHasta([{mes:'2026-09'}, {mes:'2026-10'}, {mes:'2026-11'}], '2026-09'), '2026-11');
  assert.equal(co.pagadoHasta([{mes:'2026-10'}], '2026-09'), null);   // falta el primero
  assert.deepEqual(co.inicioDeCobro('2026-10-20', 10), {diaPago:10, cobroDesde:'2026-11', pagadoHasta:null});
  assert.deepEqual(co.inicioDeCobro('2026-10-20'), {diaPago:20, cobroDesde:'2026-10', pagadoHasta:null});
  const { CAMPOS_NEGOCIO_RESERVADOS }=await import('../../src/dominio/cuentas.js');
  co.CAMPOS_COBRO.concat(['diaPago']).forEach(c=>assert.ok(CAMPOS_NEGOCIO_RESERVADOS.includes(c), c+' debe estar reservado'));
  assert.equal(co.totalPagado(pagos), 150);
  assert.equal(co.mesPorPagar({pagadoHasta:'2026-10'}, '2026-12-01'), '2026-11');
  assert.equal(co.mesPorPagar({cobroDesde:'2026-09'}, '2026-12-01'), '2026-09');
  assert.equal(co.mesPorPagar({}, '2026-12-01'), '2026-12');
});
