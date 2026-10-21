// ============================================================
//  ADAPTADOR DE SALIDA · Almacenamiento local (localStorage)
//  Respaldo en el equipo de todo lo que llega de la nube. Prefijo ws_.
//  Si el navegador bloquea el almacenamiento, no falla: solo no guarda.
// ============================================================

export function crearAlmacenLocal(storage, prefijo){
  const st=storage, pre=prefijo||'ws_';
  return {
    leer(k){ try{ const v=st.getItem(pre+k); return v===null?undefined:JSON.parse(v); }catch(e){ return undefined; } },
    escribir(k,v){ try{ st.setItem(pre+k, JSON.stringify(v)); }catch(e){} },
    borrar(k){ try{ st.removeItem(pre+k); }catch(e){} },
    // Claves propias (sin el prefijo)
    claves(){
      const out=[];
      try{ for(let i=0;i<st.length;i++){ const k=st.key(i); if(k && k.indexOf(pre)===0) out.push(k.substring(pre.length)); } }catch(e){}
      return out;
    },
    // Valores sin prefijo de la app (cola offline, sucursal recordada…)
    leerCrudo(k){ try{ return st.getItem(k); }catch(e){ return null; } },
    escribirCrudo(k,v){ try{ st.setItem(k,v); }catch(e){} },
    borrarCrudo(k){ try{ st.removeItem(k); }catch(e){} }
  };
}
