import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { dayKey, entryIdFromKey, entryPath, localISO, parseDayKey, stampKey } from "./date";
import { parseEntry, serializeEntry } from "./entry";
import { commitEntry, gitEmail } from "./git";
import { loadConfig } from "./config";

/**
 * Letter CRUD shared by the CLI and the TUI's embedded editor: every
 * write/edit/delete lands in the journal's git repo as its own commit.
 * The CLI keeps its prompts and console output; the TUI calls these
 * directly so vim never needs to leave the right pane.
 */

/** Stamp a date for storage. Backdated entries keep the target day. */
function stampFor(dateKey: string): string {
  const base = parseDayKey(dateKey);
  const now = new Date();
  base.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0);
  return localISO(base);
}

export interface NewLetterOpts {
  /** Journal root (store root for "fanaa", cats/<name>/ otherwise). */
  root: string;
  /** YYYY-MM-DD — the letter's day; time is stamped from the clock. */
  dateKey: string;
  /** Sender override; falls back to config default → git email → "me". */
  from?: string;
  /** Recipient override; falls back to config default → "ME". */
  to?: string;
  subject?: string;
  /** Body, trailing blank lines stripped before saving. */
  body: string;
}

export interface WriteResult {
  /** The new letter's file key, e.g. 2026-08-24-1214-P8MA. */
  key: string;
  /** Git short hash of the commit, or null if nothing was committed. */
  rev: string | null;
  /** Resolved sender (for the "saved as …" message). */
  from: string;
  /** Resolved recipient. */
  to: string;
}

/**
 * Write a new letter: deduped key (stampKey + -2/-3…), frontmatter
 * (date/id/from/to/subject), file, git commit. Empty bodies abort.
 */
export function writeLetter(opts: NewLetterOpts): WriteResult {
  const cfg = loadConfig(opts.root);
  const from = opts.from ?? cfg.identity?.default_from ?? gitEmail() ?? "me";
  const to = opts.to ?? cfg.identity?.default_to ?? "ME";
  const subject = opts.subject ?? "";
  const body = opts.body.replace(/\n+$/, "");

  const now = new Date();
  let key = stampKey(opts.dateKey, now);
  for (let n = 2; existsSync(entryPath(opts.root, key)); n++) {
    key = `${stampKey(opts.dateKey, now)}-${n}`;
  }
  const p = entryPath(opts.root, key);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, serializeEntry({ date: stampFor(key), id: entryIdFromKey(key), from, to, subject }, body));
  const rev = commitEntry(opts.root, p, subject || "(no subject)");
  return { key, rev, from, to };
}

export type EditResult =
  | { status: "saved"; rev: string | null }
  | { status: "unchanged" }
  | { status: "aborted" };

/**
 * Rewrite an existing letter's body; frontmatter (date/from/to/subject) is
 * kept. "unchanged" when the body is byte-identical after cleaning,
 * "aborted" when the new body is empty.
 */
export function editLetter(root: string, key: string, newBody: string): EditResult {
  const p = entryPath(root, key);
  if (!existsSync(p)) throw new Error(`No letter found at ${key}.`);
  const { meta, body } = parseEntry(readFileSync(p, "utf8"));
  const cleaned = newBody.replace(/\n+$/, "");
  if (cleaned.trim() === "") return { status: "aborted" };
  const original = body.replace(/\n+$/, "");
  if (cleaned === original) return { status: "unchanged" };
  writeFileSync(p, serializeEntry(meta, cleaned));
  const rev = commitEntry(root, p, `edit: ${meta.subject || "(no subject)"}`);
  return { status: "saved", rev };
}

/** Delete a letter and commit the removal. Returns the old subject. */
export function removeLetter(root: string, key: string): { subject: string; rev: string | null } {
  const p = entryPath(root, key);
  if (!existsSync(p)) throw new Error(`No letter found at ${key}.`);
  const { meta } = parseEntry(readFileSync(p, "utf8"));
  rmSync(p);
  const subject = meta.subject || "(no subject)";
  const rev = commitEntry(root, p, `delete: ${subject}`);
  return { subject, rev };
}

export { dayKey };
