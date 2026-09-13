<!-- Escrito a mano. El detector automático de 21st no encontró nada porque
     busca package.json / tailwind.config / components.json, y este proyecto
     es HTML y CSS puro. Los valores salen de :root en index.html.
     Editar las restricciones y decisiones en .21st/design.json. -->

# Contexto de diseño — ProgramasGT

## Proyecto

- **Nombre:** programasgt (programasgt.art)
- **Tipo:** sitio de presentación de una casa de software guatemalteca
- **Stack:** HTML + CSS + JavaScript puro. **Sin framework, sin paso de build.**
- **Entrega:** un solo `index.html` autocontenido servido por GitHub Pages
- **Modo de color:** claro y oscuro vía `:root[data-theme="dark"]`
- **Densidad:** cómoda

## Lo que esto significa para cualquier sugerencia

El catálogo de 21st.dev devuelve componentes de **React + Tailwind + Shadcn UI**,
instalables con `npx shadcn@latest add`. **Aquí no se pueden pegar.**

Úsalo como *inteligencia de diseño*: toma la estructura, la jerarquía, el
espaciado y las decisiones de color, y tradúcelas a CSS nativo con los tokens
de abajo. Es lo que ya se hizo con Cult-UI.

## Tokens

### Color — tema claro

| Rol | Valor |
|---|---|
| Primario | `#0B63C4` (azul de ingeniería) |
| Primario oscuro | `#0A55A8` |
| Fondo | `#EEF2F7` |
| Superficie | `#FFFFFF` |
| Texto | `#071120` |
| Texto atenuado | `#42536B` |
| Texto sutil | `#5E6E82` |
| Borde | `#CBD6E4` |
| Éxito | `#0E7A55` |

### Color — tema oscuro

| Rol | Valor |
|---|---|
| Primario | `#4FA3FF` |
| Fondo | `#04080F` |
| Superficie | `#0A121F` |
| Texto | `#E7EEF8` |
| Borde | `#1D2A3D` |

### Tipografía

- **Titulares:** Saira
- **Cuerpo:** Karla
- **Datos técnicos y etiquetas:** JetBrains Mono

### Forma y espacio

- Radio base: `12px`
- Ancho máximo: `1180px`
- Relleno: `clamp(20px, 5vw, 48px)`

### Movimiento

- Curva: `cubic-bezier(.2, .8, .2, 1)`
- Duración: **140–280 ms**
- La curva es lo que separa "maquinaria de precisión" de "plantilla genérica".
  Nada de rebotes ni `ease-in-out` largos.

## Restricciones

### Obligatorio

- HTML y CSS puro. El sitio no usa framework y no debe empezar a usarlo.
- Un solo `index.html` autocontenido.
- Respetar la identidad de circuito impreso y el azul `#0B63C4`.
- Mantener el peso bajo: 118 KB es una decisión, no un accidente.
- Soportar tema claro y oscuro.
- Respetar `prefers-reduced-motion` apagando lo que se repite en bucle.
- Contraste mínimo WCAG AA: 4.5:1 en texto, 3:1 en bordes de controles.

### Prohibido

- React, Tailwind, Shadcn UI, y cualquier dependencia de build.
- La estética genérica de IA: degradados morados, vidrio esmerilado, burbujas.
- Animaciones con rebote o `ease-in-out` de más de 400 ms.
- Imágenes en base64. Ya se extrajeron y costaban 455 KB.

## Patrones presentes

`hero` · `service-cards` · `process-steps` · `tech-stack` · `team` · `quote-form`

## Decisiones registradas

| Fecha | Decisión |
|---|---|
| 2026-09-12 | Portar técnicas de librerías React a CSS nativo en vez de adoptar el framework |
| 2026-09-12 | Imágenes externas en WebP con preload del LCP, no base64 |
| 2026-09-13 | 21st.dev y Stitch se usan como inteligencia de diseño, no como fuente de componentes |

## Nota sobre el aviso de "drift"

`21st init --design-context --check` avisa de *drift* porque este archivo y
`design.json` se escribieron a mano y ya no coinciden con el hash del detector
automático. Es esperado: la detección automática produce un contexto vacío
porque no hay stack de React que detectar.

**No corras `--refresh`**: sobrescribiría este contexto con uno vacío.
