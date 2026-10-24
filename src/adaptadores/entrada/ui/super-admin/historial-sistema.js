// ============================================================
//  INTERFAZ · Historial del sistema (P2)
//  Lo que hace cada super-admin sobre negocios y cuentas queda anotado con
//  anotarEnSistema(...) (reglas puras en dominio/sistema.js; se guarda en
//  auditoria_sistema, solo agregar). La pantalla la ve solo el dueño del sistema.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/01-super-admin-panel/01-super-admin-panel.md
// ============================================================
import { STATE, escapeHtml, fmtDate } from '../nucleo/estado.js';
import { MSJ } from '../nucleo/textos.js';
import { reportarError, toast } from '../nucleo/componentes.js';
import { render } from '../nucleo/navegacion.js';
import { miUid } from '../usuarios/cuentas.js';

// Anota una acción del super-admin en sesión (también si está supervisando un negocio).
// Devuelve la promesa del guardado: quien la necesita terminada antes de seguir (p. ej.
// antes de borrar su propio perfil) puede esperarla.
export function anotarEnSistema(accion, negocio, antes, despues, detalle){
  try{
    const yo=STATE._superUser||STATE.user;
    if(!yo || !(STATE.esSuperAdmin || STATE.modoSupervision)) return Promise.resolve(false);
    // Id con crypto, no con uid(): uid() gasta Math.random y cambiaría los datos de las demos
    // que se crean después (las capturas fijan esa semilla)
    const id='h'+Date.now().toString(36)+Cripto.claveAleatoria(6);
    const e=Dominio.sistema.entrada({id, fecha:Date.now(), accion, negocio, antes, despues, detalle,
      quien:{nombre:yo.nombre, usuario:yo.usuario, uid:miUid(), rolSuper:yo.rolSuper}});
    return Datos.registrarSistema(e).then(ok=>{
      if(!ok) reportarError('el historial del sistema', new Error('No se guardó: '+accion));
      return ok;
    });
  }catch(e){ reportarError('el historial del sistema', e); return Promise.resolve(false); }
}

// ---------- Pantalla ----------
export let _historialSistema=null;   // null = sin leer todavía
export let _filtroHistorial={};
export function irHistorialSistema(){
  if(!(STATE.user && STATE.user.rolSuper==='dueno')){ toast(MSJ.soloElDuenoVeElHistorial,'error'); return; }
  STATE.page='historial'; _historialSistema=null; _filtroHistorial={}; render();
  Datos.leerHistorialSistema(500)
    .then(l=>{ _historialSistema=Dominio.sistema.recientesPrimero(l); render(); })
    .catch(e=>{ _historialSistema=[]; reportarError('leer el historial del sistema', e); render(); });
}
export function filtrarHistorial(campo, valor){
  if(['negocioId','quien','accion','texto'].indexOf(campo)<0) return;
  _filtroHistorial=Object.assign({}, _filtroHistorial, {[campo]:valor||''});
  render();
}
function opcionesDe(lista, valor, etiqueta, actual){
  const vistos={};
  lista.forEach(e=>{ const v=valor(e); if(v && !vistos[v]) vistos[v]=etiqueta(e); });
  return Object.keys(vistos).sort((a,b)=>vistos[a].localeCompare(vistos[b]))
    .map(v=>`<option value="${escapeHtml(v)}" ${actual===v?'selected':''}>${escapeHtml(vistos[v])}</option>`).join('');
}
function cambiosHTML(c){
  if(!c) return '';
  return Object.keys(c).map(k=>`<div class="chico"><strong>${escapeHtml(k)}</strong>: <span class="gris">${escapeHtml(c[k].antes==null?'—':c[k].antes)}</span> → ${escapeHtml(c[k].despues==null?'—':c[k].despues)}</div>`).join('');
}
export function pantallaHistorialSistema(){
  const esDueno=STATE.user && STATE.user.rolSuper==='dueno';
  const todo=_historialSistema||[], f=_filtroHistorial;
  const lista=Dominio.sistema.filtrar(todo, f);
  const rol={dueno:'Dueño', ayudante:'Ayudante', vendedor:'Vendedor'};
  return `
  <div class="topbar">
    <h1><span class="sa-marca">🕘 Historial del sistema</span></h1>
    <div class="tb-der"><button class="btn btn-ghost btn-sm" data-click="irPanel()">← Volver</button></div>
  </div>
  <div class="contenido">
    ${!esDueno?`<div class="tarjeta"><p class="gris">🔒 Solo el dueño del sistema ve el historial.</p></div>`:`
    <div class="tarjeta">
      <div class="t-cab">
        <span class="t-tit">Quién hizo qué <span class="pill pill-gold">${lista.length}</span></span>
        <div class="t-acc">
          <input type="text" class="busca" placeholder="🔍 Buscar…" value="${escapeHtml(f.texto||'')}" data-input="filtrarHistorial('texto', this.value)">
          <select class="busca" data-change="filtrarHistorial('negocioId', this.value)"><option value="">Todos los negocios</option>
            ${opcionesDe(todo, e=>e.negocioId, e=>e.negocioNombre||e.negocioId, f.negocioId)}</select>
          <select class="busca" data-change="filtrarHistorial('quien', this.value)"><option value="">Todas las personas</option>
            ${opcionesDe(todo, e=>e.quienUsuario||e.quien, e=>e.quien, f.quien)}</select>
          <select class="busca" data-change="filtrarHistorial('accion', this.value)"><option value="">Todas las acciones</option>
            ${opcionesDe(todo, e=>e.accion, e=>e.accion, f.accion)}</select>
        </div>
      </div>
      <p class="gris">Lo que hacen los super-admins sobre negocios y cuentas. Nadie puede editarlo ni borrarlo. Se muestran las últimas 500 acciones.</p>
      <div class="tabla-wrap"><table class="tabla tabla-cards">
        <thead><tr><th>Fecha</th><th>Quién</th><th>Acción</th><th>Negocio</th><th>Detalle</th></tr></thead>
        <tbody>${_historialSistema===null?'<tr><td colspan="5" class="gris">Cargando…</td></tr>'
          : lista.length? lista.map(e=>`<tr>
          <td data-label="Fecha" class="gris chico">${escapeHtml(fmtDate(e.fecha))}</td>
          <td data-label="Quién"><strong>${escapeHtml(e.quien)}</strong>${e.rolSuper?`<br><span class="gris chico">${escapeHtml(rol[e.rolSuper]||e.rolSuper)}</span>`:''}</td>
          <td data-label="Acción">${escapeHtml(e.accion)}</td>
          <td data-label="Negocio">${escapeHtml(e.negocioNombre||'—')}</td>
          <td data-label="Detalle">${e.detalle?`<div>${escapeHtml(e.detalle)}</div>`:''}${cambiosHTML(e.cambios)}</td>
        </tr>`).join('') : '<tr><td colspan="5" class="gris">Sin acciones registradas con estos filtros.</td></tr>'}</tbody>
      </table></div>
    </div>`}
  </div>`;
}
