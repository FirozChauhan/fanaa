import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fanaaRoot, parseDateStamp, parseEntry, type EntryMeta } from "fanaa-core";

export interface Letter {
  /** YYYY-MM-DD */
  key: string;
  date: Date;
  meta: EntryMeta;
  body: string;
}

export function loadLetters(): Letter[] {
  const root = fanaaRoot();
  const glob = new Bun.Glob("entries/**/*.md");
  const out: Letter[] = [];
  for (const f of glob.scanSync({ cwd: root, absolute: false, onlyFiles: true })) {
    const text = readFileSync(join(root, f), "utf8");
    const { meta, body } = parseEntry(text);
    const key = basename(f).replace(/\.md$/, "");
    out.push({ key, date: parseDateStamp(meta.date), meta, body });
  }
  out.sort((a, b) => b.key.localeCompare(a.key));
  return out;
}

/** YYYY-MM-DD → number of entries that day. */
export function dayCounts(letters: Letter[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of letters) m.set(l.key, (m.get(l.key) ?? 0) + 1);
  return m;
}

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
