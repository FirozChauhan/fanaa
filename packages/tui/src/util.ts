// Warm paper-and-ink palette for the TUI.
export const ACCENT = "#ffa94d"; // ember orange — the beloved
export const GOLD = "#ffd88a"; // bright gold — today, selection, subjects
export const AMBER = "#c98a3d"; // title gradient start
export const PAPER = "#cfc7b8"; // body text — warm parchment
export const MUTED = "#8a8175"; // secondary text
export const FAINT = "#5c564d"; // tertiary text, hints
export const DIVIDER = "#3a362f"; // separators
export const SEL_BG = "#3a3124"; // selected row background (warm umber)

function hexToRgb(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Per-character hex colors for a simple linear gradient (for titles). */
export function gradientColors(text: string, from: string, to: string): string[] {
  const f = hexToRgb(from);
  const t = hexToRgb(to);
  const n = text.length;
  return [...text].map((_, i) => {
    const k = n <= 1 ? 0 : i / (n - 1);
    const r = Math.round(f[0] + (t[0] - f[0]) * k);
    const g = Math.round(f[1] + (t[1] - f[1]) * k);
    const b = Math.round(f[2] + (t[2] - f[2]) * k);
    return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
  });
}

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

export type InlineSeg = { text: string; bold?: boolean; italic?: boolean };

/**
 * Split inline markdown into formatted segments: ***bold italic***, **bold**,
 * *italic*. Unmatched markers stay literal; nesting is not supported (inner
 * markers render as plain text inside the outer formatting).
 */
export function parseInline(s: string): InlineSeg[] {
  const out: InlineSeg[] = [];
  const re = /\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ text: m[1], bold: true, italic: true });
    else if (m[2] !== undefined) out.push({ text: m[2], bold: true });
    else out.push({ text: m[3], italic: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}

/**
 * Word-wrap formatted segments (same algorithm as wrap()) while carrying the
 * bold/italic style across line breaks, so markers never leak at wrap points.
 */
export function wrapSegments(segs: InlineSeg[], width: number): InlineSeg[][] {
  const out: InlineSeg[][] = [];
  let line: InlineSeg[] = [];
  let lineLen = 0;
  const flush = () => {
    if (line.length > 0) {
      out.push(line);
      line = [];
      lineLen = 0;
    }
  };
  for (const seg of segs) {
    const parts = seg.text.split("\n");
    parts.forEach((part, pi) => {
      if (pi > 0) flush();
      if (part === "") {
        out.push([{ text: "" }]);
        return;
      }
      const words = part.split(" ");
      for (const w of words) {
        if (w === "") continue;
        const need = lineLen === 0 ? w.length : w.length + 1;
        if (lineLen + need > width) flush();
        line.push({ text: (lineLen === 0 ? "" : " ") + w, bold: seg.bold, italic: seg.italic });
        lineLen = lineLen === 0 ? w.length : lineLen + 1 + w.length;
      }
    });
  }
  flush();
  return out;
}
