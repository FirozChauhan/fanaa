/**
 * HTTP client for the fanaa-api (packages/api). Thin fetch wrappers over the
 * v0.2 REST surface:
 *
 *   POST /auth/request         email → 6-digit code (email or dev channel)
 *   POST /auth/verify          code → { token, user } (30-day session)
 *   POST /auth/logout          revoke the session (Bearer)
 *   GET  /letters?since=…      incremental pull (Bearer)
 *   POST /letters/batch        LWW upsert push (Bearer)
 *   POST /letters/:id/delete   tombstone (Bearer)
 *
 * Every call throws {@link FanaaApiError} on a non-2xx response, surfacing
 * the server's `{ error }` message. Base URL resolution (env → config →
 * localhost) lives in state.ts so the CLI and TUI agree on one rule.
 */

/** A letter as the server represents it (ISO timestamps, tombstone included). */
export interface RemoteLetter {
  id: string;
  date: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Response of GET /letters: rows changed since the cursor + the new cursor. */
export interface PullResult {
  cursor: string | null;
  letters: RemoteLetter[];
}

/** Non-2xx API response — carries the server's error message verbatim. */
export class FanaaApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** fetch + JSON parse + throw-on-error, shared by every call below. */
async function api<T>(
  apiUrl: string,
  path: string,
  init?: { method?: string; token?: string; body?: unknown },
): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init?.token) headers.authorization = `Bearer ${init.token}`;
  const res = await fetch(`${apiUrl}${path}`, {
    method: init?.method ?? "GET",
    headers,
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) {
    const msg = data?.error ? ` (${data.error})` : `HTTP ${res.status}`;
    throw new FanaaApiError(res.status, `fanaa api ${path}: ${msg}`);
  }
  return data as T;
}

/**
 * POST /auth/request — starts email verification. channel is "email" when a
 * real email backend is set (Clerk), "dev" when the code is printed to
 * the server console. verification_id is present on the Clerk path and must be
 * passed back to /auth/verify together with the code.
 */
export function requestCode(
  apiUrl: string,
  email: string,
): Promise<{ ok: true; channel: "email" | "dev"; verification_id?: string }> {
  return api(apiUrl, "/auth/request", { method: "POST", body: { email } });
}

/** POST /auth/verify — exchanges the code for a session token. */
export function verifyCode(
  apiUrl: string,
  email: string,
  code: string,
  verificationId?: string,
): Promise<{ token: string; user: { id: string; email: string; name: string } }> {
  return api(apiUrl, "/auth/verify", { method: "POST", body: { email, code, verification_id: verificationId } });
}

/** POST /auth/logout — revokes the session token server-side. */
export function logout(apiUrl: string, token: string): Promise<{ ok: true }> {
  return api(apiUrl, "/auth/logout", { method: "POST", token, body: {} });
}

/**
 * POST /auth/name — sets the account's full name (display only, not a
 * username). Returns the updated user.
 */
export function setName(
  apiUrl: string,
  token: string,
  name: string,
): Promise<{ ok: true; user: { id: string; email: string; name: string } }> {
  return api(apiUrl, "/auth/name", { method: "POST", token, body: { name } });
}

/** GET /letters — all letters, or those changed after `since` (ISO). */
export function pullLetters(apiUrl: string, token: string, since: string | null): Promise<PullResult> {
  const q = since ? `?since=${encodeURIComponent(since)}` : "";
  return api(apiUrl, `/letters${q}`, { token });
}

/**
 * POST /letters/batch — last-write-wins upsert. Items carry the client key as
 * `id` and a local `updated_at`; the server drops older writes and resurrects
 * tombstones, returning how many were accepted.
 */
export interface PushItem {
  id: string;
  date: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  updated_at: string;
}

export function pushLetters(
  apiUrl: string,
  token: string,
  letters: PushItem[],
): Promise<{ accepted: number }> {
  return api(apiUrl, "/letters/batch", { method: "POST", token, body: { letters } });
}

/** POST /letters/:id/delete — tombstones a letter so the delete replicates. */
export async function deleteLetter(apiUrl: string, token: string, id: string): Promise<void> {
  // 404 = already gone (or never existed) — treat as success so pending
  // tombstones don't pile up; anything else throws.
  try {
    await api(apiUrl, `/letters/${encodeURIComponent(id)}/delete`, { method: "POST", token, body: {} });
  } catch (err) {
    if (err instanceof FanaaApiError && err.status === 404) return;
    throw err;
  }
}
