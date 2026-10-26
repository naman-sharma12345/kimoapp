import { z } from 'zod';
import * as s from './schema.ts';

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
  ): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers:
        body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const result = s.errorResponseSchema.safeParse(await response.json());
      throw new KimoApiError(
        response.status,
        result.success ? result.data.code : 'http_error',
        result.success ? result.data.message : response.statusText,
      );
    }
    if (response.status === 202) return schema.parse(undefined);
    return schema.parse(await response.json());
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
  session(id: string) {
    return this.request(
      `/v1/sessions/${encodeURIComponent(id)}`,
      s.sessionSnapshotSchema,
    );
  }
  message(id: string, body: z.input<typeof s.messageRequestSchema>) {
    return this.request(
      `/v1/sessions/${encodeURIComponent(id)}/messages`,
      z.undefined(),
      s.messageRequestSchema.parse(body),
    );
  }
  ops(id: string, body: z.input<typeof s.opsRequestSchema>) {
    return this.request(
      `/v1/sessions/${encodeURIComponent(id)}/ops`,
      s.opsResponseSchema,
      s.opsRequestSchema.parse(body),
    );
  }
  approve(id: string) {
    return this.request(
      `/v1/sessions/${encodeURIComponent(id)}/approve`,
      s.approveResponseSchema,
      {},
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
        resolve();
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
