import math
from collections import Counter

def get_score_color(s):   return 'success' if s >= 80 else 'warning' if s >= 50 else 'destructive'
def get_score_foreground(s): return 'success-foreground' if s >= 80 else 'warning-foreground' if s >= 50 else 'destructive-foreground'

def js_number(s):
    if s is None: return 0.0
    if isinstance(s, str):
        try: return float(s)
        except ValueError: return float('nan')
    return float(s)

TOKENS = {
    'light': {'success':(142,76,45),'success-foreground':(0,0,100),'warning':(38,100,50),'warning-foreground':(0,0,100),'destructive':(0,72,42),'destructive-foreground':(0,0,100)},
    'dark':  {'success':(142,90,50),'success-foreground':(0,0,100),'warning':(42,100,55),'warning-foreground':(0,0,5),'destructive':(0,95,46),'destructive-foreground':(0,0,100)},
}
def hsl_to_rgb(h,s,l):
    h/=360; s/=100; l/=100
    def h2r(p,q,t):
        if t<0:t+=1
        if t>1:t-=1
        if t<1/6:return p+(q-p)*6*t
        if t<.5:return q
        if t<2/3:return p+(q-p)*(2/3-t)*6
        return p
    if s==0: r=g=b=l
    else:
        q=l*(1+s) if l<.5 else l+s-l*s; p=2*l-q
        r=h2r(p,q,h+1/3); g=h2r(p,q,h); b=h2r(p,q,h-1/3)
    return (round(r*255),round(g*255),round(b*255))
def lin(c):
    c/=255
    return c/12.92 if c<=.03928 else ((c+.055)/1.055)**2.4
def lum(rgb):
    r,g,b=(lin(c) for c in rgb)
    return .2126*r+.7152*g+.0722*b
def cr(fg,bg):
    l1,l2=lum(fg),lum(bg)
    if l1<l2:l1,l2=l2,l1
    return (l1+.05)/(l2+.05)

def label(s):
    if isinstance(s,float) and math.isnan(s): return 'NaN'
    if s is None: return 'null'
    if isinstance(s,str): return "'%s'"%s
    if s==float('inf'): return 'Infinity'
    if s==float('-inf'): return '-Infinity'
    return str(s)

cases = [(f'score={i}', i) for i in range(0,101)]
cases += [('NaN', float('nan')), ('-1 (negative)', -1), ('150 (>100)', 150),
          ('Infinity', float('inf')), ('-Infinity', float('-inf')), ('null', None), ("'50' (string)", '50')]

print('=== FINAL VERDICT TABLE (per scenario group) ===')
print(f'{"scenario":<22}{"bg token":<13}{"fg token (actual)":<22}{"expected":<22}{"match":<6}{"contrast AA(4.5) light/dark":<26}{"STATUS"}')
summary = Counter()
for name, s in cases:
    n = js_number(s)
    cat = get_score_color(n); fg = get_score_foreground(n)
    exp_cat = get_score_color(js_number(s)); exp_fg = exp_cat + '-foreground'  # same JS coercion for expected
    match = (cat == exp_cat and fg == exp_fg)
    cs = []
    for theme in ('light','dark'):
        bg = hsl_to_rgb(*TOKENS[theme][cat]); fgc = hsl_to_rgb(*TOKENS[theme][fg])
        cs.append(f'{cr(fgc,bg):.2f}:1')
    ok_contrast = all(float(c.split(":")[0]) >= 4.5 for c in cs)
    # contrast requirement: 10px bold text is small text -> 4.5:1 both themes
    status = 'PASS' if match and ok_contrast else 'FAIL'
    summary[status]+=1
    print(f'{name:<22}{cat:<13}{fg:<22}{exp_fg:<22}{"PASS" if match else "FAIL":<6}{cs[0]+" / "+cs[1]:<26}{status}')

print()
print('--- AGGREGATE ---')
for k,v in summary.items(): print(f'{k}: {v}')

print()
print('=== RANGE SUMMARY (0-100 sweep) ===')
ranges = [('0-49', 'destructive', 'destructive-foreground'),
          ('50-79', 'warning', 'warning-foreground'),
          ('80-100', 'success', 'success-foreground')]
for lo,hi,cat,fg in [(r[0].split('-')[0], r[0].split('-')[1], r[1], r[2]) for r in ranges]:
    ok = all(get_score_color(i)==cat and get_score_foreground(i)==fg for i in range(int(lo), int(hi)+1))
    print(f'{lo}-{hi}: bg={cat}, fg={fg}, all {int(hi)-int(lo)+1} values consistent: {ok}')
