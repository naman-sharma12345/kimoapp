import { z } from 'zod';
import type { AiConfig } from './ai.ts';
import { recordUsage } from './ai-budget.ts';
import type { Env } from './env.ts';
import { HttpError } from './http.ts';

/**
 * SAM 3.1 (Meta Segment Anything) for the kimo desktop app. The app sends a
 * downscaled (~720p) copy of only the clip segment it needs; this route
 * uploads it to Meta with kimo's key, streams the segmentation back untouched
 * and meters frames into the shared AI budget. The key never leaves here.
 */
export const SAM_MODEL = 'sam-3.1';
/** Budget rows: frames and images are counted as "prompt tokens". */
export const SAM_FRAMES = 'sam-3.1-frames';
export const SAM_IMAGES = 'sam-3.1-images';
/** Largest proxy clip the app may upload (720p, a short segment). */
export const SAM_MAX_UPLOAD = 40 * 1024 * 1024;
/** Meta bills at least 50 frames per video request. */
const MIN_FRAMES = 50;

const fileId = z.string().regex(/^file-[A-Za-z0-9_-]{1,80}$/);

export const samSchema = z
  .object({
    // a short noun phrase ("person"), or box/point prompt tokens ("<0f>1<|box;...|>")
    prompt: z
      .string()
      .min(1)
      .max(4_000)
      .refine((p) => p.startsWith('<') || p.length <= 80, 'prompt too long'),
    file_id: fileId.optional(),
    image: z
      .string()
      .max(3_000_000)
      .regex(/^data:image\/(jpeg|png);base64,/)
      .optional(),
    /** frames in the uploaded proxy; the app counts them before upload */
    frames: z.number().int().min(1).max(3_000).default(MIN_FRAMES),
    direction: z.enum(['both', 'forward', 'backward']).optional(),
  })
  .refine((b) => Boolean(b.file_id) !== Boolean(b.image), 'one media part');

export const samDeleteSchema = z.object({ file_id: fileId });

const auth = (config: AiConfig) => ({ Authorization: `Bearer ${config.key}` });

/** Uploads the proxy clip (raw MP4 body) to Meta's Files API. */
export async function samUpload(
  request: Request,
  config: AiConfig,
  fetcher: typeof fetch,
): Promise<{ file_id: string; bytes: number }> {
  const declared = Number(request.headers.get('Content-Length') ?? '0');
  if (declared > SAM_MAX_UPLOAD)
    throw new HttpError(413, 'too_large', 'Clip segment too large for SAM');
  const type = request.headers.get('Content-Type') ?? '';
  if (!/^video\/(mp4|quicktime)/.test(type))
    throw new HttpError(415, 'unsupported_media', 'Send an MP4 segment');
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > SAM_MAX_UPLOAD)
    throw new HttpError(413, 'too_large', 'Clip segment too large for SAM');
  const form = new FormData();
  form.append('purpose', 'user_data');
  form.append(
    'file',
    new Blob([bytes], { type: 'video/mp4' }),
    'kimo-segment.mp4',
  );
  const response = await fetcher(`${config.baseUrl}/files`, {
    method: 'POST',
    headers: auth(config),
    body: form,
  });
  if (!response.ok) {
    console.log(JSON.stringify({ ai: 'sam-upload', status: response.status }));
    throw new HttpError(502, 'ai_upstream', 'SAM upload failed; try again');
  }
  const body = (await response.json().catch(() => ({}))) as { id?: unknown };
  const id = fileId.safeParse(body.id);
  if (!id.success)
    throw new HttpError(502, 'ai_upstream', 'SAM upload gave no file id');
  return { file_id: id.data, bytes: bytes.byteLength };
}

/** Deletes an uploaded proxy clip once the app has its tracks. */
export async function samDelete(
  config: AiConfig,
  fetcher: typeof fetch,
  id: string,
) {
  const response = await fetcher(`${config.baseUrl}/files/${id}`, {
    method: 'DELETE',
    headers: auth(config),
  });
  return { deleted: response.ok };
}

/**
 * Runs one segmentation and streams Meta's server-sent events straight
 * through. Frames are charged before the call (at least 50, as Meta bills);
 * if the closing usage reports more, the difference is charged too.
 */
export async function samSegment(
  env: Env,
  config: AiConfig,
  fetcher: typeof fetch,
  body: z.infer<typeof samSchema>,
): Promise<Response> {
  const video = Boolean(body.file_id);
  const charged = video ? Math.max(MIN_FRAMES, body.frames) : 1;
  const model = (env.META_SAM_MODEL ?? '').trim() || SAM_MODEL;
  const metadata: Record<string, string> = { mask_encoding: 'one_bit' };
  if (body.direction && body.prompt.startsWith('<'))
    metadata.propagation_direction = body.direction;
  const response = await fetcher(`${config.baseUrl}/responses`, {
    method: 'POST',
    headers: {
      ...auth(config),
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({
      model,
      stream: true,
      metadata,
      input: [
        {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_text', text: body.prompt },
            video
              ? { type: 'input_video', file_id: body.file_id }
              : { type: 'input_image', image_url: body.image },
          ],
        },
      ],
    }),
  });
  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '');
    console.log(
      JSON.stringify({
        ai: 'sam',
        status: response.status,
        error: text.slice(0, 300),
      }),
    );
    if (response.status === 400) {
      let message = 'SAM refused that request';
      try {
        const parsed = JSON.parse(text) as { error?: { message?: unknown } };
        if (typeof parsed.error?.message === 'string')
          message = parsed.error.message.slice(0, 200);
      } catch {
        /* keep the generic message */
      }
      throw new HttpError(400, 'sam_invalid', message);
    }
    throw new HttpError(502, 'ai_upstream', 'SAM could not answer; try again');
  }
  await recordUsage(env, video ? SAM_FRAMES : SAM_IMAGES, {
    prompt: charged,
    completion: 0,
  });
  // Keep only the stream's tail: the closing event carries the usage block.
  let tail = new Uint8Array(0);
  const keep = 16_384;
  const tap = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      controller.enqueue(chunk);
      const joined = new Uint8Array(Math.min(keep, tail.length + chunk.length));
      const all = tail.length + chunk.length;
      const from = all - joined.length;
      if (from < tail.length) {
        joined.set(tail.subarray(from));
        joined.set(chunk, tail.length - from);
      } else joined.set(chunk.subarray(from - tail.length));
      tail = joined;
    },
    async flush() {
      if (!video) return;
      const text = new TextDecoder().decode(tail);
      const billed = Number(
        /"video_frames_processed"\s*:\s*(\d+)/.exec(text)?.[1],
      );
      if (Number.isFinite(billed) && billed > charged)
        await recordUsage(env, SAM_FRAMES, {
          prompt: billed - charged,
          completion: 0,
        }).catch(() => undefined);
    },
  });
  return new Response(response.body.pipeThrough(tap), {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      'X-Kimo-Sam-Frames': String(charged),
    },
  });
}
