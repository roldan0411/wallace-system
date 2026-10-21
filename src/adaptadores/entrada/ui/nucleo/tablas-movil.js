// ============================================================
//  INTERFAZ · Tablas en celular
//  Convierte las filas de las tablas en tarjetas en pantallas angostas.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/README.md
// ============================================================


// ============================================================
//  NAVEGACIÓN Y RENDER
// ============================================================
// ============================================================
//  TABLAS → TARJETAS EN CELULAR
//  En el celular cada fila se vuelve una tarjeta: sin deslizar de lado,
//  solo lo importante y los botones a la vista. En PC no cambia nada.
// ============================================================
export const TC_ACCIONES=['Acciones','',' ','Reimprimir','Corregir'];
// Columnas secundarias que se esconden en celular, según la primera columna
export const TC_OCULTAR={
  'Negocio':['Flujo','Plan','Precio/mes','Usuarios'],
  'Factura':['Tipo','Método'],
  'Pedido':['Método'],
  'Nombre':['Barrio','Ciudad','Costo unit.','Avisar bajo','Unidad'],
  'Fecha':['Método'],
  'Día':['Esperado','Contado'],
  'Insumo':['Costo unit.','Avisar bajo'],
  'Usuario':['Rol'],
  'Producto':[],
  'Tipo':['Quién']
};
export function prepararTablasMovil(raiz){
  (raiz||document).querySelectorAll('table.tabla:not([data-tc])').forEach(t=>{
    t.setAttribute('data-tc','1');
    const ths=[...t.querySelectorAll('thead th')].map(th=>th.textContent.trim());
    if(ths.length<4) return;                       // las chicas ya caben
    t.classList.add('tabla-cards');
    const ocultar=TC_OCULTAR[ths[0]]||[];
    t.querySelectorAll('tbody tr').forEach(tr=>{
      const tds=[...tr.children];
      if(tds.length===1 || tds.some(td=>td.colSpan>1)){ tr.classList.add('tc-solo'); return; }
      tds.forEach((td,i)=>{
        const lab=ths[i]||'';
        const esAccion = i===tds.length-1 && (TC_ACCIONES.indexOf(lab)>-1 || td.classList.contains('acciones') || td.querySelector('button'));
        if(esAccion){
          td.classList.add('acciones','tc-actions'); td.removeAttribute('data-label');
          // Botones de solo ícono: nombre corto visible en celular (sale del title)
          td.querySelectorAll('button[title]').forEach(bt=>{
            const txt=bt.textContent.replace(/[^\wáéíóúñ]/gi,'').trim();
            if(txt.length>1) return;
            const t=bt.title.toLowerCase();
            const corto = t.indexOf('comanda')>-1?'Comanda' : t.indexOf('cuadre')>-1?'Cuadre'
              : t.indexOf('forma de pago')>-1?'Pago' : t.indexOf('remisión')>-1?'Remisión'
              : t.indexOf('cuenta')>-1?'Cuenta' : t.indexOf('factura')>-1?'Factura'
              : bt.title.replace(/\(.*?\)/g,'').trim().split(' ')[0];
            if(corto) bt.setAttribute('data-corto',corto);
          });
          return; }
        if(i===0){ td.classList.add('tc-title'); td.removeAttribute('data-label'); return; }
        if(!td.hasAttribute('data-label')) td.setAttribute('data-label',lab);
        if(ocultar.indexOf(lab)>-1) td.classList.add('tc-hide');
        const txt=td.textContent.trim();
        if((txt===''||txt==='—') && !td.querySelector('select,input,button')) td.classList.add('tc-vacio');
        if(!td.querySelector(':scope > .tc-v')){
          const w=document.createElement('div'); w.className='tc-v';
          while(td.firstChild) w.appendChild(td.firstChild);
          td.appendChild(w);
        }
      });
    });
  });
}
(function(){
  let pend=false;
  const run=()=>{ pend=false; try{ prepararTablasMovil(document); }catch(e){} };
  const obs=new MutationObserver(()=>{ if(!pend){ pend=true; requestAnimationFrame(run); } });
  const arrancarObs=()=>{ if(document.body) obs.observe(document.body,{childList:true,subtree:true}); run(); };
  if(document.body) arrancarObs(); else document.addEventListener('DOMContentLoaded',arrancarObs);
})();
