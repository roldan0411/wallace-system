// ============================================================
//  INTERFAZ · Arranque de la interfaz
//  iniciarInterfaz (la llama src/arranque.js), datos iniciales y relojes.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/-00-execution-protocol/-00-execution-protocol.md
// ============================================================
import { STATE, now, refrescarSiSePuede } from './estado.js';
import { reportarError, toast } from './componentes.js';
import { render } from './navegacion.js';
import { borrarPerfilLocal, conCuentasFirebase, conTiempo, entrarConPerfil, fijarConfigInicial, leerPerfilLocal, migrarContrasenas, servicioSesion } from '../usuarios/sesion.js';
import { publicarResumen } from '../reportes/resumen.js';


// ============================================================
//  DATOS INICIALES (solo si la nube ya respondió)
// ============================================================
export function seed(){
  // Con cuentas de Firebase las tablas globales no se descargan antes del login:
  // su formato y sus contraseñas los maneja la migración (entrarConPerfil).
  if(conCuentasFirebase()) return;
  if(FB_READY && !NUBE_LISTA){ console.warn('seed omitido: la nube no ha respondido'); return; }
  // El primer super-admin ya NO se crea con una contraseña escrita en el código
  // (este archivo lo puede leer cualquiera). Si no hay ninguno, render() muestra
  // la pantalla de configuración inicial para que el dueño cree el suyo.
  // Con la nube configurada pero sin leerse bien, no se toca nada: así un
  // fallo de red no termina sobrescribiendo las tablas reales.
  if(FB_READY && !GLOBALES_LEIDAS){ console.warn('seed parcial: las tablas globales no se leyeron de la nube'); return; }
  try{ migrarContrasenas(); }catch(e){ console.error('migrarContrasenas',e); }
  if(!DB.get('negocios')) DB.set('negocios',[]);
  // Negocios viejos sin fecha de creación: se les pone la de hoy una sola vez
  try{
    const ns=DB.get('negocios')||[]; let cambio=false;
    ns.forEach(n=>{ if(!n.creado){ n.creado=now(); cambio=true; } });
    if(cambio) DB.set('negocios',ns);
  }catch(e){}
  if(!DB.get('usuarios')) DB.set('usuarios',[]);
}

// ============================================================
//  ARRANQUE
// ============================================================
export function arrancar(){
  try{ seed(); }catch(e){ console.error('seed',e); }
  try{ render(); }catch(e){
    console.error('render',e);
    const app=document.getElementById('app');
    if(app) app.innerHTML='<div class="p-40 txt-centro color-fff">Error al cargar. Recarga con Ctrl+Shift+R.</div>';
  }
}
// Arranque de la interfaz: lo llama src/arranque.js cuando el puente ya está listo
// C2: los errores que nadie atrapó (una promesa sin .catch, un manejador directo) también quedan
// registrados. Solo los de la app (src/): los de Firebase o de extensiones del navegador no.
export let _erroresGlobales=false;
export function vigilarErroresGlobales(){
  if(_erroresGlobales || typeof window==='undefined') return;
  _erroresGlobales=true;
  window.addEventListener('error', alErrorGlobal);
  window.addEventListener('unhandledrejection', alRechazoGlobal);
}
const esNuestro=t=>/\/src\//.test(String(t||''));
export function alErrorGlobal(ev){ if(esNuestro(ev && ev.filename) || esNuestro(ev && ev.error && ev.error.stack)) reportarError('la pantalla', ev.error||ev.message); }
export function alRechazoGlobal(ev){ const r=ev && ev.reason; if(esNuestro(r && r.stack)) reportarError('una operación', r); }
export function iniciarInterfaz(){
  vigilarErroresGlobales();
  const ok=Datos.iniciar();
  if(ok && Cuentas.iniciar()){
    // S1: nada de tablas globales antes del login. Firebase dice si hay una sesión guardada.
    Datos.configurarSesion({cuentas:true});
    Datos.estado.nubeLista=true;
    const app=document.getElementById('app');
    if(app) app.innerHTML='<div class="cargando"><div class="spin"></div><div>Conectando…</div></div>';
    let listo=false;
    const seguir=c=>{ if(listo) return; listo=true; clearTimeout(forzar); arrancarCuentas(c); };
    const forzar=setTimeout(()=>{ console.warn('Firebase Auth no respondió'); seguir(null); }, 12000);
    Cuentas.alCambiarSesion(c=>seguir(c));   // solo cuenta el primer aviso (el login hace lo suyo)
    return;
  }
  if(ok){
    console.warn('Sin Firebase Authentication (¿no cargó el SDK modular? ver firebase-sdk.js): inicio de sesión del esquema viejo');
    const app=document.getElementById('app');
    if(app) app.innerHTML='<div class="cargando"><div class="spin"></div><div>Conectando…</div></div>';
    let listo=false;
    const forzar=setTimeout(()=>{ if(!listo){ listo=true; console.warn('Nube lenta: modo local'); arrancar(); } }, 12000);
    Datos.cargarGlobales(()=>{ if(!listo){ listo=true; clearTimeout(forzar); arrancar(); } });
  } else {
    Datos.estado.nubeLista=true;
    arrancar();
  }
}
// Arranque con cuentas: sesión guardada → perfil (o el guardado en el equipo si no hay internet)
export async function arrancarCuentas(cuenta){
  if(cuenta){
    const r=await conTiempo(servicioSesion().restaurar(cuenta.uid), 8000, {ok:false, motivo:'red'});
    let perfil=r.ok?r.perfil:null;
    if(!r.ok && r.motivo==='red'){
      const loc=leerPerfilLocal();
      if(loc && loc.uid===cuenta.uid) perfil=loc.perfil;
    }
    if(perfil){
      try{ await entrarConPerfil(cuenta.uid, perfil); }
      catch(e){ reportarError('entrar con la sesión guardada', e); render(); }
      return;
    }
    if(!r.ok && r.motivo!=='red') toast(ServicioSesion.mensajeDeFallo(r.motivo),'error');
  }
  borrarPerfilLocal();
  fijarConfigInicial(await conTiempo(Cuentas.necesitaDueno(), 8000, false));
  arrancar();
}
setInterval(function(){
  const r=document.getElementById('reloj');
  if(r) r.textContent=new Date().toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
},1000);
// R1: cada 20 s, si cambiaron las ventas, se publica el resumen para el panel del super-admin
setInterval(function(){ try{ publicarResumen(); }catch(e){} }, 20000);
// Refrescar la cocina cada 30s para que el cronómetro avance solo
setInterval(function(){
  if(STATE.user && !STATE.esSuperAdmin && STATE.pageNeg==='cocina'){
    try{ refrescarSiSePuede(); }catch(e){}
  }
},30000);
