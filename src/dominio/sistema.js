// ============================================================
//  DOMINIO · Historial del sistema (P2)
//  Lo que hace un super-admin sobre negocios y cuentas: quién, cuándo, qué,
//  sobre qué negocio y qué campos cambiaron (antes → después). Lo lee solo el
//  dueño del sistema; nadie lo edita ni lo borra (auditoria_sistema en
//  database.rules.json). Documentation/01-super-admin-panel/revision-panel.md (P2)
// ============================================================

// Lo que se registra (texto que se ve en la pantalla Historial)
export const ACCION={
  crearNegocio:'Creó el negocio', editarNegocio:'Cambió la configuración', aplicarPlan:'Aplicó las ventanas del plan',
  suspenderNegocio:'Suspendió el negocio', activarNegocio:'Activó el negocio', pausarDemo:'Pausó la demo',
  eliminarNegocio:'Eliminó el negocio', archivarNegocio:'Archivó el negocio', desarchivarNegocio:'Sacó el negocio del archivo', asignarVendedor:'Cambió el vendedor',
  agregarSucursal:'Agregó una sucursal', quitarSucursal:'Quitó una sucursal',
  iniciarPrueba:'Dejó el negocio a prueba', darDias:'Dio más días de prueba', pasarAPago:'Pasó el negocio a pago',
  crearDemo:'Creó una demo', eliminarDemo:'Eliminó una demo',
  entrarSupervision:'Entró a supervisar', salirSupervision:'Salió de supervisar',
  crearUsuario:'Creó un usuario', editarUsuario:'Editó un usuario', desactivarUsuario:'Desactivó un usuario', eliminarUsuario:'Eliminó un usuario',
  crearSuperAdmin:'Creó un administrador del sistema', editarSuperAdmin:'Editó un administrador del sistema', eliminarSuperAdmin:'Eliminó un administrador del sistema',
  generarTemporal:'Generó una contraseña temporal', descartarRecuperacion:'Descartó una solicitud de contraseña',
  cambiarMiPass:'Cambió su contraseña', pasarAMiCorreo:'Pasó su cuenta a su correo', migrarCuenta:'Pasó una cuenta a Firebase', borrarPerfil:'Borró un perfil sin usuario',
  descargarRespaldo:'Descargó el respaldo', registrarPago:'Registró un pago', anularPago:'Anuló un pago', avisarPago:'Avisó que su cliente pagó', rechazarAvisoPago:'Rechazó un aviso de pago', restaurarNegocio:'Restauró un negocio desde un respaldo'
};

// Campos que no se copian: pesan mucho (imágenes) o son secretos. Solo se dice que cambiaron.
export const CAMPOS_SIN_VALOR=['logo','imagen','foto','pass','passHash','passSal','passIter'];
export const LARGO_MAX_VALOR=200;
export const MAX_CAMBIOS=40;

function valorCorto(v){
  if(v===undefined || v===null) return null;
  const s=typeof v==='object' ? JSON.stringify(v) : String(v);
  return s.length>LARGO_MAX_VALOR ? s.slice(0, LARGO_MAX_VALOR-1)+'…' : s;
}
// Campos distintos entre dos versiones de un registro: {campo:{antes, despues}} (null = no tenía)
export function cambios(antes, despues){
  const a=antes||{}, b=despues||{}, out={};
  const campos=Array.from(new Set(Object.keys(a).concat(Object.keys(b)))).sort();
  for(const k of campos){
    if(JSON.stringify(a[k])===JSON.stringify(b[k])) continue;
    if(Object.keys(out).length>=MAX_CAMBIOS) break;
    out[k]=CAMPOS_SIN_VALOR.indexOf(k)>-1
      ? {antes:a[k]==null?null:'(oculto)', despues:b[k]==null?null:'(cambió)'}
      : {antes:valorCorto(a[k]), despues:valorCorto(b[k])};
  }
  return out;
}
// Firebase no acepta undefined: se quitan (y los null, que no guarda)
function sinVacios(o){
  const out={};
  Object.keys(o).forEach(k=>{
    const v=o[k];
    if(v===undefined || v===null) return;
    out[k]=(v && typeof v==='object' && !Array.isArray(v)) ? sinVacios(v) : v;
  });
  return out;
}
// Una entrada del historial. quien = el super-admin (no el usuario "Supervisor").
export function entrada({id, fecha, accion, negocio, antes, despues, detalle, quien}){
  const q=quien||{}, n=negocio||{};
  const c=cambios(antes, despues);
  return sinVacios({
    id, fecha, accion:String(accion||'').slice(0,80),
    negocioId:n.id||null, negocioNombre:n.nombre?String(n.nombre).slice(0,80):null,
    quien:String(q.nombre||q.usuario||'—').slice(0,80), quienUsuario:q.usuario||null, quienUid:q.uid||null,
    rolSuper:q.rolSuper||null,
    detalle:detalle?String(detalle).slice(0,LARGO_MAX_VALOR):null,
    cambios:Object.keys(c).length ? c : null
  });
}
// Filtros de la pantalla: por negocio, por persona, por acción y texto libre
export function filtrar(lista, f){
  const o=f||{}, t=String(o.texto||'').trim().toLowerCase();
  return (lista||[]).filter(e=>e
    && (!o.negocioId || e.negocioId===o.negocioId)
    && (!o.quien || e.quienUsuario===o.quien || (!e.quienUsuario && e.quien===o.quien))
    && (!o.accion || e.accion===o.accion)
    && (!t || [e.negocioNombre, e.quien, e.accion, e.detalle].some(x=>String(x||'').toLowerCase().indexOf(t)>-1)));
}
// La más nueva primero (fecha en milisegundos; la pone el servidor)
export function recientesPrimero(lista){
  return (lista||[]).slice().sort((a,b)=>(Number(b&&b.fecha)||0)-(Number(a&&a.fecha)||0));
}
