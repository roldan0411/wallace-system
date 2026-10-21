// ============================================================
//  DOMINIO · Datos de ejemplo por tipo de negocio
//  Catálogos de ejemplo (productos, precios, categorías, stock y clientes) de
//  los 18 tipos de negocio, y cómo se arma un negocio de demostración con
//  ventas de los últimos días. Datos semilla: no dependen de la interfaz ni de
//  la base. Los usan las demos (ui/super-admin/demos.js) y el periodo de prueba
//  con productos de ejemplo (aplicacion/servicios/pruebas.js).
//  Documentation/01-super-admin-panel/01-super-admin-panel.md (Demos)
// ============================================================
import { SUCURSAL_PRINCIPAL, conCaja } from './caja.js';
import { nuevaPrueba, DIAS_DEMO } from './prueba.js';

// Plantillas: productos = [nombre, precio, categoría, stock (null = sin inventario)]; clientes = [nombre, teléfono]
export const PLANTILLAS = {
  'Restaurante':{
    tipo:'Restaurante', sufijo:'Sabor & Sazón',
    productos:[
      ['Bandeja Paisa',28000,'Platos fuertes',40],['Mojarra Frita',32000,'Platos fuertes',25],
      ['Churrasco',35000,'Platos fuertes',30],['Sancocho de Gallina',24000,'Sopas',20],
      ['Ajiaco Santafereño',22000,'Sopas',18],['Arroz con Pollo',18000,'Platos fuertes',35],
      ['Hamburguesa Clásica',16000,'Comidas rápidas',50],['Perro Caliente',12000,'Comidas rápidas',45],
      ['Limonada de Coco',8000,'Bebidas',60],['Jugo Natural',6000,'Bebidas',55],
      ['Gaseosa',4000,'Bebidas',80],['Cerveza',6000,'Bebidas',70]
    ],
    clientes:[['Carlos Ramírez','3104567890'],['Mesa VIP - Empresa XYZ','3209876543'],['Luisa Fernanda','3157778899']]
  },
  'Tienda / Accesorios':{
    tipo:'Tienda / Accesorios', sufijo:'ManillasNet',
    productos:[
      ['Manilla Personalizada',15000,'Manillas',120],['Manilla de Cuero',22000,'Manillas',80],
      ['Collar Acero Inoxidable',35000,'Collares',45],['Cadena Enchapada',28000,'Collares',60],
      ['Aretes Topos',12000,'Aretes',150],['Anillo Ajustable',18000,'Anillos',90],
      ['Reloj Digital',45000,'Relojes',30],['Gorra Estampada',25000,'Ropa',55],
      ['Llavero Personalizado',8000,'Accesorios',200],['Set Regalo San Valentín',55000,'Combos',25]
    ],
    clientes:[['María José','3112223344'],['Andrés López','3005556677'],['Tatiana Gómez','3181112233']]
  },
  'Barbería / Salón':{
    tipo:'Barbería / Salón', sufijo:'Estilo Urbano',
    productos:[
      ['Corte Clásico',18000,'Cortes',null],['Corte + Barba',28000,'Cortes',null],
      ['Barba y Perfilado',15000,'Barba',null],['Tinte de Cabello',45000,'Color',null],
      ['Mechas',65000,'Color',null],['Cejas',8000,'Detalles',null],
      ['Mascarilla Facial',25000,'Spa',null],['Cera para Cabello',22000,'Productos',40],
      ['Shampoo Anticaspa',28000,'Productos',30],['Aceite para Barba',32000,'Productos',25]
    ],
    clientes:[['Julián Mesa','3145678901'],['Ricardo Peña','3167890123'],['Sebastián Ruiz','3009012345']]
  },
  'Cafetería':{
    tipo:'Cafetería', sufijo:'Café Aroma',
    productos:[
      ['Café Americano',3500,'Bebidas calientes',null],['Capuchino',6000,'Bebidas calientes',null],
      ['Latte',6500,'Bebidas calientes',null],['Mocaccino',7500,'Bebidas calientes',null],
      ['Chocolate Caliente',5500,'Bebidas calientes',null],['Té Aromático',3000,'Bebidas calientes',null],
      ['Frappé de Café',9000,'Bebidas frías',null],['Malteada',10000,'Bebidas frías',null],
      ['Croissant',4500,'Panadería',40],['Muffin de Arándanos',5000,'Panadería',35],
      ['Sándwich de Pollo',12000,'Comidas',30],['Torta de Chocolate',7000,'Postres',20],
      ['Cheesecake',8500,'Postres',18],['Galletas Artesanales',3500,'Postres',50]
    ],
    clientes:[['Valentina Ríos','3101112233'],['Daniel Castro','3204445566'],['Camila Soto','3157778890']]
  },
  'Panadería':{
    tipo:'Panadería', sufijo:'Pan de Cada Día',
    productos:[
      ['Pan Francés',800,'Panadería',200],['Pan de Queso',1200,'Panadería',150],
      ['Croissant',2500,'Panadería',80],['Mogolla Integral',1500,'Panadería',100],
      ['Pan Aliñado',1000,'Panadería',120],['Roscón con Bocadillo',3500,'Panadería',60],
      ['Torta de Naranja',18000,'Pastelería',15],['Torta Tres Leches',25000,'Pastelería',10],
      ['Ponqué Casero',15000,'Pastelería',20],['Empanada',2500,'Comidas',90],
      ['Pastel de Pollo',3500,'Comidas',70],['Café con Leche',2500,'Bebidas',null],
      ['Avena',3000,'Bebidas',null],['Gaseosa',3500,'Bebidas',60]
    ],
    clientes:[['Rosa Martínez','3112223300'],['Pedro Jiménez','3009998800'],['Ana Cristina','3181234500']]
  },
  'Ferretería':{
    tipo:'Ferretería', sufijo:'Ferretería El Tornillo',
    productos:[
      ['Martillo',18000,'Herramientas',25],['Destornillador Estría',8000,'Herramientas',60],
      ['Taladro Percutor',185000,'Herramientas',8],['Juego de Llaves',45000,'Herramientas',15],
      ['Cemento Gris (bulto)',32000,'Construcción',40],['Pintura Blanca (galón)',55000,'Pinturas',30],
      ['Brocha 3"',6500,'Pinturas',80],['Tubo PVC 1/2"',4500,'Plomería',100],
      ['Llave de Paso',12000,'Plomería',45],['Cable Eléctrico (metro)',2500,'Eléctricos',300],
      ['Interruptor Doble',9000,'Eléctricos',50],['Bombillo LED',8500,'Eléctricos',120],
      ['Candado 40mm',15000,'Seguridad',35],['Silicona Transparente',9500,'Adhesivos',60]
    ],
    clientes:[['Constructora del Norte','3101010101'],['José Rodríguez','3202020202'],['Maestro Wilson','3153030303']]
  },
  'Logística / Bodega':{
    tipo:'Logística / Bodega', sufijo:'Distribuciones LogiExpress',
    productos:[
      ['Caja Cerveza x24',48000,'Bebidas',200],['Caja Gaseosa x12',22000,'Bebidas',180],
      ['Bulto Arroz 25kg',95000,'Granos',80],['Bulto Azúcar 25kg',88000,'Granos',75],
      ['Caja Atún x48',96000,'Enlatados',60],['Caja Aceite x12',72000,'Aceites',90],
      ['Paca Papel Higiénico',35000,'Aseo',120],['Caja Jabón x24',48000,'Aseo',100],
      ['Bulto Concentrado 40kg',120000,'Mascotas',40],['Caja Leche x24',52000,'Lácteos',85],
      ['Paca Servilletas',18000,'Aseo',150],['Caja Galletas x30',45000,'Snacks',70]
    ],
    clientes:[['Supermercado La Rebaja','3100000001'],['Tienda Doña Marta','3200000002'],['Minimarket Central','3150000003']]
  },
  'Papelería':{
    tipo:'Tienda / Accesorios', sufijo:'Papelería Creativa',
    productos:[
      ['Cuaderno 100 hojas',5500,'Cuadernos',150],['Resma de Papel Carta',18000,'Papel',60],
      ['Lápiz Mongol',1000,'Escritura',300],['Esfero Kilométrico',1500,'Escritura',250],
      ['Marcador Borrable',3500,'Escritura',120],['Caja de Colores x12',12000,'Arte',80],
      ['Tijeras Escolares',4500,'Útiles',90],['Pegante en Barra',3000,'Útiles',100],
      ['Cartulina (pliego)',1200,'Arte',200],['Fotocopia B/N',150,'Servicios',null],
      ['Impresión Color',800,'Servicios',null],['Plastificado',2500,'Servicios',null],
      ['Calculadora Científica',35000,'Tecnología',25],['Regla 30cm',2000,'Útiles',110]
    ],
    clientes:[['Colegio San José','3101111100'],['Laura Vargas','3202222200'],['Estudiante Miguel','3153333300']]
  },
  'Droguería / Farmacia':{
    tipo:'Tienda / Accesorios', sufijo:'Droguería La Salud',
    productos:[
      ['Acetaminofén x20',3500,'Analgésicos',100],['Ibuprofeno x10',4500,'Analgésicos',80],
      ['Suero Oral',3000,'Hidratación',60],['Alcohol Antiséptico',5500,'Antisépticos',70],
      ['Curas (caja)',6000,'Primeros auxilios',50],['Vitamina C',8500,'Vitaminas',45],
      ['Jarabe para la Tos',12000,'Respiratorio',35],['Crema Antibiótica',9500,'Dermatológicos',40],
      ['Termómetro Digital',18000,'Dispositivos',20],['Tapabocas x10',5000,'Protección',150],
      ['Gel Antibacterial',7000,'Protección',90],['Pañales (paquete)',28000,'Bebé',30]
    ],
    clientes:[['María Elena','3104444400'],['Don Alberto','3205555500'],['Sra. Carmen','3156666600']]
  },
  'Miscelánea / Variedades':{
    tipo:'Tienda / Accesorios', sufijo:'Todo a la Mano',
    productos:[
      ['Pilas AA x4',6000,'Electrónica',80],['Cargador Celular',15000,'Electrónica',40],
      ['Audífonos',12000,'Electrónica',50],['Vaso Plástico x25',4500,'Desechables',100],
      ['Velón',3500,'Hogar',60],['Detergente (bolsa)',8000,'Aseo',70],
      ['Escoba',9000,'Aseo',35],['Foco Linterna',18000,'Electrónica',25],
      ['Juguete Sorpresa',5000,'Juguetería',90],['Dulces Surtidos (bolsa)',6500,'Dulces',120],
      ['Cuaderno',4000,'Papelería',80],['Encendedor',2000,'Varios',200]
    ],
    clientes:[['Vecina Gloria','3107777700'],['Jorge Niño','3208888800'],['Doña Fanny','3159999900']]
  },
  'Heladería':{
    tipo:'Cafetería', sufijo:'Heladería Polo Norte',
    productos:[
      ['Cono Sencillo',3500,'Conos',null],['Cono Doble',5500,'Conos',null],
      ['Copa de Helado',8000,'Copas',null],['Banana Split',12000,'Copas',null],
      ['Malteada',9000,'Bebidas',null],['Sundae',10000,'Copas',null],
      ['Paleta Artesanal',4000,'Paletas',100],['Helado 1 Litro',18000,'Para llevar',30],
      ['Obleas',5000,'Postres',null],['Fresas con Crema',11000,'Postres',null],
      ['Michelada',7000,'Bebidas',null],['Granizado',5000,'Bebidas',null]
    ],
    clientes:[['Familia Torres','3101212120'],['Niños Felices','3203434340'],['Sofía Cardona','3155656560']]
  },
  'Pizzería':{
    tipo:'Restaurante', sufijo:'Pizzería Napolitana',
    productos:[
      ['Pizza Personal Peperoni',15000,'Pizzas',null],['Pizza Mediana Hawaiana',28000,'Pizzas',null],
      ['Pizza Familiar Mixta',42000,'Pizzas',null],['Pizza Vegetariana',30000,'Pizzas',null],
      ['Pizza 4 Quesos',35000,'Pizzas',null],['Lasaña',18000,'Pastas',null],
      ['Espagueti Boloñesa',16000,'Pastas',null],['Pan de Ajo',8000,'Entradas',null],
      ['Alitas x6',20000,'Entradas',null],['Gaseosa 1.5L',6000,'Bebidas',40],
      ['Jugo Natural',5000,'Bebidas',null],['Limonada',4500,'Bebidas',null]
    ],
    clientes:[['Oficina Central','3101313130'],['Andrea Milena','3203535350'],['Grupo Amigos','3155757570']]
  },
  'Boutique / Ropa':{
    tipo:'Tienda / Accesorios', sufijo:'Boutique Elegancia',
    productos:[
      ['Camiseta Básica',25000,'Camisetas',60],['Camisa Formal',55000,'Camisas',30],
      ['Jean Clásico',75000,'Pantalones',40],['Blusa Dama',45000,'Blusas',35],
      ['Vestido Casual',85000,'Vestidos',20],['Chaqueta Jean',95000,'Chaquetas',15],
      ['Buzo Capota',60000,'Buzos',25],['Falda',48000,'Faldas',22],
      ['Zapatos Deportivos',120000,'Calzado',18],['Cinturón Cuero',35000,'Accesorios',40],
      ['Gorra',28000,'Accesorios',50],['Medias x3',15000,'Accesorios',80]
    ],
    clientes:[['Daniela Ospina','3101414140'],['Carolina Vélez','3203636360'],['Manuela Ríos','3155858580']]
  },
  'Tecnología / Celulares':{
    tipo:'Tienda / Accesorios', sufijo:'TecnoCell',
    productos:[
      ['Forro para Celular',18000,'Accesorios',100],['Vidrio Templado',15000,'Accesorios',120],
      ['Cargador Rápido',35000,'Cargadores',60],['Cable USB-C',12000,'Cables',150],
      ['Audífonos Bluetooth',65000,'Audio',40],['Diadema Gamer',85000,'Audio',20],
      ['Memoria USB 32GB',28000,'Almacenamiento',50],['Power Bank 10000mAh',55000,'Baterías',35],
      ['Mouse Inalámbrico',32000,'Computadores',45],['Teclado',45000,'Computadores',30],
      ['Recarga / Minutos',5000,'Servicios',null],['Reparación de Pantalla',80000,'Servicios',null]
    ],
    clientes:[['Kevin Torres','3101515150'],['Empresa TechSA','3203737370'],['Bryan Muñoz','3155959590']]
  },
  'Licorera':{
    tipo:'Tienda / Accesorios', sufijo:'Licorera La Esquina',
    productos:[
      ['Cerveza (unidad)',3000,'Cervezas',300],['Six Pack',17000,'Cervezas',80],
      ['Aguardiente (botella)',35000,'Aguardientes',50],['Ron (botella)',55000,'Rones',40],
      ['Whisky',95000,'Whiskies',20],['Vino Tinto',38000,'Vinos',30],
      ['Vodka',45000,'Vodkas',25],['Tequila',85000,'Tequilas',15],
      ['Gaseosa 1.5L',5000,'Mezcladores',60],['Hielo (bolsa)',4000,'Complementos',100],
      ['Cigarrillos (cajetilla)',7000,'Tabaco',80],['Snacks',3500,'Pasabocas',120]
    ],
    clientes:[['Bar La Terraza','3101616160'],['Cliente Frecuente','3203838380'],['Evento Privado','3156060600']]
  },
  'Fruver / Verdulería':{
    tipo:'Tienda / Accesorios', sufijo:'Frutas y Verduras El Campo',
    productos:[
      ['Banano (libra)',1800,'Frutas',null],['Manzana (unidad)',1200,'Frutas',null],
      ['Naranja (libra)',2000,'Frutas',null],['Fresa (libra)',6000,'Frutas',null],
      ['Tomate (libra)',2500,'Verduras',null],['Cebolla (libra)',2200,'Verduras',null],
      ['Papa (arroba)',35000,'Verduras',null],['Zanahoria (libra)',1800,'Verduras',null],
      ['Lechuga (unidad)',2000,'Verduras',null],['Aguacate (unidad)',3500,'Frutas',null],
      ['Huevos (cubeta)',18000,'Otros',40],['Panela (libra)',3000,'Otros',60]
    ],
    clientes:[['Restaurante El Sabor','3101717170'],['Ama de Casa Luz','3203939390'],['Doña Betty','3156161610']]
  },
  'Veterinaria / Mascotas':{
    tipo:'Barbería / Salón', sufijo:'Mundo Animal',
    productos:[
      ['Consulta Veterinaria',35000,'Servicios',null],['Vacuna Antirrábica',25000,'Servicios',null],
      ['Baño y Peluquería',30000,'Servicios',null],['Desparasitación',18000,'Servicios',null],
      ['Concentrado Perro 2kg',28000,'Alimentos',50],['Concentrado Gato 1kg',22000,'Alimentos',40],
      ['Snacks para Perro',9000,'Alimentos',60],['Shampoo Antipulgas',18000,'Aseo',35],
      ['Collar Antipulgas',22000,'Accesorios',30],['Juguete Mordedor',12000,'Accesorios',45],
      ['Guacal Transportador',85000,'Accesorios',10],['Arena para Gato',15000,'Aseo',40]
    ],
    clientes:[['Familia Pérez (Max)','3101818180'],['Sara Gómez (Luna)','3204040400'],['Don Hernán (Rocky)','3156262620']]
  },
  'Floristería':{
    tipo:'Tienda / Accesorios', sufijo:'Floristería Jardín',
    productos:[
      ['Ramo de Rosas x12',45000,'Ramos',null],['Ramo Mixto',38000,'Ramos',null],
      ['Girasoles x6',30000,'Ramos',null],['Arreglo Floral Mesa',65000,'Arreglos',null],
      ['Corona Fúnebre',120000,'Arreglos',null],['Orquídea en Maceta',55000,'Plantas',15],
      ['Suculenta',12000,'Plantas',40],['Cactus Decorativo',15000,'Plantas',35],
      ['Peluche + Flores',48000,'Combos',20],['Caja Sorpresa',75000,'Combos',null],
      ['Globo Metalizado',8000,'Detalles',60],['Tarjeta Dedicatoria',3000,'Detalles',100]
    ],
    clientes:[['Enamorado Anónimo','3101919190'],['Empresa Eventos','3204141410'],['Patricia Luna','3156363630']]
  }
};

export const DIAS_HISTORIAL_DEMO=10;
export const ADMIN_DEMO='Administrador Demo';

// Plantilla que corresponde a un tipo de negocio (el campo "tipo" del negocio), o null
export function plantillaDeTipo(tipo){
  const k=Object.keys(PLANTILLAS).find(x=>PLANTILLAS[x].tipo===tipo);
  return k ? PLANTILLAS[k] : null;
}

// Productos de ejemplo listos para guardar. Llevan ejemplo:true para poder
// borrarlos de una vez ("borrar ejemplos y empezar con los míos").
export function productosDeEjemplo(plantilla, opc){
  const creado=new Date(opc.ahoraMs).toISOString();
  return (plantilla ? plantilla.productos : []).map(p=>({
    id:opc.nuevoId(), nombre:p[0], precio:p[1], categoria:p[2],
    stock:p[3], stockMin:p[3]!=null?5:null, agotado:false, usaLotes:false, lotes:[],
    imagen:'', creado, ejemplo:true
  }));
}

/**
 * Arma un negocio de demostración completo, sin guardarlo.
 * El ORDEN en que se piden números al azar (opc.azar) e ids (opc.nuevoId) es parte
 * del resultado: las pruebas de capturas fijan la semilla y esperan los mismos datos.
 * @param {Object} plantilla   una de PLANTILLAS
 * @param {Object} perfil      PERFILES[plantilla.tipo] (dominio/negocio.js)
 * @param {Object} opc         {ahoraMs, azar:()=>number, nuevoId:()=>string, usuario, demoDe}
 * @returns {{negocio, admin, productos, clientes, cajaActual, ventas, movimientos}}
 */
export function armarDemo(plantilla, perfil, opc){
  const azar=opc.azar, nuevoId=opc.nuevoId, ahora=opc.ahoraMs;
  const iso=ms=>new Date(ms).toISOString();
  const negId=nuevoId();
  const negocio=Object.assign({
    id:negId, nombre:plantilla.sufijo, tipo:plantilla.tipo, ciudad:'Bucaramanga',
    plan:'Premium', precioMes:149900, activo:true,
    logo:'', nit:'901.234.567-8', tel:'3001234567', dir:'Cra 27 #36-15', eslogan:'Demo de Wallace System',
    palabraProducto:perfil.palabraProducto, palabraProductos:perfil.palabraProductos,
    palabraPedido:perfil.palabraPedido||'Pedido', palabraPersonal:perfil.palabraPersonal||'Personal',
    usaMesas:perfil.usaMesas, usaCocina:perfil.usaCocina,
    usaRecetas:false, usaCitas:perfil.usaCitas,
    usaCaja:perfil.usaCaja!==false, esLogistica:!!perfil.esLogistica,
    flujoPedido:perfil.flujoPedido,
    tiposEntrega:perfil.tiposEntrega.slice(),
    funciones:perfil.funciones.slice(),
    tipoFactura:'pos', pctDatafono:0, sonidos:true, tema:'claro',
    sucursales:[], creado:iso(ahora), esDemo:true, demoDe:opc.demoDe||null
  }, nuevaPrueba(ahora, DIAS_DEMO));   // la demo vence sola (queda en solo lectura)

  const admin={id:nuevoId(), negocioId:negId, nombre:ADMIN_DEMO, usuario:opc.usuario, rol:'admin', activo:true, creado:iso(ahora)};

  const productos=plantilla.productos.map(p=>({
    id:nuevoId(), nombre:p[0], precio:p[1], categoria:p[2],
    stock:p[3], stockMin:p[3]!=null?5:null, agotado:false, usaLotes:false, lotes:[],
    imagen:'', creado:iso(ahora), ejemplo:true
  }));
  const clientes=plantilla.clientes.map((c,i)=>({
    id:nuevoId(), nombre:c[0], tel:c[1], dir:'', barrio:'', pedidos:2+i, total:0, creado:iso(ahora)
  }));

  // Caja abierta, con la misma forma que abrirCaja (ui/caja/caja.js)
  const cajaId=nuevoId();
  const cajaActual=conCaja(null, SUCURSAL_PRINCIPAL, {id:cajaId, base:50000, apertura:iso(ahora), cajero:ADMIN_DEMO, movimientos:[]});

  // Ventas de los últimos días, para que las gráficas de seguimiento se vean llenas
  const ventas=[], movimientos=[];
  const metodosPosibles=['efectivo','efectivo','efectivo','banco','tarjeta'];  // efectivo más frecuente
  let numFactura=0;
  for(let dia=DIAS_HISTORIAL_DEMO; dia>=0; dia--){
    // Fines de semana más movidos: 3-6 ventas entre semana, 5-8 el fin de semana
    const fechaDia=new Date(ahora); fechaDia.setDate(fechaDia.getDate()-dia);
    const finDeSemana=(fechaDia.getDay()===0||fechaDia.getDay()===6);
    const ventasDelDia=(finDeSemana?5:3) + Math.floor(azar()*4);
    for(let i=0;i<ventasDelDia;i++){
      numFactura++;
      const nItems=1+Math.floor(azar()*3);
      const items=[]; let subtotal=0;
      for(let j=0;j<nItems;j++){
        const pr=productos[Math.floor(azar()*productos.length)];
        const qty=1+Math.floor(azar()*2);
        items.push({prodId:pr.id, nombre:pr.nombre, precio:pr.precio, qty});
        subtotal+=pr.precio*qty;
      }
      const hora=new Date(fechaDia);
      hora.setHours(8+Math.floor(azar()*12), Math.floor(azar()*60), 0);
      const esHoy=(dia===0);
      const cli=clientes[numFactura%clientes.length];
      ventas.push({
        id:nuevoId(), factura:'F-'+String(numFactura).padStart(5,'0'),
        items, subtotal, subtotalBruto:subtotal, descuento:0, valorDom:0, propina:0, recargo:0,
        total:subtotal, metodo:metodosPosibles[Math.floor(azar()*metodosPosibles.length)], estado:'pagada',
        tipo:perfil.tiposEntrega[0]||'llevar',
        cajaId: esHoy?cajaId:null,          // solo las de hoy pertenecen a la caja actual
        vendedor:ADMIN_DEMO, vendedorId:admin.id, sucursalId:SUCURSAL_PRINCIPAL,
        fecha:hora.toISOString(),
        obs:'', mesa:'', cliNombre:cli.nombre, cliTel:cli.tel,
        estadoPedido:'entregado', cobrado:hora.toISOString()
      });
    }
  }
  // Entradas de inventario escalonadas en días pasados
  productos.filter(p=>p.stock!=null).slice(0,6).forEach((p,idx)=>{
    const f=new Date(ahora); f.setDate(f.getDate()-(DIAS_HISTORIAL_DEMO-idx));
    movimientos.push({id:nuevoId(), productoId:p.id, nombre:p.nombre, tipo:'entrada',
      cantidad:p.stock, motivo:'Inventario inicial', por:ADMIN_DEMO, fecha:f.toISOString()});
  });
  return {negocio, admin, productos, clientes, cajaActual, ventas, movimientos};
}
