// ============================================================
//  DOMINIO · Cuentas (S1, Plan B)
//  Reglas puras del modelo de cuentas con Firebase Authentication:
//   · login/<claveUsuario> = {correo, uid}   índice usuario → cuenta
//   · perfiles/<uid>       = negocio, rol y permisos que leen las reglas
//  No conoce Firebase: lo usan el adaptador de cuentas y el servicio de sesión.
//  Detalle del diseño: Documentation/-02-corrections (S1 → Plan B).
// ============================================================

export const DOMINIO_CORREO='usuarios.wallace-system.app';
// Mínimo que exige Firebase Authentication
export const PASS_MIN_CUENTA=6;
// Campos de contraseña del esquema viejo: nunca salen de data/usuarios ni data/superadmins
export const CAMPOS_PASS=['pass','passHash','passSal','passIter'];
// Campos del negocio que solo cambia el super-admin (las reglas los bloquean al admin del negocio)
export const CAMPOS_NEGOCIO_RESERVADOS=['id','activo','plan','precioMes','diaPago','funciones','vendedorId',
  'vendedorNombre','notasComerciales','esDemo','demoDe','creado','sucursales',
  'pruebaDesde','pruebaHasta'];   // periodo de prueba (dominio/prueba.js)

// Firebase no admite . $ # [ ] / en las claves. Se codifica conservando mayúsculas.
export function claveUsuario(usuario){
  const u=String(usuario==null?'':usuario).trim();
  if(!u) return '';
  return encodeURIComponent(u).replace(/\./g,'%2E');
}
// Correo inventado que identifica la cuenta en Auth. Aleatorio: no depende del
// nombre de usuario (tildes, espacios) y permite reemplazar la cuenta.
export function correoInterno(aleatorio){
  const a=String(aleatorio||'').toLowerCase().replace(/[^a-z0-9]/g,'');
  if(a.length<8) throw new Error('correoInterno: aleatorio demasiado corto');
  return 'u'+a+'@'+DOMINIO_CORREO;
}
export function passValidaCuenta(pass){ return typeof pass==='string' && pass.length>=PASS_MIN_CUENTA; }

// Copia de un usuario sin campos de contraseña (lo que puede ver su negocio)
export function sinContrasenas(rec){
  if(!rec) return rec;
  const c=JSON.parse(JSON.stringify(rec));
  CAMPOS_PASS.forEach(k=>{ delete c[k]; });
  return c;
}

// Pantallas efectivas del usuario: las suyas o las de su rol
export function pantallasDe(u, pantallasPorRol){
  if(u && Array.isArray(u.pantallas) && u.pantallas.length) return u.pantallas.slice();
  const pr=pantallasPorRol||{};
  return (pr[u&&u.rol]||pr.cajero||[]).slice();
}
// ¿Puede editar "Mi Negocio"? Igual que el menú: admin, o quien tenga la pantalla config.
export function editaNegocio(u, pantallasPorRol){
  if(!u) return false;
  if(u.rol==='admin') return true;
  return pantallasDe(u, pantallasPorRol).indexOf('config')>-1;
}

// Perfil de un empleado de negocio (lo que leen las reglas y la app al entrar)
export function perfilDesdeUsuario(u, pantallasPorRol){
  return {
    usuario:u.usuario, nombre:u.nombre||'', rol:u.rol||'cajero', rolSuper:null,
    negocioId:u.negocioId, usuarioId:u.id, superId:null,
    activo:u.activo!==false,
    pantallas:Array.isArray(u.pantallas)?u.pantallas.slice():[],
    permisos:Array.isArray(u.permisos)?u.permisos.slice():[],
    sucursales:Array.isArray(u.sucursales)?u.sucursales.slice():[],
    editaNegocio:editaNegocio(u, pantallasPorRol)
  };
}
// Perfil de un administrador del sistema
export function perfilDesdeSuperAdmin(s){
  return {
    usuario:s.usuario, nombre:s.nombre||'', rol:'superadmin', rolSuper:s.rolSuper||'dueno',
    negocioId:null, usuarioId:null, superId:s.id,
    activo:s.activo!==false, pantallas:[], permisos:[], sucursales:[], editaNegocio:false
  };
}
// STATE.user a partir del perfil (misma forma que usaba la app con la tabla de usuarios)
export function usuarioDesdePerfil(p, uid){
  if(!p) return null;
  if(p.rol==='superadmin') return {id:p.superId, nombre:p.nombre, usuario:p.usuario, rol:'superadmin', rolSuper:p.rolSuper||'dueno', uid};
  return {id:p.usuarioId, nombre:p.nombre, usuario:p.usuario, rol:p.rol, negocioId:p.negocioId,
    pantallas:p.pantallas||[], permisos:p.permisos||[], sucursales:p.sucursales||[], activo:p.activo!==false, uid};
}

// ¿El perfil corresponde de verdad a este registro? (detecta perfiles creados por terceros)
export function perfilCoincide(perfil, rec, esSuper){
  if(!perfil || !rec) return false;
  if(perfil.usuario!==rec.usuario) return false;
  if(esSuper) return perfil.rol==='superadmin' && perfil.superId===rec.id;
  return perfil.rol!=='superadmin' && perfil.rol===rec.rol && perfil.negocioId===rec.negocioId && perfil.usuarioId===rec.id;
}

/**
 * Estado de la migración de cada cuenta real (pantalla "Migración de cuentas").
 * @param {{superadmins:Array, usuarios:Array, perfiles:Object, login:Object}} d
 * @returns {Array<{tipo:'super'|'usuario', id:string, usuario:string, nombre:string, negocioId:?string,
 *   rol:string, estado:'migrado'|'pendiente'|'revisar', motivo:string, uid:?string, migradoEn:?string}>}
 */
export function estadoMigracion(d){
  const perfiles=d.perfiles||{}, login=d.login||{};
  const filas=[], uidsLegitimos={};
  const revisar=(rec, esSuper)=>{
    const entrada=login[claveUsuario(rec.usuario)];
    const base={tipo:esSuper?'super':'usuario', id:rec.id, usuario:rec.usuario, nombre:rec.nombre||'',
      negocioId:esSuper?null:rec.negocioId, rol:esSuper?(rec.rolSuper||'dueno'):rec.rol, uid:null, migradoEn:null};
    if(!entrada || !entrada.uid) return Object.assign(base, {estado:'pendiente', motivo:''});
    base.uid=entrada.uid;
    const p=perfiles[entrada.uid];
    if(!p) return Object.assign(base, {estado:'revisar', motivo:'El índice apunta a una cuenta sin perfil'});
    if(rec.uid && rec.uid!==entrada.uid) return Object.assign(base, {estado:'revisar', motivo:'La cuenta del índice no es la registrada para este usuario'});
    if(!perfilCoincide(p, rec, esSuper)) return Object.assign(base, {estado:'revisar', motivo:'El perfil no coincide con el usuario (rol o negocio)'});
    uidsLegitimos[entrada.uid]=true;
    return Object.assign(base, {estado:'migrado', motivo:'', migradoEn:p.migradoEn||null});
  };
  (d.superadmins||[]).forEach(s=>{ if(s&&s.usuario) filas.push(revisar(s, true)); });
  (d.usuarios||[]).forEach(u=>{ if(u&&u.usuario) filas.push(revisar(u, false)); });
  // Perfiles que no pertenecen a ninguna cuenta real: posibles intrusos o restos de reemplazos
  Object.keys(perfiles).forEach(uid=>{
    if(uidsLegitimos[uid]) return;
    if(filas.some(f=>f.uid===uid)) return;   // ya listado como "revisar"
    const p=perfiles[uid]||{};
    filas.push({tipo:p.rol==='superadmin'?'super':'usuario', id:null, usuario:p.usuario||'?', nombre:p.nombre||'',
      negocioId:p.negocioId||null, rol:p.rolSuper||p.rol||'?', uid, migradoEn:p.migradoEn||null,
      estado:'revisar', motivo:'Perfil sin usuario real (posible cuenta ajena)'});
  });
  return filas;
}
export function resumenMigracion(filas){
  const r={total:0, migradas:0, pendientes:0, revisar:0};
  (filas||[]).forEach(f=>{
    if(f.id) r.total++;
    if(f.estado==='migrado') r.migradas++;
    else if(f.estado==='pendiente') r.pendientes++;
    else r.revisar++;
  });
  return r;
}

// Diferencias de un registro (por campo) para escribir solo lo que cambió.
// Devuelve {campo: valorNuevo|null}. Comparación por JSON, igual que el adaptador de datos.
export function camposCambiados(antes, despues){
  const out={};
  const a=antes||{}, b=despues||{};
  Object.keys(b).forEach(k=>{ if(JSON.stringify(b[k])!==JSON.stringify(a[k])) out[k]=b[k]===undefined?null:b[k]; });
  Object.keys(a).forEach(k=>{ if(!(k in b)) out[k]=null; });
  return out;
}

// ---------- "Olvidé mi contraseña": recuperación asistida (Plan B, sin servidor) ----------
// La persona deja una solicitud desde el login (sin sesión); el dueño o el ayudante del
// sistema verifica por teléfono que es ella y le genera una contraseña temporal; al entrar,
// la app la obliga a poner una nueva (perfil.debeCambiarPass). Las reglas validan lo mismo
// (recuperaciones/<claveUsuario>). Documentation/-03-architecture/recuperar-contrasena.md
export const RECUPERACION_ESPERA_MS=60*60*1000;   // una solicitud por usuario cada hora
export const CONTACTO_MAX=40;
// Lo que guarda el login (la hora la pone el servidor). null si no escribió usuario.
export function solicitudRecuperacion(usuario, contacto){
  const clave=claveUsuario(usuario);
  if(!clave) return null;
  return {usuario:clave, contacto:String(contacto||'').trim().slice(0,CONTACTO_MAX), estado:'pendiente'};
}
// Pendientes, la más vieja primero
export function recuperacionesPendientes(todas){
  return Object.values(todas||{}).filter(r=>r && r.estado==='pendiente').sort((a,b)=>(a.fecha||0)-(b.fecha||0));
}
// ¿Tiene que cambiar la contraseña antes de usar la app? (entró con una temporal)
export function debeCambiarPass(perfil){ return !!(perfil && perfil.debeCambiarPass===true); }

// ---------- Super-admin con correo real (recuperación por correo de Firebase) ----------
// Mientras no se active "Entrar con Google", el dueño o el ayudante pueden pasar su cuenta
// a su correo de verdad: entran ESCRIBIENDO el correo y "olvidé mi contraseña" les manda el
// enlace de Firebase. Su usuario queda en login/ con esta marca, que no revela el correo.
// Documentation/-03-architecture/recuperar-contrasena.md (sección 9)
export const MARCA_SOLO_CORREO='@correo';
export function esCorreo(s){ return typeof s==='string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim()); }
export function esCorreoInterno(s){ return typeof s==='string' && s.trim().toLowerCase().endsWith('@'+DOMINIO_CORREO); }
// Un correo real que sirve para recibir el enlace (no el interno inventado)
export function correoRealValido(s){ return esCorreo(s) && !esCorreoInterno(s); }
// ¿Esta entrada del índice dice "entra con su correo"?
export function entraConCorreo(entrada){ return !!(entrada && entrada.correo===MARCA_SOLO_CORREO); }

// ---------- Nombres de usuario (4.ª revisión, V4) ----------
// Sin "@": el login toma un texto con "@" como correo (super-admin con correo real) y ese
// usuario nunca podría entrar. De 3 a 40 caracteres, sin espacios en los extremos.
export const USUARIO_MIN=3, USUARIO_MAX=40;
export function usuarioValido(u){
  const s=String(u==null?'':u).trim();
  return s.length>=USUARIO_MIN && s.length<=USUARIO_MAX && s.indexOf('@')<0 && !/[\u0000-\u001f]/.test(s);
}
// "Ana" y "ana" son el mismo usuario para no confundir a nadie (el índice sí distingue)
export function mismoUsuario(a, b){ return String(a||'').trim().toLowerCase()===String(b||'').trim().toLowerCase(); }