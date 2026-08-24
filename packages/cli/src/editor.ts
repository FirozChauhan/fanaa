import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { stdin, stdout } from "node:process";

/**
 * Fanaa's built-in full-screen editor — pure ANSI, zero dependencies.
 *
 * Insert-mode only (a textarea, not a modal editor): arrows move, Enter
 * splits, Backspace/Delete edit, Home/End jump, PgUp/PgDn page.
 *   ctrl-s  save & exit
 *   ctrl-c  cancel (asks before discarding unsaved changes)
 *   ctrl-z  undo (100 steps)
 *   paste   works via bracketed-paste mode
 *
 * Set FANAA_EDITOR to keep using an external editor:
 *   FANAA_EDITOR=vim fanaa
 */

const CUR_LINE_BG = "\x1b[48;5;236m"; // warm dark grey — subtle, not bright
const UNDO_MAX = 100;

/** Trim n without splitting a surrogate pair (emoji-safe). */
function cut(s: string, n: number): string {
  let i = n;
  if (i > 0 && i < s.length) {
    const c = s.charCodeAt(i);
    if (c >= 0xdc00 && c <= 0xdfff) i -= 1;
  }
  return s.slice(i);
}

function runExternal(file: string): void {
  const editor = process.env.FANAA_EDITOR;
  if (!editor) return;
  const res = spawnSync(editor, [file], { stdio: "inherit" });
  if (res.error) {
    console.error(`fanaa: could not launch ${editor}: ${res.error.message}`);
  }
}

export function runEditor(path: string): Promise<void> {
  // Only FANAA_EDITOR opts out of the built-in editor — EDITOR/VISUAL never
  // hijack fanaa (vim stays out of this app).
  if (process.env.FANAA_EDITOR) {
    return Promise.resolve().then(() => runExternal(path));
  }
  // No terminal to edit in — nothing to do (caller reads the untouched file).
  if (!stdin.isTTY || !stdout.isTTY) return Promise.resolve();

  return new Promise((resolve) => {
    const raw = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
    const lines = raw ? raw.replace(/\n$/, "").split("\n") : [""];
    const original = lines.join("\n");
    let row = 0;
    let col = 0;
    let scrollX = 0;
    const undo: { lines: string[]; row: number; col: number }[] = [];
    let prompt: "discard" | null = null;
    let done: "save" | "cancel" | null = null;

    let cols = stdout.columns || 80;
    let rows = stdout.rows || 24;

    const snapshot = () => {
      undo.push({ lines: lines.slice(), row, col });
      if (undo.length > UNDO_MAX) undo.shift();
    };
    const restore = () => {
      const s = undo.pop();
      if (s) {
        lines.splice(0, lines.length, ...s.lines);
        row = s.row;
        col = s.col;
        scrollX = 0;
      }
    };
    const clampCol = () => {
      if (col < 0) col = 0;
      const max = lines[row]?.length ?? 0;
      if (col > max) col = max;
    };
    const adjustScroll = () => {
      const textW = Math.max(20, cols);
      if (col - scrollX >= textW) scrollX = col - textW + 1;
      if (col < scrollX) scrollX = col;
    };
    const move = (dr: number, dc: number) => {
      if (dr !== 0) {
        row += dr;
        if (row < 0) row = 0;
        if (row >= lines.length) row = lines.length - 1;
        clampCol();
        scrollX = 0;
      }
      if (dc !== 0) {
        col += dc;
        clampCol();
      }
      adjustScroll();
    };
    const gotoCol = (n: number) => {
      col = n;
      clampCol();
      adjustScroll();
    };
    const insert = (text: string) => {
      if (!text) return;
      snapshot();
      lines[row] = lines[row].slice(0, col) + text + lines[row].slice(col);
      col += text.length;
      adjustScroll();
    };
    const newline = () => {
      snapshot();
      const after = lines[row].slice(col);
      lines[row] = lines[row].slice(0, col);
      row += 1;
      col = 0;
      scrollX = 0;
      lines.splice(row, 0, after);
    };
    const backspace = () => {
      if (col > 0) {
        snapshot();
        const prev = cut(lines[row], col - 1);
        lines[row] = prev + lines[row].slice(col);
        col -= 1;
        adjustScroll();
      } else if (row > 0) {
        snapshot();
        col = lines[row - 1].length;
        lines[row - 1] += lines[row];
        lines.splice(row, 1);
        row -= 1;
        scrollX = 0;
      }
    };
    const del = () => {
      const line = lines[row];
      if (col < line.length) {
        snapshot();
        lines[row] = line.slice(0, col) + line.slice(col + 1);
      } else if (row < lines.length - 1) {
        snapshot();
        lines[row] += lines[row + 1];
        lines.splice(row + 1, 1);
      }
    };

    const draw = () => {
      const textW = Math.max(20, cols);
      const bodyRows = Math.max(1, rows - 1);
      const top = Math.min(
        Math.max(0, row - Math.floor(bodyRows / 2)),
        Math.max(0, lines.length - bodyRows),
      );
      let out = "\x1b[2J\x1b[H";
      for (let i = 0; i < bodyRows; i++) {
        const li = top + i;
        let text = li < lines.length ? lines[li] : "";
        text = cut(text, scrollX);
        const vis = (cut(text, textW) + " ".repeat(textW)).slice(0, textW);
        const body = li === row ? `${CUR_LINE_BG}${vis}\x1b[0m` : vis;
        out += body;
        if (i < bodyRows - 1) out += "\n";
      }
      const dirty = lines.join("\n") !== original;
      const left = prompt === "discard" ? "discard changes? y/n" : ` fanaa${dirty ? " · unsaved" : ""}`;
      const right = prompt === "discard" ? "" : "ctrl-s save · ctrl-c cancel · ctrl-z undo";
      const pad = Math.max(1, cols - left.length - right.length);
      out += `\n\x1b[48;5;214m\x1b[30m${left}${" ".repeat(pad)}${right}\x1b[0m`;
      const onRow = Math.min(bodyRows, row - top + 1);
      const onCol = Math.min(cols, col - scrollX + 1);
      out += `\x1b[${onRow};${onCol}H`;
      stdout.write(out);
    };

    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.removeListener("data", onData);
      process.removeListener("SIGWINCH", onResize);
      stdout.write("\x1b[?25h\x1b[0m\x1b[?2004l\x1b[2J\x1b[H");
      resolve();
    };
    const finish = () => {
      if (done === "save") {
        const text = lines.join("\n");
        writeFileSync(path, text ? text + "\n" : "");
      }
      cleanup();
    };

    const onData = (chunk: Buffer) => {
      buf += chunk.toString("utf8");
      while (buf.length) {
        if (prompt === "discard") {
          const k = buf[0];
          buf = buf.slice(1);
          if (k === "y" || k === "Y") {
            done = "cancel";
            finish();
            return;
          }
          if (k === "n" || k === "N") prompt = null;
          draw();
          continue;
        }
        const ch = buf[0];
        if (ch === "\x1b") {
          const m = buf.match(/^\x1b\[([0-9;]*)([A-Za-z~])/);
          if (!m) {
            // Bare ESC or a half-received sequence: wait for more, else ignore.
            buf = buf.length < 3 ? "" : buf.slice(1);
            draw();
            continue;
          }
          buf = buf.slice(m[0].length);
          const p = m[1] ? m[1].split(";").map(Number) : [];
          const f = m[2];
          if (f === "A") move(-1, 0);
          else if (f === "B") move(1, 0);
          else if (f === "C") move(0, 1);
          else if (f === "D") move(0, -1);
          else if (f === "H") gotoCol(0);
          else if (f === "F") gotoCol(lines[row].length);
          else if (f === "~" && p[0] === 3) del();
          else if (f === "~" && p[0] === 1) gotoCol(0);
          else if (f === "~" && p[0] === 4) gotoCol(lines[row].length);
          else if (f === "~" && p[0] === 5) move(-Math.max(1, rows - 2), 0);
          else if (f === "~" && p[0] === 6) move(Math.max(1, rows - 2), 0);
          else if (f === "~" && p[0] === 200) pasting = true;
          else if (f === "~" && p[0] === 201) pasting = false;
          // unknown sequences ignored
          draw();
          continue;
        }
        if (ch === "\r" || ch === "\n") {
          newline();
          buf = buf.slice(1);
          draw();
          continue;
        }
        if (ch === "\x7f") {
          backspace();
          buf = buf.slice(1);
          draw();
          continue;
        }
        if (ch === "\t") {
          insert("  ");
          buf = buf.slice(1);
          draw();
          continue;
        }
        if (ch === "\x13") {
          buf = buf.slice(1);
          done = "save";
          finish();
          return;
        }
        if (ch === "\x03") {
          buf = buf.slice(1);
          if (lines.join("\n") !== original) prompt = "discard";
          else {
            done = "cancel";
            finish();
            return;
          }
          draw();
          continue;
        }
        if (ch === "\x1a") {
          restore();
          buf = buf.slice(1);
          draw();
          continue;
        }
        if (ch === "\x04") {
          buf = buf.slice(1); // ctrl-d: no-op
          continue;
        }
        // Printable run (typing or pasted text)
        let run = "";
        while (buf.length) {
          const c = buf[0];
          if (c === "\x1b" || "\r\n\x7f\t\x13\x03\x1a\x04".includes(c)) break;
          run += c;
          buf = buf.slice(1);
        }
        if (run) insert(run);
        draw();
      }
    };

    let buf = "";
    let pasting = false;
    const onResize = () => {
      cols = stdout.columns || 80;
      rows = stdout.rows || 24;
      draw();
    };

    process.on("SIGWINCH", onResize);
    stdout.write("\x1b[?25l\x1b[?2004h");
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on("data", onData);
    draw();
  });
}

/**
 * Keyboard composer for `fanaa add` — no editor at all.
 * Type lines; Ctrl+D or a line that is exactly ".end" finishes.
 */
export async function composeLines(prefix = ""): Promise<string> {
  const readline = (await import("node:readline")).default;
  const rl = readline.createInterface({ input: stdin, output: stdout });
  if (prefix) {
    stdout.write(prefix.replace(/\n$/, "") + "\n");
    stdout.write("\x1b[2m--- continuing above ---\x1b[0m\n");
  }
  stdout.write("\x1b[2m(type .end or ctrl-d to finish)\x1b[0m\n");
  const body: string[] = [];
  try {
    for await (const line of rl) {
      if (line.trim() === ".end") break;
      body.push(line);
    }
  } finally {
    rl.close();
  }
  return body.join("\n");
}
