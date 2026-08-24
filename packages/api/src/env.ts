/**
 * Environment configuration. Everything is optional at import time except
 * DATABASE_URL, which is validated lazily on first query so the app can
 * boot (and show a helpful error) before a DB exists.
 */

export const DATABASE_URL = process.env.DATABASE_URL;

/** Resend API key. Absent → codes are logged to stdout (dev mode). */
export const RESEND_API_KEY = process.env.RESEND_API_KEY;

/** Verified sender for Resend. onboarding@resend.dev works for testing. */
export const RESEND_FROM = process.env.FANAA_API_FROM ?? "Fanaa <onboarding@resend.dev>";

export const PORT = Number(process.env.PORT ?? 8787);

/** Code is valid for 5 minutes; sessions for 30 days. */
export const CODE_TTL_SECONDS = 300;
export const CODE_RESEND_COOLDOWN_SECONDS = 60;
export const SESSION_TTL_SECONDS = 30 * 24 * 3600;
