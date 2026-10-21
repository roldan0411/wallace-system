# Wallace System — Sistema multi-negocio (SaaS)

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
- **Con Firebase:** sincroniza en la nube, multi-dispositivo. `firebase-config.js` elige la base según el dominio (producción solo desde el dominio público).
- **Seguridad:** cada persona inicia sesión con Firebase Authentication y las reglas de la base (`database.rules.json`) solo le entregan los datos de su negocio. Detalle en `Documentation/-02-corrections` (S1).

## Primer ingreso

- No hay usuarios ni contraseñas de demostración en el código. En una instalación nueva, la app pide crear la cuenta del **dueño del sistema**.
- Los negocios demo (Panel → ✨ Crear demo) usan `demo`, `demo2`… con contraseña `demo123`.

## Desarrollo

```bash
npm install
npm test                 # reglas del negocio (segundos)
npm run test:firebase    # reglas de seguridad + migración + interfaz en emuladores (Java 11+ y Chrome)
npm run emulador         # la app completa contra emuladores locales → http://localhost:3000/?emulador
```

## Desplegar

1. Sitio estático: `index.html`, `src/` y `firebase-config.js` (y `prueba.html` + `prueba.js` para diagnóstico).
2. `git push` → Render lo publica solo (`render.yaml`).
3. Reglas de la base: `npm run reglas:transicion` / `npm run reglas:cerradas` (proyecto de pruebas; ver `Documentation/-00-execution-protocol`).

---

**WALLACE COMPANY SYSTEM — Ing. Roldán Aldana · wallacecompany11@gmail.com**
