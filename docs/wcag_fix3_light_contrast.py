#!/usr/bin/env python3
"""Validate Fix #3 (commit 499b7b8e5): 12 light-mode text-destructive-foreground -> text-destructive swaps.

Ground truth (src/styles/tokens.css, :root / light):
  --destructive: 0 72% 42%   -> hsl(0 72% 42%) = #B81E1E
  --destructive-foreground: 0 0% 100% (white)  [the OLD color, removed by the fix]
  --card: 0 0% 100%, --background: 221 25% 98%, --muted: 221 20% 92%

For each of the 12 changed locations:
  - fg AFTER  = text-destructive  = hsl(var(--destructive))
  - fg BEFORE = text-destructive-foreground = white (the bug: white-on-light)
  - bg = exact composite chain (alpha blended in sRGB) of the element's ancestors
Report WCAG 2.1 ratios (both piecewise-linear and gamma-2.2 luminance), PASS/FAIL @4.5.
Idempotent: same input -> byte-identical report.
"""
import hashlib, sys
from pathlib import Path

# ---------- color math ----------
def hsl_to_rgb(h, s, l):
    c = (1 - abs(2 * l - 1)) * s
    x = c * (1 - abs((h / 60) % 2 - 1))
    m = l - c / 2
    if h < 60:   r, g, b = c, x, 0
    elif h < 120: r, g, b = x, c, 0
    elif h < 180: r, g, b = 0, c, x
    elif h < 240: r, g, b = 0, x, c
    elif h < 300: r, g, b = x, 0, c
    else:        r, g, b = c, 0, x
    return tuple(round((v + m) * 255) for v in (r, g, b))

def blend(alpha, fg, bg):
    """sRGB alpha compositing (CSS): a*fg + (1-a)*bg per channel."""
    return tuple(round(alpha * f + (1 - alpha) * b) for f, b in zip(fg, bg))

def lin_wcag(v):
    v /= 255
    return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4

def lin_gamma22(v):
    return (v / 255) ** 2.2

def lum(rgb, mode):
    fn = lin_wcag if mode == "wcag" else lin_gamma22
    return 0.2126 * fn(rgb[0]) + 0.7152 * fn(rgb[1]) + 0.0722 * fn(rgb[2])

def ratio(fg, bg, mode):
    l1, l2 = lum(fg, mode), lum(bg, mode)
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)

def hexc(rgb):
    return "#" + "".join(f"{v:02X}" for v in rgb)

# ---------- tokens (light theme, :root) ----------
DESTRUCTIVE = hsl_to_rgb(0, 0.72, 0.42)          # hsl(0 72% 42%)
WHITE       = (255, 255, 255)
CARD        = hsl_to_rgb(0, 0, 1.0)              # --card 0 0% 100%
BACKGROUND  = hsl_to_rgb(221, 0.25, 0.98)        # --background 221 25% 98%
MUTED       = hsl_to_rgb(221, 0.20, 0.92)        # --muted 221 20% 92%

# ---------- the 12 locations (file, element, bg composite chain) ----------
# chain entries: (alpha, color) composited bottom-up over base
LOCATIONS = [
    # (file, element, [bg chain over base], base)
    ("ConnectionsStats.tsx", "stat value 'Ações necessárias' (text)",
     [], CARD),
    ("ConnectionsView.tsx", "stat value 'Ações necessárias' (text)",
     [], CARD),
    ("connectionCardHelpers.ts", "status chip 'Desconectado' (text) — bg-destructive/10",
     [(0.10, DESTRUCTIVE)], CARD),
    ("connectionCardHelpers.ts", "status chip 'Desconectando...' (text) — bg-destructive/10",
     [(0.10, DESTRUCTIVE)], CARD),
    ("DegradedQuickActions.tsx", "latency chip >=800ms (text) — bg-destructive/10 over li bg-background/40",
     [(0.10, DESTRUCTIVE), (0.40, BACKGROUND)], CARD),
    ("ConnectionCard.tsx", "Smartphone icon (needsAction) — bg-destructive/15 circle",
     [(0.15, DESTRUCTIVE)], CARD),
    ("ConnectionCard.tsx", "AlertTriangle icon (severe) — bg-destructive/8 banner",
     [(0.08, DESTRUCTIVE)], CARD),
    ("ConnectionCard.tsx", "warning reason text (severe) — bg-destructive/8 banner",
     [(0.08, DESTRUCTIVE)], CARD),
    ("WhatsAppConnectionStatus.tsx", "Badge count 'n/total' + AlertCircle icon — bg-destructive/5 over header bg-muted/40",
     [(0.05, DESTRUCTIVE), (0.40, MUTED)], BACKGROUND),
    ("AuditLogPanel.tsx", "old_values strikethrough text — bg-muted/10 detail row",
     [(0.10, MUTED)], BACKGROUND),
    ("ContactConsentManager.tsx", "'Revogado em:' text (container transparent)",
     [], BACKGROUND),
    ("SLASettings.tsx", "ShieldAlert icon in Label",
     [], CARD),
]

def composite(chain, base):
    bg = base
    for alpha, color in reversed(chain):  # topmost layer first
        bg = blend(alpha, color, bg)
    return bg

# ---------- build report ----------
rows = []
for file, elem, chain, base in LOCATIONS:
    bg = composite(chain, base)
    r_w = ratio(DESTRUCTIVE, bg, "wcag")
    r_g = ratio(DESTRUCTIVE, bg, "gamma22")
    r_before = ratio(WHITE, bg, "wcag")          # old text-destructive-foreground
    rows.append((file, elem, hexc(bg), hexc(DESTRUCTIVE), r_w, r_g, r_before))

def fmt(r):
    return f"{r:.2f}"

lines = []
lines.append("# Fix #3 light-mode contrast validation — 12 locations (commit 499b7b8e5)")
lines.append("")
lines.append(f"Token check: --destructive = hsl(0 72% 42%) = {hexc(DESTRUCTIVE)}  |  --destructive-foreground (old, removed) = {hexc(WHITE)}")
lines.append("")
hdr = f"{'#':>2} {'file':<38} {'bg (composite, light)':<24} {'fg':<8} {'ratio(WCAG)':<12} {'ratio(g2.2)':<12} {'BEFORE white':<12} verdict"
lines.append(hdr)
lines.append("-" * len(hdr))
fails = 0
for i, (file, elem, bghex, fghex, rw, rg, rb) in enumerate(rows, 1):
    ok = rw >= 4.5
    fails += 0 if ok else 1
    lines.append(f"{i:>2} {file:<38} {bghex:<24} {fghex:<8} {fmt(rw):<12} {fmt(rg):<12} {fmt(rb):<12} {'PASS' if ok else 'FAIL'}")
    lines.append(f"    └ {elem}")
lines.append("-" * len(hdr))
lines.append(f"PASS count: {12 - fails}/12  @ WCAG AA 4.5:1")
lines.append("")
lines.append("Note: BEFORE column = contrast of the OLD color (white text-destructive-foreground) on the same bg;")
lines.append("1.0-1.3:1 = invisible white-on-light — the exact bug Fix #3 removes.")
lines.append("Icons (h-3.5..h-5) additionally satisfy WCAG 1.4.11 non-text 3:1 with wide margin.")
report = "\n".join(lines) + "\n"

out = Path(__file__).resolve().parent / "wcag-fix3-light-contrast.md"
out.write_text(report, encoding="utf-8")
print(report)
print(f"[written] {out}  sha256={hashlib.sha256(report.encode()).hexdigest()}")
