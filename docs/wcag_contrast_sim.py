#!/usr/bin/env python3
"""WCAG AA contrast simulation: destructive token pairs across all 4 themes.

Formulas:
  (a) gamma 2.2 linearization:  L = 0.2126*(c/255)^2.2 + 0.7152*(g/255)^2.2 + 0.0722*(b/255)^2.2
  (b) WCAG 2.1 official relative luminance (piecewise sRGB linearization)
Both use contrast ratio = (L1+0.05)/(L2+0.05).
"""
import math

def hsl2rgb(h, s, l):
    s /= 100.0; l /= 100.0
    c = (1 - abs(2*l - 1)) * s
    x = c * (1 - abs((h/60) % 2 - 1))
    m = l - c/2
    if h < 60:   r, g, b = c, x, 0
    elif h < 120: r, g, b = x, c, 0
    elif h < 180: r, g, b = 0, c, x
    elif h < 240: r, g, b = 0, x, c
    elif h < 300: r, g, b = x, 0, c
    else:        r, g, b = c, 0, x
    return tuple(round((v + m) * 255) for v in (r, g, b))

def hexs(rgb):
    return '#' + ''.join(f'{v:02X}' for v in rgb)

def blend(fg, bg, a):
    return tuple(round(a * f + (1 - a) * b) for f, b in zip(fg, bg))

def lum(rgb, mode):
    r, g, b = [v / 255 for v in rgb]
    if mode == 'wcag':
        f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    else:
        f = lambda c: c ** 2.2
    r, g, b = f(r), f(g), f(b)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def ratio(c1, c2, mode):
    l1, l2 = lum(c1, mode), lum(c2, mode)
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)

def rnd(x):
    return f'{x:.2f}'

# ---- theme ground truth (from src/styles/tokens.css + src/styles/accessibility.css) ----
WHITE = hsl2rgb(0, 0, 100)
BLACK = hsl2rgb(0, 0, 0)

T = {
    'Light': dict(
        src='tokens.css :root (light)',
        dest=hsl2rgb(0, 72, 42), fg=hsl2rgb(0, 0, 100),
        bg=hsl2rgb(221, 25, 98), card=hsl2rgb(0, 0, 100), card_elev=hsl2rgb(0, 0, 100),
        muted=hsl2rgb(221, 20, 92), popover=hsl2rgb(0, 0, 100)),
    'Dark/OLED': dict(
        src='tokens.css .dark (OLED black)',
        dest=hsl2rgb(0, 95, 46), fg=hsl2rgb(0, 0, 100),
        bg=hsl2rgb(0, 0, 0), card=hsl2rgb(0, 0, 0), card_elev=hsl2rgb(0, 0, 3),
        muted=hsl2rgb(0, 0, 8), popover=hsl2rgb(0, 0, 0)),
    'HC light': dict(
        src='accessibility.css .high-contrast',
        dest=hsl2rgb(0, 100, 40), fg=hsl2rgb(0, 0, 100),
        bg=hsl2rgb(0, 0, 100), card=hsl2rgb(0, 0, 100), card_elev=hsl2rgb(0, 0, 100),
        muted=hsl2rgb(0, 0, 90), popover=hsl2rgb(0, 0, 100)),
    'HC dark': dict(
        src='accessibility.css .dark.high-contrast',
        dest=hsl2rgb(0, 100, 60), fg=hsl2rgb(0, 0, 0),
        bg=hsl2rgb(0, 0, 0), card=hsl2rgb(0, 0, 5), card_elev=hsl2rgb(0, 0, 5),
        muted=hsl2rgb(0, 0, 15), popover=hsl2rgb(0, 0, 5)),
}

FALLBACK_FG = WHITE  # hsl(var(--destructive-foreground, 0 0% 100%)) when var is undefined

rows = []
for name, t in T.items():
    d, fg, bg, card, muted, pop, celev = t['dest'], t['fg'], t['bg'], t['card'], t['muted'], t['popover'], t['card_elev']
    rows.append((name, 'solid: destructive + destructive-foreground (base)', d, fg))
    rows.append((name, 'solid: destructive + FALLBACK fg = white (var fails to load)', d, FALLBACK_FG))
    for a in (0.95, 0.90, 0.85, 0.80, 0.75, 0.70, 0.65, 0.60, 0.55, 0.50):
        rows.append((name, f'hover/alpha: destructive/{int(a*100)} over theme-bg + fg', blend(d, bg, a), fg))
    for a in (0.90, 0.80):
        rows.append((name, f'alpha: destructive/{int(a*100)} over card + fg', blend(d, card, a), fg))
    for a in (0.90, 0.60):
        rows.append((name, f'alpha: destructive/{int(a*100)} over muted + fg', blend(d, muted, a), fg))
    rows.append((name, 'text: destructive on theme-bg', bg, d))
    rows.append((name, 'text: destructive on card', card, d))
    rows.append((name, 'text: destructive on muted', muted, d))
    rows.append((name, 'text: destructive on popover', pop, d))
    rows.append((name, 'text: destructive on white', WHITE, d))
    rows.append((name, 'text: destructive on black', BLACK, d))
    rows.append((name, 'soft badge: destructive/15 bg + text destructive (on theme-bg)', blend(d, bg, 0.15), d))
    rows.append((name, 'soft badge: destructive/15 bg + text destructive (on card)', blend(d, card, 0.15), d))
    rows.append((name, 'soft badge: destructive/10 bg + text destructive (on theme-bg)', blend(d, bg, 0.10), d))
    rows.append((name, 'soft badge: destructive/30 bg + text destructive (on theme-bg)', blend(d, bg, 0.30), d))
    rows.append((name, 'border: destructive/30 vs theme-bg (UI component 3:1)', d, bg))  # bg as "fg" proxy for boundary
    rows.append((name, 'misuse: destructive-foreground text on theme-bg (white-on-white risk)', bg, fg))
    rows.append((name, 'misuse: destructive-foreground text on card', card, fg))

# compute + render
lines = []
lines.append('# WCAG AA contrast simulation — destructive token (all themes)')
lines.append('')
lines.append(f'Generated: branch fix/sla-csp-edge. Sources: `src/styles/tokens.css`, `src/styles/accessibility.css`.')
lines.append('')
lines.append('Formulas: **(a) gamma 2.2** `0.2126R^2.2 + 0.7152G^2.2 + 0.0722B^2.2` vs **(b) WCAG 2.1** official relative luminance (piecewise).')
lines.append('Verdicts use WCAG ratio: `AA45` = normal text 4.5:1, `AA30` = large text / UI components 3:1. Delta = |gamma − wcag|.')
lines.append('')
lines.append('## Core matrix (solid button + fallback scenario)')
lines.append('')
lines.append('| Theme | Scenario | bg_hex | fg_hex | ratio_gamma | ratio_wcag | delta | AA45 | AA30 |')
lines.append('|---|---|---|---|---|---|---|---|---|')
core_idx = set()
for i, (name, label, b, f) in enumerate(rows):
    if 'solid:' in label:
        core_idx.add(i)
        rg, rw = ratio(b, f, 'gamma'), ratio(b, f, 'wcag')
        a45 = 'PASS' if rw >= 4.5 else 'FAIL'
        a30 = 'PASS' if rw >= 3.0 else 'FAIL'
        lines.append(f'| {name} | {label} | {hexs(b)} | {hexs(f)} | {rnd(rg)} | {rnd(rw)} | {rnd(abs(rg-rw))} | {a45} | {a30} |')
lines.append('')
lines.append('## Full matrix (all 100+ simulations)')
lines.append('')
lines.append('| # | Theme | Scenario | bg_hex | fg_hex | ratio_gamma | ratio_wcag | delta | AA45 | AA30 |')
lines.append('|---|---|---|---|---|---|---|---|---|---|')
fails45, fails30, deltas = [], [], []
for i, (name, label, b, f) in enumerate(rows):
    rg, rw = ratio(b, f, 'gamma'), ratio(b, f, 'wcag')
    deltas.append(abs(rg - rw))
    a45 = 'PASS' if rw >= 4.5 else 'FAIL'
    a30 = 'PASS' if rw >= 3.0 else 'FAIL'
    if a45 == 'FAIL': fails45.append((i, name, label, rw))
    if a30 == 'FAIL': fails30.append((i, name, label, rw))
    lines.append(f'| {i+1} | {name} | {label} | {hexs(b)} | {hexs(f)} | {rnd(rg)} | {rnd(rw)} | {rnd(abs(rg-rw))} | {a45} | {a30} |')
lines.append('')
lines.append(f'**Totals:** {len(rows)} simulations · {len(fails45)} fail AA 4.5:1 · {len(fails30)} fail 3:1 · gamma-vs-wcag delta range {min(deltas):.2f}–{max(deltas):.2f}')
lines.append('')
lines.append('## AA 4.5:1 failures')
lines.append('')
for i, name, label, rw in fails45:
    lines.append(f'- `#{i+1}` {name} — {label} → **{rw:.2f}:1**')
md = '\n'.join(lines) + '\n'

with open('docs/wcag-destructive-contrast.md', 'w', encoding='utf-8') as fh:
    fh.write(md)

print(md)
print(f'---\nTotal rows: {len(rows)}')
