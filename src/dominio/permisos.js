// ============================================================
//  DOMINIO · Roles y permisos de los empleados de un negocio
//  Qué pantallas ve y qué acciones hace cada rol por defecto. El jefe puede
//  dar a cada empleado su propia lista (u.pantallas / u.permisos); si no la
//  tiene, se usa la de su rol. Admin, supervisor y super-admin pueden todo.
//  Con S1 las reglas de la base aíslan negocios; DENTRO del negocio estos
//  permisos siguen siendo de la app (Documentation/10-users-roles).
// ============================================================

export const ROLES = [['admin','Administrador'],['cajero','Cajero'],['mesero','Mesero'],
  ['cocina','Cocina'],['vendedor','Vendedor'],['dueno','Dueño']];

export const PANTALLAS_POR_ROL = {
  admin:   ['inicio','ventas','pedidos','catalogo','caja','cocina','citas','domicilios','clientes','conteo','reportes','contable','gastosneg','usuarios','config'],
  cajero:  ['inicio','ventas','pedidos','caja','clientes','domicilios'],
  mesero:  ['inicio','ventas','pedidos','clientes'],
  cocina:  ['cocina','pedidos'],
  vendedor:['inicio','ventas','pedidos','catalogo','clientes'],
  dueno:   ['inicio','caja','pedidos','reportes','contable','gastosneg','catalogo','conteo','combos','usuarios','config']
};

// Permisos de ACCIÓN (además del rol y de las pantallas)
export const ACCIONES = [
  ['cobrar','Cobrar pedidos'],
  ['editar','Editar pedidos'],
  ['anular','Anular facturas'],
  ['cambiarpago','Cambiar forma de pago'],
  ['imprimir','Reimprimir factura'],
  ['comanda','Reimprimir comanda de cocina'],
  ['eliminar','Eliminar definitivamente'],
  ['abrircaja','Abrir / cerrar caja'],
  ['descuento','Aplicar descuentos'],
  ['editarprod','Crear / editar / borrar productos'],
  ['editarstock','Editar stock (entradas, ajustes y lotes)'],
  ['conteo','Hacer conteo de inventario']
];
export const PERMISOS_POR_ROL = {
  admin:   ['cobrar','editar','anular','cambiarpago','imprimir','comanda','eliminar','abrircaja','descuento','editarprod','editarstock','conteo'],
  cajero:  ['cobrar','editar','cambiarpago','imprimir','comanda','abrircaja'],
  mesero:  ['editar','comanda'],
  cocina:  ['comanda'],
  vendedor:['cobrar','editar','imprimir','descuento'],
  // El dueño revisa y ajusta inventario, pero el cajero NO toca el stock:
  // así nadie puede maquillar un faltante desde la caja.
  dueno:   ['anular','eliminar','imprimir','editarprod','editarstock','conteo']
};

const todoPoderoso=u=>!!(u && (u.esSupervisor || u.rol==='admin' || u.rol==='superadmin'));

// ¿Este usuario puede hacer esta acción?
export function puede(u, accion){
  if(!u) return false;
  if(todoPoderoso(u)) return true;
  const lista=(u.permisos && u.permisos.length) ? u.permisos : (PERMISOS_POR_ROL[u.rol]||[]);
  return lista.indexOf(accion)>-1;
}
// Pantallas propias del empleado o las de su rol (cajero si el rol no existe)
export function pantallasDe(u){
  if(u && u.pantallas && u.pantallas.length) return u.pantallas;
  return PANTALLAS_POR_ROL[u && u.rol] || PANTALLAS_POR_ROL.cajero;
}
// Sucursales: vacío = todas
export function puedeVerSucursal(u, sucId){
  if(!u) return false;
  if(u.esSupervisor || u.rol==='admin') return true;
  if(!u.sucursales || !u.sucursales.length) return true;
  return u.sucursales.indexOf(sucId)>-1;
}
