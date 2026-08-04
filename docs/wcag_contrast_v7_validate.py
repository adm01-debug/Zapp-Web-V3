#!/usr/bin/env python3
"""V7 validation: WCAG AA 4.5:1 contrast for --success / --info / --destructive tokens.

Ground truth: parses src/styles/tokens.css (:root light, .dark) and
src/styles/accessibility.css (.high-contrast, .dark.high-contrast) directly.

Pairs validated per token x theme:
  A. --{t}-foreground (white) on solid --{t}  (buttons/badges)
  B. --{t} as text on --background            (text-success etc.)
  C. --{t} as text on --card                  (cards)
  D. HC overrides (destructive only in accessibility.css) + fallback fg literal

Verdict: >= 4.5:1 PASS for normal text (AA). Deterministic output.
"""
import re, hashlib, sys, os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOKENS = ROOT / "src" / "styles" / "tokens.css"
ACCESS = ROOT / "src" / "styles" / "accessibility.css"
OUT = Path(__file__).resolve().parent / "wcag-contrast-v7-validation.md"

# ---------- parsing ----------
def parse_block(text, start_marker):
    """Return dict token->hsl-triple for the first block whose selector line contains start_marker."""
    lines = text.splitlines()
    in_block = False
    tokens = {}
    for ln in lines:
        s = ln.strip()
        if s.startswith("/*") or s.startswith("*") or s.startswith("/*"):
            continue
        if s.startswith(":root") or (s.startswith(".") and s.endswith("{")) or s.endswith("}"):
            # block boundary detection via braces
            pass
        if "{" in s and start_marker in s:
            in_block = True
            continue
        if in_block:
            if s == "}":
                break
            m = re.match(r"--([\w-]+):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%", s)
            if m:
                tokens[m.group(1)] = (float(m.group(2)), float(m.group(3)), float(m.group(4)))
    return tokens

def parse_selector_blocks(text):
    """Return list of (selector, {token: hsl}) for every CSS rule block."""
    blocks = []
    cur_sel, cur = None, {}
    depth = 0
    for ln in text.splitlines():
        s = ln.strip()
        if not s or s.startswith("/*"):
            continue
        if "{" in s and depth == 0:
            cur_sel = s.split("{")[0].strip()
            cur = {}
            depth += 1
            # inline content after { (rare)
            rest = s.split("{", 1)[1]
            if rest.strip():
                m = re.match(r"--([\w-]+):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%", rest.strip())
                if m:
                    cur[m.group(1)] = (float(m.group(2)), float(m.group(3)), float(m.group(4)))
            continue
        if depth >= 1:
            if "{" in s:
                depth += 1
                continue
            if s == "}":
                depth -= 1
                if depth == 0:
                    blocks.append((cur_sel, cur))
                continue
            if depth == 1:
                m = re.match(r"--([\w-]+):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%", s)
                if m:
                    cur[m.group(1)] = (float(m.group(2)), float(m.group(3)), float(m.group(4)))
    return blocks

def hsl_to_rgb(h, s, l):
    """Standard CSS hsl() -> (r,g,b) in 0..255."""
    s, l = s / 100.0, l / 100.0
    c = (1 - abs(2 * l - 1)) * s
    hp = h / 60.0
    x = c * (1 - abs(hp % 2 - 1))
    if hp < 1: r1, g1, b1 = c, x, 0
    elif hp < 2: r1, g1, b1 = x, c, 0
    elif hp < 3: r1, g1, b1 = 0, c, x
    elif hp < 4: r1, g1, b1 = 0, x, c
    elif hp < 5: r1, g1, b1 = x, 0, c
    else: r1, g1, b1 = c, 0, x
    m = l - c / 2
    return ((r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255)

def lin_wcag(ch):
    c = ch / 255.0
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

def lum_wcag(rgb):
    r, g, b = [lin_wcag(c) for c in rgb]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def lum_gamma(rgb):
    r, g, b = [(c / 255.0) ** 2.2 for c in rgb]
    return 0.2126 * r + 0.7152 * g + 0.0722 * b

def ratio(l1, l2):
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)

def fmt_rgb(rgb):
    return "#%02X%02X%02X" % tuple(round(c) for c in rgb)

# ---------- ground truth ----------
tok_text = TOKENS.read_text(encoding="utf-8")
acc_text = ACCESS.read_text(encoding="utf-8")

light_blocks = [b for b in parse_selector_blocks(tok_text) if b[0] == ":root"]
dark_blocks = [b for b in parse_selector_blocks(tok_text) if ".dark" in b[0] and "high" not in b[0]]
hc_blocks = parse_selector_blocks(acc_text)

light = dict(light_blocks[0][1]) if light_blocks else {}
dark = dict(dark_blocks[0][1]) if dark_blocks else {}
hc_light = {}
hc_dark = {}
for sel, toks in hc_blocks:
    if ".dark" in sel and "high" in sel:
        hc_dark.update(toks)
    elif "high" in sel:
        hc_light.update(toks)

TOKENS_TO_CHECK = ["success", "info", "destructive"]
WHITE = (255, 255, 255)

def surface(theme_tokens, name):
    return hsl_to_rgb(*theme_tokens[name])

def check_pair(label, fg_rgb, bg_rgb, rows):
    l1w, l1g = lum_wcag(fg_rgb), lum_gamma(fg_rgb)
    l2w, l2g = lum_wcag(bg_rgb), lum_gamma(bg_rgb)
    rw, rg = ratio(l1w, l2w), ratio(l1g, l2g)
    verdict = "PASS" if rw >= 4.5 else "FAIL"
    rows.append((label, fmt_rgb(fg_rgb), fmt_rgb(bg_rgb), rw, rg, verdict))
    return rw

# ---------- matrix ----------
rows = []
summary = []

for theme_name, tt, hc in (("light", light, hc_light), ("dark", dark, hc_dark)):
    bg = surface(tt, "background")
    card = surface(tt, "card")
    for t in TOKENS_TO_CHECK:
        tok = hsl_to_rgb(*tt[t])
        fg = hsl_to_rgb(*tt[f"{t}-foreground"])
        # A: fg on solid token
        check_pair(f"{theme_name} | {t} | A fg-on-solid", fg, tok, rows)
        # B: token text on background
        check_pair(f"{theme_name} | {t} | B text-on-bg", tok, bg, rows)
        # C: token text on card
        check_pair(f"{theme_name} | {t} | C text-on-card", tok, card, rows)
    # D: high-contrast destructive override + fallback white
    if "destructive" in hc:
        hc_tok = hsl_to_rgb(*hc["destructive"])
        hc_fg = hsl_to_rgb(*hc.get("destructive-foreground", (0, 0, 100)))
        check_pair(f"{theme_name}-HC | destructive | A fg-on-solid (HC)", hc_fg, hc_tok, rows)
        check_pair(f"{theme_name}-HC | destructive | B text-on-bg (HC)", hc_tok, bg, rows)
    # fallback: hsl(var(--x-foreground, 0 0% 100%)) -> literal white if var undefined
    check_pair(f"{theme_name} | {t} | FALLBACK white-on-solid", WHITE, tok, rows)

fails = [r for r in rows if r[5] == "FAIL"]

# ---------- report ----------
def render():
    L = []
    L.append("# V7 — Validação WCAG AA 4.5:1 dos tokens ajustados (success/info/destructive)\n")
    L.append(f"Fonte da verdade: `src/styles/tokens.css` (light `:root`, dark `.dark`) + "
             f"`src/styles/accessibility.css` (HC). Gerado por `docs/wcag_contrast_v7_validate.py` "
             f"(idempotente). Dois métodos de luminância: WCAG 2.1 oficial (piecewise) e gamma 2.2.\n")
    L.append("## Tokens atuais (ground truth)\n")
    L.append("| Tema | Token | HSL | RGB |")
    L.append("|---|---|---|---|")
    for theme_name, tt in (("light", light), ("dark", dark)):
        for t in TOKENS_TO_CHECK:
            rgb = hsl_to_rgb(*tt[t])
            L.append(f"| {theme_name} | --{t} | {tt[t][0]:g} {tt[t][1]:g}% {tt[t][2]:g}% | {fmt_rgb(rgb)} |")
    L.append("\n## Matriz de contraste (verdict @4.5:1, normal text)\n")
    L.append("| Par | FG | BG | Ratio WCAG | Ratio γ2.2 | Verdict |")
    L.append("|---|---|---|---|---|---|")
    for r in rows:
        L.append(f"| {r[0]} | {r[1]} | {r[2]} | {r[3]:.2f} | {r[4]:.2f} | {r[5]} |")
    L.append("\n## Resultado\n")
    if fails:
        L.append(f"**{len(fails)} FALHAS:**\n")
        for r in fails:
            L.append(f"- {r[0]}: {r[3]:.2f}:1 (< 4.5)")
    else:
        L.append("**TODOS OS PARES PASSAM ≥ 4.5:1** (0 falhas).\n")
    return "\n".join(L) + "\n"

report = render()
OUT.write_text(report, encoding="utf-8")

# ---------- verification ----------
print(report)
print("=" * 60)
print(f"Linhas na matriz: {len(rows)}")
print(f"Falhas: {len(fails)}")
print(f"sha256 do relatório: {hashlib.sha256(report.encode()).hexdigest()}")
print(f"Relatório: {OUT}")
sys.exit(1 if fails else 0)
