"""Rewrite every colour literal in a CSS file as an hsl() that follows three role hues:
   a = accent, b = secondary, w = wall.  Lightness and alpha are kept exactly; only hue and
   saturation follow --a-h/--a-k etc.  With the default variables the result equals the original."""
import re, sys, colorsys, json
page, files = sys.argv[1], sys.argv[2:]
ROLES = {  # reference hue per role (the variables' defaults)
  'mustdo': {'a': 40, 'b': 2, 'w': 355},
  'stock':  {'a': 28, 'b': 214, 'w': 210},
}[page]
def role(h, s, l):
    if s < .10 or l >= .87: return None
    if page == 'mustdo':
        if 20 <= h <= 60: return 'a'
        if h >= 330 or h <= 22: return 'w' if l < .20 else 'b'
    else:
        if 12 <= h <= 52: return 'a'
        if 190 <= h <= 240: return 'w' if l < .26 else 'b'
    return None
def conv(r, g, b, a):
    h, l, s = colorsys.rgb_to_hls(r/255, g/255, b/255); h *= 360
    ro = role(h, s, l)
    if not ro: return None
    d = h - ROLES[ro]
    if d > 180: d -= 360
    if d < -180: d += 360
    hue = f'var(--{ro}-h)' if abs(d) < .05 else f'calc(var(--{ro}-h) {"+" if d>=0 else "-"} {abs(d):.1f})'
    sat = f'calc({s*100:.1f}% * var(--{ro}-k))'
    al = f' / {a}' if a is not None else ''
    return f'hsl({hue} {sat} {l*100:.1f}%{al})'
hexre = re.compile(r'#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b')
rgbre = re.compile(r'rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)')
def hexsub(m):
    x = m.group(1)
    if len(x) == 3: x = ''.join(c*2 for c in x)
    out = conv(int(x[0:2],16), int(x[2:4],16), int(x[4:6],16), None)
    return out or m.group(0)
def rgbsub(m):
    a = m.group(4)
    out = conv(int(m.group(1)), int(m.group(2)), int(m.group(3)), a)
    return out or m.group(0)
for f in files:
    s = open(f).read()
    n0 = len(hexre.findall(s)) + len(rgbre.findall(s))
    blk = re.compile(r'([^{}]*)\{([^{}]*)\}')   # innermost rule blocks only: never touch selectors like #bad
    def body(m):
        b = rgbre.sub(rgbsub, m.group(2)); b = hexre.sub(hexsub, b)
        return m.group(1) + '{' + b + '}'
    s = blk.sub(body, s)
    open(f, 'w').write(s); print(f, 'literals:', n0, 'hsl now:', s.count('hsl('))
