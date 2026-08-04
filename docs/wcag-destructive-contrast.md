# WCAG AA contrast simulation — destructive token (all themes)

Generated: branch fix/sla-csp-edge. Sources: `src/styles/tokens.css`, `src/styles/accessibility.css`.

Formulas: **(a) gamma 2.2** `0.2126R^2.2 + 0.7152G^2.2 + 0.0722B^2.2` vs **(b) WCAG 2.1** official relative luminance (piecewise).
Verdicts use WCAG ratio: `AA45` = normal text 4.5:1, `AA30` = large text / UI components 3:1. Delta = |gamma − wcag|.

## Core matrix (solid button + fallback scenario)

| Theme | Scenario | bg_hex | fg_hex | ratio_gamma | ratio_wcag | delta | AA45 | AA30 |
|---|---|---|---|---|---|---|---|---|
| Light | solid: destructive + destructive-foreground (base) | #B81E1E | #FFFFFF | 6.53 | 6.48 | 0.05 | PASS | PASS |
| Light | solid: destructive + FALLBACK fg = white (var fails to load) | #B81E1E | #FFFFFF | 6.53 | 6.48 | 0.05 | PASS | PASS |
| Dark/OLED | solid: destructive + destructive-foreground (base) | #E50606 | #FFFFFF | 4.82 | 4.82 | 0.00 | PASS | PASS |
| Dark/OLED | solid: destructive + FALLBACK fg = white (var fails to load) | #E50606 | #FFFFFF | 4.82 | 4.82 | 0.00 | PASS | PASS |
| HC light | solid: destructive + destructive-foreground (base) | #CC0000 | #FFFFFF | 5.83 | 5.89 | 0.06 | PASS | PASS |
| HC light | solid: destructive + FALLBACK fg = white (var fails to load) | #CC0000 | #FFFFFF | 5.83 | 5.89 | 0.06 | PASS | PASS |
| HC dark | solid: destructive + destructive-foreground (base) | #FF3333 | #000000 | 5.71 | 5.77 | 0.06 | PASS | PASS |
| HC dark | solid: destructive + FALLBACK fg = white (var fails to load) | #FF3333 | #FFFFFF | 3.68 | 3.64 | 0.04 | FAIL | PASS |

## Full matrix (all 100+ simulations)

| # | Theme | Scenario | bg_hex | fg_hex | ratio_gamma | ratio_wcag | delta | AA45 | AA30 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Light | solid: destructive + destructive-foreground (base) | #B81E1E | #FFFFFF | 6.53 | 6.48 | 0.05 | PASS | PASS |
| 2 | Light | solid: destructive + FALLBACK fg = white (var fails to load) | #B81E1E | #FFFFFF | 6.53 | 6.48 | 0.05 | PASS | PASS |
| 3 | Light | hover/alpha: destructive/95 over theme-bg + fg | #BB2929 | #FFFFFF | 6.12 | 6.07 | 0.05 | PASS | PASS |
| 4 | Light | hover/alpha: destructive/90 over theme-bg + fg | #BE3434 | #FFFFFF | 5.67 | 5.63 | 0.04 | PASS | PASS |
| 5 | Light | hover/alpha: destructive/85 over theme-bg + fg | #C23F3F | #FFFFFF | 5.18 | 5.15 | 0.03 | PASS | PASS |
| 6 | Light | hover/alpha: destructive/80 over theme-bg + fg | #C54A4A | #FFFFFF | 4.72 | 4.72 | 0.01 | PASS | PASS |
| 7 | Light | hover/alpha: destructive/75 over theme-bg + fg | #C85555 | #FFFFFF | 4.29 | 4.30 | 0.01 | FAIL | PASS |
| 8 | Light | hover/alpha: destructive/70 over theme-bg + fg | #CC6060 | #FFFFFF | 3.86 | 3.88 | 0.02 | FAIL | PASS |
| 9 | Light | hover/alpha: destructive/65 over theme-bg + fg | #CF6B6B | #FFFFFF | 3.49 | 3.52 | 0.03 | FAIL | PASS |
| 10 | Light | hover/alpha: destructive/60 over theme-bg + fg | #D27676 | #FFFFFF | 3.15 | 3.19 | 0.03 | FAIL | PASS |
| 11 | Light | hover/alpha: destructive/55 over theme-bg + fg | #D58181 | #FFFFFF | 2.85 | 2.88 | 0.04 | FAIL | FAIL |
| 12 | Light | hover/alpha: destructive/50 over theme-bg + fg | #D88C8C | #FFFFFF | 2.57 | 2.61 | 0.04 | FAIL | FAIL |
| 13 | Light | alpha: destructive/90 over card + fg | #BF3434 | #FFFFFF | 5.63 | 5.59 | 0.04 | PASS | PASS |
| 14 | Light | alpha: destructive/80 over card + fg | #C64B4B | #FFFFFF | 4.66 | 4.66 | 0.01 | PASS | PASS |
| 15 | Light | alpha: destructive/90 over muted + fg | #BD3233 | #FFFFFF | 5.77 | 5.73 | 0.05 | PASS | PASS |
| 16 | Light | alpha: destructive/60 over muted + fg | #CB6F72 | #FFFFFF | 3.43 | 3.47 | 0.03 | FAIL | PASS |
| 17 | Light | text: destructive on theme-bg | #F9F9FB | #B81E1E | 6.22 | 6.16 | 0.06 | PASS | PASS |
| 18 | Light | text: destructive on card | #FFFFFF | #B81E1E | 6.53 | 6.48 | 0.05 | PASS | PASS |
| 19 | Light | text: destructive on muted | #E7E9EF | #B81E1E | 5.41 | 5.34 | 0.08 | PASS | PASS |
| 20 | Light | text: destructive on popover | #FFFFFF | #B81E1E | 6.53 | 6.48 | 0.05 | PASS | PASS |
| 21 | Light | text: destructive on white | #FFFFFF | #B81E1E | 6.53 | 6.48 | 0.05 | PASS | PASS |
| 22 | Light | text: destructive on black | #000000 | #B81E1E | 3.22 | 3.24 | 0.03 | FAIL | PASS |
| 23 | Light | soft badge: destructive/15 bg + text destructive (on theme-bg) | #EFD8DA | #B81E1E | 4.86 | 4.78 | 0.08 | PASS | PASS |
| 24 | Light | soft badge: destructive/15 bg + text destructive (on card) | #F4DDDD | #B81E1E | 5.09 | 5.01 | 0.08 | PASS | PASS |
| 25 | Light | soft badge: destructive/10 bg + text destructive (on theme-bg) | #F2E3E5 | #B81E1E | 5.29 | 5.21 | 0.08 | PASS | PASS |
| 26 | Light | soft badge: destructive/30 bg + text destructive (on theme-bg) | #E5B7B9 | #B81E1E | 3.72 | 3.64 | 0.08 | FAIL | PASS |
| 27 | Light | border: destructive/30 vs theme-bg (UI component 3:1) | #B81E1E | #F9F9FB | 6.22 | 6.16 | 0.06 | PASS | PASS |
| 28 | Light | misuse: destructive-foreground text on theme-bg (white-on-white risk) | #F9F9FB | #FFFFFF | 1.05 | 1.05 | 0.00 | FAIL | FAIL |
| 29 | Light | misuse: destructive-foreground text on card | #FFFFFF | #FFFFFF | 1.00 | 1.00 | 0.00 | FAIL | FAIL |
| 30 | Dark/OLED | solid: destructive + destructive-foreground (base) | #E50606 | #FFFFFF | 4.82 | 4.82 | 0.00 | PASS | PASS |
| 31 | Dark/OLED | solid: destructive + FALLBACK fg = white (var fails to load) | #E50606 | #FFFFFF | 4.82 | 4.82 | 0.00 | PASS | PASS |
| 32 | Dark/OLED | hover/alpha: destructive/95 over theme-bg + fg | #DA0606 | #FFFFFF | 5.23 | 5.24 | 0.01 | PASS | PASS |
| 33 | Dark/OLED | hover/alpha: destructive/90 over theme-bg + fg | #CE0505 | #FFFFFF | 5.74 | 5.76 | 0.02 | PASS | PASS |
| 34 | Dark/OLED | hover/alpha: destructive/85 over theme-bg + fg | #C30505 | #FFFFFF | 6.25 | 6.28 | 0.03 | PASS | PASS |
| 35 | Dark/OLED | hover/alpha: destructive/80 over theme-bg + fg | #B70505 | #FFFFFF | 6.88 | 6.91 | 0.03 | PASS | PASS |
| 36 | Dark/OLED | hover/alpha: destructive/75 over theme-bg + fg | #AC0404 | #FFFFFF | 7.53 | 7.57 | 0.04 | PASS | PASS |
| 37 | Dark/OLED | hover/alpha: destructive/70 over theme-bg + fg | #A00404 | #FFFFFF | 8.31 | 8.35 | 0.04 | PASS | PASS |
| 38 | Dark/OLED | hover/alpha: destructive/65 over theme-bg + fg | #950404 | #FFFFFF | 9.11 | 9.14 | 0.03 | PASS | PASS |
| 39 | Dark/OLED | hover/alpha: destructive/60 over theme-bg + fg | #890404 | #FFFFFF | 10.07 | 10.08 | 0.01 | PASS | PASS |
| 40 | Dark/OLED | hover/alpha: destructive/55 over theme-bg + fg | #7E0303 | #FFFFFF | 11.04 | 11.04 | 0.01 | PASS | PASS |
| 41 | Dark/OLED | hover/alpha: destructive/50 over theme-bg + fg | #720303 | #FFFFFF | 12.18 | 12.14 | 0.04 | PASS | PASS |
| 42 | Dark/OLED | alpha: destructive/90 over card + fg | #CE0505 | #FFFFFF | 5.74 | 5.76 | 0.02 | PASS | PASS |
| 43 | Dark/OLED | alpha: destructive/80 over card + fg | #B70505 | #FFFFFF | 6.88 | 6.91 | 0.03 | PASS | PASS |
| 44 | Dark/OLED | alpha: destructive/90 over muted + fg | #D00707 | #FFFFFF | 5.64 | 5.65 | 0.01 | PASS | PASS |
| 45 | Dark/OLED | alpha: destructive/60 over muted + fg | #910C0C | #FFFFFF | 9.35 | 9.28 | 0.06 | PASS | PASS |
| 46 | Dark/OLED | text: destructive on theme-bg | #000000 | #E50606 | 4.36 | 4.36 | 0.00 | FAIL | PASS |
| 47 | Dark/OLED | text: destructive on card | #000000 | #E50606 | 4.36 | 4.36 | 0.00 | FAIL | PASS |
| 48 | Dark/OLED | text: destructive on muted | #141414 | #E50606 | 4.06 | 3.83 | 0.23 | FAIL | PASS |
| 49 | Dark/OLED | text: destructive on popover | #000000 | #E50606 | 4.36 | 4.36 | 0.00 | FAIL | PASS |
| 50 | Dark/OLED | text: destructive on white | #FFFFFF | #E50606 | 4.82 | 4.82 | 0.00 | PASS | PASS |
| 51 | Dark/OLED | text: destructive on black | #000000 | #E50606 | 4.36 | 4.36 | 0.00 | FAIL | PASS |
| 52 | Dark/OLED | soft badge: destructive/15 bg + text destructive (on theme-bg) | #220101 | #E50606 | 4.15 | 4.06 | 0.09 | FAIL | PASS |
| 53 | Dark/OLED | soft badge: destructive/15 bg + text destructive (on card) | #220101 | #E50606 | 4.15 | 4.06 | 0.09 | FAIL | PASS |
| 54 | Dark/OLED | soft badge: destructive/10 bg + text destructive (on theme-bg) | #170101 | #E50606 | 4.27 | 4.19 | 0.08 | FAIL | PASS |
| 55 | Dark/OLED | soft badge: destructive/30 bg + text destructive (on theme-bg) | #450202 | #E50606 | 3.52 | 3.45 | 0.06 | FAIL | PASS |
| 56 | Dark/OLED | border: destructive/30 vs theme-bg (UI component 3:1) | #E50606 | #000000 | 4.36 | 4.36 | 0.00 | FAIL | PASS |
| 57 | Dark/OLED | misuse: destructive-foreground text on theme-bg (white-on-white risk) | #000000 | #FFFFFF | 21.00 | 21.00 | 0.00 | PASS | PASS |
| 58 | Dark/OLED | misuse: destructive-foreground text on card | #000000 | #FFFFFF | 21.00 | 21.00 | 0.00 | PASS | PASS |
| 59 | HC light | solid: destructive + destructive-foreground (base) | #CC0000 | #FFFFFF | 5.83 | 5.89 | 0.06 | PASS | PASS |
| 60 | HC light | solid: destructive + FALLBACK fg = white (var fails to load) | #CC0000 | #FFFFFF | 5.83 | 5.89 | 0.06 | PASS | PASS |
| 61 | HC light | hover/alpha: destructive/95 over theme-bg + fg | #CF0D0D | #FFFFFF | 5.66 | 5.65 | 0.01 | PASS | PASS |
| 62 | HC light | hover/alpha: destructive/90 over theme-bg + fg | #D11919 | #FFFFFF | 5.47 | 5.43 | 0.03 | PASS | PASS |
| 63 | HC light | hover/alpha: destructive/85 over theme-bg + fg | #D42626 | #FFFFFF | 5.16 | 5.12 | 0.04 | PASS | PASS |
| 64 | HC light | hover/alpha: destructive/80 over theme-bg + fg | #D63333 | #FFFFFF | 4.83 | 4.79 | 0.04 | PASS | PASS |
| 65 | HC light | hover/alpha: destructive/75 over theme-bg + fg | #D94040 | #FFFFFF | 4.44 | 4.41 | 0.02 | FAIL | PASS |
| 66 | HC light | hover/alpha: destructive/70 over theme-bg + fg | #DB4D4D | #FFFFFF | 4.06 | 4.05 | 0.01 | FAIL | PASS |
| 67 | HC light | hover/alpha: destructive/65 over theme-bg + fg | #DE5959 | #FFFFFF | 3.69 | 3.70 | 0.01 | FAIL | PASS |
| 68 | HC light | hover/alpha: destructive/60 over theme-bg + fg | #E06666 | #FFFFFF | 3.34 | 3.35 | 0.02 | FAIL | PASS |
| 69 | HC light | hover/alpha: destructive/55 over theme-bg + fg | #E37373 | #FFFFFF | 2.99 | 3.01 | 0.02 | FAIL | PASS |
| 70 | HC light | hover/alpha: destructive/50 over theme-bg + fg | #E68080 | #FFFFFF | 2.68 | 2.70 | 0.03 | FAIL | FAIL |
| 71 | HC light | alpha: destructive/90 over card + fg | #D11919 | #FFFFFF | 5.47 | 5.43 | 0.03 | PASS | PASS |
| 72 | HC light | alpha: destructive/80 over card + fg | #D63333 | #FFFFFF | 4.83 | 4.79 | 0.04 | PASS | PASS |
| 73 | HC light | alpha: destructive/90 over muted + fg | #CF1717 | #FFFFFF | 5.58 | 5.54 | 0.03 | PASS | PASS |
| 74 | HC light | alpha: destructive/60 over muted + fg | #D65C5C | #FFFFFF | 3.77 | 3.79 | 0.01 | FAIL | PASS |
| 75 | HC light | text: destructive on theme-bg | #FFFFFF | #CC0000 | 5.83 | 5.89 | 0.06 | PASS | PASS |
| 76 | HC light | text: destructive on card | #FFFFFF | #CC0000 | 5.83 | 5.89 | 0.06 | PASS | PASS |
| 77 | HC light | text: destructive on muted | #E6E6E6 | #CC0000 | 4.70 | 4.72 | 0.01 | PASS | PASS |
| 78 | HC light | text: destructive on popover | #FFFFFF | #CC0000 | 5.83 | 5.89 | 0.06 | PASS | PASS |
| 79 | HC light | text: destructive on white | #FFFFFF | #CC0000 | 5.83 | 5.89 | 0.06 | PASS | PASS |
| 80 | HC light | text: destructive on black | #000000 | #CC0000 | 3.60 | 3.57 | 0.04 | FAIL | PASS |
| 81 | HC light | soft badge: destructive/15 bg + text destructive (on theme-bg) | #F7D9D9 | #CC0000 | 4.44 | 4.45 | 0.01 | FAIL | PASS |
| 82 | HC light | soft badge: destructive/15 bg + text destructive (on card) | #F7D9D9 | #CC0000 | 4.44 | 4.45 | 0.01 | FAIL | PASS |
| 83 | HC light | soft badge: destructive/10 bg + text destructive (on theme-bg) | #FAE6E6 | #CC0000 | 4.89 | 4.91 | 0.02 | PASS | PASS |
| 84 | HC light | soft badge: destructive/30 bg + text destructive (on theme-bg) | #F0B2B2 | #CC0000 | 3.29 | 3.28 | 0.01 | FAIL | PASS |
| 85 | HC light | border: destructive/30 vs theme-bg (UI component 3:1) | #CC0000 | #FFFFFF | 5.83 | 5.89 | 0.06 | PASS | PASS |
| 86 | HC light | misuse: destructive-foreground text on theme-bg (white-on-white risk) | #FFFFFF | #FFFFFF | 1.00 | 1.00 | 0.00 | FAIL | FAIL |
| 87 | HC light | misuse: destructive-foreground text on card | #FFFFFF | #FFFFFF | 1.00 | 1.00 | 0.00 | FAIL | FAIL |
| 88 | HC dark | solid: destructive + destructive-foreground (base) | #FF3333 | #000000 | 5.71 | 5.77 | 0.06 | PASS | PASS |
| 89 | HC dark | solid: destructive + FALLBACK fg = white (var fails to load) | #FF3333 | #FFFFFF | 3.68 | 3.64 | 0.04 | FAIL | PASS |
| 90 | HC dark | hover/alpha: destructive/95 over theme-bg + fg | #F23030 | #000000 | 5.19 | 5.24 | 0.05 | PASS | PASS |
| 91 | HC dark | hover/alpha: destructive/90 over theme-bg + fg | #E62E2E | #000000 | 4.75 | 4.79 | 0.04 | PASS | PASS |
| 92 | HC dark | hover/alpha: destructive/85 over theme-bg + fg | #D92B2B | #000000 | 4.30 | 4.33 | 0.04 | FAIL | PASS |
| 93 | HC dark | hover/alpha: destructive/80 over theme-bg + fg | #CC2929 | #000000 | 3.88 | 3.92 | 0.03 | FAIL | PASS |
| 94 | HC dark | hover/alpha: destructive/75 over theme-bg + fg | #BF2626 | #000000 | 3.49 | 3.52 | 0.03 | FAIL | PASS |
| 95 | HC dark | hover/alpha: destructive/70 over theme-bg + fg | #B22424 | #000000 | 3.14 | 3.17 | 0.03 | FAIL | PASS |
| 96 | HC dark | hover/alpha: destructive/65 over theme-bg + fg | #A62121 | #000000 | 2.83 | 2.86 | 0.03 | FAIL | FAIL |
| 97 | HC dark | hover/alpha: destructive/60 over theme-bg + fg | #991F1F | #000000 | 2.53 | 2.57 | 0.04 | FAIL | FAIL |
| 98 | HC dark | hover/alpha: destructive/55 over theme-bg + fg | #8C1C1C | #000000 | 2.26 | 2.30 | 0.04 | FAIL | FAIL |
| 99 | HC dark | hover/alpha: destructive/50 over theme-bg + fg | #801A1A | #000000 | 2.04 | 2.08 | 0.04 | FAIL | FAIL |
| 100 | HC dark | alpha: destructive/90 over card + fg | #E72F2F | #000000 | 4.80 | 4.85 | 0.04 | PASS | PASS |
| 101 | HC dark | alpha: destructive/80 over card + fg | #CF2B2B | #000000 | 4.00 | 4.03 | 0.03 | FAIL | PASS |
| 102 | HC dark | alpha: destructive/90 over muted + fg | #E93232 | #000000 | 4.92 | 4.97 | 0.04 | PASS | PASS |
| 103 | HC dark | alpha: destructive/60 over muted + fg | #A82E2E | #000000 | 3.06 | 3.10 | 0.03 | FAIL | PASS |
| 104 | HC dark | text: destructive on theme-bg | #000000 | #FF3333 | 5.71 | 5.77 | 0.06 | PASS | PASS |
| 105 | HC dark | text: destructive on card | #0D0D0D | #FF3333 | 5.55 | 5.34 | 0.21 | PASS | PASS |
| 106 | HC dark | text: destructive on muted | #262626 | #FF3333 | 4.38 | 4.16 | 0.22 | FAIL | PASS |
| 107 | HC dark | text: destructive on popover | #0D0D0D | #FF3333 | 5.55 | 5.34 | 0.21 | PASS | PASS |
| 108 | HC dark | text: destructive on white | #FFFFFF | #FF3333 | 3.68 | 3.64 | 0.04 | FAIL | PASS |
| 109 | HC dark | text: destructive on black | #000000 | #FF3333 | 5.71 | 5.77 | 0.06 | PASS | PASS |
| 110 | HC dark | soft badge: destructive/15 bg + text destructive (on theme-bg) | #260808 | #FF3333 | 5.32 | 5.15 | 0.17 | PASS | PASS |
| 111 | HC dark | soft badge: destructive/15 bg + text destructive (on card) | #311313 | #FF3333 | 4.90 | 4.68 | 0.22 | PASS | PASS |
| 112 | HC dark | soft badge: destructive/10 bg + text destructive (on theme-bg) | #1A0505 | #FF3333 | 5.54 | 5.41 | 0.13 | PASS | PASS |
| 113 | HC dark | soft badge: destructive/30 bg + text destructive (on theme-bg) | #4C0F0F | #FF3333 | 4.30 | 4.18 | 0.12 | FAIL | PASS |
| 114 | HC dark | border: destructive/30 vs theme-bg (UI component 3:1) | #FF3333 | #000000 | 5.71 | 5.77 | 0.06 | PASS | PASS |
| 115 | HC dark | misuse: destructive-foreground text on theme-bg (white-on-white risk) | #000000 | #000000 | 1.00 | 1.00 | 0.00 | FAIL | FAIL |
| 116 | HC dark | misuse: destructive-foreground text on card | #0D0D0D | #000000 | 1.03 | 1.08 | 0.05 | FAIL | FAIL |

**Totals:** 116 simulations · 50 fail AA 4.5:1 · 13 fail 3:1 · gamma-vs-wcag delta range 0.00–0.23

## AA 4.5:1 failures

- `#7` Light — hover/alpha: destructive/75 over theme-bg + fg → **4.30:1**
- `#8` Light — hover/alpha: destructive/70 over theme-bg + fg → **3.88:1**
- `#9` Light — hover/alpha: destructive/65 over theme-bg + fg → **3.52:1**
- `#10` Light — hover/alpha: destructive/60 over theme-bg + fg → **3.19:1**
- `#11` Light — hover/alpha: destructive/55 over theme-bg + fg → **2.88:1**
- `#12` Light — hover/alpha: destructive/50 over theme-bg + fg → **2.61:1**
- `#16` Light — alpha: destructive/60 over muted + fg → **3.47:1**
- `#22` Light — text: destructive on black → **3.24:1**
- `#26` Light — soft badge: destructive/30 bg + text destructive (on theme-bg) → **3.64:1**
- `#28` Light — misuse: destructive-foreground text on theme-bg (white-on-white risk) → **1.05:1**
- `#29` Light — misuse: destructive-foreground text on card → **1.00:1**
- `#46` Dark/OLED — text: destructive on theme-bg → **4.36:1**
- `#47` Dark/OLED — text: destructive on card → **4.36:1**
- `#48` Dark/OLED — text: destructive on muted → **3.83:1**
- `#49` Dark/OLED — text: destructive on popover → **4.36:1**
- `#51` Dark/OLED — text: destructive on black → **4.36:1**
- `#52` Dark/OLED — soft badge: destructive/15 bg + text destructive (on theme-bg) → **4.06:1**
- `#53` Dark/OLED — soft badge: destructive/15 bg + text destructive (on card) → **4.06:1**
- `#54` Dark/OLED — soft badge: destructive/10 bg + text destructive (on theme-bg) → **4.19:1**
- `#55` Dark/OLED — soft badge: destructive/30 bg + text destructive (on theme-bg) → **3.45:1**
- `#56` Dark/OLED — border: destructive/30 vs theme-bg (UI component 3:1) → **4.36:1**
- `#65` HC light — hover/alpha: destructive/75 over theme-bg + fg → **4.41:1**
- `#66` HC light — hover/alpha: destructive/70 over theme-bg + fg → **4.05:1**
- `#67` HC light — hover/alpha: destructive/65 over theme-bg + fg → **3.70:1**
- `#68` HC light — hover/alpha: destructive/60 over theme-bg + fg → **3.35:1**
- `#69` HC light — hover/alpha: destructive/55 over theme-bg + fg → **3.01:1**
- `#70` HC light — hover/alpha: destructive/50 over theme-bg + fg → **2.70:1**
- `#74` HC light — alpha: destructive/60 over muted + fg → **3.79:1**
- `#80` HC light — text: destructive on black → **3.57:1**
- `#81` HC light — soft badge: destructive/15 bg + text destructive (on theme-bg) → **4.45:1**
- `#82` HC light — soft badge: destructive/15 bg + text destructive (on card) → **4.45:1**
- `#84` HC light — soft badge: destructive/30 bg + text destructive (on theme-bg) → **3.28:1**
- `#86` HC light — misuse: destructive-foreground text on theme-bg (white-on-white risk) → **1.00:1**
- `#87` HC light — misuse: destructive-foreground text on card → **1.00:1**
- `#89` HC dark — solid: destructive + FALLBACK fg = white (var fails to load) → **3.64:1**
- `#92` HC dark — hover/alpha: destructive/85 over theme-bg + fg → **4.33:1**
- `#93` HC dark — hover/alpha: destructive/80 over theme-bg + fg → **3.92:1**
- `#94` HC dark — hover/alpha: destructive/75 over theme-bg + fg → **3.52:1**
- `#95` HC dark — hover/alpha: destructive/70 over theme-bg + fg → **3.17:1**
- `#96` HC dark — hover/alpha: destructive/65 over theme-bg + fg → **2.86:1**
- `#97` HC dark — hover/alpha: destructive/60 over theme-bg + fg → **2.57:1**
- `#98` HC dark — hover/alpha: destructive/55 over theme-bg + fg → **2.30:1**
- `#99` HC dark — hover/alpha: destructive/50 over theme-bg + fg → **2.08:1**
- `#101` HC dark — alpha: destructive/80 over card + fg → **4.03:1**
- `#103` HC dark — alpha: destructive/60 over muted + fg → **3.10:1**
- `#106` HC dark — text: destructive on muted → **4.16:1**
- `#108` HC dark — text: destructive on white → **3.64:1**
- `#113` HC dark — soft badge: destructive/30 bg + text destructive (on theme-bg) → **4.18:1**
- `#115` HC dark — misuse: destructive-foreground text on theme-bg (white-on-white risk) → **1.00:1**
- `#116` HC dark — misuse: destructive-foreground text on card → **1.08:1**
