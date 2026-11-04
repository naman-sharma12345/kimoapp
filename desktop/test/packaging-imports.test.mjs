import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

// Regression: vfr-rate.mjs was imported by engine/compose/sam but missing from
// the electron-builder "files" allowlist, so the installed app crashed with
// ERR_MODULE_NOT_FOUND. Every relative import of a packaged top-level module
// must itself be packaged.
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).build.files;
const positive = files.filter((f) => !f.startsWith('!'));
const exact = new Set(positive.filter((f) => !f.includes('*')));
const globs = positive.filter((f) => f.endsWith('/**')).map((f) => f.slice(0, -2));
const packaged = (p) => exact.has(p) || globs.some((g) => p.startsWith(g));

test('every relative import of a packaged top-level module is packaged', () => {
  const missing = [];
  for (const f of exact) {
    if (!/\.(mjs|cjs)$/.test(f) || f.includes('/')) continue;
    const abs = join(root, f);
    if (!existsSync(abs) || !statSync(abs).isFile()) continue;
    const src = readFileSync(abs, 'utf8');
    for (const m of src.matchAll(/(?:from|import|require\()\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const t = normalize(join(dirname(f), m[1])).split('\\').join('/');
      if (existsSync(join(root, t)) && !packaged(t)) missing.push(`${f} -> ${t}`);
    }
  }
  assert.deepEqual(missing, []);
});
