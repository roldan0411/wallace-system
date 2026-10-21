// Prepara la carpeta .publicar/ para Firebase Hosting del proyecto de PRUEBAS.
// Firebase Hosting sube lo que hay en el disco (no lo que hay en Git): por eso
// se copia SOLO una lista blanca de archivos de la app. Nunca pueden subirse el
// export de producción, importar-pruebas.json, perfil.json ni nada fuera de la lista.
//   npm run publicar:sandbox      prepara, revisa y publica (firebase deploy -P pruebas)
//   node scripts/publicar-sandbox.mjs   solo prepara y revisa
// Doc: Documentation/-00-execution-protocol/conexion-firebase.md (paso 5)
import { rmSync, mkdirSync, cpSync, readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const RAIZ=decodeURIComponent(new URL('..', import.meta.url).pathname).replace(/^\/([A-Za-z]:)/,'$1');
const DESTINO=join(RAIZ, '.publicar');
// Lo único que necesita la app en el navegador
const LISTA=['index.html', 'firebase-config.js', 'prueba.html', 'prueba.js', 'src'];   // el logo va dentro de src/
const PERMITIDAS=new Set(['.html', '.js', '.css']);

rmSync(DESTINO, {recursive:true, force:true});
mkdirSync(DESTINO);
LISTA.forEach(x=>{
  if(!existsSync(join(RAIZ,x))) throw new Error('Falta '+x);
  cpSync(join(RAIZ,x), join(DESTINO,x), {recursive:true});
});

// Revisión: solo html/js/css; nada que parezca datos
const archivos=[], raros=[];
(function rec(d){ readdirSync(d).forEach(f=>{ const p=join(d,f);
  if(statSync(p).isDirectory()) return rec(p);
  const r=relative(DESTINO,p).replace(/\\/g,'/'); archivos.push(r);
  if(!PERMITIDAS.has(extname(f)) || /export|respaldo|importar|perfil\.json/i.test(f)) raros.push(r);
}); })(DESTINO);
if(raros.length){ console.error('NO se publica: archivos fuera de lo permitido:\n  '+raros.join('\n  ')); process.exit(1); }

// La configuración de pruebas debe estar: si no, el sitio quedaría en modo local
if(!/export const PRUEBAS = \{/.test(readFileSync(join(DESTINO,'firebase-config.js'),'utf8'))){ console.error('firebase-config.js no tiene el bloque PRUEBAS'); process.exit(1); }

console.log('.publicar/ lista: '+archivos.length+' archivos (solo .html, .js y .css).');
console.log('Se publicará en el proyecto "pruebas" (wallacesys-dev-sandbox): https://wallacesys-dev-sandbox.web.app');
