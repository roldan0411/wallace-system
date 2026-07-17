# Wallace POS — Sistema multi-negocio (SaaS)
### Un solo sistema que cualquier restaurante, barbería o tienda puede usar
**WALLACE COMPANY SYSTEM — Ing. Roldán Aldana · wallacecompany11@gmail.com**

---

## Qué es

Un sistema POS en la nube donde **muchos negocios** entran con su cuenta y cada uno
ve solo SU información, aislada de los demás. El **super-admin (dueño del sistema)**
configura cada negocio y controla quién paga.

## Los dos niveles

1. **SUPER-ADMIN (tú):** crea negocios, los configura (tipo, marca, funciones, plan),
   activa o suspende (control de pago).
2. **CADA NEGOCIO:** admin y empleados entran y usan el sistema adaptado a su rubro.

## Se adapta a cualquier tipo de negocio

Al crear un negocio, se elige el tipo y el sistema se configura solo:
- **Restaurante / Cafetería:** mesas, cocina, recetas. "Plato".
- **Comida rápida:** cocina, domicilios. "Producto".
- **Barbería / Salón:** citas/turnos. "Servicio".
- **Tienda de ropa / Accesorios:** tallas/colores, código de barras. "Prenda".
- **Minimercado / Ferretería / Papelería / Farmacia:** inventario, barras. "Producto".

## Módulos

- Panel super-admin (crear/configurar/suspender negocios, control de pagos)
- Nueva Venta (carrito) + Catálogo de productos/servicios
- Caja (abrir/cerrar con cuadre por método de pago)
- Cocina / KDS (restaurantes) con temporizador
- Citas / Turnos (barberías, salones)
- Inventario (stock, recetas, movimientos, alertas, reportes)
- Clientes y Domiciliarios
- Reportes de ventas
- Gastos del Negocio y Registro Contable Mensual
- Usuarios por negocio (admin, cajero, mesero, cocina)
- Configuración por negocio (logo, datos)
- Impresión de facturas
- Aislamiento total por negocio

## Nube o local

- **Sin Firebase:** funciona en el navegador (modo local), ideal para probar.
- **Con Firebase:** sincroniza en la nube, multi-dispositivo. Llena `firebase-config.js`.

## Acceso demo

- **Super-admin:** superadmin / super123
- **Negocio de ejemplo — admin:** admin / admin123

## Desplegar

1. Copia los 7 archivos a la carpeta con git.
2. `git add . && git commit -m "wallace pos" && git push`
3. En Render (u hosting) se despliega solo.
4. Para la nube: llena firebase-config.js con tu proyecto Firebase.

---

**WALLACE COMPANY SYSTEM — Ing. Roldán Aldana · wallacecompany11@gmail.com**
