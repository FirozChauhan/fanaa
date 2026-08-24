import postgres from "postgres";
import { neon } from "@neondatabase/serverless";
import { DATABASE_URL } from "./env";

/**
 * Unified query handle — both drivers expose a tagged-template callable:
 *
 *   s`SELECT * FROM x WHERE id = ${id}`
 *
 * Driver is chosen by URL: Neon URLs (neon.tech) use @neondatabase/serverless
 * (HTTP, works on Cloudflare Workers in prod); anything else — typically a
 * local Postgres for dev — uses postgres.js over TCP. Same code, both paths.
 */
type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;

let _sql: Sql | null = null;

/** Lazily-created database handle. Throws with a clear message on first use if DATABASE_URL is missing. */
export function db(): Sql {
  if (!_sql) {
    if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");
    _sql = DATABASE_URL.includes("neon.tech")
      ? (neon(DATABASE_URL) as unknown as Sql)
      : (postgres(DATABASE_URL, { max: 1 }) as unknown as Sql);
  }
  return _sql;
}

/** Normalize a DB timestamp (Date or ISO string) to ISO for JSON responses. */
export function toISO(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}
