"""WCAG AA contrast audit for Sonner error toast (branch fix/sla-csp-edge)."""
import math

def hsl_to_rgb(h, s, l):
    h = h % 360
    c = (1 - abs(2*l - 1)) * s
    x = c * (1 - abs((h/60) % 2 - 1))
    m = l - c/2
    if h < 60: r, g, b = c, x, 0
    elif h < 120: r, g, b = x, c, 0
    elif h < 180: r, g, b = 0, c, x
    elif h < 240: r, g, b = 0, x, c
    elif h < 300: r, g, b = x, 0, c
    else: r, g, b = c, 0, x
    return tuple(round((v+m)*255) for v in (r, g, b))

def lin(c):
    c = c/255
    return c/12.92 if c <= 0.04045 else ((c+0.055)/1.055)**2.4

def lum(rgb):
    r, g, b = rgb
    return 0.2126*lin(r) + 0.7152*lin(g) + 0.0722*lin(b)

def contrast(fg, bg):
    l1, l2 = lum(fg), lum(bg)
    if l1 < l2: l1, l2 = l2, l1
    return (l1+0.05)/(l2+0.05)

def composite(fg, bg, alpha):
    """alpha-composite fg over bg."""
    return tuple(round(alpha*f + (1-alpha)*b) for f, b in zip(fg, bg))

# Theme matrix from tokens.css + accessibility.css
themes = {
    'light':          dict(dest=hsl_to_rgb(0, .72, .42), fg=hsl_to_rgb(0, 0, 1),   card=(255,255,255), muted_fg=hsl_to_rgb(221,.15,.30), fg_global=hsl_to_rgb(221,.20,.12)),
    'dark':           dict(dest=hsl_to_rgb(0, .95, .46), fg=hsl_to_rgb(0, 0, 1),   card=(0,0,0),       muted_fg=hsl_to_rgb(215,.20,.70), fg_global=hsl_to_rgb(210,.20,.98)),
    'light+high-contrast': dict(dest=hsl_to_rgb(0,1,.40), fg=hsl_to_rgb(0,0,1),    card=(255,255,255), muted_fg=hsl_to_rgb(0,0,.20),    fg_global=(0,0,0)),
    'dark+high-contrast':  dict(dest=hsl_to_rgb(0,1,.60), fg=hsl_to_rgb(0,0,0),    card=hsl_to_rgb(0,0,.05), muted_fg=hsl_to_rgb(0,0,.80), fg_global=(255,255,255)),
}
OLD_WHITE = (255,255,255)

print(f"{'theme':<20} {'state':<8} {'fg':<22} {'bg':<22} {'ratio':<7} verdict")
print("-"*95)
all_pass = True
for name, t in themes.items():
    # Title/description: NEW fg vs toast bg
    r = contrast(t['fg'], t['dest'])
    ok = r >= 4.5
    all_pass &= ok
    print(f"{name:<20} {'normal':<8} {str(t['fg']):<22} {str(t['dest']):<22} {r:>5.2f}:1  {'PASS' if ok else 'FAIL'}")
    # OLD color in same state (differs only in dark+HC)
    if t['fg'] != OLD_WHITE:
        r_old = contrast(OLD_WHITE, t['dest'])
        print(f"{name:<20} {'OLD(#fff)':<8} {str(OLD_WHITE):<22} {str(t['dest']):<22} {r_old:>5.2f}:1  {'PASS' if r_old>=4.5 else 'FAIL (was worse)'}")

print()
print("Close button states (on error toast):")
for name, t in themes.items():
    for state, fg in (('normal', t['muted_fg']), ('hover/focus', t['fg_global'])):
        r = contrast(fg, t['card'])
        ok = r >= 4.5
        all_pass &= ok
        print(f"{name:<20} {state:<12} {str(fg):<22} {str(t['card']):<22} {r:>5.2f}:1  {'PASS' if ok else 'FAIL'}")

print()
print("Mid-transition simulation (pre-fix scenario, li opacity 0.76 over page bg):")
page = {'light': (255,255,255), 'dark': (0,0,0), 'light+high-contrast': (255,255,255), 'dark+high-contrast': (0,0,0)}
for name, t in themes.items():
    bg_comp = composite(t['dest'], page[name], 0.76)
    r = contrast(t['fg'], bg_comp)
    ok = r >= 4.5
    print(f"{name:<20} {'mid-trans':<12} {str(t['fg']):<22} {str(bg_comp):<22} {r:>5.2f}:1  {'PASS' if ok else 'FAIL (covered by opacity:1 fix)'}")
    # text at 76% opacity composite (the actual axe finding)
    txt_comp = composite(t['fg'], t['dest'], 0.76)
    r2 = contrast(txt_comp, t['dest'])
    print(f"{name:<20} {'text@76%':<12} {str(txt_comp):<22} {str(t['dest']):<22} {r2:>5.2f}:1  {'PASS' if r2>=4.5 else 'FAIL (fixed by opacity:1 rule)'}")

print()
print("Zoom simulation (contrast is scale-invariant; large-text 3:1 threshold at >=24px):")
for name, t in themes.items():
    r = contrast(t['fg'], t['dest'])
    print(f"{name:<20} zoom 90/110/200% -> ratio {r:>5.2f}:1 (unchanged) -> {'PASS 4.5:1' if r>=4.5 else 'FAIL'}")

print()
print("RESULT:", "A11Y_PASS" if all_pass else "A11Y_FAIL")
