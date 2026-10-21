// ============================================================
//  INTERFAZ · Administradores del sistema
//  Super-admins: crear, editar, eliminar, mi contraseña.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/01-super-admin-panel/01-super-admin-panel.md
// ============================================================
import { STATE, escapeHtml, fmtDate, now } from '../nucleo/estado.js';
import { BOTON, MSJ } from '../nucleo/textos.js';
import { abrirModal, cerrarModal, confirmarModal, toast } from '../nucleo/componentes.js';
import { render } from '../nucleo/navegacion.js';
import { conCuentasFirebase, mensajeCuenta, ponerPass } from '../usuarios/sesion.js';
import { borrarCuentaDe, cambiarMiPassCuenta, crearCuentaPara, trasGuardarCuenta } from '../usuarios/cuentas.js';


// ============================================================
//  GESTIÓN DE SUPER ADMINS (solo el dueño del sistema)
// ============================================================
export function pantallaSuperAdmins(){
  const esDueno = STATE.user.rolSuper==='dueno';
  const sas=DB.get('superadmins')||[];
  return `
  <div class="topbar">
    <h1><span class="sa-marca">👥 Administradores del sistema</span></h1>
    <div class="tb-der">
      <button class="btn btn-ghost btn-sm" data-click="irPanel()">← Volver</button>
    </div>
  </div>
  <div class="contenido">
    ${!esDueno?`<div class="tarjeta"><p class="gris">🔒 Solo el dueño del sistema puede gestionar administradores.</p></div>`:`
    <div class="tarjeta">
      <div class="t-cab">
        <span class="t-tit">👥 Súper administradores</span>
        <button class="btn btn-gold" data-click="editarSuperAdmin(null)">+ Crear administrador</button>
      </div>
      <p class="nota">El <strong>dueño</strong> puede todo (crear negocios, otros admins, respaldos). El <strong>ayudante</strong> puede gestionar negocios pero no crear ni borrar otros administradores.</p>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Creado</th><th></th></tr></thead>
        <tbody>${sas.map(s=>`<tr>
          <td class="negrita">${escapeHtml(s.nombre)}</td>
          <td>${escapeHtml(s.usuario)}</td>
          <td>${s.rolSuper==='dueno'?'<span class="pill pill-oro">Dueño</span>':s.rolSuper==='vendedor'?'<span class="pill pill-verde">Vendedor</span>':'<span class="pill pill-azul">Ayudante</span>'}</td>
          <td class="gris chico">${s.creado?fmtDate(s.creado):'—'}</td>
          <td class="acciones">
            <button class="btn btn-sm" data-click="editarSuperAdmin('${escapeHtml(s.id)}')">Editar</button>
            ${s.rolSuper!=='dueno'||sas.filter(x=>x.rolSuper==='dueno').length>1?`<button class="btn btn-sm btn-rojo" data-click="eliminarSuperAdmin('${escapeHtml(s.id)}')">×</button>`:''}
          </td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>`}
  </div>`;
}
export function editarSuperAdmin(id){
  if(STATE.user.rolSuper!=='dueno'){ toast(MSJ.soloElDuenoPuedeCrearAdministradores,'error'); return; }
  const sas=DB.get('superadmins')||[];
  const s=id?sas.find(x=>x.id===id):null;
  abrirModal({titulo:(s?'Editar':'Crear')+' administrador', textoBoton:BOTON.guardar, campos:[
    {id:'nombre', label:'Nombre completo', valor:s?s.nombre:'', requerido:true},
    {id:'usuario', label:'Usuario para entrar', valor:s?s.usuario:'', requerido:true},
    {id:'pass', label:s?'Nueva contraseña (vacío = no cambiar)':'Contraseña', tipo:'password', valor:'', requerido:!s},
    {id:'rolSuper', label:'Rol', tipo:'select', valor:s?s.rolSuper:'ayudante',
      opciones:[{valor:'vendedor',label:'Vendedor (solo crea y muestra demos)'},{valor:'ayudante',label:'Ayudante (gestiona negocios)'},{valor:'dueno',label:'Dueño (control total)'}]}
  ], onGuardar:(d)=>{
    const usuario=d.usuario.trim();
    // No permitir usuarios repetidos (ni con empleados de negocios)
    if(!Dominio.cuentas.usuarioValido(usuario)){ toast(MSJ.usuarioInvalido,'error'); return; }   // V4
    const igual=x=>Dominio.cuentas.mismoUsuario(x.usuario, usuario);
    const dup=(DB.get('superadmins')||[]).some(x=>igual(x) && (!s||x.id!==s.id))
           || (DB.get('usuarios')||[]).some(igual);
    if(dup){ toast(MSJ.eseUsuarioYaExiste,'error'); return; }
    const nuevaPass=d.pass.trim();
    const cuentas=conCuentasFirebase(), minPass=cuentas?6:5;
    if((!s || nuevaPass) && nuevaPass.length<minPass){ toast('La contraseña debe tener al menos '+minPass+' caracteres','error'); return; }
    const list=DB.get('superadmins')||[];
    if(s){
      const x=list.find(y=>y.id===id);
      // Evitar quitar el último dueño
      if(x.rolSuper==='dueno' && d.rolSuper!=='dueno' && list.filter(y=>y.rolSuper==='dueno').length<=1){
        toast(MSJ.debeQuedarAlMenosUnDueno,'error'); return;
      }
      const antes=x.usuario;
      Object.assign(x,{nombre:d.nombre.trim(), usuario:usuario, rolSuper:d.rolSuper});
      if(nuevaPass && !cuentas) ponerPass(x, nuevaPass);
      if(nuevaPass && cuentas) Dominio.cuentas.CAMPOS_PASS.forEach(k=>{ delete x[k]; });   // la clave vieja ya no sirve
      DB.set('superadmins',list);
      if(cuentas) trasGuardarCuenta(x, true, antes, nuevaPass);
    } else {
      const rec={id:uid(), nombre:d.nombre.trim(), usuario:usuario, rolSuper:d.rolSuper, creado:now()};
      if(cuentas){
        crearCuentaPara(rec, nuevaPass, true).then(()=>{
          const l=DB.get('superadmins')||[]; l.push(rec); DB.set('superadmins',l);
          cerrarModal(); toast(MSJ.administradorCreado,'success'); render();
        }).catch(e=>toast('No se pudo crear la cuenta: '+mensajeCuenta(e),'error'));
        return;
      }
      list.push(ponerPass(rec, nuevaPass));
      DB.set('superadmins',list);
    }
    cerrarModal(); toast(MSJ.administradorGuardado,'success'); render();
  }});
}
export function eliminarSuperAdmin(id){
  if(STATE.user.rolSuper!=='dueno'){ toast(MSJ.soloElDuenoPuedeEliminar,'error'); return; }
  const sas=DB.get('superadmins')||[];
  const s=sas.find(x=>x.id===id); if(!s) return;
  if(s.id===STATE.user.id){ toast(MSJ.noPuedesEliminarteATiMismo,'error'); return; }
  if(s.rolSuper==='dueno' && sas.filter(x=>x.rolSuper==='dueno').length<=1){ toast(MSJ.debeQuedarAlMenosUnDueno,'error'); return; }
  confirmarModal('¿Eliminar al administrador "'+s.nombre+'"? No podrá volver a entrar.',()=>{
    DB.set('superadmins', sas.filter(x=>x.id!==id));
    if(conCuentasFirebase()) borrarCuentaDe(s.usuario).catch(e=>toast('No se pudo borrar su cuenta de acceso: '+mensajeCuenta(e),'error'));
    toast(MSJ.administradorEliminado,'info'); render();
  },'Eliminar');
}
export function cambiarMiPassSuper(){
  if(conCuentasFirebase()){ cambiarMiPassCuenta(); return; }
  const sas=DB.get('superadmins')||[];
  const yo=sas.find(x=>x.id===STATE.user.id);
  if(!yo){ toast(MSJ.noSeEncontroTuCuenta,'error'); return; }
  abrirModal({titulo:'🔑 Cambiar mi contraseña', textoBoton:BOTON.guardar, campos:[
    {id:'actual', label:'Contraseña actual', tipo:'password', requerido:true},
    {id:'nueva', label:'Nueva contraseña', tipo:'password', requerido:true},
    {id:'nueva2', label:'Repite la nueva contraseña', tipo:'password', requerido:true}
  ], onGuardar:(d)=>{
    if(!verificarPass(yo, d.actual)){ toast(MSJ.laContrasenaActualNoCoincide,'error'); return; }
    if(d.nueva.trim().length<5){ toast(MSJ.laNuevaDebeTenerAlMenos5,'error'); return; }
    if(d.nueva!==d.nueva2){ toast(MSJ.lasContrasenasNuevasNoCoinciden,'error'); return; }
    const list=DB.get('superadmins')||[];
    const x=list.find(y=>y.id===yo.id);
    if(x){ ponerPass(x, d.nueva.trim()); DB.set('superadmins',list); }
    cerrarModal(); toast(MSJ.contrasenaActualizada,'success');
  }});
}
export function irAdministradores(){ STATE.page='superadmins'; render(); }
