import { parseDateStamp, rfcDate } from "fanaa-core";
import type { EntryMeta } from "fanaa-core";

/**
 * Terminal output helpers for the CLI (not the TUI). When stdout is a real TTY,
 * ANSI dim/bold escapes are emitted; otherwise they're stripped so the output
 * is clean for pipes and redirection.
 */

const color = process.stdout.isTTY === true;

export function dim(s: string): string {
  return color ? `\u001b[2m${s}\u001b[0m` : s;
}
export function bold(s: string): string {
  return color ? `\u001b[1m${s}\u001b[0m` : s;
}

/**
 * Strip terminal control characters from rendered output — a letter body or
 * frontmatter containing `\x1b[` sequences must not inject into the terminal.
 */
function clean(s: string): string {
  return s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "");
}

/** Render an entry like an email: headers, blank line, body. */
export function renderEntry(meta: EntryMeta, body: string): void {
  const date = rfcDate(parseDateStamp(meta.date));
  const lines = [
    `${dim("Date:")}    ${bold(date)}`,
    `${dim("From:")}    ${bold(clean(meta.from || ""))}`,
    `${dim("To:")}      ${bold(clean(meta.to || ""))}`,
    `${dim("Subject:")} ${bold(clean(meta.subject || "(no subject)"))}`,
    "",
    clean(body),
  ];
  console.log(lines.join("\n"));
}
