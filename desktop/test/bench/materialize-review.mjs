// Copy already-rendered MP4 bytes from a verified local artifact ZIP. No media decoding/rendering.
import {
  open,
  readFile,
  mkdir,
  stat,
  rename,
  copyFile,
  writeFile,
} from 'node:fs/promises';
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { lowerPriority } from '../../resources.cjs';
import { readJson, writeJson, hashFile } from './io.mjs';
import { writeReview, reviewHtml } from './report.mjs';

lowerPriority(process.pid);
const [archiveArg, evidenceArg, id] = process.argv.slice(2);
if (
  !archiveArg ||
  !evidenceArg ||
  !/^(TH-[12]|TUT-1|VLOG-1|POD-1|MUSIC-1)$/.test(id)
)
  throw new Error(
    'Usage: materialize-review.mjs VERIFIED_ZIP CASE_EVIDENCE_DIRECTORY RAW_CASE_ID',
  );
const archive = resolve(archiveArg),
  evidence = resolve(evidenceArg);
const proof = await readJson(archive + '.json');
if (
  !proof.apiDigestVerified ||
  (await stat(archive)).size !== proof.size ||
  proof.name !== `raw-v2-comparison-41189542616-${id}`
)
  throw new Error('Expected the verified final clean artifact archive');
const file = await open(archive, 'r');
try {
  const read = async (at, length) => {
    const b = Buffer.alloc(length);
    const r = await file.read(b, 0, length, at);
    if (r.bytesRead !== length) throw new Error('Truncated ZIP header');
    return b;
  };
  const tailAt = Math.max(0, proof.size - 65557),
    tail = await read(tailAt, proof.size - tailAt);
  let end = -1;
  for (let i = tail.length - 22; i >= 0; i--)
    if (
      tail.readUInt32LE(i) === 0x06054b50 &&
      i + 22 + tail.readUInt16LE(i + 20) === tail.length
    ) {
      end = i;
      break;
    }
  if (end < 0) throw new Error('ZIP end record missing');
  let size = tail.readUInt32LE(end + 12),
    at = tail.readUInt32LE(end + 16);
  if (size === 0xffffffff || at === 0xffffffff) {
    if (tail.readUInt32LE(end - 20) !== 0x07064b50)
      throw new Error('ZIP64 locator missing');
    const z = await read(Number(tail.readBigUInt64LE(end - 12)), 56);
    if (z.readUInt32LE(0) !== 0x06064b50) throw new Error('ZIP64 end missing');
    size = Number(z.readBigUInt64LE(40));
    at = Number(z.readBigUInt64LE(48));
  }
  if (size > 8 * 1024 * 1024 || at + size > proof.size)
    throw new Error('Unsafe ZIP directory');
  const directory = await read(at, size),
    entries = new Map();
  for (let p = 0; p < directory.length;) {
    if (directory.readUInt32LE(p) !== 0x02014b50)
      throw new Error('Invalid ZIP directory');
    const n = directory.readUInt16LE(p + 28),
      x = directory.readUInt16LE(p + 30),
      c = directory.readUInt16LE(p + 32);
    const name = directory.toString('utf8', p + 46, p + 46 + n);
    let compressed = directory.readUInt32LE(p + 20),
      plain = directory.readUInt32LE(p + 24),
      offset = directory.readUInt32LE(p + 42);
    for (let q = p + 46 + n, limit = q + x; q < limit;) {
      const tag = directory.readUInt16LE(q),
        length = directory.readUInt16LE(q + 2);
      if (tag === 1) {
        let z = q + 4;
        if (plain === 0xffffffff) {
          plain = Number(directory.readBigUInt64LE(z));
          z += 8;
        }
        if (compressed === 0xffffffff) {
          compressed = Number(directory.readBigUInt64LE(z));
          z += 8;
        }
        if (offset === 0xffffffff)
          offset = Number(directory.readBigUInt64LE(z));
      }
      q += 4 + length;
    }
    entries.set(name, {
      plain,
      compressed,
      offset,
      method: directory.readUInt16LE(p + 10),
    });
    p += 46 + n + x + c;
  }
  for (const aspect of ['9x16', '16x9']) {
    const dir = join(evidence, aspect),
      target = join(dir, 'final.mp4'),
      run = await readJson(join(dir, 'run.json'));
    if (
      run.commit !== '9fa6f21722768738562b18d95b618da8a01351bf' ||
      run.clip !== id ||
      run.dataset !== 'raw-v2' ||
      run.networkAttempts !== 0 ||
      run.reservedUsdDelta !== 0 ||
      !run.composed
    )
      throw new Error('Wrong final clean run');
    const member = `${aspect}/final.mp4`,
      entry = entries.get(member);
    if (!entry || entry.method !== 0 || entry.plain !== entry.compressed)
      throw new Error('Expected a stored final MP4 member');
    await mkdir(dir, { recursive: true });
    if (existsSync(target)) {
      if ((await hashFile(target)) !== run.finalHash)
        throw new Error('Existing local final video differs');
    } else {
      const header = await read(entry.offset, 30);
      if (header.readUInt32LE(0) !== 0x04034b50)
        throw new Error('Invalid local ZIP header');
      const start =
          entry.offset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28),
        end = start + entry.plain - 1;
      if (start < 0 || end >= proof.size)
        throw new Error('MP4 member exceeds archive');
      let bytes = 0;
      const sha = createHash('sha256');
      await pipeline(
        createReadStream(archive, { start, end }),
        new Transform({
          transform(chunk, _, next) {
            bytes += chunk.length;
            sha.update(chunk);
            next(null, chunk);
          },
        }),
        createWriteStream(target + '.partial'),
      );
      if (bytes !== entry.plain || sha.digest('hex') !== run.finalHash)
        throw new Error('Final MP4 byte count/SHA256 mismatch');
      await rename(target + '.partial', target);
    }
    const metricPath = join(dir, 'compose-metrics-v4.json'),
      metrics = await readJson(metricPath);
    if (metrics.version !== 4)
      throw new Error('Expected corrected version4 metrics');
    const ops = (await readFile(join(dir, 'ops.jsonl'), 'utf8'))
      .split(/\r?\n/)
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    await copyFile(metricPath, join(dir, 'metrics.json'));
    await writeReview(dir, {
      title: `${id} ${aspect} — clean full-resolution output`,
      metrics,
      ops,
    });
    const creditLink =
      '<p><a href="CREDITS.txt">Source credits and licences</a></p><h2>Edit decisions</h2>';
    const fullReview = await readFile(join(dir, 'review.html'), 'utf8');
    await writeFile(
      join(dir, 'review.html'),
      fullReview.replace('<h2>Edit decisions</h2>', creditLink),
    );
    await writeFile(
      join(dir, 'review-preview.html'),
      reviewHtml({
        title: `${id} ${aspect} — ten-second preview only`,
        metrics,
        ops,
      })
        .replace('src="final.mp4"', 'src="strip.mp4"')
        .replace('<h2>Edit decisions</h2>', creditLink),
    );
    await writeJson(join(dir, 'full-video-preservation.json'), {
      archiveId: proof.id,
      archiveDigest: proof.digest,
      member,
      bytes: entry.plain,
      sha256: run.finalHash,
      verified: true,
      scope:
        'Byte-preserving local extraction and SHA256 verification only. No footage decoded, rendered, analysed or fully played on this PC.',
    });
    console.log(
      JSON.stringify({
        id,
        aspect,
        bytes: entry.plain,
        sha256Verified: true,
        review: join(dir, 'review.html'),
      }),
    );
  }
} finally {
  await file.close();
}
