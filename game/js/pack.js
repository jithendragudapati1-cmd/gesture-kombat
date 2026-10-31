// Builds the whole game into ONE double-clickable HTML file (camera works, no server or Terminal needed).
const JS = ['academy', 'ai', 'assets', 'audio', 'auth', 'config', 'net', 'data', 'fighter3d', 'fx', 'game', 'gesture', 'input', 'intro', 'main', 'mirror', 'r3d', 'skel', 'store', 'vfx-ui'];
const IDS = ['fire', 'lightning', 'earth', 'wind'];
const IMAGES = ['arena', 'menu', ...IDS.map((i) => 'fighter-' + i), ...IDS.map((i) => 'card-' + i)];

const text = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error('missing ' + u); return r.text(); };
const dataUri = async (u) => {
  const r = await fetch(u); if (!r.ok) throw new Error('missing ' + u);
  const blob = await r.blob();
  return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob); });
};
const jsJson = (o) => JSON.stringify(o).replace(/<\//g, '<\\/');

export async function buildOffline(onProgress) {
  const jobs = [];
  const assets = {}, src = {};
  for (const n of IMAGES) jobs.push(async () => { assets[`assets/${n}.webp`] = await dataUri(`assets/${n}.webp`); });
  for (const i of IDS) {
    jobs.push(async () => { assets[`assets/models/${i}.webp`] = await dataUri(`assets/models/${i}.webp`); });
    jobs.push(async () => { assets[`assets/models/${i}.json`] = await text(`assets/models/${i}.json`); });
    jobs.push(async () => { assets[`assets/models/${i}.bin`] = (await text(`assets/models/${i}.b64.txt`)).trim(); });
  }
  for (const n of JS) jobs.push(async () => { src[`${n}.js`] = await text(`js/${n}.js`); });
  let css = '', loader = '', page = '';
  jobs.push(async () => { css = await text('css/main.css'); });
  jobs.push(async () => { loader = await text('js/offline-loader.txt'); });
  jobs.push(async () => { page = await text('standalone.html'); });
  let done = 0;
  await Promise.all(jobs.map((j) => j().then(() => onProgress?.(++done / jobs.length * 0.95))));
  css = css.replace("url('../assets/arena.webp')", `url('${assets['assets/arena.webp']}')`);
  const head = (page.match(/<meta name="description"[\s\S]*?(?=<link rel="stylesheet" href="css\/main.css">)/) || [''])[0];
  const headClean = head.replace(/\s*<link rel="preload"[^>]*>/g, '');
  const body = (page.match(/<body[^>]*>([\s\S]*?)<script type="module"/) || ['', ''])[1];
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Gesture Kombat</title>
${headClean}<style>${css}</style>
</head>
<body data-screen="loading">
${body}<script type="application/json" id="gk-assets">${jsJson(assets)}</script>
<script type="application/json" id="gk-src">${jsJson(src)}</script>
<script>${loader}</script>
</body>
</html>
`;
  onProgress?.(1);
  return new Blob([html], { type: 'text/html' });
}
