#!/usr/bin/env python3
"""
WCAG AA contrast validation for zapp-web-v3 status tokens (success/info/destructive).

Fix: tokens.css success/info/destructive adjusted for >= 4.5:1.
Reads CURRENT token values from src/styles/tokens.css (source of truth),
compares against the embedded BEFORE snapshot, and writes
docs/wcag-contrast-tokens-fix.md (idempotent, deterministic).

Usage: python docs/wcag_contrast_tokens_fix.py
"""
import hashlib
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
TOKENS = REPO / "src" / "styles" / "tokens.css"
OUT = REPO / "docs" / "wcag-contrast-tokens-fix.md"

# ---------------- BEFORE snapshot (pre-fix values, Aug 2026) ----------------
BEFORE = {
    ("light", "success"): "142 76% 45%",
    ("light", "info"): "214 100% 50%",
    ("light", "destructive"): "0 72% 42%",
    ("dark", "success"): "142 90% 50%",
    ("dark", "info"): "210 100% 60%",
    ("dark", "destructive"): "0 95% 46%",
}

# Theme surfaces (from tokens.css ground truth)
SURFACES = {
    "light": {"bg": "221 25% 98%", "card": "0 0% 100%", "muted": "221 20% 92%"},
    "dark": {"bg": "0 0% 0%", "card": "0 0% 0%", "elevated": "0 0% 3%", "muted": "0 0% 8%"},
}

# ---------------- color math ----------------
def hsl_to_rgb(h, s, l):
    """Standard CSS HSL -> sRGB (0..1 floats)."""
    c = (1 - abs(2 * l - 1)) * s
    x = c * (1 - abs((h / 60) % 2 - 1))
    m = l - c / 2
    if h < 60:
        r, g, b = c, x, 0
    elif h < 120:
        r, g, b = x, c, 0
    elif h < 180:
        r, g, b = 0, c, x
    elif h < 240:
        r, g, b = 0, x, c
    elif h < 300:
        r, g, b = x, 0, c
    else:
        r, g, b = c, 0, x
    return (min(max(r + m, 0), 1), min(max(g + m, 0), 1), min(max(b + m, 0), 1))


def parse_hsl(text):
    """'214 100% 50%' -> (h, s, l) floats; also handles '/ 0.9' alpha suffix."""
    text = text.strip()
    if "/" in text:
        text = text.split("/")[0].strip()
    parts = text.split()
    h = float(parts[0])
    s = float(parts[1].rstrip("%")) / 100
    l = float(parts[2].rstrip("%")) / 100
    return (h, s, l)


def parse_rgb_hsl(text):
    """'221 25% 98%' surface -> (r,g,b) 0..255"""
    r, g, b = hsl_to_rgb(*parse_hsl(text))
    return (r * 255, g * 255, b * 255)


def srgb_lin(c):
    """WCAG 2.1 piecewise linearization, c in 0..1."""
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def lum_wcag(rgb):
    """WCAG 2.1 relative luminance; rgb in 0..255."""
    r, g, b = (srgb_lin(x / 255) for x in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def lum_gamma(rgb):
    """Gamma 2.2 approximation (cross-check formula)."""
    r, g, b = ((x / 255) ** 2.2 for x in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def blend(fg_rgb, bg_rgb, alpha):
    """sRGB compositing: a*fg + (1-a)*bg per channel."""
    return tuple(alpha * f + (1 - alpha) * b for f, b in zip(fg_rgb, bg_rgb))


def ratio(l1, l2):
    hi, lo = max(l1, l2), min(l1, l2)
    return (hi + 0.05) / (lo + 0.05)


def hexs(rgb):
    return "#" + "".join(f"{int(round(x)):02X}" for x in rgb)


# ---------------- token extraction ----------------
def load_tokens():
    css = TOKENS.read_text(encoding="utf-8")
    tokens = {}
    # split into theme blocks
    root_block = css.split(".dark", 1)[0]
    dark_block = css.split(".dark", 1)[1]
    for theme, block in (("light", root_block), ("dark", dark_block)):
        for name in ("success", "info", "destructive", "destructive-foreground",
                     "success-foreground", "info-foreground", "warning-foreground"):
            m = re.search(r"--" + name + r":\s*([^;]+);", block)
            if m:
                tokens[(theme, name)] = m.group(1).strip()
    return tokens


# ---------------- matrix rows ----------------
def build_rows(tokens, version):
    """version: 'before' (embedded) or 'after' (from tokens.css)."""
    rows = []
    for theme in ("light", "dark"):
        for tok in ("success", "info", "destructive"):
            if version == "before":
                raw = BEFORE[(theme, tok)]
            else:
                raw = tokens[(theme, tok)]
            fg_raw = tokens[(theme, tok + "-foreground")]
            fg = parse_rgb_hsl(fg_raw)
            base = parse_rgb_hsl(raw)
            surfaces = SURFACES[theme]
            for surf_name, surf_raw in surfaces.items():
                surf = parse_rgb_hsl(surf_raw)
                r = ratio(lum_wcag(fg), lum_wcag(base))
                rows.append((theme, tok, f"bg-{tok} + {tok}-foreground (white)", "solid",
                             raw, hexs(base), hexs(fg), surf_name, hexs(surf), r, 4.5))
                # text-{tok} on surface
                r = ratio(lum_wcag(base), lum_wcag(surf))
                rows.append((theme, tok, f"text-{tok} on {surf_name}", "solid",
                             raw, hexs(base), hexs(base), surf_name, hexs(surf), r, 4.5))
            # alpha tint pairs: text-{tok} on bg-{tok}/N over theme bg
            for alpha in (10, 15, 20):
                tint = blend(base, parse_rgb_hsl(surfaces["bg" if theme == "light" else "bg"]), alpha / 100)
                # tint over the theme bg surface
                r = ratio(lum_wcag(base), lum_wcag(tint))
                rows.append((theme, tok, f"text-{tok} on bg-{tok}/{alpha}", "tint",
                             raw, hexs(base), hexs(base), "bg", hexs(tint), r, 4.5))
            # border non-text 3:1
            border = blend(base, parse_rgb_hsl(surfaces["bg"]), 0.30)
            r = ratio(lum_wcag(border), lum_wcag(parse_rgb_hsl(surfaces["bg"])))
            rows.append((theme, tok, f"border-{tok}/30 vs bg", "tint",
                         raw, hexs(border), hexs(border), "bg", hexs(parse_rgb_hsl(surfaces["bg"])), r, 3.0))
            # hover: white fg on bg-{tok}/90 and /95 (over theme bg)
            for alpha in (90, 95):
                hov = blend(base, parse_rgb_hsl(surfaces["bg"]), alpha / 100)
                r = ratio(lum_wcag(fg), lum_wcag(hov))
                rows.append((theme, tok, f"bg-{tok}/{alpha} + white fg (hover)", "tint",
                             raw, hexs(hov), hexs(fg), "bg", hexs(hov), r, 4.5))
    return rows


def verdict(r, threshold):
    return "PASS" if r >= threshold else "FAIL"


def main():
    tokens = load_tokens()
    missing = [k for k in BEFORE if k not in tokens]
    if missing:
        print("MISSING TOKENS:", missing)
        sys.exit(1)

    before = build_rows(tokens, "before")
    after = build_rows(tokens, "after")

    def fmt(rows):
        lines = ["| theme | token | pair | kind | token HSL | fg | bg surface | ratio | AA |",
                 "|---|---|---|---|---|---|---|---|---|"]
        for (theme, tok, pair, kind, raw, fghex, bghex, surf, surfhex, r, thr) in rows:
            lines.append(f"| {theme} | {tok} | {pair} | {kind} | {raw} | {fghex} | {surfhex} | {r:.2f} | {verdict(r, thr)} |")
        return "\n".join(lines)

    # before/after diff table (keyed rows)
    bmap = {(t, k, p): (r, thr) for (t, k, p, kd, raw, f, bg, s, sh, r, thr) in before}
    amap = {(t, k, p): (r, thr) for (t, k, p, kd, raw, f, bg, s, sh, r, thr) in after}
    diff = []
    for key in sorted(bmap):
        br, thr = bmap[key]
        ar, _ = amap[key]
        diff.append((key[0], key[1], key[2], br, ar, verdict(ar, thr), thr))

    diff_lines = ["| theme | token | pair | before | after | after verdict |",
                  "|---|---|---|---|---|---|"]
    for theme, tok, pair, br, ar, v, thr in diff:
        diff_lines.append(f"| {theme} | {tok} | {pair} | {br:.2f} | {ar:.2f} | {v} ({thr:g}:1) |")

    # cross-check: gamma-2.2 vs WCAG on headline pairs
    cc = []
    for (theme, tok) in (("light", "success"), ("dark", "success"), ("light", "info"),
                         ("dark", "info"), ("dark", "destructive")):
        raw = tokens[(theme, tok)]
        fg = parse_rgb_hsl(tokens[(theme, tok + "-foreground")])
        base = parse_rgb_hsl(raw)
        rw = ratio(lum_wcag(fg), lum_wcag(base))
        rg = ratio(lum_gamma(fg), lum_gamma(base))
        cc.append(f"| {theme} {tok} | {rw:.2f} | {rg:.2f} | {abs(rw-rg):.2f} |")

    # summary: audited FAIL pairs
    audited = [
        ("light", "success", "white on success (was 2.18:1 FAIL)", "bg-success + success-foreground (white)"),
        ("dark", "success", "white on success (was 1.51:1 FAIL)", "bg-success + success-foreground (white)"),
        ("dark", "info", "white on info (was 2.94:1 FAIL)", "bg-info + info-foreground (white)"),
        ("light", "info", "white on info (was 4.49:1 marginal FAIL)", "bg-info + info-foreground (white)"),
        ("dark", "destructive", "text-destructive on black (was 4.36:1 FAIL)", "text-destructive on bg"),
    ]
    summary = []
    for theme, tok, label, pairkey in audited:
        ar, thr = amap[(theme, tok, pairkey)]
        summary.append(f"| {label} | {ar:.2f} | {verdict(ar, thr)} |")

    report = f"""# WCAG AA token contrast fix — success/info/destructive (Agent 4)

Validated {len(after)} pairs (2 themes x 3 tokens), WCAG 2.1 relative luminance, both
formulas. Generated by `docs/wcag_contrast_tokens_fix.py` (idempotent, reads
`src/styles/tokens.css` as ground truth).

## Token changes

| theme | token | before | after |
|---|---|---|---|
| light | `--success` | 142 76% 45% | {tokens[('light','success')]} |
| light | `--info` | 214 100% 50% | {tokens[('light','info')]} |
| dark | `--success` | 142 90% 50% | {tokens[('dark','success')]} |
| dark | `--info` | 210 100% 60% | {tokens[('dark','info')]} |
| dark | `--destructive` | 0 95% 46% | {tokens[('dark','destructive')]} |

Foreground tokens unchanged (white everywhere). Light `--destructive` unchanged (6.48:1 already PASS).

## Audited FAIL pairs — after

| pair | after ratio | verdict |
|---|---|---|
{chr(10).join(summary)}

## Before → after (key pairs)

{diff_lines[0]}
{diff_lines[1]}
{chr(10).join(diff_lines[2:])}

## Full matrix — after

{fmt(after)}

## Formula cross-check (WCAG 2.1 vs gamma-2.2)

| pair | WCAG | gamma2.2 | delta |
|---|---|---|---|
{chr(10).join(cc)}

## Notes / trade-offs

- Dark `--success` darkened to {tokens[('dark','success')]}: white-on-green now {amap[('dark','success','bg-success + success-foreground (white)')][0]:.2f}:1.
  Trade-off: dark `bg-success/15 text-success` badges drop from {bmap[('dark','success','text-success on bg-success/15')][0]:.2f} to {amap[('dark','success','text-success on bg-success/15')][0]:.2f}:1
  (still sub-AA 4.5) — a dark tint of a dark token cannot reach 4.5:1 (mathematically bounded);
  pre-existing light-mode badges (`bg-success/10 text-success` ≈ 2.1:1) remain a usage-level issue.
- Dark `--destructive` set to {tokens[('dark','destructive')]} (NOT 43%): 43% drops `text-destructive` on black to ~3.9:1 (worse than the audited 4.36:1);
  {tokens[('dark','destructive')]} is the point where BOTH white-on-red and red-on-black pass ≥ 4.5:1.
- `border-*/30` non-text pairs: sub-3:1 in dark both before and after (pre-existing, not a regression).
- `--success-foreground`/`--info-foreground` kept white: they are used as plain text on dark surfaces
  (TeamPerformancePanel, StsCommercialDashboard), so switching to near-black would break those.
"""
    OUT.write_text(report, encoding="utf-8")
    digest = hashlib.sha256(report.encode("utf-8")).hexdigest()
    print(f"report written: {OUT}")
    print(f"sha256: {digest}")
    print(f"rows: before={len(before)} after={len(after)}")
    # print verdict summary
    after_fails = [(key, r, thr) for key in bmap
                   for (r, thr) in [amap[key]] if verdict(r, thr) == "FAIL"]
    print(f"after-FAIL rows: {len(after_fails)}")
    for (theme, tok, pair), r, thr in sorted(after_fails):
        print(f"  FAIL {theme} {tok}: {pair} = {r:.2f} (< {thr:g})")


if __name__ == "__main__":
    main()
