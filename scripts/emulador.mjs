// Corre la app COMPLETA en este equipo contra los emuladores de Firebase
// (Authentication + Realtime Database). No toca producción ni pruebas.
//
//   npm run emulador                                  datos de importar-pruebas.json si existe, reglas de transición
//   npm run emulador -- --reglas cerradas             con las reglas finales
//   npm run emulador -- --datos otro.json             con otro archivo ({data:…} o export completo)
//   npm run emulador -- --puerto 3001                 si el 3000 está ocupado
//   npm run emulador -- --sin-dev                     sin la cuenta de desarrollo
// Luego abrir  http://localhost:3000/?emulador     (Ctrl+C para terminar; los datos no se guardan)
//
// Cuenta de desarrollo (SOLO existe dentro del emulador, en memoria):
//   usuario  dev   ·   contraseña  dev12345   ·   super-admin dueño
// Se crea ya migrada (cuenta de Authentication + perfil + índice login/), así que
// entra con las reglas de transición y con las cerradas.
// Explicación completa: Documentation/-00-execution-protocol/entornos-locales.md
import { spawn, execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { perfilDesdeSuperAdmin } from '../src/dominio/cuentas.js';

const arg=(n,def)=>{ const i=process.argv.indexOf('--'+n); return i>-1?process.argv[i+1]:def; };
const archivoDatos=arg('datos', existsSync('importar-pruebas.json')?'importar-pruebas.json':null);
const reglas=arg('reglas','transicion')==='cerradas'?'database.rules.json':'database.rules.transicion.json';
const PUERTO=arg('puerto','3000');
const conDev=process.argv.indexOf('--sin-dev')<0;
const NS='demo-wallace-default-rtdb';
const PUERTOS_EMULADOR=[9000, 9099, 4400, 4500, 9150];   // base, auth, hub, logging, websocket
const DEV={usuario:'dev', pass:'dev12345', correo:'udevemulador01@usuarios.wallace-system.app',
  registro:{id:'dev-emulador', usuario:'dev', nombre:'Desarrollo (emulador)', rolSuper:'dueno', creado:new Date().toISOString()}};
const espera=ms=>new Promise(r=>setTimeout(r,ms));
const rest=(ruta, metodo, cuerpo)=>fetch('http://127.0.0.1:9000/'+ruta+'.json?ns='+NS,
  {method:metodo, headers:{Authorization:'Bearer owner'}, body:JSON.stringify(cuerpo)}).then(r=>{ if(!r.ok) throw new Error(ruta+': '+r.status); });

// En Windows los emuladores (java/node) pueden quedar vivos al cerrar: se cierran solo
// los procesos que escuchan en los puertos del emulador y son de Firebase (nunca otros programas).
function cerrarEmuladoresViejos(){
  if(process.platform!=='win32') return;
  const ps="Get-NetTCPConnection -LocalPort "+PUERTOS_EMULADOR.join(',')+" -State Listen -ErrorAction SilentlyContinue | ForEach-Object { "
    +"$p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$_.OwningProcess); "
    +"if($p -and ($p.CommandLine -like '*firebase*' -or $p.CommandLine -like '*emulator*')){ Stop-Process -Id $p.ProcessId -Force } }";
  try{ execSync('powershell -NoProfile -Command "'+ps.replace(/"/g,'\\"')+'"', {stdio:'ignore'}); }catch(e){}
}
const puertoLibre=p=>new Promise(res=>{ const s=createServer().once('error',()=>res(false)).once('listening',()=>s.close(()=>res(true))).listen(p); });

const hijos=[];
const lanzar=(cmd, salida)=>{ const h=spawn(cmd, {shell:true, stdio:salida}); hijos.push(h); return h; };
function terminar(codigo){
  hijos.forEach(h=>{ try{ if(process.platform==='win32') execSync('taskkill /pid '+h.pid+' /T /F', {stdio:'ignore'}); else h.kill('SIGINT'); }catch(e){} });
  cerrarEmuladoresViejos();
  process.exit(codigo||0);
}
process.on('SIGINT', ()=>terminar(0));
process.on('SIGTERM', ()=>terminar(0));

if(!(await puertoLibre(Number(PUERTO)))){
  console.error('El puerto '+PUERTO+' está ocupado (¿otro "npx serve" abierto?). Ciérralo o usa: npm run emulador -- --puerto 3001');
  process.exit(1);
}
cerrarEmuladoresViejos();   // restos de una corrida anterior
lanzar('npx firebase emulators:start --only database,auth --project demo-wallace', ['ignore','inherit','inherit']);
let listo=false;
for(let i=0;i<90 && !listo;i++){
  try{ await fetch('http://127.0.0.1:9000/.json?ns='+NS); await fetch('http://127.0.0.1:9099/'); listo=true; }
  catch(e){ await espera(1000); }
}
if(!listo){ console.error('Los emuladores no arrancaron (¿Java 11+ instalado? ¿puertos 9000/9099 libres?)'); terminar(1); }

await rest('.settings/rules', 'PUT', JSON.parse(readFileSync(reglas,'utf8')));
const raiz={data:{}};
if(archivoDatos){
  const crudo=JSON.parse(readFileSync(archivoDatos,'utf8'));
  raiz.data=crudo.data||crudo.datos||crudo;
}
if(conDev){
  // 1) cuenta en el emulador de Authentication (API REST del emulador; "demo-key" no es una clave real)
  const api=accion=>fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:'+accion+'?key=demo-key',
    {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email:DEV.correo, password:DEV.pass, returnSecureToken:true})}).then(r=>r.json());
  let cuenta=await api('signUp');
  if(!cuenta.localId) cuenta=await api('signInWithPassword');   // ya existía
  if(!cuenta.localId){ console.error('No se pudo crear la cuenta de desarrollo: '+JSON.stringify(cuenta)); terminar(1); }
  // 2) registro de super-admin (sin contraseña: la verifica Authentication), perfil e índice de login
  const sas=Array.isArray(raiz.data.superadmins)?raiz.data.superadmins:Object.values(raiz.data.superadmins||{});
  raiz.data.superadmins=sas.filter(x=>x && x.usuario!==DEV.usuario).concat([DEV.registro]);
  const perfil=Object.assign(perfilDesdeSuperAdmin(DEV.registro), {migradoEn:new Date().toISOString(), creadoPor:'emulador'});
  raiz.perfiles={[cuenta.localId]:perfil};
  raiz.login={[DEV.usuario]:{correo:DEV.correo, uid:cuenta.localId}};
}
await rest('', 'PUT', raiz);

lanzar('npx serve -s . -l '+PUERTO, 'ignore');
let web=false;
for(let i=0;i<60 && !web;i++){ try{ await fetch('http://localhost:'+PUERTO+'/'); web=true; }catch(e){ await espera(500); } }
if(!web){ console.error('El servidor web no arrancó en el puerto '+PUERTO); terminar(1); }

console.log('\n✅ Emuladores listos · reglas: '+reglas+' · datos: '+(archivoDatos||'vacío (configuración inicial)'));
if(conDev) console.log('   Cuenta de desarrollo:  usuario dev  ·  contraseña dev12345  (solo existe en este emulador)');
console.log('   Abre  http://localhost:'+PUERTO+'/?emulador     (Ctrl+C para terminar)\n');

