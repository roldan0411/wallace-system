// Corre en los emuladores de Firebase (Realtime Database + Authentication):
//   · tests/reglas/       las reglas cerradas y de transición
//   · tests/integracion/  el ensayo completo de la migración S1 con los adaptadores reales
//   · tests/navegador/    la interfaz real en Chrome/Edge sin ventana (S1 y modo local)
// y los apaga al terminar. En Windows "firebase emulators:exec" deja vivo el
// emulador de la base (java) ocupando el puerto 9000: aquí se cierra.
//   npm run test:firebase      (requiere Java 11+; proyecto demo-wallace, no toca ninguna base real)
import { spawnSync, execSync } from 'node:child_process';

const pruebas='node --test --test-concurrency=1 tests/reglas/reglas.test.mjs tests/integracion/s1-migracion.test.mjs tests/navegador/s1-navegador.test.mjs tests/navegador/recorrido.test.mjs';
const r=spawnSync('npx firebase emulators:exec --only database,auth --project demo-wallace "'+pruebas+'"',
  {stdio:'inherit', shell:true});

if(process.platform==='win32'){
  try{
    const ps="Get-NetTCPConnection -LocalPort 9000,9099 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { "
      +"$p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$_.OwningProcess); "
      +"if($p.CommandLine -like '*firebase*emulator*' -or $p.CommandLine -like '*firebase-tools*'){ Stop-Process -Id $p.ProcessId -Force } }";
    execSync('powershell -NoProfile -Command "'+ps.replace(/"/g,'\\"')+'"', {stdio:'ignore'});
  }catch(e){}
}
process.exit(r.status===null?1:r.status);
