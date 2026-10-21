// La Content-Security-Policy del proyecto, en un solo lugar
// (Documentation/-03-architecture/csp.md). La usan scripts/probar-csp.mjs y la
// prueba tests/ui/estructura.test.mjs, que exige que firebase.hosting.json (y
// render.yaml, cuando la lleve) tengan exactamente esta misma política.
export const DIRECTIVAS=[
  "default-src 'self'",
  "script-src 'self' https://www.gstatic.com https://*.firebaseio.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://*.firebaseio.com wss://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com",
  "frame-src https://*.firebaseapp.com",
  "object-src 'none'",
  "base-uri 'self'"
];
// frame-ancestors solo vale como encabezado (en <meta> se ignora): va aparte
export const SOLO_ENCABEZADO=["frame-ancestors 'none'"];
export const POLITICA=DIRECTIVAS.join('; ');
export const POLITICA_ENCABEZADO=DIRECTIVAS.concat(SOLO_ENCABEZADO).join('; ');
