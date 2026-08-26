import { Hono, type MiddlewareHandler } from "hono";
import { db } from "./db";
import { sendVerificationCode } from "./email";
import { attemptVerification, ensureUser, prepareVerification } from "./clerk";
import { ALLOW_DEV_AUTH, CLERK_SECRET_KEY, CODE_RESEND_COOLDOWN_SECONDS, CODE_TTL_SECONDS, IP_WINDOW_SECONDS, SESSION_TTL_SECONDS } from "./env";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Client IP for rate limiting. Cloudflare Workers set CF-Connecting-IP;
 * local dev falls back to X-Forwarded-For (first hop) or "local".
 */
function clientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return (
    c.req.header("CF-Connecting-IP") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    "local"
  );
}

/** Failed verify attempts allowed per code before it is burned. */
const MAX_CODE_ATTEMPTS = 5;

export interface User {
  id: string;
  email: string;
}

/** Hono context variables: the authenticated user, set by requireUser. */
export type ApiEnv = { Variables: { user: User } };

export const auth = new Hono();

/**
 * POST /auth/request  { email }
 * Starts email verification. With CLERK_SECRET_KEY set, Clerk finds/creates
 * the user and emails a 6-digit code (channel "email"), returning the
 * verification id the client must send back with the code. Without one (local
 * dev), the code is stored in auth_codes and emailed or logged to the console
 * (channel "dev").
 */
auth.post("/request", async (c) => {
  const body = await c.req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return c.json({ error: "invalid email" }, 400);

  const s = await db();
  // Per-IP limiter (email-bombing relay guard): the email cooldown below is
  // per-address, so without this an attacker could loop many addresses and
  // make Clerk mail each one. One request per IP per window.
  const ip = clientIp(c);
  const ipRows = (await s`SELECT created_at FROM rate_limits WHERE key = ${`ip:${ip}`}`) as { created_at: Date | string }[];
  if (ipRows[0] && Date.now() - new Date(ipRows[0].created_at).getTime() < IP_WINDOW_SECONDS * 1000) {
    return c.json({ error: "slow down — wait a minute before requesting another code" }, 429);
  }
  // Rate limit FIRST, for BOTH paths — without it /auth/request is an open
  // email-bombing relay (Clerk sends a real email to any address, and even
  // the dev path spams the console/logs). One request per email per window.
  const recent = (await s`SELECT created_at FROM auth_codes WHERE email = ${email} ORDER BY created_at DESC LIMIT 1`) as { created_at: Date | string }[];
  if (recent[0] && Date.now() - new Date(recent[0].created_at).getTime() < CODE_RESEND_COOLDOWN_SECONDS * 1000) {
    return c.json({ error: "slow down — wait a minute before requesting another code" }, 429);
  }
  // Request accepted — stamp this IP (next one from here waits a window)
  // and opportunistically purge stale rows so the table stays bounded.
  await s`INSERT INTO rate_limits (key) VALUES (${`ip:${ip}`}) ON CONFLICT (key) DO UPDATE SET created_at = now()`;
  await s`DELETE FROM rate_limits WHERE created_at < now() - interval '1 day'`;

  if (CLERK_SECRET_KEY) {
    let verificationId: string;
    try {
      const { emailAddressId } = await ensureUser(email);
      verificationId = await prepareVerification(emailAddressId);
    } catch (e) {
      return c.json({ error: `clerk: ${e instanceof Error ? e.message : e}` }, 502);
    }
    // Marker row so the cooldown above persists across requests (one per
    // email — the next request replaces it). It is never verified.
    await s`DELETE FROM auth_codes WHERE email = ${email}`;
    await s`INSERT INTO auth_codes (email, code, expires_at) VALUES (${email}, '', ${new Date(Date.now() + CODE_TTL_SECONDS * 1000)})`;
    return c.json({ ok: true, channel: "email", verification_id: verificationId });
  }

  if (!ALLOW_DEV_AUTH) {
    // Fail CLOSED: without the explicit dev-auth flag, a deploy that lost
    // its Clerk key must not fall back to console-logged codes (anyone with
    // log access could mint a session for any email).
    return c.json({ error: "auth unavailable — server has no auth backend configured" }, 503);
  }
  // 6 digits from a CSPRNG — never Math.random.
  const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
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
 * POST /auth/verify  { email, code, verification_id? }
 * Validates the code (single-use), mints a session token (30 days), and
 * returns { token, user }. With Clerk, the code is checked via
 * attempt_verification (verification_id comes from /auth/request) and the
 * email address is marked verified as a side effect; without Clerk the local
 * auth_codes row is checked. The token is the only credential the client needs.
 */
auth.post("/verify", async (c) => {
  const body = await c.req.json().catch(() => null);
  const email = String(body?.email ?? "").trim().toLowerCase();
  const code = String(body?.code ?? "").trim();
  const verificationId = String(body?.verification_id ?? "").trim();
  if (!EMAIL_RE.test(email) || !/^\d{6}$/.test(code)) {
    return c.json({ error: "email or code malformed" }, 400);
  }

  const s = await db();
  if (CLERK_SECRET_KEY) {
    if (!verificationId) return c.json({ error: "verification_id required" }, 400);
    let emailAddressId: string;
    try {
      ({ emailAddressId } = await ensureUser(email));
      const ok = await attemptVerification(emailAddressId, verificationId, code);
      if (!ok) return c.json({ error: "invalid or expired code" }, 401);
    } catch (e) {
      return c.json({ error: "invalid or expired code" }, 401);
    }
  } else {
    if (!ALLOW_DEV_AUTH) {
      return c.json({ error: "auth unavailable — server has no auth backend configured" }, 503);
    }
    // Dev path: local auth_codes row. Attempt-limited (MAX_CODE_ATTEMPTS
    // misses burn the code — brute-forcing 6 digits would need a fresh email
    // per 5 tries, and each email is cooldown-gated). A successful or burned
    // code is deleted immediately so it can never be reused.
    const rows = (await s`SELECT code, attempts FROM auth_codes WHERE email = ${email} AND expires_at > now()`) as { code: string; attempts: number }[];
    if (rows.length === 0) return c.json({ error: "invalid or expired code" }, 401);
    const row = rows[0];
    if (row.code !== code) {
      const used = row.attempts + 1;
      if (used >= MAX_CODE_ATTEMPTS) {
        await s`DELETE FROM auth_codes WHERE email = ${email}`;
        return c.json({ error: "too many attempts — request a new code" }, 401);
      }
      await s`UPDATE auth_codes SET attempts = ${used} WHERE email = ${email}`;
      return c.json({ error: "invalid or expired code" }, 401);
    }
    await s`DELETE FROM auth_codes WHERE email = ${email}`;
  }

  const user = (await s`SELECT id, name FROM users WHERE email = ${email}`) as { id: string; name: string | null }[];
  const userId =
    user.length > 0
      ? user[0].id
      : ((await s`INSERT INTO users (email) VALUES (${email}) RETURNING id`) as { id: string }[])[0].id;
  const name = user.length > 0 ? (user[0].name ?? "") : "";

  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await s`INSERT INTO sessions (token, user_id, expires_at) VALUES (${token}, ${userId}, ${expiresAt})`;

  // Opportunistic housekeeping: drop this user's expired sessions and any
  // stale auth_codes rows (expired or Clerk cooldown markers) so the tables
  // don't grow forever.
  await s`DELETE FROM sessions WHERE user_id = ${userId} AND expires_at < now()`;
  await s`DELETE FROM auth_codes WHERE email = ${email} AND (expires_at < now() OR code = '')`;

  return c.json({ token, user: { id: userId, email, name } });
});

/** Bearer-token middleware: resolves the session to a User, else 401. */
export const requireUser: MiddlewareHandler<ApiEnv> = async (c, next) => {
  const h = c.req.header("Authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  if (!token) return c.json({ error: "unauthorized" }, 401);

  const s = await db();
  const rows = (await s`SELECT u.id, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ${token} AND s.expires_at > now()`) as { id: string; email: string }[];
  if (rows.length === 0) return c.json({ error: "unauthorized" }, 401);

  c.set("user", { id: rows[0].id, email: rows[0].email });
  await next();
};

/**
 * POST /auth/logout (Bearer) — revokes the session server-side. Without
 * this a leaked token stays valid until its 30-day TTL, with no way to
 * kill it early. Must be declared AFTER requireUser (TDZ).
 */
auth.post("/logout", requireUser, async (c) => {
  const h = c.req.header("Authorization") ?? "";
  const token = h.startsWith("Bearer ") ? h.slice(7).trim() : "";
  await (await db())`DELETE FROM sessions WHERE token = ${token}`;
  return c.json({ ok: true });
});

/**
 * POST /auth/name  { name }  (Bearer)
 * Sets the account's full name (shown in the TUI header). Plain text, no
 * formatting — it is a display name, not a username. Empty clears it.
 */
auth.post("/name", requireUser, async (c) => {
  const body = await c.req.json().catch(() => null);
  const name = String(body?.name ?? "").trim().slice(0, 80);
  const u = c.get("user");
  await (await db())`UPDATE users SET name = ${name} WHERE id = ${u.id}`;
  return c.json({ ok: true, user: { id: u.id, email: u.email, name } });
});
