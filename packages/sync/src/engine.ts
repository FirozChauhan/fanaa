import { mkdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { entryIdFromKey, entryPath, isValidKey, parseEntry, serializeEntry } from "fanaa-core";
import {
  deleteLetter,
  pullLetters,
  pushLetters,
  type PushItem,
  type RemoteLetter,
} from "./client";
import { journalSync, loadSyncState, resolveApiUrl, saveSyncState, type SyncState } from "./state";

/**
 * The local-first outbox sync engine.
 *
 * Local markdown files are the source of truth; the cloud is a backup. A sync
 * round does, in order:
 *
 *   1. push local tombstones  (deletes made while offline)
 *   2. push dirty letters     (files with mtime > lastPushMs — the outbox)
 *   3. pull changes           (server rows newer than the cursor, LWW)
 *
 * Conflicts resolve last-write-wins on updated_at (local mtime for files,
 * server stamp for rows): a local file modified after the remote row wins and
 * is pushed; a remote row modified after the local file overwrites it. Pulled
 * rows are written back as canonical markdown so every device converges on
 * the same on-disk format. Nothing is ever deleted locally by a pull except
 * server tombstones that are strictly newer than the local file.
 */

/** One local entry as seen by the engine. */
interface LocalEntry {
  key: string;
  item: PushItem;
  mtimeMs: number;
}

/** What one sync round did. */
export interface SyncSummary {
  pushed: number;
  accepted: number;
  pulled: number;
  tombstoned: number;
  cursor: string | null;
}

/** Chunk size for batch pushes — keeps a single request comfortably small. */
const PUSH_CHUNK = 50;

/** Scan the journal's entries and build push payloads for files newer than the watermark. */
function collectDirty(root: string, lastPushMs: number): LocalEntry[] {
  const glob = new Bun.Glob("entries/**/*.md");
  const out: LocalEntry[] = [];
  for (const f of glob.scanSync({ cwd: root, absolute: false, onlyFiles: true })) {
    const p = join(root, f);
    const st = statSync(p);
    if (st.mtimeMs <= lastPushMs) continue; // clean — already pushed
    const { meta, body } = parseEntry(readFileSync(p, "utf8"));
    const key = basename(f).replace(/\.md$/, "");
    out.push({
      key,
      item: {
        id: key,
        date: meta.date ?? new Date(st.mtimeMs).toISOString(),
        from: meta.from ?? "",
        to: meta.to ?? "",
        subject: meta.subject ?? "",
        body,
        updated_at: new Date(st.mtimeMs).toISOString(),
      },
      mtimeMs: st.mtimeMs,
    });
  }
  out.sort((a, b) => a.key.localeCompare(b.key));
  return out;
}

/** Push dirty letters in chunks; advance the watermark to the newest sent file. */
async function pushDirty(
  apiUrl: string,
  token: string,
  root: string,
  state: SyncState,
  category: string,
): Promise<{ pushed: number; accepted: number }> {
  const j = journalSync(state, category);
  const dirty = collectDirty(root, j.lastPushMs);
  if (dirty.length === 0) return { pushed: 0, accepted: 0 };

  let accepted = 0;
  let newest = j.lastPushMs;
  for (let i = 0; i < dirty.length; i += PUSH_CHUNK) {
    const chunk = dirty.slice(i, i + PUSH_CHUNK);
    const res = await pushLetters(apiUrl, token, chunk.map((e) => e.item));
    accepted += res.accepted;
    for (const e of chunk) newest = Math.max(newest, e.mtimeMs);
  }
  // Watermark = newest file we sent. Files dropped by the server (LWW: server
  // has a newer stamp) would only be re-sent as a no-op anyway, and anything
  // written during the sync has an mtime above this and stays dirty for next
  // round — so no update is ever lost.
  j.lastPushMs = newest;
  return { pushed: dirty.length, accepted };
}

/** Apply a pulled letter: tombstone or write, both strictly LWW on timestamps. */
function applyPulled(root: string, r: RemoteLetter): "written" | "tombstoned" | "kept" {
  // Defense in depth: never let a server id become a filesystem path. The
  // server now rejects malformed ids at /letters/batch, but rows written
  // before that check (or by a buggy deployment) are skipped, not written.
  if (!isValidKey(r.id)) return "kept";
  const p = entryPath(root, r.id);
  const updated = new Date(r.updated_at).getTime();

  if (r.deleted_at) {
    const deletedAt = new Date(r.deleted_at).getTime();
    const local = statSync(p, { throwIfNoEntry: false });
    if ((local?.mtimeMs ?? 0) > deletedAt) return "kept"; // local edit beats tombstone
    rmSync(p, { force: true });
    return "tombstoned";
  }

  const localMtime = statSync(p, { throwIfNoEntry: false })?.mtimeMs ?? 0;
  if (localMtime > updated) return "kept"; // local file is newer — it'll push next round

  mkdirSync(join(root, "entries", r.id.slice(0, 4), r.id.slice(5, 7)), { recursive: true });
  const meta = {
    date: r.date,
    id: entryIdFromKey(r.id),
    from: r.from,
    to: r.to,
    subject: r.subject,
  };
  writeFileSync(p, serializeEntry(meta, r.body));
  // Stamp the file's mtime to the remote updated_at (not download time), so
  // a pulled letter never looks locally-dirty and gets pushed back — that
  // would ping-pong forever. It also keeps local LWW comparisons honest.
  const t = new Date(r.updated_at);
  utimesSync(p, t, t);
  return "written";
}

/** Send queued tombstones; drop them once the server confirms (404 counts as confirmed). */
async function pushPendingDeletes(
  apiUrl: string,
  token: string,
  state: SyncState,
  category: string,
): Promise<number> {
  const j = journalSync(state, category);
  if (j.pendingDeletes.length === 0) return 0;
  const remaining: typeof j.pendingDeletes = [];
  for (const d of j.pendingDeletes) {
    try {
      await deleteLetter(apiUrl, token, d.id);
    } catch {
      remaining.push(d); // transient failure — retry next round
    }
  }
  j.pendingDeletes = remaining;
  return j.pendingDeletes.length - remaining.length;
}

/**
 * Run one full sync round for a journal category. Reads/writes the shared
 * state file at the store root; returns a summary of what happened.
 *
 * @param storeRoot  the fanaa store root (where state/sync.json lives)
 * @param journalRoot the category's journal root (where entries/ lives)
 * @param state      the (already loaded) session state, mutated + saved
 * @param category   the journal category being synced
 */
export async function runSync(
  storeRoot: string,
  journalRoot: string,
  state: SyncState,
  category: string,
): Promise<SyncSummary> {
  if (!state.token) throw new Error("not signed in — run `fanaa login` first");
  const apiUrl = resolveApiUrl(state);
  const j = journalSync(state, category);

  const tombstones = await pushPendingDeletes(apiUrl, state.token, state, category);
  const { pushed, accepted } = await pushDirty(apiUrl, state.token, journalRoot, state, category);

  const pull = await pullLetters(apiUrl, state.token, j.cursor);
  let pulled = 0;
  let tombstoned = 0;
  let newestWritten = 0;
  for (const r of pull.letters) {
    const res = applyPulled(journalRoot, r);
    if (res === "written") {
      pulled++;
      newestWritten = Math.max(newestWritten, new Date(r.updated_at).getTime());
    } else if (res === "tombstoned") {
      tombstoned++;
    }
  }
  // Pulled files must not count as dirty next round: watermark past them.
  j.lastPushMs = Math.max(j.lastPushMs, newestWritten);
  if (pull.cursor !== null) j.cursor = pull.cursor;

  saveSyncState(storeRoot, state);
  return { pushed, accepted, pulled, tombstoned: tombstoned + tombstones, cursor: j.cursor };
}

/** Queue a local delete as a tombstone for the next sync (no-op when signed out). */
export function recordDelete(storeRoot: string, category: string, id: string): void {
  try {
    const state = loadSyncState(storeRoot);
    if (!state.token) return;
    journalSync(state, category).pendingDeletes.push({ id, at: new Date().toISOString() });
    saveSyncState(storeRoot, state);
  } catch {
    // Deleting a letter must never fail because the sync bookkeeping broke.
  }
}
