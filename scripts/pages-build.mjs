import { mkdir, writeFile, cp } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
// A generated static entrypoint keeps local Next SSR and its metadata intact.
const root = path.resolve('apps/web/.pages-build');
await mkdir(root + '/app', { recursive: true });
await writeFile(root + '/package.json', JSON.stringify({ private: true }));
await writeFile(
  root + '/tsconfig.json',
  JSON.stringify({
    extends: '../tsconfig.json',
    compilerOptions: {
      baseUrl: '.',
      paths: { '@/*': ['../src/*'] },
      incremental: false,
    },
    include: ['app/**/*.tsx', '.next/types/**/*.ts'],
    exclude: ['node_modules'],
  }),
);
await writeFile(
  root + '/next.config.mjs',
  `export default { output: 'export', trailingSlash: true, images: { unoptimized: true }, transpilePackages: ['@kimo/client', '@kimo/compositor'], poweredByHeader: false, webpack(config) { config.cache = false; return config; }, outputFileTracingRoot: ${JSON.stringify(path.resolve('.'))} };`,
);
await writeFile(
  root + '/app/layout.tsx',
  `export { default, metadata } from '../../src/app/layout';`,
);
await writeFile(
  root + '/app/page.tsx',
  `export { default } from '../../src/app/page';`,
);
await writeFile(
  root + '/app/error.tsx',
  `"use client"; export { default } from '../../src/app/error';`,
);
await mkdir(root + '/app/privacy', { recursive: true });
await writeFile(
  root + '/app/privacy/page.tsx',
  `export { default, metadata } from '../../../src/app/privacy/page';`,
);
for (const kind of ['studio', 'warmup', 'render']) {
  await mkdir(`${root}/app/${kind}/shell`, { recursive: true });
  await writeFile(
    `${root}/app/${kind}/shell/page.tsx`,
    `import { PagesRoute } from '@/components/pages-route'; export const metadata = { robots: { index: false, follow: false } }; export default function Page() { return <PagesRoute kind="${kind}" />; }`,
  );
}
// Old share links: kimo no longer hosts videos, so /v/* is a static notice.
await mkdir(`${root}/app/v/shell`, { recursive: true });
await writeFile(
  `${root}/app/v/shell/page.tsx`,
  `export { default, metadata } from '../../../../src/app/v/[videoId]/page';`,
);
await cp('apps/web/public', root + '/public', { recursive: true });
const result = spawnSync(
  process.execPath,
  ['apps/web/node_modules/next/dist/bin/next', 'build', root],
  { stdio: 'inherit', env: { ...process.env, NEXT_PUBLIC_PAGES_EXPORT: '1' } },
);
if (result.status) process.exit(result.status);
await cp('deploy/_redirects', root + '/out/_redirects');
let headers = await (
  await import('node:fs/promises')
).readFile('deploy/_headers', 'utf8');
const api = new URL(process.env.NEXT_PUBLIC_KIMO_API ?? 'http://localhost:8787')
  .origin;
const ws = new URL(process.env.NEXT_PUBLIC_KIMO_WS ?? 'ws://localhost:8787')
  .origin;
for (const [placeholder, replacement] of [
  ['https://API_HOST.invalid', api],
  ['wss://WS_HOST.invalid', ws],
  ['https://R2_HOST.invalid', process.env.NEXT_PUBLIC_R2_ORIGIN],
  ['https://POSTHOG_HOST.invalid', process.env.NEXT_PUBLIC_POSTHOG_HOST],
  [
    'https://SENTRY_HOST.invalid',
    process.env.NEXT_PUBLIC_SENTRY_DSN
      ? new URL(process.env.NEXT_PUBLIC_SENTRY_DSN).origin
      : undefined,
  ],
]) {
  if (replacement)
    headers = headers.replaceAll(placeholder, new URL(replacement).origin);
}
await writeFile(root + '/out/_headers', headers);
await writeFile(
  root + '/out/_routes.json',
  JSON.stringify({ version: 1, include: ['/v/*'], exclude: ['/v/shell/*'] }),
);
