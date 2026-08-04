# V7 — Validação WCAG AA 4.5:1 dos tokens ajustados (success/info/destructive)

Fonte da verdade: `src/styles/tokens.css` (light `:root`, dark `.dark`) + `src/styles/accessibility.css` (HC). Gerado por `docs/wcag_contrast_v7_validate.py` (idempotente). Dois métodos de luminância: WCAG 2.1 oficial (piecewise) e gamma 2.2.

## Tokens atuais (ground truth)

| Tema | Token | HSL | RGB |
|---|---|---|---|
| light | --success | 142 76% 28% | #117E39 |
| light | --info | 214 100% 48% | #006AF5 |
| light | --destructive | 0 72% 42% | #B81E1E |
| dark | --success | 142 90% 28% | #078836 |
| dark | --info | 210 100% 45% | #0073E6 |
| dark | --destructive | 0 95% 47% | #EA0606 |

## Matriz de contraste (verdict @4.5:1, normal text)

| Par | FG | BG | Ratio WCAG | Ratio γ2.2 | Verdict |
|---|---|---|---|---|---|
| light | success | A fg-on-solid | #FFFFFF | #117E39 | 5.18 | 5.15 | PASS |
| light | success | B text-on-bg | #117E39 | #F9F9FB | 4.94 | 4.91 | PASS |
| light | success | C text-on-card | #117E39 | #FFFFFF | 5.18 | 5.15 | PASS |
| light | info | A fg-on-solid | #FFFFFF | #006AF5 | 4.79 | 4.78 | PASS |
| light | info | B text-on-bg | #006AF5 | #F9F9FB | 4.57 | 4.56 | PASS |
| light | info | C text-on-card | #006AF5 | #FFFFFF | 4.79 | 4.78 | PASS |
| light | destructive | A fg-on-solid | #FFFFFF | #B81E1E | 6.47 | 6.52 | PASS |
| light | destructive | B text-on-bg | #B81E1E | #F9F9FB | 6.16 | 6.22 | PASS |
| light | destructive | C text-on-card | #B81E1E | #FFFFFF | 6.47 | 6.52 | PASS |
| light-HC | destructive | A fg-on-solid (HC) | #FFFFFF | #CC0000 | 5.89 | 5.83 | PASS |
| light-HC | destructive | B text-on-bg (HC) | #CC0000 | #F9F9FB | 5.61 | 5.56 | PASS |
| light | destructive | FALLBACK white-on-solid | #FFFFFF | #B81E1E | 6.47 | 6.52 | PASS |
| dark | success | A fg-on-solid | #FFFFFF | #078836 | 4.60 | 4.55 | PASS |
| dark | success | B text-on-bg | #078836 | #000000 | 4.57 | 4.62 | PASS |
| dark | success | C text-on-card | #078836 | #000000 | 4.57 | 4.62 | PASS |
| dark | info | A fg-on-solid | #FFFFFF | #0073E6 | 4.59 | 4.55 | PASS |
| dark | info | B text-on-bg | #0073E6 | #000000 | 4.58 | 4.61 | PASS |
| dark | info | C text-on-card | #0073E6 | #000000 | 4.58 | 4.61 | PASS |
| dark | destructive | A fg-on-solid | #FFFFFF | #EA0606 | 4.65 | 4.65 | PASS |
| dark | destructive | B text-on-bg | #EA0606 | #000000 | 4.52 | 4.51 | PASS |
| dark | destructive | C text-on-card | #EA0606 | #000000 | 4.52 | 4.51 | PASS |
| dark-HC | destructive | A fg-on-solid (HC) | #000000 | #FF3333 | 5.77 | 5.71 | PASS |
| dark-HC | destructive | B text-on-bg (HC) | #FF3333 | #000000 | 5.77 | 5.71 | PASS |
| dark | destructive | FALLBACK white-on-solid | #FFFFFF | #EA0606 | 4.65 | 4.65 | PASS |

## Resultado

**TODOS OS PARES PASSAM ≥ 4.5:1** (0 falhas).

