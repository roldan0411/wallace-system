// ============================================================
//  INTERFAZ · Avisos de lo que llega de otros equipos
//  Pedido nuevo tomado en otro equipo y caja abierta o cerrada en otro equipo
//  (portado del commit 5425800 del repositorio original, adaptado a la caja
//  por sucursal F1 y a comparar por id F15). Los llama el adaptador de datos
//  por sus ganchos (src/arranque.js): no se avisa la carga inicial ni lo propio.
//  Adaptador de entrada: módulo ES. Lo carga ui/manifiesto.js (cargarInterfaz).
//  Doc: Documentation/03-cash-register/03-cash-register.md (Avisos entre equipos)
// ============================================================
import { STATE, fmtMoney, refrescarSiSePuede } from './estado.js';
import { MSJ } from './textos.js';
import { sucursalActual } from './permisos.js';
import { pPedido, toast } from './componentes.js';
import { sonidoPedido, sonidoVenta } from './sonidos.js';

// Un registro que otro equipo acaba de crear (por ahora solo pedidos/ventas)
export function registroNuevoDeNube(tabla, v, opc){
  if(tabla!=='ventas' || !v || !v.id || (opc && opc.inicial) || !STATE.user || !STATE.negocio) return;
  if(v.vendedorId && v.vendedorId===STATE.user.id) return;   // lo hice yo (en otro equipo con mi usuario no se avisa)
  if(v.sucursalId && v.sucursalId!==sucursalActual()) return;   // de otra sede (F1)
  toast('🔔 Nuevo '+pPedido()+' '+(v.factura||'')+(v.vendedor?' · '+v.vendedor:'')+' · '+fmtMoney(v.total||0),'info');
  try{ sonidoPedido(); }catch(e){ console.warn('Sonido',e); }
}
// Una tabla entera que cambió en la nube: la caja de MI sede se abrió o se cerró
export function estadoCaja(lista){
  const c=Dominio.caja.cajaDe(lista, sucursalActual());
  return c ? 'abierta:'+c.id : 'cerrada';
}
export function tablaCambioDeNube(tabla, nuevo, antes, opc){
  if(tabla!=='caja_actual' || !STATE.user || !STATE.negocio) return;
  const e0=estadoCaja(antes), e1=estadoCaja(nuevo);
  if(e0===e1) return;                       // un gasto o una entrada: no cambia lo que se puede hacer
  if(!(opc && opc.inicial)){
    const c=Dominio.caja.cajaDe(nuevo, sucursalActual());
    if(c){ toast('✅ '+(c.cajero?c.cajero+' abrió la caja':'Caja abierta')+' · ya puedes vender','success'); try{ sonidoVenta(); }catch(e){ console.warn('Sonido',e); } }
    else toast(MSJ.seCerroLaCaja,'info');
  }
  refrescarSiSePuede(true);                 // abrir o cerrar la caja cambia lo que todos pueden hacer: se muestra ya
}
