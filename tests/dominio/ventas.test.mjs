// Pruebas de estadísticas de ventas (F15), fechas de gastos (F2) y valoración a costo (F14). npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as vt from '../../src/dominio/ventas.js';
import * as fechas from '../../src/dominio/fechas.js';
import * as inv from '../../src/dominio/inventario.js';

test('vendido por producto: por id; el nombre es el de la venta más reciente', ()=>{
  const ventas=[
    {fecha:'2026-10-01T10:00:00Z', items:[{prodId:'p1', nombre:'Pola', precio:3000, qty:2}]},
    {fecha:'2026-10-05T10:00:00Z', items:[{prodId:'p1', nombre:'Poker', precio:3500, qty:1}]},   // se renombró
    {fecha:'2026-10-02T10:00:00Z', items:[{nombre:'Hielo', precio:1000, qty:3}]}                  // venta vieja sin id
  ];
  const r=Object.fromEntries(vt.vendidoPorProducto(ventas));
  assert.deepEqual(r, {Poker:{qty:3, total:9500}, Hielo:{qty:3, total:3000}});
});
test('vendido por producto: dos productos distintos con el mismo nombre no se suman', ()=>{
  const r=vt.vendidoPorProducto([{items:[{prodId:'a', nombre:'Combo', precio:10, qty:1},{prodId:'b', nombre:'Combo', precio:20, qty:1}]}]);
  assert.equal(r.length, 2);
  assert.deepEqual(r.map(x=>x[0]).sort(), ['Combo (1)','Combo (2)']);
  assert.deepEqual(vt.vendidoPorProducto(null), []);
});
test('propinas por quien atendió (id; las viejas por nombre)', ()=>{
  const r=vt.propinasPorPersona([
    {vendedorId:'u1', vendedor:'Ana', propina:2000},
    {vendedorId:'u1', vendedor:'Ana María', propina:1000},
    {vendedor:'Luis', propina:500},
    {vendedorId:'u2', vendedor:'Sin propina', propina:0}
  ]);
  assert.deepEqual(r, [['Ana',3000],['Luis',500]]);
});
test('venta de un domiciliario: por id, y por nombre en ventas viejas', ()=>{
  const d={id:'d1', nombre:'Pedro'};
  assert.equal(vt.esDelDomiciliario({domiciliarioId:'d1', domiciliario:'Otro nombre'}, d), true);
  assert.equal(vt.esDelDomiciliario({domiciliarioId:'d2', domiciliario:'Pedro'}, d), false);   // otro Pedro
  assert.equal(vt.esDelDomiciliario({domiciliario:'Pedro'}, d), true);
  assert.equal(vt.esDelDomiciliario(null, d), false);
});
test('día y mes de un gasto: AAAA-MM-DD tal cual; ISO al día local (F2)', ()=>{
  assert.equal(fechas.diaDe('2026-01-31'), '2026-01-31');
  const noche=new Date(2026,0,31,20,0,0);            // 31 de enero, 8 p. m. hora local
  assert.equal(fechas.diaDe(noche.toISOString()), '2026-01-31');
  assert.equal(fechas.mesDe(noche.toISOString()), '2026-01');
  assert.equal(fechas.diaDe(''), '');
});
test('inventario a costo; sin costo, a precio de venta (F14)', ()=>{
  assert.equal(inv.costoUnitario({costo:600, precio:1000}), 600);
  assert.equal(inv.costoUnitario({costo:0, precio:1000}), 1000);
  assert.deepEqual(inv.valorInventario([{stock:2, costo:600, precio:1000},{stock:1, precio:500},{stock:null, precio:9}]),
    {valor:1700, sinCosto:1, conCosto:1});
});

// ---------- F1: caja por sucursal ----------
import * as cj from '../../src/dominio/caja.js';
test('caja por sucursal: la forma de siempre es la principal', ()=>{
  const a={id:'c1', base:10};
  assert.equal(cj.cajaDe([a]).id, 'c1');
  assert.equal(cj.cajaDe([a],'principal').id, 'c1');
  assert.equal(cj.cajaDe([a],'s2'), null);
  assert.deepEqual(cj.sucursalesConCaja([a]), ['principal']);
});
test('caja por sucursal: abrir y cerrar una sede no toca la otra', ()=>{
  const a={id:'c1'}, b={id:'c2'};
  let v=cj.conCaja(null, 'principal', a);
  assert.deepEqual(v, [a]);                                   // un solo punto: forma de siempre
  v=cj.conCaja(v, 's2', b);
  assert.deepEqual(v, {cajas:{principal:a, s2:b}});
  assert.equal(cj.cajaDe(v,'s2').id, 'c2');
  assert.equal(cj.cajasDe(v).length, 2);
  v=cj.conCaja(v, 'principal', null);
  assert.deepEqual(v, {cajas:{s2:b}});
  assert.equal(cj.cajaDe(v), null);
  v=cj.conCaja(v, 's2', null);
  assert.equal(v, null);
});
test('venta o cierre de una sucursal (sin sucursal = principal)', ()=>{
  assert.equal(cj.deSucursal({}, 'principal'), true);
  assert.equal(cj.deSucursal({sucursalId:'s2'}, 's2'), true);
  assert.equal(cj.deSucursal({sucursalId:'s2'}, 'principal'), false);
});

test('F21: venta del negocio = sus productos (subtotal); propina, recargo y domicilio van aparte', ()=>{
  const v={estado:'pagada', subtotal:50000, propina:5000, recargo:1500, valorDom:4000, total:60500, fecha:'2026-10-12T15:00:00'};
  assert.equal(vt.ventaDelNegocio(v), 50000);
  assert.equal(vt.ventaDelNegocio({total:30000}), 30000);          // venta vieja sin subtotal
  assert.equal(vt.ventaDelNegocio(null), 0);
  // El resumen del panel del super-admin usa la misma definición (antes sumaba el total)
  const r=vt.resumenVentas([v, {estado:'anulada', subtotal:9999, total:9999, fecha:'2026-10-12T16:00:00'}], '2026-10-12');
  assert.equal(r.total, 50000); assert.equal(r.pagadas, 1);
  assert.equal(r.meses['2026-10'], 50000);
});

test('D9: cambios a un pedido que pueden chocar entre equipos', ()=>{
  const it=(prodId,qty,precio)=>({prodId, nombre:prodId, qty, precio});
  const cuenta={id:'v1', estado:'abierta', items:[it('a',1,1000)], descuento:0, valorDom:0, propina:0, recargo:0, total:1000};
  // El orden de las claves no importa (Firebase las devuelve ordenadas)
  assert.equal(vt.mismosItems([{qty:1, precio:1000, prodId:'a', nombre:'a'}], cuenta.items), true);
  assert.equal(vt.mismosItems([it('a',2,1000)], cuenta.items), false);
  // Agregar suma sobre lo que YA tiene la cuenta en el servidor (no reemplaza)
  const servidor=Object.assign({}, cuenta, {items:[it('a',1,1000), it('b',1,500)], total:1500});
  const x=vt.agregarACuenta(servidor, [it('a',2,1000), it('c',1,200)], {quien:'Ana'});
  assert.deepEqual(x.items.map(i=>i.prodId+i.qty), ['a3','b1','c1']);
  assert.equal(x.total, 3700);
  assert.equal(vt.agregarACuenta(Object.assign({}, cuenta, {estado:'pagada'}), [it('a',1,1000)]), undefined);
  // Cobrar: no si ya está pagada ni si cambiaron los productos que vio quien cobra
  const cambios={pagos:{efectivo:1000, banco:0, tarjeta:0}, total:1000};
  assert.equal(vt.cobrarSiSigueIgual(Object.assign({}, cuenta, {estado:'pagada'}), cuenta.items, cambios), undefined);
  assert.equal(vt.cobrarSiSigueIgual(servidor, cuenta.items, cambios), undefined);
  const c=vt.cobrarSiSigueIgual(cuenta, cuenta.items, Object.assign({exigeVerificar:true}, cambios, {pagos:{efectivo:0, banco:1000, tarjeta:0}}));
  assert.equal(c.estado, 'pagada'); assert.equal(c.bancoVerificado, false); assert.equal('exigeVerificar' in c, false);
  // Anular y editar: solo si sigue como lo vio quien lo hace
  assert.equal(vt.anularSiSigueIgual(Object.assign({}, cuenta, {estado:'pagada'}), 'abierta', {}), undefined);
  assert.equal(vt.anularSiSigueIgual(cuenta, 'abierta', {anuladaPor:'Ana'}).estado, 'anulada');
  assert.equal(vt.editarSiSigueIgual(servidor, 'abierta', cuenta.items, {id:'v1'}), undefined);
  assert.deepEqual(vt.editarSiSigueIgual(cuenta, 'abierta', cuenta.items, {id:'v1'}), {id:'v1'});
});
