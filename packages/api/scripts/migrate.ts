#!/usr/bin/env bun
/**
 * Migration runner: applies migrations/*.sql in filename order, tracking
 * applied files in schema_migrations. Uses postgres.js over TCP (runs on a
 * dev machine / CI), so it works with any Postgres — local or Neon.
 *
 *   DATABASE_URL=postgres://… bun run scripts/migrate.ts
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set — copy .env.example to .env and fill it in.");
  process.exit(1);
}

const sql = postgres(url, { max: 1 });
await sql`CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
)`;

const dir = join(import.meta.dir, "../migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

for (const f of files) {
  const done = await sql`SELECT 1 FROM schema_migrations WHERE name = ${f}`;
  if (done.length > 0) continue;
  const text = readFileSync(join(dir, f), "utf8");
  await sql.unsafe(text); // multi-statement file
  await sql`INSERT INTO schema_migrations (name) VALUES (${f})`;
  console.log(`applied ${f}`);
}

console.log("migrations up to date");
await sql.end();
process.exit(0);
