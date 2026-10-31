// Offline geography for the map family: the bundled Natural Earth country
// outlines (public domain) and GeoNames cities (CC BY 4.0, credited in
// THIRD_PARTY_NOTICES.md). No online tiles. Node only.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DATA = (f) => fileURLToPath(new URL(`./data/${f}`, import.meta.url));
let WORLD = null;
let CITIES = null;
const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z\u0900-\u097f ]/g, '').trim();
// common spoken variants → bundled names
const ALIAS = { bangalore: 'bengaluru', bombay: 'mumbai', calcutta: 'kolkata', madras: 'chennai', gurgaon: 'gurugram', usa: 'united states of america', us: 'united states of america', america: 'united states of america', uk: 'united kingdom', england: 'united kingdom', 'new delhi': 'delhi', dilli: 'delhi', bharat: 'india', hindustan: 'india', uae: 'united arab emirates', dubai: 'dubai', 'silicon valley': 'san jose', 'bay area': 'san francisco' };

function world() {
  if (!WORLD) {
    const w = JSON.parse(readFileSync(DATA('world.json'), 'utf8'));
    WORLD = w.countries.map(([name, iso, rings, lx, ly]) => {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      for (const r of rings)
        for (let i = 0; i < r.length; i += 2) {
          x0 = Math.min(x0, r[i]);
          x1 = Math.max(x1, r[i]);
          y0 = Math.min(y0, r[i + 1]);
          y1 = Math.max(y1, r[i + 1]);
        }
      return { name, key: norm(name), iso, rings, label: [lx / 10, ly / 10], bbox: [x0 / 10, y0 / 10, x1 / 10, y1 / 10] };
    });
  }
  return WORLD;
}
function cities() {
  if (!CITIES) {
    const c = JSON.parse(readFileSync(DATA('cities.json'), 'utf8'));
    CITIES = c.cities.map(([name, ascii, iso, lat, lon, pop]) => ({ name, key: norm(ascii || name), alt: norm(name), iso, lat, lon, pop }));
  }
  return CITIES;
}

/** A spoken place → {name, kind: city|country, lat, lon, iso, bbox?} or null. */
export function findPlace(raw) {
  let key = norm(raw);
  if (!key) return null;
  key = ALIAS[key] ?? key;
  const city = cities().find((c) => c.key === key || c.alt === key);
  const country = world().find((c) => c.key === key || norm(c.iso) === key);
  // a country name wins over a small city of the same name, a big city over a tiny country
  if (country && (!city || city.pop < 2_000_000)) return { name: country.name, kind: 'country', lat: country.label[1], lon: country.label[0], iso: country.iso, bbox: country.bbox };
  if (city) return { name: city.name, kind: 'city', lat: city.lat, lon: city.lon, iso: city.iso };
  return null;
}

/** Lowercased place names for cue detection (countries + cities over 500k + aliases). */
let GAZ = null;
export function gazetteer() {
  if (!GAZ) {
    GAZ = new Set([...world().map((c) => c.key), ...cities().filter((c) => c.pop >= 500_000).flatMap((c) => [c.key, c.alt]), ...Object.keys(ALIAS)]);
    for (const k of ['china', 'india', 'japan', 'france', 'germany']) GAZ.add(k);
  }
  return GAZ;
}

const viewOf = (b, pad = 1.5, min = 6) => {
  const lat = (b[1] + b[3]) / 2;
  const k = Math.cos((lat * Math.PI) / 180);
  return { lon: (b[0] + b[2]) / 2, lat, span: Math.max(min, Math.max((b[2] - b[0]) * k, (b[3] - b[1]) * 1.6) * pad) };
};

/**
 * Map props for the map family: the visible country shapes (simplified to
 * the zoom), the places with their entry times, and the from/to camera views
 * (zoom from the country to the city / route).
 */
export function mapProps(places, { route = false } = {}) {
  const found = places.map((p) => ({ ...findPlace(p.name), said: p.name, t: p.t })).filter((p) => p.lat != null);
  if (!found.length) return null;
  const first = found[0];
  const home = world().find((c) => c.iso === first.iso);
  const lons = found.map((p) => p.lon);
  const lats = found.map((p) => p.lat);
  const box = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
  const to = found.length > 1 ? viewOf(box, 1.6, 8) : first.kind === 'country' ? viewOf(first.bbox, 1.2, 10) : { lon: first.lon, lat: first.lat, span: 9 };
  const from = home ? viewOf(home.bbox, 1.15, Math.max(14, to.span * 1.2)) : { ...to, span: to.span * 2.4 };
  const span = Math.max(from.span, to.span) * 1.4;
  const seen = [Math.min(from.lon, to.lon) - span, Math.min(from.lat, to.lat) - span / 1.4, Math.max(from.lon, to.lon) + span, Math.max(from.lat, to.lat) + span / 1.4];
  const tol = Math.max(1, Math.round((to.span / 260) * 10)); // in 0.1° units
  const shapes = [];
  const his = new Set(found.map((p) => p.iso));
  for (const c of world()) {
    if (c.bbox[2] < seen[0] || c.bbox[0] > seen[2] || c.bbox[3] < seen[1] || c.bbox[1] > seen[3]) continue;
    for (const r of c.rings) {
      const out = [r[0], r[1]];
      for (let i = 2; i < r.length; i += 2) if (Math.abs(r[i] - out.at(-2)) + Math.abs(r[i + 1] - out.at(-1)) >= tol) out.push(r[i], r[i + 1]);
      if (out.length >= 8) shapes.push({ ring: out, ...(his.has(c.iso) ? { hi: true } : {}) });
    }
  }
  return { shapes, places: found.map((p) => ({ name: p.kind === 'country' ? p.name : p.name, lon: p.lon, lat: p.lat, t: p.t ?? 0 })), route: Boolean(route && found.length > 1), from, to };
}
