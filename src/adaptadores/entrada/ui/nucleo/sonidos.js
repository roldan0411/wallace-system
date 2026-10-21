// ============================================================
//  INTERFAZ · Sonidos
//  Pitidos de venta, pedido, alerta y error (AudioContext).
//  Adaptador de entrada: módulo ES. Lo que exporta lo importan otros módulos
//  y lo llaman los data-click del HTML generado (nucleo/eventos.js). Lo carga
//  ui/manifiesto.js (cargarInterfaz). Doc: Documentation/README.md
// ============================================================
import { STATE } from './estado.js';


// ============================================================
//  SONIDOS (iguales a Portal Imperial)
// ============================================================
export let _audioCtx=null;
export function beep(freq,dur,vol){
  try{
    const ctx=new (window.AudioContext||window.webkitAudioContext)();
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value=freq||800; o.type='square';
    g.gain.setValueAtTime(Math.min(1,vol||0.3), ctx.currentTime);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+(dur||200)/1000);
    o.stop(ctx.currentTime+(dur||200)/1000);
  }catch(e){}
}
export function campana(freq,t0,dur,vol){
  try{
    _audioCtx = _audioCtx || new (window.AudioContext||window.webkitAudioContext)();
    const ctx=_audioCtx, t=ctx.currentTime+t0;
    const o=ctx.createOscillator(), g=ctx.createGain();
    o.type='triangle'; o.frequency.value=freq;
    o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0,t);
    g.gain.linearRampToValueAtTime(vol,t+0.01);
    g.gain.exponentialRampToValueAtTime(0.0008,t+dur);
    o.start(t); o.stop(t+dur+0.02);
    const o2=ctx.createOscillator(), g2=ctx.createGain();
    o2.type='sine'; o2.frequency.value=freq*2.01;
    o2.connect(g2); g2.connect(ctx.destination);
    g2.gain.setValueAtTime(0,t);
    g2.gain.linearRampToValueAtTime(vol*0.4,t+0.01);
    g2.gain.exponentialRampToValueAtTime(0.0008,t+dur*0.7);
    o2.start(t); o2.stop(t+dur*0.7+0.02);
  }catch(e){}
}
export function sonidosOn(){ const n=STATE.negocio; return !n || n.sonidos!==false; }
export function sonidoVenta(){ if(sonidosOn()){ campana(1047,0,0.15,0.6); campana(1568,0.09,0.2,0.6); } }
export function sonidoPedido(){ if(sonidosOn()){ campana(1047,0,0.18,0.9); campana(1319,0.10,0.18,0.9); campana(1568,0.20,0.30,0.9); } }
export function sonidoAlerta(){ if(sonidosOn()){ beep(600,150,0.4); setTimeout(()=>beep(600,150,0.4),200); } }
export function sonidoError(){ if(sonidosOn()) beep(250,300,0.5); }
