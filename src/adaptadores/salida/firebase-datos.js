// ============================================================
//  ADAPTADOR DE SALIDA · Firebase Realtime Database + respaldo local
//  Implementa el PuertoDatos (aplicacion/puertos/datos.js).
//
//  Arquitectura (heredada de Portal Imperial, probada en producción):
//   · Lista fija de tablas que se sincronizan; un listener POR TABLA.
//   · La nube manda: lo que llega se acepta.
//   · Cada registro vive en data/<clave>_r/<id> y solo se suben los CAMPOS
//     que cambiaron. Al borrar queda una marca en data/<clave>_x/<id> para
//     que el registro no "reviva" desde otro equipo.
//   · Las tablas únicas (caja_actual, config, …) se guardan enteras.
//   · Cambios concurrentes (stock, caja, consecutivos) van con transacciones.
//   · En el navegador CACHE[clave] sigue siendo el array completo.
//
//  No conoce la interfaz: avisa a la aplicación con "ganchos".
//
//  Con cuentas de Firebase (S1, estado.cuentas=true):
//   · negocios vive por registro en data/negocios_r/<id>; cada empleado lee
//     solo el suyo. CACHE.negocios sigue siendo un array.
//   · los usuarios viven en data_<negocio>_usuarios_r, SIN contraseñas.
//     get('usuarios') los junta; set('usuarios') los reparte por negocio.
//   · data/usuarios (con hash) queda solo para migrar cuentas viejas
//     (CACHE.usuarios_legado, solo super-admin).
// ============================================================
import { CAMPOS_PASS, CAMPOS_NEGOCIO_RESERVADOS } from '../../dominio/cuentas.js';
import { idSeguro, negocioParaGuardar } from '../../dominio/negocio.js';

// Tablas de cada negocio: data_<negocio>_<tabla>
export const TABLAS=['usuarios','productos','insumos','ventas','clientes','cierres',
  'caja_actual','movimientos','domiciliarios','citas','gastos_negocio','config','factura_seq','auditoria','conteos',
  'conceptos_gasto','resumen'];
// Se guardan enteras (un solo valor). resumen = cifras de ventas para el panel del super-admin (R1)
export const TABLAS_UNICAS=['caja_actual','config','factura_seq','conceptos_gasto','resumen'];
// Globales (no dependen del negocio). Con cuentas (S1) ya no se descargan antes del login.
export const TABLAS_GLOBALES=['negocios','superadmins','usuarios'];
// Claves de data/ que con cuentas no se copian tal cual al caché
const CLAVES_ESQUEMA_S1={negocios:1, negocios_r:1, negocios_bk:1, usuarios:1, migracion_s1:1};
const SRV_NEG='__negocios';   // REG_SRV de negocios_r

/**
 * @param {Object} opc
 * @param {Object} opc.local      adaptador de almacenamiento local (almacen-local.js)
 * @param {Object} [opc.sdk]      SDK MODULAR de Firebase: {app, database} (firebase-sdk.js en el navegador;
 *                                los paquetes firebase/app y firebase/database en las pruebas)
 * @param {Object} [opc.config]   configuración de Firebase (firebase-config.js → elegirEntorno)
 * @param {Object} [opc.emuladores] {database:'host:puerto'} para desarrollo local
 * @param {string} [opc.entorno]  produccion | pruebas | emulador | local (la interfaz lo muestra en el login)
 * @param {Object} opc.ganchos    {negocioActual():negocio|null, alCambiar(), alEstadoConexion(estado), alCargarTabla(tabla),
 *        alRegistroNuevo(tabla, valor, {inicial}), alCambiarTabla(tabla, nuevo, viejo, {inicial}),
 *        soloLectura(negId):boolean (D10: no escribir nada de ese negocio), alEscrituraNegada({motivo, que})}
 *        inicial = llegó en los primeros segundos de sincronizar (carga, no un cambio de otro equipo)
 */
export function crearAdaptadorFirebase(opc){
  const local=opc.local;
  const g=Object.assign({negocioActual:()=>null, alCambiar(){}, alEstadoConexion(){}, alCargarTabla(){}, alCambiarNegocio(){},
    alRegistroNuevo(){}, alCambiarTabla(){}, soloLectura(){ return false; }, alEscrituraNegada(){}}, opc.ganchos||{});
  const ESPERA_INICIAL=2500;   // ms: lo que llega antes es la carga, no un aviso
  let inicioSinc=0;
  const aviso=(fn)=>{ try{ fn({inicial:Date.now()-inicioSinc<ESPERA_INICIAL}); }catch(e){ console.warn('Aviso de datos',e); } };
  const CACHE={};
  const REG_SRV={};        // clave -> {id: JSON del último estado recibido}
  const REG_BORRADOS={};   // clave -> {id: fecha}
  const estado={listo:false, nubeLista:false, globalesLeidas:false, cuentas:false, conectado:false};
  let sesion={superAdmin:false, negId:null};
  let FB=null, D=null;   // FB = la base (getDatabase); D = funciones del SDK modular (ref, get, onValue…)
  // Los escuchadores se guardan como la función que los quita (el SDK modular la devuelve)
  let listenersNeg=[], sincTodoOn=false, globalesOn=false, quitarNegPropio=null, quitarTodo=null;
  let refsPanel=[], negPanel={};   // R1: lo que escucha el panel del super-admin
  const migrando={};
  const COLA='ws_cola_reg';

  // Atajos del SDK modular de Firebase
  const nodo=r=>D.ref(FB, r);
  const leerNodo=r=>D.get(nodo(r)).then(sn=>sn.val());
  const actualizar=(r,u)=>D.update(nodo(r), u);
  const transaccion=(r,fn)=>D.runTransaction(nodo(r), fn);
  const escuchar=(r,fn,err)=>D.onValue(nodo(r), fn, err);   // devuelve la función que deja de escuchar

  const esTablaRegistros=t=>TABLAS_UNICAS.indexOf(t)<0;
  const claveDe=(negId,tabla)=>'data_'+negId+'_'+tabla;
  const claveReg=(n,t)=>claveDe(n,t)+'_r';
  const claveBorr=(n,t)=>claveDe(n,t)+'_x';
  const limpiar=o=>{ try{ return JSON.parse(JSON.stringify(o)); }catch(e){ return null; } };
  const campoOrden=t=>({ventas:'fecha', cierres:'cierre', movimientos:'fecha', conteos:'fecha',
    gastos_negocio:'fecha', citas:'fechaHora'}[t]||'creado');
  function ordenar(arr,tabla){
    const campo=campoOrden(tabla);
    if(arr.length && arr[0][campo]!==undefined) arr.sort((a,b)=>new Date(b[campo]||0)-new Date(a[campo]||0));
    return arr;
  }
  const negId=()=>{ const n=g.negocioActual(); return n?n.id:null; };
  const conexion=e=>{ try{ g.alEstadoConexion(e); }catch(x){} };
  const aLista=v=>Array.isArray(v)?v.filter(Boolean):(v&&typeof v==='object'?Object.values(v).filter(Boolean):[]);
  const esPermisoNegado=e=>{ const m=String((e&&(e.code||e.message))||'').toLowerCase(); return m.indexOf('permission')>-1; };
  // D10: la base rechazó una escritura (reglas): la persona tiene que enterarse (antes solo iba a la consola)
  const negada=(que,e)=>{ if(esPermisoNegado(e)){ try{ g.alEscrituraNegada({motivo:'permiso', que}); }catch(x){} } };
  // D10: negocio en solo lectura (prueba o demo vencida): no se escribe NADA de sus tablas, ni en la
  // nube ni en el equipo. Lo que la pantalla ya cambió en memoria se deshace con la copia guardada.
  function bloqueado(n, clave){
    let b=false; try{ b=!!(n && g.soloLectura(n)); }catch(e){}
    if(!b) return false;
    if(clave){ const v=local.leer(clave); CACHE[clave]=(v===undefined?null:v); }
    try{ g.alEscrituraNegada({motivo:'solo_lectura', que:clave||n}); }catch(e){}
    return true;
  }
  const negDeClave=k=>{ const m=/^data_([^_]+)_/.exec(k||''); return m?m[1]:null; };
  const sinPass=r=>{ const c=limpiar(r)||{}; CAMPOS_PASS.forEach(k=>{ delete c[k]; }); return c; };
  // Negocios en el orden de creación (como el array de siempre)
  const ordenarNegocios=l=>l.sort((a,b)=>String(a.creado||'').localeCompare(String(b.creado||'')));
  // Con cuentas: quién está en sesión (lo fija la interfaz al entrar)
  function configurarSesion(s){
    s=s||{};
    estado.cuentas=!!s.cuentas;
    sesion={superAdmin:!!s.superAdmin, negId:s.negId||null, vendedor:s.vendedor||null};   // vendedor = su superId
  }

  // ---------- Lectura/escritura de claves completas ----------
  function get(k){
    if(k==='usuarios' && estado.cuentas) return usuariosVirtuales();
    if(CACHE[k]!==undefined) return CACHE[k];
    const v=local.leer(k);
    CACHE[k]=(v===undefined?null:v);
    return CACHE[k];
  }
  function set(k,v){
    if(estado.cuentas && estado.listo && FB){
      if(k==='negocios'){ setNegocios(v); return; }
      if(k==='usuarios'){ setUsuarios(v); return; }
    }
    if(bloqueado(negDeClave(k), k)) return;
    CACHE[k]=v;
    local.escribir(k,v);
    if(estado.listo && FB){
      try{
        // Firebase RECHAZA objetos con campos undefined: el viaje por JSON los quita
        const limpio=(v===undefined||v===null)?null:JSON.parse(JSON.stringify(v));
        const p=D.set(nodo('data/'+k), limpio);
        if(p && p.catch) p.catch(e=>{ console.warn('FB set (nube)',k,e&&e.message); conexion('error'); negada(k,e); });
      }catch(e){ console.warn('FB set',k,e&&e.message); conexion('error'); }
    }
  }
  function soloLocal(clave,valor){ CACHE[clave]=valor; local.escribir(clave,valor); }
  function guardarLocal(k,v){ CACHE[k]=(v===undefined?null:v); local.escribir(k,CACHE[k]); }

  function misDatos(tabla){ const n=negId(); if(!n) return []; return get(claveDe(n,tabla))||[]; }
  function datosDe(n,tabla){ return get(claveDe(n,tabla))||[]; }

  // ---------- Globales con cuentas (S1) ----------
  // Todos los usuarios que hay en caché (super-admin: todos; empleado: su negocio)
  function usuariosVirtuales(){
    const out=[], vistos={};
    Object.keys(CACHE).forEach(k=>{
      const m=/^data_(.+)_usuarios$/.exec(k);
      if(!m || !Array.isArray(CACHE[k])) return;
      CACHE[k].forEach(u=>{ if(u&&u.id&&!vistos[u.id]){ vistos[u.id]=1; out.push(Object.assign({negocioId:m[1]}, u)); } });
    });
    return out;
  }
  // Reparte el array de usuarios en las tablas de cada negocio (sin contraseñas)
  function setUsuarios(arr){
    const actuales={}; usuariosVirtuales().forEach(u=>{ actuales[u.id]=u; });
    const nuevos={}; (arr||[]).forEach(u=>{ if(u&&u.id&&u.negocioId) nuevos[u.id]=u; });
    Object.keys(nuevos).forEach(id=>{
      const u=sinPass(nuevos[id]);
      if(JSON.stringify(u)!==JSON.stringify(actuales[id])) guardarEn(u.negocioId, 'usuarios', [u]);
    });
    Object.keys(actuales).forEach(id=>{ if(!nuevos[id]) eliminarEn(actuales[id].negocioId, 'usuarios', id); });
  }
  // Sube solo los CAMPOS que cambiaron de cada negocio (data/negocios_r/<id>/<campo>).
  // El admin de un negocio solo puede escribir campos no reservados (reglas): los demás ni se envían.
  function setNegocios(arr){
    if(!sesion.superAdmin && bloqueado(sesion.negId||negId(), 'negocios')) return;
    const lista=aLista(arr).filter(n=>n.id);
    const srv=REG_SRV[SRV_NEG]||(REG_SRV[SRV_NEG]={});
    const u={};
    lista.forEach(n=>{
      const nuevo=limpiar(n); if(!nuevo) return;
      const base=srv[n.id];
      if(!base){
        if(sesion.superAdmin) u['negocios_r/'+n.id]=nuevo;
        else return;      // un empleado no crea negocios
      } else {
        const prev=JSON.parse(base);
        const campos={};
        Object.keys(nuevo).forEach(f=>{ if(JSON.stringify(nuevo[f])!==JSON.stringify(prev[f])) campos[f]=nuevo[f]; });
        Object.keys(prev).forEach(f=>{ if(!(f in nuevo)) campos[f]=null; });
        Object.keys(campos).forEach(f=>{
          if(!sesion.superAdmin && CAMPOS_NEGOCIO_RESERVADOS.indexOf(f)>-1) return;
          u['negocios_r/'+n.id+'/'+f]=campos[f];
        });
      }
      srv[n.id]=JSON.stringify(nuevo);
    });
    if(sesion.superAdmin){
      Object.keys(srv).forEach(id=>{ if(!lista.some(n=>n.id===id)){ u['negocios_r/'+id]=null; delete srv[id]; } });
    }
    soloLocal('negocios', ordenarNegocios(lista.slice()));
    if(!Object.keys(u).length) return;
    const pr=actualizar('data', u);
    if(pr&&pr.catch) pr.catch(e=>{ console.warn('FB negocios',e&&e.message); conexion('error'); negada('negocios',e); if(!esPermisoNegado(e)) encolar(u); });
  }
  // Rearma negocios (y el respaldo de usuarios viejos) desde una foto de data/
  function aplicarGlobalesCuentas(data){
    let cambio=false;
    const tieneR=!!data.negocios_r;
    const lista=ordenarNegocios(tieneR ? aLista(data.negocios_r).filter(n=>n.id) : aLista(data.negocios).filter(n=>n.id));
    const srv={};
    if(tieneR) lista.forEach(n=>{ srv[n.id]=JSON.stringify(n); });
    REG_SRV[SRV_NEG]=srv;
    if(JSON.stringify(lista)!==JSON.stringify(CACHE.negocios)){ guardarLocal('negocios', lista); cambio=true; }
    const leg=aLista(data.usuarios);
    if(JSON.stringify(leg)!==JSON.stringify(CACHE.usuarios_legado)){ guardarLocal('usuarios_legado', leg); cambio=true; }
    return cambio;
  }
  // Empleado: su negocio (data/negocios_r/<id>) leído y escuchado en vivo
  function aceptarNegocio(neg){
    (REG_SRV[SRV_NEG]||(REG_SRV[SRV_NEG]={}))[neg.id]=JSON.stringify(neg);
    // El super-admin (también supervisando) conserva la lista completa: solo se actualiza ese negocio
    const lista=sesion.superAdmin
      ? ordenarNegocios(aLista(CACHE.negocios).filter(x=>x.id!==neg.id).concat([neg]))
      : [neg];
    if(JSON.stringify(lista)===JSON.stringify(CACHE.negocios)) return false;
    soloLocal('negocios', lista);
    return true;
  }
  function cargarNegocioPropio(n){
    if(!estado.listo || !FB || !n) return Promise.resolve(null);
    detenerNegocioPropio();
    const ruta='data/negocios_r/'+n;
    return leerNodo(ruta).then(neg=>{
      if(neg && neg.id) aceptarNegocio(neg);
      quitarNegPropio=escuchar(ruta, sv=>{
        const v=sv.val();
        if(v && v.id && aceptarNegocio(v)){ try{ g.alCambiarNegocio(v); }catch(e){} g.alCambiar(); }
      }, ()=>{});
      return (neg && neg.id) ? neg : null;
    });
  }
  function detenerNegocioPropio(){
    if(quitarNegPropio){ try{ quitarNegPropio(); }catch(e){} quitarNegPropio=null; }
  }
  // Una sola vez (fase 2 del Plan B): data/negocios (array) -> data/negocios_r/<id> y
  // data/usuarios -> data_<negocio>_usuarios_r/<id> SIN contraseñas. data/usuarios se
  // conserva (con hash) para migrar cuentas; el array de negocios queda en negocios_bk.
  // Solo funciona con las reglas de transición o como super-admin.
  function migrarTablasGlobales(){
    if(!estado.listo || !FB) return Promise.resolve({hecho:false, motivo:'sin_nube'});
    const leer=r=>leerNodo('data/'+r);
    return leer('migracion_s1').then(m=>{
      if(m && m.negocios) return {hecho:false, motivo:'ya_migrado'};
      return Promise.all([leer('negocios'), leer('usuarios'), leer('negocios_r')]).then(([negsCrudo, usCrudo, yaR])=>{
        // S8: las reglas validan logo e ids; lo viejo que no cumpla se limpia o se deja (con aviso), sin frenar todo
        const todos=aLista(negsCrudo).filter(n=>n.id);
        const negs=todos.filter(n=>/^[A-Za-z0-9-]{1,64}$/.test(n.id)).map(negocioParaGuardar);
        if(negs.length<todos.length) console.warn('Migración: '+(todos.length-negs.length)+' negocio(s) con id inválido no se copiaron');
        const us=aLista(usCrudo).filter(x=>x.id&&x.negocioId&&idSeguro(x.id));
        const ids={}; negs.forEach(n=>{ ids[n.id]=1; }); Object.keys(yaR||{}).forEach(id=>{ ids[id]=1; });
        const negIds=Object.keys(ids);
        return Promise.all(negIds.map(id=>leer(claveReg(id,'usuarios')).then(v=>[id, v||{}]))).then(pares=>{
          const yaUs={}; pares.forEach(([id,v])=>{ yaUs[id]=v; });
          const u={}, ahora=new Date().toISOString();
          let nn=0, nu=0;
          negs.forEach(n=>{ if(!(yaR||{})[n.id]){ u['negocios_r/'+n.id]=limpiar(n); nn++; } });
          us.forEach(x=>{
            if(!ids[x.negocioId] || (yaUs[x.negocioId]||{})[x.id]) return;
            u[claveReg(x.negocioId,'usuarios')+'/'+x.id]=sinPass(x); nu++;
          });
          if(negsCrudo){ u['negocios']=null; u['negocios_bk']=negs; }
          u['migracion_s1']={negocios:ahora, usuarios:ahora, negociosCopiados:nn, usuariosCopiados:nu};
          return actualizar('data', u).then(()=>({hecho:true, negocios:nn, usuarios:nu}));
        });
      });
    }).catch(e=>({hecho:false, motivo:esPermisoNegado(e)?'permiso':'error', error:e&&e.message}));
  }
  // Lee un registro directo de la nube (p. ej. el usuario de un negocio al migrar su cuenta)
  function leerRegistro(n, tabla, id){
    if(!estado.listo || !FB || !n || !id) return Promise.resolve(null);
    return leerNodo('data/'+claveReg(n,tabla)+'/'+id);
  }
  // data/usuarios del esquema viejo (con hash): solo para quitar o actualizar cuentas
  // aún no migradas. fn recibe la lista y devuelve la nueva (o undefined = no tocar).
  function modificarUsuariosLegado(fn){
    if(!estado.listo || !FB) return Promise.resolve({committed:false});
    return transaccion('data/usuarios', cur=>{
      if(cur===null) return cur;
      const nv=fn(aLista(cur)); return nv===undefined?undefined:limpiar(nv);
    }).then(res=>{ guardarLocal('usuarios_legado', aLista(res.snapshot.val())); return {committed:res.committed}; });
  }

  // ---------- Cola offline ----------
  function encolar(updates){
    try{ const cola=JSON.parse(local.leerCrudo(COLA)||'{}'); Object.assign(cola,updates); local.escribirCrudo(COLA,JSON.stringify(cola)); }catch(e){}
  }
  function subirCola(){
    if(!estado.listo || !FB) return;
    let cola={}; try{ cola=JSON.parse(local.leerCrudo(COLA)||'{}'); }catch(e){}
    if(!Object.keys(cola).length){ local.borrarCrudo(COLA); return; }
    actualizar('data', cola).then(()=>local.borrarCrudo(COLA)).catch(e=>{
      console.warn('Cola de registros:',e&&e.message);
      if(!esPermisoNegado(e)) return;
      // Una ruta negada por las reglas bloquearía toda la cola: se sube una por una y se descarta lo negado
      Promise.all(Object.keys(cola).map(k=>{ const u={}; u[k]=cola[k]; return actualizar('data', u).catch(()=>{}); }))
        .then(()=>local.borrarCrudo(COLA));
    });
  }

  // ---------- Sincronización por registro ----------
  // Sube SOLO lo que cambió de cada registro
  function subirRegistros(n, tabla, lista){
    const clave=claveDe(n,tabla), reg=claveReg(n,tabla);
    const srv=REG_SRV[clave]||(REG_SRV[clave]={});
    const tomb=REG_BORRADOS[clave]||{};
    const updates={};
    (lista||[]).forEach(x=>{
      if(!x||!x.id) return;
      if(tomb[x.id]) return;                       // borrado: no revive
      const nuevo=limpiar(x); if(!nuevo) return;
      const base=srv[x.id];
      if(!base){ updates[reg+'/'+x.id]=nuevo; }
      else{
        const prev=JSON.parse(base);
        Object.keys(nuevo).forEach(f=>{ if(JSON.stringify(nuevo[f])!==JSON.stringify(prev[f])) updates[reg+'/'+x.id+'/'+f]=nuevo[f]; });
        Object.keys(prev).forEach(f=>{ if(!(f in nuevo)) updates[reg+'/'+x.id+'/'+f]=null; });
      }
      srv[x.id]=JSON.stringify(nuevo);             // ya enviado: no reenviar
    });
    if(!Object.keys(updates).length) return;
    if(estado.listo && FB){
      const pr=actualizar('data', updates);
      if(pr&&pr.catch) pr.catch(e=>{ console.warn('FB registros',tabla,e&&e.message); conexion('error'); negada(tabla,e); if(!esPermisoNegado(e)) encolar(updates); });
    } else encolar(updates);
  }
  function entraRegistro(clave, tabla, id, val){
    if(!val||!val.id) return false;
    if((REG_BORRADOS[clave]||{})[id]) return false;
    const srv=REG_SRV[clave]||(REG_SRV[clave]={});
    const str=JSON.stringify(val);
    if(srv[id]===str) return false;                // sin cambios reales
    srv[id]=str;
    const arr=(CACHE[clave]||[]).slice();
    const i=arr.findIndex(x=>x&&x.id===id);
    if(i>=0) arr[i]=val; else arr.push(val);
    soloLocal(clave,ordenar(arr,tabla));
    return true;
  }
  function saleRegistro(clave,id){
    const srv=REG_SRV[clave]; if(srv) delete srv[id];
    const antes=(CACHE[clave]||[]).length;
    const arr=(CACHE[clave]||[]).filter(x=>x&&x.id!==id);
    if(arr.length===antes) return false;
    soloLocal(clave,arr);
    return true;
  }

  // ---------- Guardado seguro (fusión por id) ----------
  // Nunca reescribe a ciegas: conserva lo que exista en cache (incluido lo que
  // acaba de llegar de otro dispositivo) y monta encima los cambios locales.
  // Nunca borra: para borrar está eliminar(). Para agregar basta pasar los nuevos.
  function guardar(tabla, arr){ guardarEn(negId(), tabla, arr); }
  function guardarEn(n, tabla, arr){
    if(!n) return;
    const clave=claveDe(n,tabla);
    if(bloqueado(n, clave)) return;
    if(!esTablaRegistros(tabla)){ set(clave, arr); return; }
    const tomb=REG_BORRADOS[clave]||{};
    const porId={};
    (CACHE[clave]||[]).forEach(x=>{ if(x&&x.id&&!tomb[x.id]) porId[x.id]=x; });
    const vistos={};    // si el array trae el mismo id repetido, vale el PRIMERO
    (arr||[]).forEach(x=>{ if(!x||!x.id||tomb[x.id]||vistos[x.id]) return; vistos[x.id]=1; porId[x.id]=x; });
    soloLocal(clave, ordenar(Object.values(porId), tabla));
    subirRegistros(n, tabla, arr||[]);
  }
  function eliminar(tabla, id){ eliminarEn(negId(), tabla, id); }
  function eliminarEn(n, tabla, id){
    if(!n||!id) return;
    const clave=claveDe(n,tabla);
    if(bloqueado(n, clave)) return;
    if(!esTablaRegistros(tabla)){ set(clave,(CACHE[clave]||[]).filter(x=>x&&x.id!==id)); return; }
    (REG_BORRADOS[clave]||(REG_BORRADOS[clave]={}))[id]=Date.now();
    const srv=REG_SRV[clave]; if(srv) delete srv[id];
    soloLocal(clave,(CACHE[clave]||[]).filter(x=>x&&x.id!==id));
    const u={}; u[claveReg(n,tabla)+'/'+id]=null; u[claveBorr(n,tabla)+'/'+id]=Date.now();
    if(estado.listo && FB){
      const pr=actualizar('data', u);
      if(pr&&pr.catch) pr.catch(e=>{ console.warn('FB borrar',e&&e.message); negada(tabla,e); if(!esPermisoNegado(e)) encolar(u); });
    } else encolar(u);
  }

  // ---------- Cambios concurrentes (transacciones) ----------
  // Cambio de un registro descrito como función: se aplica ya en el equipo y
  // además en una transacción sobre el valor REAL del servidor, para que dos
  // equipos (p. ej. vendiendo el mismo producto) no se pisen.
  // fn debe poder ejecutarse varias veces sobre copias distintas.
  function modificarRegistro(tabla, id, fn){
    const n=negId(); if(!n) return null;
    const clave=claveDe(n,tabla);
    if(bloqueado(n, clave)) return null;
    const arr=misDatos(tabla);
    const rec=arr.find(x=>x&&x.id===id);
    if(!rec) return null;
    fn(rec);
    const srv=REG_SRV[clave];
    if(!(estado.listo && FB && srv && srv[id])){ guardar(tabla,[rec]); return rec; }   // sin nube o aún no subido
    soloLocal(clave, arr);
    srv[id]=JSON.stringify(limpiar(rec));       // un guardado posterior no reenvía el valor fijo
    transaccion('data/'+claveReg(n,tabla)+'/'+id, cur=>{
      if(cur===null) return null;               // sin copia local: Firebase reintenta con el valor real
      fn(cur); return limpiar(cur);
    }).catch(e=>{ console.warn('Transacción',tabla,id,e&&e.message); conexion('error'); negada(tabla,e); });
    return rec;
  }
  // D9: cambio de UN registro sobre la versión del SERVIDOR (dos equipos con el mismo pedido no se pisan).
  // fn(copia) devuelve el registro nuevo, o undefined para no tocarlo (p. ej. "ya lo cobró otro equipo").
  // Devuelve {committed, valor}: valor = el registro como quedó (o como estaba si no se tocó).
  // Sin conexión no hay transacción posible: se aplica sobre la copia del equipo y viaja en la cola, como siempre
  // (vender sin internet sigue funcionando; ahí el riesgo de pisarse es el de antes).
  function transaccionRegistro(tabla, id, fn){
    const n=negId();
    if(!n || !id) return Promise.resolve({committed:false, valor:null});
    const clave=claveDe(n,tabla);
    if(bloqueado(n, clave)) return Promise.resolve({committed:false, valor:null, motivo:'solo_lectura'});
    const enLocal=()=>{
      const rec=misDatos(tabla).find(x=>x&&x.id===id);
      if(!rec) return {committed:false, valor:null};
      const nv=fn(limpiar(rec));
      if(nv===undefined) return {committed:false, valor:rec};
      guardarEn(n, tabla, [nv]);
      return {committed:true, valor:nv};
    };
    const srv=REG_SRV[clave];
    if(!(estado.listo && FB && estado.conectado && srv && srv[id])) return Promise.resolve(enLocal());
    return transaccion('data/'+claveReg(n,tabla)+'/'+id, cur=>{
      if(cur===null) return null;                 // sin copia en el SDK: Firebase reintenta con el valor real
      const nv=fn(JSON.parse(JSON.stringify(cur)));
      return nv===undefined ? undefined : limpiar(nv);
    }).then(res=>{
      const v=res.snapshot.val();
      if(!v) return {committed:false, valor:null};
      // La copia del equipo queda igual al servidor (y un guardado posterior no reenvía nada)
      (REG_SRV[clave]||(REG_SRV[clave]={}))[id]=JSON.stringify(v);
      const arr=(CACHE[clave]||[]).slice(); const i=arr.findIndex(x=>x&&x.id===id);
      if(i>=0) arr[i]=v; else arr.push(v);
      soloLocal(clave, ordenar(arr,tabla));
      return {committed:!!res.committed, valor:v};
    }).catch(e=>{ negada(tabla,e); throw e; });
  }
  function transaccionClave(clave, fn){
    if(bloqueado(negDeClave(clave), clave)) return Promise.resolve({committed:false, valor:get(clave), motivo:'solo_lectura'});
    if(!(estado.listo && FB)){
      const cur=get(clave);
      const nv=fn(cur===undefined?null:cur);
      if(nv===undefined) return Promise.resolve({committed:false, valor:cur});
      set(clave,nv);
      return Promise.resolve({committed:true, valor:nv});
    }
    return transaccion('data/'+clave, cur=>fn(cur)).then(res=>{
      const v=res.snapshot.val(); guardarLocal(clave,v);
      return {committed:res.committed, valor:v};
    }).catch(e=>{ negada(clave,e); throw e; });
  }
  // Tabla única del negocio (caja_actual, config…). fn devuelve el valor nuevo o undefined (no tocar).
  function transaccionUnica(tabla, fn){ return transaccionClave(claveDe(negId(),tabla), fn); }
  // Clave global (superadmins…)
  function transaccionGlobal(clave, fn){ return transaccionClave(clave, fn); }
  // Reserva el próximo consecutivo de factura: max(contador, minimoLocal)+1. null si no hay nube.
  // cuantos > 1: aparta un BLOQUE (desde = devuelto - cuantos + 1); Firebase serializa la transacción
  function reservarConsecutivo(n, minimoLocal, cuantos){
    if(!(estado.listo && FB) || !n) return Promise.resolve(null);
    const k=Math.max(1, parseInt(cuantos)||1);
    return transaccion('data/'+claveDe(n,'factura_seq'), cur=>Math.max(parseInt(cur)||0, minimoLocal||0)+k)
      .then(res=>res.committed?(parseInt(res.snapshot.val())||null):null);
  }

  // ---------- Conexión ----------
  function iniciar(){
    // 1) Respaldo local primero: arranque instantáneo aunque la nube tarde
    local.claves().forEach(k=>{ const v=local.leer(k); if(v!==undefined) CACHE[k]=v; });
    // 2) Conectar
    try{
      const cfg=opc.config;
      if(!cfg || !cfg.databaseURL || cfg.apiKey==='TU_API_KEY') return false;
      const S=opc.sdk;
      if(!S || !S.app || !S.database) return false;
      const app=S.app.getApps().length ? S.app.getApp() : S.app.initializeApp(cfg);
      D=S.database; FB=D.getDatabase(app);
      if(opc.emuladores && opc.emuladores.database){
        const [h,p]=String(opc.emuladores.database).split(':');
        D.connectDatabaseEmulator(FB, h, parseInt(p,10));
      }
      estado.listo=true;
      try{ escuchar('.info/connected', s=>{ estado.conectado=!!s.val(); conexion(s.val()?'ok':'off'); }); }catch(e){}
      return true;
    }catch(e){
      console.error('Firebase no disponible:',e);
      FB=null; D=null; estado.listo=false;
      return false;
    }
  }
  function aceptarDeNube(k,v,tabla){
    const nuevo=JSON.stringify(v===undefined?null:v);
    const viejo=JSON.stringify(CACHE[k]===undefined?null:CACHE[k]);
    if(nuevo===viejo) return;
    const antes=CACHE[k];
    guardarLocal(k,v);
    if(tabla) aviso(o=>g.alCambiarTabla(tabla, v, antes, o));
    g.alCambiar();
  }
  // tabla: solo en las del negocio (para el gancho alCambiarTabla)
  function escucharClave(k, tabla){ return escuchar('data/'+k, s=>aceptarDeNube(k, s.val(), tabla)); }   // devuelve la función que deja de escuchar   // devuelve la función que deja de escuchar

  // Carga inicial: SOLO las tablas globales, para poder entrar
  function cargarGlobales(cb){
    if(!estado.listo || !FB){ estado.nubeLista=true; cb(); return; }
    Promise.all(TABLAS_GLOBALES.map(k=>leerNodo('data/'+k).then(v=>guardarLocal(k,v))))
    .then(()=>{
      estado.nubeLista=true; estado.globalesLeidas=true;
      conexion('ok'); cb(); escucharGlobales();
    }).catch(err=>{
      console.error('No se pudo leer de la nube:',err&&err.message);
      conexion('error');
      estado.nubeLista=true;   // se permite arrancar en local
      cb(); escucharGlobales();
    });
  }
  function escucharGlobales(){
    if(!estado.listo || !FB || globalesOn) return;
    globalesOn=true;
    TABLAS_GLOBALES.forEach(k=>escucharClave(k));
  }

  // Al entrar a un negocio: bajar y escuchar SOLO sus tablas
  function sincronizarNegocio(n){
    if(!estado.listo || !FB || !n) return;
    detenerSincNegocio();
    inicioSinc=Date.now();
    subirCola();
    TABLAS.forEach(t=>{
      const clave=claveDe(n,t);
      if(!esTablaRegistros(t)){ listenersNeg.push(escucharClave(clave, t)); return; }
      const refReg=nodo('data/'+claveReg(n,t));
      const refBor=nodo('data/'+claveBorr(n,t));
      D.get(refBor).then(sb=>{
        REG_BORRADOS[clave]=Object.assign({}, sb.val()||{});      // 1) marcas de borrado primero
        return D.get(refReg);                                      // 2) estado actual
      }).then(sr=>{
        const obj=sr.val()||{}, tomb=REG_BORRADOS[clave]||{}, lista=[];
        REG_SRV[clave]={};
        Object.keys(obj).forEach(id=>{ const v=obj[id]; if(!v||!v.id||tomb[id]) return; REG_SRV[clave][id]=JSON.stringify(v); lista.push(v); });
        soloLocal(clave,ordenar(lista,t));
        return D.get(nodo('data/'+clave)).then(sv=>{ if(sv.exists()) migrarTablaVieja(n,t,sv.val()); });   // 3) formato viejo
      }).then(()=>{
        g.alCambiar();
        g.alCargarTabla(t);
        // Nuevo = no estaba en lo recibido ni en lo que este equipo subió (lo propio no se avisa)
        const entra=snap=>{
          const nuevo=!(REG_SRV[clave]||{})[snap.key];
          if(!entraRegistro(clave,t,snap.key,snap.val())) return;
          if(nuevo) aviso(o=>g.alRegistroNuevo(t, snap.val(), o));
          g.alCambiar();
        };
        listenersNeg.push(
          D.onChildAdded(refReg, entra),
          D.onChildChanged(refReg, entra),
          D.onChildRemoved(refReg, snap=>{ if(saleRegistro(clave,snap.key)) g.alCambiar(); }),
          D.onChildAdded(refBor, snap=>{
            const tb=REG_BORRADOS[clave]||(REG_BORRADOS[clave]={});
            if(tb[snap.key]) return;
            tb[snap.key]=snap.val()||Date.now();
            if(saleRegistro(clave,snap.key)) g.alCambiar();
          }),
          // Compatibilidad: un equipo con la versión VIEJA escribe la tabla completa
          escuchar('data/'+clave, sv=>{ if(sv.exists()) migrarTablaVieja(n,t,sv.val()); })
        );
      }).catch(e=>console.warn('Sync',t,e&&e.message));
    });
  }
  // Pasa una tabla del formato viejo (array completo) al formato por registro
  function migrarTablaVieja(n, tabla, datos){
    if(!datos) return;
    const clave=claveDe(n,tabla);
    if(migrando[clave]) return;
    migrando[clave]=true;
    const lista=Array.isArray(datos)?datos:Object.values(datos);
    D.get(nodo('data/'+claveReg(n,tabla))).then(sr=>{
      const ya=sr.val()||{}, tomb=REG_BORRADOS[clave]||{}, u={};
      const validos=lista.filter(x=>x&&x.id&&idSeguro(x.id));   // S8: un id con símbolos lo rechazarían las reglas
      if(validos.length<lista.filter(x=>x&&x.id).length) console.warn('Migración',tabla,'registros con id inválido no se copiaron');
      validos.forEach(x=>{
        if(ya[x.id]||tomb[x.id]) return;
        const l=limpiar(x); if(l) u[claveReg(n,tabla)+'/'+x.id]=l;
      });
      u[clave]=null;                                    // retirar el formato viejo
      u[clave+'_bk']=validos.length?limpiar(validos):null;  // respaldo por si acaso
      return actualizar('data', u);
    }).catch(e=>console.warn('Migración',tabla,e&&e.message))
      .then(()=>{ migrando[clave]=false; });
  }
  function detenerSincNegocio(){
    listenersNeg.forEach(quitar=>{ try{ quitar(); }catch(e){} });
    listenersNeg=[];
    detenerNegocioPropio();
  }

  // Súper admin: escucha TODO el nodo data (panel de todos los negocios)
  function sincronizarTodo(){
    if(!estado.listo || !FB || sincTodoOn) return;
    sincTodoOn=true;
    if(!estado.cuentas){   // esquema viejo: todo data (con las reglas cerradas no se usa)
      quitarTodo=escuchar('data', snap=>{ if(aplicarTodo(snap.val()||{})) g.alCambiar(); });
      return;
    }
    // R1: el panel escucha SOLO lo que muestra (negocios, administradores, usuarios y el
    // resumen de cifras de cada negocio). Antes escuchaba todo data: cada venta de cualquier
    // negocio le reenviaba la base completa. Lo demás se lee bajo demanda (leerNegocioCompleto).
    const parte={negocios_r:null, negocios:null, usuarios:null};
    const oir=(ruta, fn)=>{ refsPanel.push(escuchar('data/'+ruta, sn=>fn(sn.val()), e=>console.warn('Panel',ruta,e&&e.message))); };
    if(sesion.vendedor){ escucharNegociosVendedor(parte); return; }
    const negociosCambiaron=()=>{
      const cambio=aplicarGlobalesCuentas(parte);
      const ids=aLista(parte.negocios_r||parte.negocios).map(n=>n.id).filter(Boolean);
      ids.forEach(id=>{ if(!negPanel[id]) negPanel[id]=escucharNegocioPanel(id); });
      Object.keys(negPanel).forEach(id=>{ if(ids.indexOf(id)<0){ negPanel[id].forEach(quitar=>{ try{ quitar(); }catch(e){} }); delete negPanel[id]; } });
      if(cambio) g.alCambiar();
    };
    oir('negocios_r', v=>{ parte.negocios_r=v; negociosCambiaron(); });
    oir('negocios', v=>{ parte.negocios=v; negociosCambiaron(); });   // antes de migrar las tablas globales
    oir('usuarios', v=>{ parte.usuarios=v; if(aplicarGlobalesCuentas(parte)) g.alCambiar(); });
    oir('superadmins', v=>aceptarDeNube('superadmins', v));
  }
  // Vendedor: las reglas solo le dejan leer negocios_r con la consulta por SU id
  // (vendedorId = sus clientes y pruebas; demoDe = sus demos). Ni usuarios ni resumen ajenos.
  function escucharNegociosVendedor(parte){
    const res={vendedorId:{}, demoDe:{}};
    const unir=()=>{
      parte.negocios_r=Object.assign({}, res.vendedorId, res.demoDe);
      if(aplicarGlobalesCuentas(parte)) g.alCambiar();
    };
    ['vendedorId','demoDe'].forEach(campo=>{
      const q=D.query(nodo('data/negocios_r'), D.orderByChild(campo), D.equalTo(sesion.vendedor));
      refsPanel.push(D.onValue(q, sn=>{ res[campo]=sn.val()||{}; unir(); }, e=>console.warn('Panel vendedor',campo,e&&e.message)));
    });
  }
  // Usuarios y resumen de un negocio, para el panel
  function escucharNegocioPanel(id){
    const refs=[], e={r:null, x:null}, clave=claveDe(id,'usuarios');
    const ref=(ruta, fn)=>{ refs.push(escuchar('data/'+ruta, sn=>fn(sn.val()), ()=>{})); };
    const usuarios=()=>{ if(aplicarRegistros(clave, e.r||{}, e.x||{})) g.alCambiar(); };
    ref(claveReg(id,'usuarios'), v=>{ e.r=v; usuarios(); });
    ref(claveBorr(id,'usuarios'), v=>{ e.x=v; usuarios(); });
    ref(claveDe(id,'resumen'), v=>aceptarDeNube(claveDe(id,'resumen'), v));
    return refs;
  }
  function aplicarTodo(data){
    let cambio=false;
    Object.keys(data).forEach(k=>{
      if(estado.cuentas && CLAVES_ESQUEMA_S1[k]) return;
      if(JSON.stringify(data[k])!==JSON.stringify(CACHE[k])){ guardarLocal(k,data[k]); cambio=true; }
    });
    Object.keys(CACHE).forEach(k=>{
      if(k.indexOf('data_')===0 && k.slice(-2)!=='_r' && k.slice(-2)!=='_x' && data[k]===undefined && data[k+'_r']===undefined && CACHE[k]!==null){ guardarLocal(k,null); cambio=true; }
    });
    if(reconstruirDesdeRegistros(data)) cambio=true;
    if(estado.cuentas && aplicarGlobalesCuentas(data)) cambio=true;
    return cambio;
  }
  // El panel lee arrays (data_<neg>_ventas); aquí se rearman desde _r/_x
  function reconstruirDesdeRegistros(data){
    let cambio=false;
    Object.keys(data||{}).forEach(k=>{
      if(k.slice(-2)!=='_r' || k.indexOf('data_')!==0) return;
      const base=k.slice(0,-2);
      if(aplicarRegistros(base, data[k]||{}, data[base+'_x']||{})) cambio=true;
    });
    return cambio;
  }
  // Rearma el array de una tabla (base = data_<neg>_<tabla>) desde sus registros y marcas de borrado
  function aplicarRegistros(base, obj, tomb){
    const lista=Object.keys(obj||{}).filter(id=>!(tomb||{})[id]).map(id=>obj[id]).filter(v=>v&&v.id);
    ordenar(lista, base.split('_').slice(2).join('_'));
    // Usuarios: el super-admin los edita, así que se recuerda el estado del servidor (cambios por campo)
    if(/_usuarios$/.test(base)){
      const srv={}; lista.forEach(v=>{ srv[v.id]=JSON.stringify(v); });
      REG_SRV[base]=srv; REG_BORRADOS[base]=Object.assign({}, tomb||{});
    }
    if(JSON.stringify(lista)===JSON.stringify(CACHE[base])) return false;
    guardarLocal(base,lista);
    return true;
  }
  function detenerSincTodo(){
    if(!sincTodoOn) return;
    if(quitarTodo){ try{ quitarTodo(); }catch(e){} quitarTodo=null; }
    refsPanel.forEach(quitar=>{ try{ quitar(); }catch(e){} }); refsPanel=[];
    Object.keys(negPanel).forEach(id=>negPanel[id].forEach(quitar=>{ try{ quitar(); }catch(e){} })); negPanel={};
    sincTodoOn=false;
  }

  // Privacidad: al entrar un empleado se borran del equipo los datos de OTROS negocios
  function limpiarDatosAjenos(n){
    local.claves().forEach(k=>{
      if(k.indexOf('data_')===0 && k.indexOf('data_'+n+'_')!==0){ local.borrar(k); delete CACHE[k]; }
    });
    Object.keys(CACHE).forEach(k=>{ if(k.indexOf('data_')===0 && k.indexOf('data_'+n+'_')!==0) delete CACHE[k]; });
    // Con cuentas un empleado no debe guardar tablas globales (hash de contraseñas, otros negocios)
    if(estado.cuentas){
      ['superadmins','usuarios','usuarios_legado'].forEach(k=>{ local.borrar(k); delete CACHE[k]; });
      const propio=aLista(CACHE.negocios).filter(x=>x.id===n);
      soloLocal('negocios', propio);
    }
  }

  // Botón "Actualizar": vuelve a leer de la nube lo que corresponda
  function recargar(modo){
    if(!estado.listo || !FB) return Promise.reject(new Error('sin_nube'));
    if(modo && modo.superAdmin){
      if(estado.cuentas){ detenerSincTodo(); sincronizarTodo(); return Promise.resolve(); }   // vuelve a leer lo del panel
      return leerNodo('data').then(v=>{ aplicarTodo(v||{}); });
    }
    const tareas=estado.cuentas
      ? (modo&&modo.negId ? [leerNodo('data/negocios_r/'+modo.negId).then(v=>{ if(v&&v.id) aceptarNegocio(v); })] : [])
      : TABLAS_GLOBALES.map(k=>leerNodo('data/'+k).then(v=>guardarLocal(k,v)));
    const n=modo&&modo.negId;
    return Promise.all(tareas.concat(n?[leerNegocioCompleto(n)]:[])).then(()=>{});
  }
  // Lee UNA vez todas las tablas de un negocio (informe mensual, supervisión, recarga).
  // Incluye lo que siga en formato viejo (array completo) sin migrarlo.
  function leerNegocioCompleto(n){
    if(!estado.listo || !FB || !n) return Promise.resolve();
    const leer=r=>leerNodo('data/'+r);
    return Promise.all(TABLAS.map(t=>{
      const clave=claveDe(n,t);
      if(!esTablaRegistros(t)) return leer(clave).then(v=>guardarLocal(clave,v));
      return Promise.all([leer(claveBorr(n,t)), leer(claveReg(n,t)), leer(clave)]).then(([tomb, obj, viejo])=>{
        tomb=tomb||{}; obj=obj||{};
        REG_BORRADOS[clave]=Object.assign({}, tomb);
        REG_SRV[clave]={};
        const lista=[];
        Object.keys(obj).forEach(id=>{ const v=obj[id]; if(!v||!v.id||tomb[id]) return; REG_SRV[clave][id]=JSON.stringify(v); lista.push(v); });
        aLista(viejo).forEach(v=>{ if(v.id && !obj[v.id] && !tomb[v.id]) lista.push(v); });
        soloLocal(clave,ordenar(lista,t));
      });
    })).then(()=>{ g.alCambiar(); });
  }

  // Respaldo: todo el nodo data (o el caché local sin nube)
  function exportarTodo(){
    const copiaLocal=()=>JSON.parse(JSON.stringify(CACHE));
    if(!(estado.listo && FB)) return Promise.resolve({datos:copiaLocal(), origen:'local'});
    return leerNodo('data').then(v=>({datos:v||{}, origen:'nube'}))
      .catch(()=>({datos:copiaLocal(), origen:'local'}));
  }

  // Restaura UN negocio desde un respaldo (lo que devuelve exportarTodo, de la nube o del equipo):
  // su registro y TODAS sus tablas se reemplazan por las del respaldo (lo que no esté, se borra).
  // Lo que no cumpla las reglas (logo, ids: S8) se limpia para que la escritura no falle entera.
  // Las cuentas de acceso (perfiles/login) no se tocan. Solo el dueño o el ayudante (reglas).
  function restaurarNegocio(n, datos){
    if(!n || !datos) return Promise.reject(new Error('Respaldo vacío'));
    const neg=(datos.negocios_r && datos.negocios_r[n]) || aLista(datos.negocios).find(x=>x && x.id===n);
    if(!neg) return Promise.reject(new Error('El respaldo no tiene ese negocio'));
    const limpio=v=>{
      if(Array.isArray(v)) return v.filter(x=>!(x && typeof x==='object' && 'id' in x) || idSeguro(x.id));
      if(v && typeof v==='object'){ const o={}; Object.keys(v).forEach(k=>{ const x=v[k]; if(!(x && typeof x==='object' && 'id' in x) || idSeguro(x.id)) o[k]=x; }); return o; }
      return v;
    };
    const claves={};
    TABLAS.forEach(t=>['','_r','_x','_bk'].forEach(suf=>{ claves[claveDe(n,t)+suf]=null; }));
    Object.keys(datos).forEach(k=>{ if(k.indexOf('data_'+n+'_')===0) claves[k]=limpiar(limpio(datos[k])); });
    const registro=negocioParaGuardar(neg);
    // La copia del equipo: se olvida lo de ese negocio y se pone lo del respaldo
    const aplicarLocal=()=>{
      Object.keys(CACHE).forEach(k=>{ if(k.indexOf('data_'+n+'_')===0){ delete CACHE[k]; local.borrar(k); } });
      Object.keys(claves).forEach(k=>{ delete REG_SRV[k.replace(/_(r|x)$/,'')]; delete REG_BORRADOS[k.replace(/_(r|x)$/,'')]; });
      TABLAS.forEach(t=>{
        const k=claveDe(n,t), r=claves[k+'_r'], x=claves[k+'_x']||{};
        if(r && typeof r==='object') soloLocal(k, ordenar(Object.values(r).filter(v=>v && v.id && !x[v.id]), t));
        else if(claves[k]!=null) soloLocal(k, claves[k]);
      });
      const lista=aLista(CACHE.negocios).filter(x=>x.id!==n).concat([registro]);
      (REG_SRV[SRV_NEG]||(REG_SRV[SRV_NEG]={}))[n]=JSON.stringify(registro);
      soloLocal('negocios', ordenarNegocios(lista));
      g.alCambiar();
    };
    if(!(estado.listo && FB)){ aplicarLocal(); return Promise.resolve({ok:true, claves:Object.keys(claves).filter(k=>claves[k]!=null).length}); }
    const u=Object.assign({}, claves); u['negocios_r/'+n]=registro;
    return actualizar('data', u).then(()=>{ aplicarLocal(); return {ok:true, claves:Object.keys(claves).filter(k=>claves[k]!=null).length}; });
  }

  // Borra TODAS las tablas de un negocio (local y nube), en todos los formatos
  function borrarDatosNegocio(n){
    TABLAS.forEach(t=>{
      ['','_r','_x','_bk'].forEach(suf=>{
        const clave='data_'+n+'_'+t+suf;
        set(clave,null); local.borrar(clave);
        delete CACHE[clave]; delete REG_SRV[clave]; delete REG_BORRADOS[clave];
      });
    });
    Object.keys(CACHE).forEach(k=>{ if(k.indexOf('data_'+n+'_')===0){ set(k,null); delete CACHE[k]; local.borrar(k); } });
  }

  // ---------- Historial del sistema (P2): auditoria_sistema/<id>, fuera de data/ ----------
  // Solo se agrega (las reglas no dejan editar ni borrar) y lo lee solo el dueño del sistema.
  const HIST='auditoria_sistema';
  function registrarSistema(e){
    if(!e || !e.id) return Promise.resolve(false);
    if(!(estado.listo && FB)){ soloLocal(HIST, (CACHE[HIST]||[]).concat([e])); return Promise.resolve(true); }
    const u={}; u[e.id]=Object.assign({}, e, {fecha:D.serverTimestamp()});
    return actualizar(HIST, u).then(()=>true).catch(err=>{ console.warn('FB historial', err&&err.message); return false; });
  }
  function leerHistorialSistema(limite){
    const n=Math.max(1, parseInt(limite)||500);
    if(!(estado.listo && FB)) return Promise.resolve((CACHE[HIST]||[]).slice(-n).reverse());
    return D.get(D.query(nodo(HIST), D.orderByChild('fecha'), D.limitToLast(n)))
      .then(sn=>{ const out=[]; sn.forEach(c=>{ out.push(c.val()); }); return out.reverse(); });
  }

  return {
    TABLAS, TABLAS_UNICAS, TABLAS_GLOBALES,
    estado, cache:CACHE,
    entorno:opc.entorno||'local',
    iniciar, cargarGlobales, configurarSesion, cargarNegocioPropio, migrarTablasGlobales, leerRegistro,
    modificarUsuariosLegado, leerNegocioCompleto,
    get, set, claveDe, misDatos, datosDe, guardar, eliminar, guardarEn, eliminarEn,
    modificarRegistro, transaccionRegistro, transaccionUnica, transaccionGlobal, reservarConsecutivo,
    sincronizarNegocio, detenerSincNegocio, sincronizarTodo, detenerSincTodo,
    limpiarDatosAjenos, recargar, exportarTodo, restaurarNegocio, borrarDatosNegocio,
    registrarSistema, leerHistorialSistema
  };
}