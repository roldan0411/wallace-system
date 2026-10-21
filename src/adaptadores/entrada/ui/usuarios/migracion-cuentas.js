// ============================================================
//  INTERFAZ · Migración de cuentas (S1)
//  Pantalla 🔐 Cuentas del super-admin.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/-02-corrections/-02-corrections.md
// ============================================================
import { STATE, escapeHtml, fmtDate } from '../nucleo/estado.js';
import { BOTON, MSJ } from '../nucleo/textos.js';
import { esAdminSistema } from '../nucleo/permisos.js';
import { abrirModal, cerrarModal, confirmarModal, toast } from '../nucleo/componentes.js';
import { render } from '../nucleo/navegacion.js';
import { mensajeCuenta } from './sesion.js';
import { reemplazarCuenta } from './cuentas.js';


// ============================================================
//  MIGRACIÓN DE CUENTAS (S1, Plan B · B.6) — panel del super-admin
//  Muestra qué usuarios ya tienen cuenta de Firebase, cuáles faltan y qué
//  hay que revisar (perfiles que no corresponden a ningún usuario real).
//  Las reglas cerradas se publican cuando pendientes y por revisar = 0.
// ============================================================
export let _indiceCuentas=null, _cargandoIndice=false;
export function abrirMigracion(){
  if(!esAdminSistema()){ toast(MSJ.noTienesPermiso,'error'); return; }
  STATE.page='migracion';
  recargarIndiceCuentas();
  render();
}
export function recargarIndiceCuentas(){
  _cargandoIndice=true;
  Cuentas.leerIndice().then(ix=>{ _indiceCuentas=ix; })
    .catch(e=>{ toast('No se pudo leer el índice de cuentas: '+mensajeCuenta(e),'error'); })
    .then(()=>{ _cargandoIndice=false; if(STATE.page==='migracion') render(); });
}
// Usuarios reales: los de cada negocio + los del esquema viejo que aún no se copiaron
export function usuariosParaMigrar(){
  const us=(DB.get('usuarios')||[]).slice();
  const ids={}; us.forEach(u=>{ ids[u.id]=1; });
  (DB.get('usuarios_legado')||[]).forEach(u=>{ if(u && u.id && !ids[u.id]) us.push(Dominio.cuentas.sinContrasenas(u)); });
  return us;
}
export function filaMigracion(f){
  if(f.tipo==='super') return (DB.get('superadmins')||[]).find(s=>s.id===f.id)||null;
  return usuariosParaMigrar().find(u=>u.id===f.id)||null;
}
export function pantallaMigracion(){
  const negs={}; (DB.get('negocios')||[]).forEach(n=>{ negs[n.id]=n.nombre; });
  const ix=_indiceCuentas;
  const filas=ix ? Dominio.cuentas.estadoMigracion({superadmins:DB.get('superadmins')||[], usuarios:usuariosParaMigrar(), perfiles:ix.perfiles, login:ix.login}) : [];
  const r=Dominio.cuentas.resumenMigracion(filas);
  const orden={revisar:0, pendiente:1, migrado:2};
  filas.sort((a,b)=>orden[a.estado]-orden[b.estado] || String(a.usuario).localeCompare(String(b.usuario)));
  const pill=f=>f.estado==='migrado'?'<span class="pill pill-verde">✅ Migrado</span>'
    :f.estado==='pendiente'?'<span class="pill pill-azul">⏳ Pendiente</span>':'<span class="pill pill-rojo">⚠️ Revisar</span>';
  const acciones=(f,i)=>{
    if(!f.id) return `<button class="btn btn-sm btn-rojo" data-click="borrarPerfilHuerfano(${escapeHtml(i)})">Borrar perfil</button>`;
    if(f.estado==='pendiente') return `<button class="btn btn-sm btn-gold" data-click="cuentaParaFila(${escapeHtml(i)})">Crear cuenta</button>`;
    return `<button class="btn btn-sm" data-click="cuentaParaFila(${escapeHtml(i)})">${f.estado==='revisar'?'Reemplazar cuenta':'Restablecer contraseña'}</button>`;
  };
  window._filasMigracion=filas;
  return `
  <div class="topbar">
    <h1><span class="sa-marca">🔐 Migración de cuentas</span></h1>
    <div class="tb-der">
      <button class="btn btn-sm" data-click="recargarIndiceCuentas()">🔄 Actualizar</button>
      <button class="btn btn-ghost btn-sm" data-click="irPanel()">← Volver</button>
    </div>
  </div>
  <div class="contenido">
    <div class="tarjeta">
      <div class="t-cab"><span class="t-tit">${ix?`${r.migradas} de ${r.total} cuentas migradas · ${r.pendientes} pendientes · ${r.revisar} por revisar`:(_cargandoIndice?'Cargando…':'Sin datos del índice')}</span>
        <button class="btn btn-sm" data-click="migrarTablasAhora()">Migrar tablas globales</button></div>
      <p class="nota">Cada persona migra sola la primera vez que entra (con su misma contraseña; si tenía menos de 6 caracteres se le pide una nueva).
        A quien no haya entrado al vencer el plazo, créele la cuenta aquí con una contraseña nueva y entrégasela.
        <strong>Las reglas cerradas (database.rules.json) se publican cuando pendientes y por revisar estén en cero.</strong></p>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Usuario</th><th>Nombre</th><th>Negocio</th><th>Rol</th><th>Estado</th><th>Detalle</th><th></th></tr></thead>
        <tbody>${filas.length?filas.map((f,i)=>`<tr>
          <td class="negrita">${escapeHtml(f.usuario)}</td>
          <td>${escapeHtml(f.nombre)}</td>
          <td>${f.tipo==='super'?'<span class="gris">Sistema</span>':escapeHtml(negs[f.negocioId]||f.negocioId||'—')}</td>
          <td>${escapeHtml(f.rol||'')}</td>
          <td>${pill(f)}</td>
          <td class="gris chico">${escapeHtml(f.motivo||'')}${f.migradoEn?escapeHtml((f.motivo?' · ':'')+fmtDate(f.migradoEn)):''}</td>
          <td class="acciones">${acciones(f,i)}</td>
        </tr>`).join(''):`<tr><td colspan="7" class="gris">${_cargandoIndice?'Cargando…':'Sin cuentas.'}</td></tr>`}</tbody>
      </table></div>
    </div>
  </div>`;
}
export function cuentaParaFila(i){
  const f=(window._filasMigracion||[])[i]; if(!f) return;
  const rec=filaMigracion(f);
  if(!rec){ toast(MSJ.noSeEncontroElUsuario,'error'); return; }
  abrirModal({titulo:(f.estado==='pendiente'?'Crear cuenta de ':'Contraseña nueva para ')+rec.usuario, textoBoton:BOTON.guardar, campos:[
    {id:'p1', label:'Contraseña nueva (mínimo 6 caracteres)', tipo:'password', requerido:true},
    {id:'p2', label:'Repítela', tipo:'password', requerido:true}
  ], extraHTML:`<p class="nota">Entrégale la contraseña a <strong>${escapeHtml(rec.nombre||rec.usuario)}</strong>. Si ya tenía una cuenta, esa queda sin acceso.</p>`,
  onGuardar:d=>{
    if((d.p1||'').length<6){ toast(MSJ.debeTenerAlMenos6Caracteres,'error'); return; }
    if(d.p1!==d.p2){ toast(MSJ.lasContrasenasNoCoinciden,'error'); return; }
    reemplazarCuenta(rec, d.p1, f.tipo==='super').then(()=>{
      cerrarModal(); toast('Cuenta lista para '+rec.usuario,'success'); recargarIndiceCuentas();
    }).catch(e=>toast('No se pudo: '+mensajeCuenta(e),'error'));
  }});
}
export function borrarPerfilHuerfano(i){
  const f=(window._filasMigracion||[])[i]; if(!f || !f.uid) return;
  confirmarModal('¿Borrar el perfil de "'+(f.usuario||'?')+'"? Esa cuenta queda sin acceso a nada.',()=>{
    Cuentas.borrarCuenta({uid:f.uid, usuario:f.usuario}).then(()=>{ toast(MSJ.perfilBorrado,'info'); recargarIndiceCuentas(); })
      .catch(e=>toast('No se pudo: '+mensajeCuenta(e),'error'));
  },'Borrar');
}
export function migrarTablasAhora(){
  Datos.migrarTablasGlobales().then(m=>{
    if(m.hecho) toast('Migradas: '+m.negocios+' negocio(s) y '+m.usuarios+' usuario(s)','success');
    else toast(m.motivo==='ya_migrado'?'Las tablas globales ya estaban migradas':'No se pudo migrar ('+(m.motivo||'error')+')', m.motivo==='ya_migrado'?'info':'error');
  });
}
