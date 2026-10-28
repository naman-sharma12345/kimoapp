import { z } from 'zod';

/**
 * Account and project contract shared by the kimo API worker (apps/api) and
 * the web app. Real backend only; the mock server keeps its own fixtures.
 */

export const authProviderSchema = z.enum(['github', 'google']);
export type AuthProvider = z.infer<typeof authProviderSchema>;

export const projectStatusSchema = z.enum([
  'editing',
  'awaiting_review',
  'rendering',
  'done',
  'failed',
  'draft',
]);
export const projectAspectSchema = z.enum(['16:9', '9:16', '1:1']);

export const apiProjectSchema = z
  .object({
    id: z.string().min(1),
    sessionId: z.string().min(1),
    videoId: z.string().min(1).optional(),
    title: z.string(),
    prompt: z.string(),
    status: projectStatusSchema,
    aspect: projectAspectSchema,
    durationSec: z.number().nonnegative(),
    posterUrl: z.string().url().optional(),
    clipCount: z.number().int().nonnegative(),
    trackCount: z.number().int().nonnegative(),
    createdAt: z.string().min(1),
    updatedAt: z.string().min(1),
  })
  .strict();
export type ApiProject = z.infer<typeof apiProjectSchema>;

export const projectListSchema = z
  .object({ projects: z.array(apiProjectSchema) })
  .strict();
export const projectResponseSchema = z
  .object({ project: apiProjectSchema })
  .strict();

/** Project ids are server-minted UUIDs; anything else is rejected early. */
export const projectIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,64}$/, 'invalid project id');

const NO_CONTROL = /^[^\p{Cc}\p{Cf}]*$/u;

export const projectTitleSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(NO_CONTROL, 'title has control characters');

export const projectCreateSchema = z.union([
  z.object({ duplicateOf: projectIdSchema }).strict(),
  z
    .object({
      title: projectTitleSchema,
      prompt: z
        .string()
        .max(4000)
        .refine((value) => !value.includes('\u0000'), 'prompt has NUL')
        .default(''),
      aspect: projectAspectSchema.default('16:9'),
      sessionId: z
        .string()
        .regex(/^[A-Za-z0-9._:-]{1,200}$/, 'invalid session id')
        .optional(),
    })
    .strict(),
]);
export type ProjectCreate = z.input<typeof projectCreateSchema>;

export const projectPatchSchema = z
  .object({
    title: projectTitleSchema.optional(),
    status: projectStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'empty patch');
export type ProjectPatch = z.input<typeof projectPatchSchema>;

export const preferencesSchema = z
  .object({
    defaultAspect: z.enum(['auto', '16:9', '9:16', '1:1']),
    captionsDefault: z.boolean(),
    webImages: z.boolean(),
    reduceMotion: z.boolean(),
    soundOnApproval: z.boolean(),
  })
  .strict();
export type Preferences = z.infer<typeof preferencesSchema>;
export const preferencesPatchSchema = preferencesSchema
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'empty patch');

export const defaultPreferences: Preferences = {
  defaultAspect: '16:9',
  captionsDefault: true,
  webImages: true,
  reduceMotion: false,
  soundOnApproval: false,
};

export const meUserSchema = z
  .object({
    id: z.string().min(1),
    name: z.string(),
    email: z.string(),
    avatarUrl: z.string().url().optional(),
    provider: authProviderSchema,
    createdAt: z.string().min(1),
  })
  .strict();

export const usageSchema = z
  .object({
    videosToday: z.number().int().nonnegative(),
    videosLimit: z.number().int().nonnegative(),
    renderMinutes: z.number().nonnegative(),
    renderMinutesLimit: z.number().nonnegative(),
    resetsAt: z.string().min(1),
  })
  .strict();

export const meSchema = z
  .object({
    user: meUserSchema,
    usage: usageSchema,
    storage: z.object({ bytesUsed: z.number().nonnegative() }).strict(),
    preferences: preferencesSchema,
  })
  .strict();
export type Me = z.infer<typeof meSchema>;

export const preferencesResponseSchema = z
  .object({ preferences: preferencesSchema })
  .strict();

/** Sign-in providers the API can use right now (GET /v1/auth/providers). */
export const providersSchema = z
  .object({ providers: z.array(authProviderSchema) })
  .strict();

export const exportSchema = z
  .object({
    exportedAt: z.string().min(1),
    user: meUserSchema,
    /** Sign-in accounts linked to this kimo account. */
    identities: z
      .array(
        z
          .object({
            provider: authProviderSchema,
            email: z.string(),
            linkedAt: z.string(),
            lastUsedAt: z.string(),
          })
          .strict(),
      )
      .optional(),
    /** Active sign-in sessions (the token itself is never stored or exported). */
    sessions: z
      .array(
        z
          .object({
            provider: z.string(),
            createdAt: z.string(),
            expiresAt: z.string(),
          })
          .strict(),
      )
      .optional(),
    preferences: preferencesSchema,
    projects: z.array(apiProjectSchema),
    /** Projects in the bin, permanently removed 30 days after deletion. */
    deletedProjects: z
      .array(
        z.object({ project: apiProjectSchema, deletedAt: z.string() }).strict(),
      )
      .optional(),
    usage: z.array(
      z
        .object({
          day: z.string(),
          videos: z.number().int().nonnegative(),
          renderSeconds: z.number().nonnegative(),
        })
        .strict(),
    ),
  })
  .strict();
export type AccountExport = z.infer<typeof exportSchema>;

/** Daily limits for a signed-in account (free plan). */
export const DAILY_VIDEO_LIMIT = 10;
export const DAILY_RENDER_MINUTES_LIMIT = 30;
