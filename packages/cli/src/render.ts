import { parseDateStamp, rfcDate } from "fanaa-core";
import type { EntryMeta } from "fanaa-core";

const color = process.stdout.isTTY === true;

export function dim(s: string): string {
  return color ? `\u001b[2m${s}\u001b[0m` : s;
}
export function bold(s: string): string {
  return color ? `\u001b[1m${s}\u001b[0m` : s;
}

/** Render an entry like an email: headers, blank line, body. */
export function renderEntry(meta: EntryMeta, body: string): void {
  const date = rfcDate(parseDateStamp(meta.date));
  const lines = [
    `${dim("Date:")}    ${bold(date)}`,
    `${dim("From:")}    ${bold(meta.from || "")}`,
    `${dim("To:")}      ${bold(meta.to || "")}`,
    `${dim("Subject:")} ${bold(meta.subject || "(no subject)")}`,
    "",
    body,
  ];
  console.log(lines.join("\n"));
}
