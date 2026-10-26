// ============================================================
//  INTERFAZ · Negocios
//  Crear, suspender, eliminar, asignar vendedor y supervisar un negocio.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/01-super-admin-panel/01-super-admin-panel.md
// ============================================================
import { STATE, escapeHtml, now } from '../nucleo/estado.js';
import { BOTON, MSJ } from '../nucleo/textos.js';
import { esAdminSistema } from '../nucleo/permisos.js';
import { abrirModal, cerrarModal, confirmarModal, reportarError, toast } from '../nucleo/componentes.js';
import { render } from '../nucleo/navegacion.js';
import { conCuentasFirebase, mensajeCuenta, ponerPass } from '../usuarios/sesion.js';
import { borrarCuentasDeNegocio, crearCuentaPara, trabajarEn } from '../usuarios/cuentas.js';
import { camposPruebaHTML, diasPruebaValidos, iniciarPruebaDe, leerCamposPrueba } from './pruebas.js';
import { fijarFacturaReservada, reservarFactura } from '../ventas/nueva-venta.js';
import { fijarResumenNeg } from '../reportes/resumen.js';
import { anotarEnSistema } from './historial-sistema.js';
import { bajarArchivoRespaldo } from './panel.js';
import { configNegocio } from '../configuracion/config-negocio.js';


// ---------- Crear negocio ----------
export function nuevoNegocio(){
  // El vendedor solo crea negocios a prueba y quedan a su nombre (Dominio.prueba.puedeGestionarAlta)
  const vendedor=!!(STATE.user&&STATE.user.rolSuper==='vendedor');
  if(!Dominio.prueba.puedeGestionarAlta(STATE.user, null)){ toast(MSJ.noTienesPermisoParaCrearNegocios,'error'); return; }
  // P5/U9: tres pasos en la misma ventana (negocio → dueño → plan, cobro y prueba)
  abrirModal({titulo:'Crear negocio', textoBoton:BOTON.crear, campos:[
    {tipo:'seccion', id:'paso1', label:'1 · El negocio'},
    {id:'nombre', label:'Nombre del negocio', requerido:true, placeholder:'Ej: MANILLASNET'},
    {id:'tipo', label:'Tipo de negocio', tipo:'select', opciones:Object.keys(PERFILES).map(t=>({valor:t,label:t}))},
    {id:'ciudad', label:'Ciudad'},
    {id:'tel', label:'Teléfono del negocio', tipo:'tel'},
    {id:'flujo', label:'¿Cómo cobra? (se puede cambiar después en Configurar)', tipo:'select', opciones:[
      {valor:'directo', label:'Cobro directo (tienda: se cobra al instante)'},
      {valor:'dos_pasos', label:'Confirmar y luego cobrar (restaurante: se toma el pedido y se cobra después)'}]},
    {tipo:'seccion', id:'paso2', label:'2 · El dueño y su acceso'},
    {id:'duenoNombre', label:'Nombre del dueño', placeholder:'Ej: Ana Gómez'},
    {id:'duenoTel', label:'Teléfono del dueño', tipo:'tel'},
    {id:'usuario', label:'Usuario para entrar', requerido:true, placeholder:'admin'},
    {tipo:'seccion', id:'paso3', label:'3 · Plan, cobro y prueba'},
    {id:'plan', label:'Plan', tipo:'select', opciones:[...PLANES.map(x=>({valor:x,label:x}))], cambio:'sugerirPrecioPlan(this.value)'},
    {id:'precio', label:'Precio mensual', tipo:'number', valor:String(Dominio.negocio.precioSugerido(PLANES[0]))},
    {id:'diapago', label:'Día de pago (1 a 28; vacío = el día en que empiece a pagar)', tipo:'number'},
    vendedor?null:{id:'vendedor', label:'Vendedor a cargo', tipo:'select',
      opciones:[{valor:'',label:'— Sin asignar —'}].concat((DB.get('superadmins')||[]).map(v=>({valor:v.id,label:v.nombre})))}
  ].filter(Boolean), extraHTML:camposPruebaHTML(vendedor)+`
    <p class="nota">La contraseña del dueño se crea al azar y se muestra una sola vez al terminar.</p>`,
  onGuardar:(d)=>{
    if(vendedor) d.vendedor=STATE.user.id;
    const prueba=leerCamposPrueba();
    if(vendedor && !prueba){ toast(MSJ.comoVendedorElNegocioQuedaA,'error'); return; }
    if(!diasPruebaValidos(prueba)){ toast('Los días de prueba deben ser de 1 a '+Dominio.prueba.MAX_DIAS,'error'); return; }
    const perfil=JSON.parse(JSON.stringify(PERFILES[d.tipo]||PERFILES['Otro']));
    const flujo=d.flujo||perfil.flujoPedido;
    const diaPago=Dominio.negocio.diaPagoEscrito(d.diapago);
    if(Number.isNaN(diaPago)){ toast(MSJ.diaDePagoInvalido,'error'); return; }
    d.usuario=(d.usuario||'').trim();
    if(!Dominio.cuentas.usuarioValido(d.usuario)){ toast(MSJ.usuarioInvalido,'error'); return; }   // V4
    const igual=x=>Dominio.cuentas.mismoUsuario(x.usuario, d.usuario);
    const existe=(DB.get('usuarios')||[]).some(igual) || (DB.get('superadmins')||[]).some(igual);
    if(existe){ toast(MSJ.eseUsuarioYaExiste,'error'); return; }
    const negId=uid();
    const negocio={
      id:negId, nombre:d.nombre, tipo:d.tipo, ciudad:d.ciudad||'',
      plan:d.plan, precioMes:Math.max(0, parseInt(d.precio)||0), activo:true,
      logo:'', nit:'', tel:(d.tel||'').trim(), dir:'', eslogan:'',
      duenoNombre:(d.duenoNombre||'').trim(), duenoTel:(d.duenoTel||'').trim(),
      palabraProducto:perfil.palabraProducto, palabraProductos:perfil.palabraProductos,
      palabraPedido:perfil.palabraPedido||'Pedido', palabraPersonal:perfil.palabraPersonal||'Personal',
      usaMesas:perfil.usaMesas, usaCocina:perfil.usaCocina,
      usaRecetas:perfil.usaRecetas, usaCitas:perfil.usaCitas,
      usaCaja: perfil.usaCaja!==false, esLogistica: !!perfil.esLogistica,
      flujoPedido:flujo,
      tiposEntrega:perfil.tiposEntrega.slice(),
      funciones:perfil.funciones.slice(),
      tipoFactura:'pos', pctDatafono:0, sonidos:true, tema:'claro',
      sucursales:[], creado:now(),
      vendedorId:d.vendedor||null,
      vendedorNombre:((DB.get('superadmins')||[]).find(v=>v.id===d.vendedor)||{}).nombre||''
    };
    // A prueba desde que nace (las reglas exigen que el negocio de un vendedor venza)
    if(prueba) Object.assign(negocio, Dominio.prueba.nuevaPrueba(Date.now(), prueba.dias));
    else{ Object.assign(negocio, Dominio.cobros.inicioDeCobro(today(), diaPago)); delete negocio.pagadoHasta; }   // P6: paga desde hoy
    if(prueba && diaPago) negocio.diaPago=diaPago;   // se usa al pasarlo a pago
    if(vendedor) negocio.vendedorNombre=STATE.user.nombre||'';
    const admin={id:uid(), negocioId:negId, nombre:(d.duenoNombre||'').trim()||'Administrador', usuario:d.usuario, rol:'admin', activo:true, creado:now()};
    // P1: clave al azar (antes todos nacían con la misma); con cuentas, la cambia al primer ingreso
    const clave=Cripto.claveAleatoria(10);
    const guardarNegocio=()=>{ const negocios=DB.get('negocios')||[]; negocios.push(negocio); DB.set('negocios',negocios); };
    const guardarAdmin=()=>{
      const usuarios=DB.get('usuarios')||[]; usuarios.push(admin); DB.set('usuarios',usuarios);
      cerrarModal();
      STATE.tabNegocios=Dominio.negocio.grupoPanel(negocio);   // U2: que se vea en su pestaña
      toast('Negocio creado: '+d.nombre,'success');
      anotarEnSistema(Dominio.sistema.ACCION.crearNegocio, negocio, null, {tipo:negocio.tipo, plan:negocio.plan, precioMes:negocio.precioMes, vendedorId:negocio.vendedorId}, 'Administrador: '+d.usuario);
      iniciarPruebaDe(negId, prueba);
      render();
      mostrarAccesoNegocio(d.nombre, d.usuario, clave, negId);
    };
    if(conCuentasFirebase()){
      // Primero el negocio: las reglas del vendedor exigen que exista (y sea suyo) para crear su gente
      guardarNegocio();
      trabajarEn(negId).then(()=>crearCuentaPara(admin, clave, false, {debeCambiarPass:true})).then(c=>{ admin.uid=c.uid; guardarAdmin(); })
        .catch(e=>{
          DB.set('negocios', (DB.get('negocios')||[]).filter(n=>n.id!==negId));   // deshacer el alta
          toast('No se pudo crear la cuenta del administrador: '+mensajeCuenta(e),'error');
        });
      return;
    }
    ponerPass(admin, clave);
    guardarNegocio();
    guardarAdmin();
  }});
}

// La clave no se guarda en ningún lado legible: se muestra UNA vez (como en las demos)
export function mostrarAccesoNegocio(nombre, usuario, clave, negId){
  abrirModal({titulo:'Negocio creado', textoBoton:BOTON.listo, campos:[],
    extraHTML:`<p class="fs-15 lh-1_6">${escapeHtml(nombre)}<br>Usuario: <strong>${escapeHtml(usuario)}</strong><br>Contraseña: <strong id="pass-inicial" class="fs-19">${escapeHtml(clave)}</strong></p>
      <p class="nota">Anótala para dársela al cliente: <strong>no se vuelve a mostrar</strong>.${conCuentasFirebase()?' Al entrar por primera vez deberá elegir una nueva.':''}</p>
      ${negId?`<div class="botones-fila mt-14">
        <button type="button" class="btn btn-sm" data-click="despuesDelAlta('config', '${escapeHtml(negId)}')">⚙ Configurar ahora</button>
        <button type="button" class="btn btn-sm btn-verde" data-click="despuesDelAlta('entrar', '${escapeHtml(negId)}')">Entrar al negocio</button>
      </div>`:''}`,
    onGuardar:()=>cerrarModal()});
}
// U9: el siguiente paso al terminar el alta (cierra la ventana de la clave)
export function despuesDelAlta(que, negId){
  cerrarModal();
  if(que==='config') configNegocio(negId);
  else if(que==='entrar') entrarComoNegocio(negId);
}
// P5: al elegir el plan se sugiere su precio (se puede cambiar)
export function sugerirPrecioPlan(plan){
  const e=document.getElementById('m-precio');
  if(e) e.value=String(Dominio.negocio.precioSugerido(plan));
}

// Asignar o cambiar el vendedor a cargo de un negocio
export function asignarVendedor(id){
  if(!esAdminSistema()){ toast(MSJ.noTienesPermisoParaAsignarVendedores,'error'); return; }
  const negocios=DB.get('negocios')||[];
  const n=negocios.find(x=>x.id===id); if(!n) return;
  const sas=DB.get('superadmins')||[];
  abrirModal({titulo:'Vendedor a cargo de '+n.nombre, textoBoton:BOTON.guardar, campos:[
    {id:'vend', label:'Vendedor', tipo:'select', valor:n.vendedorId||'',
      opciones:[{valor:'',label:'— Sin asignar —'}].concat(sas.map(v=>({valor:v.id,label:v.nombre+(v.rolSuper==='vendedor'?' (vendedor)':'')})))},
    {id:'notas', label:'Notas comerciales (opcional)', valor:n.notasComerciales||''}
  ], extraHTML:`<p class="nota">Queda registrado quién atiende este cliente. Se puede filtrar la lista por vendedor y sale en el informe mensual.</p>`,
  onGuardar:(d)=>{
    const arr=DB.get('negocios')||[];
    const x=arr.find(y=>y.id===id); if(!x){ cerrarModal(); return; }
    const antes={vendedorId:x.vendedorId||null, notasComerciales:x.notasComerciales||''};
    x.vendedorId=d.vend||null;
    const v=sas.find(y=>y.id===x.vendedorId);
    x.vendedorNombre=v?v.nombre:'';
    x.notasComerciales=d.notas||'';
    DB.set('negocios',arr);
    anotarEnSistema(Dominio.sistema.ACCION.asignarVendedor, x, antes, {vendedorId:x.vendedorId, notasComerciales:x.notasComerciales}, x.vendedorNombre||'Sin vendedor');
    cerrarModal(); toast(x.vendedorId?('Asignado a '+x.vendedorNombre):'Vendedor quitado','success'); render();
  }});
}
export function toggleNegocio(id){
  const negocios=DB.get('negocios')||[];
  const n=negocios.find(x=>x.id===id); if(!n) return;
  if(!STATE.esSuperAdmin){ toast(MSJ.noTienesPermiso,'error'); return; }
  // El vendedor solo pausa/activa SUS demos, nunca un negocio real
  if(STATE.user.rolSuper==='vendedor' && (!n.esDemo || (n.demoDe && n.demoDe!==STATE.user.id))){
    toast(MSJ.comoVendedorSoloPuedesPausarTus,'error'); return;
  }
  if(n.archivado){ toast(MSJ.usaSacarDelArchivo,'info'); return; }
  // P3: suspender un cliente pide motivo; activar no pide nada. Las demos se pausan sin motivo.
  if(n.activo && !n.esDemo){ suspenderNegocio(id); return; }
  const antes={activo:n.activo, suspendidoDesde:n.suspendidoDesde, motivoSuspension:n.motivoSuspension};
  n.activo=!n.activo;
  delete n.suspendidoDesde; delete n.motivoSuspension;
  DB.set('negocios',negocios);
  anotarEnSistema(n.activo?Dominio.sistema.ACCION.activarNegocio:Dominio.sistema.ACCION.pausarDemo, n, antes, {activo:n.activo});
  toast(n.activo?MSJ.negocioActivado:MSJ.negocioSuspendido,'info');
  render();
}
export function suspenderNegocio(id){
  if(!esAdminSistema()){ toast(MSJ.noTienesPermiso,'error'); return; }
  const n=(DB.get('negocios')||[]).find(x=>x.id===id); if(!n) return;
  abrirModal({titulo:'Suspender '+n.nombre, textoBoton:BOTON.suspender, campos:[
    {id:'motivo', label:'Motivo', tipo:'select', opciones:Dominio.negocio.MOTIVOS_SUSPENSION.map(m=>({valor:m,label:m}))},
    {id:'detalle', label:'Detalle (obligatorio si es "Otro")', placeholder:'Ej: debe octubre'}
  ], extraHTML:`<p class="nota">Nadie del negocio podrá entrar hasta que lo actives. Sus datos no se borran.</p>`,
  onGuardar:(d)=>{
    const s=Dominio.negocio.suspension(d.motivo, d.detalle, now());
    if(!s){ toast(MSJ.eligeElMotivoDeLaSuspension,'error'); return; }
    const arr=DB.get('negocios')||[];
    const x=arr.find(y=>y.id===id); if(!x){ cerrarModal(); return; }
    const antes={activo:x.activo};
    Object.assign(x, s);
    DB.set('negocios',arr);
    anotarEnSistema(Dominio.sistema.ACCION.suspenderNegocio, x, antes, s, s.motivoSuspension);
    cerrarModal(); toast(MSJ.negocioSuspendido,'info'); render();
  }});
}
// ---------- Archivar antes de eliminar (P4) ----------
const fechaArchivo=iso=>new Date(iso).toLocaleDateString('es-CO', {day:'numeric', month:'short', year:'numeric'});
// "desde 8 oct 2026 · se puede borrar desde 7 nov 2026" (o "ya se puede borrar")
export function textoArchivo(n){
  if(!n || !n.archivado) return '';
  const hasta=Dominio.negocio.borrableDesde(n);
  return (n.archivadoDesde?'desde '+fechaArchivo(n.archivadoDesde)+' · ':'')
    +(Dominio.negocio.puedeBorrarse(n, Date.now())?'ya se puede borrar':(hasta?'se puede borrar desde el '+fechaArchivo(hasta):''));
}
export function archivarNegocio(id){
  if(STATE.user.rolSuper!=='dueno'){ toast(MSJ.soloElDuenoDelSistemaPuede,'error'); return; }
  const n=(DB.get('negocios')||[]).find(x=>x.id===id); if(!n || n.esDemo || n.archivado) return;
  confirmarModal('¿Archivar "'+n.nombre+'"?\n\nQueda suspendido (nadie de ese negocio podrá entrar) y pasa a la pestaña Archivados. Sus datos NO se borran y lo puedes sacar del archivo cuando quieras. Después de '+Dominio.negocio.DIAS_ARCHIVO+' días se podrá eliminar del todo (antes se baja su respaldo).', ()=>{
    const arr=DB.get('negocios')||[];
    const x=arr.find(y=>y.id===id); if(!x) return;
    const antes={activo:x.activo};
    Object.assign(x, Dominio.negocio.archivar(now()));
    DB.set('negocios', arr);
    anotarEnSistema(Dominio.sistema.ACCION.archivarNegocio, x, antes, {activo:false, archivado:true});
    STATE.tabNegocios='archivados';
    toast(MSJ.negocioArchivado,'info'); render();
  }, BOTON.archivar);
}
export function desarchivarNegocio(id){
  if(STATE.user.rolSuper!=='dueno'){ toast(MSJ.soloElDuenoDelSistemaPuede,'error'); return; }
  const arr=DB.get('negocios')||[];
  const x=arr.find(y=>y.id===id); if(!x || !x.archivado) return;
  const antes={activo:x.activo, archivado:true};
  x.activo=true;
  ['archivado','archivadoDesde','suspendidoDesde','motivoSuspension'].forEach(k=>{ delete x[k]; });
  DB.set('negocios', arr);
  anotarEnSistema(Dominio.sistema.ACCION.desarchivarNegocio, x, antes, {activo:true});
  STATE.tabNegocios=Dominio.negocio.grupoPanel(x);
  toast(MSJ.negocioSacadoDelArchivo,'success'); render();
}
// Baja el respaldo de un negocio (lo lee "Restaurar un negocio"). Promesa con el nombre del archivo.
export function respaldarNegocio(id){
  const n=(DB.get('negocios')||[]).find(x=>x.id===id)||{id};
  const corto=String(n.nombre||id).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,30)||'negocio';
  return Datos.exportarNegocio(id).then(r=>{
    if(!r || !r.datos || !r.datos.negocios_r) throw new Error('El respaldo salió vacío');
    return bajarArchivoRespaldo(r.datos, r.origen==='local' && FB_READY, 'negocio-'+corto);
  });
}
// "Eliminar": un cliente primero se archiva; archivado hace 30 días (o una demo) se borra del todo
export function eliminarNegocio(id){
  if(STATE.user.rolSuper!=='dueno'){ toast(MSJ.soloElDuenoDelSistemaPuede,'error'); return; }
  const negocios=DB.get('negocios')||[];
  const n=negocios.find(x=>x.id===id); if(!n) return;
  if(!n.esDemo && !n.archivado){ archivarNegocio(id); return; }
  if(!Dominio.negocio.puedeBorrarse(n, Date.now())){ toast('Todavía no: se puede borrar del todo desde el '+fechaArchivo(Dominio.negocio.borrableDesde(n))+'.','info'); return; }
  const nUsuarios=(DB.get('usuarios')||[]).filter(u=>u.negocioId===id).length;
  // Primera confirmación
  confirmarModal(
    '⚠️ Vas a ELIMINAR la empresa "'+n.nombre+'".\n\nSe borrarán TODOS sus datos: '+nUsuarios+' usuario(s), productos, ventas, inventario, caja e historial. Esto NO se puede deshacer.\n\n¿Continuar?',
  ()=>{
    // Segunda confirmación: escribir el nombre
    abrirModal({titulo:'Confirmar eliminación', textoBoton:BOTON.eliminarDefinitivamente, campos:[
      {id:'conf', label:'Escribe el nombre exacto de la empresa para confirmar', valor:'', requerido:true, placeholder:n.nombre}
    ], extraHTML:`<p class="nota rojo">Empresa a eliminar: <strong>${escapeHtml(n.nombre)}</strong></p>`,
    onGuardar:(d)=>{
      if((d.conf||'').trim()!==n.nombre){ toast(MSJ.elNombreNoCoincideNoSe,'error'); return; }
      // Un cliente se borra solo después de bajar su respaldo (las demos no lo necesitan)
      if(!n.esDemo){
        toast(MSJ.bajandoRespaldoDelNegocio,'info');
        respaldarNegocio(id).then(archivo=>borrarNegocioYa(n, nUsuarios, archivo))
          .catch(e=>{ reportarError('el respaldo del negocio', e); toast(MSJ.noSeBorroSinRespaldo,'error'); });
        return;
      }
      borrarNegocioYa(n, nUsuarios, '');
    }});
  },'Sí, continuar');
}
// Borra el negocio, sus usuarios, sus cuentas y todas sus tablas (después del respaldo)
function borrarNegocioYa(n, nUsuarios, archivo){
  const id=n.id;
  anotarEnSistema(Dominio.sistema.ACCION.eliminarNegocio, n, null, null, nUsuarios+' usuario(s) y todos sus datos'+(archivo?' · respaldo: '+archivo:''));
  // Borrar las cuentas de acceso de sus usuarios (antes de perder la lista)
  if(conCuentasFirebase()) borrarCuentasDeNegocio(id);
  // Borrar la empresa
  DB.set('negocios', (DB.get('negocios')||[]).filter(x=>x.id!==id));
  // Borrar sus usuarios
  DB.set('usuarios', (DB.get('usuarios')||[]).filter(u=>u.negocioId!==id));
  // Borrar TODAS sus tablas de datos (data_<id>_*), local y nube
  Datos.borrarDatosNegocio(id);
  cerrarModal();
  if(STATE.page.indexOf(':'+id)>-1) STATE.page='';   // estaba en su ficha
  toast('Empresa "'+n.nombre+'" eliminada por completo','error');
  render();
}
export function entrarComoNegocio(id){
  const neg=(DB.get('negocios')||[]).find(n=>n.id===id); if(!neg) return;
  // Seguridad: un vendedor solo puede entrar a DEMOS, nunca a negocios reales de clientes
  if(STATE.user.rolSuper==='vendedor' && !neg.esDemo){
    toast(MSJ.comoVendedorSoloPuedesEntrarA,'error'); return;
  }
  STATE.negocio=neg;
  // Recordar quién es el super-admin (para volver con su rol). Si ya supervisaba otro negocio,
  // se conserva el que había: si no, quedaría guardado el usuario "Supervisor".
  if(!STATE.modoSupervision) STATE._superUser=STATE.user;
  const yo=STATE._superUser;
  // P15: con el nombre real, para que la auditoría del negocio diga quién fue
  STATE.user={nombre:'Supervisor: '+((yo&&yo.nombre)||'—'), rol:'admin', negocioId:id, esSupervisor:true};
  STATE.esSuperAdmin=false;
  STATE.modoSupervision=true;
  STATE.sucursal=(sucursalesDe(neg)[0]||{id:'principal'}).id;
  STATE.pageNeg='inicio';
  fijarFacturaReservada(null);
  // R1: con cuentas el panel no tiene los datos del negocio: se escuchan mientras se supervisa
  // (el vendedor, después de fijar ese negocio como su negocio activo)
  // La reserva de factura escribe en el negocio: también después del negocio activo
  trabajarEn(id).then(()=>{ rastroSupervision(id, 'Entró a supervisar', yo); anotarEnSistema(Dominio.sistema.ACCION.entrarSupervision, neg); reservarFactura(); if(conCuentasFirebase()) sincronizarNegocio(id); }).catch(e=>reportarError('entrar al negocio', e));
  toast('Supervisando '+neg.nombre,'info');
  render();
}
// Entradas y salidas del super-admin quedan en la auditoría del negocio (P15).
// Va directo al negocio (no por logAudit): al salir, STATE ya no lo tiene. "yo" se toma
// al momento de la acción (la entrada se registra después de fijar el negocio activo).
export function rastroSupervision(negId, accion, superUser){
  const yo=superUser||{};
  try{
    Datos.guardarEn(negId, 'auditoria', [{id:uid(), usuario:'Supervisor: '+(yo.nombre||'—'), rol:'superadmin',
      accion, detalle:yo.rolSuper==='vendedor'?'Vendedor':(yo.rolSuper==='ayudante'?'Ayudante del sistema':'Dueño del sistema'), fecha:now()}]);
  }catch(e){ reportarError('registrar la supervisión', e); }
}
export function volverSuperAdmin(){
  if(STATE.modoSupervision && STATE.negocio){
    rastroSupervision(STATE.negocio.id, 'Salió de supervisar', STATE._superUser);
    anotarEnSistema(Dominio.sistema.ACCION.salirSupervision, STATE.negocio);
  }
  STATE.esSuperAdmin=true; STATE.modoSupervision=false;
  STATE.negocio=null; STATE.sucursal=null;
  fijarFacturaReservada(null); fijarResumenNeg(null);
  if(conCuentasFirebase()) detenerSincNegocio();
  // Restaurar el super-admin original (conserva su rolSuper: dueno/ayudante/vendedor)
  STATE.user=STATE._superUser||{nombre:'Súper Administrador', rol:'superadmin', rolSuper:'dueno'};
  STATE._superUser=null;
  STATE.page='';
  render();
}
