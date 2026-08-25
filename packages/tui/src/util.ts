/**
 * Text helpers and the markdown→styled-segments pipeline for the TUI.
 *
 * Colors live in theme.tsx (a set of named palettes consumed via
 * usePalette()); this module only holds terminal-agnostic helpers.
 */

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

/**
 * Truncate to at most n chars, appending an ellipsis when cut.
 * n <= 1 avoids the ellipsis (a single char is kept as-is).
 */
export function truncate(s: string, n: number): string {
  if (n <= 1) return s.slice(0, Math.max(0, n));
  return s.length > n ? s.slice(0, n - 1) + "\u2026" : s;
}

/**
 * Strip terminal control characters (ESC and the C0 range) from text that
 * will be rendered — a letter body containing `\x1b[2J` or ANSI color codes
 * must not be able to redraw/mislead the terminal. Applied to every line
 * before markdown parsing and to frontmatter fields on render.
 */
export function clean(s: string): string {
  return s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

/** Greedy word wrap; returns lines no longer than width. */
/**
 * Greedy word wrap; returns lines no longer than width. Splits on spaces,
 * never mid-word; a word longer than width becomes its own (overlong) line.
 */
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

export type InlineSeg = { text: string; bold?: boolean; italic?: boolean; underline?: boolean };

/**
 * Split inline markdown into formatted segments: ***bold italic***, **bold**,
 * *italic*, #"highlight"# (underline), and bare #highlight# (underline).
 * Unmatched markers stay literal; nesting is not supported (inner markers
 * render as plain text inside the outer formatting).
 */
export function parseInline(s: string): InlineSeg[] {
  const out: InlineSeg[] = [];
  const re = /#"(.+?)"#|\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|#(.+?)#/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ text: m[1], underline: true });
    else if (m[2] !== undefined) out.push({ text: m[2], bold: true, italic: true });
    else if (m[3] !== undefined) out.push({ text: m[3], bold: true });
    else if (m[4] !== undefined) out.push({ text: m[4], italic: true });
    else out.push({ text: m[5], underline: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({ text: s.slice(last) });
  return out;
}

/**
 * Word-wrap formatted segments (same algorithm as wrap()) while carrying the
 * bold/italic/underline style across line breaks, so markers never leak at
 * wrap points.
 */
export function wrapBody(body: string, width: number): InlineSeg[][] {
  const out: InlineSeg[][] = [];
  for (const raw of clean(body).split("\n")) {
    const segs = parseInline(raw);
    if (raw.trim() === "") {
      out.push([{ text: "" }]);
      continue;
    }
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
      for (const w of seg.text.split(" ")) {
        if (w === "") continue;
        const need = lineLen === 0 ? w.length : w.length + 1;
        if (lineLen + need > width) flush();
        line.push({ text: (lineLen === 0 ? "" : " ") + w, bold: seg.bold, italic: seg.italic, underline: seg.underline });
        lineLen = lineLen === 0 ? w.length : lineLen + 1 + w.length;
      }
    }
    const before = out.length;
    flush();
    if (out.length === before) out.push([{ text: "" }]);
  }
  return out;
}

// The same letter re-renders on every keystroke, and LetterView + the n-key
// highlight jump + the scroll clamp each need the wrapped body — parsing and
// wrapping it every time is the TUI's biggest per-render cost. Memoize by
// (letter key, width, body length) and share across all call sites.
const wrapCache = new Map<string, InlineSeg[][]>();
export function wrapBodyCached(key: string, body: string, width: number): InlineSeg[][] {
  // Key on the body itself (not its length): two same-length bodies would
  // otherwise share a cache entry and render stale content after an edit.
  const ck = `${key}|${width}|${body}`;
  let v = wrapCache.get(ck);
  if (!v) {
    if (wrapCache.size > 512) wrapCache.clear();
    v = wrapBody(body, width);
    wrapCache.set(ck, v);
  }
  return v;
}
