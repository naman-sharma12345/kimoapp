import { readFile, stat, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const {
  parseUpdateInfo,
  getFileList,
} = require('electron-updater/out/providers/Provider.js');
export async function verifyRelease(dir, version = '0.4.0') {
  const yaml = await readFile(join(dir, 'latest.yml'), 'utf8'),
    info = parseUpdateInfo(
      yaml,
      'latest.yml',
      new URL(
        'https://github.com/naman-sharma12345/kimoapp/releases/latest/download/latest.yml',
      ),
    ),
    files = getFileList(info),
    name = `kimo-Setup-${version}.exe`;
  if (
    info.version !== version ||
    files.length !== 1 ||
    files[0].url !== name ||
    info.path !== name
  )
    throw new Error('Release feed version/filename mismatch');
  if (basename(files[0].url) !== files[0].url)
    throw new Error('Release path must be an installer filename');
  const installer = join(dir, name),
    size = (await stat(installer)).size,
    hash = createHash('sha512');
  for await (const chunk of createReadStream(installer)) hash.update(chunk);
  const sha512 = hash.digest('base64');
  if (
    files[0].size !== size ||
    files[0].sha512 !== sha512 ||
    info.sha512 !== sha512
  )
    throw new Error('Release feed size/SHA512 mismatch');
  if ((await stat(installer + '.blockmap')).size === 0)
    throw new Error('Empty installer blockmap');
  return {
    version,
    installer: name,
    size,
    sha512,
    blockmap: name + '.blockmap',
    feed: 'latest.yml',
    parser: 'electron-updater provider parseUpdateInfo/getFileList',
    upgradeFrom:
      version === '0.4.0' ? '0.3.2' : version === '0.4.1' ? '0.4.0' : '0.4.1',
    upgradeAvailable: true,
    scope:
      'Actual feed parser and installer bytes verified. Interactive restart/installation over an existing user profile requires the documented manual test.',
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const dir = resolve(process.argv[2] ?? 'desktop/dist'),
    proof = await verifyRelease(
      dir,
      process.argv[3] ?? require('../package.json').version,
    );
  await writeFile(
    join(dir, 'release-verification.json'),
    JSON.stringify(proof, null, 2) + '\n',
  );
  console.log(JSON.stringify(proof));
}
