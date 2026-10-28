import { HttpError } from './http.ts';

/**
 * Bring-your-own-key AI. A user may send their own provider key with a
 * request (X-AI-Key header, over HTTPS). The Worker forwards it to the
 * chosen provider for that one request and then drops it: it is never
 * written to D1, KV, logs, error messages or responses.
 */
export const AI_PROVIDERS = [
  'openai',
  'anthropic',
  'gemini',
  'groq',
  'openrouter',
  'meta',
  'custom',
] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

/** How the request is shaped on the wire. */
export type AiWire = 'openai' | 'anthropic';

export const PROVIDER_BASE_URLS: Record<
  Exclude<AiProvider, 'custom'>,
  string
> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  meta: 'https://api.meta.ai/v1',
};

export const AI_HEADERS = {
  key: 'X-AI-Key',
  provider: 'X-AI-Provider',
  model: 'X-AI-Model',
  baseUrl: 'X-AI-Base-URL',
} as const;

const KEY = /^[\x21-\x7e]{8,512}$/;
export const MODEL_ID = /^[A-Za-z0-9._:/@+-]{1,200}$/;

export interface UserAiConfig {
  source: 'user';
  provider: AiProvider;
  wire: AiWire;
  key: string;
  baseUrl: string;
  /** Empty when only listing models. */
  model: string;
}

const bad = (code: string, message: string): never => {
  throw new HttpError(400, code, message);
};

/** True for hosts a user-supplied base URL must never reach. */
export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (!host) return true;
  if (host.startsWith('[') || host.includes(':')) {
    // IPv6 literal: refuse all of them (loopback, link-local, ULA, mapped v4).
    return true;
  }
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (v4.slice(1).some((part) => Number(part) > 255)) return true;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  // Numeric-looking hosts in other notations (0x7f.1, 2130706433) are refused.
  if (/^[0-9.x]+$/i.test(host)) return true;
  if (!host.includes('.')) return true;
  return (
    host === 'localhost' ||
    /\.(localhost|local|internal|intranet|lan|home|corp|home\.arpa|in-addr\.arpa|ip6\.arpa)$/.test(
      host,
    ) ||
    host === 'metadata.google.internal' ||
    host === 'getkimo.tech' ||
    host.endsWith('.getkimo.tech')
  );
}

/** A custom OpenAI-compatible base URL: public https only, no tricks. */
export function safeBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return bad('ai_base_url_invalid', 'Use a public https base URL');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.port && url.port !== '443') ||
    isBlockedHost(url.hostname)
  )
    return bad('ai_base_url_invalid', 'Use a public https base URL');
  return `${url.origin}${url.pathname}`.replace(/\/+$/, '');
}

/**
 * Reads a user's own AI settings from the request headers, or null when no
 * key was sent. Throws a 400 (never echoing the values) when they are bad.
 */
export function userAiConfig(
  headers: Headers,
  options: { requireModel: boolean } = { requireModel: true },
): UserAiConfig | null {
  const key = headers.get(AI_HEADERS.key)?.trim() ?? '';
  if (!key) return null;
  if (!KEY.test(key)) bad('ai_key_invalid', 'That API key does not look right');
  const provider = (headers.get(AI_HEADERS.provider) ?? '').trim();
  if (!(AI_PROVIDERS as readonly string[]).includes(provider))
    bad('ai_provider_invalid', 'Pick an AI provider');
  const chosen = provider as AiProvider;
  const model = (headers.get(AI_HEADERS.model) ?? '').trim();
  if (model ? !MODEL_ID.test(model) : options.requireModel)
    bad('ai_model_invalid', 'Pick a model');
  const baseUrl =
    chosen === 'custom'
      ? safeBaseUrl(headers.get(AI_HEADERS.baseUrl) ?? '')
      : PROVIDER_BASE_URLS[chosen];
  return {
    source: 'user',
    provider: chosen,
    wire: chosen === 'anthropic' ? 'anthropic' : 'openai',
    key,
    baseUrl,
    model,
  };
}

/** Removes a secret from any text before it is logged or returned. */
export function redact(text: string, secret: string | null | undefined) {
  const value = secret?.trim();
  if (!value || value.length < 4) return text;
  return text.split(value).join('[redacted]');
}

export const ANTHROPIC_VERSION = '2023-06-01';

/** Auth headers for one provider call; built per request, never stored. */
export function authHeaders(config: {
  wire: AiWire;
  key: string;
}): Record<string, string> {
  return config.wire === 'anthropic'
    ? { 'x-api-key': config.key, 'anthropic-version': ANTHROPIC_VERSION }
    : { Authorization: `Bearer ${config.key}` };
}

const MODELS_TIMEOUT_MS = 15_000;
const MAX_MODELS = 500;

export interface ModelInfo {
  id: string;
  name?: string;
}

/**
 * The provider's real model list, fetched with the user's key. Errors are
 * fixed strings; nothing from the provider's answer (which could quote the
 * key) is passed back except validated model ids and names.
 */
export async function listModels(
  config: UserAiConfig,
  fetcher: typeof fetch,
): Promise<ModelInfo[]> {
  let response: Response;
  try {
    response = await fetcher(`${config.baseUrl}/models`, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(MODELS_TIMEOUT_MS),
      headers: { Accept: 'application/json', ...authHeaders(config) },
    });
  } catch {
    throw new HttpError(502, 'ai_upstream', 'The AI provider did not answer');
  }
  if (response.status === 401 || response.status === 403)
    throw new HttpError(
      400,
      'ai_key_rejected',
      'The provider refused that key',
    );
  if (!response.ok)
    throw new HttpError(502, 'ai_upstream', 'The AI provider did not answer');
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new HttpError(502, 'ai_upstream', 'The AI provider did not answer');
  }
  const list =
    body && typeof body === 'object'
      ? ((body as { data?: unknown; models?: unknown }).data ??
        (body as { models?: unknown }).models)
      : undefined;
  if (!Array.isArray(list)) return [];
  const seen = new Set<string>();
  const models: ModelInfo[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const rawId = typeof record.id === 'string' ? record.id : record.name;
    if (typeof rawId !== 'string') continue;
    const id = rawId.replace(/^models\//, '');
    if (!MODEL_ID.test(id) || seen.has(id) || id.includes(config.key)) continue;
    seen.add(id);
    const label =
      typeof record.display_name === 'string'
        ? record.display_name
        : typeof record.displayName === 'string'
          ? record.displayName
          : config.provider === 'openrouter' && typeof record.name === 'string'
            ? record.name
            : undefined;
    const name = label
      ? redact(label.replace(/[\p{Cc}\p{Cf}]/gu, ' '), config.key)
          .trim()
          .slice(0, 120)
      : undefined;
    models.push(name && name !== id ? { id, name } : { id });
    if (models.length >= MAX_MODELS) break;
  }
  return models.sort((a, b) => a.id.localeCompare(b.id));
}
