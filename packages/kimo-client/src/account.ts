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

export const projectTitleSchema = z.string().trim().min(1).max(120);

export const projectCreateSchema = z.union([
  z.object({ duplicateOf: z.string().min(1) }).strict(),
  z
    .object({
      title: projectTitleSchema,
      prompt: z.string().max(4000).default(''),
      aspect: projectAspectSchema.default('16:9'),
      sessionId: z.string().min(1).max(200).optional(),
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

export const exportSchema = z
  .object({
    exportedAt: z.string().min(1),
    user: meUserSchema,
    preferences: preferencesSchema,
    projects: z.array(apiProjectSchema),
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
