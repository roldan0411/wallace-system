// ============================================================
//  DOMINIO · Contraseñas (hash con sal, nunca en texto plano)
//  passHash = SHA-256 iterado de "sal|contraseña". Síncrono y sin librerías
//  para no depender de crypto.subtle (que exige HTTPS).
//  La sal aleatoria la genera un adaptador (cripto del navegador).
// ============================================================

export const PASS_ITER=3000;

export function sha256Hex(texto){
  const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const bytes=unescape(encodeURIComponent(String(texto)));   // UTF-8
  const l=bytes.length, w=[];
  for(let i=0;i<l;i++) w[i>>2]|=(bytes.charCodeAt(i)&255)<<(24-(i%4)*8);
  w[l>>2]|=0x80<<(24-(l%4)*8);
  const n=(((l+8)>>6)+1)*16;
  for(let i=(l>>2)+1;i<n;i++) if(w[i]===undefined) w[i]=0;
  w[n-1]=l*8;
  let H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const r=(x,c)=>(x>>>c)|(x<<(32-c)), W=new Array(64);
  for(let b=0;b<n;b+=16){
    for(let t=0;t<64;t++){
      if(t<16) W[t]=w[b+t]|0;
      else{
        const s0=r(W[t-15],7)^r(W[t-15],18)^(W[t-15]>>>3);
        const s1=r(W[t-2],17)^r(W[t-2],19)^(W[t-2]>>>10);
        W[t]=(W[t-16]+s0+W[t-7]+s1)|0;
      }
    }
    let [a,bb,c,d,e,f,g,h]=H;
    for(let t=0;t<64;t++){
      const t1=(h+(r(e,6)^r(e,11)^r(e,25))+((e&f)^(~e&g))+K[t]+W[t])|0;
      const t2=((r(a,2)^r(a,13)^r(a,22))+((a&bb)^(a&c)^(bb&c)))|0;
      h=g; g=f; f=e; e=(d+t1)|0; d=c; c=bb; bb=a; a=(t1+t2)|0;
    }
    H=[(H[0]+a)|0,(H[1]+bb)|0,(H[2]+c)|0,(H[3]+d)|0,(H[4]+e)|0,(H[5]+f)|0,(H[6]+g)|0,(H[7]+h)|0];
  }
  return H.map(x=>(x>>>0).toString(16).padStart(8,'0')).join('');
}
export function hashPass(pass, sal, iter){
  let h=sha256Hex(sal+'|'+String(pass));
  for(let i=1;i<(iter||PASS_ITER);i++) h=sha256Hex(h+sal);
  return h;
}
// Pone la contraseña a un registro (usuario o superadmin) y borra el texto plano
export function ponerPass(rec, pass, sal){
  rec.passSal=sal; rec.passIter=PASS_ITER;
  rec.passHash=hashPass(pass, rec.passSal, rec.passIter);
  delete rec.pass;
  return rec;
}
// ¿Esta contraseña es la del registro? (acepta registros viejos sin migrar)
export function verificarPass(rec, pass){
  if(!rec) return false;
  if(rec.passHash) return hashPass(pass, rec.passSal||'', rec.passIter||PASS_ITER)===rec.passHash;
  return typeof rec.pass==='string' && rec.pass===pass;
}
// ¿El registro todavía guarda la contraseña en texto plano?
export function necesitaMigrar(rec){ return !!(rec && typeof rec.pass==='string' && !rec.passHash); }
