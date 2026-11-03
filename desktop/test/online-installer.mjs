// Windows-hosted integration checks. The installed Electron runs only the Node
// delta helper; no app window, FFmpeg render or GPU test is started.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir, stat, rename } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
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
async function install(exe, target, extraEnv = {}, builderPayload = false) {
  return new Promise((resolveRun, reject) => {
    const started = performance.now();
    const directoryArg = builderPayload ? `"/D=${target}"` : `/D=${target}`;
    const child = spawn(exe, target ? ['/S', directoryArg] : ['/S'], {
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
function fixtureRegistry(target) {
  const { UUID } = require('builder-util-runtime');
  const guid = UUID.v5(
    'tech.getkimo.desktop',
    UUID.parse('50e065bc-3134-11e6-9bab-38c9862bdaf3'),
  );
  const run = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      "$root=[Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::CurrentUser,[Microsoft.Win32.RegistryView]::Registry64); $key=$root.CreateSubKey($env:KIMO_FIXTURE_KEY); if ($env:KIMO_FIXTURE_TARGET) {$key.SetValue('InstallLocation',$env:KIMO_FIXTURE_TARGET)} else {$key.DeleteValue('InstallLocation',$false)}; $key.Close(); $root.Close()",
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        KIMO_FIXTURE_KEY: `Software\\fixture-${guid}`,
        KIMO_FIXTURE_TARGET: target ?? '',
      },
    },
  );
  assert.equal(run.status, 0, run.stderr);
}
async function check(name, p, expectedCode, env, registered = false) {
  const out = join(root, name),
    target = join(out, 'installed app');
  await mkdir(target, { recursive: true });
  await writeFile(join(target, 'kimo.exe'), 'existing installation sentinel');
  const config = join(out, 'payload.json');
  await writeFile(config, JSON.stringify(p));
  const { exe, proof } = await buildOnline({ out, fixtureConfig: config });
  let outcome;
  if (registered) fixtureRegistry(target);
  try {
    outcome = await install(exe, registered ? undefined : target, env);
  } finally {
    if (registered) fixtureRegistry();
  }
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
  await check('registered-upgrade-path', base, 0, {}, true);
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

// Real network install: the current native stub gets no adjacent target payload.
// Upgrade checks seed the previous public installer, then require bounded delta
// transfer and an exact SHA-512 before the native child installer can run.
const real = await buildOnline();
const target = join(root, 'actual installed app');
let profilePath, profileValue;
if (real.proof.version !== '0.4.0') {
  const priorVersion =
    real.proof.version === '0.4.1'
      ? '0.4.0'
      : real.proof.version === '0.4.2'
        ? '0.4.1'
        : '0.4.2';
  const legacy = JSON.parse(
    await readFile(
      resolve(`desktop/distribution/payload-${priorVersion}.json`),
      'utf8',
    ),
  );
  const response = await fetch(legacy.primary, {
    signal: AbortSignal.timeout(240000),
  });
  assert.equal(response.status, 200);
  const oldSetup = join(root, legacy.file);
  const hash = createHash('sha512');
  let bytes = 0;
  await pipeline(
    Readable.fromWeb(response.body),
    async function* (source) {
      for await (const chunk of source) {
        bytes += chunk.length;
        hash.update(chunk);
        yield chunk;
      }
    },
    createWriteStream(oldSetup),
  );
  assert.equal(bytes, legacy.bytes);
  assert.equal(hash.digest('base64'), legacy.sha512);
  const oldInstall = await install(oldSetup, target, {}, true);
  assert.equal(
    oldInstall.code,
    0,
    'Install the prior version at the upgrade destination',
  );
  profilePath = join(
    process.env.APPDATA,
    'kimo/projects/hotfix-upgrade-fixture/checkpoint.json',
  );
  await mkdir(join(profilePath, '..'), { recursive: true });
  profileValue = JSON.stringify({
    version: 1,
    stage: 'compiled',
    fixture: 'Preserve saved edit through the version upgrade',
  });
  await writeFile(profilePath, profileValue);
  results.push({
    name: 'prior-version-installed',
    version: priorVersion,
    ...oldInstall,
  });
  if (real.proof.version === '0.4.3') {
    const cached = join(
      process.env.LOCALAPPDATA,
      'kimo-desktop-updater/installer.exe',
    );
    const held = cached + '.qualification-held';
    const oldAsar = createHash('sha256')
      .update(await readFile(join(target, 'resources/app.asar')))
      .digest('hex');
    await rename(cached, held);
    try {
      const missingBase = await install(real.exe, target);
      assert.equal(
        missingBase.code,
        2,
        'Silent setup refuses a full fallback when the cached base is missing',
      );
      assert.equal(
        createHash('sha256')
          .update(await readFile(join(target, 'resources/app.asar')))
          .digest('hex'),
        oldAsar,
      );
      results.push({
        name: 'missing-base-no-full-fallback',
        ...missingBase,
        oldAppUnchanged: true,
      });
    } finally {
      await rename(held, cached);
    }
  }
}
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
let transfer;
if (real.proof.version === '0.4.3') {
  transfer = JSON.parse(
    await readFile(
      join(
        process.env.LOCALAPPDATA,
        'kimo/installers/last-update-transfer.json',
      ),
      'utf8',
    ),
  );
  assert.equal(transfer.fromVersion, '0.4.2');
  assert.equal(transfer.toVersion, real.proof.version);
  assert(
    transfer.networkBytes < 10 * 1024 * 1024,
    'Code-only update must transfer less than 10 MB including maps',
  );
  assert(
    transfer.reusedBytes > real.proof.payload.bytes * 0.9,
    'Reuse the installed tools/models/runtime blocks',
  );
  assert.equal(transfer.sha512, real.proof.payload.sha512);
}
if (profilePath)
  assert.equal(
    await readFile(profilePath, 'utf8'),
    profileValue,
    'Saved project survives the app upgrade',
  );
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
assert.match(
  version.stdout.trim(),
  new RegExp('^' + real.proof.version.replaceAll('.', '\\.') + '(?:\\D|$)'),
);
results.push({
  name: 'real-online-install',
  ...outcome,
  version: version.stdout.trim(),
  stubBytes: real.proof.bytes,
  stubSha256: real.proof.sha256,
  payload: real.proof.payload,
  savedProjectPreserved: Boolean(profilePath),
  transfer,
});
await writeFile(
  join(root, 'online-install-tests.json'),
  JSON.stringify({ at: new Date().toISOString(), requests, results }, null, 2) +
    '\n',
);
console.log(JSON.stringify(results));
