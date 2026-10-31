// Keyword → icon index over the bundled Lucide (ISC) + Tabler (MIT) line
// icons (data/icons.json, built from icon names + tags) and the Simple Icons
// (CC0) brand marks (data/brands.json). Logos come only from here or the
// user's own assets folder; nothing is fetched. Node only.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DATA = (f) => fileURLToPath(new URL(`./data/${f}`, import.meta.url));
let ICONS = null;
let INDEX = null;
let BRANDS = null;
const words = (s) => String(s ?? '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

function load() {
  if (ICONS) return;
  ICONS = JSON.parse(readFileSync(DATA('icons.json'), 'utf8')).icons.map(([name, src, tags, d]) => ({ name, src, tags, d }));
  INDEX = new Map();
  ICONS.forEach((icon, i) => {
    const nameWords = words(icon.name);
    for (const w of nameWords) (INDEX.get(w) ?? INDEX.set(w, []).get(w)).push([i, 3 + (icon.src === 'l' ? 1 : 0) - (nameWords.length - 1) * 0.3]);
    for (const w of words(icon.tags)) (INDEX.get(w) ?? INDEX.set(w, []).get(w)).push([i, 1 + (icon.src === 'l' ? 0.2 : 0)]);
  });
}
// a few spoken ideas → better icon words
const SYN = { money: 'coins', revenue: 'chart', profit: 'trending', growth: 'trending up', fail: 'x', failed: 'x', idea: 'lightbulb', time: 'clock', fast: 'zap', speed: 'gauge', users: 'users', people: 'users', team: 'users', focus: 'target', goal: 'target', attention: 'eye', learn: 'book', study: 'book', code: 'code', video: 'video', edit: 'scissors', phone: 'smartphone', ai: 'brain', health: 'heart', sleep: 'moon', email: 'mail', search: 'search', security: 'shield', bug: 'bug', launch: 'rocket', ship: 'rocket', compound: 'trending up', interest: 'percent', debt: 'credit card', home: 'house', travel: 'plane', food: 'utensils', music: 'music', camera: 'camera', world: 'globe', india: 'map pin' };

/** Best line icon for a spoken concept, or null: {name, d, source}. */
export function findIcon(query) {
  load();
  const q = words(query).flatMap((w) => words(SYN[w] ?? w));
  if (!q.length) return null;
  const exact = ICONS.find((i) => i.name === q.join('-'));
  if (exact) return { name: exact.name, d: exact.d, source: exact.src === 'l' ? 'lucide' : 'tabler' };
  const score = new Map();
  for (const w of q) for (const [i, s] of INDEX.get(w) ?? []) score.set(i, (score.get(i) ?? 0) + s);
  let best = null;
  for (const [i, s] of score) if (!best || s > best[1] || (s === best[1] && ICONS[i].name.length < ICONS[best[0]].name.length)) best = [i, s];
  if (!best) return null;
  const icon = ICONS[best[0]];
  return { name: icon.name, d: icon.d, source: icon.src === 'l' ? 'lucide' : 'tabler' };
}
export const iconCount = () => (load(), ICONS.length);

/** Simple Icons brand mark for a spoken brand name, or null: {slug, title, hex, d}. */
export function findBrand(name) {
  BRANDS ??= JSON.parse(readFileSync(DATA('brands.json'), 'utf8')).brands.map(([slug, title, hex, d]) => ({ slug, title, hex, d, key: title.toLowerCase().replace(/[^a-z0-9]/g, '') }));
  const k = String(name ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!k) return null;
  const alias = { twitter: 'x', chatgpt: 'openai', gpt: 'openai', vscode: 'visualstudiocode', aws: 'amazonwebservices', gemini: 'googlegemini', node: 'nodedotjs', nextjs: 'nextdotjs', premiere: 'adobepremierepro', aftereffects: 'adobeaftereffects', photoshop: 'adobephotoshop', copilot: 'githubcopilot' }[k];
  return BRANDS.find((b) => b.slug === (alias ?? k) || b.key === k) ?? null;
}
