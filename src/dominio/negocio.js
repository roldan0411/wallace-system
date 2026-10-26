// ============================================================
//  DOMINIO · Negocio: perfiles por tipo, planes, funciones y sucursales
//  Reglas de configuración de un negocio (tenant) que no dependen de la
//  interfaz ni de la base. Documentation/11-business-settings.
// ============================================================

import { esImagenData } from './inventario.js';

// Logo del negocio (S8): Mi Negocio lo reduce a 300 px. Solo se acepta una imagen
// data: válida; cualquier otro texto se trata como "sin logo". El tope es el mismo
// de las reglas (negocios_r/<id>/logo); los logos de producción miden hasta ~135 KB.
export const LOGO_MAX_BYTES=400000;
export function logoValido(s){ return esImagenData(s, LOGO_MAX_BYTES); }
// Id de un registro como lo aceptan las reglas: sin comillas ni símbolos (S8)
export const ID_SEGURO=/^[A-Za-z0-9_-]{1,64}$/;
export function idSeguro(id){ return typeof id==='string' && ID_SEGURO.test(id); }
// Copia de un negocio viejo lista para las reglas nuevas: un logo que no es imagen se quita
export function negocioParaGuardar(n){
  const x=JSON.parse(JSON.stringify(n||{}));
  if(x.logo && !logoValido(x.logo)) x.logo='';
  return x;
}

// Perfiles por tipo de negocio: el super-admin elige uno al crear y el
// negocio queda configurado (vocabulario, mesas, cocina, citas, funciones).
export const PERFILES = {
  'Restaurante':{
    palabraProducto:'Plato', palabraProductos:'Platos',
    palabraPedido:'Pedido', palabraPersonal:'Mesero',
    usaMesas:true, usaCocina:true, usaRecetas:true, usaCitas:false,
    flujoPedido:'dos_pasos',           // confirmar y luego cobrar
    tiposEntrega:['mesa','llevar','domicilio'],
    funciones:['ventas','catalogo','caja','facturas','clientes','cocina','domicilios','inventario','reportes','contable','gastosneg']
  },
  'Cafetería':{
    palabraProducto:'Producto', palabraProductos:'Productos',
    palabraPedido:'Pedido', palabraPersonal:'Mesero',
    usaMesas:true, usaCocina:true, usaRecetas:true, usaCitas:false,
    flujoPedido:'dos_pasos',
    tiposEntrega:['mesa','llevar','domicilio'],
    funciones:['ventas','catalogo','caja','facturas','clientes','cocina','domicilios','inventario','reportes','contable','gastosneg']
  },
  'Tienda / Accesorios':{
    palabraProducto:'Artículo', palabraProductos:'Artículos',
    palabraPedido:'Venta', palabraPersonal:'Vendedor',
    usaMesas:false, usaCocina:false, usaRecetas:false, usaCitas:false,
    flujoPedido:'directo',             // cobra de una vez
    tiposEntrega:['llevar','domicilio','envio'],
    funciones:['ventas','catalogo','caja','facturas','clientes','domicilios','inventario','reportes','contable','gastosneg']
  },
  'Barbería / Salón':{
    palabraProducto:'Servicio', palabraProductos:'Servicios',
    palabraPedido:'Cita', palabraPersonal:'Profesional',
    usaMesas:false, usaCocina:false, usaRecetas:false, usaCitas:true,
    flujoPedido:'directo',
    tiposEntrega:['llevar'],
    funciones:['ventas','catalogo','caja','facturas','clientes','citas','inventario','reportes','contable','gastosneg']
  },
  'Panadería':{
    palabraProducto:'Producto', palabraProductos:'Productos',
    palabraPedido:'Pedido', palabraPersonal:'Vendedor',
    usaMesas:false, usaCocina:true, usaRecetas:true, usaCitas:false,
    flujoPedido:'directo',
    tiposEntrega:['llevar','domicilio'],
    funciones:['ventas','catalogo','caja','facturas','clientes','domicilios','inventario','reportes','contable','gastosneg']
  },
  'Ferretería':{
    palabraProducto:'Producto', palabraProductos:'Productos',
    palabraPedido:'Venta', palabraPersonal:'Vendedor',
    usaMesas:false, usaCocina:false, usaRecetas:false, usaCitas:false,
    flujoPedido:'directo',
    tiposEntrega:['llevar','domicilio','envio'],
    funciones:['ventas','catalogo','caja','facturas','clientes','domicilios','inventario','reportes','contable','gastosneg']
  },
  'Logística / Bodega':{
    palabraProducto:'Producto', palabraProductos:'Productos',
    palabraPedido:'Despacho', palabraPersonal:'Operario',
    usaMesas:false, usaCocina:false, usaRecetas:false, usaCitas:false,
    usaCaja:false, esLogistica:true,   // no maneja dinero: entradas y salidas de mercancía
    flujoPedido:'directo',
    tiposEntrega:['entrega','despacho'],
    funciones:['ventas','catalogo','clientes','domicilios','inventario','reportes']
  },
  'Otro':{
    palabraProducto:'Producto', palabraProductos:'Productos',
    palabraPedido:'Pedido', palabraPersonal:'Personal',
    usaMesas:false, usaCocina:false, usaRecetas:false, usaCitas:false,
    flujoPedido:'directo',
    tiposEntrega:['llevar','domicilio'],
    funciones:['ventas','catalogo','caja','facturas','clientes','inventario','reportes','contable','gastosneg']
  }
};

// Planes comerciales (F6): un solo nombre en todo el sistema. "Empresarial" era el
// nombre viejo de la pantalla de configuración; los datos reales usan "Premium".
export const PLANES = ['Básico','Profesional','Premium'];
export function planDe(neg){ const p=(neg&&neg.plan)||''; return p==='Empresarial'?'Premium':(PLANES.indexOf(p)>-1?p:'Básico'); }

// Pestañas del panel del super-admin (U2): demos aparte (dinero ficticio), luego los
// suspendidos, luego los que están a prueba; el resto son clientes que pagan.
export const GRUPOS_PANEL=['clientes','prueba','demos','suspendidos'];
export function grupoPanel(neg){
  if(!neg) return 'clientes';
  if(neg.esDemo) return 'demos';
  if(!neg.activo) return 'suspendidos';
  if(typeof neg.pruebaHasta==='number') return 'prueba';
  return 'clientes';
}
export function contarPorGrupo(negocios){
  const c={clientes:0, prueba:0, demos:0, suspendidos:0};
  (negocios||[]).forEach(n=>{ c[grupoPanel(n)]++; });
  return c;
}

// Suspender un negocio (P3): siempre con motivo; "Otro" exige explicarlo. Devuelve los
// campos que cambian, o null si falta el motivo. Al reactivar se borran los dos campos
// (reservados: solo los escribe el super-admin, CAMPOS_NEGOCIO_RESERVADOS).
export const MOTIVOS_SUSPENSION=['Falta de pago','Solicitud del cliente','Otro'];
export function suspension(motivo, detalle, fecha){
  const d=String(detalle||'').trim().slice(0,120);
  if(MOTIVOS_SUSPENSION.indexOf(motivo)<0 || (motivo==='Otro' && !d)) return null;
  return {activo:false, suspendidoDesde:fecha, motivoSuspension:motivo==='Otro'?d:(d?motivo+': '+d:motivo)};
}
// Ventanas que se marcan al elegir la plantilla de un plan (Configuración → Ventanas).
// Profesional y Premium son iguales A PROPÓSITO (decisión F17, 2026-10-08): Premium se
// diferencia por precio y soporte, fuera del sistema.
export const VENTANAS_POR_PLAN={
  'Básico':['ventas','facturas','catalogo','inventario','caja','clientes'],
  'Profesional':['ventas','facturas','catalogo','inventario','caja','clientes','cocina','domicilios','reportes','contable','gastosneg','citas'],
  'Premium':['ventas','facturas','catalogo','inventario','caja','clientes','cocina','domicilios','reportes','contable','gastosneg','citas']
};

// Inventario (F12): la ventana la habilita el proveedor (funciones); el negocio decide si la usa
export function inventarioHabilitado(neg){ return !!(neg && (neg.funciones||[]).indexOf('inventario')>-1); }
export function usaInventario(neg){ return inventarioHabilitado(neg) && !neg.inventarioApagado; }
// Días de anticipación para avisar lotes por vencer (por defecto 7)
export function diasAvisoVence(neg){ return (neg && neg.diasAvisoVence!=null) ? neg.diasAvisoVence : 7; }

// Sucursales: sin lista propia, el negocio tiene una sola ("Principal")
export function sucursalesDe(neg){
  if(!neg) return [];
  if(neg.sucursales && neg.sucursales.length) return neg.sucursales;
  return [{id:'principal', nombre:'Principal'}];
}
export function usaSucursales(neg){ return !!(neg && neg.sucursales && neg.sucursales.length>1); }
