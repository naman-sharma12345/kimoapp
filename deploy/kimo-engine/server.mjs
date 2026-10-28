// kimo engine bridge: one kimo-mcp (stdio MCP) child per job, reached over
// authenticated HTTP. Only the kimo-api Worker holds ENGINE_TOKEN.
// Media rule: clips and renders live in /tmp/kimo-jobs/<job> only, are
// deleted after the result is downloaded or after JOB_TTL_MS, and are never
// logged. Logs carry job ids, tool names and timings only.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import {
  mkdirSync,
  rmSync,
  createWriteStream,
  createReadStream,
  statSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { resolve, join } from 'node:path';

const PORT = Number(process.env.PORT || 7860);
const TOKEN = process.env.ENGINE_TOKEN || '';
const ROOT = '/tmp/kimo-jobs';
const JOB_TTL_MS = Number(process.env.JOB_TTL_MS || 30 * 60_000);
const MAX_UPLOAD = 300 * 1024 ** 2;
const MAX_JOBS = 3;
const CALL_TIMEOUT_MS = 240_000;
const ID = /^[a-z0-9-]{8,64}$/;
const FILE = /^[a-z0-9_-]{1,40}\.(mp4|mov|webm|m4a|mp3|wav|png|jpg|srt)$/i;
mkdirSync(ROOT, { recursive: true });
const jobs = new Map();
const log = (data) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), ...data }));

function authorized(req) {
  const got = Buffer.from(String(req.headers['x-engine-token'] || ''));
  const want = Buffer.from(TOKEN);
  return (
    TOKEN.length >= 32 &&
    got.length === want.length &&
    timingSafeEqual(got, want)
  );
}
function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}
async function readJson(req, max = 2_000_000) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) throw new Error('too_large');
    chunks.push(chunk);
  }
  return chunks.length
    ? JSON.parse(Buffer.concat(chunks).toString('utf8'))
    : {};
}

class Mcp {
  constructor(dir) {
    this.next = 1;
    this.pending = new Map();
    this.buffer = '';
    this.child = spawn('kimo-mcp', [], {
      cwd: dir,
      env: { ...process.env, HOME: dir, TMPDIR: dir },
      stdio: ['pipe', 'pipe', 'ignore'],
    });
    this.child.stdout.on('data', (data) => {
      this.buffer += data.toString('utf8');
      let index;
      while ((index = this.buffer.indexOf('\n')) >= 0) {
        const line = this.buffer.slice(0, index);
        this.buffer = this.buffer.slice(index + 1);
        let msg;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        const waiter = msg.id != null && this.pending.get(msg.id);
        if (waiter) {
          this.pending.delete(msg.id);
          waiter(msg);
        }
      }
    });
    this.child.on('exit', () => {
      for (const waiter of this.pending.values())
        waiter({ error: { message: 'engine stopped' } });
      this.pending.clear();
      this.dead = true;
    });
  }
  request(method, params, timeout = CALL_TIMEOUT_MS) {
    if (this.dead)
      return Promise.resolve({
        error: { message: 'engine stopped; start a new job' },
      });
    const id = this.next++;
    return new Promise((done) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        done({ error: { message: `tool timed out after ${timeout / 1000}s` } });
      }, timeout);
      this.pending.set(id, (msg) => {
        clearTimeout(timer);
        done(msg);
      });
      this.child.stdin.write(
        JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n',
      );
    });
  }
  kill() {
    try {
      this.child.kill('SIGKILL');
    } catch {
      // already gone
    }
  }
}

function dropJob(id, why) {
  const job = jobs.get(id);
  if (job) {
    job.mcp.kill();
    clearTimeout(job.ttl);
    jobs.delete(id);
  }
  rmSync(join(ROOT, id), { recursive: true, force: true });
  log({ job: id, event: 'deleted', why });
}

/** Any path the model passes must stay inside the job's folder. */
function pathsInside(value, dir) {
  if (typeof value === 'string') {
    if (value.includes('://')) return false;
    if (
      value.startsWith('/') ||
      value.startsWith('..') ||
      value.includes('/../')
    ) {
      const full = resolve(value);
      return (
        full === dir ||
        full.startsWith(dir + '/') ||
        full.startsWith('/usr/local/share/kimo/')
      );
    }
    return true;
  }
  if (Array.isArray(value))
    return value.every((item) => pathsInside(item, dir));
  if (value && typeof value === 'object')
    return Object.values(value).every((item) => pathsInside(item, dir));
  return true;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://engine');
  const parts = url.pathname.split('/').filter(Boolean);
  try {
    if (url.pathname === '/' || url.pathname === '/health')
      return send(res, 200, {
        ok: true,
        service: 'kimo-engine',
        jobs: jobs.size,
      });
    if (!authorized(req)) return send(res, 401, { error: 'unauthorized' });
    if (parts[0] !== 'jobs') return send(res, 404, { error: 'not_found' });
    const id = parts[1];
    if (req.method === 'POST' && parts.length === 1) {
      const body = await readJson(req);
      if (!ID.test(String(body.id))) return send(res, 400, { error: 'bad_id' });
      if (jobs.size >= MAX_JOBS) return send(res, 503, { error: 'busy' });
      const dir = join(ROOT, body.id);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      const mcp = new Mcp(dir);
      const init = await mcp.request(
        'initialize',
        {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'kimo-app', version: '1' },
        },
        30_000,
      );
      if (init.error) {
        mcp.kill();
        rmSync(dir, { recursive: true, force: true });
        return send(res, 500, { error: 'engine_start' });
      }
      const list = await mcp.request(
        'tools/list',
        { mode: 'director' },
        30_000,
      );
      const job = { id: body.id, dir, mcp, created: Date.now() };
      job.ttl = setTimeout(() => dropJob(body.id, 'ttl'), JOB_TTL_MS);
      jobs.set(body.id, job);
      log({ job: body.id, event: 'created' });
      return send(res, 200, {
        id: body.id,
        dir,
        server: init.result?.serverInfo,
        tools: list.result?.tools ?? [],
      });
    }
    if (!ID.test(String(id))) return send(res, 404, { error: 'not_found' });
    const job = jobs.get(id);
    if (!job) return send(res, 404, { error: 'job_gone' });
    const action = parts[2];
    if (req.method === 'DELETE' && parts.length === 2) {
      dropJob(id, 'client');
      return send(res, 200, { ok: true });
    }
    if (
      action === 'media' &&
      req.method === 'PUT' &&
      FILE.test(parts[3] || '')
    ) {
      const target = join(job.dir, parts[3]);
      let size = 0;
      const out = createWriteStream(target);
      for await (const chunk of req) {
        size += chunk.length;
        if (size > MAX_UPLOAD) {
          out.destroy();
          rmSync(target, { force: true });
          return send(res, 413, { error: 'too_large' });
        }
        if (!out.write(chunk))
          await new Promise((done) => out.once('drain', done));
      }
      await new Promise((done) => out.end(done));
      log({ job: id, event: 'upload', bytes: size });
      return send(res, 200, { path: target, bytes: size });
    }
    if (action === 'call' && req.method === 'POST') {
      const body = await readJson(req);
      const name = String(body.name || '');
      if (!/^[a-z0-9_]{1,60}$/.test(name))
        return send(res, 400, { error: 'bad_tool' });
      const args =
        body.arguments && typeof body.arguments === 'object'
          ? body.arguments
          : {};
      if (!pathsInside(args, job.dir))
        return send(res, 200, {
          isError: true,
          content: [{ type: 'text', text: `paths must be inside ${job.dir}` }],
        });
      const started = Date.now();
      const reply = await job.mcp.request('tools/call', {
        name,
        arguments: args,
      });
      log({
        job: id,
        event: 'tool',
        name,
        ms: Date.now() - started,
        ok: !reply.error && !reply.result?.isError,
      });
      if (reply.error)
        return send(res, 200, {
          isError: true,
          content: [
            {
              type: 'text',
              text: String(reply.error.message || 'tool failed').slice(0, 2000),
            },
          ],
        });
      return send(res, 200, reply.result ?? { content: [] });
    }
    if (action === 'state') {
      const file = join(job.dir, '.agent-state.json');
      if (req.method === 'PUT') {
        writeFileSync(file, JSON.stringify(await readJson(req, 20_000_000)));
        return send(res, 200, { ok: true });
      }
      if (req.method === 'GET')
        return send(
          res,
          200,
          existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {},
        );
    }
    if (
      action === 'output' &&
      req.method === 'GET' &&
      FILE.test(parts[3] || '')
    ) {
      const file = join(job.dir, parts[3]);
      let stat;
      try {
        stat = statSync(file);
      } catch {
        return send(res, 404, { error: 'no_output' });
      }
      res.writeHead(200, {
        'Content-Type': 'video/mp4',
        'Content-Length': stat.size,
        'Cache-Control': 'no-store',
      });
      const stream = createReadStream(file);
      stream.pipe(res);
      res.on('finish', () => {
        if (url.searchParams.get('keep') !== '1') dropJob(id, 'downloaded');
      });
      return;
    }
    return send(res, 404, { error: 'not_found' });
  } catch (error) {
    log({
      event: 'error',
      kind: error instanceof Error ? error.message.slice(0, 40) : 'unknown',
    });
    if (!res.headersSent)
      send(
        res,
        error instanceof Error && error.message === 'too_large' ? 413 : 400,
        { error: 'bad_request' },
      );
  }
});
server.requestTimeout = 0;
server.listen(PORT, () =>
  log({ event: 'listening', port: PORT, auth: TOKEN.length >= 32 }),
);
