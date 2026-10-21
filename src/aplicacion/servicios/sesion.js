// ============================================================
//  SERVICIO DE APLICACIÓN · Inicio de sesión (S1, Plan B)
//  Orquesta el login con cuentas de Firebase y la migración automática de
//  las cuentas del esquema viejo (contraseña con hash en data/usuarios).
//  Solo habla con puertos: se prueba con dobles (tests/aplicacion/).
//
//  Flujo (Documentation/-02-corrections → B.5.1 y B.6):
//   1. login/<usuario> existe → Firebase verifica la contraseña → perfil.
//   2. No existe → (solo con reglas de transición) se verifica contra el
//      hash viejo, se crea la cuenta con la MISMA contraseña (o una nueva
//      de 6+ si era más corta), y se escriben perfil, índice y registro.
// ============================================================

/**
 * @param {Object} dep
 * @param {Object} dep.cuentas               PuertoCuentas
 * @param {Object} dep.dominio               {cuentas, contrasenas}
 * @param {(negId:string, id:string)=>Promise<Object|null>} dep.leerUsuarioNegocio  registro público del usuario
 * @param {Object} dep.pantallasPorRol
 * @param {(r:{tipo:'super'|'usuario', id:string})=>Promise<any>} [dep.retirarClaveVieja]  quita el hash viejo ya migrado
 * @param {()=>string} [dep.ahora]
 */
export function crearServicioSesion(dep){
  const C=dep.cuentas, dc=dep.dominio.cuentas, pw=dep.dominio.contrasenas;
  const ahora=dep.ahora||(()=>new Date().toISOString());
  const fallo=(motivo, detalle)=>({ok:false, motivo, detalle:detalle||''});
  const motivoDe=e=>(e&&e.codigo)||'error';

  // Busca al usuario en las tablas viejas y verifica su contraseña
  async function buscarEnLegado(usuario, pass){
    const legado=await C.leerLegado();          // null = reglas cerradas
    if(!legado) return {legado:null};
    const sa=legado.superadmins.find(s=>s&&s.usuario===usuario)||null;
    const u=sa?null:(legado.usuarios.find(x=>x&&x.usuario===usuario)||null);
    const rec=sa||u;
    return {legado, sa, u, rec, valido:!!(rec && pw.verificarPass(rec, pass))};
  }

  async function entrarConCuenta(entrada, usuario, pass){
    try{
      const c=await C.entrar(entrada.correo, pass);
      const perfil=await C.leerPerfil(c.uid);
      if(!perfil){ await C.salir(); return fallo('sin_perfil'); }
      if(perfil.activo===false){ await C.salir(); return fallo('inactivo'); }
      return {ok:true, uid:c.uid, perfil, migrado:false};
    }catch(e){
      if(motivoDe(e)!=='credenciales') return fallo(motivoDe(e));
      // ¿Alguien activó esta cuenta antes que su dueño? (riesgo de la transición, B.6)
      try{
        const l=await buscarEnLegado(usuario, pass);
        if(l.valido) return fallo('ya_activada');
      }catch(x){}
      return fallo('credenciales');
    }
  }

  async function migrar(usuario, pass, opciones){
    const l=await buscarEnLegado(usuario, pass);
    if(!l.legado || !l.valido) return fallo('credenciales');
    const {sa, u}=l;
    let base=sa;
    if(u){
      if(u.activo===false) return fallo('inactivo');
      // El registro del negocio (si ya se copió) manda: el super-admin pudo cambiar rol o permisos
      let publico=null;
      try{ publico=await dep.leerUsuarioNegocio(u.negocioId, u.id); }catch(e){}
      base=Object.assign(dc.sinContrasenas(u), publico?dc.sinContrasenas(publico):{});
      if(base.activo===false) return fallo('inactivo');
    }
    let passFinal=pass;
    if(!dc.passValidaCuenta(pass)){
      const nueva=opciones && opciones.pedirPassNueva ? await opciones.pedirPassNueva() : null;
      if(!nueva) return fallo('cancelado');
      if(!dc.passValidaCuenta(nueva)) return fallo('pass_debil');
      passFinal=nueva;
    }
    const cuenta=await C.crearCuentaPropia(passFinal);
    const perfil=sa ? dc.perfilDesdeSuperAdmin(sa) : dc.perfilDesdeUsuario(base, dep.pantallasPorRol);
    perfil.migradoEn=ahora(); perfil.creadoPor=cuenta.uid;
    const extra={};
    if(u) extra['data/data_'+u.negocioId+'_usuarios_r/'+u.id]=Object.assign(dc.sinContrasenas(base), {uid:cuenta.uid});
    try{
      await C.guardarCuenta({uid:cuenta.uid, correo:cuenta.correo, usuario, perfil, extra});
    }catch(e){
      await C.salir();      // la cuenta queda sin perfil: no puede hacer nada (B.5.3)
      return fallo(motivoDe(e), 'No se pudo guardar el perfil');
    }
    // La contraseña vieja ya no debe servir para nada (ni para el aviso de "ya activada")
    if(dep.retirarClaveVieja){
      try{ await dep.retirarClaveVieja({tipo:sa?'super':'usuario', id:(sa||u).id}); }catch(e){}
    }
    return {ok:true, uid:cuenta.uid, perfil, migrado:true, passCambiada:passFinal!==pass};
  }

  /**
   * @param {string} usuario
   * @param {string} pass
   * @param {{pedirPassNueva?:()=>Promise<string|null>}} [opciones]
   */
  async function iniciarSesion(usuario, pass, opciones){
    usuario=String(usuario||'').trim();
    if(!usuario || !pass) return fallo('credenciales');
    try{
      // Super-admin con correo real: escribe el correo y entra directo (no está en el índice)
      if(dc.correoRealValido(usuario)) return await entrarConCuenta({correo:usuario.trim()}, usuario, pass);
      const entrada=await C.buscarLogin(usuario);
      if(dc.entraConCorreo(entrada)) return fallo('usa_correo');
      if(entrada) return await entrarConCuenta(entrada, usuario, pass);
      return await migrar(usuario, pass, opciones);
    }catch(e){ return fallo(motivoDe(e)); }
  }

  // Sesión guardada en el equipo (recarga): solo hace falta el perfil
  async function restaurar(uid){
    try{
      const perfil=await C.leerPerfil(uid);
      if(!perfil){ await C.salir(); return fallo('sin_perfil'); }
      if(perfil.activo===false){ await C.salir(); return fallo('inactivo'); }
      return {ok:true, uid, perfil, migrado:false};
    }catch(e){ return fallo(motivoDe(e)); }
  }

  return {iniciarSesion, restaurar};
}

// Mensaje para la persona según el motivo del fallo
export function mensajeDeFallo(motivo){
  return ({
    credenciales:'Usuario o contraseña incorrectos',
    usa_correo:'Esta cuenta entra con su correo electrónico: escríbelo en "Usuario".',
    correo_en_uso:'Ese correo ya tiene una cuenta en el sistema.',
    inactivo:'Usuario desactivado. Habla con el administrador.',
    sin_perfil:'Tu cuenta no tiene permisos asignados. Habla con el administrador del sistema.',
    ya_activada:'Esta cuenta ya fue activada. Si no fuiste tú, avisa al administrador del sistema.',
    red:'Sin conexión con la nube. El primer ingreso en este equipo necesita internet.',
    demasiados:'Demasiados intentos. Espera unos minutos e intenta de nuevo.',
    cancelado:'Ingreso cancelado: hace falta una contraseña nueva de 6 o más caracteres.',
    pass_debil:'La contraseña nueva debe tener al menos 6 caracteres.',
    permiso:'La base de datos negó el acceso. Habla con el administrador del sistema.',
    auth_desactivado:'El inicio de sesión no está activado en Firebase: en la consola, Authentication → Método de acceso → activar "Correo electrónico/contraseña".'
  })[motivo] || 'No se pudo iniciar sesión. Intenta de nuevo.';
}
