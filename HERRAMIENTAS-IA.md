# Herramientas de diseño con IA

Qué quedó instalado en este proyecto, qué funciona ya, y qué falta que hagas tú.

---

## Estado

| Herramienta | Estado | Requiere acción tuya |
|---|---|---|
| **UI/UX Pro Max** (skill) | Funcionando | No |
| **Stitch Skills** (16 skills) | Instaladas | Sí — configurar el MCP |
| **21st.dev CLI** | Instalada | Sí — iniciar sesión |
| **Stitch MCP** (servidor) | No configurado | Sí |

Reinicia Claude Code para que cargue los plugins nuevos.

---

## 1. UI/UX Pro Max — listo, sin login

Skill de inteligencia de diseño (127k estrellas, MIT). Es un buscador BM25 sobre
catálogos de patrones de UI, tipografía, color, motion y accesibilidad.

```bash
python .agents/skills/ui-ux-pro-max/scripts/search.py "landing page software company"
python .agents/skills/ui-ux-pro-max/scripts/search.py "formulario de cotizacion" --design-system
```

**Auditoría de seguridad:** un escáner (Gen) la marcó *High Risk*, pero Socket dio
0 alertas y Snyk *Low Risk*. La revisé a mano: no hace llamadas de red, no usa
`subprocess` ni `eval`, y no escribe fuera de su propia carpeta. Es lectura de
CSVs. El *High Risk* parece un falso positivo por incluir scripts de Python.

---

## 2. 21st.dev — falta iniciar sesión

La CLI está instalada globalmente y registró 21 skills en `~/.claude/skills/`
(`21st-ui-build`, `21st-ui-explore`, `21st-ui-review`, `21st-design-sync`,
`21st-registry`, `21st-ai`, `21st-cli-use`).

**Buscar componentes falla sin sesión.** Abre una terminal y corre:

```powershell
$env:Path = "$env:LOCALAPPDATA\nodejs-portable;" + $env:Path
21st login
```

Se abre el navegador. Alternativa sin navegador: define `TWENTYFIRST_TOKEN`.

Comprobar que quedó: `21st whoami`

---

## 3. Stitch — falta el servidor MCP

Las 16 skills ya están en `~/.claude/plugins/`:

- **stitch-design**: `generate-design`, `code-to-design`, `extract-design-md`,
  `extract-static-html`, `manage-design-system`, `upload-to-stitch`
- **stitch-build**: `react-components`, `react-native`, `shadcn-ui`,
  `react-vite-dashboard`, `remotion`
- **stitch-utilities**: `design-md`, `site-md`, `enhance-prompt`, `stitch-loop`,
  `taste-design`

**Pero no sirven sin el servidor MCP**, y su URL solo se obtiene iniciando sesión
en Stitch. No la inventé ni instalé una implementación de terceros: darle acceso
de herramientas a un servidor MCP no verificado es un riesgo real.

Pasos:

1. Entra a <https://stitch.withgoogle.com/docs/mcp/setup/> con tu cuenta de Google.
2. Copia la URL de tu servidor MCP.
3. Regístralo (es un servidor remoto, no un comando local):

```bash
claude mcp add --transport http stitch <TU_URL_DE_STITCH>
```

4. Verifica con `/mcp` dentro de Claude Code.

---

## El problema de compatibilidad que debes conocer

**21st.dev y Stitch generan React + Tailwind CSS + Shadcn UI.**
**programasgt.art es HTML y CSS puro, sin frameworks.**

No se pueden pegar esos componentes en `index.html`. Es el mismo choque que
tuvimos con Cult-UI: entonces porté las *técnicas* a CSS nativo a mano, en vez
de importar componentes.

Hay tres caminos, y son decisiones distintas:

**A — Usarlas solo como inteligencia de diseño.**
UI/UX Pro Max y las skills de Stitch de tipo `design-md` / `taste-design`
funcionan sin React: dan criterios, paletas, jerarquías y patrones. Yo los
traduzco a tu CSS. Cero riesgo, el sitio sigue pesando 118 KB.

**B — Reconstruir el sitio en React + Tailwind + Shadcn.**
Ahí sí importas componentes de 21st.dev directamente. Pero pierdes el sitio
actual, y un sitio estático de 118 KB pasaría a cargar un framework. Para una
página de presentación es difícil de justificar.

**C — Usarlas en el panel del asistente.**
`asistente-ia/` tiene un panel de control que sí es una aplicación de verdad
(prospectos, citas, conversaciones). Ahí React + Shadcn se pagan solos, y el
sitio público queda intacto.

Mi recomendación: **A para programasgt.art, C para el panel del asistente.**

---

## Qué NO se versiona

`.gitignore` excluye `.agents/` y `.claude/skills/` (3.7 MB de datos que se
reinstalan solos). Lo que sí se versiona es `skills-lock.json`, que fija la
versión exacta con su hash. Para reinstalar en otra máquina:

```bash
npx skills i nextlevelbuilder/ui-ux-pro-max-skill/.claude/skills/ui-ux-pro-max
npx plugins add google-labs-code/stitch-skills --scope project --target claude-code
npm i -g @21st-dev/cli
```
