// ============================================================
//  SERVICIO DE APLICACIÓN · Periodo de prueba
//  Casos de uso del periodo de prueba de un negocio (y del vencimiento de las
//  demos): empezar, dar más días, pasar a pago, cargar y borrar productos de
//  ejemplo, ver el estado y listar lo que está por vencer.
//  Solo habla con el puerto de datos y el dominio: se prueba con dobles
//  (tests/aplicacion/pruebas.test.mjs). Su pantalla: ui/super-admin/pruebas.js;
//  el arranque lo publica como window.Pruebas.
//  El bloqueo al vencer (solo lectura) lo hacen las reglas de la base.
//  Documentation/01-super-admin-panel/01-super-admin-panel.md (Periodo de prueba)
// ============================================================

/**
 * @param {Object} dep
 * @param {Object} dep.datos        PuertoDatos (get, set, datosDe, guardarEn, eliminarEn)
 * @param {Object} dep.dominio      {prueba, ejemplos}
 * @param {() => Object|null} dep.usuario   quién está en sesión (STATE.user)
 * @param {() => number} [dep.ahora]        milisegundos
 * @param {() => string} dep.nuevoId
 */
export function crearServicioPruebas(dep){
  const D=dep.datos, pr=dep.dominio.prueba, ej=dep.dominio.ejemplos;
  const ahora=dep.ahora||(()=>Date.now());
  const fallo=motivo=>({ok:false, motivo});
  const negocios=()=>{ const v=D.get('negocios'); return Array.isArray(v)?v:(v&&typeof v==='object'?Object.values(v).filter(Boolean):[]); };
  const buscar=negId=>negocios().find(n=>n && n.id===negId)||null;

  // Escribe campos del negocio (el adaptador sube solo los campos que cambiaron;
  // null o ausente = se borra). Solo el super-admin puede: son campos reservados.
  function cambiarNegocio(negId, campos){
    const lista=negocios().map(n=>{
      if(!n || n.id!==negId) return n;
      const x=Object.assign({}, n);
      Object.keys(campos).forEach(k=>{ if(campos[k]==null) delete x[k]; else x[k]=campos[k]; });
      return x;
    });
    D.set('negocios', lista);
    return buscar(negId);
  }
  // Verifica que exista y que el usuario pueda manejarlo
  function conPermiso(negId){
    const neg=buscar(negId);
    if(!neg) return {error:fallo('no_existe')};
    if(!pr.puedeGestionarAlta(dep.usuario(), neg)) return {error:fallo('permiso')};
    return {neg};
  }
  function conDias(fn){ try{ return fn(); }catch(e){ return fallo('dias'); } }

  // Pone a prueba un negocio ya creado. conEjemplos: carga los productos de ejemplo de su tipo.
  function iniciar(negId, opc){
    opc=opc||{};
    const {neg, error}=conPermiso(negId); if(error) return error;
    if(neg.esDemo) return fallo('es_demo');
    return conDias(()=>{
      const campos=pr.nuevaPrueba(ahora(), opc.dias);
      const actualizado=cambiarNegocio(negId, campos);
      let ejemplos=0;
      if(opc.conEjemplos){
        const prods=ej.productosDeEjemplo(ej.plantillaDeTipo(neg.tipo), {ahoraMs:ahora(), nuevoId:dep.nuevoId});
        if(prods.length) D.guardarEn(negId, 'productos', prods);
        ejemplos=prods.length;
      }
      return {ok:true, estado:pr.estadoPrueba(actualizado, ahora()), ejemplos};
    });
  }
  // Más días (sirve también para reactivar una prueba vencida)
  function extender(negId, dias){
    const {neg, error}=conPermiso(negId); if(error) return error;
    return conDias(()=>{
      const actualizado=cambiarNegocio(negId, pr.extenderPrueba(neg, dias, ahora()));
      return {ok:true, estado:pr.estadoPrueba(actualizado, ahora())};
    });
  }
  // Pagó: deja de ser prueba y conserva todos sus datos
  function convertirAPago(negId){
    const {neg, error}=conPermiso(negId); if(error) return error;
    if(neg.esDemo) return fallo('es_demo');
    if(!pr.tienePrueba(neg)) return fallo('no_es_prueba');
    cambiarNegocio(negId, pr.camposConvertirAPago());
    return {ok:true};
  }
  // "Borrar ejemplos y empezar con los míos": lo puede hacer el propio negocio
  function borrarEjemplos(negId){
    if(!buscar(negId)) return fallo('no_existe');
    if(!pr.puedeBorrarEjemplos(dep.usuario(), negId)) return fallo('permiso');
    const ids=(D.datosDe(negId,'productos')||[]).filter(p=>p && p.ejemplo).map(p=>p.id);
    ids.forEach(id=>D.eliminarEn(negId, 'productos', id));
    return {ok:true, borrados:ids.length};
  }
  function estado(negId){
    const neg=buscar(negId);
    return neg ? pr.estadoPrueba(neg, ahora()) : null;
  }
  // Pruebas y demos que vencen en los próximos días (o ya vencieron) y que este usuario maneja
  function porVencer(dias){
    const u=dep.usuario();
    return pr.porVencer(negocios(), ahora(), dias).filter(n=>pr.puedeGestionarAlta(u, n))
      .map(n=>({id:n.id, nombre:n.nombre, esDemo:!!n.esDemo, estado:pr.estadoPrueba(n, ahora())}));
  }
  return {iniciar, extender, convertirAPago, borrarEjemplos, estado, porVencer};
}
