import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export const TEMPLATE_IDS = [
  'shorts-punchy',
  'shorts-clean',
  'youtube-talking',
  'youtube-vlog',
  'tutorial',
  'podcast-clips',
  'documentary',
  'explainer',
  'music-montage',
];
export const STYLE_ALIASES = {
  energetic: 'shorts-punchy',
  punchy: 'shorts-punchy',
  clean: 'shorts-clean',
  vlog: 'youtube-vlog',
  podcast: 'podcast-clips',
  cinematic: 'documentary',
  default: 'youtube-talking',
};
const cache = new Map();
export function getTemplate(id) {
  if (!TEMPLATE_IDS.includes(id))
    throw new Error(`Unknown creator template: ${id}`);
  if (!cache.has(id))
    cache.set(
      id,
      JSON.parse(
        readFileSync(
          fileURLToPath(
            new URL(`../data/templates/${id}.json`, import.meta.url),
          ),
          'utf8',
        ),
      ),
    );
  return structuredClone(cache.get(id));
}
export function selectTemplate(style, P = {}, note = '') {
  if (TEMPLATE_IDS.includes(style)) return getTemplate(style);
  let id = STYLE_ALIASES[style];
  if (!id) {
    id = /montage|music.led/i.test(note)
      ? 'music-montage'
      : /podcast|two.speaker/i.test(note)
        ? 'podcast-clips'
        : /tutorial|screen.record/i.test(note)
          ? 'tutorial'
          : P.height > P.width
            ? 'shorts-punchy'
            : 'youtube-talking';
  }
  return getTemplate(id);
}
export function templateStyles() {
  return Object.fromEntries(
    TEMPLATE_IDS.map((id) => [id, { label: getTemplate(id).label }]),
  );
}
