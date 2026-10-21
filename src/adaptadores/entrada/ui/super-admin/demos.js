// ============================================================
//  INTERFAZ · Negocios de demostración
//  Crear y borrar demos. Los datos de ejemplo (18 plantillas) y cómo se arma
//  una demo con sus ventas están en el dominio (src/dominio/ejemplos.js);
//  aquí solo se pide el tipo, se guarda registro por registro y se muestra el
//  acceso. Cada demo tiene contraseña propia al azar y vence en 15 días
//  (queda en solo lectura: dominio/prueba.js y database.rules.json).
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/01-super-admin-panel/01-super-admin-panel.md
// ============================================================
import { STATE, escapeHtml } from '../nucleo/estado.js';
import { BOTON, MSJ } from '../nucleo/textos.js';
import { abrirModal, cerrarModal, confirmarModal, reportarError, toast } from '../nucleo/componentes.js';
import { render } from '../nucleo/navegacion.js';
import { conCuentasFirebase, mensajeCuenta, ponerPass } from '../usuarios/sesion.js';
import { borrarCuentasDeNegocio, crearCuentaPara, ponerUidUsuario, trabajarEn } from '../usuarios/cuentas.js';

// Las plantillas viven en el dominio; el nombre se conserva para las pruebas y la consola
export const DEMO_PLANTILLAS = Dominio.ejemplos.PLANTILLAS;

export function crearNegocioDemo(){
  if(!Dominio.prueba.puedeGestionarAlta(STATE.user, null)){ toast(MSJ.noTienesPermiso,'error'); return; }
  abrirModal({titulo:'Crear negocio de demostración', textoBoton:BOTON.crearDemo, campos:[
    {id:'tipo', label:'¿Qué tipo de negocio quieres mostrar?', tipo:'select',
      opciones:Object.keys(DEMO_PLANTILLAS).map(t=>({valor:t,label:DEMO_PLANTILLAS[t].sufijo+' ('+t+')'}))}
  ], extraHTML:`<p class="nota">Se creará un negocio <strong>ya lleno</strong>: con productos, clientes y <strong>ventas de los últimos 10 días</strong> (para que las gráficas de seguimiento se vean llenas). Vence en ${Dominio.prueba.DIAS_DEMO} días.</p>
    <button type="button" class="btn btn-ghost btn-block btn-sm mt-10" data-click="crearVariosDemos()">⚡ O crea 5 negocios demo variados de una vez</button>`,
  onGuardar:(d)=>{
    const acceso=crearDemoDeTipo(d.tipo, false);
    if(!acceso){ toast(MSJ.plantillaNoEncontrada,'error'); return; }
    cerrarModal(); render(); mostrarAccesosDemo([acceso]);
  }});
}
// Crea 5 demos variados de golpe (para llenar el panel rápido)
export function crearVariosDemos(){
  if(!Dominio.prueba.puedeGestionarAlta(STATE.user, null)){ toast(MSJ.noTienesPermiso,'error'); return; }
  const surtido=['Restaurante','Tienda / Accesorios','Barbería / Salón','Cafetería','Tecnología / Celulares'];
  const accesos=surtido.map(t=>crearDemoDeTipo(t,false)).filter(Boolean);
  cerrarModal(); render();
  mostrarAccesosDemo(accesos);
}
// La contraseña es al azar y no se guarda en ningún lado legible: se muestra UNA vez
export function mostrarAccesosDemo(accesos){
  if(!accesos.length) return;
  const filas=accesos.map(a=>'<tr><td>'+escapeHtml(a.negocio)+'</td><td><strong>'+escapeHtml(a.usuario)+'</strong></td><td><strong>'+escapeHtml(a.clave)+'</strong></td></tr>').join('');
  abrirModal({titulo:accesos.length>1?'Demos creados':'Demo creado', textoBoton:BOTON.listo, campos:[],
    extraHTML:'<p class="nota">Anota el acceso para dárselo al cliente: <strong>la contraseña no se vuelve a mostrar</strong>. Vence en '+Dominio.prueba.DIAS_DEMO+' días.</p>'
      +'<table class="tabla"><thead><tr><th>Demo</th><th>Usuario</th><th>Contraseña</th></tr></thead><tbody>'+filas+'</tbody></table>',
    onGuardar:()=>cerrarModal()});
}
// Crea un demo completo. Devuelve {negocio, usuario, clave} (o null si la plantilla no existe).
// cerrarYMostrar: además cierra el modal y muestra el acceso.
export function crearDemoDeTipo(tipoDemo, cerrarYMostrar){
  const plant=DEMO_PLANTILLAS[tipoDemo]; if(!plant) return null;
  const perfil=Dominio.negocio.PERFILES[plant.tipo]||Dominio.negocio.PERFILES['Otro'];
  // Usuario único: demo, demo2, demo3...
  const usuarios=DB.get('usuarios')||[], sadmins=DB.get('superadmins')||[];
  let usuario='demo', k=1;
  while(usuarios.some(u=>u.usuario===usuario)||sadmins.some(s=>s.usuario===usuario)){ k++; usuario='demo'+k; }
  // El vendedor no ve los usuarios de los demás (reglas): nombre al azar para no chocar en el índice de login
  if(conCuentasFirebase() && STATE.user && STATE.user.rolSuper==='vendedor') usuario='demo-'+Cripto.claveAleatoria(5).toLowerCase();
  const d=Dominio.ejemplos.armarDemo(plant, perfil, {ahoraMs:Date.now(), azar:Math.random, nuevoId:uid,
    usuario, demoDe:(STATE.user&&STATE.user.id)||null});
  const negId=d.negocio.id;
  DB.set('negocios', (DB.get('negocios')||[]).concat([d.negocio]));
  trabajarEn(negId).catch(e=>reportarError('el demo nuevo', e));   // vendedor: sus tablas (va en orden antes de escribirlas)
  // Administrador del demo, con contraseña propia al azar
  const clave=Cripto.claveAleatoria(10);
  if(conCuentasFirebase()){
    crearCuentaPara(d.admin, clave, false).then(c=>ponerUidUsuario(d.admin.id, c.uid))
      .catch(e=>toast('Demo creado, pero su usuario no pudo activarse: '+mensajeCuenta(e),'error'));
  } else ponerPass(d.admin, clave);
  DB.set('usuarios', usuarios.concat([d.admin]));
  // Registro por registro (como el resto de la app): sin tablas en formato viejo ni copias _bk
  Datos.guardarEn(negId, 'productos', d.productos);
  Datos.guardarEn(negId, 'clientes', d.clientes);
  Datos.guardarEn(negId, 'caja_actual', d.cajaActual);
  Datos.guardarEn(negId, 'ventas', d.ventas);
  Datos.guardarEn(negId, 'movimientos', d.movimientos);
  const acceso={negocio:d.negocio.nombre, usuario, clave};
  if(cerrarYMostrar){ cerrarModal(); render(); mostrarAccesosDemo([acceso]); }
  return acceso;
}
// Un vendedor (o admin) borra un demo. Solo permite borrar DEMOS, nunca negocios reales.
export function eliminarDemoVendedor(id){
  const negocios=DB.get('negocios')||[];
  const n=negocios.find(x=>x.id===id); if(!n) return;
  if(!n.esDemo){ toast(MSJ.soloSePuedenBorrarNegociosDe,'error'); return; }
  // Dueño y ayudante, cualquiera; un vendedor solo los suyos (dominio/prueba.js)
  if(!Dominio.prueba.puedeGestionarAlta(STATE.user, n)){ toast(MSJ.esteDemoNoEsTuyo,'error'); return; }
  confirmarModal('¿Borrar el demo "'+n.nombre+'"? Se eliminan sus datos de ejemplo. Esto no afecta a ningún cliente real.',async ()=>{
    try{
      // En orden: el negocio se borra al final (las reglas del vendedor lo necesitan para borrar lo demás)
      if(conCuentasFirebase()){
        await trabajarEn(id);
        if(FB_READY) await Datos.leerNegocioCompleto(id);   // sus usuarios, para borrar sus cuentas
        await borrarCuentasDeNegocio(id);
      }
      DB.set('usuarios', (DB.get('usuarios')||[]).filter(u=>u.negocioId!==id));
      // Se usan las MISMAS tablas del sistema (antes había una copia local que
      // quedaba desactualizada al agregar tablas nuevas).
      Datos.borrarDatosNegocio(id);
      DB.set('negocios', (DB.get('negocios')||[]).filter(x=>x.id!==id));
      toast('Demo "'+n.nombre+'" borrado','info');
    }catch(e){ reportarError('borrar el demo', e); }
    render();
  },'Borrar demo');
}
