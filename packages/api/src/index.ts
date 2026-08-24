import { Hono } from "hono";
import { auth } from "./auth";
import { letters } from "./letters";

/**
 * Fanaa v0.2 API — Hono app.
 *
 * Routes:
 *   GET  /health                  liveness (reports whether DATABASE_URL is set)
 *   POST /auth/request            { email } → sends 6-digit code
 *   POST /auth/verify             { email, code } → { token, user }
 *   GET  /letters?since=…         incremental pull (Bearer)
 *   POST /letters/batch           push dirty letters (Bearer)
 *   POST /letters/:id/delete      tombstone (Bearer)
 *
 * Default export = Cloudflare Worker handler; running the file directly with
 * bun serves it locally on PORT (default 8787).
 */

const app = new Hono();

app.get("/health", (c) =>
  c.json({ ok: true, db: process.env.DATABASE_URL ? "configured" : "missing" }),
);
app.route("/auth", auth);
app.route("/letters", letters);

export default app;
