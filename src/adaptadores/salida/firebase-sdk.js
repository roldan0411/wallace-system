// ============================================================
//  ADAPTADOR DE SALIDA · Carga del SDK de Firebase (modular)
//  Importa el SDK MODULAR de Firebase desde gstatic, sin el objeto global
//  "firebase" ni las capas -compat. Devuelve sus tres módulos para que los
//  adaptadores (firebase-datos.js, firebase-cuentas.js) usen sus funciones
//  (ref, get, onValue, signInWithEmailAndPassword…).
//  En las pruebas con Node no se usa: se les pasan los paquetes de npm
//  (firebase/app, firebase/database, firebase/auth), que tienen las mismas funciones.
//  Doc: Documentation/-03-architecture/modulos-es.md (sección 8)
// ============================================================

// Cambiar aquí para actualizar Firebase (y probar con npm run test:firebase)
export const VERSION_FIREBASE='10.12.2';
const BASE='https://www.gstatic.com/firebasejs/'+VERSION_FIREBASE+'/';
export const URLS_FIREBASE={
  app: BASE+'firebase-app.js',
  database: BASE+'firebase-database.js',
  auth: BASE+'firebase-auth.js'
};

let _sdk=null;
// null si no se pudo descargar (sin internet, bloqueador): la app sigue en modo local
export async function cargarSdkFirebase(){
  if(_sdk) return _sdk;
  try{
    const [app, database, auth]=await Promise.all([import(URLS_FIREBASE.app), import(URLS_FIREBASE.database), import(URLS_FIREBASE.auth)]);
    _sdk={app, database, auth};
  }catch(e){ console.error('No se pudo cargar Firebase:', e && e.message); }
  return _sdk;
}
// El SDK ya cargado (o null): para la consola y las pruebas de navegador
export function sdkCargado(){ return _sdk; }
