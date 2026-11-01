import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export const LOOK_IDS = [
  'clean',
  'warm-creator',
  'mkbhd-crisp',
  'cinematic-teal-orange',
  'vlog-bright',
  'moody-doc',
  'kimo',
];
const looks = new Map();
export function loadLook(id = 'clean') {
  if (!LOOK_IDS.includes(id)) throw new Error(`Unknown colour look: ${id}`);
  if (!looks.has(id))
    looks.set(
      id,
      JSON.parse(
        readFileSync(
          fileURLToPath(new URL(`../data/looks/${id}.json`, import.meta.url)),
          'utf8',
        ),
      ),
    );
  return looks.get(id);
}
export function defaultLook(template = '') {
  return /cinematic/.test(template)
    ? 'cinematic-teal-orange'
    : /documentary/.test(template)
      ? 'moody-doc'
      : /vlog/.test(template)
        ? 'vlog-bright'
        : /energetic/.test(template)
          ? 'mkbhd-crisp'
          : /podcast/.test(template)
            ? 'warm-creator'
            : 'clean';
}
