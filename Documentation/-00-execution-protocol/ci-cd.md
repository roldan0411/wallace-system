# Pruebas automáticas y despliegue (CI/CD) — pendiente

> Estado al 2026-10-13: **no hay ningún pipeline**. Las pruebas se corren a mano (`npm test` y `npm run test:firebase`), y Render, si tiene Auto-Deploy, publica cada push **sin esperar a las pruebas**. Este documento deja listo cómo configurarlo; se hará más adelante.

## 1. Qué se quiere

| Parte | Qué hace | Cuándo |
|---|---|---|
| **CI** (integración continua) | Corre `npm test` y `npm run test:firebase` en un servidor de GitHub | En cada push y cada Pull Request |
| **CD del sitio** (Render) | Publica solo los commits con las pruebas en verde | Al llegar a la rama que publica Render |
| **CD del sandbox** (reglas y Hosting de `wallacesys-dev-sandbox`) | `firebase deploy -P pruebas` | **A mano**, con un botón en GitHub |
| **Producción** (`wallace-system`) | — | **Nunca automática**: reglas del proyecto (`CLAUDE.md` → Datos y seguridad) |

## 2. Dónde: GitHub Actions

Archivos YAML en **`.github/workflows/`** del repositorio. GitHub los ejecuta solo y muestra el resultado en la pestaña **Actions** y junto a cada commit o Pull Request: ✅ o ❌.

- Costo: gratis en repositorios públicos; en privados, 2.000 minutos al mes gratis. Una corrida completa son unos 6 a 8 minutos.
- El proyecto **ya corre en Linux**:
  - las pruebas de navegador buscan Chrome también en `/usr/bin/google-chrome` y aceptan `CHROME_PATH`;
  - el arreglo del puerto 9000 de `scripts/probar-firebase.mjs` solo corre en Windows.
- Las pruebas **no necesitan claves ni tocan bases reales**: usan los emuladores de Firebase con el proyecto inventado `demo-wallace`, y la interfaz en modo `?local` o `?emulador`.

## 3. CI: `.github/workflows/pruebas.yml`

```yaml
name: Pruebas
on:
  push:
  pull_request:
jobs:
  rapidas:                      # dominio, servicios y estructura de la interfaz: segundos
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 23, cache: npm }
      - run: npm ci
      - run: npm test

  firebase:                     # reglas, integración, S1 en el navegador y recorrido de 327 pantallas
    needs: rapidas
    runs-on: ubuntu-latest
    timeout-minutes: 20
    env:
      CHROME_PATH: /usr/bin/google-chrome
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 23, cache: npm }
      - uses: actions/setup-java@v4          # los emuladores de Firebase usan Java 11+
        with: { distribution: temurin, java-version: 17 }
      - run: npm ci
      - run: npm run test:firebase
```

**Opcional**: un tercer trabajo con las capturas (`node scripts/capturas.mjs tomar` + `comparar`). Necesita la carpeta de referencia, que no está en Git: habría que guardarla como *artifact* o en una rama aparte. Se deja para después.

## 4. CD del sitio (Render)

Dos formas, según el plan de Render:
1. **"Publicar solo si pasan las pruebas"** (recomendada). En el servicio de Render: *Settings → Build & Deploy → Auto-Deploy* → la opción que espera a los *checks* de GitHub ("After CI Checks Pass"). Render mira el estado de `pruebas.yml` del commit.
2. **Deploy Hook**, si el plan no tiene esa opción:
   - Render → *Settings → Deploy Hook* → copiar la URL;
   - GitHub → *Settings → Secrets and variables → Actions* → secreto `RENDER_DEPLOY_HOOK`;
   - Auto-Deploy de Render en **Off**, y al final de `pruebas.yml`, solo en la rama que se publica:

```yaml
  publicar:
    needs: firebase
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    runs-on: ubuntu-latest
    steps:
      - run: curl -fsS -X POST "${{ secrets.RENDER_DEPLOY_HOOK }}"
```

Antes de cualquier despliegue que cambie la interfaz, siguen valiendo las reglas de siempre: `VERSION_UI` y `?v=` subidos (la prueba lo exige) y `HOSTS_PRODUCCION` correcto ([paso-a-produccion](paso-a-produccion.md)).

## 5. CD del sandbox: `.github/workflows/sandbox.yml` (manual)

```yaml
name: Publicar en el sandbox
on:
  workflow_dispatch:
    inputs:
      que:
        description: 'reglas o sitio'
        required: true
        default: 'reglas'
        type: choice
        options: [reglas, sitio]
jobs:
  publicar:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 23, cache: npm }
      - run: npm ci
      - name: Credencial del sandbox (solo wallacesys-dev-sandbox)
        run: echo '${{ secrets.FIREBASE_SANDBOX_SA }}' > "$RUNNER_TEMP/sa.json"
      - name: Reglas cerradas
        if: inputs.que == 'reglas'
        env: { GOOGLE_APPLICATION_CREDENTIALS: '${{ runner.temp }}/sa.json' }
        run: npx firebase deploy --only database -P pruebas
      - name: Sitio (Hosting)
        if: inputs.que == 'sitio'
        env: { GOOGLE_APPLICATION_CREDENTIALS: '${{ runner.temp }}/sa.json' }
        run: node scripts/publicar-sandbox.mjs && npx firebase deploy --only hosting -P pruebas --config firebase.hosting.json
```

Para tenerlo:
1. Consola de Google Cloud del proyecto **`wallacesys-dev-sandbox`** → *IAM → Cuentas de servicio* → crear una con los roles **Firebase Rules Admin** y **Firebase Hosting Admin**, y descargar su clave JSON.
2. GitHub → *Settings → Secrets and variables → Actions* → secreto **`FIREBASE_SANDBOX_SA`** con el contenido del JSON. **Nunca** guardar ese JSON dentro de la carpeta del proyecto: **`.gitignore` no lo tapa** (solo tapa exports, respaldos, `importar-pruebas*.json` y `perfil.json`). Descargarlo a otra carpeta, pegarlo en el secreto y borrarlo.
3. Pestaña *Actions → Publicar en el sandbox → Run workflow* → elegir "reglas" o "sitio".

La cuenta de servicio es **solo del sandbox**: aunque alguien cambiara el flujo, no tiene permisos sobre `wallace-system`.

## 6. Proteger la rama

GitHub → *Settings → Branches → Add rule* para la rama que se publica (`main`):
- **Require status checks to pass before merging**: `rapidas` y `firebase`;
- **Require a pull request before merging** (opcional, para revisar antes de unir).

Así nada con pruebas en rojo llega a la rama que publica Render.

## 7. Pasos para activarlo (cuando se decida)

| # | Qué | Quién |
|---|---|---|
| 1 | Crear `.github/workflows/pruebas.yml` (sección 3) | Desarrollo (lo puede hacer el asistente) |
| 2 | Primer push: ver la corrida en *Actions* y corregir lo que falle en Linux | Desarrollo |
| 3 | Protección de la rama (sección 6) | Dueño del repositorio |
| 4 | Render: Auto-Deploy después de las pruebas, o Deploy Hook (sección 4) | Dueño del servicio de Render |
| 5 | Opcional: cuenta de servicio del sandbox y `sandbox.yml` (sección 5) | Dueño del proyecto de Firebase |
| 6 | En el repositorio original (`roldan0411/wallace-system`), lo mismo cuando se una este código | Su dueño |
