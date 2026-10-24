// ============================================================
//  ARRANQUE (raíz de composición)
//  Único lugar que conoce todas las piezas y las conecta:
//   1. elige la base por dominio (firebase-config.js), carga el SDK modular de Firebase
//      y crea los adaptadores de salida (almacenamiento local, Firebase, cuentas, cripto)
//   2. verifica que los adaptadores cumplan sus puertos
//   3. crea los servicios de aplicación (inicio de sesión)
//   4. publica todo para la interfaz (puente de migración)
//   5. importa la interfaz (adaptador de entrada, módulos de ui/manifiesto.js) y la inicia
//  Es el equivalente al "endpoint" del documento de arquitectura hexagonal.
// ============================================================
import * as fechas from './dominio/fechas.js';
import * as pagos from './dominio/pagos.js';
import * as caja from './dominio/caja.js';
import * as inventario from './dominio/inventario.js';
import * as facturas from './dominio/facturas.js';
import * as contrasenas from './dominio/contrasenas.js';
import * as cuentas from './dominio/cuentas.js';
import * as permisos from './dominio/permisos.js';
import * as negocio from './dominio/negocio.js';
import * as gastos from './dominio/gastos.js';
import * as ventas from './dominio/ventas.js';
import * as prueba from './dominio/prueba.js';
import * as ejemplos from './dominio/ejemplos.js';
import * as sistema from './dominio/sistema.js';
import { verificarPuertoDatos } from './aplicacion/puertos/datos.js';
import { verificarPuertoCuentas } from './aplicacion/puertos/cuentas.js';
import { crearServicioSesion, mensajeDeFallo } from './aplicacion/servicios/sesion.js';
import { crearServicioPruebas } from './aplicacion/servicios/pruebas.js';
import { crearAlmacenLocal } from './adaptadores/salida/almacen-local.js';
import { crearAdaptadorFirebase } from './adaptadores/salida/firebase-datos.js';
import { crearAdaptadorCuentas } from './adaptadores/salida/firebase-cuentas.js';
import * as cripto from './adaptadores/salida/cripto-navegador.js';
import { instalarPuente } from './adaptadores/entrada/ui/puente-legado.js';
import { cargarSdkFirebase } from './adaptadores/salida/firebase-sdk.js';
import { elegirEntorno } from '../firebase-config.js';

// Qué base usar según el dominio (firebase-config.js). El SDK de Firebase solo se
// descarga si hay nube: en modo local la app arranca sin internet.
const entorno=elegirEntorno(window.location);
const sdk=entorno.config ? await cargarSdkFirebase() : null;

// La interfaz se importa DESPUÉS de instalar el puente (usa sus nombres): ver el final
let ui=null;   // espacio de nombres de la interfaz (ui/manifiesto.js → cargarInterfaz)

// Los "ganchos" son cómo el adaptador de datos avisa a la interfaz sin conocerla.
// Hasta que la interfaz cargue no hacen nada (los datos pueden llegar antes).
const ganchos={
  negocioActual: ()=> (ui && ui.STATE.negocio) || null,
  alCambiar: ()=> { if(ui) ui.refrescarSiSePuede(); },
  alRegistroNuevo: (t,v,o)=> { if(ui) ui.registroNuevoDeNube(t,v,o); },
  alCambiarTabla: (t,v,antes,o)=> { if(ui) ui.tablaCambioDeNube(t,v,antes,o); },
  soloLectura: n=> !!(ui && ui.negocioSoloLectura(n)),
  alEscrituraNegada: x=> { if(ui) ui.escrituraNegada(x); },
  alCambiarNegocio: n=> { if(ui) ui.negocioCambiado(n); },
  alEstadoConexion: e=> { if(ui) ui.mostrarConexion(e); },
  alCargarTabla: t=> {
    if(t!=='ventas' || !ui) return;
    ui.reservarFactura();
    ui.ventasCargadas();
  }
};

const datos=verificarPuertoDatos(crearAdaptadorFirebase({
  local: crearAlmacenLocal(window.localStorage, 'ws_'),
  sdk,
  config: entorno.config,
  emuladores: entorno.emuladores,
  entorno: entorno.entorno,
  ganchos
}));

const adaptadorCuentas=verificarPuertoCuentas(crearAdaptadorCuentas({
  sdk,
  config: entorno.config,
  emuladores: entorno.emuladores,
  cuentas,
  aleatorio: cripto.nuevaSal
}));

const dominio={fechas, pagos, caja, inventario, facturas, contrasenas, cuentas, permisos, negocio, gastos, ventas, prueba, ejemplos, sistema};

// Periodo de prueba (sin pantalla todavía): casos de uso sobre el puerto de datos
const pruebas=crearServicioPruebas({datos, dominio, usuario:()=>(ui && ui.STATE.user)||null, nuevoId:cripto.nuevoId});

const crearSesion=()=>crearServicioSesion({
  cuentas: adaptadorCuentas,
  dominio,
  leerUsuarioNegocio: (negId, id)=>datos.leerRegistro(negId, 'usuarios', id),
  // Tras migrar: el empleado sale de data/usuarios; al super-admin se le borra el hash de su registro
  retirarClaveVieja: ({tipo, id})=> tipo==='super'
    ? datos.transaccionGlobal('superadmins', cur=>{
        if(cur===null) return null;   // Firebase reintenta con el valor real
        const l=Array.isArray(cur)?cur:Object.values(cur);
        const x=l.find(s=>s && s.id===id); if(!x) return;
        cuentas.CAMPOS_PASS.forEach(k=>{ delete x[k]; });
        return l;
      })
    : datos.modificarUsuariosLegado(l=>{ const f=l.filter(x=>x.id!==id); return f.length===l.length?undefined:f; }),
  pantallasPorRol: permisos.PANTALLAS_POR_ROL
});

instalarPuente(window, {
  datos,
  cuentas: adaptadorCuentas,
  sesion: {crear: crearSesion, mensajeDeFallo},
  dominio,
  cripto,
  pruebas
});

// La interfaz son módulos ES (ui/manifiesto.js los importa todos). Se importa
// aquí, ya con el puente instalado. window.WS = sus nombres, para la consola y las pruebas.
import('./adaptadores/entrada/ui/manifiesto.js')
  .then(m=>m.cargarInterfaz())
  .then(espacio=>{ ui=espacio; window.WS=espacio; return ui.iniciarInterfaz(); })
  .catch(e=>{
    console.error('No cargó la interfaz:', e && (e.stack || e.message));
    const app=document.getElementById('app');
    if(app) app.innerHTML='<div style="padding:40px;text-align:center;color:#fff;">No se pudo cargar la aplicación. Recarga con Ctrl+Shift+R.</div>';
  });
