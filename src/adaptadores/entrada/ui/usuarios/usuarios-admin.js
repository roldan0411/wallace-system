// ============================================================
//  INTERFAZ · Usuarios de un negocio (super-admin)
//  Crear, editar, desactivar y eliminar empleados.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/10-users-roles/10-users-roles.md
// ============================================================
import { escapeHtml, now } from '../nucleo/estado.js';
import { BOTON, MSJ } from '../nucleo/textos.js';
import { esAdminSistema } from '../nucleo/permisos.js';
import { abrirModal, cerrarModal, confirmarModal, toast } from '../nucleo/componentes.js';
import { render } from '../nucleo/navegacion.js';
import { conCuentasFirebase, mensajeCuenta, ponerPass } from './sesion.js';
import { borrarCuentaDe, crearCuentaPara, quitarUsuarioLegado, trasGuardarCuenta } from './cuentas.js';
import { cabeceraFicha } from '../super-admin/ficha-negocio.js';
import { anotarEnSistema } from '../super-admin/historial-sistema.js';


// ---------- Usuarios del negocio ----------
export function pantallaUsuarios(negId){
  const neg=(DB.get('negocios')||[]).find(n=>n.id===negId);
  if(!neg) return '<div class="tarjeta">Negocio no encontrado</div>';
  const us=(DB.get('usuarios')||[]).filter(u=>u.negocioId===negId);
  return `${cabeceraFicha(neg, 'usuarios')}
  <div class="contenido">
    <div class="tarjeta">
      <div class="t-cab">
        <span class="t-tit">Empleados</span>
        <button class="btn btn-gold" data-click="editarUsuario('${escapeHtml(negId)}',null)">+ Crear usuario</button>
      </div>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Sucursales</th><th>Estado</th><th></th></tr></thead>
        <tbody>${us.length?us.map(u=>`<tr>
          <td><strong>${escapeHtml(u.nombre)}</strong></td>
          <td>${escapeHtml(u.usuario)}</td>
          <td>${escapeHtml((ROLES.find(r=>r[0]===u.rol)||['',u.rol])[1])}</td>
          <td class="gris chico">${(u.sucursales&&u.sucursales.length)?u.sucursales.length+' asignada(s)':'todas'}</td>
          <td>${u.activo!==false?'<span class="pill pill-verde">Activo</span>':'<span class="pill pill-rojo">Inactivo</span>'}</td>
          <td class="acciones">
            <button class="btn btn-sm" data-click="editarUsuario('${escapeHtml(negId)}','${escapeHtml(u.id)}')">Editar</button>
            <button class="btn btn-sm btn-rojo" data-click="eliminarUsuario('${escapeHtml(u.id)}')">×</button>
          </td>
        </tr>`).join(''):'<tr><td colspan="6" class="gris">Sin usuarios. Crea el primero.</td></tr>'}</tbody>
      </table></div>
    </div>
  </div>`;
}
export function editarUsuario(negId,userId){
  const neg=(DB.get('negocios')||[]).find(n=>n.id===negId);
  const u=userId?(DB.get('usuarios')||[]).find(x=>x.id===userId):null;
  const sugerido = u?u.usuario:(neg.nombre||'').toLowerCase().replace(/[^a-z0-9]/g,'').substring(0,8);
  // Pantallas y permisos actuales del usuario (o los del rol por defecto)
  const pantActuales = (u&&u.pantallas&&u.pantallas.length)?u.pantallas:(PANTALLAS_POR_ROL[(u?u.rol:'cajero')]||[]);
  const permActuales = (u&&u.permisos&&u.permisos.length)?u.permisos:(PERMISOS_POR_ROL[(u?u.rol:'cajero')]||[]);
  const TODAS_PANTALLAS=[['inicio','Dashboard'],['ventas','Nueva Venta'],['pedidos','Pedidos'],
    ['catalogo','Menú / Inventario'],['caja','Caja'],['cocina','Cocina'],['citas','Agendar'],
    ['domicilios','Domicilios'],['clientes','Clientes'],['cuentas','Cuentas Abiertas'],['combos','Menú y Combos'],['conteo','Conteo de Inventario'],['reimpresiones','Reimpresiones'],
    ['tiempos','Tiempos de Entrega'],['reportes','Reportes'],['historial','Historial'],
    ['contable','Contable'],['gastosneg','Gastos'],['auditoria','Auditoría'],
    ['usuarios','Usuarios'],['config','Configuración']];
  const sucHTML=(neg.sucursales&&neg.sucursales.length>1)?`<div class="m-row">
      <label>Sucursales a las que puede entrar (vacío = todas)</label>
      <div class="checks">${neg.sucursales.map(s=>`<label class="chk"><input type="checkbox" class="u-suc" value="${escapeHtml(s.id)}" ${(u&&u.sucursales&&u.sucursales.indexOf(s.id)>-1)?'checked':''}> 📍 ${escapeHtml(s.nombre)}</label>`).join('')}</div>
    </div>`:'';
  const permisosHTML=`
    <div class="cobro-caja mt-14">
      <strong>Ventanas que puede ver <span class="gris chico">(según lo que necesite)</span></strong>
      <div class="checks mt-8">${TODAS_PANTALLAS.map(p=>`<label class="chk"><input type="checkbox" class="u-pant" value="${escapeHtml(p[0])}" ${pantActuales.indexOf(p[0])>-1?'checked':''}> ${escapeHtml(p[1])}</label>`).join('')}</div>
    </div>
    <div class="cobro-caja mt-12">
      <strong>Acciones que puede hacer</strong>
      <div class="checks mt-8">${ACCIONES.map(a=>`<label class="chk"><input type="checkbox" class="u-perm" value="${escapeHtml(a[0])}" ${permActuales.indexOf(a[0])>-1?'checked':''}> ${escapeHtml(a[1])}</label>`).join('')}</div>
      <p class="nota mt-8">Si el rol es <strong>Administrador</strong>, puede hacer todo sin importar estas casillas.</p>
    </div>`;
  abrirModal({titulo:(u?'Editar':'Crear')+' usuario', textoBoton:BOTON.guardar, campos:[
    {id:'nombre', label:'Nombre completo', valor:u?u.nombre:'', requerido:true},
    {id:'usuario', label:'Usuario para entrar', valor:sugerido, requerido:true},
    {id:'pass', label:u?'Nueva contraseña (vacío = no cambiar)':'Contraseña', tipo:'password', valor:'', requerido:!u},
    {id:'rol', label:'Rol (define permisos por defecto)', tipo:'select', valor:u?u.rol:'cajero',
      opciones:ROLES.map(r=>({valor:r[0],label:r[1]}))}
  ], extraHTML: `<label class="chk mb-10"><input type="checkbox" id="u-activo" ${(!u||u.activo!==false)?'checked':''}> Usuario activo (si se desmarca, no puede entrar)</label>` + sucHTML + permisosHTML,
  onGuardar:(d)=>{
    if(!esAdminSistema()){ toast(MSJ.soloElAdministradorDelSistemaGestiona,'error'); return; }
    d.usuario=(d.usuario||'').trim();
    if(!Dominio.cuentas.usuarioValido(d.usuario)){ toast(MSJ.usuarioInvalido,'error'); return; }   // V4
    const igual=x=>Dominio.cuentas.mismoUsuario(x.usuario, d.usuario);
    const existe=(DB.get('usuarios')||[]).find(x=>igual(x) && (!u||x.id!==u.id))
              || (DB.get('superadmins')||[]).some(igual);
    if(existe){ toast(MSJ.eseUsuarioYaExiste,'error'); return; }
    const nuevaPass=(d.pass||'').trim();
    const cuentas=conCuentasFirebase(), minPass=cuentas?6:4;
    if((!u || nuevaPass) && nuevaPass.length<minPass){ toast('La contraseña debe tener al menos '+minPass+' caracteres','error'); return; }
    const activo=!!(document.getElementById('u-activo')||{}).checked;
    const sucs=Array.prototype.slice.call(document.querySelectorAll('.u-suc:checked')).map(c=>c.value);
    const pants=Array.prototype.slice.call(document.querySelectorAll('.u-pant:checked')).map(c=>c.value);
    const perms=Array.prototype.slice.call(document.querySelectorAll('.u-perm:checked')).map(c=>c.value);
    const usuarios=DB.get('usuarios')||[];
    // P11: el negocio no se queda sin administrador activo
    if(u && Dominio.permisos.dejaSinAdmin(usuarios, negId, u.id, {rol:d.rol, activo})){ toast(MSJ.elNegocioQuedariaSinAdministrador,'error'); return; }
    if(u){
      const x=usuarios.find(y=>y.id===userId);
      if(x){
        const antes=x.usuario, antesU=JSON.parse(JSON.stringify(x));
        Object.assign(x,{nombre:d.nombre,usuario:d.usuario,rol:d.rol,sucursales:sucs,pantallas:pants,permisos:perms,activo:activo});
        if(nuevaPass && !cuentas) ponerPass(x, nuevaPass);
        DB.set('usuarios',usuarios);
        anotarEnSistema(Dominio.sistema.ACCION.editarUsuario, neg, antesU, x, x.nombre+' ('+x.usuario+')'+(nuevaPass?' · contraseña nueva':''));
        if(cuentas) trasGuardarCuenta(x, false, antes, nuevaPass);
      }
    } else {
      const rec={id:uid(), negocioId:negId, nombre:d.nombre, usuario:d.usuario,
        rol:d.rol, sucursales:sucs, pantallas:pants, permisos:perms, activo:activo, creado:now()};
      if(cuentas){
        crearCuentaPara(rec, nuevaPass, false).then(c=>{
          rec.uid=c.uid;
          const l=DB.get('usuarios')||[]; l.push(rec); DB.set('usuarios',l);
          anotarEnSistema(Dominio.sistema.ACCION.crearUsuario, neg, null, {rol:rec.rol}, rec.nombre+' ('+rec.usuario+')');
          cerrarModal(); toast(MSJ.usuarioCreado,'success'); render();
        }).catch(e=>toast('No se pudo crear la cuenta: '+mensajeCuenta(e),'error'));
        return;
      }
      usuarios.push(ponerPass(rec, nuevaPass));
      DB.set('usuarios',usuarios);
      anotarEnSistema(Dominio.sistema.ACCION.crearUsuario, neg, null, {rol:rec.rol}, rec.nombre+' ('+rec.usuario+')');
    }
    cerrarModal(); toast(MSJ.usuarioGuardado,'success'); render();
  }});
}
// P11: se ofrece primero desactivar (conserva su historial de ventas); eliminar queda
// como segunda opción, en rojo. El último administrador activo no se quita.
export function eliminarUsuario(id){
  if(!esAdminSistema()){ toast(MSJ.noTienesPermisoParaEliminarUsuarios,'error'); return; }
  const us=DB.get('usuarios')||[];
  const rec=us.find(u=>u.id===id); if(!rec) return;
  if(Dominio.permisos.dejaSinAdmin(us, rec.negocioId, id, null)){ toast(MSJ.elNegocioQuedariaSinAdministrador,'error'); return; }
  const quien=(rec.nombre||rec.usuario)+' ('+(ROLES.find(r=>r[0]===rec.rol)||['',rec.rol])[1]+')';
  if(rec.activo===false){
    confirmarModal('¿Eliminar definitivamente a '+quien+'? Ya estaba desactivado. Se borra el usuario y su acceso.', ()=>eliminarUsuarioDefinitivo(id), BOTON.eliminarDefinitivamente);
    return;
  }
  abrirModal({titulo:'Quitar a '+quien, textoBoton:BOTON.desactivar, campos:[],
    extraHTML:`<p class="fs-15 lh-1_6"><strong>Desactivar</strong>: ya no puede entrar y se conserva su historial de ventas. Se puede volver a activar en Editar.</p>
      <p class="nota">Eliminar borra el usuario y su acceso, y no se puede deshacer.</p>
      <button type="button" class="btn btn-sm btn-rojo mt-10" data-click="eliminarUsuarioDefinitivo('${escapeHtml(id)}')">Eliminar definitivamente</button>`,
    onGuardar:()=>{
      const l=DB.get('usuarios')||[];
      const x=l.find(y=>y.id===id); if(!x){ cerrarModal(); return; }
      x.activo=false;
      DB.set('usuarios',l);
      anotarEnSistema(Dominio.sistema.ACCION.desactivarUsuario, (DB.get('negocios')||[]).find(n=>n.id===x.negocioId), {activo:true}, {activo:false}, quien);
      if(conCuentasFirebase()) trasGuardarCuenta(x, false, x.usuario, '');
      cerrarModal(); toast(MSJ.usuarioDesactivado,'info'); render();
    }});
}
export function eliminarUsuarioDefinitivo(id){
  if(!esAdminSistema()){ toast(MSJ.noTienesPermisoParaEliminarUsuarios,'error'); return; }
  const us=DB.get('usuarios')||[];
  const rec=us.find(u=>u.id===id); if(!rec) return;
  if(Dominio.permisos.dejaSinAdmin(us, rec.negocioId, id, null)){ toast(MSJ.elNegocioQuedariaSinAdministrador,'error'); return; }
  cerrarModal();
  anotarEnSistema(Dominio.sistema.ACCION.eliminarUsuario, (DB.get('negocios')||[]).find(n=>n.id===rec.negocioId), null, null, (rec.nombre||rec.usuario)+' ('+rec.usuario+')');
  if(conCuentasFirebase()){
    borrarCuentaDe(rec.usuario).catch(e=>toast('No se pudo borrar su cuenta de acceso: '+mensajeCuenta(e),'error'));
    quitarUsuarioLegado(id);
  }
  DB.set('usuarios',(DB.get('usuarios')||[]).filter(u=>u.id!==id));
  toast(MSJ.eliminado,'info'); render();
}
