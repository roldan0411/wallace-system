// Genera Documentation/-03-architecture/mapa-interfaz.md: en qué archivo de la
// interfaz (src/adaptadores/entrada/ui/) está cada función y variable de nivel superior.
//   node scripts/mapa-interfaz.mjs          (correrlo después de mover o crear funciones)
// Exporta mapaInterfaz() para otros scripts.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import * as acorn from 'acorn';
import { ARCHIVOS_UI } from '../src/adaptadores/entrada/ui/manifiesto.js';

const RAIZ='src/adaptadores/entrada/ui/';

export function mapaInterfaz(){
  const mapa={};   // nombre -> {archivo, linea, tipo}
  ARCHIVOS_UI.forEach(a=>{
    const ast=acorn.parse(readFileSync(RAIZ+a,'utf8'), {ecmaVersion:'latest', sourceType:'module', locations:true});
    ast.body.forEach(x=>{
      const n=x.type==='ExportNamedDeclaration'?x.declaration:x;   // los módulos exportan casi todo
      if(!n) return;
      if(n.type==='FunctionDeclaration') mapa[n.id.name]={archivo:a, linea:n.loc.start.line, tipo:'función'};
      else if(n.type==='VariableDeclaration') n.declarations.forEach(d=>{ mapa[d.id.name]={archivo:a, linea:n.loc.start.line, tipo:n.kind}; });
    });
  });
  return mapa;
}

if(import.meta.url===pathToFileURL(process.argv[1]).href){
  const mapa=mapaInterfaz();
  const porArchivo={};
  Object.entries(mapa).forEach(([n,d])=>{ (porArchivo[d.archivo]=porArchivo[d.archivo]||[]).push([n,d]); });
  let md=`# Mapa de la interfaz

Archivo **generado** por \`node scripts/mapa-interfaz.mjs\` (no editar a mano). Dice en qué archivo de \`src/adaptadores/entrada/ui/\` está cada función y variable de nivel superior de la interfaz (módulos ES; casi todo se exporta, y en la consola del navegador se ve como \`WS.<nombre>\`). Sirve para ubicar las referencias viejas \`app.js:NNN\` de la documentación: se busca la función por nombre.

En la documentación, \`ui/<carpeta>/<archivo>.js\` es la ruta relativa a \`src/adaptadores/entrada/\`. La lista de módulos está en \`ui/manifiesto.js\`.

| Archivo | Funciones y variables (línea) |
|---|---|
`;
  ARCHIVOS_UI.forEach(a=>{
    md+='| `ui/'+a+'` | '+(porArchivo[a]||[]).sort((x,y)=>x[1].linea-y[1].linea).map(([n,d])=>'`'+n+'`'+(d.tipo==='función'?'':' ('+d.tipo+')')+' '+d.linea).join(' · ')+' |\n';
  });
  md+='\n**Total:** '+Object.keys(mapa).length+' nombres en '+ARCHIVOS_UI.length+' archivos.\n';
  writeFileSync('Documentation/-03-architecture/mapa-interfaz.md', md);
  console.log('Documentation/-03-architecture/mapa-interfaz.md · '+Object.keys(mapa).length+' nombres');
}
