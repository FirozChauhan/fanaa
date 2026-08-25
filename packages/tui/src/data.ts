import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fanaaRoot, isValidKey, parseDateStamp, parseEntry, type EntryMeta } from "fanaa-core";

/**
 * In-memory letter model for the TUI: loads every entry from the store,
 * parses its frontmatter once, and provides the sort/search/timeline
 * orders. `key` is the full file key (YYYY-MM-DD-HHMM-XXXX), so sorting
 * by key IS sorting by date.
 */

export interface Letter {
  /** Full file key, e.g. 2026-08-24-1225-SY8AIN (date-desc sortable). */
  key: string;
  /** Parsed from the frontmatter date stamp. */
  date: Date;
  meta: EntryMeta;
  body: string;
}

/** Read every entry file in the journal, newest key first. */
export function loadLetters(root?: string): Letter[] {
  const r = root ?? fanaaRoot();
  const glob = new Bun.Glob("entries/**/*.md");
  const out: Letter[] = [];
  for (const f of glob.scanSync({ cwd: r, absolute: false, onlyFiles: true })) {
    const text = readFileSync(join(r, f), "utf8");
    const { meta, body } = parseEntry(text);
    const key = basename(f).replace(/\.md$/, "");
    if (!isValidKey(key)) continue; // stray/foreign file — skip (never edit-crash)
    out.push({ key, date: parseDateStamp(meta.date), meta, body });
  }
  out.sort((a, b) => b.key.localeCompare(a.key));
  return out;
}

export type SortMode = "date" | "alpha" | "len";

/** Reorder letters by date (newest first), subject alphabetically, or body length. */
export function sortLetters(letters: Letter[], mode: SortMode): Letter[] {
  const out = [...letters];
  if (mode === "alpha") out.sort((a, b) => (a.meta.subject || "").localeCompare(b.meta.subject || ""));
  else if (mode === "len") out.sort((a, b) => a.body.length - b.body.length);
  else out.sort((a, b) => b.key.localeCompare(a.key));
  return out;
}

/** YYYY-MM-DD → number of entries that day. */
export function dayCounts(letters: Letter[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of letters) m.set(l.key, (m.get(l.key) ?? 0) + 1);
  return m;
}

/**
 * Consecutive-day writing streak. Counts back from today (or yesterday,
 * if today has no entry yet — the streak stays alive until midnight);
 * stops at the first day without a letter.
 */
export function computeStreak(counts: Map<string, number>, now = new Date()): number {
  const key = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  // Streak stays alive until midnight: if today is empty, count from yesterday.
  if (!(counts.get(key(d)) ?? 0)) d.setDate(d.getDate() - 1);
  let streak = 0;
  while (counts.get(key(d)) ?? 0) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}
