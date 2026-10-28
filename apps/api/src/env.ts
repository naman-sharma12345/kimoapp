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
}
