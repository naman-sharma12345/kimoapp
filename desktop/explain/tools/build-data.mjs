// Dev-only generator for the bundled explainer data (not shipped in the
// installer). Usage:
//   node explain/tools/build-data.mjs <dir>
// where <dir> holds the unpacked npm packages lucide-static (ISC),
// @tabler/icons (MIT), simple-icons (CC0) and the downloads
// ne_50m_admin_0_countries.geojson (Natural Earth, public domain) and
// cities15000.txt (GeoNames, CC BY 4.0). Writes explain/data/*.json.
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = process.argv[2];
if (!SRC) throw new Error('usage: build-data.mjs <dir with unpacked sources>');
const OUT = fileURLToPath(new URL('../data/', import.meta.url));
mkdirSync(OUT, { recursive: true });
const r2 = (n) => Math.round(Number(n) * 100) / 100;
const num = (n) => String(r2(n)).replace(/^(-?)0\./, '$1.');

/** One SVG element node → path data. */
function nodeToD([tag, a]) {
  const n = (k, d = 0) => Number(a[k] ?? d);
  if (tag === 'path') return a.d;
  if (tag === 'circle') {
    const [cx, cy, r] = [n('cx'), n('cy'), n('r')];
    return `M${num(cx - r)} ${num(cy)}a${num(r)} ${num(r)} 0 1 0 ${num(2 * r)} 0a${num(r)} ${num(r)} 0 1 0 ${num(-2 * r)} 0`;
  }
  if (tag === 'ellipse') {
    const [cx, cy, rx, ry] = [n('cx'), n('cy'), n('rx'), n('ry')];
    return `M${num(cx - rx)} ${num(cy)}a${num(rx)} ${num(ry)} 0 1 0 ${num(2 * rx)} 0a${num(rx)} ${num(ry)} 0 1 0 ${num(-2 * rx)} 0`;
  }
  if (tag === 'line') return `M${num(n('x1'))} ${num(n('y1'))}L${num(n('x2'))} ${num(n('y2'))}`;
  if (tag === 'polyline' || tag === 'polygon') {
    const p = String(a.points).trim().split(/[\s,]+/).map(Number);
    let d = `M${num(p[0])} ${num(p[1])}`;
    for (let i = 2; i + 1 < p.length; i += 2) d += `L${num(p[i])} ${num(p[i + 1])}`;
    return tag === 'polygon' ? `${d}Z` : d;
  }
  if (tag === 'rect') {
    const [x, y, w, h] = [n('x'), n('y'), n('width'), n('height')];
    const r = Math.min(n('rx', n('ry')), w / 2, h / 2);
    if (!r) return `M${num(x)} ${num(y)}h${num(w)}v${num(h)}h${num(-w)}Z`;
    return `M${num(x + r)} ${num(y)}h${num(w - 2 * r)}a${num(r)} ${num(r)} 0 0 1 ${num(r)} ${num(r)}v${num(h - 2 * r)}a${num(r)} ${num(r)} 0 0 1 ${num(-r)} ${num(r)}h${num(-(w - 2 * r))}a${num(r)} ${num(r)} 0 0 1 ${num(-r)} ${num(-r)}v${num(-(h - 2 * r))}a${num(r)} ${num(r)} 0 0 1 ${num(r)} ${num(-r)}Z`;
  }
  return '';
}

// ------------------------------------------------------------ icons
const lucideDir = join(SRC, 'lucide-static-0.548.0', 'package');
const tablerDir = join(SRC, 'tabler-icons-3.35.0', 'package');
const lucideNodes = JSON.parse(readFileSync(join(lucideDir, 'icon-nodes.json'), 'utf8'));
const lucideTags = JSON.parse(readFileSync(join(lucideDir, 'tags.json'), 'utf8'));
const tablerNodes = JSON.parse(readFileSync(join(tablerDir, 'tabler-nodes-outline.json'), 'utf8'));
const tablerMeta = JSON.parse(readFileSync(join(tablerDir, 'icons.json'), 'utf8'));
const icons = [];
const seen = new Set();
for (const [name, nodes] of Object.entries(lucideNodes)) {
  const d = nodes.map(nodeToD).filter(Boolean).join('');
  if (!d) continue;
  seen.add(name);
  icons.push([name, 'l', (lucideTags[name] ?? []).slice(0, 8).join(' '), d]);
}
for (const [name, nodes] of Object.entries(tablerNodes)) {
  if (seen.has(name)) continue;
  // tabler's first node is the invisible bounding box path
  const d = nodes.filter(([t, a]) => !(t === 'path' && /^M0 0h24v24H0z$/.test(String(a.d).replace(/\s/g, '')))).map(nodeToD).filter(Boolean).join('');
  if (!d) continue;
  const meta = tablerMeta[name] ?? {};
  icons.push([name, 't', [...(meta.tags ?? []), meta.category ?? ''].filter(Boolean).slice(0, 8).join(' ').toLowerCase(), d]);
}
writeFileSync(join(OUT, 'icons.json'), JSON.stringify({ v: 1, viewBox: 24, stroke: true, sources: { l: 'Lucide (ISC)', t: 'Tabler Icons (MIT)' }, icons }));

// ------------------------------------------------------------ brands (Simple Icons, CC0): a popular subset
const siDir = join(SRC, 'simple-icons-15.17.0', 'package');
const siData = JSON.parse(readFileSync(join(siDir, 'data', 'simple-icons.json'), 'utf8'));
const list = Array.isArray(siData) ? siData : siData.icons;
const POPULAR = new Set(
  'google youtube instagram x facebook whatsapp telegram tiktok snapchat reddit discord twitch spotify netflix apple android windows linux ubuntu github gitlab bitbucket npm nodedotjs deno bun python rust go typescript javascript react nextdotjs vuedotjs svelte angular tailwindcss vite docker kubernetes cloudflare vercel netlify amazonwebservices googlecloud firebase supabase mongodb postgresql mysql sqlite redis stripe paypal razorpay paytm phonepe googlepay visa mastercard shopify notion figma canva adobe adobephotoshop adobepremierepro adobeaftereffects davinciresolve blender unity unrealengine openai anthropic googlegemini meta huggingface nvidia intel amd qualcomm samsung xiaomi oneplus oppo vivo realme sony nintendo playstation xbox steam epicgames tesla uber ola swiggy zomato flipkart amazon ebay airbnb booking tripadvisor duolingo coursera udemy khanacademy wikipedia medium substack wordpress ghost linkedin indeed glassdoor slack zoom microsoftteams googlemeet gmail googledrive dropbox icloud onedrive obsidian evernote trello asana jira confluence linear clickup todoist chatgpt perplexity claude mistralai ollama langchain vscodium visualstudiocode cursor jetbrains intellijidea neovim vim gnu git githubcopilot stackoverflow hackerrank leetcode codeforces codechef kaggle jupyter pandas numpy tensorflow pytorch opencv arduino raspberrypi esp32 bitcoin ethereum binance coinbase wise revolut jio airtel bsnl tata mahindra bmw mercedes audi toyota honda hyundai suzuki ford ferrari porsche lamborghini nike adidas puma zara hm ikea starbucks mcdonalds kfc dominos pizzahut cocacola pepsi redbull bbc cnn nytimes theguardian reuters bloomberg forbes techcrunch theverge wired producthunt ycombinator hackernews mozilla firefox googlechrome safari opera brave microsoftedge'.split(
    ' ',
  ),
);
const slugOf = (t) => t.toLowerCase().replace(/\+/g, 'plus').replace(/\./g, 'dot').replace(/&/g, 'and').normalize('NFD').replace(/[^a-z0-9]/g, '');
const brands = [];
for (const icon of list) {
  const slug = icon.slug ?? slugOf(icon.title);
  if (!POPULAR.has(slug)) continue;
  const svg = join(siDir, 'icons', `${slug}.svg`);
  if (!existsSync(svg)) continue;
  const d = /\sd="([^"]+)"/.exec(readFileSync(svg, 'utf8'))?.[1];
  if (d) brands.push([slug, icon.title, icon.hex, d]);
}
writeFileSync(join(OUT, 'brands.json'), JSON.stringify({ v: 1, viewBox: 24, source: 'Simple Icons (CC0)', brands }));

// ------------------------------------------------------------ map
const ne = JSON.parse(readFileSync(join(SRC, 'ne50.geojson'), 'utf8'));
const q = (v) => Math.round(v * 10); // 0.1° grid, ints
const countries = [];
for (const f of ne.features) {
  const p = f.properties;
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const rings = [];
  for (const poly of polys) {
    const ring = poly[0];
    const flat = [];
    let px = null;
    let py = null;
    for (const [x, y] of ring) {
      const ix = q(x);
      const iy = q(y);
      if (ix === px && iy === py) continue;
      flat.push(ix, iy);
      px = ix;
      py = iy;
    }
    if (flat.length >= 8) rings.push(flat);
  }
  countries.push([p.NAME ?? p.ADMIN, p.ISO_A2_EH ?? p.ISO_A2, rings, Math.round((p.LABEL_X ?? 0) * 10), Math.round((p.LABEL_Y ?? 0) * 10)]);
}
writeFileSync(join(OUT, 'world.json'), JSON.stringify({ v: 1, unit: 0.1, source: 'Natural Earth 1:50m admin-0 countries (public domain)', countries }));

const rows = readFileSync(join(SRC, 'cities15000.txt'), 'utf8').split('\n').filter(Boolean).map((l) => l.split('\t'));
const city = (r) => [r[1], r[2] !== r[1] ? r[2] : '', r[8], r2(r[4]), r2(r[5]), Number(r[14])];
const byPop = rows.map(city).sort((a, b) => b[5] - a[5]);
const pick = new Map();
for (const c of byPop.slice(0, 1800)) pick.set(`${c[0]}|${c[2]}`, c);
for (const c of byPop.filter((x) => x[2] === 'IN').slice(0, 250)) pick.set(`${c[0]}|${c[2]}`, c);
const cities = [...pick.values()].sort((a, b) => b[5] - a[5]);
writeFileSync(join(OUT, 'cities.json'), JSON.stringify({ v: 1, source: 'GeoNames cities15000 (CC BY 4.0, geonames.org)', fields: ['name', 'ascii', 'country', 'lat', 'lon', 'population'], cities }));

for (const f of readdirSync(OUT)) console.log(f, readFileSync(join(OUT, f)).length);
