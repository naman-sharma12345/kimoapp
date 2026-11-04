// Runs in the installed Electron's Node mode for setup, or in the main process
// for background updates. No downloaded executable is ever launched here.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { createRequire } = require('node:module');
const os = require('node:os');

const CDN = 'https://downloads.getkimo.tech/desktop';
function checkedManifest(p) {
  if (
    !/^\d+\.\d+\.\d+$/.test(p.version) ||
    p.file !== `kimo-Setup-${p.version}.exe` ||
    !Number.isSafeInteger(p.bytes) ||
    p.bytes <= 0 ||
    !/^[A-Za-z0-9+/]{86}==$/.test(p.sha512)
  )
    throw Error('Invalid update manifest');
  if (
    p.maxDeltaBytes !== undefined &&
    (!Number.isSafeInteger(p.maxDeltaBytes) ||
      p.maxDeltaBytes <= 0 ||
      p.maxDeltaBytes > 128 * 1024 * 1024)
  )
    throw Error('Invalid incremental byte limit');
  if (p.primary !== `${CDN}/v${p.version}/${p.file}`)
    throw Error('Invalid update server');
  return p;
}
async function responseBytes(response, limit, onBytes = () => {}) {
  const chunks = [];
  let bytes = 0;
  if (!response.body) throw Error('Empty update response');
  try {
    for await (const chunk of response.body) {
      bytes += chunk.length;
      onBytes(chunk.length);
      if (bytes > limit) throw Error('Update response exceeds its byte limit');
      chunks.push(chunk);
    }
  } catch (error) {
    await response.body.cancel().catch(() => {});
    throw error;
  }
  return Buffer.concat(chunks, bytes);
}
async function reconstruct(options) {
  const p = checkedManifest(options.manifest);
  const resources =
    options.resources ?? path.join(path.dirname(process.execPath), 'resources');
  const installedRequire = createRequire(
    path.join(resources, 'app.asar/package.json'),
  );
  const fromVersion =
    options.fromVersion ?? installedRequire('./package.json').version;
  if (!/^\d+\.\d+\.\d+$/.test(fromVersion))
    throw Error('Unsupported installed version');
  if (fromVersion === p.version && options.allowAlreadyCurrent)
    return { alreadyCurrent: true, networkBytes: 0, reusedBytes: p.bytes };
  const compare = fromVersion.split('.').map(Number),
    target = p.version.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (compare[i] > target[i])
      return { alreadyCurrent: true, networkBytes: 0, newerInstalled: true };
    if (compare[i] < target[i]) break;
  }
  const computeOperations =
    options.computeOperations ??
    installedRequire(
      'electron-updater/out/differentialDownloader/downloadPlanBuilder.js',
    ).computeOperations;
  const config = options.cacheDir
    ? null
    : await fsp.readFile(path.join(resources, 'app-update.yml'), 'utf8');
  const cacheName = config?.match(
    /^updaterCacheDirName:\s*([A-Za-z0-9._-]+)\s*$/m,
  )?.[1];
  if (!options.cacheDir && !cacheName)
    throw Error('Installed updater cache is unavailable');
  const base =
    options.baseFile ??
    path.join(
      options.cacheDir ?? path.join(process.env.LOCALAPPDATA, cacheName),
      'installer.exe',
    );
  const baseStat = await fsp.stat(base);
  if (!baseStat.isFile()) throw Error('Cached installer is unavailable');
  const request = options.request ?? fetch;
  const signal = options.signal ?? AbortSignal.timeout(240000);
  let networkBytes = 0;
  async function map(version) {
    const url = `${CDN}/v${version}/kimo-Setup-${version}.exe.blockmap`;
    const response = await request(url, { signal });
    if (response.status !== 200) {
      await response.body?.cancel();
      throw Error('Update block map is unavailable');
    }
    const data = await responseBytes(
      response,
      2 * 1024 * 1024,
      (n) => (networkBytes += n),
    );
    if (
      version === p.version &&
      p.blockmapSha256 &&
      crypto.createHash('sha256').update(data).digest('hex') !==
        p.blockmapSha256
    )
      throw Error('Update block map checksum mismatch');
    return JSON.parse(
      zlib.gunzipSync(data, { maxOutputLength: 16 * 1024 * 1024 }),
    );
  }
  const oldMap = await map(fromVersion),
    newMap = await map(p.version);
  if (
    oldMap.version !== newMap.version ||
    oldMap.files.length !== 1 ||
    newMap.files.length !== 1
  )
    throw Error('Unsupported update block map');
  const oldSize =
    oldMap.files[0].offset + oldMap.files[0].sizes.reduce((n, v) => n + v, 0);
  if (oldSize !== baseStat.size)
    throw Error('Cached installer does not match the installed version');
  const operations = computeOperations(oldMap, newMap, {
    info() {},
    warn() {},
  });
  let downloadBytes = 0,
    reusedBytes = 0;
  for (const op of operations) {
    if (
      ![0, 1].includes(op.kind) ||
      !Number.isSafeInteger(op.start) ||
      !Number.isSafeInteger(op.end) ||
      op.start < 0 ||
      op.end <= op.start ||
      op.end > (op.kind === 0 ? baseStat.size : p.bytes)
    )
      throw Error('Unsafe update block range');
    if (op.kind === 1) downloadBytes += op.end - op.start;
    else reusedBytes += op.end - op.start;
  }
  if (downloadBytes + reusedBytes !== p.bytes)
    throw Error('Update plan size mismatch');
  if (
    downloadBytes > Math.min(p.maxDeltaBytes ?? 64 * 1024 * 1024, p.bytes * 0.8)
  )
    throw Error('A small incremental update is unavailable');
  options.onProgress?.({
    downloaded: 0,
    total: downloadBytes,
    networkBytes,
    reusedBytes,
  });
  const output = options.output,
    partial = output + '.partial';
  const source = await fsp.open(base, 'r');
  let destination;
  const hash = crypto.createHash('sha512'),
    buffer = Buffer.alloc(1024 * 1024);
  let position = 0,
    downloaded = 0;
  async function write(data) {
    let at = 0;
    while (at < data.length) {
      const { bytesWritten } = await destination.write(
        data,
        at,
        data.length - at,
        position,
      );
      if (!bytesWritten) throw Error('Update disk write failed');
      at += bytesWritten;
      position += bytesWritten;
    }
    hash.update(data);
  }
  try {
    await fsp.mkdir(path.dirname(output), { recursive: true });
    destination = await fsp.open(partial, 'w');
    for (const op of operations) {
      signal.throwIfAborted();
      if (op.kind === 0) {
        for (let offset = op.start; offset < op.end;) {
          const { bytesRead } = await source.read(
            buffer,
            0,
            Math.min(buffer.length, op.end - offset),
            offset,
          );
          if (!bytesRead) throw Error('Cached installer is truncated');
          await write(buffer.subarray(0, bytesRead));
          offset += bytesRead;
        }
      } else {
        // Bound each response independently; a server ignoring Range is rejected
        // at its headers, before a full installer body can be consumed.
        for (let start = op.start; start < op.end; start += 1024 * 1024) {
          const end = Math.min(op.end, start + 1024 * 1024) - 1;
          const response = await request(p.primary, {
            signal,
            headers: { Range: `bytes=${start}-${end}` },
          });
          if (
            response.status !== 206 ||
            response.headers.get('Content-Range') !==
              `bytes ${start}-${end}/${p.bytes}`
          ) {
            await response.body?.cancel();
            throw Error('Update server did not honor the bounded range');
          }
          const data = await responseBytes(
            response,
            end - start + 1,
            (n) => (networkBytes += n),
          );
          if (data.length !== end - start + 1)
            throw Error('Truncated update range');
          await write(data);
          downloaded += data.length;
          options.onProgress?.({
            downloaded,
            total: downloadBytes,
            networkBytes,
            reusedBytes,
          });
        }
      }
    }
    if (position !== p.bytes || hash.digest('base64') !== p.sha512)
      throw Error('Reconstructed installer checksum mismatch');
    await destination.close();
    destination = null;
    await fsp.rename(partial, output);
    return {
      fromVersion,
      toVersion: p.version,
      networkBytes,
      downloadBytes,
      reusedBytes,
      outputBytes: position,
      sha512: p.sha512,
    };
  } catch (error) {
    await destination?.close().catch(() => {});
    destination = null;
    await fsp.unlink(partial).catch(() => {});
    throw error;
  } finally {
    await source.close();
  }
}
module.exports = { reconstruct, checkedManifest };
if (require.main === module) {
  try {
    os.setPriority(process.pid, os.constants.priority.PRIORITY_BELOW_NORMAL);
  } catch {}
  const root = __dirname;
  reconstruct({
    manifest: JSON.parse(
      fs.readFileSync(path.join(root, 'payload.json'), 'utf8'),
    ),
    allowAlreadyCurrent:
      Boolean(process.argv[2]) &&
      path.resolve(process.argv[2]).toLowerCase() ===
        path.dirname(process.execPath).toLowerCase(),
    output: path.join(root, 'kimo-verified-setup.exe'),
    onProgress: (p) =>
      console.log(
        `update: ${p.downloaded} / ${p.total} bytes; reusing ${p.reusedBytes} bytes locally`,
      ),
  })
    .then(async (proof) => {
      await fsp.writeFile(
        path.join(root, 'delta-proof.json'),
        JSON.stringify(proof, null, 2),
      );
      console.log(JSON.stringify(proof));
      process.exitCode = proof.alreadyCurrent ? 10 : 0;
    })
    .catch((error) => {
      console.error(`Small update unavailable: ${error.message}`);
      process.exitCode = 2;
    });
}
