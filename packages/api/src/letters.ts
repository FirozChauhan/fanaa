import { Hono } from "hono";
import { db, toISO } from "./db";
import { requireUser, type ApiEnv } from "./auth";

/**
 * Letter sync endpoints — the v0.2 cloud store.
 *
 *   GET  /letters?since=<ISO>   incremental pull (rows changed after cursor)
 *   POST /letters/batch         push dirty letters (last-write-wins)
 *   POST /letters/:id/delete    tombstone a letter (propagates everywhere)
 *
 * Sync model: client keeps local markdown files as a cache, pushes anything
 * dirty (updated_at > last push), pulls everything changed since its cursor.
 * Conflicts resolve last-write-wins on updated_at. Deletes are soft so they
 * replicate; the server hard-purges tombstones later.
 *
 * All queries are tagged templates — params stay bound (never inlined), so
 * client-supplied values can't inject SQL. Column lists are written literally
 * because neon driver treats every `${}` as a runtime parameter.
 */

interface LetterRow {
  id: string;
  date: Date | string;
  from_addr: string;
  to_addr: string;
  subject: string;
  body: string;
  updated_at: Date | string;
  deleted_at: Date | string | null;
}

/**
 * Letter ids become file paths on the client (entries/YYYY/MM/…). Enforce
 * the shape server-side so a malicious/buggy client can't plant ids that
 * traverse out of the journal when another device pulls them. Matches
 * fanaa-core's KEY_RE: YYYY-MM-DD-HHMM plus optional suffix segments.
 */
const KEY_RE = /^\d{4}-\d{2}-\d{2}-\d{4}(-[A-Za-z0-9]+)*$/;
/** Cap a single push batch — a sync round chunks at 50, so 500 is generous. */
const MAX_BATCH = 500;
/** Cap a single letter body (chars) — ~1 MB, ~10x any real journal entry. */
const MAX_BODY_LENGTH = 1_000_000;

export const letters = new Hono<ApiEnv>();
letters.use("*", requireUser);

/** GET /letters?since=… — all rows (optionally changed since cursor), plus the new cursor. */
letters.get("/", async (c) => {
  const since = c.req.query("since");
  if (since && Number.isNaN(new Date(since).getTime())) {
    return c.json({ error: "since must be an ISO timestamp" }, 400);
  }
  const sinceDate = since ? new Date(since) : null;
  const user = c.get("user");
  const s = await db();
  const rows = (since
    ? await s`SELECT id, date, from_addr, to_addr, subject, body, updated_at, deleted_at FROM letters WHERE user_id = ${user.id} AND updated_at > ${sinceDate} ORDER BY updated_at`
    : await s`SELECT id, date, from_addr, to_addr, subject, body, updated_at, deleted_at FROM letters WHERE user_id = ${user.id} ORDER BY updated_at`) as LetterRow[];

  let cursor: string | null = since ?? null;
  for (const r of rows) {
    // Round UP past the server's stored sub-ms precision: toISOString()
    // truncates to ms, so a raw max timestamp would re-return the newest
    // row on every subsequent pull (updated_at > since would keep matching).
    const u = new Date(new Date(r.updated_at).getTime() + 1).toISOString();
    if (cursor === null || u > cursor) cursor = u;
  }
  return c.json({
    cursor,
    letters: rows.map((r) => ({
      id: r.id,
      date: toISO(r.date),
      from: r.from_addr,
      to: r.to_addr,
      subject: r.subject,
      body: r.body,
      updated_at: toISO(r.updated_at),
      deleted_at: toISO(r.deleted_at),
    })),
  });
});

/**
 * POST /letters/batch  { letters: [{ id, date, from, to, subject, body, updated_at }] }
 * Upsert each letter, last-write-wins on updated_at. A newer push also
 * resurrects a tombstoned letter (deleted_at = NULL on update). The WHERE
 * clause makes an older write a no-op, so RETURNING id tells us what was
 * actually accepted.
 */
letters.post("/batch", async (c) => {
  const body = await c.req.json().catch(() => null);
  const items = Array.isArray(body?.letters) ? body.letters : null;
  if (!items) return c.json({ error: "body.letters must be an array" }, 400);
  if (items.length > MAX_BATCH) return c.json({ error: `batch too large (max ${MAX_BATCH} items)` }, 400);

  const user = c.get("user");
  const s = await db();
  let accepted = 0;
  for (const it of items) {
    const id = String(it?.id ?? "").trim();
    if (!id) continue;
    if (!KEY_RE.test(id)) {
      return c.json({ error: `malformed letter id: ${JSON.stringify(id)}` }, 400);
    }
    const body = String(it?.body ?? "");
    if (body.length > MAX_BODY_LENGTH) {
      // Reject the whole batch, not just the item: the client's outbox
      // watermark advances on a successful push, so silently skipping an
      // oversized item would permanently drop that letter from future syncs.
      return c.json({ error: `letter body too large (max ${MAX_BODY_LENGTH} chars)` }, 400);
    }
    const date = it?.date ? new Date(it.date) : new Date();
    const updated = it?.updated_at ? new Date(it.updated_at) : new Date();
    const res = (await s`
      INSERT INTO letters (id, user_id, date, from_addr, to_addr, subject, body, updated_at)
      VALUES (${id}, ${user.id}, ${date}, ${String(it?.from ?? "") || user.email}, ${String(it?.to ?? "")}, ${String(it?.subject ?? "")}, ${body}, ${updated})
      ON CONFLICT (user_id, id) DO UPDATE SET
        date = EXCLUDED.date, from_addr = EXCLUDED.from_addr, to_addr = EXCLUDED.to_addr,
        subject = EXCLUDED.subject, body = EXCLUDED.body,
        updated_at = EXCLUDED.updated_at, deleted_at = NULL
      WHERE letters.updated_at < EXCLUDED.updated_at
      RETURNING id
    `) as { id: string }[];
    accepted += res.length; // 0 = older write dropped (LWW)
  }
  return c.json({ accepted });
});

/** POST /letters/:id/delete — tombstone (updated_at bumped so it syncs). */
letters.post("/:id/delete", async (c) => {
  const user = c.get("user");
  const s = await db();
  const rows = (await s`
    UPDATE letters SET deleted_at = now(), updated_at = now()
    WHERE user_id = ${user.id} AND id = ${c.req.param("id")} AND deleted_at IS NULL
    RETURNING id
  `) as { id: string }[];
  if (rows.length === 0) return c.json({ error: "not found" }, 404);
  return c.json({ ok: true, id: rows[0].id });
});