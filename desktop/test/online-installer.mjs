// Windows-hosted integration checks. Never invokes Electron, FFmpeg, or a GPU.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { buildOnline, validatePayload } from '../distribution/build-online.mjs';

if (process.platform !== 'win32') throw Error('Hosted Windows only');
const require = createRequire(import.meta.url);
const root = resolve('distribution-evidence');
await mkdir(root, { recursive: true });
const {
  NSIS_PATH,
  NsisTargetOptions,
  nsisTemplatesDir,
} = require('app-builder-lib/out/targets/nsis/nsisUtil.js');
NsisTargetOptions.resolve({});
const nsis = await NSIS_PATH();
const { getBinFromUrl } = require('app-builder-lib/out/binDownload.js');
const resources = await getBinFromUrl(
  'nsis-resources',
  '3.4.1',
  'Dqd6g+2buwwvoG1Vyf6BHR1b+25QMmPcwZx40atOT57gH27rkjOei1L0JTldxZu4NFoEmW4kJgZ3DlSWVON3+Q==',
);
const fixture = join(root, 'fixture-payload.exe');
const compiled = spawnSync(
  join(nsis, 'Bin/makensis.exe'),
  [
    '-WX',
    `-X!addincludedir "${join(nsisTemplatesDir, 'include')}"`,
    `-X!addplugindir /x86-unicode "${join(resources, 'plugins/x86-unicode')}"`,
    `-DFIXTURE_EXE=${fixture}`,
    resolve('desktop/distribution/fixture.nsi'),
  ],
  { stdio: 'inherit', env: { ...process.env, NSISDIR: nsis } },
);
assert.equal(compiled.status, 0);
const payload = await readFile(fixture);
const requests = [];
const server = createServer((req, res) => {
  requests.push(req.url);
  if (req.url === '/payload') {
    res.writeHead(200, { 'Content-Length': payload.length });
    res.end(payload);
  } else if (req.url === '/tampered') {
    const bad = Buffer.from(payload);
    bad[bad.length - 1] ^= 1;
    res.writeHead(200, { 'Content-Length': bad.length });
    res.end(bad);
  } else {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}`;
const base = {
  version: '0.4.0',
  file: 'fixture.exe',
  bytes: payload.length,
  sha512: createHash('sha512').update(payload).digest('base64'),
  primary: url + '/missing',
  fallback: url + '/payload',
};
const results = [];
async function install(exe, target, extraEnv = {}) {
  return new Promise((resolveRun, reject) => {
    const started = performance.now();
    const child = spawn(exe, ['/S', `/D=${target}`], {
      windowsHide: true,
      // NSIS requires the final /D argument without wrapping quotes, even
      // when the target contains spaces. Node's normal quoting hides it.
      windowsVerbatimArguments: true,
      env: { ...process.env, ...extraEnv },
      stdio: 'ignore',
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(Error('Setup exceeded 8 minutes'));
    }, 480000);
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolveRun({ code, seconds: (performance.now() - started) / 1000 });
    });
  });
}
async function check(name, p, expectedCode, env) {
  const out = join(root, name),
    target = join(out, 'installed app');
  await mkdir(target, { recursive: true });
  await writeFile(join(target, 'kimo.exe'), 'existing installation sentinel');
  const config = join(out, 'payload.json');
  await writeFile(config, JSON.stringify(p));
  const { exe, proof } = await buildOnline({ out, fixtureConfig: config });
  const outcome = await install(exe, target, env);
  assert.equal(outcome.code, expectedCode, name);
  assert.equal(
    await readFile(join(target, 'kimo.exe'), 'utf8'),
    expectedCode === 0
      ? 'fixture installed by verified payload'
      : 'existing installation sentinel',
  );
  results.push({
    name,
    ...outcome,
    stubBytes: proof.bytes,
    oldInstallPreserved: expectedCode !== 0,
  });
}
try {
  assert.throws(() =>
    validatePayload({ ...base, primary: 'http://attacker.test/app.exe' }),
  );
  assert.throws(() => validatePayload({ ...base, sha512: '' }, true));
  await check('backup-server', base, 0);
  await check(
    'tampered',
    { ...base, primary: url + '/tampered', fallback: url + '/tampered' },
    2,
  );
  await check('missing', { ...base, fallback: url + '/missing' }, 2);
  await check('child-failure', { ...base, primary: url + '/payload' }, 3, {
    KIMO_FIXTURE_FAIL: '1',
  });
  assert(
    requests.includes('/missing') &&
      requests.includes('/payload') &&
      requests.includes('/tampered'),
  );
} finally {
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}

// Real network install: no adjacent payload or local package is supplied. The
// exact published v0.4.0 EXE is fetched and SHA-512 verified by the native stub.
const real = await buildOnline();
const target = join(root, 'actual installed app');
const outcome = await install(real.exe, target);
if (outcome.code !== 0) {
  console.log('Real setup failed:', outcome);
  console.log(
    await readFile(
      join(process.env.TEMP, 'kimo-online-setup-status.txt'),
      'utf8',
    ).catch(() => 'No child-install diagnostic (download or init failed)'),
  );
}
assert.equal(outcome.code, 0, 'Real internet installation');
for (const file of [
  'kimo.exe',
  'resources/app.asar',
  'resources/vendor/ffmpeg/ffmpeg.exe',
])
  assert((await stat(join(target, file))).size > 0, `Installed ${file}`);
const version = spawnSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-Command',
    '(Get-Item -LiteralPath $env:KIMO_INSTALLED_EXE).VersionInfo.ProductVersion',
  ],
  {
    encoding: 'utf8',
    env: { ...process.env, KIMO_INSTALLED_EXE: join(target, 'kimo.exe') },
  },
);
assert.equal(version.status, 0);
assert.match(version.stdout.trim(), /^0\.4\.0(?:\D|$)/);
results.push({
  name: 'real-online-install',
  ...outcome,
  version: version.stdout.trim(),
  stubBytes: real.proof.bytes,
  stubSha256: real.proof.sha256,
  payload: real.proof.payload,
});
await writeFile(
  join(root, 'online-install-tests.json'),
  JSON.stringify({ at: new Date().toISOString(), requests, results }, null, 2) +
    '\n',
);
console.log(JSON.stringify(results));
