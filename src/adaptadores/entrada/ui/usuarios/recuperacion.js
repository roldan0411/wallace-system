// ============================================================
//  INTERFAZ · "Olvidé mi contraseña" (recuperación asistida)
//  1) Desde el login, la persona deja una solicitud (usuario + contacto).
//  2) El dueño o el ayudante del sistema la ve en el panel, verifica por teléfono
//     que es ella y genera una contraseña TEMPORAL (reemplaza la cuenta).
//  3) Al entrar con la temporal, la app la obliga a poner una nueva.
//  Plan B, sin servidor ni correos reales. Reglas: recuperaciones/ y perfiles/<uid>/debeCambiarPass.
//  Adaptador de entrada: módulo ES. Lo carga ui/manifiesto.js (cargarInterfaz).
//  Doc: Documentation/-03-architecture/recuperar-contrasena.md
// ============================================================
import { STATE, escapeHtml, now, refrescarSiSePuede } from '../nucleo/estado.js';
import { BOTON, MSJ } from '../nucleo/textos.js';
import { esAdminSistema } from '../nucleo/permisos.js';
import { abrirModal, cerrarModal, confirmarModal, reportarError, toast } from '../nucleo/componentes.js';
import { render } from '../nucleo/navegacion.js';
import { conCuentasFirebase, dejarDeEscucharMiPerfil, logout, mensajeCuenta } from './sesion.js';
import { reemplazarCuenta } from './cuentas.js';

// ---------- 1) La persona que olvidó la contraseña ----------
export function olvideMiPass(){
  if(!conCuentasFirebase()){ toast(MSJ.sinNubePideAlAdministrador,'info'); return; }
  const escrito=((document.getElementById('l-user')||{}).value||'').trim();
  abrirModal({titulo:'¿Olvidaste tu contraseña?', textoBoton:BOTON.enviarSolicitud, campos:[
    {id:'usuario', label:'Tu usuario (o tu correo, si entras con correo)', requerido:true, valor:escrito},
    {id:'contacto', label:'Teléfono o WhatsApp para contactarte (opcional)'}
  ], extraHTML:`<p class="nota">El administrador del sistema te va a llamar para comprobar que eres tú y darte una contraseña temporal. Al entrar con ella, eliges una nueva.</p>`,
  onGuardar:d=>{
    // Cuenta con correo real (super-admin): el enlace de Firebase, sin esperar a nadie
    if(Dominio.cuentas.correoRealValido(d.usuario)){
      Cuentas.restablecerPorCorreo(d.usuario.trim()).catch(()=>{}).then(()=>{
        cerrarModal();
        abrirModal({titulo:'Revisa tu correo', textoBoton:BOTON.entendido, campos:[],
          extraHTML:`<p class="fs-15 lh-1_6">${escapeHtml(MSJ.siEseCorreoEsDeUnaCuenta)}</p>`, onGuardar:()=>cerrarModal()});
      });
      return;
    }
    const sol=Dominio.cuentas.solicitudRecuperacion(d.usuario, d.contacto);
    if(!sol){ toast(MSJ.escribeTuUsuario,'error'); return; }
    // La respuesta es SIEMPRE la misma (exista o no el usuario, o si ya había una pendiente)
    Cuentas.pedirRecuperacion(sol).catch(()=>{}).then(()=>{
      cerrarModal();
      abrirModal({titulo:'Solicitud enviada', textoBoton:BOTON.entendido, campos:[],
        extraHTML:`<p class="fs-15 lh-1_6">${escapeHtml(MSJ.solicitudDeContrasenaEnviada)}</p>`, onGuardar:()=>cerrarModal()});
    });
  }});
}

// ---------- 2) El dueño o el ayudante: solicitudes en el panel ----------
export let _recuperaciones={};
export let _dejarRecuperaciones=null;
export function escucharRecuperaciones(){
  dejarRecuperaciones();
  if(!conCuentasFirebase() || !esAdminSistema()) return;
  _dejarRecuperaciones=Cuentas.escucharRecuperaciones(v=>{ _recuperaciones=v||{}; refrescarSiSePuede(); });
}
export function dejarRecuperaciones(){
  if(_dejarRecuperaciones){ try{ _dejarRecuperaciones(); }catch(e){ console.warn(e); } }
  _dejarRecuperaciones=null; _recuperaciones={};
}
// A quién corresponde una solicitud: un empleado (con su negocio) o un super-admin
export function cuentaDeSolicitud(clave){
  const c=Dominio.cuentas.claveUsuario;
  const u=(DB.get('usuarios')||[]).find(x=>x && c(x.usuario)===clave);
  if(u) return {rec:u, esSuper:false, negocio:(DB.get('negocios')||[]).find(n=>n.id===u.negocioId)||null};
  const s=(DB.get('superadmins')||[]).find(x=>x && c(x.usuario)===clave);
  if(s) return {rec:s, esSuper:true, negocio:null};
  return null;
}
const haceCuanto=ms=>{ const m=Math.max(0, Math.round((Date.now()-(ms||Date.now()))/60000));
  return m<60 ? 'hace '+m+' min' : m<1440 ? 'hace '+Math.round(m/60)+' h' : 'hace '+Math.round(m/1440)+' días'; };
export function tarjetaRecuperaciones(){
  if(!esAdminSistema()) return '';
  const lista=Dominio.cuentas.recuperacionesPendientes(_recuperaciones);
  if(!lista.length) return '';
  return `<div class="tarjeta alerta">
    <span class="t-tit">🔑 Solicitudes de contraseña (${lista.length})</span>
    <p class="gris">Antes de generar una temporal, <strong>llama a la persona o al dueño del negocio al número que tienes registrado</strong> (no al de la solicitud) y comprueba que es ella.</p>
    <div class="tabla-wrap"><table class="tabla tabla-cards">
      <thead><tr><th>Usuario</th><th>Quién</th><th>Contacto</th><th>Pedida</th><th>Acciones</th></tr></thead>
      <tbody>${lista.map(r=>{ const c=cuentaDeSolicitud(r.usuario);
        return `<tr>
        <td data-label="Usuario"><strong>${escapeHtml(decodeURIComponent(r.usuario))}</strong></td>
        <td data-label="Quién">${c?escapeHtml(c.rec.nombre||'')+'<br><span class="gris chico">'+escapeHtml(c.esSuper?'Super-admin':((c.negocio&&c.negocio.nombre)||'')+' · '+(c.rec.rol||''))+'</span>':'<span class="gris">No se encontró</span>'}</td>
        <td data-label="Contacto">${escapeHtml(r.contacto||'—')}</td>
        <td data-label="Pedida" class="gris chico">${escapeHtml(haceCuanto(r.fecha))}</td>
        <td class="acciones" data-label="Acciones">
          ${c && esMiCuenta(c) ? `<span class="gris chico">Es tu cuenta: usa 🔑 Mi contraseña o 📧 Mi correo</span>`
            : c ? `<button class="btn btn-sm btn-gold" data-click="generarTemporal('${escapeHtml(r.usuario)}')">Generar temporal</button>` : ''}
          <button class="btn btn-sm btn-ghost" data-click="descartarRecuperacion('${escapeHtml(r.usuario)}')">Descartar</button>
        </td></tr>`; }).join('')}</tbody>
    </table></div>
  </div>`;
}
export function generarTemporal(clave){
  if(!esAdminSistema()){ toast(MSJ.soloElDuenoOElAyudanteRestablecen,'error'); return; }
  const c=cuentaDeSolicitud(clave); if(!c){ toast(MSJ.noSeEncontroEsaCuenta,'error'); return; }
  // La propia cuenta NO: reemplazarla borra el perfil de la sesión abierta, la app cierra la sesión
  // y la temporal se pierde sin mostrarse (pasó el 2026-10-13). Para la suya: Mi contraseña o Mi correo.
  if(esMiCuenta(c)){ toast(MSJ.noRestablezcasTuPropiaCuenta,'error'); return; }
  const quien=STATE.user.nombre||'—';
  confirmarModal('¿Ya comprobaste por teléfono que quien pide es '+(c.rec.nombre||c.rec.usuario)+'? Se le crea una contraseña temporal y la anterior deja de servir.', ()=>{
    const temporal=Cripto.claveAleatoria(10);
    reemplazarCuenta(c.rec, temporal, c.esSuper)
      .then(cuenta=>{
        // La cuenta nueva ya existe: la temporal se muestra YA, antes de los pasos que pueden fallar
        mostrarTemporal(c.rec, temporal);
        return Cuentas.actualizarPerfil(cuenta.uid, {debeCambiarPass:true})
          .then(()=>Cuentas.cerrarRecuperacion(clave, 'resuelta'))
          .then(()=>{
            // Rastro en la auditoría del negocio (la del super-admin no existe)
            if(!c.esSuper) Datos.guardarEn(c.rec.negocioId, 'auditoria', [{id:uid(), usuario:quien, rol:'superadmin',
              accion:'Restableció la contraseña', detalle:(c.rec.nombre||'')+' ('+c.rec.usuario+') · por solicitud', fecha:now()}]);
          })
          .catch(e=>{ reportarError('cerrar la solicitud de contraseña', e); toast(MSJ.laTemporalSirvePeroFaltoUnPaso,'error'); });
      })
      .catch(e=>{ reportarError('restablecer la contraseña', e); toast('No se pudo: '+mensajeCuenta(e),'error'); });
  }, 'Sí, generar');
}
// ¿Es la cuenta de quien está en sesión?
export function esMiCuenta(c){
  const yo=STATE._superUser||STATE.user;
  return !!(c && c.esSuper && yo && (c.rec.id===yo.id || Dominio.cuentas.mismoUsuario(c.rec.usuario, yo.usuario)));
}
// La temporal se muestra UNA vez (no se guarda en ningún lado)
export function mostrarTemporal(rec, temporal){
  abrirModal({titulo:'Contraseña temporal', textoBoton:BOTON.listo, campos:[],
    extraHTML:`<p class="fs-15 lh-1_6">Usuario: <strong>${escapeHtml(rec.usuario)}</strong><br>Contraseña temporal: <strong id="pass-temporal" class="fs-19">${escapeHtml(temporal)}</strong></p>
      <p class="nota">Díctasela. Al entrar deberá elegir una nueva. No se vuelve a mostrar.</p>`,
    onGuardar:()=>{ cerrarModal(); render(); }});
}
export function descartarRecuperacion(clave){
  if(!esAdminSistema()){ toast(MSJ.soloElDuenoOElAyudanteRestablecen,'error'); return; }
  confirmarModal(MSJ.descartarEstaSolicitud, ()=>{
    Cuentas.cerrarRecuperacion(clave, 'descartada').catch(e=>reportarError('descartar la solicitud', e));
  }, 'Descartar');
}

// ---------- Super-admin: pasar la cuenta a su correo real (mientras no haya "Entrar con Google") ----------
// Entra escribiendo el correo y "olvidé mi contraseña" le manda el enlace de Firebase: así también
// se recupera el ÚNICO super-admin. El correo no queda en el índice público (solo la marca).
export function pasarAMiCorreo(){
  if(!conCuentasFirebase() || !esAdminSistema()){ toast(MSJ.soloElDuenoOElAyudanteRestablecen,'error'); return; }
  abrirModal({titulo:'📧 Entrar con mi correo', textoBoton:BOTON.usarMiCorreo, campos:[
    {id:'correo', label:'Tu correo real', requerido:true, placeholder:'nombre@correo.com'},
    {id:'actual', label:'Tu contraseña actual', tipo:'password', requerido:true},
    {id:'nueva', label:'Contraseña para entrar con el correo (puede ser la misma, mínimo 6)', tipo:'password', requerido:true},
    {id:'nueva2', label:'Repítela', tipo:'password', requerido:true}
  ], extraHTML:`<p class="nota">Desde ahora entrarás escribiendo <strong>tu correo</strong> en "Usuario" (tu usuario actual ya no sirve para entrar). Si olvidas la contraseña, "¿Olvidaste tu contraseña?" te manda un enlace a ese correo. Te llega un correo para verificarlo: revísalo.</p>`,
  onGuardar:d=>{
    const correo=(d.correo||'').trim();
    if(!Dominio.cuentas.correoRealValido(correo)){ toast(MSJ.escribeUnCorreoValido,'error'); return; }
    if((d.nueva||'').length<6){ toast(MSJ.laNuevaDebeTenerAlMenos6,'error'); return; }
    if(d.nueva!==d.nueva2){ toast(MSJ.lasContrasenasNuevasNoCoinciden,'error'); return; }
    const uidViejo=STATE.user && STATE.user.uid, usuario=STATE.user && STATE.user.usuario;
    if(!uidViejo){ toast(MSJ.noSeEncontroEsaCuenta,'error'); return; }
    Cuentas.confirmarMiPass(d.actual)
      .then(()=>Cuentas.leerPerfil(uidViejo))
      .then(perfil=>Cuentas.crearCuentaConCorreo(correo, d.nueva).then(c=>({perfil, c})))
      .then(({perfil, c})=>{
        const nuevo=Object.assign({}, perfil, {correoReal:correo, pasoACorreoEn:now(), creadoPor:uidViejo});
        dejarDeEscucharMiPerfil();   // el perfil viejo se borra: no es "te desactivaron"
        return Cuentas.pasarCuentaACorreo({uidViejo, uidNuevo:c.uid, perfil:nuevo, usuario:usuario||perfil.usuario});
      })
      .then(()=>{
        cerrarModal(); logout();
        abrirModal({titulo:'Listo', textoBoton:BOTON.entendido, campos:[],
          extraHTML:`<p class="fs-15 lh-1_6">Desde ahora entras con <strong>${escapeHtml(correo)}</strong>. Revisa ese correo para verificarlo.</p>`, onGuardar:()=>cerrarModal()});
      })
      .catch(e=>toast(e&&e.codigo==='credenciales'?MSJ.laContrasenaActualNoCoincide:mensajeCuenta(e),'error'));
  }});
}

// ---------- 3) Cambio obligatorio al entrar con una temporal ----------
export let _passDelLogin='';   // la que acaba de escribir en el login (para no pedirla otra vez); se borra al usarla
export function recordarPassDelLogin(p){ _passDelLogin=p||''; }
export function vistaCambioObligatorio(){
  return `<div class="login-fondo">
    <div class="login-caja">
      <div class="login-marca">Elige tu <span>contraseña</span></div>
      <p class="login-sub">Entraste con una contraseña temporal. Para seguir, elige una nueva (mínimo 6 caracteres).</p>
      ${_passDelLogin?'':`<div class="m-row"><label>Contraseña temporal</label><input id="cp-actual" type="password" class="campo"></div>`}
      <div class="m-row"><label>Contraseña nueva</label><input id="cp-nueva" type="password" class="campo"></div>
      <div class="m-row"><label>Repite la nueva</label><input id="cp-nueva2" type="password" class="campo" data-enter="guardarPassObligatoria()"></div>
      <button class="login-btn" data-click="guardarPassObligatoria()">Guardar y entrar</button>
      <button class="btn btn-ghost btn-sm mt-8" data-click="logout()">Salir</button>
    </div>
  </div>`;
}
export function guardarPassObligatoria(){
  const v=id=>(document.getElementById(id)||{}).value||'';
  const actual=_passDelLogin||v('cp-actual'), nueva=v('cp-nueva');
  if(nueva.length<6){ toast(MSJ.laNuevaDebeTenerAlMenos6,'error'); return; }
  if(nueva!==v('cp-nueva2')){ toast(MSJ.lasContrasenasNuevasNoCoinciden,'error'); return; }
  if(nueva===actual){ toast(MSJ.laNuevaDebeSerDistintaDeLaTemporal,'error'); return; }
  Cuentas.cambiarMiPass(actual, nueva)
    .then(()=>Cuentas.quitarDebeCambiarPass())
    .then(()=>{ _passDelLogin=''; STATE.debeCambiarPass=false; toast(MSJ.contrasenaActualizada,'success'); render(); })
    .catch(e=>toast(e&&e.codigo==='credenciales'?MSJ.laContrasenaTemporalNoCoincide:mensajeCuenta(e),'error'));
}
