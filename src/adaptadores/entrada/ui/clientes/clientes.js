// ============================================================
//  INTERFAZ · Clientes
//  Clientes automáticos y su pantalla.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/07-customers-delivery/07-customers-delivery.md
// ============================================================
import { escapeHtml, fijarEscribiendo, fmtDate, fmtMoney, now } from '../nucleo/estado.js';
import { BOTON, MSJ } from '../nucleo/textos.js';
import { exigirEscritura, puedeVerPantalla } from '../nucleo/permisos.js';
import { abrirModal, cerrarModal, confirmarModal, ic, toast } from '../nucleo/componentes.js';
import { render } from '../nucleo/navegacion.js';

// ---------- CLIENTES AUTOMÁTICOS ----------
// F22: al anular una venta cobrada se resta lo que sumó guardarClienteAuto
export function revertirClienteAuto(venta){
  const nombre=(venta.cliNombre||'').trim(), tel=(venta.cliTel||'').trim();
  if(!nombre && !tel) return;
  const cls=misDatos('clientes');
  let ex=null;
  if(tel) ex=cls.find(c=>c.tel && c.tel===tel);
  if(!ex && nombre) ex=cls.find(c=>(c.nombre||'').toLowerCase()===nombre.toLowerCase());
  if(!ex) return;
  ex.pedidos=Math.max(0,(ex.pedidos||0)-1);
  ex.totalComprado=Math.max(0,(ex.totalComprado||0)-(venta.total||0));
  guardarMisDatos('clientes',[ex]);
}
export function guardarClienteAuto(venta){
  const nombre=(venta.cliNombre||'').trim();
  const tel=(venta.cliTel||'').trim();
  if(!nombre && !tel) return;
  const cls=misDatos('clientes');
  let ex=null;
  if(tel) ex=cls.find(c=>c.tel && c.tel===tel);
  if(!ex && nombre) ex=cls.find(c=>(c.nombre||'').toLowerCase()===nombre.toLowerCase());
  if(ex){
    ex.pedidos=(ex.pedidos||0)+1;
    ex.totalComprado=(ex.totalComprado||0)+(venta.total||0);
    if(nombre) ex.nombre=nombre;
    if(tel) ex.tel=tel;
    if(venta.cliDir) ex.dir=venta.cliDir;
    if(venta.cliBarrio) ex.barrio=venta.cliBarrio;
    if(venta.cliCiudad) ex.ciudad=venta.cliCiudad;
    ex.ultimoPedido=now();
  } else {
    cls.unshift({id:uid(), nombre, tel, dir:venta.cliDir||'', barrio:venta.cliBarrio||'',
      ciudad:venta.cliCiudad||'', pedidos:1, totalComprado:venta.total||0,
      creado:now(), ultimoPedido:now()});
  }
  guardarMisDatos('clientes',cls);
}

// ============================================================
//  CLIENTES
// ============================================================
export let _cBusca='';
export function clientes(){
  fijarEscribiendo(false);
  let cls=misDatos('clientes');
  if(_cBusca){ const q=_cBusca.toLowerCase();
    cls=cls.filter(c=>(c.nombre||'').toLowerCase().includes(q)||(c.tel||'').includes(q)||(c.barrio||'').toLowerCase().includes(q)); }
  cls=cls.slice().sort((a,b)=>(b.pedidos||0)-(a.pedidos||0));
  const todos=misDatos('clientes');
  const totalComprado=todos.reduce((a,c)=>a+(c.totalComprado||0),0);

  return `
    <div class="stats">
      <div class="stat verde"><div class="stat-lbl">Clientes registrados</div><div class="stat-val">${todos.length}</div><div class="stat-sub">${todos.filter(c=>(c.pedidos||0)>0).length} con compras</div></div>
      <div class="stat gold"><div class="stat-lbl">Total comprado</div><div class="stat-val">${fmtMoney(totalComprado)}</div><div class="stat-sub">por todos</div></div>
      <div class="stat azul"><div class="stat-lbl">Cliente top</div><div class="stat-val fs-17">${cls.length?escapeHtml(cls[0].nombre||'—'):'—'}</div><div class="stat-sub">${cls.length?(cls[0].pedidos||0)+' pedido(s)':''}</div></div>
    </div>
    <div class="tarjeta">
      <div class="t-cab">
        <span class="t-tit">${ic('users')} Clientes</span>
        <div class="t-acc">
          <input type="text" class="busca" placeholder="🔍 Nombre, teléfono, barrio..." value="${escapeHtml(_cBusca)}" data-input="buscarClientes(this.value)">
          <button class="btn btn-gold" data-click="editarCliente(null)">+ Agregar</button>
        </div>
      </div>
      <p class="gris">Se guardan solos cuando cobras un domicilio o envío con datos del cliente.</p>
      <div class="tabla-wrap"><table class="tabla">
        <thead><tr><th>Nombre</th><th>Teléfono</th><th>Dirección</th><th>Pedidos</th><th>Total comprado</th><th>Último</th><th></th></tr></thead>
        <tbody>
        ${cls.length? cls.map(c=>`<tr>
          <td><strong>${escapeHtml(c.nombre||'—')}</strong></td>
          <td>${escapeHtml(c.tel||'—')}</td>
          <td>${escapeHtml(c.dir||'—')}${c.barrio?`<br><span class="gris chico">${escapeHtml(c.barrio)}</span>`:''}</td>
          <td><strong>${c.pedidos||0}</strong></td>
          <td class="oro negrita">${fmtMoney(c.totalComprado||0)}</td>
          <td class="gris chico">${c.ultimoPedido?fmtDate(c.ultimoPedido):'—'}</td>
          <td class="acciones">
            <button class="btn btn-sm" data-click="editarCliente('${escapeHtml(c.id)}')">Editar</button>
            <button class="btn btn-sm btn-rojo" data-click="eliminarCliente('${escapeHtml(c.id)}')">×</button>
          </td>
        </tr>`).join('') : `<tr><td colspan="7" class="gris">${_cBusca?'No se encontraron.':'Sin clientes aún.'}</td></tr>`}
        </tbody>
      </table></div>
    </div>`;
}
export function editarCliente(id){
  if(!exigirEscritura()) return;   // D10: solo lectura
  if(!puedeVerPantalla('clientes')){ toast(MSJ.noTienesAccesoAClientes,'error'); return; }
  const cls=misDatos('clientes');
  const c=id?cls.find(x=>x.id===id):null;
  abrirModal({titulo:(c?'Editar':'Nuevo')+' cliente', textoBoton:BOTON.guardar, campos:[
    {id:'nombre', label:'Nombre', valor:c?c.nombre:'', requerido:true},
    {id:'tel', label:'Teléfono', valor:c?c.tel:''},
    {id:'dir', label:'Dirección', valor:c?c.dir:''},
    {id:'barrio', label:'Barrio', valor:c?c.barrio:''},
    {id:'ciudad', label:'Ciudad', valor:c?c.ciudad:''}
  ], onGuardar:(d)=>{
    const arr=misDatos('clientes');
    if(c){ const x=arr.find(y=>y.id===id); if(x) Object.assign(x,{nombre:d.nombre,tel:d.tel,dir:d.dir,barrio:d.barrio,ciudad:d.ciudad}); }
    else { arr.unshift({id:uid(), nombre:d.nombre, tel:d.tel, dir:d.dir, barrio:d.barrio, ciudad:d.ciudad, pedidos:0, totalComprado:0, creado:now()}); }
    guardarMisDatos('clientes',arr);
    cerrarModal(); toast(MSJ.guardado,'success'); render();
  }});
}
export function eliminarCliente(id){
  if(!exigirEscritura()) return;   // D10: solo lectura
  if(!puedeVerPantalla('clientes')){ toast(MSJ.noTienesAccesoAClientes,'error'); return; }
  confirmarModal(MSJ.eliminarEsteCliente,()=>{
    eliminarMisDatos('clientes',id); toast(MSJ.eliminado,'info'); render();
  },'Eliminar');
}
export function buscarClientes(v){ _cBusca=v; render(); }
