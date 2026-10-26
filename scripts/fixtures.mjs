import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Fixtures are checked in. A missing file is restored from its published source.
const root = new URL('../packages/mock-server/fixtures/', import.meta.url);
const manifest = JSON.parse(
  await readFile(new URL('manifest.json', root), 'utf8'),
);
await mkdir(fileURLToPath(root), { recursive: true });
for (const item of manifest) {
  const destination = new URL(item.name, root);
  let bytes;
  try {
    bytes = await readFile(destination);
  } catch {
    const response = await fetch(item.url, {
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok)
      throw new Error(
        `Fixture download failed (${response.status}): ${item.url}`,
      );
    bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(destination, bytes);
  }
  if (createHash('sha256').update(bytes).digest('hex') !== item.sha256)
    throw new Error(`Fixture checksum mismatch: ${item.name}`);
}
console.log(`kimo: ${manifest.length} CC0 fixtures verified`);
