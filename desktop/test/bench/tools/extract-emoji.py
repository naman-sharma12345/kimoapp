# Rasterise a handful of Noto Color Emoji (OFL) glyphs to 160 px PNGs (offline bench tool).
import sys, re, xml.etree.ElementTree as ET, cairosvg
from fontTools.ttLib import TTFont
font, out = sys.argv[1], sys.argv[2]
E = {'fire':0x1F525,'money':0x1F4B0,'rocket':0x1F680,'mind-blown':0x1F92F,'bulb':0x1F4A1,'hundred':0x1F4AF,'eyes':0x1F440,'check':0x2705,'warning':0x26A0,'laugh':0x1F602,'heart':0x2764,'clap':0x1F44F,'chart-up':0x1F4C8,'party':0x1F389,'thinking':0x1F914,'star':0x2B50,'brain':0x1F9E0,'lightning':0x26A1,'trophy':0x1F3C6,'x':0x274C}
f = TTFont(font); cmap = f.getBestCmap(); upem = f['head'].unitsPerEm
asc = f['hhea'].ascent; desc = f['hhea'].descent
ET.register_namespace('', 'http://www.w3.org/2000/svg'); ET.register_namespace('xlink', 'http://www.w3.org/1999/xlink')
for name, cp in E.items():
    gid = f.getGlyphID(cmap[cp]); adv = f['hmtx'][cmap[cp]][0]
    doc = next(d for d in f['SVG '].docList if d.startGlyphID <= gid <= d.endGlyphID)
    root = ET.fromstring(doc.data)
    for ch in list(root):
        if ch.tag.endswith('defs'): continue
        if ch.get('id') != f'glyph{gid}': root.remove(ch)
    root.set('viewBox', f'0 {-asc} {adv} {asc - desc}'); root.set('width', '160'); root.set('height', str(round(160 * (asc - desc) / adv)))
    cairosvg.svg2png(bytestring=ET.tostring(root), write_to=f'{out}/{name}.png', output_width=160)
    print(name, adv, asc, desc)
