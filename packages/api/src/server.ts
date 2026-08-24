#!/usr/bin/env bun
/**
 * Local dev server — imports the Hono app and serves it via Bun.serve.
 * The default export (src/index.ts) stays as the Cloudflare Worker handler;
 * this file is the bun-local entrypoint so the auto-serve doesn't double-bind.
 */
import app from "./index";
import { PORT } from "./env";

const dbState = process.env.DATABASE_URL ? "configured" : "MISSING (set DATABASE_URL)";
console.log(`fanaa api on http://localhost:${PORT} — db: ${dbState}`);
Bun.serve({ port: PORT, fetch: app.fetch });