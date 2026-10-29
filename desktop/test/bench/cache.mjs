import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { sha256 } from './io.mjs';

export class CacheMiss extends Error {}
/** Scoped to a headless bench process. Never installed by the desktop app. */
export class ProxyCache {
  constructor({
    directory,
    replay = true,
    aliases = [],
    upstream = globalThis.fetch,
    maxRequests = 0,
    maxEstimatedUsd = 0.49,
    onReserve,
  }) {
    this.directory = directory;
    this.replay = replay;
    this.upstream = upstream;
    this.aliases = aliases.toSorted((a, b) => b[0].length - a[0].length);
    this.maxRequests = maxRequests;
    this.maxEstimatedUsd = maxEstimatedUsd;
    this.onReserve = onReserve;
    this.requests = 0;
    this.hits = 0;
    this.estimatedUsd = 0;
    this.failures = [];
    this.bindings = new Map();
  }
  normalize(text) {
    let result = text;
    for (const [path, alias] of this.aliases) {
      for (const form of [
        JSON.stringify(path).slice(1, -1),
        path,
        path.replaceAll('\\', '/'),
      ])
        result = result.split(form).join(alias);
    }
    // UUIDs arise in engine render history. Preserve relationships, not machine randomness.
    result = result.replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      (id) => {
        if (!this.bindings.has(id))
          this.bindings.set(id, `@UUID${this.bindings.size}@`);
        return this.bindings.get(id);
      },
    );
    return result;
  }
  restore(text) {
    let result = text;
    for (const [path, alias] of this.aliases)
      result = result.split(alias).join(JSON.stringify(path).slice(1, -1));
    for (const [id, alias] of this.bindings)
      result = result.split(alias).join(id);
    for (const alias of new Set(result.match(/@UUID\d+@/g) ?? [])) {
      const id = randomUUID();
      this.bindings.set(id, alias);
      result = result.split(alias).join(id);
    }
    return result;
  }
  async fetch(url, init = {}) {
    try {
      const target = new URL(url);
      if (
        target.origin !== 'https://api.getkimo.tech' ||
        !/^\/v1\/desktop\/(ai|sam)(\/file(\/delete)?)?$/.test(target.pathname)
      )
        throw new Error(
          `Bench forbids network endpoint ${target.origin}${target.pathname}`,
        );
      const body =
        typeof init.body === 'string'
          ? this.normalize(init.body)
          : init.body
            ? `sha256:${sha256(init.body)}`
            : '';
      const request = {
        version: 1,
        url: String(url),
        method: init.method ?? 'GET',
        body,
      };
      const key = sha256(JSON.stringify(request));
      const path = join(this.directory, `${key}.json`);
      const cached = await readFile(path, 'utf8')
        .then(JSON.parse)
        .catch((e) => {
          if (e.code === 'ENOENT') return null;
          throw e;
        });
      if (cached) {
        if (cached.key !== key || sha256(cached.body) !== cached.responseSha256)
          throw new Error(`Corrupt cache entry ${key}`);
        this.hits++;
        return new Response(this.restore(cached.body), {
          status: cached.status,
          headers: cached.headers,
        });
      }
      if (this.replay)
        throw new CacheMiss(
          `Replay cache miss ${key}. No network request was sent.`,
        );
      // Upper-bound reservation: 1 UTF-8 byte/token, full 6000 output tokens;
      // image review reserves 16384 input tokens/image at the full model price.
      // SAM video costs exceed this phase budget: record those separately, then replay.
      if (target.pathname.includes('/sam'))
        throw new Error(
          'SAM recording disabled by the phase budget; supply a previously recorded cache',
        );
      const json = JSON.parse(init.body);
      const reserve =
        ((Buffer.byteLength(json.text) +
          4096 +
          (json.images?.length ?? 0) * 16384) *
          1.25 +
          6000 * 4.25) /
        1e6;
      if (
        this.requests >= this.maxRequests ||
        this.estimatedUsd + reserve > this.maxEstimatedUsd
      )
        throw new Error(
          'Bench AI budget cap reached; record mode stopped before sending',
        );
      this.requests++;
      this.estimatedUsd += reserve;
      await this.onReserve?.(reserve);
      const response = await this.upstream(url, init);
      const raw = await response.text();
      if (!response.ok)
        throw new Error(`Proxy ${response.status}: ${raw.slice(0, 300)}`);
      const stored = this.normalize(raw);
      const entry = {
        version: 1,
        key,
        endpoint: target.pathname,
        status: response.status,
        headers: {
          'Content-Type':
            response.headers.get('Content-Type') ?? 'application/json',
        },
        body: stored,
        responseSha256: sha256(stored),
      };
      await mkdir(this.directory, { recursive: true });
      await writeFile(path + '.tmp', JSON.stringify(entry, null, 2) + '\n');
      await rename(path + '.tmp', path);
      return new Response(raw, {
        status: response.status,
        headers: entry.headers,
      });
    } catch (e) {
      this.failures.push(e.message);
      throw e;
    }
  }
  assertClean() {
    if (this.failures.length) throw new Error(this.failures.join('\n'));
  }
  install() {
    const previous = globalThis.fetch;
    globalThis.fetch = this.fetch.bind(this);
    return () => {
      globalThis.fetch = previous;
    };
  }
}
