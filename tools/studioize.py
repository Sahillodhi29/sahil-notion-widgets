"""studioize.py <page> : copy a page's CSS/HTML from repo/ to work/, turn colours into Studio roles, make plates zoom/flip aware,
   add the skin script tag.  Prints the role reference hues/saturations for the registry."""
import re, sys, os, colorsys, statistics, shutil, json
page = sys.argv[1]
SRC = f'repo/{page}/{page}'; DST = f'work/{page}'
def cls(h, s, l):
    if s < .10 or l >= .87: return None
    P = page
    if P == 'workout':
        if h >= 315 or h < 30: return 'a'
        if 45 <= h < 75: return 'b'
        if 75 <= h < 165: return 'w'
    if P == 'meal':
        if 8 <= h < 45: return 'a'
        if h >= 300 or h < 8: return 'b'
        if 190 <= h < 245: return 'w'
    if P == 'todo':
        if 30 <= h < 65: return 'a'
        if h >= 300 or h < 30: return 'b'
    if P == 'wardrobe':
        if 28 <= h < 65: return 'a'
        if h >= 300 or h < 28: return 'w' if l < .2 else 'b'
    if P == 'finance':
        if 30 <= h < 65: return 'a'
        if 5 <= h < 30: return 'b'
        if 180 <= h < 235: return 'w'
    if P == 'learning':
        if 30 <= h < 65: return 'a'
        if 235 <= h < 312: return 'w' if l < .3 else 'b'
    if P in ('status', 'sail'):
        if 30 <= h < 65: return 'a'
        if h >= 300 or h < 30: return 'w' if l < .2 else 'b'
    return None
hexre = re.compile(r'#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b'); rgbre = re.compile(r'rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)')
def hls(r, g, b): h, l, s = colorsys.rgb_to_hls(r/255, g/255, b/255); return h*360, s, l
files = sorted(f for f in os.listdir(SRC) if f.endswith('.css'))
# pass 1: reference hue per role = median of the hues assigned to it
seen = {'a': [], 'b': [], 'w': []}
blk = re.compile(r'([^{}]*)\{([^{}]*)\}')
def scan(s):
    for m in blk.finditer(s):
        b = m.group(2)
        for x in hexre.finditer(b):
            v = x.group(1); v = ''.join(c*2 for c in v) if len(v) == 3 else v
            h, sa, l = hls(int(v[0:2],16), int(v[2:4],16), int(v[4:6],16)); r = cls(h, sa, l)
            if r: seen[r].append((h, sa, l))
        for x in rgbre.finditer(b):
            h, sa, l = hls(int(x.group(1)), int(x.group(2)), int(x.group(3))); r = cls(h, sa, l)
            if r: seen[r].append((h, sa, l))
for f in files: scan(open(f'{SRC}/{f}').read())
def circ_median(hs):
    # hues may straddle 0: shift into a continuous range around the first value
    base = hs[0]; adj = [((h - base + 180) % 360) - 180 + base for h in hs]
    return statistics.median(adj) % 360
REF = {r: round(circ_median([x[0] for x in v]), 1) for r, v in seen.items() if v}
SAT = {r: round(statistics.median([x[1] for x in v]), 2) for r, v in seen.items() if v}
def conv(r, g, b, a):
    h, s, l = hls(r, g, b); ro = cls(h, s, l)
    if not ro: return None
    d = ((h - REF[ro] + 180) % 360) - 180
    hue = f'var(--{ro}-h)' if abs(d) < .05 else f'calc(var(--{ro}-h) {"+" if d>=0 else "-"} {abs(d):.1f})'
    al = f' / {a}' if a is not None else ''
    return f'hsl({hue} calc({s*100:.1f}% * var(--{ro}-k)) {l*100:.1f}%{al})'
def hexsub(m):
    x = m.group(1); x = ''.join(c*2 for c in x) if len(x) == 3 else x
    return conv(int(x[0:2],16), int(x[2:4],16), int(x[4:6],16), None) or m.group(0)
def rgbsub(m): return conv(int(m.group(1)), int(m.group(2)), int(m.group(3)), m.group(4)) or m.group(0)

# plate geometry: right-anchored box that grows with zoom-in, shrinks (with soft edges) on zoom-out
def plate(m):
    sel, body = m.group(1), m.group(2)
    wm = re.search(r'width:\s*([^;]+);', body); im = re.search(r'inset:\s*0;', body)
    pw = wm.group(1).strip() if wm else '100%'
    rad = re.search(r'border-radius:\s*([^;]+);', body); rad = rad.group(1).strip() if rad else '0'
    bg = re.search(r'background:\s*var\(--plate-art\)\s*([^;]+);', body).group(1)
    pos = re.search(r'^(.*?)\s*/\s*(.*?)\s*no-repeat', bg.strip()); posv, size = pos.group(1).strip(), pos.group(2).strip()
    if 'plate-pos' not in posv: posv = f'var(--plate-pos, {posv})'
    z = re.search(r'z-index:\s*(-?\d+)', body).group(1)
    mk = re.search(r'(?<!-webkit-)mask-image:\s*([^;]+);', body); orig = (mk.group(1).strip() + ', ') if mk else ''
    out = (f"\n  --z: var(--plate-zoom, 1); --zi: max(var(--z), 1); --zo: min(var(--z), 1); --ev: calc((1 - var(--zo)) * 70%); --pw: {pw};\n"
           f"  content: ''; position: absolute; z-index: {z}; width: calc(var(--pw) * var(--zi)); height: calc(100% * var(--zi));\n"
           f"  top: calc(-50% * (var(--zi) - 1)); right: calc(var(--pw) * (1 - var(--zi)) / 2); border-radius: {rad};\n"
           f"  background: var(--plate-art) {posv} / {size} no-repeat;\n"
           f"  -webkit-mask-image: {orig}linear-gradient(180deg, transparent, #000 var(--ev), #000 calc(100% - var(--ev)), transparent), linear-gradient(90deg, transparent, #000 var(--ev), #000 calc(100% - var(--ev)), transparent);\n"
           f"  mask-image: {orig}linear-gradient(180deg, transparent, #000 var(--ev), #000 calc(100% - var(--ev)), transparent), linear-gradient(90deg, transparent, #000 var(--ev), #000 calc(100% - var(--ev)), transparent);\n"
           f"  -webkit-mask-composite: source-in; mask-composite: intersect;\n"
           f"  filter: brightness(var(--plate-bright, 1)); transform: scale(calc(var(--plate-flip, 1) * var(--zo)), var(--zo)); transform-origin: var(--plate-origin, 50% 50%);\n")
    return sel + '{' + out + '}'
platere = re.compile(r'([^{}]*::(?:before|after)[^{}]*)\{([^{}]*var\(--plate-art\)[^{}]*)\}')
VM = 'linear-gradient(180deg, transparent, #000 var(--ev), #000 calc(100% - var(--ev)), transparent), linear-gradient(90deg, transparent, #000 var(--ev), #000 calc(100% - var(--ev)), transparent)'
def narrow(m):   # later (narrow-screen) overrides of a plate's width / mask must keep working with zoom
    sel, b = m.group(1), m.group(2)
    if 'content' in b or 'plate-art' in b or not re.search(r'(\.head|\.band)::before\s*$', sel.strip()): return m.group(0)
    b = re.sub(r'(?<![-\w])width:\s*([^;]+);', r'--pw: \1;', b)
    b = re.sub(r'((?:-webkit-)?mask-image):\s*([^;]+);', lambda k: f'{k.group(1)}: {k.group(2)}, {VM};', b)
    return sel + '{' + b + '}'
os.makedirs(DST, exist_ok=True); nplates = 0
for f in files:
    s = open(f'{SRC}/{f}').read()
    def body(m):
        b = rgbre.sub(rgbsub, m.group(2)); b = hexre.sub(hexsub, b); return m.group(1) + '{' + b + '}'
    s = blk.sub(body, s)
    s, n = platere.subn(plate, s); nplates += n
    s = blk.sub(narrow, s)
    if f == 'style.css':
        roles = ' '.join(f'--{r}-h: {REF[r]:g}; --{r}-k: 1;' for r in 'abw' if r in REF)
        s = f'/* Studio colour roles: hue (deg) and saturation scale for accent (a), secondary (b) and wall (w). The Studio overrides these. */\n:root {{ {roles} }}\n' + s
    open(f'{DST}/{f}', 'w').write(s)
# html: add skin tag after theme.js
for f in [x for x in os.listdir(SRC) if x == 'index.html']:
    s = open(f'{SRC}/{f}').read()
    tag = f'<script src="/shared/skin.js" data-page="{page}"></script>'
    if 'shared/skin.js' not in s:
        s2 = re.sub(r'(<script src="(?:/%s/)?theme\.js"></script>)' % page, r'\1\n  ' + tag, s, count=1)
        assert s2 != s, 'theme.js tag not found'; s = s2
    open(f'{DST}/{f}', 'w').write(s)
print(json.dumps({'page': page, 'ref': REF, 'sat': SAT, 'plates': nplates, 'counts': {k: len(v) for k, v in seen.items()}}))
