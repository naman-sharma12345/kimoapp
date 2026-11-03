// Installer-only CDN adapter. Static Assets hold <=20 MB immutable pieces;
// native pipeTo joins them without buffering the app or copying every block
// through JavaScript. No R2, origin proxy, credentials or paid storage.
export function parseRange(value, size) {
  if (!value) return { start: 0, end: size - 1, partial: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2])) return null;
  let start, end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  }
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start > end ||
    start >= size
  )
    return null;
  return { start, end, partial: true };
}

export function createDistributionHandler(releases, makeStream) {
  const handlers = new Map(
    Object.entries(releases).map(([version, manifest]) => {
      if (version !== manifest.version)
        throw Error('Distribution version mismatch');
      return [version, createHandler(manifest, makeStream)];
    }),
  );
  return (request, env, ctx) => {
    const version = /^\/desktop\/v(\d+\.\d+\.\d+)\//.exec(
      new URL(request.url).pathname,
    )?.[1];
    const handle = handlers.get(version);
    return handle
      ? handle(request, env, ctx)
      : new Response('Not found', { status: 404 });
  };
}

export function createHandler(manifest, makeStream) {
  const etag = `"sha512-${manifest.sha512}"`;
  const path = `/desktop/v${manifest.version}/${manifest.file}`;
  return async function handle(request, env, ctx) {
    if (new URL(request.url).pathname !== path)
      return new Response('Not found', { status: 404 });
    if (!['GET', 'HEAD'].includes(request.method))
      return new Response('Method not allowed', {
        status: 405,
        headers: { Allow: 'GET, HEAD' },
      });
    const headers = new Headers({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${manifest.file}"`,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Accept-Ranges': 'bytes',
      ETag: etag,
      'X-Content-Type-Options': 'nosniff',
    });
    if (request.headers.get('If-None-Match') === etag)
      return new Response(null, { status: 304, headers });
    const ifRange = request.headers.get('If-Range');
    const range = parseRange(
      !ifRange || ifRange === etag ? request.headers.get('Range') : null,
      manifest.bytes,
    );
    if (!range)
      return new Response(null, {
        status: 416,
        headers: { 'Content-Range': `bytes */${manifest.bytes}` },
      });
    const length = range.end - range.start + 1;
    headers.set('Content-Length', String(length));
    if (range.partial)
      headers.set(
        'Content-Range',
        `bytes ${range.start}-${range.end}/${manifest.bytes}`,
      );
    const status = range.partial ? 206 : 200;
    if (request.method === 'HEAD')
      return new Response(null, { status, headers });
    const chunks = manifest.chunks.filter(
      (c) => c.start <= range.end && c.start + c.bytes > range.start,
    );
    async function get(c) {
      const start = Math.max(0, range.start - c.start),
        end = Math.min(c.bytes - 1, range.end - c.start);
      const partial = start !== 0 || end !== c.bytes - 1;
      // Bindings may omit Content-Length and ignore Range. Slice boundary
      // pieces in a bounded stream; full pieces stay on native pipeTo.
      const res = await env.ASSETS.fetch(
        new Request(new URL(c.path, request.url)),
      );
      const suppliedLength = res.headers.get('Content-Length');
      if (
        res.status !== 200 ||
        (suppliedLength !== null && Number(suppliedLength) !== c.bytes) ||
        !res.body
      )
        throw Error('CDN piece unavailable or invalid');
      if (!partial) return res;
      const reader = res.body.getReader();
      let offset = 0;
      return {
        body: new ReadableStream({
          async pull(controller) {
            while (offset <= end) {
              const { value, done } = await reader.read();
              if (done) {
                controller.error(Error('Truncated CDN piece'));
                return;
              }
              const blockStart = offset;
              offset += value.length;
              if (offset <= start) continue;
              controller.enqueue(
                value.subarray(
                  Math.max(0, start - blockStart),
                  Math.min(value.length, end + 1 - blockStart),
                ),
              );
              if (offset > end) {
                controller.close();
                await reader.cancel();
              }
              return;
            }
          },
          cancel(reason) {
            return reader.cancel(reason);
          },
        }),
      };
    }
    let first;
    try {
      first = await get(chunks[0]);
    } catch {
      return new Response('Download temporarily unavailable', {
        status: 503,
        headers: { 'Retry-After': '30' },
      });
    }
    const { readable, writable } = makeStream(length);
    const pump = (async () => {
      try {
        await first.body.pipeTo(writable, { preventClose: true });
        for (const c of chunks.slice(1))
          await (await get(c)).body.pipeTo(writable, { preventClose: true });
        await writable.close();
      } catch (e) {
        await writable.abort(e).catch(() => {});
      }
    })();
    ctx.waitUntil(pump);
    return new Response(readable, { status, headers });
  };
}
