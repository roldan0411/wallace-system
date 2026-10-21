// ============================================================
//  INTERFAZ · Gastos del negocio
//  Gastos y conceptos (reglas en dominio/gastos.js).
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/09-expenses-accounting/09-expenses-accounting.md
// ============================================================
import { STATE, escapeHtml, fijarEscribiendo, fmtMoney, now } from '../nucleo/estado.js';
import { BOTON, MSJ } from '../nucleo/textos.js';
import { exigirEscritura, puedeVerPantalla, tienePermiso } from '../nucleo/permisos.js';
import { abrirModal, cerrarModal, confirmarModal, ic, toast } from '../nucleo/componentes.js';
import { render } from '../nucleo/navegacion.js';
import { logAudit } from '../usuarios/auditoria.js';
import { nombreMes } from './contable.js';


// ============================================================
//  GASTOS DEL NEGOCIO
// ============================================================
export let _mesGas=null;
// ---------- Conceptos de gasto ----------
// Se agregan UNA vez y después solo se seleccionan. Antes cada quien los
// escribía distinto ("arriendo", "Arriendo local") y el informe se llenaba
// de líneas repetidas.
// CONCEPTOS_BASE, normConcepto, claveConcepto: src/dominio/gastos.js (los publica el puente)
export function getConceptosGasto(){
  let base=DB.get(claveDe(STATE.negocio.id,'conceptos_gasto'));
  if(!Array.isArray(base)) base=CONCEPTOS_BASE.concat(misDatos('gastos_negocio').map(g=>g.concepto));
  return Dominio.gastos.conceptosUnicos(base);
}
export function guardarConceptos(lista){ DB.set(claveDe(STATE.negocio.id,'conceptos_gasto'), lista); }
// Catálogo de conceptos para sumar: armarlo UNA vez por pantalla (R2)
export function catalogoConceptos(){ try{ return getConceptosGasto(); }catch(e){ return []; } }
// Suma sin duplicar por mayúsculas, tildes o espacios
export function acumConcepto(obj, nombre, monto, oficiales){
  Dominio.gastos.acumularConcepto(obj, nombre, monto, oficiales||catalogoConceptos());
}
// Lista compacta con barra y porcentaje (como en Portal Imperial)
window._ccOpen=window._ccOpen||{};
export function conceptosCompactoHTML(obj, opts){
  opts=opts||{};
  const arr=Object.entries(obj||{}).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1]);
  if(!arr.length) return `<p class="gris chico m-4-0-10">${opts.vacio||'Sin gastos.'}</p>`;
  const base=opts.base||arr.reduce((a,[,v])=>a+v,0);
  const fila=([k,v])=>{
    const pct=base>0?Math.round(v/base*1000)/10:0;
    return `<div class="cc-row"><div class="cc-top"><span class="cc-name" title="${escapeHtml(k)}">${escapeHtml(k)}</span>
      <span class="cc-val">${fmtMoney(v)}<small>${pct}%</small></span></div>
      <div class="cc-bar"><i style="width:${Math.max(Math.min(pct,100),1.5)}%"></i></div></div>`;
  };
  const max=opts.max||6, vis=arr.slice(0,max), resto=arr.slice(max);
  let html=`<div class="cc-list">${vis.map(fila).join('')}`;
  if(resto.length){
    const suma=resto.reduce((a,[,v])=>a+v,0); const id=opts.id||'cc';
    html+=`<details class="cc-more" ${window._ccOpen[id]?'open':''} data-toggle="recordarDesplegado('${escapeHtml(id)}',this.open)">
      <summary>Ver ${resto.length} concepto(s) más · ${fmtMoney(suma)}</summary>
      <div class="cc-scroll">${resto.map(fila).join('')}</div></details>`;
  }
  return html+'</div>';
}
export function opcionesConcepto(lista, sel){
  return `<option value="">Seleccione un concepto...</option>`+
    lista.map(c=>`<option value="${escapeHtml(c)}" ${claveConcepto(c)===claveConcepto(sel||'')?'selected':''}>${escapeHtml(c)}</option>`).join('');
}
export function agregarConceptoGasto(){
  if(!puedeVerPantalla('gastosneg')){ toast(MSJ.noTienesAccesoAGastos,'error'); return; }   // S7
  const inp=document.getElementById('g-nuevoconcepto');
  const n=normConcepto(inp&&inp.value);
  if(!n){ toast(MSJ.escribeElNombreDelConcepto,'error'); return; }
  const lista=getConceptosGasto();
  const ex=lista.find(x=>claveConcepto(x)===claveConcepto(n));
  if(ex){ toast('"'+ex+'" ya existe, queda seleccionado','info'); }
  else { lista.push(n); guardarConceptos(lista); logAudit('Agregó concepto de gasto',n); toast('Concepto agregado: '+n,'success'); }
  const sel=document.getElementById('m-concepto');
  if(sel){ sel.innerHTML=opcionesConcepto(getConceptosGasto(), ex||n); }
  if(inp) inp.value='';
  const w=document.getElementById('g-boxconcepto'); if(w) w.style.display='none';
}
export function toggleNuevoConcepto(){
  const w=document.getElementById('g-boxconcepto'); if(!w) return;
  const abrir=w.style.display==='none';
  w.style.display=abrir?'block':'none';
  if(abrir) setTimeout(()=>{ const i=document.getElementById('g-nuevoconcepto'); if(i) i.focus(); },40);
}
export function administrarConceptos(){
  const lista=getConceptosGasto();
  abrirModal({titulo:'Conceptos de gasto', textoBoton:BOTON.listo, campos:[],
    extraHTML:`<p class="nota">Estos son los conceptos que aparecen al registrar un gasto. Quitar uno no borra los gastos ya registrados con él.</p>
      <div class="d-flex flex-wrap gap-6 mt-10">
        ${lista.map(c=>`<span class="pill pill-gold p-5-6-5-11">${escapeHtml(c)}
          <button type="button" data-click="quitarConcepto(this.dataset.c)" data-c="${escapeHtml(c)}" class="fondo-ninguno borde-ninguno color-rojo cursor-mano fs-15 p-0-2">×</button></span>`).join('')}
      </div>`,
    onGuardar:()=>{ cerrarModal(); render(); }});
}
export function quitarConcepto(nombre){
  if(!puedeVerPantalla('gastosneg') || !tienePermiso('eliminar')){ toast(MSJ.noTienesPermisoParaQuitarConceptos,'error'); return; }   // S7
  if(!nombre) return;
  const lista=getConceptosGasto().filter(x=>claveConcepto(x)!==claveConcepto(nombre));
  guardarConceptos(lista);
  logAudit('Quitó concepto de gasto',nombre);
  cerrarModal(); toast(MSJ.conceptoQuitado,'info'); administrarConceptos();
}

export function gastosneg(){
  fijarEscribiendo(false);
  const gastos=misDatos('gastos_negocio');
  const mes=_mesGas||today().substring(0,7);
  const delMes=gastos.filter(g=>Dominio.fechas.mesDe(g.fecha)===mes);
  const total=delMes.reduce((a,g)=>a+g.valor,0);
  // Ventas del mes, para saber qué tanto pesa cada gasto
  const ventasMes=misDatos('ventas').filter(v=>v.estado==='pagada' && mesDeJornada(v)===mes)
    .reduce((a,v)=>a+(v.subtotal!=null?v.subtotal:(v.total||0)),0);
  const pctVentas = ventasMes>0 ? Math.round(total/ventasMes*1000)/10 : null;
  const porConcepto={};
  const ofi=catalogoConceptos();
  delMes.forEach(g=>acumConcepto(porConcepto,g.concepto,g.valor,ofi));
  const propios=delMes.filter(g=>g.origen!=='caja').reduce((a,g)=>a+g.valor,0);
  const deCaja=total-propios;
  const mesesSet={}; mesesSet[today().substring(0,7)]=1;
  gastos.forEach(g=>{ if(g.fecha) mesesSet[Dominio.fechas.mesDe(g.fecha)]=1; });
  const meses=Object.keys(mesesSet).sort().reverse();
  // Mes anterior, para comparar
  const [a1,m1]=mes.split('-').map(Number);
  const dPrev=new Date(a1,m1-2,1);
  const mesPrev=dPrev.getFullYear()+'-'+String(dPrev.getMonth()+1).padStart(2,'0');
  const totalPrev=gastos.filter(g=>Dominio.fechas.mesDe(g.fecha)===mesPrev).reduce((a,g)=>a+g.valor,0);
  const dif=total-totalPrev;

  return `
    <div class="tarjeta">
      <div class="t-cab">
        <div><span class="t-tit">${ic('cash')} Gastos del Negocio</span>
          <p class="gris">Todo lo que sale de plata: lo que paga el dueño aparte y lo que sale de la caja diaria.</p></div>
        <div class="t-acc">
          <select class="busca" data-change="elegirMesGastos(this.value)">
            ${meses.map(m=>`<option value="${escapeHtml(m)}" ${m===mes?'selected':''}>${nombreMes(m)}</option>`).join('')}
          </select>
          <button class="btn btn-sm btn-ghost" data-click="administrarConceptos()">Conceptos</button>
          <button class="btn btn-gold" data-click="nuevoGasto()">+ Registrar gasto</button>
        </div>
      </div>
    </div>
    <div class="stats">
      <div class="stat rojo"><div class="stat-ico rojo">${ic('cash')}</div><div class="stat-lbl">Gastos de ${nombreMes(mes)}</div>
        <div class="stat-val">${fmtMoney(total)}</div>
        <div class="stat-sub">${totalPrev>0?(dif>=0?'▲ '+fmtMoney(dif)+' más que el mes pasado':'▼ '+fmtMoney(-dif)+' menos que el mes pasado'):delMes.length+' gasto(s)'}</div></div>
      <div class="stat gold"><div class="stat-ico gold">${ic('report')}</div><div class="stat-lbl">Peso sobre las ventas</div>
        <div class="stat-val">${pctVentas!==null?pctVentas+'%':'—'}</div>
        <div class="stat-sub">${ventasMes>0?'de '+fmtMoney(ventasMes)+' vendidos':'sin ventas este mes'}</div></div>
      <div class="stat azul"><div class="stat-ico azul">${ic('cash')}</div><div class="stat-lbl">De la caja diaria</div>
        <div class="stat-val">${fmtMoney(deCaja)}</div><div class="stat-sub">salió del cajón</div></div>
      <div class="stat verde"><div class="stat-ico verde">${ic('box')}</div><div class="stat-lbl">Pagados aparte</div>
        <div class="stat-val">${fmtMoney(propios)}</div><div class="stat-sub">los paga el dueño</div></div>
    </div>
    <div class="grid2">
      <div class="tarjeta">
        <div class="cc-sec"><span>En qué se fue la plata</span><span>${Object.keys(porConcepto).length} concepto(s)</span></div>
        ${conceptosCompactoHTML(porConcepto,{id:'gn-mes',max:7,vacio:'Sin gastos este mes.'})}
        ${ventasMes>0?`<p class="nota mt-12">El porcentaje es sobre el total de gastos. De cada ${fmtMoney(100000)} vendidos, se van <strong class="rojo">${fmtMoney(Math.round(total/ventasMes*100000))}</strong> en gastos.</p>`:''}
      </div>
      <div class="tarjeta"><span class="t-tit">Detalle de ${nombreMes(mes)}</span>
        <div class="tabla-wrap"><table class="tabla">
          <thead><tr><th>Fecha</th><th>Concepto</th><th>Pagado con</th><th>Valor</th><th></th></tr></thead>
          <tbody>${delMes.length?delMes.map(g=>`<tr>
            <td class="gris chico">${Dominio.fechas.diaDe(g.fecha)}</td>
            <td><strong>${escapeHtml(g.concepto)}</strong>${g.origen==='caja'?' <span class="pill pill-azul chico">de caja</span>':''}${g.nota?`<br><span class="gris chico">${escapeHtml(g.nota)}</span>`:''}${g.por?`<br><span class="gris chico">${escapeHtml(g.por)}</span>`:''}</td>
            <td class="gris">${escapeHtml(g.metodo||'—')}</td>
            <td class="negrita rojo">${fmtMoney(g.valor)}</td>
            <td>${g.origen==='caja'?'<span class="gris chico" title="Se corrige desde la caja">🔒 Caja</span>':`<button class="btn btn-sm btn-rojo" data-click="eliminarGasto('${escapeHtml(g.id)}')">×</button>`}</td>
          </tr>`).join(''):'<tr><td colspan="5" class="gris">Sin gastos este mes.</td></tr>'}</tbody>
        </table></div>
      </div>
    </div>`;
}
export function nuevoGasto(){
  if(!exigirEscritura()) return;   // D10: solo lectura
  if(!puedeVerPantalla('gastosneg')){ toast(MSJ.noTienesAccesoAGastos,'error'); return; }
  const lista=getConceptosGasto();
  abrirModal({titulo:'Registrar gasto', textoBoton:BOTON.guardar, campos:[
    {id:'concepto', label:'Concepto', tipo:'select', opciones:[{valor:'',label:'Seleccione un concepto...'}].concat(lista.map(c=>({valor:c,label:c})))},
    {id:'valor', label:'Valor', tipo:'number', requerido:true},
    {id:'fecha', label:'Fecha', tipo:'date', valor:today()},
    {id:'metodo', label:'Pagado con', tipo:'select', opciones:[
      {valor:'Efectivo',label:'Efectivo'},{valor:'Banco',label:'Banco'},{valor:'Tarjeta',label:'Tarjeta'}]},
    {id:'nota', label:'Nota (opcional)'}
  ], extraHTML:`<div class="mt-n6">
      <button type="button" class="btn btn-sm btn-ghost" data-click="toggleNuevoConcepto()">+ Agregar concepto nuevo</button>
      <div id="g-boxconcepto" style="display:none;margin-top:8px;padding:10px;border:1px dashed var(--linea);border-radius:10px;">
        <p class="nota m-0-0-6">Escríbelo una sola vez. Después solo lo seleccionas.</p>
        <div class="d-flex gap-6">
          <input type="text" id="g-nuevoconcepto" class="campo m-0" placeholder="Ej: Gas, Desechables, Aseo"
            data-enter="agregarConceptoGasto()">
          <button type="button" class="btn btn-verde btn-sm" data-click="agregarConceptoGasto()">Guardar</button>
        </div>
      </div>
    </div>`,
  onGuardar:(d)=>{
    if(!normConcepto(d.concepto)){ toast(MSJ.seleccioneElConceptoDelGasto,'error'); return; }
    // V3: un gasto en 0 o negativo subiría la utilidad del Contable
    if(!(parseFloat(d.valor)>0)){ toast(MSJ.valorInvalido,'error'); return; }
    const arr=misDatos('gastos_negocio');
    arr.unshift({id:uid(), concepto:normConcepto(d.concepto), valor:parseFloat(d.valor)||0,
      fecha:d.fecha||today(), metodo:d.metodo, nota:d.nota, por:STATE.user.nombre, creado:now()});
    guardarMisDatos('gastos_negocio',arr);
    logAudit('Registró gasto', d.concepto+' · '+fmtMoney(parseFloat(d.valor)||0));
    cerrarModal(); toast(MSJ.gastoRegistrado,'success'); render();
  }});
}
export function eliminarGasto(id){
  if(!exigirEscritura()) return;   // D10: solo lectura
  if(!puedeVerPantalla('gastosneg')){ toast(MSJ.noTienesAccesoAGastos,'error'); return; }
  const g=misDatos('gastos_negocio').find(x=>x.id===id);
  if(!g){ return; }
  // F13: un gasto de caja vive en la caja y en su cierre (de ahí lo toma Contable).
  // Borrarlo aquí dejaba Gastos y Contable con cifras distintas.
  if(g.origen==='caja'){
    toast(MSJ.esteGastoSalioDeLaCaja,'info');
    return;
  }
  // confirmarModal ya escapa el texto
  const aviso='¿Eliminar el gasto "'+(g.concepto||'')+'" de '+fmtMoney(g.valor)+'?';
  confirmarModal(aviso,()=>{
    eliminarMisDatos('gastos_negocio',id);
    logAudit('Eliminó gasto', (g.concepto||'')+' · '+fmtMoney(g.valor));
    toast(MSJ.gastoEliminado,'info'); render();
  },'Eliminar');
}
export function elegirMesGastos(v){ _mesGas=v; render(); }
// Recuerda qué listas de conceptos quedaron desplegadas (<details>) entre redibujos
export function recordarDesplegado(id, abierto){ window._ccOpen[id]=abierto; }
