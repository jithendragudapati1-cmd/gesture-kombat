"""Assemble the whole game into one double-clickable HTML file (no server needed)."""
import base64, json, os, re, sys

SITE = '/home/claude/gk/site'
OUT = sys.argv[1] if len(sys.argv) > 1 else '/home/claude/gk/out/Gesture Kombat.html'
IDS = ['fire', 'lightning', 'earth', 'wind']
SKIP = {'pack.js'}


def b64(path):
    return base64.b64encode(open(path, 'rb').read()).decode()


def datauri(path, mime='image/webp'):
    return f'data:{mime};base64,{b64(path)}'


assets = {}
for n in ['arena', 'menu'] + [f'fighter-{i}' for i in IDS] + [f'card-{i}' for i in IDS]:
    assets[f'assets/{n}.webp'] = datauri(f'{SITE}/assets/{n}.webp')
for i in IDS:
    assets[f'assets/models/{i}.webp'] = datauri(f'{SITE}/assets/models/{i}.webp')
    assets[f'assets/models/{i}.json'] = open(f'{SITE}/assets/models/{i}.json').read()
    assets[f'assets/models/{i}.bin'] = b64(f'{SITE}/assets/models/{i}.bin')

src = {}
for f in sorted(os.listdir(f'{SITE}/js')):
    if f.endswith('.js') and f not in SKIP:
        src[f] = open(f'{SITE}/js/{f}').read()

css = open(f'{SITE}/css/main.css').read()
css = css.replace("url('../assets/arena.webp')", f"url('{assets['assets/arena.webp']}')")

index = open(f'{SITE}/index.html').read()
head_extra = re.search(r'<meta name="description".*?(?=<link rel="stylesheet" href="css/main.css">)', index, re.S).group(0)
head_extra = re.sub(r'\s*<link rel="preload"[^>]*>', '', head_extra)
body = re.search(r'<body[^>]*>(.*?)<script type="module"', index, re.S).group(1)

def js_json(o):
    return json.dumps(o, separators=(',', ':')).replace('</', '<\\/')

loader = open(f'{SITE}/js/offline-loader.txt').read()
html = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Gesture Kombat</title>
{head_extra}<style>{css}</style>
</head>
<body data-screen="loading">
{body}<script type="application/json" id="gk-assets">{js_json(assets)}</script>
<script type="application/json" id="gk-src">{js_json(src)}</script>
<script>{loader}</script>
</body>
</html>
'''
os.makedirs(os.path.dirname(OUT), exist_ok=True)
open(OUT, 'w').write(html)
print(OUT, round(len(html) / 1e6, 2), 'MB')
