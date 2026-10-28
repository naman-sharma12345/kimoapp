import { z } from 'zod';
import {
  AI_PROMPT_MAX,
  DAILY_AI_EDIT_LIMIT,
  analysisRequestSchema,
  applyOps,
  assetAnalysisSchema,
  assetSchema,
  exportRecordSchema,
  localAssetUrl,
  opsRequestSchema,
  projectSchema,
  sessionRequestSchema,
  uploadRequestSchema,
  type Asset,
  type AssetAnalysis,
  type Clip,
  type KimoProject,
  type Op,
  type ServerEvent,
  type SessionSnapshot,
  type Track,
} from '@kimo/client';
import type { Env } from './env.ts';
import { HttpError, json, readJson, safeDecode } from './http.ts';
import {
  AiEditError,
  aiConfig,
  requestAiEdit,
  validateAiOps,
  type AiConfig,
} from './ai.ts';
import { userAiConfig } from './ai-providers.ts';
import { LIMITS, checkProjectLimits } from './limits.ts';

/**
 * Editing sessions on the free plan. The server keeps only edit metadata:
 * the timeline JSON and, for each clip, its file name, type, size and
 * probed duration. Media stays in the user's browser tab and is never
 * uploaded, stored or transcoded here.
 */
export interface Broadcast {
  (
    env: Env,
    sessionId: string,
    version: number,
    events: ServerEvent[],
  ): Promise<void>;
}
export interface EditingDeps {
  now: () => Date;
  fetcher: typeof fetch;
  broadcast: Broadcast;
}

interface SessionRow {
  id: string;
  user_id: string;
  project_id: string;
  status: string;
  version: number;
  project_json: string;
  asset_ids: string;
  pending_prompt: string | null;
  created_at: string;
}
interface AssetRow {
  id: string;
  kind: Asset['kind'];
  name: string;
  mime: string;
  size_bytes: number;
  duration_sec: number | null;
  width: number | null;
  height: number | null;
}

const SESSION_ID = /^[A-Za-z0-9._:-]{1,200}$/;
const ASSET_ID = /^[A-Za-z0-9_-]{1,64}$/;
const MIME =
  /^((video|image|audio)\/[A-Za-z0-9.+-]{1,60}|application\/pdf|text\/plain)$/;
const NO_CONTROL = /^[^\p{Cc}\p{Cf}]*$/u;
export const DEFAULT_PROMPT = 'make a great video from these';

const assetIdsSchema = z
  .array(z.string().regex(ASSET_ID))
  .max(LIMITS.sessionAssets);
const attachSchema = z.object({ assetIds: assetIdsSchema.min(1) }).strict();
const detachSchema = z.object({ assetId: z.string().regex(ASSET_ID) }).strict();
const messageSchema = z
  .object({
    text: z.string().trim().min(1),
    attachments: z.array(z.string().regex(ASSET_ID)).max(30).optional(),
  })
  .strict();

/** Broadcast that goes to the session's Durable Object, when one is bound. */
export const roomBroadcast: Broadcast = async (
  env,
  sessionId,
  version,
  events,
) => {
  if (!env.ROOMS) return;
  try {
    const stub = env.ROOMS.get(env.ROOMS.idFromName(sessionId));
    await stub.fetch('https://room/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version, events }),
    });
  } catch {
    // Realtime is best effort; clients refetch on reconnect.
  }
};

export function sessionIdFrom(raw: string): string {
  const id = safeDecode(raw);
  if (!id || !SESSION_ID.test(id))
    throw new HttpError(404, 'not_found', 'Session not found');
  return id;
}

function toAsset(row: AssetRow): Asset {
  return assetSchema.parse({
    id: row.id,
    kind: row.kind,
    name: row.name,
    url: localAssetUrl(row.id),
    source: 'user',
    ...(row.duration_sec && row.duration_sec > 0
      ? { durationSec: row.duration_sec }
      : {}),
    ...(row.width && row.width > 0 ? { width: Math.round(row.width) } : {}),
    ...(row.height && row.height > 0 ? { height: Math.round(row.height) } : {}),
  });
}

function dimensions(
  aspect: string,
  assets: Asset[],
): Pick<KimoProject, 'width' | 'height'> {
  if (aspect === '9:16') return { width: 1080, height: 1920 };
  if (aspect === '1:1') return { width: 1080, height: 1080 };
  if (aspect === 'auto') {
    const first = assets.find((asset) => asset.kind === 'video' && asset.width);
    if (first?.width && first.height && first.height > first.width)
      return { width: 1080, height: 1920 };
  }
  return { width: 1920, height: 1080 };
}

const TRACKS: Track[] = [
  ['video', 'video', 'video', 88],
  ['text', 'text', 'captions', 48],
  ['audio', 'audio', 'music', 64],
  ['overlay', 'overlay', 'images', 64],
].map(([id, kind, name, height]) => ({
  id: id as string,
  kind: kind as Track['kind'],
  name: name as string,
  height: height as Track['height'],
  muted: false,
  hidden: false,
  locked: false,
}));

function clipId() {
  return `clip-${crypto.randomUUID().slice(0, 8)}`;
}

function mediaClip(asset: Asset, trackId: string, start: number): Clip {
  const duration =
    asset.kind === 'image' ? 4 : Math.max(0.1, asset.durationSec ?? 5);
  return {
    id: clipId(),
    trackId,
    assetId: asset.id,
    kind: asset.kind === 'doc' ? 'image' : asset.kind,
    start,
    duration,
    in: 0,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    effects: [],
    keyframes: [],
    speed: 1,
  };
}

/** A first cut without AI: clips in order on the picture track, audio under it. */
export function assembleProject(
  id: string,
  aspect: string,
  assets: Asset[],
): KimoProject {
  const clips: Record<string, Clip> = {};
  let cursor = 0;
  for (const asset of assets.filter(
    (item) => item.kind === 'video' || item.kind === 'image',
  )) {
    const clip = mediaClip(asset, 'video', cursor);
    clips[clip.id] = clip;
    cursor += clip.duration;
  }
  let audioCursor = 0;
  for (const asset of assets.filter((item) => item.kind === 'audio')) {
    const clip = mediaClip(asset, 'audio', audioCursor);
    clips[clip.id] = clip;
    audioCursor += clip.duration;
  }
  return projectSchema.parse({
    id,
    version: 1,
    fps: 30,
    ...dimensions(aspect, assets),
    duration: Math.max(
      0,
      ...Object.values(clips).map((clip) => clip.start + clip.duration),
    ),
    tracks: TRACKS,
    clips,
    markers: [],
  });
}

function titleFrom(prompt: string) {
  const text = prompt.replace(/[\p{Cc}\p{Cf}]/gu, ' ').trim();
  if (!text || text === DEFAULT_PROMPT) return 'untitled video';
  return text.length > 60 ? `${text.slice(0, 57).trimEnd()}…` : text;
}

export function createEditing(deps: EditingDeps) {
  const { now } = deps;
  const day = () => now().toISOString().slice(0, 10);

  async function assetsFor(
    env: Env,
    userId: string,
    ids: string[],
  ): Promise<Asset[]> {
    if (!ids.length) return [];
    const unique = [...new Set(ids)].slice(0, LIMITS.sessionAssets);
    const placeholders = unique.map(() => '?').join(', ');
    const { results } = await env.DB.prepare(
      `SELECT id, kind, name, mime, size_bytes, duration_sec, width, height
         FROM assets WHERE user_id = ? AND id IN (${placeholders})`,
    )
      .bind(userId, ...unique)
      .all<AssetRow>();
    const byId = new Map(results.map((row) => [row.id, toAsset(row)]));
    return unique.flatMap((id) => {
      const asset = byId.get(id);
      return asset ? [asset] : [];
    });
  }

  /** Browser-measured numbers for these assets, keyed by asset id. */
  async function analysesFor(
    env: Env,
    userId: string,
    ids: string[],
  ): Promise<Map<string, AssetAnalysis>> {
    const map = new Map<string, AssetAnalysis>();
    if (!ids.length) return map;
    const unique = [...new Set(ids)].slice(0, LIMITS.sessionAssets);
    const { results } = await env.DB.prepare(
      `SELECT asset_id, data FROM asset_analysis
        WHERE user_id = ? AND asset_id IN (${unique.map(() => '?').join(', ')})`,
    )
      .bind(userId, ...unique)
      .all<{ asset_id: string; data: string }>();
    for (const row of results) {
      try {
        const parsed = assetAnalysisSchema.safeParse(JSON.parse(row.data));
        if (parsed.success) map.set(row.asset_id, parsed.data);
      } catch {
        // Ignore unreadable rows; the browser can measure again.
      }
    }
    return map;
  }

  function parseIds(raw: string): string[] {
    try {
      return assetIdsSchema.parse(JSON.parse(raw));
    } catch {
      return [];
    }
  }

  function parseProject(raw: string): KimoProject {
    return projectSchema.parse(JSON.parse(raw));
  }

  /** The caller's session, or a fresh empty one for a project they own. */
  async function loadSession(
    env: Env,
    userId: string,
    sessionId: string,
  ): Promise<SessionRow> {
    const found = await env.DB.prepare(
      `SELECT s.id, s.user_id, s.project_id, s.status, s.version, s.project_json, s.asset_ids, s.pending_prompt, s.created_at
         FROM edit_sessions s JOIN projects p ON p.id = s.project_id
        WHERE s.id = ? AND s.user_id = ? AND p.user_id = ? AND p.deleted_at IS NULL`,
    )
      .bind(sessionId, userId, userId)
      .first<SessionRow>();
    if (found) return found;
    const project = await env.DB.prepare(
      'SELECT id, aspect FROM projects WHERE session_id = ? AND user_id = ? AND deleted_at IS NULL',
    )
      .bind(sessionId, userId)
      .first<{ id: string; aspect: string }>();
    if (!project) throw new HttpError(404, 'not_found', 'Session not found');
    const stamp = now().toISOString();
    await env.DB.prepare(
      `INSERT OR IGNORE INTO edit_sessions (id, user_id, project_id, status, version, project_json, asset_ids, created_at, updated_at)
       VALUES (?, ?, ?, 'editing', 1, ?, '[]', ?, ?)`,
    )
      .bind(
        sessionId,
        userId,
        project.id,
        JSON.stringify(assembleProject(sessionId, project.aspect, [])),
        stamp,
        stamp,
      )
      .run();
    const created = await env.DB.prepare(
      `SELECT id, user_id, project_id, status, version, project_json, asset_ids, pending_prompt, created_at
         FROM edit_sessions WHERE id = ? AND user_id = ?`,
    )
      .bind(sessionId, userId)
      .first<SessionRow>();
    if (!created) throw new HttpError(404, 'not_found', 'Session not found');
    return created;
  }

  function wsUrl(env: Env, sessionId: string) {
    const url = new URL(
      `/v1/sessions/${encodeURIComponent(sessionId)}/ws`,
      env.API_ORIGIN,
    );
    url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:';
    return url.toString();
  }

  async function snapshot(env: Env, row: SessionRow): Promise<SessionSnapshot> {
    const ids = parseIds(row.asset_ids);
    const analyses = await analysesFor(env, row.user_id, ids);
    const assets = (await assetsFor(env, row.user_id, ids)).map((asset) => {
      const beats = analyses.get(asset.id)?.beats;
      return beats?.length ? { ...asset, beats } : asset;
    });
    return {
      status: 'editing',
      project: parseProject(row.project_json),
      assets,
      wsUrl: wsUrl(env, row.id),
      agentState: 'idle',
      createdAt: Date.parse(row.created_at) || 0,
      ...(row.pending_prompt ? { pendingPrompt: row.pending_prompt } : {}),
    };
  }

  async function touchProject(env: Env, row: SessionRow, next: KimoProject) {
    await env.DB.prepare(
      `UPDATE projects SET duration_sec = ?, clip_count = ?, track_count = ?,
         status = CASE WHEN status = 'draft' THEN 'editing' ELSE status END, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
      .bind(
        next.duration,
        Object.keys(next.clips).length,
        next.tracks.length,
        now().toISOString(),
        row.project_id,
        row.user_id,
      )
      .run();
  }

  /** Optimistic write: only lands if nobody else changed the version. */
  async function save(
    env: Env,
    row: SessionRow,
    next: KimoProject,
    assetIds?: string[],
  ): Promise<boolean> {
    checkProjectLimits(next);
    const result = await env.DB.prepare(
      `UPDATE edit_sessions SET project_json = ?, version = ?, asset_ids = COALESCE(?, asset_ids), updated_at = ?
        WHERE id = ? AND user_id = ? AND version = ?`,
    )
      .bind(
        JSON.stringify(next),
        next.version,
        assetIds ? JSON.stringify(assetIds) : null,
        now().toISOString(),
        row.id,
        row.user_id,
        row.version,
      )
      .run();
    if (!result.meta.changes) return false;
    await touchProject(env, row, next);
    return true;
  }

  async function registerUploads(env: Env, userId: string, body: unknown) {
    const request = uploadRequestSchema.parse(body);
    if (request.files.length > LIMITS.filesPerRequest)
      throw new HttpError(413, 'too_many_files', 'Add up to 30 files at once');
    const stamp = now().toISOString();
    const rows = request.files.map((file) => {
      if (file.size > LIMITS.fileBytes)
        throw new HttpError(413, 'file_too_large', 'Files can be up to 2 GB');
      if (!MIME.test(file.mime))
        throw new HttpError(
          415,
          'unsupported_media_type',
          'Add video, audio, image or text files',
        );
      if (file.name.length > 200 || !NO_CONTROL.test(file.name))
        throw new HttpError(400, 'invalid_request', 'File name is not valid');
      const top = file.mime.split('/')[0];
      const kind: Asset['kind'] =
        top === 'video' || top === 'image' || top === 'audio' ? top : 'doc';
      return {
        id: crypto.randomUUID().replace(/-/g, ''),
        kind,
        ...file,
      };
    });
    await env.DB.batch(
      rows.map((row) =>
        env.DB.prepare(
          `INSERT INTO assets (id, user_id, kind, name, mime, size_bytes, duration_sec, width, height, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          row.id,
          userId,
          row.kind,
          row.name,
          row.mime,
          row.size,
          row.durationSec ?? null,
          row.width ?? null,
          row.height ?? null,
          stamp,
        ),
      ),
    );
    // No upload URL to a server: the "put" target is the open tab itself.
    return {
      uploads: rows.map((row) => ({
        assetId: row.id,
        putUrl: localAssetUrl(row.id),
        headers: {},
      })),
    };
  }

  async function bumpAiUsage(env: Env, userId: string) {
    const row = await env.DB.prepare(
      `INSERT INTO daily_usage (user_id, day, ai_edits) VALUES (?, ?, 1)
       ON CONFLICT (user_id, day) DO UPDATE SET ai_edits = ai_edits + 1
       RETURNING ai_edits`,
    )
      .bind(userId, day())
      .first<{ ai_edits: number }>();
    return (row?.ai_edits ?? 0) <= DAILY_AI_EDIT_LIMIT;
  }

  /**
   * Asks the model, validates, and if anything was rejected asks once more
   * with the reasons fed back. Returns whichever answer applies more ops.
   * Logs only counts, stop reasons and short validation reasons (never the
   * key, the note or media) so failures can be diagnosed with wrangler tail.
   */
  async function bestAiAnswer(
    config: AiConfig,
    input: Parameters<typeof requestAiEdit>[2],
  ) {
    const log = (attempt: number, data: Record<string, unknown>) =>
      console.log(
        JSON.stringify({
          ai: 'edit',
          provider: config.provider,
          model: config.model,
          attempt,
          ...data,
        }),
      );
    const score = (ops: unknown) => {
      try {
        const result = validateAiOps(input.project, input.assets, ops);
        return { valid: result.ops.length, skipped: result.skipped };
      } catch (error) {
        return {
          valid: -1,
          skipped:
            error instanceof AiEditError
              ? (error.details.skipped ?? [error.message])
              : ['invalid'],
        };
      }
    };
    let first: Awaited<ReturnType<typeof requestAiEdit>> | null = null;
    let feedback: { previous: string; errors: string[] };
    try {
      first = await requestAiEdit(config, deps.fetcher, input);
      const result = score(first.ops);
      log(1, {
        finish: first.finish,
        valid: result.valid,
        skipped: result.skipped.slice(0, 10),
      });
      if (!result.skipped.length) return first;
      feedback = { previous: first.raw, errors: result.skipped };
    } catch (error) {
      if (!(error instanceof AiEditError) || error.code !== 'ai_invalid_edit')
        throw error;
      log(1, { finish: error.details.finish, parse: 'failed' });
      feedback = {
        previous: error.details.raw || '(no usable answer)',
        errors: [
          error.details.finish === 'length'
            ? 'the answer was cut off: return fewer, essential ops'
            : 'the answer was not one valid json object {"message","ops"}',
        ],
      };
    }
    let second: Awaited<ReturnType<typeof requestAiEdit>> | null = null;
    try {
      second = await requestAiEdit(config, deps.fetcher, input, feedback);
    } catch (error) {
      if (!first || !(error instanceof AiEditError)) throw error;
    }
    if (!second) return first as Awaited<ReturnType<typeof requestAiEdit>>;
    const retry = score(second.ops);
    log(2, {
      finish: second.finish,
      valid: retry.valid,
      skipped: retry.skipped.slice(0, 10),
    });
    if (!first) return second;
    return retry.valid >= score(first.ops).valid ? second : first;
  }

  /**
   * One AI edit: quota, model call, strict validation, atomic save, then the
   * realtime events. Throws HttpError for the caller to answer with.
   * With the user's own key (`userAi`) the edit goes to their provider and
   * does not count toward kimo's daily quota; the key lives only in this
   * call's memory.
   */
  async function aiEdit(
    env: Env,
    userId: string,
    sessionId: string,
    prompt: string,
    userAi: AiConfig | null = null,
  ) {
    const text = prompt.trim();
    if (!text) throw new HttpError(400, 'invalid_request', 'Write a note');
    if (text.length > AI_PROMPT_MAX)
      throw new HttpError(413, 'too_large', 'That note is too long');
    // Ownership first, so another account only ever sees a 404.
    let row = await loadSession(env, userId, sessionId);
    const config = userAi ?? aiConfig(env);
    if (!config)
      throw new HttpError(
        503,
        'ai_unavailable',
        "AI editing isn't switched on yet",
      );
    if (config.source === 'kimo' && !(await bumpAiUsage(env, userId)))
      throw new HttpError(
        429,
        'ai_quota',
        'You have used today’s AI edits; manual editing still works',
      );
    if (row.pending_prompt)
      await env.DB.prepare(
        'UPDATE edit_sessions SET pending_prompt = NULL WHERE id = ? AND user_id = ?',
      )
        .bind(sessionId, userId)
        .run();
    const started = now().getTime();
    const actionId = `ai-${crypto.randomUUID().slice(0, 12)}`;
    await deps.broadcast(env, sessionId, row.version, [
      { t: 'agent.status', state: 'thinking', label: 'reading your note' },
    ]);
    const idle: ServerEvent = {
      t: 'agent.status',
      state: 'idle',
      label: 'ready',
    };
    try {
      const ids = parseIds(row.asset_ids);
      const assets = await assetsFor(env, userId, ids);
      const input = {
        project: parseProject(row.project_json),
        assets,
        analyses: await analysesFor(env, userId, ids),
        prompt: text,
      };
      const answer = await bestAiAnswer(config, input);
      for (let attempt = 0; attempt < 3; attempt++) {
        const project = parseProject(row.project_json);
        const { ops, next, skipped } = validateAiOps(
          project,
          assets,
          answer.ops,
        );
        const base =
          answer.message ||
          (ops.length ? 'done. take a look.' : 'i left the timeline as is.');
        const message: ServerEvent = {
          t: 'agent.message',
          id: `${actionId}-say`,
          role: 'agent',
          kind: 'say',
          text: skipped.length
            ? `${base} (skipped ${skipped.length} step${skipped.length === 1 ? '' : 's'} that couldn’t be applied safely: ${skipped
                .slice(0, 3)
                .join('; ')}${skipped.length > 3 ? '; …' : ''})`.slice(0, 900)
            : base,
        };
        if (!ops.length) {
          await deps.broadcast(env, sessionId, row.version, [message, idle]);
          return { version: row.version, ops };
        }
        if (await save(env, row, next)) {
          await deps.broadcast(env, sessionId, next.version, [
            {
              t: 'agent.action.start',
              id: actionId,
              tool: 'apply_edit',
              title: 'apply your note',
              args: { ops: ops.length },
            },
            {
              t: 'project.ops',
              version: next.version,
              ops,
              actionId,
            },
            {
              t: 'agent.action.end',
              id: actionId,
              ok: true,
              durationMs: Math.max(0, now().getTime() - started),
            },
            message,
            idle,
          ]);
          return { version: next.version, ops };
        }
        row = await loadSession(env, userId, sessionId);
      }
      throw new HttpError(409, 'version_conflict', 'The timeline changed');
    } catch (error) {
      await deps.broadcast(env, sessionId, row.version, [idle]);
      if (error instanceof AiEditError)
        throw error.code === 'ai_upstream'
          ? new HttpError(502, 'ai_upstream', 'The AI editor did not answer')
          : error.code === 'ai_key_rejected'
            ? new HttpError(
                400,
                'ai_key_rejected',
                'The provider refused that key',
              )
            : new HttpError(
                422,
                'ai_invalid_edit',
                'That note did not turn into a safe edit; nothing changed',
              );
      throw error;
    }
  }

  async function route(
    request: Request,
    env: Env,
    userId: string,
    path: string,
    method: string,
  ): Promise<Response | null> {
    if (path === '/v1/uploads' && method === 'POST')
      return json(await registerUploads(env, userId, await readJson(request)));

    const upload = /^\/v1\/uploads\/([^/]+)\/(complete|renew)$/.exec(path);
    if (upload?.[1] && method === 'POST') {
      const id = safeDecode(upload[1]) ?? '';
      if (!ASSET_ID.test(id))
        throw new HttpError(404, 'not_found', 'Upload not found');
      const owned = await env.DB.prepare(
        'SELECT id FROM assets WHERE id = ? AND user_id = ?',
      )
        .bind(id, userId)
        .first<{ id: string }>();
      if (!owned) throw new HttpError(404, 'not_found', 'Upload not found');
      return upload[2] === 'complete'
        ? json({ assetId: id })
        : json({
            uploads: [{ assetId: id, putUrl: localAssetUrl(id), headers: {} }],
          });
    }

    if (path === '/v1/sessions' && method === 'POST') {
      const body = sessionRequestSchema.parse(await readJson(request));
      if (body.prompt.length > 4000)
        throw new HttpError(413, 'too_large', 'That prompt is too long');
      const assetIds = assetIdsSchema.parse(body.assetIds);
      const assets = await assetsFor(env, userId, assetIds);
      if (assets.length !== new Set(assetIds).size)
        throw new HttpError(404, 'not_found', 'Some files were not found');
      const sessionId = crypto.randomUUID();
      const projectId = crypto.randomUUID();
      const project = assembleProject(sessionId, body.aspect, assets);
      const stamp = now().toISOString();
      const aspect = body.aspect === 'auto' ? '16:9' : body.aspect;
      const prompt = body.prompt.trim();
      // Run later, from the studio, once the clips have been measured.
      const pending =
        assets.length && prompt && prompt.length <= AI_PROMPT_MAX
          ? prompt
          : null;
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO projects (id, user_id, session_id, title, prompt, status, aspect, duration_sec, clip_count, track_count, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'editing', ?, ?, ?, ?, ?, ?)`,
        ).bind(
          projectId,
          userId,
          sessionId,
          titleFrom(body.prompt),
          body.prompt,
          project.width === 1080 && project.height === 1920 ? '9:16' : aspect,
          project.duration,
          Object.keys(project.clips).length,
          project.tracks.length,
          stamp,
          stamp,
        ),
        env.DB.prepare(
          `INSERT INTO edit_sessions (id, user_id, project_id, status, version, project_json, asset_ids, pending_prompt, created_at, updated_at)
           VALUES (?, ?, ?, 'editing', ?, ?, ?, ?, ?, ?)`,
        ).bind(
          sessionId,
          userId,
          projectId,
          project.version,
          JSON.stringify(project),
          JSON.stringify(assets.map((asset) => asset.id)),
          pending,
          stamp,
          stamp,
        ),
      ]);
      return json({ sessionId, wsUrl: wsUrl(env, sessionId) });
    }

    const match = /^\/v1\/sessions\/([^/]+)(?:\/(.+))?$/.exec(path);
    if (!match?.[1]) return null;
    const sessionId = sessionIdFrom(match[1]);
    const action = match[2] ?? '';

    if (!action && method === 'GET')
      return json(
        await snapshot(env, await loadSession(env, userId, sessionId)),
      );

    if (method !== 'POST') return null;

    if (action === 'ops') {
      const body = opsRequestSchema.parse(await readJson(request));
      if (body.ops.length > LIMITS.opsPerBatch)
        throw new HttpError(413, 'too_large', 'Too many edits at once');
      const row = await loadSession(env, userId, sessionId);
      if (body.mutationId) {
        if (body.mutationId.length > 120)
          throw new HttpError(400, 'invalid_request', 'Bad mutation id');
        const seen = await env.DB.prepare(
          'SELECT version FROM session_mutations WHERE session_id = ? AND mutation_id = ?',
        )
          .bind(sessionId, body.mutationId)
          .first<{ version: number }>();
        if (seen) return json({ version: seen.version });
      }
      if (body.baseVersion !== row.version)
        throw new HttpError(409, 'version_conflict', 'The timeline changed');
      const assets = new Set(parseIds(row.asset_ids));
      for (const op of body.ops) {
        const assetId =
          op.op === 'clip.add'
            ? op.clip.assetId
            : op.op === 'clip.update'
              ? op.patch.assetId
              : undefined;
        if (assetId !== undefined && !assets.has(assetId))
          throw new HttpError(400, 'invalid_request', 'Unknown file');
      }
      let next: KimoProject;
      try {
        next = applyOps(parseProject(row.project_json), body.ops as Op[]);
      } catch {
        throw new HttpError(400, 'invalid_ops', 'Those edits do not apply');
      }
      if (!(await save(env, row, next)))
        throw new HttpError(409, 'version_conflict', 'The timeline changed');
      if (body.mutationId)
        await env.DB.prepare(
          'INSERT OR IGNORE INTO session_mutations (session_id, mutation_id, version, created_at) VALUES (?, ?, ?, ?)',
        )
          .bind(sessionId, body.mutationId, next.version, now().toISOString())
          .run();
      await deps.broadcast(env, sessionId, next.version, [
        {
          t: 'project.ops',
          version: next.version,
          ops: body.ops,
          actionId: 'user',
        },
      ]);
      return json({ version: next.version });
    }

    if (action === 'assets/add') {
      const body = attachSchema.parse(await readJson(request));
      const row = await loadSession(env, userId, sessionId);
      const added = await assetsFor(env, userId, body.assetIds);
      if (added.length !== new Set(body.assetIds).size)
        throw new HttpError(404, 'not_found', 'Some files were not found');
      const ids = [
        ...new Set([...parseIds(row.asset_ids), ...added.map((a) => a.id)]),
      ];
      if (ids.length > LIMITS.sessionAssets)
        throw new HttpError(413, 'too_many_files', 'This project is full');
      const project = parseProject(row.project_json);
      if (!(await save(env, row, { ...project }, ids))) {
        throw new HttpError(409, 'version_conflict', 'The timeline changed');
      }
      await deps.broadcast(
        env,
        sessionId,
        project.version,
        added.map((asset) => ({ t: 'asset.added', asset })),
      );
      return json({ assets: added });
    }

    if (action === 'assets/remove') {
      const body = detachSchema.parse(await readJson(request));
      const row = await loadSession(env, userId, sessionId);
      const ids = parseIds(row.asset_ids).filter((id) => id !== body.assetId);
      await env.DB.prepare(
        'UPDATE edit_sessions SET asset_ids = ?, updated_at = ? WHERE id = ? AND user_id = ?',
      )
        .bind(JSON.stringify(ids), now().toISOString(), sessionId, userId)
        .run();
      return new Response(null, { status: 202 });
    }

    if (action === 'analysis') {
      const body = analysisRequestSchema.parse(await readJson(request));
      const row = await loadSession(env, userId, sessionId);
      const owned = new Set(parseIds(row.asset_ids));
      const stamp = now().toISOString();
      for (const item of body.analyses)
        if (!owned.has(item.assetId))
          throw new HttpError(404, 'not_found', 'Some files were not found');
      await env.DB.batch(
        body.analyses.map((item) =>
          env.DB.prepare(
            `INSERT INTO asset_analysis (asset_id, user_id, data, updated_at) VALUES (?, ?, ?, ?)
             ON CONFLICT (asset_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
             WHERE asset_analysis.user_id = excluded.user_id`,
          ).bind(item.assetId, userId, JSON.stringify(item), stamp),
        ),
      );
      return new Response(null, { status: 204 });
    }

    if (action === 'messages') {
      const body = messageSchema.parse(await readJson(request));
      await aiEdit(
        env,
        userId,
        sessionId,
        body.text,
        userAiConfig(request.headers),
      );
      return new Response(null, { status: 202 });
    }

    if (action === 'cancel' || action === 'reopen') {
      await loadSession(env, userId, sessionId);
      return new Response(null, { status: 202 });
    }

    if (action === 'exports') {
      const body = exportRecordSchema.parse(await readJson(request));
      await loadSession(env, userId, sessionId);
      await env.DB.prepare(
        `INSERT INTO daily_usage (user_id, day, videos, render_seconds) VALUES (?, ?, 1, ?)
         ON CONFLICT (user_id, day) DO UPDATE SET videos = videos + 1,
           render_seconds = render_seconds + excluded.render_seconds`,
      )
        .bind(userId, day(), body.durationSec)
        .run();
      return new Response(null, { status: 204 });
    }

    if (action === 'approve')
      throw new HttpError(
        410,
        'export_in_browser',
        'Videos are exported in your browser',
      );

    return null;
  }

  return { route, loadSession, snapshot, aiEdit };
}
