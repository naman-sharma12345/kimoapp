// Run on a hosted Windows runner. Reuses the pinned NSIS/compiler plug-ins
// already provided by electron-builder; no Electron/media build is necessary.
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
export function validatePayload(p, fixture = false) {
  if (!/^\d+\.\d+\.\d+$/.test(p.version)) throw Error('Invalid version');
  if (!Number.isSafeInteger(p.bytes) || p.bytes <= 0 || p.bytes >= 2 ** 31)
    throw Error('Invalid payload size');
  if (!/^[A-Za-z0-9+/]{86}==$/.test(p.sha512)) throw Error('Invalid SHA-512');
  for (const u of [p.primary, p.fallback]) {
    if (typeof u !== 'string' || /["$\s]/.test(u)) throw Error('Unsafe URL');
    const url = new URL(u);
    const github = `https://github.com/naman-sharma12345/kimoapp/releases/download/v${p.version}/${p.file}`;
    const cdn = `https://downloads.getkimo.tech/desktop/v${p.version}/${p.file}`;
    if (!fixture && u !== github && u !== cdn) throw Error('Unapproved server');
    if (fixture && !['127.0.0.1', 'localhost'].includes(url.hostname))
      throw Error('Fixture must use localhost');
  }
  if (!fixture && p.file !== `kimo-Setup-${p.version}.exe`)
    throw Error('Invalid release filename');
  return p;
}

export async function buildOnline({ out, fixtureConfig } = {}) {
  if (process.platform !== 'win32') throw Error('Build on a Windows runner');
  const fixture = Boolean(fixtureConfig);
  const p = validatePayload(
    JSON.parse(
      await readFile(fixtureConfig ?? join(here, 'payload.json'), 'utf8'),
    ),
    fixture,
  );
  const pkg = require('../package.json');
  if (!fixture && p.version !== pkg.version) throw Error('Version mismatch');
  if (require('app-builder-lib/package.json').version !== '25.1.8')
    throw Error('Requalify the NSIS toolchain before changing builder version');
  const {
    NSIS_PATH,
    NsisTargetOptions,
    nsisTemplatesDir,
  } = require('app-builder-lib/out/targets/nsis/nsisUtil.js');
  const { getBinFromUrl } = require('app-builder-lib/out/binDownload.js');
  const { UUID } = require('builder-util-runtime');
  NsisTargetOptions.resolve({});
  const nsis = await NSIS_PATH();
  const resources = await getBinFromUrl(
    'nsis-resources',
    '3.4.1',
    'Dqd6g+2buwwvoG1Vyf6BHR1b+25QMmPcwZx40atOT57gH27rkjOei1L0JTldxZu4NFoEmW4kJgZ3DlSWVON3+Q==',
  );
  out = resolve(out ?? join(here, '../dist-online'));
  await mkdir(out, { recursive: true });
  const exe = join(
    out,
    fixture ? 'kimo-online-fixture.exe' : `kimo-Online-Setup-${p.version}.exe`,
  );
  const guid = UUID.v5(
    pkg.build.appId,
    UUID.parse('50e065bc-3134-11e6-9bab-38c9862bdaf3'),
  );
  const defines = {
    APP_VERSION: p.version,
    APP_GUID: fixture ? `fixture-${guid}` : guid,
    OUTPUT_EXE: exe,
    PAYLOAD_BYTES: p.bytes,
    PAYLOAD_MB: Math.round(p.bytes / 1e6),
    PAYLOAD_SHA512: Buffer.from(p.sha512, 'base64')
      .toString('hex')
      .toUpperCase(),
    PRIMARY_URL: p.primary,
    FALLBACK_URL: p.fallback,
  };
  const header = Object.entries(defines)
    .map(([k, v]) => `!define ${k} "${v}"`)
    .join('\n');
  await writeFile(join(out, 'defines.nsh'), header + '\n');
  const run = spawnSync(
    join(nsis, 'Bin/makensis.exe'),
    [
      '-WX',
      '-INPUTCHARSET',
      'UTF8',
      `-X!addincludedir "${out}"`,
      `-X!addincludedir "${join(nsisTemplatesDir, 'include')}"`,
      `-X!addplugindir /x86-unicode "${join(resources, 'plugins/x86-unicode')}"`,
      join(here, 'online.nsi'),
    ],
    { stdio: 'inherit', env: { ...process.env, NSISDIR: nsis } },
  );
  if (run.error || run.status !== 0)
    throw run.error ?? Error('NSIS compilation failed');
  const bytes = (await stat(exe)).size;
  if (bytes > 2_000_000) throw Error(`Online setup exceeds 2 MB: ${bytes}`);
  const proof = {
    version: p.version,
    file: exe.split(/[\\/]/).at(-1),
    bytes,
    sha256: createHash('sha256')
      .update(await readFile(exe))
      .digest('hex'),
    payload: p,
    fixture,
    builtAt: new Date().toISOString(),
  };
  await writeFile(
    join(out, 'online-verification.json'),
    JSON.stringify(proof, null, 2) + '\n',
  );
  console.log(JSON.stringify(proof));
  return { exe, proof };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await buildOnline();
