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
    buildModel,
  }) {
    this.directory = directory;
    this.replay = replay;
    this.upstream = upstream;
    this.aliases = aliases.toSorted((a, b) => b[0].length - a[0].length);
    this.maxRequests = maxRequests;
    this.maxEstimatedUsd = maxEstimatedUsd;
    this.onReserve = onReserve;
    this.buildModel = buildModel;
    this.requests = 0;
    this.hits = 0;
    this.estimatedUsd = 0;
    this.failures = [];
    this.bindings = new Map();
  }
  normalize(text) {
    try {
      return JSON.stringify(
        this.mapJson(JSON.parse(text), (value) => this.normalizeString(value)),
      );
    } catch {
      return this.normalizeString(text);
    }
  }
  mapJson(value, transform) {
    if (typeof value === 'string') return transform(value);
    if (Array.isArray(value))
      return value.map((item) => this.mapJson(item, transform));
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map((key) => [key, this.mapJson(value[key], transform)]),
      );
    return value;
  }
  normalizeString(text) {
    let result = text;
    for (const [path, alias] of this.aliases) {
      const forms = new Set([path, path.replaceAll('\\', '/')]);
      let escaped = path;
      for (let depth = 0; depth < 4; depth++) {
        escaped = JSON.stringify(escaped).slice(1, -1);
        forms.add(escaped);
      }
      for (const form of [...forms].sort((a, b) => b.length - a.length))
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
    try {
      return JSON.stringify(
        this.mapJson(JSON.parse(text), (value) => this.restoreString(value)),
      );
    } catch {
      return this.restoreString(text);
    }
  }
  restoreString(text) {
    let result = text;
    for (const [path, alias] of this.aliases)
      result = result.split(alias).join(path.replaceAll('\\', '/'));
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
        version: 2,
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
      // Reserve before sending. A live status response can verify the build
      // model; reviews retain full-model rates because their override is hidden.
      const json = typeof init.body === 'string' ? JSON.parse(init.body) : {};
      const sam = target.pathname.includes('/sam');
      const contributor =
        !sam &&
        json.kind !== 'review' &&
        /^muse-spark-1\.[23]-contributor$/.test(this.buildModel ?? '');
      const reserve = sam
        ? target.pathname.endsWith('/file') ||
          target.pathname.endsWith('/delete')
          ? 0
          : json.image
            ? 0.0025
            : Math.max(50, Number(json.frames) || 50) * 0.0002
        : ((Buffer.byteLength(json.text) +
            4096 +
            (json.images?.length ?? 0) * 16384) *
            (contributor ? 0.1 : 1.25) +
            (json.kind === 'review' ? 4000 : 6000) *
              (contributor ? 0.2 : 4.25)) /
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
        version: 2,
        key,
        endpoint: target.pathname,
        status: response.status,
        headers: {
          'Content-Type':
            response.headers.get('Content-Type') ?? 'application/json',
        },
        body: stored,
        responseSha256: sha256(stored),
        reservationUsd: reserve,
        requestEvidence: sam
          ? { bodyHash: sha256(body) }
          : {
              ...JSON.parse(body),
              images: (json.images ?? []).map((item) => ({
                label: item.label,
                sha256: sha256(item.url),
              })),
            },
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
