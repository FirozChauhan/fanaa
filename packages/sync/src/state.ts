import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Cloud-session state, persisted as JSON at <store>/state/sync.json.
 *
 * Auth (apiUrl/email/token) is account-wide and lives in one place; each
 * journal category keeps its own sync progress under `journals[cat]`:
 *
 *   cursor         server watermark — pull everything updated after this
 *   lastPushMs     local watermark — push files modified after this (outbox)
 *   pendingDeletes local tombstones queued for the server (delete outbox)
 *
 * The file lives OUTSIDE every journal git repo (in <store>/state/) and a
 * `*` .gitignore is written alongside it, so the session token can never be
 * swept into a git commit by `git add -A`.
 */

/** A queued local delete: the letter key + when it was deleted. */
export interface PendingDelete {
  id: string;
  /** ISO timestamp — used as the tombstone's effective delete time. */
  at: string;
}

/** Per-journal sync progress. */
export interface JournalSync {
  cursor: string | null;
  lastPushMs: number;
  pendingDeletes: PendingDelete[];
}

/** Full persisted session state. */
export interface SyncState {
  apiUrl: string;
  email: string;
  /** The account's full name (display only — shown in the TUI header). */
  name: string;
  /** 64-hex session token; empty string = signed out. */
  token: string;
  journals: Record<string, JournalSync>;
}

const DEFAULTS = {
  apiUrl: "https://fanaa-api.jigar1155.workers.dev",
  email: "",
  name: "",
  token: "",
} as const;

/** The API base URL: FANAA_API_URL env wins, else the stored one, else the hosted default. */
export function resolveApiUrl(state: Pick<SyncState, "apiUrl">): string {
  return process.env.FANAA_API_URL || state.apiUrl || DEFAULTS.apiUrl;
}

/** Path of the sync state file for a store root. */
export function statePath(root: string): string {
  return join(root, "state", "sync.json");
}

/** Read the state file; a missing/corrupt file yields a fresh signed-out state. */
export function loadSyncState(root: string): SyncState {
  try {
    const raw = JSON.parse(readFileSync(statePath(root), "utf8")) as Partial<SyncState>;
    return {
      apiUrl: typeof raw.apiUrl === "string" ? raw.apiUrl : DEFAULTS.apiUrl,
      email: typeof raw.email === "string" ? raw.email : DEFAULTS.email,
      name: typeof raw.name === "string" ? raw.name : DEFAULTS.name,
      token: typeof raw.token === "string" ? raw.token : DEFAULTS.token,
      journals: raw.journals && typeof raw.journals === "object" ? (raw.journals as Record<string, JournalSync>) : {},
    };
  } catch {
    return { apiUrl: DEFAULTS.apiUrl, email: "", name: "", token: "", journals: {} };
  }
}

/**
 * Persist the state file (mode 0600) and guard the directory with a `*`
 * .gitignore so a stray `git add -A` can never commit the session token.
 */
export function saveSyncState(root: string, state: SyncState): void {
  const dir = join(root, "state");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, ".gitignore"), "*\n");
  writeFileSync(statePath(root), JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
}

/** The journal's sync progress, created on first touch. */
export function journalSync(state: SyncState, category: string): JournalSync {
  let j = state.journals[category];
  if (!j) {
    j = { cursor: null, lastPushMs: 0, pendingDeletes: [] };
    state.journals[category] = j;
  }
  return j;
}
