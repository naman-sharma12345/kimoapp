/** Minimal slice of the Cloudflare D1 binding this worker uses. */
export interface D1Result<T> {
  results: T[];
}
export interface D1RunResult {
  meta: { changes: number };
}
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1RunResult>;
}
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<unknown[]>;
}

/** Minimal slice of a Durable Object namespace binding. */
export interface DurableObjectStubLike {
  fetch(input: Request | string, init?: RequestInit): Promise<Response>;
}
export interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStubLike;
}

export interface Env {
  DB: D1Database;
  /** https://app.getkimo.tech */
  APP_ORIGIN: string;
  /** https://api.getkimo.tech */
  API_ORIGIN: string;
  /** .getkimo.tech, empty for host-only cookies */
  COOKIE_DOMAIN: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  /** SessionRoom Durable Objects (SQLite-backed, Workers Free) for realtime. */
  ROOMS?: DurableObjectNamespaceLike;
  /** Meta Model API key, a Worker secret Naman adds in the dashboard. */
  META_API_KEY?: string;
  /** OpenAI-compatible base URL, default https://api.meta.ai/v1. */
  META_API_BASE_URL?: string;
  /** Model id, default muse-spark-1.3-contributor. */
  META_MODEL?: string;
  /** Model for requests that carry frames or audio (default contributor). */
  META_MEDIA_MODEL?: string;
  /** Total USD cap for kimo's own key (default 10); BYOK is not counted. */
  AI_BUDGET_USD?: string;
  /** The kimo v6 engine Space, e.g. https://getkimo-kimo-engine.hf.space */
  KIMO_ENGINE_URL?: string;
  /** Shared secret the engine checks in X-Engine-Token. */
  KIMO_ENGINE_TOKEN?: string;
  /** Hugging Face token that opens the private Space. */
  KIMO_ENGINE_HF_TOKEN?: string;
}
