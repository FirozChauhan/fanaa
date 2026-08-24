export const ACCENT = "#ffa94d";
export const DIM = "#8b8b8b";

export function truncate(s: string, n: number): string {
  if (n <= 1) return s.slice(0, Math.max(0, n));
  return s.length > n ? s.slice(0, n - 1) + "\u2026" : s;
}

/** Greedy word wrap; returns lines no longer than width. */
export function wrap(s: string, width: number): string[] {
  const out: string[] = [];
  for (const raw of s.split("\n")) {
    if (raw.length <= width) {
      out.push(raw);
      continue;
    }
    const words = raw.split(" ");
    let line = "";
    for (const w of words) {
      if ((line + " " + w).trim().length > width) {
        if (line.trim()) out.push(line.trim());
        line = w;
      } else {
        line += (line ? " " : "") + w;
      }
    }
    if (line.trim()) out.push(line.trim());
  }
  return out;
}
