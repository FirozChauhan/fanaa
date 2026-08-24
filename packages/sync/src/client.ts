/**
 * HTTP client for the fanaa-api (packages/api). Thin fetch wrappers over the
 * v0.2 REST surface:
 *
 *   POST /auth/request         email → 6-digit code (email or dev channel)
 *   POST /auth/verify          code → { token, user } (30-day session)
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

/** POST /auth/request — mints a code; channel is "dev" when no email backend is set. */
export function requestCode(apiUrl: string, email: string): Promise<{ ok: true; channel: "email" | "dev" }> {
  return api(apiUrl, "/auth/request", { method: "POST", body: { email } });
}

/** POST /auth/verify — exchanges the code for a session token. */
export function verifyCode(
  apiUrl: string,
  email: string,
  code: string,
): Promise<{ token: string; user: { id: string; email: string } }> {
  return api(apiUrl, "/auth/verify", { method: "POST", body: { email, code } });
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
