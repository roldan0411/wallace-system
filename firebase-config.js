// Configuración de Firebase para Wallace System
// WALLACE COMPANY SYSTEM — Ing. Roldán Aldana
//
// Módulo ES: lo importan src/arranque.js y prueba.js (ya no deja variables en window).
// Elige la base según el dominio para que el desarrollo NUNCA toque producción
// (Documentation/-00-execution-protocol/paso-a-produccion.md, sección 1):
//   · dominios de HOSTS_PRODUCCION        → producción (wallace-system)
//   · localhost con ?emulador             → emuladores locales (npm run emulador)
//   · localhost con ?local                → modo local forzado (sin nube; lo usan las pruebas)
//   · cualquier otro (localhost, el fork) → PRUEBAS; si aún no está configurado, modo local
// elegirEntorno(...).entorno dice cuál se eligió (la pantalla de login lo muestra si no es producción).

export const PRODUCCION = {
  apiKey: "AIzaSyBhDI5edhW8dSa1JCPF418Q5bPJQ8e9znE",
  authDomain: "wallace-system.firebaseapp.com",
  databaseURL: "https://wallace-system-default-rtdb.firebaseio.com",
  projectId: "wallace-system",
  storageBucket: "wallace-system.firebasestorage.app",
  messagingSenderId: "430944532706",
  appId: "1:430944532706:web:a5d5f5b87678a25e7346bb"
};
// Proyecto de pruebas (simula producción): wallacesys-dev-sandbox, alias "pruebas" en .firebaserc
export const PRUEBAS = {
  apiKey: "AIzaSyB1jluvqozw_4cXi2WInxMcEIYdsSo5LVU",
  authDomain: "wallacesys-dev-sandbox.firebaseapp.com",
  databaseURL: "https://wallacesys-dev-sandbox-default-rtdb.firebaseio.com",
  projectId: "wallacesys-dev-sandbox",
  storageBucket: "wallacesys-dev-sandbox.firebasestorage.app",
  messagingSenderId: "988608924153",
  appId: "1:988608924153:web:363afbf8d3f1c1cd96d528"
};
// PENDIENTE: dominio(s) públicos de producción (p. ej. el de Render). Sin esto, ningún
// dominio usa producción: llenarlo ANTES de unir este código al repositorio original.
export const HOSTS_PRODUCCION = [];

// Emuladores locales (npm run emulador): proyecto ficticio demo-wallace, no existe en la nube
const CONFIG_EMULADOR = { apiKey: 'demo-key', authDomain: 'demo-wallace.firebaseapp.com',
  projectId: 'demo-wallace', databaseURL: 'https://demo-wallace-default-rtdb.firebaseio.com' };
export const EMULADORES = { database: '127.0.0.1:9000', auth: '127.0.0.1:9099' };

// ubicacion = window.location (o cualquier objeto con hostname y search, para las pruebas)
// Devuelve {entorno:'produccion'|'pruebas'|'emulador'|'local', config, emuladores}
export function elegirEntorno(ubicacion){
  const host = (ubicacion && ubicacion.hostname) || '';
  const esLocal = host === 'localhost' || host === '127.0.0.1' || host === '';
  const pide = p => { try{ return new URLSearchParams((ubicacion && ubicacion.search) || '').has(p); }catch(e){ return false; } };

  if (esLocal && pide('local')) return { entorno: 'local', config: null, emuladores: null };   // pruebas automáticas y capturas: nunca la nube
  if (esLocal && pide('emulador')) return { entorno: 'emulador', config: CONFIG_EMULADOR, emuladores: EMULADORES };
  if (HOSTS_PRODUCCION.indexOf(host) > -1) return { entorno: 'produccion', config: PRODUCCION, emuladores: null };
  return { entorno: PRUEBAS ? 'pruebas' : 'local', config: PRUEBAS || null, emuladores: null };
}
