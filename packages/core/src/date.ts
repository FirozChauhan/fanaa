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

/** Key for a new letter file: YYYY-MM-DD-HHMM-XXXXXX — one letter, one file. */
export function stampKey(base: string, d: Date): string {
  return `${base}-${pad(d.getHours())}${pad(d.getMinutes())}-${uniqueHash()}`;
}

let hashCounter = 0;

/** 6-character unique hash (base36, uppercase) derived from the clock + a counter. */
export function uniqueHash(): string {
  const n = Date.now() * 1000 + (hashCounter++ % 1000);
  // FNV-1a over the decimal digits, then base36 → 6 chars.
  let h = 2166136261;
  for (const c of String(n)) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).padStart(6, "0").slice(-6).toUpperCase();
}

/**
 * The entry's unique ID: the HHMM timestamp concatenated with the 6-char
 * hash (e.g. "1214K7X2P9"). Old pre-hash keys just yield the HHMM part.
 */
export function entryIdFromKey(key: string): string {
  return key.slice(11, 15) + key.slice(16);
}

/** Parse a user-supplied date string into a key (day or exact letter). */
export function parseDateArg(s: string): string | null {
  const now = new Date();
  if (s === "today") return dayKey(now);
  if (s === "yesterday") return dayKey(new Date(now.getTime() - 86400000));
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{2}-\d{2}$/.test(s)) return `${now.getFullYear()}-${s}`;
  // Exact letter key: YYYY-MM-DD-HHMM with optional uniqueness suffix (-2, -K7X2P9).
  if (/^\d{4}-\d{2}-\d{2}-\d{4}(-[A-Za-z0-9]+)?$/.test(s)) return s;
  return null;
}
