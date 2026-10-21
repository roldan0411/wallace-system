// ============================================================
//  ADAPTADOR DE SALIDA · Cuentas con Firebase Authentication (S1, Plan B)
//  Implementa el PuertoCuentas (aplicacion/puertos/cuentas.js).
//
//   · La contraseña la verifica Firebase en sus servidores (correo interno).
//   · login/<claveUsuario> = {correo, uid}: con qué cuenta entra cada usuario.
//   · perfiles/<uid>: negocio, rol y permisos. Es lo que leen las reglas
//     (database.rules.json) para decidir qué datos entrega la base.
//   · Crear cuentas de OTROS sin cerrar la sesión propia: instancia
//     secundaria de Firebase ("altas") sin persistencia.
//
//  Debe iniciarse DESPUÉS del adaptador de datos (que crea la app de Firebase).
// ============================================================
import { ERRORES_CUENTA } from '../../aplicacion/puertos/cuentas.js';

const ESPERA_RED_MS=12000;

/**
 * @param {Object} opc
 * @param {Object} [opc.sdk]       SDK MODULAR de Firebase: {app, auth, database} (firebase-sdk.js en el
 *                                 navegador; los paquetes firebase/* en las pruebas)
 * @param {Object} [opc.config]    configuración de Firebase (firebase-config.js → elegirEntorno)
 * @param {Object} opc.cuentas     dominio/cuentas.js
 * @param {() => string} opc.aleatorio  texto aleatorio (adaptador de cripto)
 * @param {Object} [opc.emuladores]  {auth:'host:puerto'} para desarrollo local
 */
export function crearAdaptadorCuentas(opc){
  const S=opc.sdk, dom=opc.cuentas;
  let auth=null, db=null, A=null, D=null;   // A, D = funciones de firebase/auth y firebase/database
  let authAltas=null;                       // sesión aparte para crear cuentas de otros

  function traducir(e){
    const c=(e&&(e.code||e.codigo))||'';
    const m=String((e&&e.message)||'').toLowerCase();
    let codigo=ERRORES_CUENTA.OTRO;
    if(['auth/wrong-password','auth/user-not-found','auth/invalid-credential','auth/invalid-login-credentials',
        'auth/invalid-email','auth/user-disabled'].indexOf(c)>-1) codigo=ERRORES_CUENTA.CREDENCIALES;
    else if(c==='auth/network-request-failed' || c==='red') codigo=ERRORES_CUENTA.RED;
    else if(c==='auth/too-many-requests') codigo=ERRORES_CUENTA.DEMASIADOS;
    else if(c==='auth/weak-password') codigo=ERRORES_CUENTA.PASS_DEBIL;
    else if(c==='auth/requires-recent-login') codigo=ERRORES_CUENTA.REAUTENTICAR;
    else if(c==='auth/email-already-in-use') codigo=ERRORES_CUENTA.CORREO_EN_USO;
    // Authentication sin activar en la consola, o sin el método correo/contraseña
    else if(c==='auth/configuration-not-found' || c==='auth/operation-not-allowed'
      || m.indexOf('configuration_not_found')>-1 || m.indexOf('operation_not_allowed')>-1) codigo=ERRORES_CUENTA.AUTH_DESACTIVADO;
    else if(c==='PERMISSION_DENIED' || m.indexOf('permission_denied')>-1 || m.indexOf('permission denied')>-1) codigo=ERRORES_CUENTA.PERMISO;
    const err=new Error((e&&e.message)||codigo);
    err.codigo=codigo; err.original=e;
    return err;
  }
  // Una lectura sin internet puede quedarse esperando para siempre: se corta.
  function conEspera(promesa){
    let t;
    return Promise.race([promesa, new Promise((_,rej)=>{ t=setTimeout(()=>rej({code:'red', message:'Sin respuesta de la nube'}), ESPERA_RED_MS); })])
      .then(v=>{ clearTimeout(t); return v; }, e=>{ clearTimeout(t); throw traducir(e); });
  }
  const nodo=ruta=>ruta ? D.ref(db, ruta) : D.ref(db);
  const leer=ruta=>conEspera(D.get(nodo(ruta))).then(s=>s.val());
  const correoNuevo=()=>dom.correoInterno(opc.aleatorio());

  function iniciar(){
    try{
      // La app de Firebase la crea el adaptador de datos (se inicia antes)
      if(!S || !S.app || !S.auth || !S.database || !S.app.getApps().length) return false;
      A=S.auth; D=S.database;
      const app=S.app.getApp();
      auth=A.getAuth(app); db=D.getDatabase(app);
      usarEmulador(auth);
      return true;
    }catch(e){ console.error('Firebase Auth no disponible:',e); auth=null; db=null; A=null; D=null; return false; }
  }
  const disponible=()=>!!auth;
  function usarEmulador(a){
    if(opc.emuladores && opc.emuladores.auth) A.connectAuthEmulator(a, 'http://'+opc.emuladores.auth, {disableWarnings:true});
  }

  function alCambiarSesion(cb){
    A.onAuthStateChanged(auth, u=>cb(u?{uid:u.uid}:null));
  }
  function buscarLogin(usuario){
    const clave=dom.claveUsuario(usuario);
    if(!clave) return Promise.resolve(null);
    return leer('login/'+clave).then(v=>(v&&v.correo&&v.uid)?v:null);
  }
  function entrar(correo, pass){
    return conEspera(A.signInWithEmailAndPassword(auth, correo, pass)).then(c=>({uid:c.user.uid}));
  }
  function salir(){ return auth ? A.signOut(auth).catch(()=>{}) : Promise.resolve(); }
  function leerPerfil(uid){ return leer('perfiles/'+uid); }
  function escucharPerfil(uid, cb){
    const quitar=D.onValue(nodo('perfiles/'+uid), s=>cb(s.val()), ()=>cb(null));   // permiso negado = sin perfil
    return ()=>{ try{ quitar(); }catch(e){} };
  }

  // Cuenta del propio usuario (migración): queda con la sesión iniciada
  function crearCuentaPropia(pass){
    const correo=correoNuevo();
    return conEspera(A.createUserWithEmailAndPassword(auth, correo, pass)).then(c=>({uid:c.user.uid, correo}));
  }
  // Cuenta de otra persona: instancia secundaria, sin cerrar la sesión del super-admin.
  // Sesión solo en memoria: nunca se guarda en el navegador ni toca la del super-admin.
  function sesionAltas(){
    if(authAltas) return authAltas;
    const ya=S.app.getApps().find(a=>a.name==='altas');
    if(ya){ authAltas=A.getAuth(ya); return authAltas; }
    authAltas=A.initializeAuth(S.app.initializeApp(opc.config, 'altas'), {persistence:A.inMemoryPersistence});
    usarEmulador(authAltas);
    return authAltas;
  }
  // Una alta a la vez: la instancia secundaria tiene una sola sesión (p. ej. "crear 5 demos")
  let colaAltas=Promise.resolve();
  function crearCuentaAjena(pass){
    const tarea=colaAltas.then(()=>{
      const a=sesionAltas(), correo=correoNuevo();
      return conEspera(A.createUserWithEmailAndPassword(a, correo, pass)
        .then(c=>{ const uid=c.user.uid; return A.signOut(a).then(()=>({uid, correo})); }));
    });
    colaAltas=tarea.catch(()=>{});
    return tarea;
  }

  // Escribe perfil + índice (+ rutas extra, relativas a la raíz) en una sola operación
  function guardarCuenta(d){
    const u={};
    u['perfiles/'+d.uid]=JSON.parse(JSON.stringify(d.perfil));
    u['login/'+dom.claveUsuario(d.usuario)]={correo:d.correo, uid:d.uid};
    Object.assign(u, d.extra||{});
    return conEspera(D.update(nodo(), u));
  }
  function borrarCuenta(d){
    const u={};
    if(d.uid) u['perfiles/'+d.uid]=null;
    const clave=dom.claveUsuario(d.usuario);
    // El índice solo se borra si apunta a esta cuenta (no a una que la reemplazó)
    const pre=clave ? buscarLogin(d.usuario).catch(()=>null) : Promise.resolve(null);
    return pre.then(ent=>{
      if(clave && ent && (!d.uid || ent.uid===d.uid)) u['login/'+clave]=null;
      Object.assign(u, d.extra||{});
      if(!Object.keys(u).length) return;
      return conEspera(D.update(nodo(), u));
    });
  }
  function actualizarPerfil(uid, campos, renombrar){
    const u={};
    Object.keys(campos||{}).forEach(k=>{ u['perfiles/'+uid+'/'+k]=campos[k]===undefined?null:JSON.parse(JSON.stringify(campos[k])); });
    if(renombrar && renombrar.antes!==renombrar.despues){
      u['login/'+dom.claveUsuario(renombrar.antes)]=null;
      u['login/'+dom.claveUsuario(renombrar.despues)]={correo:renombrar.correo, uid};
    }
    if(!Object.keys(u).length) return Promise.resolve();
    return conEspera(D.update(nodo(), u));
  }
  function cambiarMiPass(actual, nueva){
    const yo=auth.currentUser;
    if(!yo) return Promise.reject(traducir({code:'auth/requires-recent-login'}));
    const cred=A.EmailAuthProvider.credential(yo.email, actual);
    return conEspera(A.reauthenticateWithCredential(yo, cred).then(()=>A.updatePassword(yo, nueva)));
  }

  // Super-admin vendedor: las reglas le dejan usar las tablas de UN negocio suyo a la vez,
  // el que diga perfiles/<uid>/negocioActivo (y solo si ese negocio es suyo)
  function fijarNegocioActivo(negId){
    const yo=auth && auth.currentUser;
    if(!yo) return Promise.reject(traducir({code:'auth/requires-recent-login'}));
    return conEspera(D.set(nodo('perfiles/'+yo.uid+'/negocioActivo'), negId||null));
  }
  // ---------- "Olvidé mi contraseña" (recuperar-contrasena.md) ----------
  // Sin sesión: las reglas solo la dejan crear para un usuario que existe, una por hora, con la hora del servidor
  function pedirRecuperacion(sol){
    return conEspera(D.set(nodo('recuperaciones/'+sol.usuario), Object.assign({}, sol, {fecha:D.serverTimestamp()})));
  }
  function escucharRecuperaciones(cb){
    const quitar=D.onValue(nodo('recuperaciones'), s=>cb(s.val()||{}), ()=>cb({}));
    return ()=>{ try{ quitar(); }catch(e){} };
  }
  function cerrarRecuperacion(clave, estado){
    const yo=auth && auth.currentUser;
    return conEspera(D.update(nodo('recuperaciones/'+clave), {estado, resueltaPor:yo?yo.uid:null, resueltaEn:D.serverTimestamp()}));
  }
  // La propia persona, después de poner su contraseña nueva (las reglas solo le dejan ponerlo en false)
  function quitarDebeCambiarPass(){
    const yo=auth && auth.currentUser;
    if(!yo) return Promise.reject(traducir({code:'auth/requires-recent-login'}));
    return conEspera(D.set(nodo('perfiles/'+yo.uid+'/debeCambiarPass'), false));
  }
  // ---------- Super-admin con correo real (recuperar-contrasena.md, sección 9) ----------
  // Firebase manda el enlace solo si el correo es de una cuenta (y no avisa si no lo es)
  function restablecerPorCorreo(correo){ return conEspera(A.sendPasswordResetEmail(auth, correo)); }
  function confirmarMiPass(pass){
    const yo=auth && auth.currentUser;
    if(!yo) return Promise.reject(traducir({code:'auth/requires-recent-login'}));
    return conEspera(A.reauthenticateWithCredential(yo, A.EmailAuthProvider.credential(yo.email, pass))).then(()=>{});
  }
  // En la sesión aparte (no toca la del super-admin): crea la cuenta y le manda el correo de verificación
  function crearCuentaConCorreo(correo, pass){
    const tarea=colaAltas.then(()=>{
      const a=sesionAltas();
      return conEspera(A.createUserWithEmailAndPassword(a, correo, pass)
        .then(c=>A.sendEmailVerification(c.user).catch(()=>{}).then(()=>c.user.uid))
        .then(uid=>A.signOut(a).then(()=>({uid, correo}))));
    });
    colaAltas=tarea.catch(()=>{});
    return tarea;
  }
  // El perfil pasa a la cuenta nueva; la vieja queda sin perfil (sin acceso) y el índice con la marca
  function pasarCuentaACorreo(d){
    const u={};
    u['perfiles/'+d.uidNuevo]=JSON.parse(JSON.stringify(d.perfil));
    u['perfiles/'+d.uidViejo]=null;
    u['login/'+dom.claveUsuario(d.usuario)]={correo:dom.MARCA_SOLO_CORREO, uid:d.uidNuevo};
    return conEspera(D.update(nodo(), u));
  }
  function leerIndice(){
    return Promise.all([leer('perfiles'), leer('login')]).then(([p,l])=>({perfiles:p||{}, login:l||{}}));
  }
  // Tablas del esquema viejo, con contraseñas. Solo se pueden leer con las
  // reglas de TRANSICIÓN; con las reglas cerradas devuelve null.
  function leerLegado(){
    return Promise.all([leer('data/superadmins'), leer('data/usuarios')])
      .then(([s,u])=>({superadmins:aLista(s), usuarios:aLista(u)}))
      .catch(e=>{ if(e.codigo===ERRORES_CUENTA.PERMISO) return null; throw e; });
  }
  function necesitaDueno(){
    return conEspera(D.get(D.query(nodo('data/superadmins'), D.limitToFirst(1))))
      .then(s=>!s.exists()).catch(()=>false);
  }
  const aLista=v=>Array.isArray(v)?v.filter(Boolean):(v&&typeof v==='object'?Object.values(v).filter(Boolean):[]);

  // Errores traducidos también en las operaciones que no pasan por conEspera
  const envolver=fn=>function(){
    try{ const r=fn.apply(null, arguments); return (r&&r.catch)?r.catch(e=>{ throw (e&&e.codigo)?e:traducir(e); }):r; }
    catch(e){ return Promise.reject(traducir(e)); }
  };
  return {
    iniciar, disponible, alCambiarSesion,
    buscarLogin:envolver(buscarLogin), entrar:envolver(entrar), salir,
    leerPerfil:envolver(leerPerfil), escucharPerfil,
    crearCuentaPropia:envolver(crearCuentaPropia), crearCuentaAjena:envolver(crearCuentaAjena),
    guardarCuenta:envolver(guardarCuenta), borrarCuenta:envolver(borrarCuenta),
    actualizarPerfil:envolver(actualizarPerfil), cambiarMiPass:envolver(cambiarMiPass),
    leerIndice:envolver(leerIndice), leerLegado:envolver(leerLegado), necesitaDueno,
    fijarNegocioActivo:envolver(fijarNegocioActivo),
    pedirRecuperacion:envolver(pedirRecuperacion), escucharRecuperaciones,
    cerrarRecuperacion:envolver(cerrarRecuperacion), quitarDebeCambiarPass:envolver(quitarDebeCambiarPass),
    restablecerPorCorreo:envolver(restablecerPorCorreo), confirmarMiPass:envolver(confirmarMiPass),
    crearCuentaConCorreo:envolver(crearCuentaConCorreo), pasarCuentaACorreo:envolver(pasarCuentaACorreo)
  };
}
