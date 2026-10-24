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


// ---------- Crear negocio ----------
export function nuevoNegocio(){
  // El vendedor solo crea negocios a prueba y quedan a su nombre (Dominio.prueba.puedeGestionarAlta)
  const vendedor=!!(STATE.user&&STATE.user.rolSuper==='vendedor');
  if(!Dominio.prueba.puedeGestionarAlta(STATE.user, null)){ toast(MSJ.noTienesPermisoParaCrearNegocios,'error'); return; }
  abrirModal({titulo:'Crear negocio', textoBoton:BOTON.crear, campos:[
    {id:'nombre', label:'Nombre del negocio', requerido:true, placeholder:'Ej: MANILLASNET'},
    {id:'tipo', label:'Tipo de negocio', tipo:'select', opciones:Object.keys(PERFILES).map(t=>({valor:t,label:t}))},
    {id:'ciudad', label:'Ciudad'},
    {id:'plan', label:'Plan', tipo:'select', opciones:[...PLANES.map(x=>({valor:x,label:x}))]},
    {id:'precio', label:'Precio mensual', tipo:'number', valor:'149900'},
    {id:'usuario', label:'Usuario del administrador', requerido:true, placeholder:'admin'},
    vendedor?null:{id:'vendedor', label:'Vendedor a cargo', tipo:'select',
      opciones:[{valor:'',label:'— Sin asignar —'}].concat((DB.get('superadmins')||[]).map(v=>({valor:v.id,label:v.nombre})))}
  ].filter(Boolean), extraHTML:camposPruebaHTML(vendedor)+`<div class="m-row"><label>¿Cómo cobra este negocio?</label>
      <select id="m-flujo">
        <option value="directo">Cobro directo (tienda: se cobra al instante)</option>
        <option value="dos_pasos">Confirmar y luego cobrar (restaurante: se toma el pedido y se cobra después)</option>
      </select>
      <p class="nota">Esto se puede cambiar después en Configurar.</p>
    </div>
    <p class="nota">La contraseña del administrador se crea al azar y se muestra una sola vez al terminar.</p>`,
  onGuardar:(d)=>{
    if(vendedor) d.vendedor=STATE.user.id;
    const prueba=leerCamposPrueba();
    if(vendedor && !prueba){ toast(MSJ.comoVendedorElNegocioQuedaA,'error'); return; }
    if(!diasPruebaValidos(prueba)){ toast('Los días de prueba deben ser de 1 a '+Dominio.prueba.MAX_DIAS,'error'); return; }
    const perfil=JSON.parse(JSON.stringify(PERFILES[d.tipo]||PERFILES['Otro']));
    const flujo=(document.getElementById('m-flujo')||{}).value||perfil.flujoPedido;
    d.usuario=(d.usuario||'').trim();
    if(!Dominio.cuentas.usuarioValido(d.usuario)){ toast(MSJ.usuarioInvalido,'error'); return; }   // V4
    const igual=x=>Dominio.cuentas.mismoUsuario(x.usuario, d.usuario);
    const existe=(DB.get('usuarios')||[]).some(igual) || (DB.get('superadmins')||[]).some(igual);
    if(existe){ toast(MSJ.eseUsuarioYaExiste,'error'); return; }
    const negId=uid();
    const negocio={
      id:negId, nombre:d.nombre, tipo:d.tipo, ciudad:d.ciudad||'',
      plan:d.plan, precioMes:Math.max(0, parseInt(d.precio)||0), activo:true,
      logo:'', nit:'', tel:'', dir:'', eslogan:'',
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
    if(vendedor) negocio.vendedorNombre=STATE.user.nombre||'';
    const admin={id:uid(), negocioId:negId, nombre:'Administrador', usuario:d.usuario, rol:'admin', activo:true, creado:now()};
    // P1: clave al azar (antes todos nacían con la misma); con cuentas, la cambia al primer ingreso
    const clave=Cripto.claveAleatoria(10);
    const guardarNegocio=()=>{ const negocios=DB.get('negocios')||[]; negocios.push(negocio); DB.set('negocios',negocios); };
    const guardarAdmin=()=>{
      const usuarios=DB.get('usuarios')||[]; usuarios.push(admin); DB.set('usuarios',usuarios);
      cerrarModal();
      toast('Negocio creado: '+d.nombre,'success');
      iniciarPruebaDe(negId, prueba);
      render();
      mostrarAccesoNegocio(d.nombre, d.usuario, clave);
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
export function mostrarAccesoNegocio(nombre, usuario, clave){
  abrirModal({titulo:'Negocio creado', textoBoton:BOTON.listo, campos:[],
    extraHTML:`<p class="fs-15 lh-1_6">${escapeHtml(nombre)}<br>Usuario: <strong>${escapeHtml(usuario)}</strong><br>Contraseña: <strong id="pass-inicial" class="fs-19">${escapeHtml(clave)}</strong></p>
      <p class="nota">Anótala para dársela al cliente: <strong>no se vuelve a mostrar</strong>.${conCuentasFirebase()?' Al entrar por primera vez deberá elegir una nueva.':''}</p>`,
    onGuardar:()=>cerrarModal()});
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
    x.vendedorId=d.vend||null;
    const v=sas.find(y=>y.id===x.vendedorId);
    x.vendedorNombre=v?v.nombre:'';
    x.notasComerciales=d.notas||'';
    DB.set('negocios',arr);
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
  // P3: suspender un cliente pide motivo; activar no pide nada. Las demos se pausan sin motivo.
  if(n.activo && !n.esDemo){ suspenderNegocio(id); return; }
  n.activo=!n.activo;
  delete n.suspendidoDesde; delete n.motivoSuspension;
  DB.set('negocios',negocios);
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
    Object.assign(x, s);
    DB.set('negocios',arr);
    cerrarModal(); toast(MSJ.negocioSuspendido,'info'); render();
  }});
}
export function eliminarNegocio(id){
  if(STATE.user.rolSuper!=='dueno'){ toast(MSJ.soloElDuenoDelSistemaPuede,'error'); return; }
  const negocios=DB.get('negocios')||[];
  const n=negocios.find(x=>x.id===id); if(!n) return;
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
      // Borrar las cuentas de acceso de sus usuarios (antes de perder la lista)
      if(conCuentasFirebase()) borrarCuentasDeNegocio(id);
      // Borrar la empresa
      DB.set('negocios', (DB.get('negocios')||[]).filter(x=>x.id!==id));
      // Borrar sus usuarios
      DB.set('usuarios', (DB.get('usuarios')||[]).filter(u=>u.negocioId!==id));
      // Borrar TODAS sus tablas de datos (data_<id>_*), local y nube
      Datos.borrarDatosNegocio(id);
      cerrarModal();
      toast('Empresa "'+n.nombre+'" eliminada por completo','error');
      render();
    }});
  },'Sí, continuar');
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
  trabajarEn(id).then(()=>{ rastroSupervision(id, 'Entró a supervisar', yo); reservarFactura(); if(conCuentasFirebase()) sincronizarNegocio(id); }).catch(e=>reportarError('entrar al negocio', e));
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
  if(STATE.modoSupervision && STATE.negocio) rastroSupervision(STATE.negocio.id, 'Salió de supervisar', STATE._superUser);
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
