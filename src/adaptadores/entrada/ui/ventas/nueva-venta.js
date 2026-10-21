// ============================================================
//  INTERFAZ · Nueva venta
//  Carrito, cliente, descuento, consecutivo de factura, confirmar y cobrar directo.
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/02-pos-catalog/02-pos-catalog.md
// ============================================================
import { STATE, escapeHtml, fijarEscribiendo, fmtMoney, jornadaActual, now, refrescarSiSePuede } from '../nucleo/estado.js';
import { BOTON, MSJ } from '../nucleo/textos.js';
import { cajaActual, exigirEscritura, exigirPermiso, sucursalActual, tienePermiso, usaInventario } from '../nucleo/permisos.js';
import { abrirModal, cerrarModal, confirmarModal, fotoProducto, ic, pPedido, preguntarDespues, reportarError, toast } from '../nucleo/componentes.js';
import { sonidoError, sonidoPedido } from '../nucleo/sonidos.js';
import { render } from '../nucleo/navegacion.js';
import { logAudit } from '../usuarios/auditoria.js';
import { descuentaAlPedir, nombreCuenta, usaCuentas } from './cuentas-abiertas.js';
import { idDomiciliario } from './pedidos.js';
import { abrirCobro, ajustarPagoVenta } from './cobro.js';
import { imprimirComanda, imprimirComandaSegura } from '../cocina/comanda.js';
import { ajustarStockPorEdicion, avisarStockBajo, descontarStock, faltantesPara, requerimientos } from '../inventario/motor.js';
import { disponiblesCombo, faltantesParaAgregar } from '../inventario/combos.js';
import { guardarClienteAuto } from '../clientes/clientes.js';
import { imprimirFactura } from '../impresion/facturas.js';


// ============================================================
//  NUEVA VENTA
// ============================================================
export let _carrito=[];
export let _vTipo='llevar';
export let _vCli={nombre:'',tel:'',dir:'',barrio:'',ciudad:'',depto:'',transportadora:'',domiciliario:'',valorDom:0};
export let _vMesa='';
export let _vObs='';
export let _vCat='Todas';
export let _vBusca='';
export let _desc=0;
export let _descPct=0;   // F26: si el descuento es en %, se recalcula con el subtotal de cada momento
export let _descMot='';
export let _guardando=false;   // bloquea doble clic

export function nuevaVenta(){
  const neg=STATE.negocio;
  // Proteger (no refrescar) solo si hay un pedido a medio armar. Antes era
  // siempre: con la caja cerrada el equipo no se enteraba de que otro la abrió.
  fijarEscribiendo(_carrito.length>0 || !!STATE.editandoVentaId || !!STATE.agregandoCuentaId);
  // Venta rápida: si usa cliente predeterminado y aún no hay datos, precargarlos
  if(neg.usaClienteFijo && !_vCli.nombre && !_vCli.tel && !STATE.editandoVentaId){
    _vCli.nombre=neg.clienteFijoNombre||'Consumidor Final';
    _vCli.tel=neg.clienteFijoTel||'0000000';
  }
  const cajaAbierta=cajaActual();
  if((neg.funciones||[]).indexOf('caja')>-1 && !cajaAbierta){
    return `<div class="tarjeta centro-msg">
      <div class="msg-ico">🔒</div>
      <div class="t-tit centrado">Caja cerrada</div>
      <p class="gris">Nadie puede vender hasta que se abra la caja. ${usaSucursales(neg)?'Cada sede tiene <strong>su propia caja</strong>: cuando alguien abra la de esta sede, todos los de aquí podrán vender.':'Es <strong>una sola caja para todo el negocio</strong>: cuando alguien la abra, todos podrán vender.'}</p>
      <button class="btn btn-gold" data-click="irA('caja')">Ir a abrir caja</button>
      <button class="btn btn-ghost btn-sm" data-click="refrescarDeLaNube()">🔄 Ya la abrieron, actualizar</button>
    </div>`;
  }
  let productos=misDatos('productos').filter(p=>!p.agotado);
  // Un combo sin unidades suficientes queda de último y marcado
  productos=productos.slice().sort((a,b)=>{
    const da=esCombo(a)?(disponiblesCombo(a)||0):1, db=esCombo(b)?(disponiblesCombo(b)||0):1;
    return (da===0?1:0)-(db===0?1:0);
  });
  if(_vCat!=='Todas') productos=productos.filter(p=>(p.categoria||'General')===_vCat);
  if(_vBusca){ const q=_vBusca.toLowerCase(); productos=productos.filter(p=>(p.nombre||'').toLowerCase().includes(q)); }
  const cats=['Todas'].concat(Array.from(new Set(misDatos('productos').filter(p=>!p.agotado).map(p=>p.categoria||'General'))));
  const bruto=_carrito.reduce((a,i)=>a+i.precio*i.qty,0);
  const desc=descuentoDe(bruto);
  const total=Math.max(0,bruto-desc);
  const tiposCfg=(neg.tiposEntrega&&neg.tiposEntrega.length)?neg.tiposEntrega:['llevar'];
  if(tiposCfg.indexOf(_vTipo)<0) _vTipo=tiposCfg[0];
  const etiquetas={mesa:'Mesa',llevar:'Para llevar',domicilio:'Domicilio',envio:'Envío nacional'};
  const valorDom=(_vTipo==='domicilio'||_vTipo==='envio')?(parseFloat(_vCli.valorDom)||0):0;
  const dosPasos = neg.flujoPedido==='dos_pasos';

  return `
    ${usaSucursales(neg)?`<div class="caja-aviso">📍 ${escapeHtml((sucursalesDe(neg).find(s=>s.id===sucursalActual())||{}).nombre||'')}</div>`:''}
    <div class="venta-grid">
      <div class="venta-izq">
        ${neg.usaCodBarras?`<input type="text" id="escaner-venta" class="busca-grande borde-color-verde sombra-0-0-14-acc-rgb-25" placeholder="📷 Escanea el código de barras aquí..." data-enter="escanearDesdeCampo(this)" autocomplete="off">`:''}
        <input type="text" class="busca-grande" placeholder="🔍 Buscar ${escapeHtml((neg.palabraProducto||'producto').toLowerCase())}..." value="${escapeHtml(_vBusca)}" data-input="buscarEnVenta(this.value)">
        ${cats.length>1?`<div class="cats">${cats.map(c=>`<button class="cat ${_vCat===c?'on':''}" data-click="elegirCategoriaVenta(this.dataset.cat)" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('')}</div>`:''}
        ${productos.length?`<div class="prods">
          ${productos.map(p=>`<div class="prod" data-click="agregarAlCarrito('${escapeHtml(p.id)}')">
            <div class="prod-ico">${fotoProducto(p,'box')}</div>
            <div class="prod-nom">${escapeHtml(p.nombre)}</div>
            <div class="prod-pre">${fmtMoney(p.precio)}</div>
            ${esCombo(p)?(()=>{ const d=disponiblesCombo(p); return d===null?'':`<div class="prod-stock ${d<=0?'sin':d<=3?'poco':''}">${d<=0?'No alcanza':'Alcanzan para '+d}</div>`; })()
              :(p.stock!=null?`<div class="prod-stock ${p.stock<=0?'sin':p.stock<=(p.stockMin||0)?'poco':''}">${p.stock<=0?'Sin stock':'Stock: '+p.stock}</div>`:'')}
          </div>`).join('')}
        </div>`:`<p class="gris">${_vBusca||_vCat!=='Todas'?'No se encontraron.':'Sin '+escapeHtml((neg.palabraProductos||'productos').toLowerCase())+'. Agrégalos en Inventario.'}</p>`}
      </div>
      <div class="tarjeta carrito">
        <div class="carrito-cab">
          ${STATE.agregandoCuentaId?(()=>{ const cu=misDatos('ventas').find(x=>x.id===STATE.agregandoCuentaId)||{};
            return `<div class="tarjeta-pend p-10-12 radio-10 mb-10">
              <div class="flex-between gap-8 flex-wrap">
                <span class="oro negrita">🧾 Agregando a ${escapeHtml(nombreCuenta(cu))}</span>
                <button class="btn btn-sm btn-ghost" data-click="salirDeCuenta()">Salir</button>
              </div>
              <div class="gris chico mt-4">La cuenta ya tiene ${(cu.items||[]).reduce((a,i)=>a+i.qty,0)} und por ${fmtMoney(cu.total||0)}. Lo que agregues aquí se le suma.</div>
            </div>`; })():''}
          ${STATE.editandoVentaId?(()=>{ const ed=misDatos('ventas').find(x=>x.id===STATE.editandoVentaId)||{};
            return `<div class="tarjeta-pend p-10-12 radio-10 mb-10">
              <div class="flex-between gap-8 flex-wrap">
                <span class="oro negrita">✏️ Editando ${escapeHtml(ed.factura||'pedido')}${ed.estado==='pagada'?' (ya cobrado)':''}</span>
                <button class="btn btn-sm btn-ghost" data-click="cancelarEdicionPedido()">Cancelar</button>
              </div>
              <div class="gris chico mt-4">Antes: ${fmtMoney(ed.total||0)} · ${(ed.items||[]).reduce((a,i)=>a+i.qty,0)} und${ed.estado==='pagada'?' · si cambia el total te pedirá ajustar el cobro':''}</div>
            </div>`; })():''}
          <div class="t-cab mb-12">
            <span class="t-tit">${ic('cart')} ${pPedido(true)}</span>
            ${_carrito.length?`<button class="btn btn-sm btn-ghost" data-click="vaciarCarrito()" title="Vaciar">🗑</button>`:''}
          </div>
          ${tiposCfg.length>1?`<div class="tipos">
            ${tiposCfg.map(t=>`<button class="tipo ${_vTipo===t?'on':''}" data-click="elegirTipoEntrega('${escapeHtml(t)}')">${etiquetas[t]||t}</button>`).join('')}
          </div>`:''}
          <div class="carrito-datos">${camposCliente()}</div>
        </div>
        <div class="items">
          ${_carrito.length? _carrito.map((i,idx)=>`<div class="item">
            <div class="item-info"><div class="item-nom">${escapeHtml(i.nombre)}</div><div class="item-uni">${fmtMoney(i.precio)} c/u</div></div>
            <div class="item-qty">
              <button data-click="cambiarQty(${escapeHtml(idx)},-1)">−</button>
              <span>${i.qty}</span>
              <button data-click="cambiarQty(${escapeHtml(idx)},1)">+</button>
            </div>
            <div class="item-tot-wrap">
              <div class="item-tot">${neg.esLogistica?(i.qty+' und'):fmtMoney(i.precio*i.qty)}</div>
              <button class="item-quitar" data-click="quitarItemCarrito(${escapeHtml(idx)})">quitar</button>
            </div>
          </div>`).join('') : '<div class="carrito-vacio">🛒<p>Toca un producto para agregarlo</p></div>'}
        </div>
        ${_carrito.length?`<div class="carrito-pie">
          ${neg.esLogistica?`
            <div class="total"><span>A DESPACHAR</span><span>${_carrito.reduce((a,i)=>a+i.qty,0)} und</span></div>
          `:`
          ${desc>0?`<div class="linea"><span>Subtotal</span><span>${fmtMoney(bruto)}</span></div>
            <div class="linea desc"><span>Descuento${_descMot?' · '+escapeHtml(_descMot):''}</span>
              <span>−${fmtMoney(desc)} <button class="mini-x" data-click="quitarDescuento()">×</button></span></div>`
           :(tienePermiso('descuento')?`<button class="btn btn-ghost btn-block btn-sm" data-click="abrirDescuento()">% Aplicar descuento</button>`:'')}
          <div id="linea-dom">${valorDom>0?`<div class="linea"><span>${_vTipo==='envio'?'Envío':'Domicilio'}</span><span>${fmtMoney(valorDom)}</span></div>`:''}</div>
          <div class="total"><span>TOTAL</span><span id="venta-total">${fmtMoney(total+valorDom)}</span></div>
          `}
          ${STATE.agregandoCuentaId?`
            <button class="btn btn-verde btn-block btn-grande" id="btn-confirmar" data-click="agregarACuenta()">➕ Agregar a la cuenta</button>
          `:`
            <button class="btn btn-gold btn-block btn-grande" id="btn-confirmar" data-click="${STATE.editandoVentaId?'guardarEdicionPedido()':(neg.esLogistica?'registrarSalida()':(dosPasos?'confirmarPedido()':'cobrarDirecto()'))}">
              ${STATE.editandoVentaId?'💾 Guardar cambios':(neg.esLogistica?'📦 Registrar salida':(dosPasos?'✓ Confirmar pedido':'💵 Cobrar ahora'))}
            </button>
            ${(usaCuentas()&&!dosPasos&&!STATE.editandoVentaId&&!neg.esLogistica)?`
              <button class="btn btn-block btn-sm mt-8" data-click="abrirCuentaNueva()">🧾 Dejar como cuenta abierta (cobrar después)</button>`:''}
          `}
        </div>`:''}
      </div>
    </div>`;
}

export function camposCliente(){
  const c=_vCli;
  const neg=STATE.negocio;
  // Venta rápida: cliente fijo. Solo mostramos una etiqueta compacta y las
  // observaciones; no se piden datos del cliente (salvo domicilio/envío).
  if(neg && neg.usaClienteFijo && _vTipo!=='domicilio' && _vTipo!=='envio'){
    return `<div class="cli-fijo">👤 ${escapeHtml(c.nombre||neg.clienteFijoNombre||'Consumidor Final')} <span class="gris chico">· venta rápida</span></div>
      ${_vTipo==='mesa'?`<input type="text" class="campo" placeholder="Número de mesa" value="${escapeHtml(_vMesa)}" data-input="ponerMesa(this.value)">`:''}
      <input type="text" class="campo" placeholder="Observaciones..." value="${escapeHtml(_vObs)}" data-input="ponerObservaciones(this.value)">`;
  }
  if(_vTipo==='mesa'){
    return `<input type="text" class="campo" placeholder="Número de mesa" value="${escapeHtml(_vMesa)}" data-input="ponerMesa(this.value)">
      <input type="text" class="campo" placeholder="Observaciones..." value="${escapeHtml(_vObs)}" data-input="ponerObservaciones(this.value)">`;
  }
  if(_vTipo==='domicilio'){
    const doms=misDatos('domiciliarios');
    return `<div class="cli-busca-wrap">
      <input type="text" class="campo" placeholder="Nombre del cliente" value="${escapeHtml(c.nombre)}" data-input="datoCliente('nombre',this.value,true)" data-focus="sugerirClientes(this.value)" data-blur="ocultarSugerenciasLuego()">
      <input type="tel" class="campo" placeholder="Teléfono" value="${escapeHtml(c.tel)}" data-input="datoCliente('tel',this.value,true)" data-focus="sugerirClientes(this.value)" data-blur="ocultarSugerenciasLuego()">
      <div id="cli-sugerencias" class="cli-sugerencias"></div>
      <input type="text" class="campo" placeholder="Dirección" value="${escapeHtml(c.dir)}" data-input="datoCliente('dir',this.value)">
      <input type="text" class="campo" placeholder="Barrio" value="${escapeHtml(c.barrio)}" data-input="datoCliente('barrio',this.value)">
      <input type="number" class="campo" placeholder="Valor del domicilio" value="${escapeHtml(c.valorDom||'')}" data-input="valorDomicilio(this.value)">
      ${doms.length?`<select class="campo" data-change="datoCliente('domiciliario',this.value)">
        <option value="">Domiciliario...</option>
        ${doms.map(d=>`<option ${c.domiciliario===d.nombre?'selected':''}>${escapeHtml(d.nombre)}</option>`).join('')}
      </select>`:''}
      <input type="text" class="campo" placeholder="Observaciones..." value="${escapeHtml(_vObs)}" data-input="ponerObservaciones(this.value)">`;
  }
  if(_vTipo==='envio'){
    return `<div class="cli-busca-wrap">
      <input type="text" class="campo" placeholder="Nombre del cliente" value="${escapeHtml(c.nombre)}" data-input="datoCliente('nombre',this.value,true)" data-focus="sugerirClientes(this.value)" data-blur="ocultarSugerenciasLuego()">
      <input type="tel" class="campo" placeholder="Teléfono / WhatsApp" value="${escapeHtml(c.tel)}" data-input="datoCliente('tel',this.value,true)" data-focus="sugerirClientes(this.value)" data-blur="ocultarSugerenciasLuego()">
      <div id="cli-sugerencias" class="cli-sugerencias"></div>
      <input type="text" class="campo" placeholder="Dirección" value="${escapeHtml(c.dir)}" data-input="datoCliente('dir',this.value)">
      <input type="text" class="campo" placeholder="Ciudad" value="${escapeHtml(c.ciudad)}" data-input="datoCliente('ciudad',this.value)">
      <input type="text" class="campo" placeholder="Departamento" value="${escapeHtml(c.depto)}" data-input="datoCliente('depto',this.value)">
      <input type="text" class="campo" placeholder="Transportadora" value="${escapeHtml(c.transportadora)}" data-input="datoCliente('transportadora',this.value)">
      <input type="number" class="campo" placeholder="Valor del envío" value="${escapeHtml(c.valorDom||'')}" data-input="valorDomicilio(this.value)">
      <input type="text" class="campo" placeholder="Observaciones..." value="${escapeHtml(_vObs)}" data-input="ponerObservaciones(this.value)">`;
  }
  return `<div class="cli-busca-wrap">
    <input type="text" class="campo" placeholder="Nombre del cliente (opcional)" value="${escapeHtml(c.nombre)}" data-input="datoCliente('nombre',this.value,true)" data-focus="sugerirClientes(this.value)" data-blur="ocultarSugerenciasLuego()">
    <input type="tel" class="campo" placeholder="Teléfono (obligatorio)" value="${escapeHtml(c.tel)}" data-input="datoCliente('tel',this.value,true)" data-focus="sugerirClientes(this.value)" data-blur="ocultarSugerenciasLuego()">
    <div id="cli-sugerencias" class="cli-sugerencias"></div>
    <input type="text" class="campo" placeholder="Observaciones..." value="${escapeHtml(_vObs)}" data-input="ponerObservaciones(this.value)">`;
}

// ---------- Autocompletar / recomendar clientes ya registrados al tomar el pedido ----------
export function sugerirClientes(texto){
  const cont=document.getElementById('cli-sugerencias');
  if(!cont) return;
  const q=(texto||'').trim().toLowerCase();
  if(q.length<2){ cont.innerHTML=''; cont.classList.remove('abierta'); return; }
  const clientes=misDatos('clientes');
  const match=clientes.filter(c=>(c.nombre||'').toLowerCase().includes(q) || (c.tel||'').includes(q))
    .sort((a,b)=>(b.pedidos||0)-(a.pedidos||0))   // primero los más frecuentes
    .slice(0,6);
  if(!match.length){ cont.innerHTML=''; cont.classList.remove('abierta'); return; }
  cont.innerHTML=match.map(c=>`<div class="cli-sug-item" data-mousedown="elegirClienteSugerido('${escapeHtml(c.id)}')">
      <span class="cli-sug-nom">${escapeHtml(c.nombre||'(sin nombre)')}</span>
      <span class="cli-sug-tel">${escapeHtml(c.tel||'')}</span>
      ${c.dir?`<span class="cli-sug-dir">${escapeHtml(c.dir)}${c.barrio?' · '+escapeHtml(c.barrio):''}</span>`:''}
      ${c.pedidos?`<span class="cli-sug-ped">${c.pedidos} pedido${c.pedidos===1?'':'s'}</span>`:''}
    </div>`).join('');
  cont.classList.add('abierta');
}
export function ocultarSugerenciasCliente(){
  const cont=document.getElementById('cli-sugerencias');
  if(cont){ cont.innerHTML=''; cont.classList.remove('abierta'); }
}
export function elegirClienteSugerido(id){
  const c=misDatos('clientes').find(x=>x.id===id); if(!c) return;
  _vCli.nombre=c.nombre||''; _vCli.tel=c.tel||''; _vCli.dir=c.dir||'';
  _vCli.barrio=c.barrio||''; _vCli.ciudad=c.ciudad||''; _vCli.depto=c.depto||'';
  ocultarSugerenciasCliente();
  toast('Cliente: '+c.nombre+(c.pedidos?' ('+c.pedidos+' pedidos)':''),'success');
  render();
}

// Actualiza SOLO el total y la línea de domicilio en la pantalla de venta,
// sin redibujar todo (así no se pierde el foco del campo = no se sale el teclado).
export function actualizarTotalVenta(){
  const bruto=_carrito.reduce((a,i)=>a+i.precio*i.qty,0);
  const total=Math.max(0,bruto-descuentoDe(bruto));
  const valorDom=(_vTipo==='domicilio'||_vTipo==='envio')?Math.max(0,parseFloat(_vCli.valorDom)||0):0;
  const elTot=document.getElementById('venta-total');
  if(elTot) elTot.textContent=fmtMoney(total+valorDom);
  const elDom=document.getElementById('linea-dom');
  if(elDom) elDom.innerHTML = valorDom>0?`<div class="linea"><span>${_vTipo==='envio'?'Envío':'Domicilio'}</span><span>${fmtMoney(valorDom)}</span></div>`:'';
}

// Escanear con pistola: busca el producto por su código de barras y lo agrega al carrito
export function escanearProducto(codigo){
  codigo=(codigo||'').trim();
  if(!codigo) return;
  const productos=misDatos('productos');
  const p=productos.find(x=>x.codBarras && String(x.codBarras).trim()===codigo);
  if(!p){
    toast('Código no registrado: '+codigo+'. Asígnalo a un producto en Inventario.','error');
    sonidoError();
    // Mantener el foco en el escáner para seguir pistoleando
    setTimeout(()=>{ const e=document.getElementById('escaner-venta'); if(e) e.focus(); },50);
    return;
  }
  agregarAlCarrito(p.id);
  // Devolver el foco al escáner para el siguiente producto
  setTimeout(()=>{ const e=document.getElementById('escaner-venta'); if(e) e.focus(); },50);
}

export function agregarAlCarrito(id){
  const neg=STATE.negocio;
  const p=misDatos('productos').find(x=>x.id===id); if(!p) return;
  // F25: marcado agotado (lo ocultaba la lista, pero el escáner lo agregaba igual)
  if(p.agotado){ toast(MSJ.productoAgotadoNoSeVende,'error'); sonidoError(); return; }
  // Combos y productos sueltos: se revisa el stock REAL contando todo el carrito
  if(usaInventario()){
    const faltan=faltantesParaAgregar(id);
    if(faltan.length){
      toast('⛔ No alcanza para '+p.nombre+': '+faltan.join(', '),'error');
      sonidoError(); return;
    }
  } else if(p.stock!=null && p.stock<=0){ toast('Sin existencias: '+p.nombre,'error'); sonidoError(); return; }
  // Plato de restaurante: revisar los insumos de su receta
  if(neg.usaRecetas && p.receta && p.receta.length){
    const insumos=misDatos('insumos');
    const yaEnCarrito=(_carrito.find(i=>i.prodId===id)||{}).qty||0;
    const faltantes=[];
    p.receta.forEach(r=>{
      const ins=insumos.find(x=>x.id===r.insumoId);
      if(ins){
        const necesita=r.cantidad*(yaEnCarrito+1);
        if((ins.stock||0)<necesita) faltantes.push(ins.nombre+(ins.stock<=0?' (agotado)':' (solo quedan '+ins.stock+' '+(ins.unidad||'')+')'));
      }
    });
    if(faltantes.length){
      toast('⛔ No se puede pedir '+p.nombre+': falta '+faltantes.join(', '),'error');
      sonidoError(); return;
    }
  }
  const ex=_carrito.find(i=>i.prodId===id);
  if(ex) ex.qty++; else _carrito.push({prodId:id, nombre:p.nombre, precio:p.precio, qty:1});
  render();
}
export function cambiarQty(idx,delta){
  if(!_carrito[idx]) return;
  _carrito[idx].qty+=delta;
  if(_carrito[idx].qty<=0) _carrito.splice(idx,1);
  render();
}
export function quitarItemCarrito(idx){
  if(!_carrito[idx]) return;
  _carrito.splice(idx,1);
  render();
}
export function vaciarCarrito(){ _carrito=[]; _desc=0; _descPct=0; _descMot=''; render(); }
// F26: el descuento de este momento: el % sobre el subtotal actual, y nunca más que el subtotal
export function descuentoDe(bruto){ return Math.min(bruto, _descPct>0 ? Math.round(bruto*_descPct/100) : _desc); }
export function limpiarPedido(){
  _carrito=[]; _vObs=''; _desc=0; _descPct=0; _descMot=''; _vMesa='';
  STATE.editandoVentaId=null; STATE.agregandoCuentaId=null;
  const neg=STATE.negocio;
  // Venta rápida: precargar el cliente predeterminado (tiendas de alto flujo)
  if(neg && neg.usaClienteFijo){
    _vCli={nombre:neg.clienteFijoNombre||'Consumidor Final', tel:neg.clienteFijoTel||'0000000',
      dir:'',barrio:'',ciudad:'',depto:'',transportadora:'',domiciliario:'',valorDom:0};
  } else {
    _vCli={nombre:'',tel:'',dir:'',barrio:'',ciudad:'',depto:'',transportadora:'',domiciliario:'',valorDom:0};
  }
}
// Pone un pedido guardado en el formulario de venta. conItems: para editarlo
// (carrito, notas y descuento del pedido); sin ellos: cuenta abierta a la que se
// le agregan productos (carrito vacío, el descuento no se toca)
export function cargarPedidoEnVenta(v, conItems){
  _carrito=conItems?(v.items||[]).map(i=>({prodId:i.prodId, nombre:i.nombre, precio:i.precio, qty:i.qty, obs:i.obs||''})):[];
  _vTipo=v.tipo||'llevar'; _vMesa=v.mesa||''; _vObs=conItems?(v.obs||''):'';
  if(conItems){ _desc=v.descuento||0; _descPct=v.descPct||0; _descMot=v.descMotivo||v.descMot||''; }
  _vCli={nombre:v.cliNombre||'', tel:v.cliTel||'', dir:v.cliDir||'', barrio:v.cliBarrio||'',
    ciudad:v.cliCiudad||'', depto:v.cliDepto||'', transportadora:v.transportadora||'',
    domiciliario:v.domiciliario||'', valorDom:v.valorDom||0};
}
// Otros archivos cambian estas variables con su función (un módulo no puede asignar lo que importa)
export function fijarGuardando(v){ _guardando=v; }
export function abrirDescuento(){
  if(!exigirPermiso('descuento','No tienes permiso para aplicar descuentos')) return;
  const bruto=_carrito.reduce((a,i)=>a+i.precio*i.qty,0);
  abrirModal({titulo:'Aplicar descuento', textoBoton:BOTON.aplicar, campos:[
    {id:'tipo', label:'Tipo', tipo:'select', opciones:[{valor:'valor',label:'Valor fijo ($)'},{valor:'pct',label:'Porcentaje (%)'}]},
    {id:'cantidad', label:'Cantidad', tipo:'number', requerido:true, placeholder:'Ej: 5000 o 10'},
    {id:'motivo', label:'Motivo (opcional)'}
  ], extraHTML:`<p class="nota">Subtotal actual: <strong>${fmtMoney(bruto)}</strong></p>`,
  onGuardar:(d)=>{
    const c=parseFloat(d.cantidad)||0;
    if(c<=0){ toast(MSJ.cantidadInvalida,'error'); return; }
    const desc = d.tipo==='pct' ? Math.round(bruto*c/100) : c;
    if(desc>bruto){ toast(MSJ.elDescuentoNoPuedeSuperarEl,'error'); return; }
    if(d.tipo==='pct' && c>100){ toast(MSJ.elDescuentoNoPuedeSuperarEl,'error'); return; }
    _desc=desc; _descPct=d.tipo==='pct'?c:0; _descMot=d.motivo||(d.tipo==='pct'?c+'%':'');
    cerrarModal(); toast(MSJ.descuentoAplicado,'success'); render();
  }});
}
export function quitarDescuento(){ _desc=0; _descPct=0; _descMot=''; render(); }
export function cancelarEdicionPedido(){
  confirmarModal(MSJ.salirSinGuardarLosCambiosDel,()=>{
    limpiarPedido(); fijarEscribiendo(false); STATE.pageNeg='pedidos'; render();
    toast(MSJ.edicionCancelada,'info');
  },'Sí, salir');
}

// ---------- Consecutivo de factura (sin repetidos entre equipos, con o sin internet) ----------
// Con la base en la nube, cada equipo aparta un BLOQUE de números (Dominio.facturas.TAMANO_BLOQUE)
// en una transacción sobre data_<negocio>_factura_seq y los gasta con o sin internet: dos equipos
// nunca reciben el mismo. El bloque vive en el equipo (localStorage, por negocio).
// Sin bloque (arrancó sin internet o se le acabó): número PROVISIONAL P-<equipo>-<fecha y hora>,
// que no se repite, y al reconectar recibe el definitivo (asignarDefinitivas).
// Modo local (un solo equipo, sin nube): el mayor número + 1, como siempre.
// Los números de un bloque que no se usen quedan como saltos (nunca repetidos).
// Documentation/-03-architecture/facturas-sin-conexion.md

export let _reservandoFactura=false, _ultimoProvisional='';
export function fijarFacturaReservada(){ _reservandoFactura=false; }   // al cerrar sesión o cambiar de negocio
export function maxFacturaLocal(){ return Dominio.facturas.mayorNumero(misDatos('ventas')); }
export function enNube(){ return !!(Datos.entorno && Datos.entorno!=='local'); }
const claveBloque=n=>'ws_bloque_'+n;
export function leerBloque(n){ try{ return JSON.parse(localStorage.getItem(claveBloque(n))||'[]')||[]; }catch(e){ return []; } }
export function guardarBloque(n, rangos){ try{ localStorage.setItem(claveBloque(n), JSON.stringify(rangos||[])); }catch(e){ console.warn('Bloque de facturas', e); } }
// Código de este equipo para los números provisionales (al azar, una vez)
export function codigoEquipo(){
  let c=null; try{ c=localStorage.getItem('ws_equipo'); }catch(e){}
  if(!c || !/^[A-Z0-9]{4}$/.test(c)){
    c=Cripto.claveAleatoria(4).toUpperCase().replace(/[^A-Z0-9]/g,'X');
    try{ localStorage.setItem('ws_equipo', c); }catch(e){}
  }
  return c;
}
// Aparta otro bloque si quedan pocos (y luego da su número definitivo a lo que salió provisional)
export function reservarFactura(){
  if(!FB_READY || !STATE.negocio || _reservandoFactura) return;
  const negId=STATE.negocio.id;
  if(!Dominio.facturas.necesitaBloque(leerBloque(negId))){ asignarDefinitivas(); return; }
  _reservandoFactura=true;
  const k=Dominio.facturas.TAMANO_BLOQUE;
  Datos.reservarConsecutivo(negId, maxFacturaLocal(), k)
    .then(hasta=>{ if(hasta) guardarBloque(negId, Dominio.facturas.agregarRango(leerBloque(negId), hasta-k+1, hasta)); })
    .catch(e=>console.warn('Reserva de facturas:',e&&e.message))
    .then(()=>{ _reservandoFactura=false; if(STATE.negocio && STATE.negocio.id===negId) asignarDefinitivas(); });
}
export function siguienteFactura(){
  const negId=STATE.negocio.id;
  if(!enNube()){
    const seq=parseInt(DB.get(claveDe(negId,'factura_seq')))||0;
    return Dominio.facturas.formatearFactura(Dominio.facturas.elegirNumero(null, maxFacturaLocal(), seq));
  }
  const t=Dominio.facturas.tomarDelBloque(leerBloque(negId));
  setTimeout(reservarFactura,0);   // dejar listo el siguiente bloque si quedan pocos
  if(t){ guardarBloque(negId, t.rangos); return Dominio.facturas.formatearFactura(t.numero); }
  let p=Dominio.facturas.numeroProvisional(codigoEquipo(), Date.now());
  if(p===_ultimoProvisional.split('~')[0]){ const k=(parseInt(_ultimoProvisional.split('~')[1])||1)+1; _ultimoProvisional=p+'~'+k; p=p+'-'+k; }
  else _ultimoProvisional=p;
  return p;
}
// Las ventas de ESTE equipo que salieron con número provisional reciben el definitivo del bloque
// (transacción por venta: si otro equipo ya la tocó, no se pisa). Queda el provisional para buscarla.
export let _asignando=false;
export function asignarDefinitivas(){
  if(_asignando || !enNube() || !STATE.negocio) return;
  const negId=STATE.negocio.id, yo=codigoEquipo();
  const prov=misDatos('ventas').filter(v=>Dominio.facturas.equipoDeProvisional(v.factura)===yo)
    .sort((a,b)=>String(a.factura).localeCompare(String(b.factura)));
  if(!prov.length) return;
  _asignando=true;
  const hechos=[];
  const siguiente=()=>{
    const v=prov.shift();
    const t=v && Dominio.facturas.tomarDelBloque(leerBloque(negId));
    if(!v || !t){ terminar(); return; }
    guardarBloque(negId, t.rangos);
    const def=Dominio.facturas.formatearFactura(t.numero), provisional=v.factura;
    Datos.transaccionRegistro('ventas', v.id, cur=>(cur && cur.factura===provisional) ? Object.assign({}, cur, {factura:def, facturaProvisional:provisional}) : undefined)
      .then(r=>{ if(r.committed){ hechos.push(provisional+' → '+def); logAudit('Número definitivo', provisional+' → '+def); } })
      .catch(e=>reportarError('el número definitivo', e))
      .then(siguiente);
  };
  const terminar=()=>{
    _asignando=false;
    if(hechos.length){ toast(hechos.length+' venta(s) hechas sin internet ya tienen su número definitivo (Reimpresiones)','info'); refrescarSiSePuede(); }
    if(prov.length) setTimeout(reservarFactura,0);   // faltaron números: otro bloque
  };
  siguiente();
}

// ---------- Crear la venta (base común) ----------
// opc.sinFactura: cobro directo: el número se toma al confirmar el cobro (un cobro cancelado no gasta uno)
export function armarVenta(estado, opc){
  const neg=STATE.negocio;
  const cajaAbierta=cajaActual();
  const bruto=_carrito.reduce((a,i)=>a+i.precio*i.qty,0);
  const desc=descuentoDe(bruto);
  if(desc<_desc && !_descPct && bruto>0) toast(MSJ.elDescuentoSeAjustoAlSubtotal,'info');   // F26: quitaron productos
  const total=Math.max(0,bruto-desc);
  // S9: un domicilio negativo sería un descuento sin permiso
  const valorDom=(_vTipo==='domicilio'||_vTipo==='envio')?Math.max(0,parseFloat(_vCli.valorDom)||0):0;
  const ventas=misDatos('ventas');
  // Si estamos EDITANDO un pedido, reusamos su id, factura, fecha y caja
  const orig = STATE.editandoVentaId ? ventas.find(x=>x.id===STATE.editandoVentaId) : null;
  let factura, id, fecha, cajaId;
  if(orig){
    id=orig.id; factura=orig.factura; fecha=orig.fecha; cajaId=orig.cajaId;
  } else {
    id=uid(); factura=(opc&&opc.sinFactura)?'':siguienteFactura(); fecha=now(); cajaId=cajaAbierta?cajaAbierta.id:null;
  }
  const propina=orig?(orig.propina||0):0;
  const recargo=orig?(orig.recargo||0):0;
  // Al editar se CONSERVA todo lo que ya tenía la venta (pagos, cobro, horas…)
  // y solo se reemplaza lo que el usuario cambió. Antes se perdía el registro
  // del pago y la venta quedaba descuadrada.
  return Object.assign({}, orig||{}, {
    id:id, factura:factura,
    jornada: (orig&&orig.jornada) ? orig.jornada : jornadaActual(),
    items:_carrito.slice(),
    subtotal:total, subtotalBruto:bruto, descuento:desc, descPct:_descPct||0, descMotivo:_descMot,
    valorDom, propina, recargo,
    total: total+valorDom+propina+recargo,
    metodo:orig?orig.metodo:'', estado: orig?orig.estado:estado,
    tipo:_vTipo, cajaId:cajaId, sucursalId:orig?(orig.sucursalId||'principal'):sucursalActual(),
    vendedor:orig?orig.vendedor:STATE.user.nombre, vendedorId:orig?(orig.vendedorId||null):(STATE.user.id||null), fecha:fecha,
    editadoPor: orig?STATE.user.nombre:undefined,
    editadoEn: orig?now():undefined,
    obs:_vObs, mesa:_vTipo==='mesa'?_vMesa:'',
    cliNombre:_vCli.nombre||'', cliTel:_vCli.tel||'', cliDir:_vCli.dir||'', cliBarrio:_vCli.barrio||'',
    cliCiudad:_vCli.ciudad||'', cliDepto:_vCli.depto||'',
    transportadora:_vCli.transportadora||'', domiciliario:_vCli.domiciliario||'', domiciliarioId:idDomiciliario(_vCli.domiciliario),
    estadoCocina: orig?(orig.estadoCocina||''):(neg.usaCocina?'pendiente':'')
  });
}

// Valida datos mínimos del cliente según el tipo de pedido.
// Teléfono obligatorio en Llevar y Domicilio (para poder guardar el cliente).
export function validarClientePedido(){
  const neg=STATE.negocio;
  // Con cliente predeterminado (venta rápida) no se piden datos del cliente
  if(neg && neg.usaClienteFijo && _vTipo!=='domicilio' && _vTipo!=='envio') return true;
  const tel=(_vCli.tel||'').trim();
  if((_vTipo==='llevar'||_vTipo==='domicilio'||_vTipo==='envio')){
    if(!tel){ toast('El teléfono es obligatorio para '+(_vTipo==='llevar'?'pedidos para llevar':'domicilios')+' (así se guarda el cliente)','error'); return false; }
    if(tel.replace(/\D/g,'').length<7){ toast(MSJ.escribeUnTelefonoValido,'error'); return false; }
  }
  if(_vTipo==='domicilio' && !(_vCli.dir||'').trim()){ toast(MSJ.laDireccionEsObligatoriaParaDomicilios,'error'); return false; }
  return true;
}

// ---------- LOGÍSTICA: registrar salida/entrega de mercancía (sin dinero) ----------
export function registrarSalida(){
  if(_guardando) return;
  if(!exigirEscritura()) return;                                     // D10
  if(!_carrito.length){ toast(MSJ.agregaProductosPrimero,'error'); return; }
  if(!validarClientePedido()) return;
  _guardando=true;
  bloquearBoton('btn-confirmar','Guardando…');
  try{
    const venta=armarVenta('pagada');   // en logística la "salida" queda cerrada de una
    venta.esSalida=true; venta.metodo='—';
    venta.cobrado=now(); venta.cobradoPor=STATE.user.nombre;
    const ventas=misDatos('ventas');
    ventas.unshift(venta);
    descontarStock(venta);
    guardarMisDatos('ventas',ventas);
    guardarClienteAuto(venta);
    logAudit('Registró salida', (venta.factura||'')+' · '+(venta.cliNombre||''));
    sonidoPedido();
    avisarStockBajo(venta);
    limpiarPedido(); fijarEscribiendo(false);
    STATE.pageNeg='pedidos'; render();
    toast('Salida '+venta.factura+' registrada','success');
    // Logística: la remisión siempre se ofrece (no depende de la ventana Facturas)
    preguntarDespues(MSJ.imprimirRemisionDeEntrega,()=>imprimirFactura(venta.id),'Imprimir');
  }catch(e){ reportarError('registrar la salida', e); toast(MSJ.errorAlRegistrarSalida,'error'); }
  finally{ _guardando=false; }
}

// ---------- FLUJO A: confirmar ahora, cobrar después ----------
// Guardar los cambios de un pedido que se está editando.
// Vale para los dos flujos (cobro directo y confirmar→cobrar).
export function guardarEdicionPedido(){
  if(!exigirPermiso('editar','No tienes permiso para editar pedidos')) return;   // S7
  if(_guardando) return;
  if(!STATE.editandoVentaId){ toast(MSJ.noHayNingunPedidoEnEdicion,'error'); return; }
  if(!_carrito.length){ toast(MSJ.elPedidoNoPuedeQuedarVacio,'error'); return; }
  if(!validarClientePedido()) return;
  guardarEdicion(true);
}
// D9: la edición se guarda sobre la versión del SERVIDOR y solo si nadie cambió el pedido
// mientras se editaba (otro equipo lo cobró, le agregó productos o lo anuló). Si cambió,
// no se pisa: se avisa y se puede volver a editar con lo nuevo.
export function guardarEdicion(desdeEdicion){
  const orig=misDatos('ventas').find(x=>x.id===STATE.editandoVentaId);
  if(!orig){ toast(MSJ.esePedidoYaNoExiste,'error'); limpiarPedido(); fijarEscribiendo(false); render(); return; }
  const yaDescontado = orig.stockAplicado===true || (desdeEdicion && orig.stockAplicado===undefined && orig.estado==='pagada');
  if(yaDescontado){
    const d=difRequerimientos(requerimientos(orig.items), requerimientos(_carrito));
    const faltan=faltantesPara(d);
    if(faltan.length){ toast('⛔ No alcanza el inventario: '+faltan.join(', '),'error'); sonidoError(); return; }
  }
  _guardando=true;
  bloquearBoton('btn-confirmar','Guardando…');
  const itemsAntes=JSON.parse(JSON.stringify(orig.items||[]));
  const totalAntes=orig.total||0;
  const estadoAntes=orig.estado;
  let venta;
  try{
    venta=armarVenta(orig.estado||'abierta');
    venta.stockAplicado = yaDescontado ? true : (orig.stockAplicado===true);
  }catch(e){ reportarError('guardar los cambios', e); _guardando=false; return; }
  const cambiaronItems = !Dominio.ventas.mismosItems(itemsAntes, venta.items);
  // Cocina: si cambió lo pedido, hay que volver a prepararlo
  if(STATE.negocio.usaCocina && cambiaronItems && venta.estadoCocina && venta.estadoCocina!=='entregado') venta.estadoCocina='pendiente';
  // Caja: si ya estaba cobrado y cambió el total, el pago queda por ajustar
  if(estadoAntes==='pagada' && Math.abs((venta.total||0)-totalAntes)>0.5) venta.pagoDescuadrado=true;
  Datos.transaccionRegistro('ventas', venta.id, cur=>Dominio.ventas.editarSiSigueIgual(cur, estadoAntes, itemsAntes, venta))
  .then(r=>{
    if(!r.committed){
      if(r.motivo!=='solo_lectura'){ toast(r.valor?MSJ.otroEquipoCambioEstePedido:MSJ.esePedidoYaNoExiste,'error'); limpiarPedido(); fijarEscribiendo(false); STATE.pageNeg='pedidos'; render(); }
      return;
    }
    const v=r.valor;
    // Inventario: solo la diferencia, y solo si ya se había descontado
    if(yaDescontado && cambiaronItems) ajustarStockPorEdicion(itemsAntes, v.items, v.factura);
    logAudit('Editó pedido', (v.factura||'')+': '+fmtMoney(totalAntes)+' → '+fmtMoney(v.total||0)
      +' · '+itemsAntes.reduce((a,x)=>a+x.qty,0)+' → '+v.items.reduce((a,x)=>a+x.qty,0)+' und');
    const idG=v.id, ajustar=!!v.pagoDescuadrado;
    limpiarPedido(); fijarEscribiendo(false); STATE.pageNeg='pedidos'; STATE._itemsAntes=null; render();
    sonidoPedido();
    toast('Pedido '+v.factura+' actualizado'+(cambiaronItems && yaDescontado?' · inventario ajustado':''),'success');
    if(ajustar){ setTimeout(()=>ajustarPagoVenta(idG),450); }
    else if(cambiaronItems && STATE.negocio.usaCocina){
      preguntarDespues(MSJ.cambioElPedidoImprimirLaComanda,
        ()=>{ const vv=misDatos('ventas').find(x=>x.id===idG); if(vv) imprimirComanda(vv); },'Imprimir',450);
    }
  })
  .catch(e=>{ reportarError('guardar los cambios', e); toast(MSJ.errorAlGuardarLosCambios,'error'); })
  .then(()=>{ _guardando=false; });
}

export function confirmarPedido(){
  if(_guardando) return;
  if(!exigirEscritura()) return;                                                   // D10
  if(!_carrito.length){ toast(MSJ.agregaProductosPrimero,'error'); return; }
  if(!validarClientePedido()) return;
  // S11: con un pedido en edición esto GUARDA LA EDICIÓN: el mismo permiso que el otro botón
  if(STATE.editandoVentaId){
    if(!exigirPermiso('editar','No tienes permiso para editar pedidos')) return;
    guardarEdicion(false);
    return;
  }
  if(descuentaAlPedir()){
    const faltan=faltantesPara(requerimientos(_carrito));
    if(faltan.length){ toast('⛔ No alcanza el inventario: '+faltan.join(', '),'error'); sonidoError(); return; }
  }
  _guardando=true;
  bloquearBoton('btn-confirmar','Guardando…');
  try{
    const venta=armarVenta('abierta');
    // Si el negocio descuenta al pedir, el inventario sale ya mismo
    if(descuentaAlPedir()) descontarStock(venta);
    const ventas=misDatos('ventas');
    ventas.unshift(venta);
    guardarMisDatos('ventas',ventas);
    sonidoPedido();
    if(STATE.negocio.usaCocina) imprimirComandaSegura(venta);
    limpiarPedido();
    fijarEscribiendo(false);
    STATE.pageNeg='pedidos';
    STATE._itemsAntes=null;
    render();
    toast('Pedido '+venta.factura+' confirmado','success');
  }catch(e){ reportarError('confirmar el pedido', e); toast(MSJ.errorAlGuardar,'error'); }
  finally{ _guardando=false; }
}

// ---------- FLUJO B: cobrar de una vez ----------
export function cobrarDirecto(){
  if(!exigirPermiso('cobrar','No tienes permiso para cobrar. Pide a un cajero que lo cobre.')) return;
  if(_guardando) return;
  if(!_carrito.length){ toast(MSJ.agregaProductosPrimero,'error'); return; }
  if(!validarClientePedido()) return;
  const venta=armarVenta('abierta', {sinFactura:true});
  abrirCobro(venta, true);
}

export function bloquearBoton(id,texto){
  try{
    const b=document.getElementById(id);
    if(b){ b.disabled=true; b.style.opacity='.55'; b.style.pointerEvents='none'; b.textContent=texto; }
  }catch(e){}
}
// ---------- Campos de Nueva Venta (fase 8: antes eran onclick/oninput compuestos) ----------
export function buscarEnVenta(v){ _vBusca=v; render(); }
export function elegirCategoriaVenta(c){ _vCat=c; render(); }
export function elegirTipoEntrega(t){ _vTipo=t; render(); }
export function ponerMesa(v){ _vMesa=v; }
export function ponerObservaciones(v){ _vObs=v; }
export function datoCliente(campo, v, sugerir){ _vCli[campo]=v; if(sugerir) sugerirClientes(v); }
export function valorDomicilio(v){ _vCli.valorDom=v; actualizarTotalVenta(); }
export function ocultarSugerenciasLuego(){ setTimeout(ocultarSugerenciasCliente, 180); }
// Lector de código de barras: Enter en el campo
export function escanearDesdeCampo(el){ escanearProducto(el.value); el.value=''; }
