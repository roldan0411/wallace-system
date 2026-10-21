# Tema de la interfaz (colores, fuentes, tamaños) y textos

Cómo están centralizados los valores visuales de la interfaz, cómo cambia el color por negocio y el modo claro, y qué falta (rediseño y textos). Las rutas `ui/…` son relativas a `src/adaptadores/entrada/`.

## 1. Un solo lugar para los valores: `ui/estilos/00-tokens.css`

Desde el 2026-10-11 **todos** los colores, fuentes, tamaños de letra y radios de esquina están definidos como variables CSS (*tokens*) en `ui/estilos/00-tokens.css`, que se carga antes que los demás estilos. Los otros 15 archivos CSS no tienen ningún valor escrito a mano: usan `var(--nombre)`. La prueba `tests/ui/estructura.test.mjs` lo exige (sección 5).

```css
/* antes */  .tarjeta{background:linear-gradient(170deg,#212734,#1a1f2a);border-radius:16px;}
/* ahora */  .tarjeta{background:linear-gradient(170deg,var(--tarjeta-2),var(--tarjeta));border-radius:var(--radio-16);}
```

Cambiar un color en `00-tokens.css` lo cambia en toda la interfaz.

### 1.1 Los tres tipos de token

| Tipo | Tokens | Quién los cambia |
|---|---|---|
| **Acento del negocio** | `--acento`, `--acento-c` (más claro u oscuro según el tema), `--acento-o` (oscuro), `--acento-rgb`, `--acento-txt` (texto legible encima del acento) | `ui/nucleo/tema.js` (`aplicarTema`), en `<body>`, con el `colorTema` de cada negocio. Hasta el 2026-10-11 se llamaban `--verde…` y `--acc-…`, aunque para un negocio con color morado eran morados |
| **Cambian con el tema claro** | `--bg`, `--panel`, `--panel2`, `--txt`, `--txt2`, `--gris`, `--linea2`, `--sombra`, `--sombra-g` | El bloque `body.tema-claro` de `00-tokens.css` (si el negocio eligió tema claro) |
| **Constantes** | Todo lo demás: marca (`--marca…`), estados (`--rojo…`, `--oro…`, `--naranja…`, `--azul…`), superficies oscuras (`--campo`, `--tarjeta`, `--elevada`, `--modal`, `--sidebar-…`), tintas (`--tinta-verde`…), login (`--login-…`), fuentes, tamaños, radios | Nadie: valen igual en todos los negocios y temas |

**Marca vs. acento**: el verde de Wallace System (`--marca`, `#01c38e`) es fijo: login, botón de entrar. El acento (`--acento`) empieza con el mismo verde, pero cada negocio lo cambia. Antes los dos se escribían igual (`#01c38e` o `var(--verde)`) y no se distinguían.

### 1.2 Cómo se nombran

- `--x-rgb`: el mismo color en canales (`255,92,106`) para usar transparencias: `rgba(var(--rojo-rgb),.15)`.
- `-c` / `-o`: variante clara / oscura (`--rojo-o` es el rojo legible sobre fondo blanco).
- `--fs-13`: tamaño de letra de 13 px. `--radio-12`: esquina de 12 px. Llevan el número porque hoy hay **26 tamaños de letra** distintos (de 8 a 42 px) y 16 radios (14 en px, más `--radio-pildora` y `--radio-circulo`). Reducirlos a una escala corta (p. ej. 5 tamaños) cambia el aspecto, así que es parte del rediseño. Con los tokens, eso se hace en un solo archivo.

## 2. Color por negocio y modo claro

1. Al entrar a un negocio, `aplicarTema(negocio)` (`ui/nucleo/tema.js`):
   - pone o quita la clase `tema-claro` en `<body>`;
   - calcula las variantes del color elegido: `--acento`, `--acento-c`, `--acento-o`, `--acento-rgb`, `--acento-txt`. Si el color es casi blanco, lo oscurece para que se lea.
2. Con `body.tema-claro`, `00-tokens.css` redefine los tokens de superficie y texto (`--bg:#eef1f6`, `--panel:#ffffff`, `--txt:#1a1e29`…).
3. `ui/estilos/11-tema-claro.css` tiene además ajustes por componente para el modo claro (sección 4).

## 3. Cómo agregar o cambiar algo

| Quiero… | Dónde |
|---|---|
| Cambiar un color de toda la app | Su token en `00-tokens.css` |
| Un color nuevo | Un token nuevo en `00-tokens.css` (en su grupo) y usarlo con `var(--nombre)`. **Nunca** `#hex` o `rgba(0,0,0,…)` en los otros CSS |
| Un color que siga al negocio | `var(--acento…)` |
| Algo distinto en tema claro | Primero intentar que use un token que ya cambia con el tema (`--panel`, `--txt`…); si no alcanza, un token nuevo redefinido en el bloque `body.tema-claro` de `00-tokens.css` |
| Un tamaño de letra o un radio | Uno de los `--fs-…` / `--radio-…` existentes (no agregar pasos nuevos) |

## 4. Lo que queda para el rediseño (hallazgos)

- **`11-tema-claro.css` todavía repinta componente por componente** (`body.tema-claro .tarjeta{background:var(--panel)}`, botones, campos, rojos legibles…), con `!important` y reglas que se repiten. Ya usa tokens, pero el modo claro no es todavía "solo tokens". La forma limpia es un token por superficie (p. ej. `--fondo-tarjeta`: degradado en oscuro, `--panel` en claro) y borrar esas reglas. Cambia la estructura de casi todos los componentes, así que conviene hacerlo con el rediseño, verificando con capturas.
- **(Corregido el 2026-10-12, F23: ahora se recalculan en `body`.)** **`--linea`, `--glow` y `--glow-txt` no seguían el color del negocio.** Están definidos en `:root` a partir de `--acento-rgb`. Como `tema.js` cambia `--acento-rgb` en `<body>` y no en `:root`, esos tres se calculan una sola vez con el verde por defecto. Las líneas y brillos que los usan quedan verdes para todos los negocios. Es el comportamiento actual (no se tocó para no cambiar el aspecto). Para que sigan al negocio, basta con definirlos también en `body`.
- **26 tamaños de letra y 16 radios**: consolidarlos en una escala corta.
- **Colores dentro del JavaScript**:
  - `ui/super-admin/reporte-mensual.js` (verde o rojo de la utilidad) y las plantillas de impresión (`ui/impresion/`, que se abren en otra ventana sin estos CSS);
  - los colores por defecto del selector de color (`ui/configuracion/`) y el logo (`ui/nucleo/logo.js`).

  No pasan por los tokens.

## 5. Cómo se verificó y qué lo vigila

- **Sin cambio visible**: las 121 capturas (`node scripts/capturas.mjs`) antes y después de pasar a tokens son idénticas píxel a píxel, en tema oscuro (primer negocio, super-admin) y claro (los otros dos negocios), en escritorio y celular.
- **`tests/ui/estructura.test.mjs`** falla si un CSS distinto de `00-tokens.css` tiene un color (`#…`, `rgb(…)`), un tamaño de letra en `px` o un radio en `px`.

## 6. Textos

- **Catálogo de mensajes y botones (2026-10-12)**: `ui/nucleo/textos.js`.
  - `MSJ`: los **199 mensajes fijos** de avisos (`toast`), confirmaciones (`confirmarModal`) y preguntas (`preguntarDespues`), agrupados por la carpeta donde se usan primero. Uso: `toast(MSJ.pedidoNoEncontrado,'error')`.
  - `BOTON`: los **17 textos** del botón principal de las ventanas (`abrirModal({textoBoton:BOTON.guardar})`).
  - La clave sale del propio texto (`'No tienes acceso a Gastos'` → `noTienesAccesoAGastos`), así se lee qué dice sin abrir el catálogo. Un mismo texto usado en varios lugares es **una** clave: cambiarlo ahí lo cambia en todos.
  - **Siguen en su módulo**: los ~114 mensajes que llevan datos (`'Negocio creado: '+nombre`) y los textos de las plantillas de pantalla (títulos, etiquetas, tablas). Pasarlos sería el paso siguiente si algún día hay otro idioma (con funciones: `MSJ.negocioCreado(nombre)`).
  - **Regla** (la exige `tests/ui/estructura.test.mjs`): un mensaje o botón de ventana con texto fijo va en el catálogo; el catálogo no tiene claves sin usar ni el código claves que no existan.
  - Sacado con un analizador (acorn), conservando el texto exacto: las 121 capturas quedaron iguales.
- **Lo que sí está centralizado**:
  - el **vocabulario de cada negocio**: `pProd()`, `pProds()`, `pPedido()`, `pPedidos()`, `pPersonal()` en `ui/nucleo/componentes.js`, con `palabraProducto`, `palabraPedido`, `palabraPersonal` del negocio ("Servicio" en vez de "Producto", "Turno" en vez de "Pedido");
  - los **mensajes de error de inicio de sesión** en `mensajeDeFallo` (`src/aplicacion/servicios/sesion.js`).
