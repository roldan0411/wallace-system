// ============================================================
//  MANIFIESTO DE LA INTERFAZ
//  Lista de los módulos ES de la interfaz (adaptador de entrada) y su cargador.
//  Cada módulo importa lo que usa de los otros; aun así se listan TODOS porque
//  hay pantallas a las que solo se llega por un data-click (nadie las importa).
//  Reglas (las verifica tests/ui/estructura.test.mjs):
//   · ningún nombre exportado se repite entre módulos (las acciones de los
//     data-click y window.WS se buscan por nombre);
//   · al cargar, un módulo no ejecuta código de otro (solo declara): con
//     importaciones circulares, lo de otro módulo puede no estar listo aún;
//   · un módulo no asigna variables de otro (no se puede): usa su fijarX(v).
//  Archivo nuevo de interfaz → agregarlo aquí.
//  VERSION_UI va en el ?v= de los estilos de index.html: cambiarla en cada
//  publicación. Los módulos no llevan ?v= (un mismo módulo con dos URL serían
//  dos copias con estado distinto): render.yaml les pone Cache-Control: no-cache.
// ============================================================

export const VERSION_UI='2026-10-24c';

export const ARCHIVOS_UI=[
  'nucleo/estado.js',
  'nucleo/textos.js',
  'nucleo/permisos.js',
  'nucleo/componentes.js',
  'nucleo/logo.js',
  'nucleo/eventos.js',
  'nucleo/sonidos.js',
  'nucleo/avisos-nube.js',
  'nucleo/tema.js',
  'nucleo/tablas-movil.js',
  'nucleo/navegacion.js',
  'usuarios/sesion.js',
  'usuarios/cuentas.js',
  'usuarios/recuperacion.js',
  'usuarios/auditoria.js',
  'usuarios/usuarios-admin.js',
  'usuarios/usuarios-negocio.js',
  'usuarios/migracion-cuentas.js',
  'super-admin/panel.js',
  'super-admin/administradores.js',
  'super-admin/negocios.js',
  'super-admin/demos.js',
  'super-admin/pruebas.js',
  'super-admin/reporte-mensual.js',
  'super-admin/historial-sistema.js',
  'super-admin/ficha-negocio.js',
  'ventas/nueva-venta.js',
  'ventas/cuentas-abiertas.js',
  'ventas/pedidos.js',
  'ventas/cobro.js',
  'caja/caja.js',
  'cocina/comanda.js',
  'cocina/cocina.js',
  'cocina/tiempos.js',
  'citas/citas.js',
  'inventario/motor.js',
  'inventario/catalogo.js',
  'inventario/combos.js',
  'inventario/insumos.js',
  'inventario/conteo.js',
  'clientes/clientes.js',
  'clientes/domicilios.js',
  'reportes/dashboard.js',
  'reportes/reportes.js',
  'reportes/historial.js',
  'reportes/resumen.js',
  'gastos/contable.js',
  'gastos/gastos.js',
  'configuracion/config-negocio.js',
  'configuracion/mi-negocio.js',
  'impresion/facturas.js',
  'impresion/reportes.js',
  'impresion/reimpresiones.js',
  'nucleo/arranque.js'
];

// Importa todos los módulos y devuelve su espacio de nombres: nombre exportado →
// valor (vivo: un let se lee en el momento). Con él se instalan los eventos
// delegados; src/arranque.js lo usa para los ganchos y lo publica como window.WS.
export async function cargarInterfaz(){
  const modulos=await Promise.all(ARCHIVOS_UI.map(a=>import('./'+a)));
  const origen=Object.create(null);
  modulos.forEach(m=>Object.keys(m).forEach(k=>{ origen[k]=m; }));
  const ui=new Proxy(Object.create(null), {
    get: (_, k)=> origen[k] ? origen[k][k] : undefined,
    has: (_, k)=> k in origen,
    ownKeys: ()=> Object.keys(origen),
    getOwnPropertyDescriptor: (_, k)=> k in origen ? {value:origen[k][k], enumerable:true, configurable:true} : undefined,
    set: (_, k)=>{ throw new Error('WS.'+String(k)+' es de solo lectura: usa su función (p. ej. fijar…)'); }
  });
  ui.instalarEventosDelegados(ui);
  return ui;
}
