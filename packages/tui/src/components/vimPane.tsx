import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text } from "ink";
import { Terminal, type IBufferCell, type IBufferLine } from "@xterm/headless";
import { ACCENT, AMBER, GOLD, PAPER, SEL_BG } from "../util";

/**
 * The embedded editor: a real terminal program (vim by default) running in
 * a Bun pseudo-terminal whose output is emulated by @xterm/headless and
 * re-rendered as Ink text inside the right pane. The sidebar, top bar and
 * footer stay visible — only the pane content is the editor.
 *
 * Input: while mounted, every raw stdin byte is forwarded to the PTY (the
 * App's useInput handler is gated off while editing, so vim alone sees the
 * keys — including ctrl+c, which vim handles itself).
 *
 * Cursor: rendered in-frame as a thin vertical bar at the emulated cursor
 * position — exactly how a real terminal emulator draws its own cursor. No
 * ANSI cursor escapes are ever written to stdout, so Ink's incremental
 * frame erasing (which assumes the real cursor never moves) stays intact.
 *
 * vim integration: a small config file is written next to the temp file and
 * sourced after the user's vimrc — it applies the TUI's warm paper-and-ink
 * palette (termguicolors + highlight groups), auto-saves on every change and
 * on exit, and adds the app close key (esc).
 */

// Warm defaults that match the app's paper-on-ink look (used when reverse
// video is requested with no explicit colors, e.g. the cursor block).
const DEFAULT_FG = "#d8d2c4";
const DEFAULT_BG = "#1e1a16";

/** Classic 16-color ANSI palette (xterm-style brights). */
const ANSI16 = [
  "#000000", "#cc3e44", "#2f9e44", "#f0a500", "#3b5bdb", "#a61e4d", "#1098ad", "#adb5bd",
  "#666666", "#ff6b6b", "#69db7c", "#ffd43b", "#748ffc", "#e599f7", "#22b8cf", "#f8f9fa",
];

/** Map an xterm palette index (0-255) to its hex value (formula, no table). */
function paletteHex(i: number): string {
  if (i < 16) return ANSI16[i];
  if (i < 232) {
    const v = i - 16;
    const step = (x: number) => (x === 0 ? 0 : 55 + x * 40); // 0,95,135,175,215,255
    const r = step(Math.floor(v / 36));
    const g = step(Math.floor((v % 36) / 6));
    const b = step(v % 6);
    return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
  }
  const g = 8 + (i - 232) * 10;
  return `#${g.toString(16).padStart(2, "0").repeat(2)}`;
}

function colorOf(cell: IBufferCell, which: "fg" | "bg"): string | undefined {
  const def = which === "fg" ? cell.isFgDefault() : cell.isBgDefault();
  if (def) return undefined;
  const pal = which === "fg" ? cell.isFgPalette() : cell.isBgPalette();
  if (pal) return paletteHex(which === "fg" ? cell.getFgColor() : cell.getBgColor());
  const rgb = which === "fg" ? cell.getFgColor() : cell.getBgColor();
  return `#${rgb.toString(16).padStart(6, "0")}`;
}

type Span = {
  text: string;
  fg?: string;
  bg?: string;
  bold: boolean;
  dim: boolean;
  underline: boolean;
};

/** "#rrggbb" → "r;g;b" for 24-bit SGR sequences. */
function hexRgb(hex: string): string {
  return `${parseInt(hex.slice(1, 3), 16)};${parseInt(hex.slice(3, 5), 16)};${parseInt(hex.slice(5, 7), 16)}`;
}

/**
 * Decompose one emulated buffer line into style-compressed runs (cells with
 * the same fg/bg/weight grouped). No cursor bar here: the live cursor is
 * painted separately on top (see VimPane's overlay), so the row content is
 * always the true buffer.
 */
function rowSpans(line: IBufferLine | undefined, width: number): Span[] {
  if (!line) return [{ text: " ".repeat(width), bold: false, dim: false, underline: false }];
  const spans: Span[] = [];
  let cur: Span | null = null;
  const flush = () => {
    if (cur) {
      spans.push(cur);
      cur = null;
    }
  };
  for (let x = 0; x < width; x++) {
    const cell = line.getCell(x);
    if (!cell) {
      if (!cur || cur.fg !== undefined || cur.bg !== undefined || cur.bold || cur.dim || cur.underline) {
        flush();
        cur = { text: "", bold: false, dim: false, underline: false };
      }
      cur.text += " ";
      continue;
    }
    let fg = colorOf(cell, "fg");
    let bg = colorOf(cell, "bg");
    // Reverse video: the cell's background becomes the text color and vice
    // versa; cells without explicit colors flip to dark-on-light (the block
    // cursor and vim's inverse highlights).
    if (cell.isInverse() === 1) {
      const newFg = bg ?? DEFAULT_BG;
      const newBg = fg ?? DEFAULT_FG;
      fg = newFg;
      bg = newBg;
    }
    const style: Span = {
      text: cell.getChars() || " ",
      fg,
      bg,
      bold: cell.isBold() === 1,
      dim: cell.isDim() === 1,
      underline: cell.isUnderline() === 1,
    };
    if (
      !cur ||
      cur.fg !== style.fg ||
      cur.bg !== style.bg ||
      cur.bold !== style.bold ||
      cur.dim !== style.dim ||
      cur.underline !== style.underline
    ) {
      flush();
      cur = style;
    } else {
      cur.text += style.text;
    }
  }
  flush();
  return spans;
}

/** Spans → Ink <Text> nodes (the static pane content inside the app frame). */
function rowToInk(spans: Span[]): React.ReactNode {
  return spans.map((s, i) => (
    <Text key={i} color={s.fg} backgroundColor={s.bg} bold={s.bold} dimColor={s.dim} underline={s.underline}>
      {s.text}
    </Text>
  ));
}

/** Spans → 24-bit SGR escape string (the direct-overlay row writes). */
function rowToAnsi(spans: Span[]): string {
  let out = "";
  for (const s of spans) {
    if (!s.text) continue;
    const codes: string[] = [];
    if (s.bold) codes.push("1");
    if (s.dim) codes.push("2");
    if (s.underline) codes.push("4");
    if (s.fg) codes.push(`38;2;${hexRgb(s.fg)}`);
    if (s.bg) codes.push(`48;2;${hexRgb(s.bg)}`);
    out += `\x1b[${codes.join(";")}m${s.text}\x1b[m`;
  }
  return out;
}

/** One emulated cell → its SGR-escaped text (restoring a bar-covered cell). */
function cellAnsi(cell: IBufferCell | undefined): string {
  if (!cell) return " ";
  let fg = colorOf(cell, "fg");
  let bg = colorOf(cell, "bg");
  if (cell.isInverse() === 1) {
    const newFg = bg ?? DEFAULT_BG;
    const newBg = fg ?? DEFAULT_FG;
    fg = newFg;
    bg = newBg;
  }
  const codes: string[] = [];
  if (cell.isBold() === 1) codes.push("1");
  if (cell.isDim() === 1) codes.push("2");
  if (cell.isUnderline() === 1) codes.push("4");
  if (fg) codes.push(`38;2;${hexRgb(fg)}`);
  if (bg) codes.push(`48;2;${hexRgb(bg)}`);
  return `\x1b[${codes.join(";")}m${cell.getChars() || " "}\x1b[m`;
}

/** vim config: TUI theme + auto-save + app hotkeys, sourced after vimrc. */
function vimrcContent(): string {
  // Absolute path to the bundled English wordbase (see assets/words.txt).
  // Read at runtime so the sourced vimrc always points at the real file,
  // whatever the cwd or package layout.
  let dict = "";
  try {
    dict = fileURLToPath(new URL("../../assets/words.txt", import.meta.url));
  } catch {
    // Asset missing (packaged build?) — fall back to no dictionary.
  }
  return [
    '" fanaa embedded editor — theme + hotkeys (sourced after the user\'s vimrc)',
    "set termguicolors",
    "set background=dark",
    "set noswapfile nobackup nowritebackup",
    '" fast esc-close: wait only 25ms for a key-code sequence after ESC,',
    '" so a lone ESC (close) fires quickly; arrow sequences still arrive',
    '" atomically from a real terminal and decode fine.',
    "set ttimeout ttimeoutlen=25",
    '" dictionary auto-completion: a bundled wordbase of common English',
    '" terms powers <C-n>/<C-p> (and <C-x><C-k>) in insert mode. The menu',
    '" shows one item even for a single match, extends the longest common',
    '" prefix as you keep typing, and never auto-selects (Enter/typing',
    '" inserts; the list is only a suggestion).',
    dict ? `set dictionary=${dict.replace(/ /g, "\\ ")}` : "\" dictionary missing",
    "set complete+=k",
    "set completeopt=menuone,longest,noselect",
    '" minimal chrome: no line numbers, no statusline, no mode line, no ~ fill',
    "set nonumber",
    "set norelativenumber",
    "set signcolumn=auto",
    "set laststatus=0",
    "set noshowmode",
    "set fillchars+=eob:\\ ",
    `hi Normal guifg=${DEFAULT_FG}`,
    `hi Visual guifg=${DEFAULT_BG} guibg=${ACCENT}`,
    `hi Search guifg=${DEFAULT_BG} guibg=${AMBER}`,
    `hi MatchParen guifg=${GOLD}`,
    `hi Pmenu guifg=${PAPER} guibg=${SEL_BG}`,
    `hi PmenuSel guifg=${DEFAULT_BG} guibg=${ACCENT}`,
    '" auto-save: write after every change (also clears the modified flag so',
    '" a plain :q quits cleanly instead of E37) and once more on any exit.',
    "au TextChangedI,TextChanged * sil! write",
    "au VimLeavePre * sil! write",
    '" modeless editor: insert mode is the only mode. ctrl+c can\'t leave',
    '" it, so a stray keypress can never turn into normal-mode commands.',
    "inoremap <C-c> <Nop>",
    '" app close key: esc = close (saves + exits) — matches the app\'s',
    '" esc/back convention. Saving is automatic:',
    '" every keystroke writes via TextChangedI and exit writes via VimLeavePre.',
    "inoremap <Esc> <C-o>:x<CR>",
    "nnoremap <Esc> :x<CR>",
  ].join("\n") + "\n";
}

export function VimPane({
  width,
  height,
  file,
  start,
  onExit,
  rowOffset,
  colOffset,
  rows,
}: {
  width: number;
  height: number;
  /** Path of the file being edited. */
  file: string;
  /**
   * How the editor starts: "insert" opens insert mode at the start of the
   * buffer (fresh compose), "append" opens insert mode at the end (edit).
   * Only applies to vim (FANAA_EDITOR overrides start in normal mode).
   */
  start?: "insert" | "append";
  /** Called once after the editor exits, with the file's final contents. */
  onExit: (body: string) => void;
  /** The pane's first output line (1-based) in the terminal's row space. */
  rowOffset: number;
  /** The pane's first output column (1-based) in the terminal's column space. */
  colOffset: number;
  /** Terminal height in rows; the app's output ends at this row while editing. */
  rows: number;
}) {
  const termRef = useRef<Bun.Terminal | null>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const exitedRef = useRef(false);
  const [frame, setFrame] = useState(0);
  // What the overlay last wrote to the real terminal (per pane row, as SGR
  // strings) and where the cursor bar currently sits — the diff state for
  // the direct paints. Kept in refs so paints never trigger React renders.
  const lastDrawnRef = useRef<string[]>([]);
  const lastBarRef = useRef<{ y: number; x: number } | null>(null);

  /**
   * Direct overlay paint: write only the pane rows that changed since the
   * last paint, restore any cell the cursor bar uncovered, draw the bar at
   * the emulator's cursor, then park the terminal cursor back at the app's
   * bottom line (where Ink's incremental frames expect it). Runs
   * synchronously after every PTY chunk is parsed, so typing latency is a
   * terminal's natural ~1-2ms instead of a full 30-line Ink repaint.
   */
  const paint = () => {
    const x = xtermRef.current;
    if (!x) return;
    const buf = x.buffer.active;
    const vy = buf.viewportY;
    const n = Math.min(height, buf.length - vy);
    const rowsNow: string[] = [];
    const changed: number[] = [];
    for (let y = 0; y < n; y++) {
      const s = rowToAnsi(rowSpans(buf.getLine(vy + y), width));
      rowsNow.push(s);
      if (s !== lastDrawnRef.current[y]) changed.push(y);
    }
    lastDrawnRef.current = rowsNow;
    const out: string[] = [];
    const absY = (y: number) => rowOffset + y;
    for (const y of changed) {
      out.push(`\x1b[${absY(y)};${colOffset}H`, rowsNow[y]);
    }
    const cy = buf.cursorY;
    const cx = buf.cursorX;
    const lb = lastBarRef.current;
    if (lb && (lb.y !== cy || lb.x !== cx) && !changed.includes(lb.y)) {
      out.push(`\x1b[${absY(lb.y)};${colOffset + lb.x}H`, cellAnsi(buf.getLine(vy + lb.y)?.getCell(lb.x)));
    }
    const ccell = buf.getLine(vy + cy)?.getCell(cx);
    const cbg = ccell ? colorOf(ccell, "bg") : undefined;
    out.push(`\x1b[${absY(cy)};${colOffset + cx}H`);
    out.push(`\x1b[38;2;${hexRgb(ACCENT)}m${cbg ? `\x1b[48;2;${hexRgb(cbg)}m` : ""}\u258f\x1b[m`);
    lastBarRef.current = { y: cy, x: cx };
    out.push(`\x1b[${rows};1H`);
    process.stdout.write(out.join(""));
  };

  // Spawn the editor in a PTY once; keep a reference to the running process
  // so the resize effect can adjust both the PTY and the emulator.
  const procRef = useRef<ReturnType<typeof Bun.spawn> | null>(null);

  useEffect(() => {
    const xterm = new Terminal({ cols: width, rows: height, allowProposedApi: true, convertEol: true });
    xtermRef.current = xterm;

    const term = new Bun.Terminal({
      cols: width,
      rows: height,
      data: (_t, d) => {
        // After each chunk is parsed into the emulator buffer, paint the
        // changed pane rows straight to the terminal. No debounce: vim's
        // per-keystroke output is a content chunk plus a cursor chunk a few
        // ms later — both are tiny diffs, so the screen follows the buffer
        // at a real terminal's speed.
        xterm.write(d, paint);
      },
    });
    termRef.current = term;
    // Raw slave termios: keystrokes pass straight through to vim with no
    // line discipline (echo/canonical) fighting it. vim re-tunes its own
    // termios on top of this, exactly like a real terminal emulator.
    term.setRawMode(true);

    const editor = (process.env.FANAA_EDITOR?.trim() || "vim").split(/\s+/);
    const args = [...editor.slice(1)];
    // vim extras: source the app config (theme + hotkeys + auto-save) and
    // start in insert mode. Other FANAA_EDITOR binaries get the plain file
    // argument and none of the vim-specific flags.
    if (/vim(\.w32)?$/i.test(editor[0])) {
      const vimrc = join(dirname(file), ".fanaa-vimrc");
      try {
        writeFileSync(vimrc, vimrcContent());
        args.push("-c", `source ${vimrc.replace(/\s/g, "\\ ")}`);
      } catch {
        // Temp dir unwritable? Fall back to a bare vim (still editable).
      }
      // Go: jump to the last line and open a fresh line below it, so typed
      // text starts a new paragraph instead of gluing onto the last char.
      if (start === "append") args.push("-c", 'call feedkeys("Go")');
      else if (start === "insert") args.push("-c", "startinsert");
    }
    args.push(file);

    try {
      procRef.current = Bun.spawn([editor[0], ...args], {
        terminal: term,
        env: { ...process.env, TERM: "xterm-256color", LINES: String(height), COLUMNS: String(width) },
      });
    } catch (err) {
      // Editor binary missing/unlaunchable — report an empty save so the
      // compose flow aborts instead of hanging.
      onExitRef.current("");
      return;
    }

    procRef.current.exited.then(() => {
      if (exitedRef.current) return;
      exitedRef.current = true;
      try {
        onExitRef.current(readFileSync(file, "utf8"));
      } catch {
        onExitRef.current("");
      }
    });

    // Forward raw stdin to vim while mounted. Ink also reads stdin for
    // useInput, but App's handler is gated while editing, so vim alone sees
    // the keys (arrow keys, ctrl+c, escape sequences all pass through raw).
    const onData = (chunk: Buffer | Uint8Array) => term.write(chunk);
    process.stdin.on("data", onData);

    return () => {
      process.stdin.off("data", onData);
      term.close();
      xterm.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track the terminal size: PTY + emulator follow the pane (terminal resizes
  // re-render App → new width/height props → this effect).
  useEffect(() => {
    termRef.current?.resize(width, height);
    xtermRef.current?.resize(width, height);
    lastDrawnRef.current = [];
    lastBarRef.current = null;
    setFrame((f) => f + 1);
  }, [width, height]);

  // Any app frame (resize, app state) repaints the whole pane from the
  // static snapshot, clobbering the live overlay — re-paint everything just
  // after Ink's throttled write lands. During typing no app frame fires, so
  // this stays quiet and the per-chunk paints are the only output.
  useEffect(() => {
    const t = setTimeout(() => {
      lastDrawnRef.current = [];
      lastBarRef.current = null;
      paint();
    }, 40);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  // Static emulated screen → Ink rows (what the app frame paints; the live
  // cursor rides on top via the overlay paints). The viewport starts at
  // buffer line viewportY, so add it to index the absolute buffer correctly.
  const inkRows = useMemo(() => {
    const x = xtermRef.current;
    if (!x) return null;
    const buf = x.buffer.active;
    const vy = buf.viewportY;
    const n = Math.min(height, buf.length - vy);
    const out: React.ReactNode[] = [];
    for (let y = 0; y < n; y++) {
      out.push(<Text key={y}>{rowToInk(rowSpans(buf.getLine(vy + y), width))}</Text>);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, width, height]);

  return (
    <Box flexDirection="column" width={width} height={height} overflowY="hidden">
      {inkRows ?? (
        <Text>
          {" ".repeat(Math.max(1, width))}
        </Text>
      )}
    </Box>
  );
}
