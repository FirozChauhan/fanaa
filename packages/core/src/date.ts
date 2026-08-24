import { join } from "node:path";

export function pad(n: number, len = 2): string {
  return String(n).padStart(len, "0");
}

/** YYYY-MM-DD in local time — the file/entry key. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local ISO timestamp with offset, e.g. 2026-08-24T07:30:00+05:30. */
export function localISO(d: Date): string {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? "+" : "-";
  const hh = pad(Math.floor(Math.abs(off) / 60));
  const mm = pad(Math.abs(off) % 60);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${hh}:${mm}`
  );
}

/** "Wed, 08 Apr 2026" — email style. */
export function rfcDate(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function parseDateStamp(s?: string): Date {
  if (!s) return new Date();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return new Date();
}

/** Path for an entry, e.g. ~/.fanaa/entries/2026/08/2026-08-24.md */
export function entryPath(root: string, key: string): string {
  const [y, m] = key.split("-");
  return join(root, "entries", y, m, `${key}.md`);
}

/** Parse a user-supplied date string into a YYYY-MM-DD key. */
export function parseDateArg(s: string): string | null {
  const now = new Date();
  if (s === "today") return dayKey(now);
  if (s === "yesterday") return dayKey(new Date(now.getTime() - 86400000));
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{2}-\d{2}$/.test(s)) return `${now.getFullYear()}-${s}`;
  return null;
}
