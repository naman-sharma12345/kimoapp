"""Build OFL web subsets without changing glyph outlines or variable weights.
Developer-only: python -m pip install 'fonttools[woff]', then python scripts/fonts.py.
"""
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

assets = Path('apps/web/src/assets/fonts')
sources = [
    (Path('apps/web/node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2'), 'Geist-UI.woff2'),
    (Path('apps/web/node_modules/geist/dist/fonts/geist-mono/GeistMono-Variable.woff2'), 'GeistMono-UI.woff2'),
    (assets / 'InstrumentSerif-Italic.ttf', 'InstrumentSerif-Italic.woff2'),
]
for source, name in sources:
    font = TTFont(source)
    font.recalcTimestamp = False
    options = subset.Options()
    options.layout_features = ['*']
    tool = subset.Subsetter(options=options)
    tool.populate(unicodes=list(range(0x20, 0x80)) + [0xa0, 0xb0, 0xb7, 0xd7, 0x2013, 0x2014, *range(0x2018, 0x201e), 0x2026, *range(0x2190, 0x219a), 0x2318, 0x2325, 0x23ce, 0xfeff, 0xfffd])
    tool.subset(font)
    font.flavor = 'woff2'
    destination = Path('apps/web/public/fonts') / name
    destination.parent.mkdir(parents=True, exist_ok=True)
    font.save(destination)
    print(name, destination.stat().st_size)

for source, name in sources:
    full = TTFont(source)
    full.recalcTimestamp = False
    full.flavor = 'woff2'
    full.save(Path('apps/web/public/fonts') / name.replace('.woff2', '-full.woff2'))
