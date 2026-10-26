// ============================================================
//  INTERFAZ · Inicio de sesión
//  Login con cuentas de Firebase (S1) o local, sesión guardada, configuración inicial del dueño.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/10-users-roles/10-users-roles.md
// ============================================================
import { STATE, escapeHtml, fijarEscribiendo, now, refrescarSiSePuede } from '../nucleo/estado.js';
import { BOTON, MSJ } from '../nucleo/textos.js';
import { abrirModal, cerrarModal, reportarError, toast } from '../nucleo/componentes.js';
import { WALLACE_LOGO } from '../nucleo/logo.js';
import { sonidoError } from '../nucleo/sonidos.js';
import { render } from '../nucleo/navegacion.js';
import { migrarContrasenasLegado } from './cuentas.js';
import { dejarRecuperaciones, escucharRecuperaciones, recordarPassDelLogin } from './recuperacion.js';
import { fijarFacturaReservada } from '../ventas/nueva-venta.js';
import { fijarResumenNeg } from '../reportes/resumen.js';
import { rastroSupervision } from '../super-admin/negocios.js';
import { anotarEnSistema } from '../super-admin/historial-sistema.js';


// ============================================================
//  CONTRASEÑAS (hash con sal, nunca en texto plano)
//  Antes cada usuario guardaba "pass" tal cual y la tabla viajaba a todos
//  los equipos. Ahora se guarda passHash = SHA-256 iterado de sal+contraseña.
//  Es síncrono y sin librerías para no depender de crypto.subtle (que exige
//  HTTPS) ni volver asíncrono el login.
// ============================================================
// Convierte a hash todas las contraseñas que sigan en texto plano.
// Corre una vez al arrancar, cuando ya se leyó la nube.
// Contraseña con hash: reglas en src/dominio/contrasenas.js; la sal la da el adaptador de cripto
export function ponerPass(rec, pass){ return Dominio.contrasenas.ponerPass(rec, pass, Cripto.nuevaSal()); }
export function migrarContrasenas(){
  ['superadmins','usuarios'].forEach(t=>{
    const arr=DB.get(t);
    if(!Array.isArray(arr)) return;
    let cambio=false;
    arr.forEach(x=>{ if(Dominio.contrasenas.necesitaMigrar(x)){ ponerPass(x, x.pass); cambio=true; } });
    if(cambio) DB.set(t, arr);
  });
}

// ============================================================
//  LOGIN
//  Con Firebase configurado (S1, Plan B): la contraseña la verifica Firebase
//  Authentication y el perfil (perfiles/<uid>) dice negocio, rol y permisos.
//  La primera vez de cada usuario su cuenta se migra sola (servicio de sesión,
//  src/aplicacion/servicios/sesion.js). Sin nube (modo local): se compara con
//  el hash guardado en el equipo, como antes.
// ============================================================
export let _sesion=null, _dejarPerfil=null, _entrando=false, _configInicial=false;
export function fijarConfigInicial(v){ _configInicial=v; }   // lo averigua nucleo/arranque.js
export const CLAVE_PERFIL='wallace_perfil_sesion';   // perfil de la sesión guardada (para abrir sin internet)
export function conCuentasFirebase(){ return !!(FB_READY && Datos.estado.cuentas); }
export function servicioSesion(){ return _sesion||(_sesion=ServicioSesion.crear()); }
export function mensajeCuenta(e){ return ServicioSesion.mensajeDeFallo((e&&(e.codigo||e.motivo))||'error'); }
// Corta una promesa que no responde (sin internet) y devuelve el valor por defecto
export function conTiempo(promesa, ms, porDefecto){
  return Promise.race([promesa, new Promise(r=>setTimeout(()=>r(porDefecto), ms))]);
}
export function guardarPerfilLocal(uid, perfil){ try{ localStorage.setItem(CLAVE_PERFIL, JSON.stringify({uid, perfil})); }catch(e){} }
export function leerPerfilLocal(){ try{ return JSON.parse(localStorage.getItem(CLAVE_PERFIL)||'null'); }catch(e){ return null; } }
export function borrarPerfilLocal(){ try{ localStorage.removeItem(CLAVE_PERFIL); }catch(e){} }

// Modo local (sin nube): usuarios y contraseñas con hash guardados en el equipo
export function login(usuario, pass){
  const sa=(DB.get('superadmins')||[]).find(s=>s.usuario===usuario && verificarPass(s,pass));
  if(sa){
    STATE.user={id:sa.id, nombre:sa.nombre, usuario:sa.usuario, rol:'superadmin', rolSuper:sa.rolSuper||'dueno'};
    STATE.esSuperAdmin=true; STATE.negocio=null; STATE.page='';
    return {ok:true, tipo:'super'};
  }
  const u=(DB.get('usuarios')||[]).find(x=>x.usuario===usuario && x.activo!==false && verificarPass(x,pass));
  if(!u) return {ok:false, msg:'Usuario o contraseña incorrectos'};
  const neg=(DB.get('negocios')||[]).find(n=>n.id===u.negocioId);
  if(!neg) return {ok:false, msg:'Este usuario no tiene negocio asignado'};
  if(!neg.activo) return {ok:false, msg:'Este negocio está suspendido. Contacta al proveedor.'};
  ponerSesionNegocio(u, neg);
  return {ok:true, tipo:'negocio'};
}
// Estado de un empleado que entra a su negocio (con o sin cuentas de Firebase)
export function ponerSesionNegocio(u, neg){
  STATE.user=u; STATE.esSuperAdmin=false; STATE.negocio=neg;
  STATE.pageNeg='';   // la primera pantalla que su rol tenga permitida (ver pantallaValida)
  // Sucursal: la última usada o la primera permitida
  if(neg.sucursales && neg.sucursales.length>1){
    let guardada=null;
    try{ guardada=localStorage.getItem('ws_suc_'+neg.id); }catch(e){}
    const permitidas=(u.sucursales && u.sucursales.length)
      ? neg.sucursales.filter(s=>u.sucursales.indexOf(s.id)>-1)
      : neg.sucursales;
    const valida=permitidas.find(s=>s.id===guardada);
    STATE.sucursal = valida ? valida.id : (permitidas[0]||neg.sucursales[0]).id;
  } else {
    STATE.sucursal='principal';
  }
}
export function hacerLogin(){
  const u=(document.getElementById('l-user')||{}).value||'';
  const p=(document.getElementById('l-pass')||{}).value||'';
  if(conCuentasFirebase()){ hacerLoginCuentas(u.trim(), p); return; }
  const r=login(u.trim(), p);
  if(!r.ok){ toast(r.msg,'error'); sonidoError(); return; }
  fijarFacturaReservada(null);
  // Arrancar la sincronización que corresponde
  if(r.tipo==='super'){
    detenerSincNegocio();
    sincronizarTodo();
  } else {
    detenerSincTodo();
    limpiarDatosAjenos(STATE.negocio.id);   // privacidad: fuera datos de otros negocios
    sincronizarNegocio(STATE.negocio.id);
  }
  render();
}
export async function hacerLoginCuentas(usuario, pass){
  if(_entrando) return;
  _entrando=true;
  const btn=document.querySelector('.login-btn');
  if(btn){ btn.disabled=true; btn.textContent='Entrando…'; }
  let r;
  try{ r=await servicioSesion().iniciarSesion(usuario, pass, {pedirPassNueva}); }
  catch(e){ r={ok:false, motivo:(e&&e.codigo)||'error'}; }
  _entrando=false;
  if(!r.ok){
    if(btn){ btn.disabled=false; btn.textContent='Entrar'; }
    toast(ServicioSesion.mensajeDeFallo(r.motivo),'error'); sonidoError();
    return;
  }
  if(r.passCambiada) toast(MSJ.contrasenaActualizadaDesdeHoyEntrasCon,'success');
  recordarPassDelLogin(pass);   // si entró con una temporal, no se la vuelve a pedir
  await entrarConPerfil(r.uid, r.perfil);
}
// Migración de una cuenta con contraseña de menos de 6 caracteres: se pide una nueva
export function pedirPassNueva(){
  return new Promise(resolver=>{
    let listo=false;
    abrirModal({titulo:'🔑 Elige una contraseña nueva', textoBoton:BOTON.guardarYEntrar, campos:[
      {id:'n1', label:'Nueva contraseña (mínimo 6 caracteres)', tipo:'password', requerido:true},
      {id:'n2', label:'Repite la nueva contraseña', tipo:'password', requerido:true}
    ], extraHTML:'<p class="nota">El inicio de sesión ahora es más seguro y exige contraseñas de al menos 6 caracteres. Desde hoy entras con la nueva.</p>',
    onGuardar:d=>{
      if((d.n1||'').length<6){ toast(MSJ.debeTenerAlMenos6Caracteres,'error'); return; }
      if(d.n1!==d.n2){ toast(MSJ.lasContrasenasNoCoinciden,'error'); return; }
      listo=true; resolver(d.n1); cerrarModal();
    },
    onCancelar:()=>{ if(!listo){ listo=true; resolver(null); } }});
  });
}
// Entra con el perfil de Firebase y arranca la sincronización que le corresponde
export async function entrarConPerfil(uid, perfil){
  guardarPerfilLocal(uid, perfil);
  STATE.debeCambiarPass=Dominio.cuentas.debeCambiarPass(perfil);   // entró con una contraseña temporal
  const u=Dominio.cuentas.usuarioDesdePerfil(perfil, uid);
  const enLinea=(typeof navigator==='undefined' || navigator.onLine!==false);
  fijarFacturaReservada(null);
  if(perfil.rol==='superadmin'){
    // El vendedor solo ve y toca SUS negocios (reglas): el panel le trae solo esos
    const vendedor=u.rolSuper==='vendedor';
    Datos.configurarSesion({cuentas:true, superAdmin:true, vendedor:vendedor?u.id:null});
    STATE.user=u; STATE.esSuperAdmin=true; STATE.negocio=null; STATE.page='';
    detenerSincNegocio();
    // Fase 2 del Plan B: negocios y usuarios al formato por registro (una sola vez)
    if(enLinea && !vendedor){
      const m=await conTiempo(Datos.migrarTablasGlobales(), 15000, null);
      if(m && m.hecho) toast('Migración: '+m.negocios+' negocio(s) y '+m.usuarios+' usuario(s) pasados al formato nuevo','info');
    }
    sincronizarTodo();
    escucharMiPerfil(uid);
    if(!vendedor){ migrarContrasenasLegado(); escucharRecuperaciones(); }
    render();
    return;
  }
  Datos.configurarSesion({cuentas:true, superAdmin:false, negId:perfil.negocioId});
  // Con las reglas de transición cualquier ingreso completa la migración; con las cerradas no hace nada
  if(enLinea) await conTiempo(Datos.migrarTablasGlobales(), 15000, null);
  let neg=enLinea ? await conTiempo(Datos.cargarNegocioPropio(perfil.negocioId).catch(()=>null), 10000, undefined) : undefined;
  if(neg===undefined){
    // Sin internet: el negocio que quedó guardado en este equipo
    neg=(DB.get('negocios')||[]).find(n=>n.id===perfil.negocioId)||null;
    if(!enLinea && neg) Datos.cargarNegocioPropio(perfil.negocioId).catch(()=>{});
  }
  if(!neg){ await Cuentas.salir(); borrarPerfilLocal(); toast(MSJ.noSeEncontroTuNegocioHabla,'error'); render(); return; }
  if(!neg.activo){ await Cuentas.salir(); borrarPerfilLocal(); toast(MSJ.esteNegocioEstaSuspendidoContactaAl,'error'); render(); return; }
  ponerSesionNegocio(u, neg);
  detenerSincTodo();
  limpiarDatosAjenos(neg.id);   // privacidad: fuera datos de otros negocios y tablas globales
  sincronizarNegocio(neg.id);
  escucharMiPerfil(uid);
  render();
}
export function dejarDeEscucharMiPerfil(){ if(_dejarPerfil){ _dejarPerfil(); _dejarPerfil=null; } }
// Cambios del propio perfil en vivo: desactivado o contraseña restablecida → fuera; permisos nuevos → se aplican
export function escucharMiPerfil(uid){
  if(_dejarPerfil) _dejarPerfil();
  _dejarPerfil=Cuentas.escucharPerfil(uid, p=>{
    if(!STATE.user) return;
    if(!p || p.activo===false){
      toast(MSJ.tuUsuarioFueDesactivadoOSu,'error');
      logout(); return;
    }
    guardarPerfilLocal(uid, p);
    const debe=Dominio.cuentas.debeCambiarPass(p);
    if(debe!==!!STATE.debeCambiarPass){ STATE.debeCambiarPass=debe; refrescarSiSePuede(true); }
    if(STATE.modoSupervision) return;
    const nuevo=Dominio.cuentas.usuarioDesdePerfil(p, uid);
    if(JSON.stringify(nuevo)!==JSON.stringify(STATE.user)){ STATE.user=nuevo; refrescarSiSePuede(); }
  });
}
// El negocio cambió en la nube (Mi Negocio en otro equipo, o el super-admin lo suspendió)
export function negocioCambiado(n){
  if(!STATE.user || STATE.esSuperAdmin || STATE.modoSupervision || !STATE.negocio || STATE.negocio.id!==n.id) return;
  STATE.negocio=JSON.parse(JSON.stringify(n));
  if(!n.activo){ toast(MSJ.esteNegocioFueSuspendidoContactaAl,'error'); logout(); }
}
export function logout(){
  if(STATE.modoSupervision && STATE.negocio){   // P15 y P2
    rastroSupervision(STATE.negocio.id, 'Salió de supervisar', STATE._superUser);
    anotarEnSistema(Dominio.sistema.ACCION.salirSupervision, STATE.negocio);
  }
  STATE.user=null; STATE.negocio=null; STATE.esSuperAdmin=false;
  STATE.debeCambiarPass=false; recordarPassDelLogin(''); dejarRecuperaciones();
  STATE.modoSupervision=false; STATE.sucursal=null;
  STATE.page=''; STATE.pageNeg='inicio';
  STATE.tabNegocios=''; STATE.buscaNegocio=''; STATE.filtroVendedor='';   // el siguiente entra al panel desde "Clientes", sin filtros
  fijarEscribiendo(false);
  fijarFacturaReservada(null);   // la reserva es del negocio que se deja
  fijarResumenNeg(null);
  detenerSincNegocio();
  detenerSincTodo();
  if(_dejarPerfil){ _dejarPerfil(); _dejarPerfil=null; }
  if(conCuentasFirebase()){ Datos.configurarSesion({cuentas:true}); borrarPerfilLocal(); Cuentas.salir(); }
  render();
}
// Fuera de producción se dice en qué base se está trabajando (firebase-config.js)
export function avisoEntorno(){
  const e=Datos.entorno;   // lo elige firebase-config.js (src/arranque.js se lo pasa al adaptador de datos)
  if(!e || e==='produccion') return '';
  const txt={pruebas:'🧪 Entorno de PRUEBAS', emulador:'🧪 Emuladores locales de Firebase',
    local:'💻 Modo local: los datos solo quedan en este navegador'}[e]||e;
  return `<p class="nota txt-centro m-n4-0-12">${escapeHtml(txt)}</p>`;
}
export function vistaLogin(){
  return `<div class="login-fondo">
    <div class="login-caja">
      <div class="login-emblema">${WALLACE_LOGO}</div>
      <div class="login-marca">Wallace<span>System</span></div>
      <p class="login-sub">Sistema administrativo para tu negocio</p>
      ${avisoEntorno()}
      <div class="m-row"><label>Usuario</label>
        <input id="l-user" class="campo" placeholder="usuario" data-enter="hacerLogin()"></div>
      <div class="m-row"><label>Contraseña</label>
        <input id="l-pass" type="password" class="campo" placeholder="••••••" data-enter="hacerLogin()"></div>
      <button class="login-btn" data-click="hacerLogin()">Entrar</button>
      <button class="login-olvide" data-click="olvideMiPass()">¿Olvidaste tu contraseña?</button>
      <div class="login-pie">WALLACE COMPANY SYSTEM</div>
    </div>
  </div>`;
}
// ---------- Configuración inicial: crear el primer dueño del sistema ----------
// Solo aparece cuando NO existe ningún super-admin y se sabe con certeza que
// la tabla está vacía (se leyó de la nube, o se trabaja sin nube).
export function necesitaConfigInicial(){
  if(conCuentasFirebase()) return _configInicial;   // lo averigua arrancarCuentas (Cuentas.necesitaDueno)
  const sas=DB.get('superadmins');
  if(Array.isArray(sas) && sas.length) return false;
  return !FB_READY || GLOBALES_LEIDAS;
}
export function vistaConfigInicial(){
  return `<div class="login-fondo">
    <div class="login-caja">
      <div class="login-emblema">${WALLACE_LOGO}</div>
      <div class="login-marca">Wallace<span>System</span></div>
      <p class="login-sub">Configuración inicial: crea la cuenta del dueño del sistema</p>
      ${avisoEntorno()}
      <div class="m-row"><label>Nombre completo</label><input id="ci-nombre" class="campo"></div>
      <div class="m-row"><label>Usuario</label><input id="ci-user" class="campo" autocomplete="off"></div>
      <div class="m-row"><label>Contraseña (mínimo 8 caracteres)</label><input id="ci-pass" type="password" class="campo" autocomplete="new-password"></div>
      <div class="m-row"><label>Repite la contraseña</label><input id="ci-pass2" type="password" class="campo" autocomplete="new-password" data-enter="crearDuenoInicial()"></div>
      <button class="login-btn" data-click="crearDuenoInicial()">Crear cuenta de dueño</button>
      <div class="login-pie">WALLACE COMPANY SYSTEM</div>
    </div>
  </div>`;
}
export function crearDuenoInicial(){
  const v=id=>((document.getElementById(id)||{}).value||'');
  const nombre=v('ci-nombre').trim(), usuario=v('ci-user').trim(), pass=v('ci-pass'), pass2=v('ci-pass2');
  if(!nombre||!usuario){ toast(MSJ.escribeNombreYUsuario,'error'); return; }
  if(!Dominio.cuentas.usuarioValido(usuario)){ toast(MSJ.usuarioInvalido,'error'); return; }   // V4
  if(pass.length<8){ toast(MSJ.laContrasenaDebeTenerAlMenos8,'error'); return; }
  if(pass!==pass2){ toast(MSJ.lasContrasenasNoCoinciden,'error'); return; }
  if(conCuentasFirebase()){ crearDuenoInicialCuentas(nombre, usuario, pass); return; }
  if((DB.get('usuarios')||[]).some(u=>u.usuario===usuario)){ toast(MSJ.eseUsuarioYaExisteEnUn,'error'); return; }
  const rec=ponerPass({id:uid(), nombre, usuario, rolSuper:'dueno', creado:now()}, pass);
  // Solo se crea si la tabla sigue vacía (otro equipo no se adelantó)
  Datos.transaccionGlobal('superadmins', cur=>{
    if(cur && Object.keys(cur).length) return;   // ya existe alguien: abortar
    return [JSON.parse(JSON.stringify(rec))];
  }).then(res=>{
    if(!res.committed){ toast(MSJ.yaExisteUnAdministradorDelSistema,'error'); }
    else { toast(MSJ.cuentaCreadaYaPuedesEntrar,'success'); }
    render();
  }).catch(e=>{ reportarError('crear la cuenta', e); toast(MSJ.noSePudoCrearLaCuenta,'error'); });
}
// Instalación nueva con cuentas: cuenta de Firebase + registro + perfil del dueño
export async function crearDuenoInicialCuentas(nombre, usuario, pass){
  try{
    const cuenta=await Cuentas.crearCuentaPropia(pass);
    const rec={id:uid(), nombre, usuario, rolSuper:'dueno', creado:now()};
    const res=await Datos.transaccionGlobal('superadmins', cur=>{
      if(cur && Object.keys(cur).length) return;   // ya existe alguien: abortar
      return [JSON.parse(JSON.stringify(rec))];
    });
    if(!res.committed){ await Cuentas.salir(); _configInicial=false; toast(MSJ.yaExisteUnAdministradorDelSistema,'error'); render(); return; }
    const perfil=Dominio.cuentas.perfilDesdeSuperAdmin(rec);
    perfil.migradoEn=now(); perfil.creadoPor=cuenta.uid;
    await Cuentas.guardarCuenta({uid:cuenta.uid, correo:cuenta.correo, usuario, perfil});
    _configInicial=false;
    toast(MSJ.cuentaDeDuenoCreada,'success');
    await entrarConPerfil(cuenta.uid, perfil);
  }catch(e){ reportarError('crear la cuenta del dueño', e); toast('No se pudo crear la cuenta: '+mensajeCuenta(e),'error'); }
}
