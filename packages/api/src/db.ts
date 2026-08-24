import { DATABASE_URL } from "./env";

/**
 * Unified query handle — both drivers expose a tagged-template callable:
 *
 *   s`SELECT * FROM x WHERE id = ${id}`
 *
 * Driver is chosen by URL: Neon URLs (neon.tech) use @neondatabase/serverless
 * (HTTP, works on Cloudflare Workers in prod); anything else — typically a
 * local Postgres for dev — uses postgres.js over TCP. Both live behind
 * dynamic imports so the Cloudflare bundle never instantiates postgres.js
 * (it needs node:net, which Workers don't provide); esbuild defers the
 * lazy-loaded module until the non-Neon branch is actually taken.
 */
type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;

let _sql: Sql | null = null;

/** Lazily-created database handle. Throws with a clear message on first use if DATABASE_URL is missing. */
export async function db(): Promise<Sql> {
  if (!_sql) {
    if (!DATABASE_URL) throw new Error("DATABASE_URL is not set");
    if (DATABASE_URL.includes("neon.tech")) {
      const { neon } = await import("@neondatabase/serverless");
      _sql = neon(DATABASE_URL) as unknown as Sql;
    } else {
      const mod = await import("postgres");
      _sql = mod.default(DATABASE_URL, { max: 1 }) as unknown as Sql;
    }
  }
  return _sql;
}

/** Normalize a DB timestamp (Date or ISO string) to ISO for JSON responses. */
export function toISO(v: Date | string | null | undefined): string | null {
  if (v == null) return null;
  return v instanceof Date ? v.toISOString() : new Date(v).toISOString();
}
