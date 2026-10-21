// ============================================================
//  INTERFAZ · Usuarios (dentro del negocio)
//  Lista de empleados para el jefe y cambio de contraseña.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/10-users-roles/10-users-roles.md
// ============================================================
import { STATE, escapeHtml, fijarEscribiendo } from '../nucleo/estado.js';
import { BOTON, MSJ } from '../nucleo/textos.js';
import { abrirModal, cerrarModal, ic, toast } from '../nucleo/componentes.js';
import { render } from '../nucleo/navegacion.js';
import { conCuentasFirebase, ponerPass } from './sesion.js';
import { cambiarMiPassCuenta } from './cuentas.js';
import { logAudit } from './auditoria.js';


// ============================================================
//  USUARIOS DEL NEGOCIO (los administra el propio jefe, sin super-admin)
// ============================================================
export function puedeGestionarUsuarios(){
  const u=STATE.user;
  if(!u) return false;
  if(u.esSupervisor || u.rol==='admin') return true;
  const permitidas=(u.pantallas&&u.pantallas.length)?u.pantallas:(PANTALLAS_POR_ROL[u.rol]||[]);
  return permitidas.indexOf('usuarios')>-1;
}
export function usuariosNeg(){
  fijarEscribiendo(false);
  if(!puedeGestionarUsuarios()){
    return `<div class="tarjeta centro-msg"><div class="msg-ico">🔒</div>
      <div class="t-tit centrado">Acceso restringido</div>
      <p class="gris">No tienes permiso para ver los usuarios de este negocio.</p></div>`;
  }
  const negId=STATE.negocio.id;
  const us=(DB.get('usuarios')||[]).filter(u=>u.negocioId===negId);
  return `
    <div class="tarjeta">
      <span class="t-tit">${ic('users')} Usuarios de ${escapeHtml(STATE.negocio.nombre)}</span>
      <p class="gris">${conCuentasFirebase()
        ? 'Desde aquí cada persona cambia <strong>su propia contraseña</strong>. Para crear usuarios, cambiar roles, permisos o la contraseña de otra persona, comunícate con tu proveedor del sistema.'
        : 'Desde aquí solo se pueden <strong>cambiar contraseñas</strong>. Para crear usuarios, cambiar roles o permisos, comunícate con tu proveedor del sistema.'}</p>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Estado</th><th>Acciones</th></tr></thead>
        <tbody>${us.length?us.map(u=>`<tr>
          <td><strong>${escapeHtml(u.nombre)}</strong>${u.id===STATE.user.id?' <span class="pill pill-azul chico">tú</span>':''}</td>
          <td>${escapeHtml(u.usuario)}</td>
          <td>${escapeHtml((ROLES.find(r=>r[0]===u.rol)||['',u.rol])[1])}</td>
          <td>${u.activo!==false?'<span class="pill pill-verde">Activo</span>':'<span class="pill pill-rojo">Inactivo</span>'}</td>
          <td class="acciones">${!conCuentasFirebase()
            ? `<button class="btn btn-sm btn-gold" data-click="cambiarPassNeg('${escapeHtml(u.id)}')" title="Cambiar contraseña">🔑 Cambiar contraseña</button>`
            : (u.id===STATE.user.id ? `<button class="btn btn-sm btn-gold" data-click="cambiarMiPassCuenta()">🔑 Cambiar mi contraseña</button>` : '<span class="gris chico">Pídelo al proveedor</span>')}</td>
        </tr>`).join(''):'<tr><td colspan="5" class="gris">Sin usuarios.</td></tr>'}</tbody>
      </table></div>
      <p class="nota mt-12">Cambia la contraseña cuando alguien la comparta de más o cuando salga un empleado. Cada cambio queda registrado en la auditoría con tu nombre.</p>
    </div>`;
}
// Único cambio permitido desde el negocio: la contraseña
export function cambiarPassNeg(id){
  if(!puedeGestionarUsuarios()){ toast(MSJ.noTienesPermiso,'error'); return; }
  // Con cuentas de Firebase el navegador solo puede cambiar la contraseña propia (Plan B, B.12)
  if(conCuentasFirebase()){
    if(id===STATE.user.id) cambiarMiPassCuenta(); else toast(MSJ.laContrasenaDeOtraPersonaLa,'info');
    return;
  }
  const u=(DB.get('usuarios')||[]).find(x=>x.id===id && x.negocioId===STATE.negocio.id);
  if(!u){ toast(MSJ.usuarioNoEncontrado,'error'); return; }
  abrirModal({titulo:'🔑 Contraseña de '+u.nombre, textoBoton:BOTON.guardar, campos:[
    {id:'nueva', label:'Nueva contraseña', requerido:true},
    {id:'nueva2', label:'Repite la nueva contraseña', requerido:true}
  ], extraHTML:`<p class="nota">Usuario para entrar: <strong>${escapeHtml(u.usuario)}</strong>. Mínimo 4 caracteres.</p>`,
  onGuardar:(d)=>{
    const nueva=(d.nueva||'').trim();
    if(nueva.length<4){ toast(MSJ.laContrasenaDebeTenerAlMenos4,'error'); return; }
    if(nueva!==(d.nueva2||'').trim()){ toast(MSJ.lasContrasenasNoCoinciden,'error'); return; }
    const arr=DB.get('usuarios')||[];
    const x=arr.find(y=>y.id===id);
    if(!x){ toast(MSJ.usuarioNoEncontrado,'error'); return; }
    ponerPass(x, nueva);
    DB.set('usuarios',arr);
    if(x.id===STATE.user.id){ delete STATE.user.pass; STATE.user.passHash=x.passHash; STATE.user.passSal=x.passSal; STATE.user.passIter=x.passIter; }
    logAudit('Cambió contraseña', x.nombre+' ('+x.usuario+')');
    cerrarModal();
    toast('Contraseña actualizada para '+x.nombre,'success');
    render();
  }});
}
