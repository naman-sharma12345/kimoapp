import { z } from 'zod';

const id = z.string().min(1);
const seconds = z.number().finite().nonnegative();
const positive = z.number().finite().positive();
const unit = z.number().min(0).max(1);
export const aspectSchema = z.enum(['16:9', '9:16', '1:1', 'auto']);
export const textStyleIdSchema = id;
export const effectSchema = z
  .object({
    id,
    type: id,
    params: z.record(z.unknown()),
    enabled: z.boolean().optional(),
  })
  .strict();
export const keyframeSchema = z
  .object({
    id,
    property: id,
    time: seconds,
    value: z.number().finite(),
    easing: z
      .enum(['linear', 'ease-out', 'ease-in-out', 'ease-in', 'hold', 'bezier'])
      .default('linear'),
    out: z.tuple([z.number().finite(), z.number().finite()]).optional(),
    in: z.tuple([z.number().finite(), z.number().finite()]).optional(),
  })
  .strict();
export const markerSchema = z
  .object({ id, time: seconds, label: z.string() })
  .strict();
export const transitionSchema = z
  .object({ type: id, duration: positive })
  .strict();
export const assetSchema = z
  .object({
    id,
    kind: z.enum(['video', 'image', 'audio', 'doc']),
    name: z.string(),
    url: z.string().url(),
    proxyUrl: z.string().url().optional(),
    thumbUrl: z.string().url().optional(),
    durationSec: positive.optional(),
    width: positive.int().optional(),
    height: positive.int().optional(),
    source: z.enum(['user', 'web']),
    attribution: z
      .object({
        site: id,
        pageUrl: z.string().url(),
        license: z.string().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export const transformSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    scale: positive,
    rotation: z.number().finite(),
    opacity: unit,
    crop: z.object({ l: unit, t: unit, r: unit, b: unit }).strict().optional(),
  })
  .strict();
export const clipSchema = z
  .object({
    id,
    trackId: id,
    assetId: id.optional(),
    kind: z.enum(['video', 'image', 'audio', 'text', 'shape', 'adjustment']),
    start: seconds,
    duration: positive,
    in: seconds,
    transform: transformSchema,
    text: z
      .object({
        content: z.string(),
        style: textStyleIdSchema,
        size: positive.optional(),
        align: z.enum(['left', 'center', 'right']).optional(),
        color: z
          .string()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .optional(),
        animation: z
          .enum(['none', 'fade', 'rise', 'type on', 'pop words'])
          .optional(),
        position: z.enum(['bottom', 'middle', 'top']).optional(),
        words: z
          .array(z.object({ t: seconds, d: positive, w: z.string() }).strict())
          .optional(),
      })
      .strict()
      .optional(),
    effects: z.array(effectSchema),
    keyframes: z.array(keyframeSchema),
    mask: z
      .object({
        kind: z.literal('sam'),
        maskAssetId: id,
        invert: z.boolean(),
        feather: seconds,
        scope: z.enum(['subject', 'background']).optional(),
        label: z.string().optional(),
      })
      .strict()
      .optional(),
    speed: positive,
    keepPitch: z.boolean().optional(),
    cropAspectLock: z.boolean().optional(),
    fadeIn: seconds.optional(),
    fadeOut: seconds.optional(),
    duckUnderVoice: z.boolean().optional(),
    volume: seconds.optional(),
    transitionIn: transitionSchema.nullable().optional(),
    transitionOut: transitionSchema.nullable().optional(),
    locked: z.boolean().optional(),
  })
  .strict();
export const trackSchema = z
  .object({
    id,
    kind: z.enum(['video', 'overlay', 'text', 'audio']),
    name: z.string(),
    muted: z.boolean(),
    hidden: z.boolean(),
    locked: z.boolean(),
    height: z.union([z.literal(48), z.literal(64), z.literal(88)]),
  })
  .strict();
export const projectSchema = z
  .object({
    id,
    version: z.number().int().nonnegative(),
    fps: z.literal(30),
    width: z.union([z.literal(1920), z.literal(1080)]),
    height: z.union([z.literal(1080), z.literal(1920)]),
    duration: seconds,
    background: z.enum(['black', 'white', 'cream']).optional(),
    notes: z.string().optional(),
    tracks: z.array(trackSchema),
    clips: z.record(clipSchema),
    markers: z.array(markerSchema),
  })
  .strict()
  .superRefine((project, ctx) => {
    if (project.width === 1920 && project.height === 1920)
      ctx.addIssue({
        code: 'custom',
        message: 'Unsupported project dimensions',
      });
    const tracks = new Set(project.tracks.map((track) => track.id));
    if (tracks.size !== project.tracks.length)
      ctx.addIssue({ code: 'custom', message: 'Duplicate track IDs' });
    for (const [key, clip] of Object.entries(project.clips)) {
      if (key !== clip.id || !tracks.has(clip.trackId))
        ctx.addIssue({
          code: 'custom',
          message: 'Clip key or track reference is invalid',
          path: ['clips', key],
        });
    }
  });
export const opSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('marker.remove'), id }).strict(),
  z
    .object({
      op: z.literal('clip.unset'),
      id,
      fields: z
        .array(
          z.enum([
            'keepPitch',
            'cropAspectLock',
            'fadeIn',
            'fadeOut',
            'duckUnderVoice',
            'volume',
            'transitionIn',
            'transitionOut',
            'locked',
            'mask',
            'text',
            'assetId',
          ]),
        )
        .min(1),
    })
    .strict(),
  z
    .object({
      op: z.literal('project.update'),
      patch: z
        .object({
          width: z.union([z.literal(1920), z.literal(1080)]).optional(),
          height: z.union([z.literal(1080), z.literal(1920)]).optional(),
          background: z.enum(['black', 'white', 'cream']).optional(),
          notes: z.string().optional(),
        })
        .strict(),
    })
    .strict(),
  z.object({ op: z.literal('track.remove'), id }).strict(),
  z.object({ op: z.literal('clip.add'), clip: clipSchema }).strict(),
  z
    .object({
      op: z.literal('clip.update'),
      id,
      patch: clipSchema.omit({ id: true }).partial(),
    })
    .strict(),
  z.object({ op: z.literal('clip.remove'), id }).strict(),
  z
    .object({ op: z.literal('clip.move'), id, trackId: id, start: seconds })
    .strict(),
  z
    .object({
      op: z.literal('clip.trim'),
      id,
      edge: z.enum(['in', 'out']),
      value: seconds,
    })
    .strict(),
  z
    .object({ op: z.literal('clip.split'), id, at: seconds, newId: id })
    .strict(),
  z.object({ op: z.literal('track.add'), track: trackSchema }).strict(),
  z
    .object({
      op: z.literal('track.update'),
      id,
      patch: trackSchema.omit({ id: true }).partial(),
    })
    .strict(),
  z
    .object({ op: z.literal('text.update'), clipId: id, content: z.string() })
    .strict(),
  z
    .object({ op: z.literal('effect.set'), clipId: id, effect: effectSchema })
    .strict(),
  z
    .object({
      op: z.literal('keyframe.set'),
      clipId: id,
      keyframe: keyframeSchema,
    })
    .strict(),
  z.object({ op: z.literal('marker.add'), marker: markerSchema }).strict(),
]);
export const sessionStatusSchema = z.enum([
  'warming',
  'editing',
  'awaiting_review',
  'rendering',
  'done',
  'failed',
]);
export const uploadRequestSchema = z
  .object({
    files: z
      .array(
        z
          .object({ name: id, size: z.number().int().nonnegative(), mime: id })
          .strict(),
      )
      .min(1),
  })
  .strict();
export const uploadResponseSchema = z
  .object({
    uploads: z.array(
      z.union([
        z
          .object({
            assetId: id,
            putUrl: z.string().url(),
            headers: z.record(z.string()),
          })
          .strict(),
        z
          .object({
            assetId: id,
            parts: z
              .array(
                z
                  .object({
                    partNumber: z.number().int().positive(),
                    putUrl: z.string().url(),
                  })
                  .strict(),
              )
              .min(1),
            headers: z.record(z.string()),
          })
          .strict(),
      ]),
    ),
  })
  .strict();
export type UploadTarget = z.infer<
  typeof uploadResponseSchema
>['uploads'][number];
export const uploadCompletionSchema = z
  .object({
    parts: z
      .array(
        z
          .object({ partNumber: z.number().int().positive(), etag: id })
          .strict(),
      )
      .min(1),
  })
  .strict();
export const uploadCompletedSchema = z.object({ assetId: id }).strict();
export const sessionRequestSchema = z
  .object({
    prompt: id,
    assetIds: z.array(id),
    aspect: aspectSchema,
    durationHint: positive.optional(),
  })
  .strict();
export const sessionResponseSchema = z
  .object({ sessionId: id, wsUrl: z.string().url() })
  .strict();
export const sessionSnapshotSchema = z
  .object({
    status: sessionStatusSchema,
    project: projectSchema,
    assets: z.array(assetSchema),
    renderId: id.optional(),
    videoId: id.optional(),
    wsUrl: z.string().url().optional(),
    actionCount: z.number().int().nonnegative().optional(),
    paused: z.boolean().optional(),
    agentState: z
      .enum(['thinking', 'acting', 'waiting_user', 'idle'])
      .optional(),
    createdAt: z.number().int().nonnegative().optional(),
  })
  .strict();
export const messageRequestSchema = z
  .object({ text: id, attachments: z.array(id).optional() })
  .strict();
export const opsRequestSchema = z
  .object({
    ops: z.array(opSchema).min(1),
    baseVersion: z.number().int().nonnegative(),
  })
  .strict();
export const opsResponseSchema = z
  .object({ version: z.number().int().nonnegative() })
  .strict();
export const approveRequestSchema = z
  .object({
    burnInCaptions: z.boolean().optional(),
    title: id.optional(),
  })
  .strict();
export const approveResponseSchema = z.object({ renderId: id }).strict();
export const renderResponseSchema = z
  .object({
    status: z.enum(['queued', 'rendering', 'done', 'failed', 'cancelled']),
    progress: unit,
    frame: z.number().int().nonnegative(),
    totalFrames: z.number().int().positive(),
    etaSec: seconds,
    title: id.optional(),
    burnInCaptions: z.boolean().optional(),
    videoId: id.optional(),
    sessionId: id.optional(),
    error: z.string().optional(),
    width: positive.int().optional(),
    height: positive.int().optional(),
  })
  .strict();
export const videoResponseSchema = z
  .object({
    url: z.string().url(),
    posterUrl: z.string().url(),
    durationSec: positive,
    width: positive.int(),
    height: positive.int(),
    sizeBytes: z.number().int().nonnegative(),
    title: id,
    sessionId: id.optional(),
    captionsUrl: z.string().url().optional(),
    sessionExpiresAt: z.number().nonnegative().optional(),
    madeInSec: seconds.optional(),
    fps: positive.optional(),
    actionGroups: z
      .array(
        z
          .object({ summary: id, stepCount: z.number().int().positive() })
          .strict(),
      )
      .optional(),
    models: z.array(id).optional(),
    sprite: z
      .object({
        url: z.string().url(),
        tileWidth: positive.int(),
        tileHeight: positive.int(),
        columns: positive.int(),
        intervalSec: positive,
      })
      .strict()
      .optional(),
  })
  .strict();
export type RenderSnapshot = z.infer<typeof renderResponseSchema>;
export type DeliveredVideo = z.infer<typeof videoResponseSchema>;
export const errorResponseSchema = z.object({ code: id, message: id }).strict();
export const serverEventSchema = z.discriminatedUnion('t', [
  z
    .object({ t: z.literal('hello'), version: z.number().int().nonnegative() })
    .strict(),
  z
    .object({
      t: z.literal('agent.status'),
      state: z.enum(['thinking', 'acting', 'waiting_user', 'idle']),
      label: z.string(),
    })
    .strict(),
  z
    .object({
      t: z.literal('agent.action.start'),
      id,
      tool: z.string().regex(/^[a-z][a-z0-9_]*$/),
      title: id,
      args: z.record(z.unknown()),
      target: z
        .object({
          clipId: id.optional(),
          trackId: id.optional(),
          region: z
            .object({ x: z.number(), y: z.number(), w: positive, h: positive })
            .strict()
            .optional(),
        })
        .strict()
        .optional(),
    })
    .strict(),
  z
    .object({
      t: z.literal('agent.action.progress'),
      id,
      pct: unit.optional(),
      note: z.string().optional(),
    })
    .strict(),
  z
    .object({
      t: z.literal('agent.action.end'),
      id,
      ok: z.boolean(),
      error: z.string().optional(),
      durationMs: seconds,
    })
    .strict(),
  z
    .object({
      t: z.literal('project.ops'),
      version: z.number().int().nonnegative(),
      ops: z.array(opSchema),
      actionId: id.optional(),
    })
    .strict(),
  z
    .object({
      t: z.literal('agent.message'),
      id,
      role: z.literal('agent'),
      text: z.string(),
      kind: z.enum(['say', 'ask_review', 'ask_choice']),
      choices: z.array(z.string()).max(4).optional(),
      stream: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      t: z.literal('asset.added'),
      asset: assetSchema,
      actionId: id.optional(),
    })
    .strict(),
  z
    .object({
      t: z.literal('sam.mask'),
      clipId: id,
      maskAssetId: id,
      previewPolygon: z.array(z.tuple([z.number(), z.number()])),
    })
    .strict(),
  z
    .object({
      t: z.literal('warmup.step'),
      step: z.enum(['upload', 'probe', 'watch', 'plan', 'ready']),
      pct: unit,
      clipIndex: z.number().int().positive().optional(),
      clipCount: z.number().int().positive().optional(),
    })
    .strict(),
  z.object({ t: z.literal('error'), code: id, message: z.string() }).strict(),
]);
export const clientEventSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('retry'), actionId: id }).strict(),
  z.object({ t: z.literal('interrupt'), text: id }).strict(),
  z.object({ t: z.literal('pause') }).strict(),
  z.object({ t: z.literal('resume') }).strict(),
  z.object({ t: z.literal('ping') }).strict(),
]);
export type Asset = z.infer<typeof assetSchema>;
export type Clip = z.infer<typeof clipSchema>;
export type Track = z.infer<typeof trackSchema>;
export type KimoProject = z.infer<typeof projectSchema>;
export type Op = z.infer<typeof opSchema>;
export type Effect = z.infer<typeof effectSchema>;
export type Keyframe = z.infer<typeof keyframeSchema>;
export type Marker = z.infer<typeof markerSchema>;
export type Transition = z.infer<typeof transitionSchema>;
export type TextStyleId = z.infer<typeof textStyleIdSchema>;
export type ServerEvent = z.infer<typeof serverEventSchema>;
export type ClientEvent = z.infer<typeof clientEventSchema>;
export type SessionSnapshot = z.infer<typeof sessionSnapshotSchema>;
