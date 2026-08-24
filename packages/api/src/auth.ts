import { Hono, type MiddlewareHandler } from "hono";
import { db } from "./db";
import { sendVerificationCode } from "./email";
import { CODE_RESEND_COOLDOWN_SECONDS, CODE_TTL_SECONDS, SESSION_TTL_SECONDS } from "./env";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface User {
  id: string;
  email: string;
}

/** Hono context variables: the authenticated user, set by requireUser. */
export type ApiEnv = { Variables: { user: User } };

export const auth = new Hono();

/**
 * POST /auth/request  { email }
 * Creates the user (idempotent), mints a 6-digit code (5-min TTL, one per
 * minute per email), and emails it. In dev (no Resend key) the code is
 * logged to the server console and channel is "dev" so the CLI can show it.
 */
auth.post("/request", async (c) => {
  const body = await c.req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return c.json({ error: "invalid email" }, 400);

  const s = db();
  const recent = (await s`SELECT created_at FROM auth_codes WHERE email = ${email} ORDER BY created_at DESC LIMIT 1`) as { created_at: Date | string }[];
  if (recent[0] && Date.now() - new Date(recent[0].created_at).getTime() < CODE_RESEND_COOLDOWN_SECONDS * 1000) {
    return c.json({ error: "slow down — wait a minute before requesting another code" }, 429);
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + CODE_TTL_SECONDS * 1000);
  await s`INSERT INTO users (email) VALUES (${email}) ON CONFLICT (email) DO NOTHING`;
  await s`DELETE FROM auth_codes WHERE email = ${email}`;
  await s`INSERT INTO auth_codes (email, code, expires_at) VALUES (${email}, ${code}, ${expiresAt})`;

  let channel: "email" | "dev";
  try {
    channel = await sendVerificationCode(email, code);
  } catch (err) {
    return c.json({ error: `failed to send email: ${err instanceof Error ? err.message : err}` }, 502);
  }
  return c.json({ ok: true, channel });
});

/**
 * POST /auth/verify  { email, code }
 * Validates the code (single-use), mints a session token (30 days), and
 * returns { token, user }. The token is the only credential the client needs.
 */
auth.post("/verify", async (c) => {
  const body = await c.req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const code = String(body?.code ?? "").trim();
  if (!EMAIL_RE.test(email) || !/^\d{6}$/.test(code)) {
    return c.json({ error: "email or code malformed" }, 400);
  }

  const s = db();
  const rows = (await s`SELECT code FROM auth_codes WHERE email = ${email} AND expires_at > now()`) as { code: string }[];
  if (rows.length === 0 || rows[0].code !== code) {
    return c.json({ error: "invalid or expired code" }, 401);
  }
  await s`DELETE FROM auth_codes WHERE email = ${email}`;

  const user = (await s`SELECT id, email FROM users WHERE email = ${email}`) as { id: string; email: string }[];
  if (user.length === 0) return c.json({ error: "user not found" }, 500);

  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await s`INSERT INTO sessions (token, user_id, expires_at) VALUES (${token}, ${user[0].id}, ${expiresAt})`;

  return c.json({ token, user: { id: user[0].id, email: user[0].email } });
});

/** Bearer-token middleware: resolves the session to a User, else 401. */
export const requireUser: MiddlewareHandler<ApiEnv> = async (c, next) => {
  const h = c.req.header("Authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!token) return c.json({ error: "unauthorized" }, 401);

  const s = db();
  const rows = (await s`SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ${token} AND s.expires_at > now()`) as { id: string; email: string }[];
  if (rows.length === 0) return c.json({ error: "unauthorized" }, 401);

  c.set("user", { id: rows[0].id, email: rows[0].email });
  await next();
};
