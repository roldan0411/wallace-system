// Diagnóstico de un export de Realtime Database y archivo para importarlo en el
// proyecto de PRUEBAS. No muestra contraseñas, hashes ni datos de clientes.
//
//   node scripts/preparar-pruebas.mjs wallace-system-default-rtdb-export.json
//     → informe en pantalla + importar-pruebas.json (solo el nodo data)
//   Luego:  npx firebase database:import / importar-pruebas.json -P pruebas
//
// Acepta también el respaldo de la app ({sistema, fecha, datos}).
// Los dos archivos tienen datos reales: están en .gitignore, NUNCA subirlos a Git.
import { readFileSync, writeFileSync } from 'node:fs';
import { claveUsuario, PASS_MIN_CUENTA } from '../src/dominio/cuentas.js';

const origen=process.argv[2];
if(!origen){ console.error('Uso: node scripts/preparar-pruebas.mjs <export.json> [salida.json]'); process.exit(1); }
const salida=process.argv[3]||'importar-pruebas.json';
const crudo=JSON.parse(readFileSync(origen,'utf8'));
const data=crudo.data || crudo.datos || crudo;   // export completo, respaldo de la app o solo data
const aLista=v=>Array.isArray(v)?v.filter(Boolean):(v&&typeof v==='object'?Object.values(v).filter(Boolean):[]);

const avisos=[], bloqueos=[];
const negocios=data.negocios_r ? aLista(data.negocios_r) : aLista(data.negocios);
const usuarios=aLista(data.usuarios), superadmins=aLista(data.superadmins);
const ids=new Set(negocios.map(n=>n.id));

console.log('== Export:', origen);
console.log('Nodos raíz:', Object.keys(crudo).join(', '));
const sobrantes=Object.keys(crudo).filter(k=>k!=='data' && (crudo.data||crudo.datos));
if(sobrantes.length) avisos.push('Nodos fuera de data que la app no usa (no se importan): '+sobrantes.join(', '));
console.log('Formato de negocios:', data.negocios_r?'por registro (negocios_r) — ya migrado':'array viejo (data/negocios) — se migra al primer ingreso');
console.log('Negocios:', negocios.length, '· activos:', negocios.filter(n=>n.activo).length, '· demos:', negocios.filter(n=>n.esDemo).length);
console.log('Usuarios de negocio:', usuarios.length, '· super-admins:', superadmins.length);

// --- Supuestos de las reglas ---
const conGuion=negocios.filter(n=>String(n.id).includes('_'));
if(conGuion.length) bloqueos.push('Negocios con "_" en el id (rompen el prefijo data_<id>_ de las reglas): '+conGuion.map(n=>n.id).join(', '));
const huerfanas=[...new Set(Object.keys(data).filter(k=>k.startsWith('data_')).map(k=>k.split('_')[1]).filter(i=>!ids.has(i)))];
if(huerfanas.length) avisos.push('Tablas de negocios que ya no existen (nadie podrá leerlas con las reglas cerradas): '+huerfanas.join(', '));
const sinNegocio=usuarios.filter(u=>!ids.has(u.negocioId));
if(sinNegocio.length) avisos.push('Usuarios sin negocio (no podrán migrar): '+sinNegocio.map(u=>u.usuario).join(', '));

// --- Cuentas ---
const nombres={};
[...superadmins.map(s=>['super',s]), ...usuarios.map(u=>['usuario',u])].forEach(([t,r])=>{
  const k=claveUsuario(r.usuario); (nombres[k]=nombres[k]||[]).push(t+':'+r.usuario);
});
const repetidos=Object.values(nombres).filter(l=>l.length>1);
if(repetidos.length) bloqueos.push('Nombres de usuario repetidos (un solo índice login/): '+repetidos.map(l=>l.join(' / ')).join('; '));
const plano=[...superadmins, ...usuarios].filter(r=>typeof r.pass==='string' && !r.passHash).length;
const conHash=[...superadmins, ...usuarios].filter(r=>r.passHash).length;
console.log('Contraseñas: en texto plano', plano, '· con hash', conHash,
  plano?'  ⚠️  texto plano: se pasan a hash cuando el super-admin entra con la versión nueva':'');
const cortas=[...superadmins, ...usuarios].filter(r=>typeof r.pass==='string' && r.pass.length<PASS_MIN_CUENTA).map(r=>r.usuario);
if(cortas.length) console.log('Usuarios a los que se les pedirá contraseña nueva (texto plano de menos de '+PASS_MIN_CUENTA+'):', cortas.join(', '));
const inactivos=usuarios.filter(u=>u.activo===false).map(u=>u.usuario);
if(inactivos.length) console.log('Usuarios desactivados (no migran):', inactivos.join(', '));

// --- Datos ---
const viejas=Object.keys(data).filter(k=>/^data_[^_]+_[a-z_]+$/.test(k) && !/_(r|x|bk)$/.test(k)
  && !/_(caja_actual|config|factura_seq|conceptos_gasto)$/.test(k));
if(viejas.length) console.log('Tablas en formato viejo (array completo):', viejas.length, '— se pasan a formato por registro cuando alguien entra al negocio');
const bk=Object.keys(data).filter(k=>k.endsWith('_bk'));
if(bk.length) console.log('Respaldos _bk de migraciones anteriores:', bk.length, '— se pueden borrar en la fase 5');
const logos=negocios.map(n=>(n.logo||'').length).reduce((a,b)=>a+b,0);
console.log('Logos dentro de negocios:', Math.round(logos/1024)+' KB', '(R1: cada empleado ya solo descarga el suyo con negocios_r)');
const planes=[...new Set(negocios.map(n=>n.plan||'(sin plan)'))];
console.log('Planes en uso:', planes.join(', '));
const raros=planes.filter(p=>['Básico','Profesional','Premium'].indexOf(p)<0);
if(raros.length) avisos.push('Planes fuera de Básico/Profesional/Premium (se muestran como Premium o Básico): '+raros.join(', '));

avisos.forEach(a=>console.log('⚠️ ', a));
bloqueos.forEach(b=>console.log('⛔', b));

writeFileSync(salida, JSON.stringify({data}));
console.log('\n✅ Escrito', salida, '('+Math.round(JSON.stringify({data}).length/1024)+' KB). Importar SOLO en pruebas:');
console.log('   npx firebase database:import / '+salida+' -P pruebas');
console.log('   (borra lo que haya en la raíz de la base de pruebas). No subir este archivo a Git.');
process.exit(bloqueos.length?2:0);
