import { readFileSync } from 'node:fs';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type {
  D1Database,
  D1PreparedStatement,
  D1Result,
  D1RunResult,
} from './env.ts';

/** D1-compatible test double backed by node:sqlite, using the real migrations. */
export function createTestDb(): D1Database & { sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(
    readFileSync(
      new URL('../migrations/0001_init.sql', import.meta.url),
      'utf8',
    ),
  );
  const statement = (
    query: string,
    values: SQLInputValue[],
  ): D1PreparedStatement => ({
    bind: (...next: unknown[]) =>
      statement(
        query,
        next.map((value) =>
          value === undefined ? null : (value as SQLInputValue),
        ),
      ),
    first: async <T>() =>
      (sqlite.prepare(query).get(...values) as T | undefined) ?? null,
    all: async <T>(): Promise<D1Result<T>> => ({
      results: sqlite.prepare(query).all(...values) as T[],
    }),
    run: async (): Promise<D1RunResult> => ({
      meta: { changes: Number(sqlite.prepare(query).run(...values).changes) },
    }),
  });
  return {
    sqlite,
    prepare: (query) => statement(query, []),
    batch: async (statements) => {
      const results: unknown[] = [];
      sqlite.exec('BEGIN');
      try {
        for (const item of statements) results.push(await item.run());
        sqlite.exec('COMMIT');
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
      return results;
    },
  };
}
