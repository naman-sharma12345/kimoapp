import type { IncomingMessage, ServerResponse } from 'node:http';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import {
  MAX_UPLOAD_BYTES,
  MULTIPART_THRESHOLD,
  UPLOAD_PART_BYTES,
  uploadParts,
  uploadRequestSchema,
  uploadCompletionSchema,
  type UploadTarget,
} from '@kimo/client';

type Entry = {
  name: string;
  size: number;
  mime: string;
  ready: boolean;
  expires: number;
  parts: Map<number, string>;
};
export function createUploads(dataDir: string, fail: string | undefined) {
  const entries = new Map<string, Entry>();
  function target(assetId: string, base: string): UploadTarget {
    const entry = entries.get(assetId);
    if (!entry) throw new Error('Unknown upload');
    const common = { assetId, headers: { 'Content-Type': entry.mime } };
    return entry.size > MULTIPART_THRESHOLD
      ? {
          ...common,
          parts: uploadParts(entry.size).map(({ partNumber }) => ({
            partNumber,
            putUrl: `${base}/mock-r2/${assetId}/${partNumber}`,
          })),
        }
      : { ...common, putUrl: `${base}/mock-r2/${assetId}` };
  }
  async function handle(
    request: IncomingMessage,
    response: ServerResponse,
    path: string,
    base: string,
    jsonBody: () => Promise<unknown>,
  ) {
    const send = (status: number, data: unknown) => {
      response.writeHead(status, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(data));
    };
    const reject = (status: number, code: string, message: string) =>
      send(status, { code, message });
    if (path === '/v1/uploads' && request.method === 'POST') {
      const { files } = uploadRequestSchema.parse(await jsonBody());
      if (
        files.length > 30 ||
        files.some((file) => file.size > MAX_UPLOAD_BYTES) ||
        files.reduce((sum, file) => sum + file.size, 0) > 5 * 1024 ** 3
      ) {
        reject(413, 'upload_too_large', 'Upload limits exceeded');
        return true;
      }
      send(200, {
        uploads: files.map((file) => {
          const assetId = randomUUID();
          entries.set(assetId, {
            ...file,
            ready: false,
            expires: Date.now() + 900_000,
            parts: new Map(),
          });
          return target(assetId, base);
        }),
      });
      return true;
    }
    const action = /^\/v1\/uploads\/([^/]+)\/(renew|complete)$/.exec(path);
    if (action && request.method === 'POST') {
      const assetId = action[1] ?? '';
      const entry = entries.get(assetId);
      if (!entry) {
        reject(404, 'not_found', 'Unknown upload');
        return true;
      }
      if (action[2] === 'renew') {
        entry.expires = Date.now() + 900_000;
        send(200, { uploads: [target(assetId, base)] });
        return true;
      }
      const input = uploadCompletionSchema.parse(await jsonBody());
      const expected = uploadParts(entry.size);
      if (
        entry.size <= MULTIPART_THRESHOLD ||
        input.parts.length !== expected.length ||
        expected.some(
          ({ partNumber }) =>
            !input.parts.some(
              (part) =>
                part.partNumber === partNumber &&
                entry.parts.get(partNumber) === part.etag,
            ),
        )
      ) {
        reject(
          400,
          'parts_incomplete',
          'Every part must finish before completing',
        );
        return true;
      }
      if (!entry.ready) {
        const assembled = resolve(dataDir, `${assetId}.assembling`);
        await rm(assembled, { force: true });
        for (const { partNumber } of expected)
          await pipeline(
            createReadStream(resolve(dataDir, `${assetId}.${partNumber}`)),
            createWriteStream(assembled, { flags: 'a' }),
          );
        if ((await stat(assembled)).size !== entry.size)
          throw new Error('Multipart size mismatch');
        await rename(assembled, resolve(dataDir, assetId));
        entry.ready = true;
        await Promise.all(
          expected.map(({ partNumber }) =>
            rm(resolve(dataDir, `${assetId}.${partNumber}`), { force: true }),
          ),
        );
      }
      send(200, { assetId });
      return true;
    }
    const put = /^\/mock-r2\/([^/]+)(?:\/(\d+))?$/.exec(path);
    if (!put || request.method !== 'PUT') return false;
    const assetId = put[1] ?? '';
    const entry = entries.get(assetId);
    if (!entry || entry.expires < Date.now()) {
      request.resume();
      reject(403, 'upload_expired', 'Upload URL expired');
      return true;
    }
    if (fail === 'upload') {
      request.resume();
      reject(503, 'upload_failed', 'Simulated upload failure');
      return true;
    }
    const partNumber = put[2] ? Number(put[2]) : undefined;
    const part =
      partNumber === undefined
        ? undefined
        : uploadParts(entry.size).find(
            (item) => item.partNumber === partNumber,
          );
    if (
      (entry.size > MULTIPART_THRESHOLD && !part) ||
      (entry.size <= MULTIPART_THRESHOLD && partNumber !== undefined)
    ) {
      request.resume();
      reject(400, 'invalid_part', 'Invalid part number');
      return true;
    }
    const expectedSize = part
      ? Math.min(UPLOAD_PART_BYTES, entry.size - part.start)
      : entry.size;
    const destination = resolve(
      dataDir,
      partNumber === undefined ? assetId : `${assetId}.${partNumber}`,
    );
    const temp = `${destination}.${randomUUID()}.uploading`;
    await mkdir(dataDir, { recursive: true });
    let length = 0;
    const hash = createHash('sha256');
    try {
      await pipeline(
        request,
        new Transform({
          transform(chunk: Buffer, _encoding, callback) {
            length += chunk.length;
            if (length > expectedSize) {
              callback(new Error('Upload size mismatch'));
              return;
            }
            hash.update(chunk);
            callback(null, chunk);
          },
        }),
        createWriteStream(temp),
      );
      if (length !== expectedSize) {
        await rm(temp, { force: true });
        reject(400, 'size_mismatch', 'Upload size differs from declared size');
        return true;
      }
      await rename(temp, destination);
      const etag = `"${hash.digest('hex')}"`;
      if (partNumber !== undefined) entry.parts.set(partNumber, etag);
      else entry.ready = true;
      response.writeHead(200, { ETag: etag });
      response.end();
    } catch (error) {
      await rm(temp, { force: true });
      if (!response.destroyed)
        reject(
          400,
          'upload_failed',
          error instanceof Error ? error.message : 'Upload failed',
        );
    }
    return true;
  }
  return { entries, handle };
}
