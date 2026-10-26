// Pruebas de permisos, negocio, gastos y conteo (reglas sacadas de la interfaz). npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as pm from '../../src/dominio/permisos.js';
import * as ng from '../../src/dominio/negocio.js';
import * as gs from '../../src/dominio/gastos.js';
import * as inv from '../../src/dominio/inventario.js';

test('permisos: admin/supervisor/super-admin pueden todo; el resto, su lista o la de su rol', ()=>{
  assert.equal(pm.puede(null, 'cobrar'), false);
  assert.equal(pm.puede({rol:'admin'}, 'eliminar'), true);
  assert.equal(pm.puede({esSupervisor:true, rol:'cajero'}, 'eliminar'), true);
  assert.equal(pm.puede({rol:'superadmin'}, 'descuento'), true);
  assert.equal(pm.puede({rol:'cajero'}, 'cobrar'), true);
  assert.equal(pm.puede({rol:'cajero'}, 'editarstock'), false);   // el cajero no toca el stock
  assert.equal(pm.puede({rol:'cajero', permisos:['editarstock']}, 'editarstock'), true);
  assert.equal(pm.puede({rol:'cajero', permisos:['editarstock']}, 'cobrar'), false);   // lista propia reemplaza la del rol
  assert.equal(pm.puede({rol:'inventado'}, 'cobrar'), false);
});
test('pantallas: las propias, las del rol o las de cajero si el rol no existe', ()=>{
  assert.deepEqual(pm.pantallasDe({rol:'cocina'}), ['cocina','pedidos']);
  assert.deepEqual(pm.pantallasDe({rol:'cocina', pantallas:['inicio']}), ['inicio']);
  assert.deepEqual(pm.pantallasDe({rol:'raro'}), pm.PANTALLAS_POR_ROL.cajero);
  // Todo rol tiene pantallas y permisos por defecto
  pm.ROLES.forEach(([r])=>{ assert.ok(pm.PANTALLAS_POR_ROL[r], r); assert.ok(pm.PERMISOS_POR_ROL[r], r); });
  const acciones=pm.ACCIONES.map(a=>a[0]);
  Object.values(pm.PERMISOS_POR_ROL).flat().forEach(a=>assert.ok(acciones.includes(a), a));
});
test('sucursales permitidas: vacío = todas; admin y supervisor, todas', ()=>{
  assert.equal(pm.puedeVerSucursal(null,'s1'), false);
  assert.equal(pm.puedeVerSucursal({rol:'cajero'},'s1'), true);
  assert.equal(pm.puedeVerSucursal({rol:'cajero', sucursales:['s2']},'s1'), false);
  assert.equal(pm.puedeVerSucursal({rol:'admin', sucursales:['s2']},'s1'), true);
  assert.deepEqual(ng.sucursalesDe({}), [{id:'principal', nombre:'Principal'}]);
  assert.deepEqual(ng.sucursalesDe(null), []);
  assert.equal(ng.usaSucursales({sucursales:[{id:'a'}]}), false);
  assert.equal(ng.usaSucursales({sucursales:[{id:'a'},{id:'b'}]}), true);
});
test('planes (F6): Empresarial se lee como Premium; desconocido, Básico', ()=>{
  assert.equal(ng.planDe({plan:'Empresarial'}), 'Premium');
  assert.equal(ng.planDe({plan:'Profesional'}), 'Profesional');
  assert.equal(ng.planDe({plan:'Gold'}), 'Básico');
  assert.equal(ng.planDe(null), 'Básico');
  ng.PLANES.forEach(p=>assert.ok(ng.VENTANAS_POR_PLAN[p], p));
});
test('inventario (F12): habilitado por el proveedor y no apagado por el negocio', ()=>{
  assert.equal(ng.usaInventario({funciones:['inventario']}), true);
  assert.equal(ng.usaInventario({funciones:['inventario'], inventarioApagado:true}), false);
  assert.equal(ng.usaInventario({funciones:['ventas']}), false);
  assert.equal(ng.usaInventario(null), false);
  assert.equal(ng.diasAvisoVence({diasAvisoVence:0}), 0);
  assert.equal(ng.diasAvisoVence({}), 7);
});
test('perfiles de negocio completos', ()=>{
  Object.entries(ng.PERFILES).forEach(([tipo,p])=>{
    assert.ok(p.palabraProducto && p.palabraProductos && p.flujoPedido, tipo);
    assert.ok(Array.isArray(p.tiposEntrega) && p.tiposEntrega.length, tipo);
    assert.ok(Array.isArray(p.funciones) && p.funciones.includes('ventas'), tipo);
  });
  assert.ok(ng.PERFILES['Otro']);   // respaldo cuando el tipo no existe
});
test('conceptos de gasto sin repetidos por mayúsculas, tildes o espacios', ()=>{
  assert.equal(gs.claveConcepto('  Nómina  '), 'nomina');
  assert.deepEqual(gs.conceptosUnicos(['arriendo','Arriendo ',' Nómina','nomina','','Agua']), ['Agua','arriendo','Nómina']);
  const o={};
  gs.acumularConcepto(o, 'arriendo', 100, ['Arriendo']);
  gs.acumularConcepto(o, 'ARRIENDO ', 50, ['Arriendo']);
  gs.acumularConcepto(o, '', 10, []);
  assert.deepEqual(o, {Arriendo:150, Otros:10});
});
test('diferencia del conteo físico', ()=>{
  assert.equal(inv.diferenciaConteo({contado:'', sistema:5}), null);
  assert.equal(inv.diferenciaConteo({contado:NaN, sistema:5}), null);
  assert.equal(inv.diferenciaConteo({contado:3, sistema:5}), -2);
  assert.equal(inv.diferenciaConteo({contado:0, sistema:0}), 0);
});

test('5425800: gastos de caja: la copia solo suma si su movimiento no aparece (por movId o, si es vieja, por concepto y valor)', ()=>{
  const movs=[{id:'m1', tipo:'gasto', concepto:'Hielo', valor:3000}, {id:'m2', tipo:'gasto', concepto:'Bolsas', valor:1000},
    {id:'m3', tipo:'retiro', concepto:'Dueño', valor:50000}];
  const copias=[
    {id:'g1', origen:'caja', movId:'m1', concepto:'Hielo', valor:3000},      // su movimiento está
    {id:'g2', origen:'caja', movId:'mX', concepto:'Gas', valor:8000},        // su movimiento no está (cierre sin detalle)
    {id:'g3', origen:'caja', concepto:'bolsas ', valor:1000},                // vieja sin movId: cruza con m2
    {id:'g4', origen:'caja', concepto:'Bolsas', valor:1000},                 // otra igual: m2 ya se usó
    {id:'g5', concepto:'Arriendo', valor:900000}                             // del negocio: no es copia
  ];
  assert.deepEqual(gs.copiasSinMovimiento(copias, movs).map(g=>g.id), ['g2','g4']);
  assert.deepEqual(gs.copiasSinMovimiento([], movs), []);
  assert.deepEqual(gs.copiasSinMovimiento(copias.slice(0,1), []).map(g=>g.id), ['g1']);
});

test('S8: el logo del negocio solo es válido como imagen data: (sin comillas) y con tope de tamaño', ()=>{
  assert.equal(ng.logoValido('data:image/png;base64,iVBORw0KGgo='), true);
  assert.equal(ng.logoValido('data:image/jpeg;base64,/9j/4AAQ'), true);
  assert.equal(ng.logoValido(''), false);
  assert.equal(ng.logoValido(null), false);
  assert.equal(ng.logoValido('x" onerror="alert(1)'), false);
  assert.equal(ng.logoValido('data:image/png;base64,AAA" onerror="alert(1)'), false);
  assert.equal(ng.logoValido('data:image/png;base64,AAA" style="position:fixed'), false);
  assert.equal(ng.logoValido('data:image/svg+xml;base64,PHN2Zz4='), false);       // un SVG puede llevar código
  assert.equal(ng.logoValido('https://otro.sitio/logo.png'), false);              // ni imágenes de fuera (rastreo)
  assert.equal(ng.logoValido('data:image/png;base64,'+'A'.repeat(ng.LOGO_MAX_BYTES)), false);
});

test('flujos a medias: diferencia de apartados de una cita y pago al domiciliario ya registrado', async ()=>{
  const inv=await import('../../src/dominio/inventario.js');
  const caja=await import('../../src/dominio/caja.js');
  assert.deepEqual(inv.difApartados([{prodId:'a', cantidad:2}, {prodId:'b', cantidad:1}], [{prodId:'a', cantidad:3}, {prodId:'c', cantidad:1}]),
    {sacar:{a:1, c:1}, devolver:{b:1}});
  assert.deepEqual(inv.difApartados([], [{prodId:'a', cantidad:2}]), {sacar:{a:2}, devolver:{}});
  const c={movimientos:[{tipo:'retiro', pagoDomi:'d1', valor:3000}, {tipo:'retiro', valor:9000}, {tipo:'gasto', pagoDomi:'d1', valor:1}]};
  assert.equal(caja.pagadoADomiciliario(c, 'd1'), 3000);
  assert.equal(caja.pagadoADomiciliario(null, 'd1'), 0);
});

test('P3: suspender pide motivo; "Otro" exige explicarlo', ()=>{
  const f='2026-10-24T10:00:00.000Z';
  assert.deepEqual(ng.suspension('Falta de pago', '', f), {activo:false, suspendidoDesde:f, motivoSuspension:'Falta de pago'});
  assert.deepEqual(ng.suspension('Solicitud del cliente', ' cierra por obras ', f).motivoSuspension, 'Solicitud del cliente: cierra por obras');
  assert.equal(ng.suspension('Otro', '  ', f), null);
  assert.equal(ng.suspension('Otro', 'Cambio de dueño', f).motivoSuspension, 'Cambio de dueño');
  assert.equal(ng.suspension('', 'algo', f), null);
  assert.equal(ng.suspension('Inventado', '', f), null);
  assert.equal(ng.suspension('Otro', 'x'.repeat(300), f).motivoSuspension.length, 120);
});
test('P11: no se deja un negocio sin administrador activo', ()=>{
  const us=[{id:'a', negocioId:'n1', rol:'admin'}, {id:'c', negocioId:'n1', rol:'cajero'}, {id:'b', negocioId:'n2', rol:'admin'}];
  assert.equal(pm.dejaSinAdmin(us, 'n1', 'a', null), true);                          // borrar el único admin
  assert.equal(pm.dejaSinAdmin(us, 'n1', 'a', {rol:'admin', activo:false}), true);   // desactivarlo
  assert.equal(pm.dejaSinAdmin(us, 'n1', 'a', {rol:'cajero', activo:true}), true);   // quitarle el rol
  assert.equal(pm.dejaSinAdmin(us, 'n1', 'a', {rol:'admin', activo:true}), false);   // editarlo sin cambiar eso
  assert.equal(pm.dejaSinAdmin(us, 'n1', 'c', null), false);                         // borrar a otro
  const dos=us.concat([{id:'a2', negocioId:'n1', rol:'admin'}]);
  assert.equal(pm.dejaSinAdmin(dos, 'n1', 'a', null), false);                        // queda otro admin
  const inactivo=us.concat([{id:'a3', negocioId:'n1', rol:'admin', activo:false}]);
  assert.equal(pm.dejaSinAdmin(inactivo, 'n1', 'a', null), true);                    // uno inactivo no cuenta
  assert.equal(pm.dejaSinAdmin([{id:'c', negocioId:'n3', rol:'cajero'}], 'n3', 'c', null), false);   // sin admin hoy: no bloquea
  assert.equal(pm.dejaSinAdmin(us, 'n1', 'nuevo', {rol:'cajero', activo:true}), false);
});

test('U2: cada negocio va a una pestaña del panel', ()=>{
  assert.equal(ng.grupoPanel({activo:true}), 'clientes');
  assert.equal(ng.grupoPanel({activo:true, pruebaHasta:5}), 'prueba');
  assert.equal(ng.grupoPanel({activo:false, pruebaHasta:5}), 'suspendidos');   // suspendido manda sobre la prueba
  assert.equal(ng.grupoPanel({activo:false, esDemo:true}), 'demos');           // una demo pausada sigue en demos
  assert.equal(ng.grupoPanel({activo:true, esDemo:true, pruebaHasta:5}), 'demos');
  assert.equal(ng.grupoPanel(null), 'clientes');
  assert.deepEqual(ng.contarPorGrupo([{activo:true}, {activo:true}, {activo:false}, {esDemo:true, activo:true}, {activo:true, pruebaHasta:1}]),
    {clientes:2, prueba:1, demos:1, suspendidos:1, archivados:0});
  assert.deepEqual(ng.GRUPOS_PANEL, ['clientes','prueba','demos','suspendidos','archivados']);
  assert.equal(ng.grupoPanel({activo:false, archivado:true}), 'archivados');   // archivado manda sobre suspendido
});
test('actividad: último día con ventas del resumen', async ()=>{
  const vt=await import('../../src/dominio/ventas.js');
  assert.equal(vt.ultimoDiaConVentas({dias:{'2026-10-20':5000, '2026-10-22':100, '2026-10-23':0}}), '2026-10-22');
  assert.equal(vt.ultimoDiaConVentas({dias:{}}), null);
  assert.equal(vt.ultimoDiaConVentas({total:0}), null);
  assert.equal(vt.ultimoDiaConVentas(null), null);
});

test('P4: archivar 30 días antes de poder borrar; las demos se borran directo', ()=>{
  const f='2026-10-01T12:00:00.000Z', dia=86400000, t0=new Date(f).getTime();
  assert.deepEqual(ng.archivar(f), {activo:false, archivado:true, archivadoDesde:f});
  const a={id:'n1', archivado:true, archivadoDesde:f};
  assert.equal(ng.borrableDesde(a), new Date(t0+30*dia).toISOString());
  assert.equal(ng.puedeBorrarse(a, t0+29*dia), false);
  assert.equal(ng.puedeBorrarse(a, t0+30*dia), true);
  assert.equal(ng.puedeBorrarse({id:'n2', activo:true}, t0), false);              // sin archivar no se borra
  assert.equal(ng.puedeBorrarse({id:'n3', esDemo:true}, t0), true);
  assert.equal(ng.borrableDesde({archivado:true, archivadoDesde:'basura'}), null);
});

test('U6: orden y filtro por ciudad del panel', ()=>{
  const l=[{id:'a', nombre:'Zeta', creado:'2026-01-01', precioMes:100}, {id:'b', nombre:'Álamo', creado:'2026-05-01', precioMes:300}, {id:'c', nombre:'Mango', creado:'2026-03-01', precioMes:200}];
  assert.deepEqual(ng.ordenarPanel(l, 'nombre').map(n=>n.id), ['b','c','a']);
  assert.deepEqual(ng.ordenarPanel(l, 'recientes').map(n=>n.id), ['b','c','a']);
  assert.deepEqual(ng.ordenarPanel(l, 'precio').map(n=>n.id), ['b','c','a']);
  assert.deepEqual(ng.ordenarPanel(l, '').map(n=>n.id), ['a','b','c']);            // sin criterio: como vienen
  assert.deepEqual(ng.ordenarPanel(l, 'mora', n=>n.id==='c'?9:0).map(n=>n.id)[0], 'c');
  assert.equal(l[0].id, 'a');                                                       // no cambia la lista original
  assert.equal(ng.claveCiudad('  Bucaramanga '), 'bucaramanga');
});
test('U7: fechas legibles', async ()=>{
  const f=await import('../../src/dominio/fechas.js');
  assert.deepEqual([0,1,6,59,61,400,800].map(f.haceTexto), ['hoy','ayer','hace 6 días','hace 59 días','hace 2 meses','hace 13 meses','hace 2 años']);
  assert.equal(f.haceTexto(null), '');
});

test('P5: precio sugerido por plan y día de pago del alta', ()=>{
  ng.PLANES.forEach(p=>assert.ok(ng.precioSugerido(p)>0, p));
  assert.equal(ng.precioSugerido('Inventado'), ng.PRECIO_SUGERIDO['Básico']);
  assert.equal(ng.diaPagoEscrito(''), null);
  assert.equal(ng.diaPagoEscrito('15'), 15);
  assert.ok(isNaN(ng.diaPagoEscrito('31')));
  assert.ok(isNaN(ng.diaPagoEscrito('0')));
  assert.ok(isNaN(ng.diaPagoEscrito('2.5')));
});
