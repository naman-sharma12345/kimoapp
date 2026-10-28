import { readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
const root = `apps/web/${process.env.KIMO_PREVIEW_DIST_DIR ?? '.next'}/`;
const manifest = JSON.parse(
  await readFile(root + 'app-build-manifest.json', 'utf8'),
);
const routes = [];
for (const [name, route, limit] of [
  ['landing', '/page', '120 KB'],
  ['studio', '/studio/[sessionId]/page', '450 KB'],
]) {
  const chunks = [
    ...new Set([
      ...manifest.pages['/layout'],
      ...(manifest.pages['/not-found'] ?? []),
      ...(manifest.pages['/error'] ?? []),
      ...manifest.pages[route],
    ]),
  ].filter((file) => file.endsWith('.js'));
  const files = chunks.map((file) => root + file);
  let gzipBytes = 0;
  for (const file of files) gzipBytes += gzipSync(await readFile(file)).length;
  const cap = Number.parseInt(limit, 10) * 1000;
  routes.push({ name, limit, gzipBytes, files });
  if (gzipBytes > cap)
    throw new Error(`${name}: ${gzipBytes} gzip bytes exceeds ${cap}`);
}
await writeFile(
  'docs/bundle-budget.json',
  JSON.stringify({ measuredAt: new Date().toISOString(), routes }, null, 2) +
    '\n',
);
console.log(
  routes
    .map(
      (r) =>
        `${r.name}: ${(r.gzipBytes / 1000).toFixed(1)} KB gzip / ${r.limit}`,
    )
    .join('\n'),
);
