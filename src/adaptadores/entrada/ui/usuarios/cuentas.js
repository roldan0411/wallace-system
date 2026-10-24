// ============================================================
//  INTERFAZ · Cuentas de acceso (S1)
//  Crear, reemplazar y borrar cuentas de Firebase; perfiles; "Mi contraseña".
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/-02-corrections/-02-corrections.md
// ============================================================
import { STATE, now } from '../nucleo/estado.js';
import { BOTON, MSJ } from '../nucleo/textos.js';
import { esAdminSistema } from '../nucleo/permisos.js';
import { abrirModal, cerrarModal, reportarError, toast } from '../nucleo/componentes.js';
import { conCuentasFirebase, mensajeCuenta, ponerPass } from './sesion.js';
import { logAudit } from './auditoria.js';


// ============================================================
//  CUENTAS DE ACCESO (S1, Plan B) — las administra el super-admin
//  Desde el navegador no se puede tocar la cuenta de otra persona, así que:
//   · crear = cuenta nueva en una instancia secundaria (no cierra mi sesión)
//   · contraseña nueva de otro = cuenta NUEVA que reemplaza a la vieja (B.5.4)
//   · desactivar/cambiar permisos = editar su perfil
// ============================================================
export function miUid(){ const u=STATE._superUser||STATE.user; return (u&&u.uid)||null; }
export function perfilPara(rec, esSuper){
  return esSuper ? Dominio.cuentas.perfilDesdeSuperAdmin(rec) : Dominio.cuentas.perfilDesdeUsuario(rec, PANTALLAS_POR_ROL);
}
// Crea la cuenta de Firebase de un usuario o administrador nuevo, con su perfil e índice.
// extraPerfil: campos que el perfil lleva desde que nace (p. ej. {debeCambiarPass:true}).
export async function crearCuentaPara(rec, pass, esSuper, extraPerfil){
  const cuenta=await Cuentas.crearCuentaAjena(pass);
  const perfil=Object.assign(perfilPara(rec, esSuper), extraPerfil||{});
  perfil.migradoEn=now(); perfil.creadoPor=miUid();
  await Cuentas.guardarCuenta({uid:cuenta.uid, correo:cuenta.correo, usuario:rec.usuario, perfil});
  return cuenta;
}
// Contraseña nueva para otra persona (o primera cuenta de un pendiente): reemplaza la cuenta
export async function reemplazarCuenta(rec, pass, esSuper, usuarioAntes){
  const antes=usuarioAntes||rec.usuario;
  const ent=await Cuentas.buscarLogin(antes);
  let viejo=null;
  if(ent){ try{ viejo=await Cuentas.leerPerfil(ent.uid); }catch(e){} }
  const cuenta=await Cuentas.crearCuentaAjena(pass);
  const perfil=perfilPara(rec, esSuper);
  perfil.migradoEn=(viejo&&viejo.migradoEn)||now(); perfil.reemplazadaEn=now(); perfil.creadoPor=miUid();
  const extra={};
  if(ent && ent.uid!==cuenta.uid) extra['perfiles/'+ent.uid]=null;      // la cuenta vieja queda sin acceso
  if(antes!==rec.usuario) extra['login/'+Dominio.cuentas.claveUsuario(antes)]=null;
  await Cuentas.guardarCuenta({uid:cuenta.uid, correo:cuenta.correo, usuario:rec.usuario, perfil, extra});
  if(!esSuper){ ponerUidUsuario(rec.id, cuenta.uid); await quitarUsuarioLegado(rec.id); }
  return cuenta;
}
// Lleva al perfil los cambios del registro (rol, permisos, activo, nombre de usuario)
export async function sincronizarPerfil(rec, esSuper, usuarioAntes){
  const antes=usuarioAntes||rec.usuario;
  const ent=await Cuentas.buscarLogin(antes);
  if(!ent){ if(!esSuper) await actualizarUsuarioLegado(rec); return false; }   // aún sin migrar
  await Cuentas.actualizarPerfil(ent.uid, perfilPara(rec, esSuper),
    antes!==rec.usuario ? {antes, despues:rec.usuario, correo:ent.correo} : null);
  return true;
}
export function trasGuardarCuenta(rec, esSuper, usuarioAntes, nuevaPass){
  const tarea=nuevaPass ? reemplazarCuenta(rec, nuevaPass, esSuper, usuarioAntes) : sincronizarPerfil(rec, esSuper, usuarioAntes);
  return tarea.then(()=>{ if(nuevaPass) toast('Contraseña restablecida. La sesión anterior de '+rec.usuario+' queda cerrada.','success'); })
    .catch(e=>{ reportarError('actualizar la cuenta de acceso', e); toast('Se guardó, pero la cuenta de acceso no se actualizó: '+mensajeCuenta(e),'error'); });
}
export async function borrarCuentaDe(usuario){
  const ent=await Cuentas.buscarLogin(usuario);
  if(ent) await Cuentas.borrarCuenta({uid:ent.uid, usuario});
}
export function ponerUidUsuario(id, uidCuenta){
  const us=DB.get('usuarios')||[];
  const x=us.find(y=>y.id===id);
  if(x && x.uid!==uidCuenta){ x.uid=uidCuenta; DB.set('usuarios', us); }
}
// data/usuarios del esquema viejo (con hash): solo sirve para migrar cuentas pendientes
export function quitarUsuarioLegado(id){
  return Datos.modificarUsuariosLegado(l=>{ const f=l.filter(x=>x.id!==id); return f.length===l.length?undefined:f; }).catch(()=>{});
}
export function actualizarUsuarioLegado(rec){
  return Datos.modificarUsuariosLegado(l=>{
    const x=l.find(y=>y.id===rec.id); if(!x) return;
    ['nombre','usuario','rol','activo','pantallas','permisos','sucursales'].forEach(k=>{ if(rec[k]!==undefined) x[k]=rec[k]; });
    return l;
  }).catch(()=>{});
}
// Vendedor con cuentas: las reglas le dejan usar las tablas de un negocio SUYO solo si
// es su "negocio activo" (perfiles/<uid>/negocioActivo). Se fija antes de escribirlas;
// las escrituras van en orden por la misma conexión. Dueño y ayudante: no hace nada.
export function trabajarEn(negId){
  const u=STATE._superUser||STATE.user;
  if(!conCuentasFirebase() || !u || u.rolSuper!=='vendedor') return Promise.resolve();
  return Cuentas.fijarNegocioActivo(negId);
}
export async function borrarCuentasDeNegocio(negId){
  const us=(DB.get('usuarios')||[]).filter(u=>u.negocioId===negId);
  for(const u of us){ try{ await borrarCuentaDe(u.usuario); }catch(e){ console.warn('Borrar cuenta',u.usuario,e&&e.message); } }
  // La tabla vieja de usuarios (con contraseñas) es solo del dueño y el ayudante: el vendedor no la toca
  const yo=STATE._superUser||STATE.user;
  if(yo && yo.rolSuper==='vendedor') return;
  await Datos.modificarUsuariosLegado(l=>{ const f=l.filter(x=>x.negocioId!==negId); return f.length===l.length?undefined:f; }).catch(()=>{});
}
// Las contraseñas que sigan en texto plano en las tablas viejas (cuentas aún sin
// migrar) se pasan a hash. Lo hace el super-admin al entrar.
export function migrarContrasenasLegado(){
  if(!esAdminSistema()) return;
  const hashear=l=>{ let c=false; l.forEach(x=>{ if(Dominio.contrasenas.necesitaMigrar(x)){ ponerPass(x, x.pass); c=true; } }); return c?l:undefined; };
  Datos.modificarUsuariosLegado(hashear).catch(e=>console.warn('Hash de usuarios viejos:',e&&e.message));
  Datos.transaccionGlobal('superadmins', cur=>{
    if(cur===null) return null;   // Firebase reintenta con el valor real del servidor
    return hashear(Array.isArray(cur)?cur:Object.values(cur));
  }).catch(e=>console.warn('Hash de super-admins:',e&&e.message));
}
// "Mi contraseña" con cuentas: Firebase pide la actual (B.5.5)
export function cambiarMiPassCuenta(){
  abrirModal({titulo:'🔑 Cambiar mi contraseña', textoBoton:BOTON.guardar, campos:[
    {id:'actual', label:'Contraseña actual', tipo:'password', requerido:true},
    {id:'nueva', label:'Nueva contraseña (mínimo 6 caracteres)', tipo:'password', requerido:true},
    {id:'nueva2', label:'Repite la nueva contraseña', tipo:'password', requerido:true}
  ], onGuardar:(d)=>{
    if((d.nueva||'').length<6){ toast(MSJ.laNuevaDebeTenerAlMenos6,'error'); return; }
    if(d.nueva!==d.nueva2){ toast(MSJ.lasContrasenasNuevasNoCoinciden,'error'); return; }
    Cuentas.cambiarMiPass(d.actual, d.nueva).then(()=>{
      if(STATE.negocio && !STATE.esSuperAdmin) logAudit('Cambió su contraseña', STATE.user.nombre);
      cerrarModal(); toast(MSJ.contrasenaActualizada,'success');
    }).catch(e=>toast(e&&e.codigo==='credenciales'?'La contraseña actual no coincide':mensajeCuenta(e),'error'));
  }});
}
