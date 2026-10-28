import { z } from 'zod';
import * as s from './schema.ts';
import * as a from './account.ts';
import { resolveAssets } from './local-assets.ts';

export class KimoApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'KimoApiError';
    this.status = status;
    this.code = code;
  }
}
/** Per-request headers carrying the user's own key; never stored. */
export function aiHeaders(ai: s.AiCredentials): Record<string, string> {
  return {
    'X-AI-Key': ai.key.trim(),
    'X-AI-Provider': ai.provider,
    ...(ai.model?.trim() ? { 'X-AI-Model': ai.model.trim() } : {}),
    ...(ai.provider === 'custom' && ai.baseUrl?.trim()
      ? { 'X-AI-Base-URL': ai.baseUrl.trim() }
      : {}),
  };
}
export class KimoClient {
  readonly baseUrl: string;
  private readonly fetcher: typeof fetch;
  constructor(
    baseUrl = process.env.NEXT_PUBLIC_KIMO_API ?? 'http://localhost:8787',
    fetcher: typeof fetch = globalThis.fetch.bind(globalThis),
  ) {
    this.baseUrl = baseUrl;
    this.fetcher = fetcher;
  }
  private async request<T>(
    path: string,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    body?: unknown,
    extra?: Record<string, string>,
  ): Promise<T> {
    const headers = {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...extra,
    };
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      credentials: 'include',
      signal: AbortSignal.timeout(30000),
      method: body === undefined ? 'GET' : 'POST',
      headers: Object.keys(headers).length ? headers : undefined,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const result = s.errorResponseSchema.safeParse(
        await response.json().catch(() => null),
      );
      throw new KimoApiError(
        response.status,
        result.success ? result.data.code : 'http_error',
        result.success ? result.data.message : response.statusText,
      );
    }
    if (response.status === 202) return schema.parse(undefined);
    return schema.parse(await response.json());
  }
  /** JSON call with any method; 202/204 answers parse as undefined. */
  private async send<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    body?: unknown,
  ): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      credentials: 'include',
      signal: AbortSignal.timeout(30000),
      method,
      headers:
        body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const result = s.errorResponseSchema.safeParse(
        await response.json().catch(() => null),
      );
      throw new KimoApiError(
        response.status,
        result.success ? result.data.code : 'http_error',
        result.success ? result.data.message : response.statusText,
      );
    }
    if (response.status === 202 || response.status === 204)
      return schema.parse(undefined);
    return schema.parse(await response.json());
  }
  auth() {
    return this.request('/v1/auth/session', s.authSchema);
  }
  /** Sign-in providers the API has configured right now. */
  providers() {
    return this.send('GET', '/v1/auth/providers', a.providersSchema);
  }
  /** Start URL for an OAuth sign-in with the given provider. */
  signInUrl(provider: a.AuthProvider, returnTo: string) {
    const url = new URL(`/v1/auth/${provider}`, this.baseUrl);
    url.searchParams.set('returnTo', returnTo);
    return url.toString();
  }
  signOut() {
    return this.send('POST', '/v1/auth/signout', z.undefined());
  }
  me() {
    return this.send('GET', '/v1/me', a.meSchema);
  }
  updatePreferences(patch: Partial<a.Preferences>) {
    return this.send(
      'PATCH',
      '/v1/me/preferences',
      a.preferencesResponseSchema,
      patch,
    );
  }
  exportAccount() {
    return this.send('GET', '/v1/me/export', a.exportSchema);
  }
  deleteAccount() {
    return this.send('DELETE', '/v1/me', z.undefined());
  }
  projects() {
    return this.send('GET', '/v1/projects', a.projectListSchema);
  }
  createProject(body: a.ProjectCreate) {
    return this.send(
      'POST',
      '/v1/projects',
      a.projectResponseSchema,
      a.projectCreateSchema.parse(body),
    );
  }
  duplicateProject(id: string) {
    return this.createProject({ duplicateOf: id });
  }
  updateProject(id: string, patch: a.ProjectPatch) {
    return this.send(
      'PATCH',
      `/v1/projects/${encodeURIComponent(id)}`,
      a.projectResponseSchema,
      a.projectPatchSchema.parse(patch),
    );
  }
  deleteProject(id: string) {
    return this.send(
      'DELETE',
      `/v1/projects/${encodeURIComponent(id)}`,
      z.undefined(),
    );
  }
  restoreProject(id: string) {
    return this.send(
      'POST',
      `/v1/projects/${encodeURIComponent(id)}/restore`,
      a.projectResponseSchema,
    );
  }
  googleSignInUrl(returnTo: string) {
    const url = new URL('/v1/auth/google', this.baseUrl);
    url.searchParams.set('returnTo', returnTo);
    return url.toString();
  }
  uploads(body: z.input<typeof s.uploadRequestSchema>) {
    return this.request(
      '/v1/uploads',
      s.uploadResponseSchema,
      s.uploadRequestSchema.parse(body),
    );
  }
  createSession(body: z.input<typeof s.sessionRequestSchema>) {
    return this.request(
      '/v1/sessions',
      s.sessionResponseSchema,
      s.sessionRequestSchema.parse(body),
    );
  }
  renewUpload(assetId: string) {
    return this.request(
      `/v1/uploads/${encodeURIComponent(assetId)}/renew`,
      s.uploadResponseSchema,
      {},
    );
  }
  completeUpload(
    assetId: string,
    body: z.input<typeof s.uploadCompletionSchema>,
  ) {
    return this.request(
      `/v1/uploads/${encodeURIComponent(assetId)}/complete`,
      s.uploadCompletedSchema,
      s.uploadCompletionSchema.parse(body),
    );
  }
  async attachAssets(sessionId: string, assetIds: string[]) {
    const result = await this.request(
      `/v1/sessions/${encodeURIComponent(sessionId)}/assets/add`,
      z.object({ assets: z.array(s.assetSchema) }).strict(),
      { assetIds },
    );
    return { assets: resolveAssets(result.assets) };
  }
  detachAsset(sessionId: string, assetId: string) {
    return this.request(
      `/v1/sessions/${encodeURIComponent(sessionId)}/assets/remove`,
      z.undefined(),
      { assetId },
    );
  }
  async session(id: string) {
    const snapshot = await this.request(
      `/v1/sessions/${encodeURIComponent(id)}`,
      s.sessionSnapshotSchema,
    );
    return { ...snapshot, assets: resolveAssets(snapshot.assets) };
  }
  /** Whether AI editing is switched on for this server right now. */
  aiStatus() {
    return this.send('GET', '/v1/ai/status', s.aiStatusSchema);
  }
  /** The provider's real model list, fetched with the user's own key. */
  aiModels(ai: s.AiCredentials) {
    return this.request('/v1/ai/models', s.aiModelsSchema, undefined, {
      ...aiHeaders({ ...ai, model: undefined }),
    });
  }
  /** Sends numbers measured from clips in this tab (never the media). */
  sendAnalysis(id: string, body: z.input<typeof s.analysisRequestSchema>) {
    return this.send(
      'POST',
      `/v1/sessions/${encodeURIComponent(id)}/analysis`,
      z.undefined(),
      s.analysisRequestSchema.parse(body),
    );
  }
  /** Counts a finished in-browser export toward today's usage. */
  recordExport(id: string, body: z.input<typeof s.exportRecordSchema>) {
    return this.send(
      'POST',
      `/v1/sessions/${encodeURIComponent(id)}/exports`,
      z.undefined(),
      s.exportRecordSchema.parse(body),
    );
  }
  cancelSession(id: string) {
    return this.request(
      `/v1/sessions/${encodeURIComponent(id)}/cancel`,
      z.undefined(),
      {},
    );
  }
  /** An AI note; with `ai`, it runs on the user's own key and model. */
  message(
    id: string,
    body: z.input<typeof s.messageRequestSchema>,
    ai?: s.AiCredentials | null,
  ) {
    return this.request(
      `/v1/sessions/${encodeURIComponent(id)}/messages`,
      z.undefined(),
      s.messageRequestSchema.parse(body),
      ai ? aiHeaders(ai) : undefined,
    );
  }
  ops(id: string, body: z.input<typeof s.opsRequestSchema>) {
    return this.request(
      `/v1/sessions/${encodeURIComponent(id)}/ops`,
      s.opsResponseSchema,
      s.opsRequestSchema.parse(body),
    );
  }
  reopenSession(id: string) {
    return this.request(
      `/v1/sessions/${encodeURIComponent(id)}/reopen`,
      z.undefined(),
      {},
    );
  }
  cancelRender(id: string) {
    return this.request(
      `/v1/renders/${encodeURIComponent(id)}/cancel`,
      z.undefined(),
      {},
    );
  }
  renderFrameUrl(id: string, frame: number) {
    return `${this.baseUrl}/v1/renders/${encodeURIComponent(id)}/frame.jpg?n=${Math.max(0, Math.floor(frame))}`;
  }
  approve(id: string, options: z.input<typeof s.approveRequestSchema> = {}) {
    return this.request(
      `/v1/sessions/${encodeURIComponent(id)}/approve`,
      s.approveResponseSchema,
      s.approveRequestSchema.parse(options),
    );
  }
  render(id: string) {
    return this.request(
      `/v1/renders/${encodeURIComponent(id)}`,
      s.renderResponseSchema,
    );
  }
  video(id: string) {
    return this.request(
      `/v1/videos/${encodeURIComponent(id)}`,
      s.videoResponseSchema,
    );
  }
}

/** Presigned PUT with browser upload progress; caller may cancel the returned request. */
export function putUpload(
  url: string,
  file: Blob,
  headers: Record<string, string>,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return putUploadPart(url, file, headers, onProgress, signal).then(
    () => undefined,
  );
}

export function putUploadPart(
  url: string,
  file: Blob,
  headers: Record<string, string>,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const abort = () => xhr.abort();
    if (signal?.aborted) {
      reject(new DOMException('Upload aborted', 'AbortError'));
      return;
    }
    xhr.open('PUT', url);
    for (const [key, value] of Object.entries(headers))
      xhr.setRequestHeader(key, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve(xhr.getResponseHeader('ETag') ?? 'uploaded');
      } else
        reject(new KimoApiError(xhr.status, 'upload_failed', 'Upload failed'));
    };
    xhr.onerror = () => reject(new Error('Upload network error'));
    xhr.onabort = () =>
      reject(new DOMException('Upload aborted', 'AbortError'));
    xhr.onloadend = () => signal?.removeEventListener('abort', abort);
    signal?.addEventListener('abort', abort, { once: true });
    xhr.send(file);
  });
}
