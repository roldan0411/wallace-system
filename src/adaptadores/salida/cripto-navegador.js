// ============================================================
//  ADAPTADOR DE SALIDA · Aleatoriedad del navegador
//  El dominio de contraseñas no genera la sal: la recibe de aquí.
// ============================================================

export function nuevaSal(){
  try{
    const a=new Uint8Array(16); (globalThis.crypto||globalThis.msCrypto).getRandomValues(a);
    return Array.from(a).map(x=>x.toString(16).padStart(2,'0')).join('');
  }catch(e){ return (Date.now().toString(16)+Math.random().toString(16).slice(2)).slice(0,32); }
}
const LEGIBLES='abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// Contraseña al azar fácil de dictar (sin 0/O, 1/l/I): la de cada demo nueva
export function claveAleatoria(largo){
  const n=largo||10, a=new Uint32Array(n);
  (globalThis.crypto||globalThis.msCrypto).getRandomValues(a);
  return Array.from(a, x=>LEGIBLES[x % LEGIBLES.length]).join('');
}
export function nuevoId(){ return 'id'+Date.now().toString(36)+Math.random().toString(36).slice(2,7); }
