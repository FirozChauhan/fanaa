import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
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

type Style = {
  text: string;
  fg?: string;
  bg?: string;
  bold?: boolean;
  dim?: boolean;
  underline?: boolean;
};

/**
 * Turn one emulated buffer line into styled Ink spans (cells grouped by
 * style). cursorX (a buffer column) marks the editor's cursor cell, which is
 * drawn as a thin vertical bar — the terminal-emulator cursor.
 */
function renderLine(line: IBufferLine | undefined, width: number, cursorX?: number): React.ReactNode {
  if (!line) return " ".repeat(width);
  const spans: React.ReactNode[] = [];
  let cur: Style | null = null;
  const flush = () => {
    if (cur) {
      spans.push(
        <Text key={spans.length} color={cur.fg} backgroundColor={cur.bg} bold={cur.bold} dimColor={cur.dim} underline={cur.underline}>
          {cur.text}
        </Text>
      );
      cur = null;
    }
  };
  for (let x = 0; x < width; x++) {
    const cell = line.getCell(x);
    if (!cell) {
      if (!cur || cur.fg !== undefined || cur.bg !== undefined || cur.bold || cur.dim || cur.underline) {
        flush();
        cur = { text: "" };
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
    // Vertical bar cursor: a thin "▏" rendered at the cursor cell (the
    // emulator's cursor). Insert mode is forced, so it usually sits on the
    // empty cell after the text — a slim bar like vim's insert cursor.
    const cursorHere = x === cursorX;
    const style: Style = cursorHere
      ? { text: "\u258f", fg: ACCENT, bg, bold: false, dim: false, underline: false }
      : {
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

/** vim config: TUI theme + auto-save + app hotkeys, sourced after vimrc. */
function vimrcContent(): string {
  return [
    '" fanaa embedded editor — theme + hotkeys (sourced after the user\'s vimrc)',
    "set termguicolors",
    "set background=dark",
    "set noswapfile nobackup nowritebackup",
    '" fast esc-close: wait only 25ms for a key-code sequence after ESC,',
    '" so a lone ESC (close) fires quickly; arrow sequences still arrive',
    '" atomically from a real terminal and decode fine.',
    "set ttimeout ttimeoutlen=25",
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
}) {
  const termRef = useRef<Bun.Terminal | null>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const exitedRef = useRef(false);
  const [frame, setFrame] = useState(0);

  // Spawn the editor in a PTY once; keep a reference to the running process
  // so the resize effect can adjust both the PTY and the emulator.
  const procRef = useRef<ReturnType<typeof Bun.spawn> | null>(null);

  useEffect(() => {
    const xterm = new Terminal({ cols: width, rows: height, allowProposedApi: true, convertEol: true });
    xtermRef.current = xterm;

    // Render when vim's redraw burst settles. Vim emits each redraw as a few
    // chunks (content, then the final cursor move — the latter trails by
    // ~16ms while the TextChangedI auto-save runs file I/O). Rendering
    // mid-burst showed the block cursor at a transient position for a frame
    // (the per-keystroke cursor jump). The timer trails the LAST chunk by the
    // quiet period, measured from when the burst started (firstPending), and
    // a cap bounds the wait during continuous/held-key input so frames keep
    // flowing. xterm's write() applies chunks asynchronously, so bumps happen
    // in the write callback, after each chunk is in the buffer.
    const QUIET = 50;
    const CAP = 60;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let firstPending = 0;
    const bump = () => {
      if (timer) clearTimeout(timer);
      if (!firstPending) firstPending = Date.now();
      const elapsed = Date.now() - firstPending;
      const wait = Math.max(8, Math.min(QUIET, CAP - elapsed));
      timer = setTimeout(() => {
        timer = null;
        firstPending = 0;
        setFrame((f) => f + 1);
      }, wait);
    };

    const term = new Bun.Terminal({
      cols: width,
      rows: height,
      data: (_t, d) => {
        xterm.write(d, bump);
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
      if (timer) clearTimeout(timer);
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
    setFrame((f) => f + 1);
  }, [width, height]);

  // Emulated screen → Ink rows. The viewport starts at buffer line
  // viewportY, so add it to index the absolute buffer correctly. The block
  // cursor rides inside the frame at the emulated cursor position.
  const rows = useMemo(() => {
    const x = xtermRef.current;
    if (!x) return null;
    const buf = x.buffer.active;
    const vy = buf.viewportY;
    const cx = buf.cursorX;
    const cy = buf.cursorY;
    const n = Math.min(height, buf.length - vy);
    const out: React.ReactNode[] = [];
    for (let y = 0; y < n; y++) {
      out.push(<Text key={y}>{renderLine(buf.getLine(vy + y), width, y === cy ? cx : undefined)}</Text>);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, width, height]);

  return (
    <Box flexDirection="column" width={width} height={height} overflowY="hidden">
      {rows ?? (
        <Text>
          {" ".repeat(Math.max(1, width))}
        </Text>
      )}
    </Box>
  );
}
