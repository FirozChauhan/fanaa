/**
 * Environment configuration. Everything is optional at import time except
 * DATABASE_URL, which is validated lazily on first query so the app can
 * boot (and show a helpful error) before a DB exists.
 */

export const DATABASE_URL = process.env.DATABASE_URL;

/**
 * Clerk secret key. When set, email verification is delegated to Clerk's
 * email_code OTP (Clerk sends the emails — no SMTP/DKIM/Resend of our own);
 * when absent, the app falls back to its own auth_codes dev flow (auth.ts).
 */
export const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;

/**
 * Explicit opt-in for the dev OTP fallback (codes logged to the server
 * console instead of emailed). Refused by default so a production deploy
 * without CLERK_SECRET_KEY fails CLOSED (auth unavailable) instead of
 * turning the server console into an auth bypass. Set FANAA_ALLOW_DEV_AUTH=1
 * for local development only.
 */
export const ALLOW_DEV_AUTH = process.env.FANAA_ALLOW_DEV_AUTH === "1";

export const PORT = Number(process.env.PORT ?? 8787);

/** Code is valid for 5 minutes; sessions for 30 days. */
export const CODE_TTL_SECONDS = 300;
export const CODE_RESEND_COOLDOWN_SECONDS = 60;
export const SESSION_TTL_SECONDS = 30 * 24 * 3600;

/**
 * Per-IP window for /auth/request — one request per IP per window, on top
 * of the per-email cooldown, so a single address can't be used to relay
 * Clerk emails to arbitrary recipients.
 */
export const IP_WINDOW_SECONDS = 60;
