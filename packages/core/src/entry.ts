/**
 * Entry model: a letter is frontmatter (date/id/from/to/subject) + a
 * free-form body, serialized to markdown. Both CLI and TUI parse and
 * serialize through here so the on-disk format stays a single source
 * of truth (any stray frontmatter fields are ignored on read).
 */

export interface EntryMeta {
  /** Local ISO stamp, e.g. 2026-08-24T07:30:00+05:30. */
  date?: string;
  /** The unique HHMM+hash ID shown in the UI (see entryIdFromKey). */
  id?: string;
  /** Sender name/address — defaults to git email. */
  from?: string;
  /** Recipient, conventionally "ME". */
  to?: string;
  /** One-line subject. */
  subject?: string;
}

export interface ParsedEntry {
  meta: EntryMeta;
  /** Everything after the closing `---`, leading blank lines stripped. */
  body: string;
}

/** Parse our own frontmatter format. Returns empty meta + full text if no frontmatter. */
export function parseEntry(text: string): ParsedEntry {
  const lines = text.split("\n");
  if (lines[0]?.trim() !== "---") return { meta: {}, body: text };

  const meta: EntryMeta = {};
  let i = 1;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "---") break;
    if (!line.includes(":")) continue;
    const idx = line.indexOf(":");
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (key === "date") meta.date = val;
    else if (key === "id") meta.id = val;
    else if (key === "from") meta.from = val;
    else if (key === "to") meta.to = val;
    else if (key === "subject") meta.subject = val;
  }
  const body = lines.slice(i + 1).join("\n").replace(/^\n+/, "");
  return { meta, body };
}

/**
 * Serialize frontmatter + body back to the canonical format. Unknown meta
 * keys are dropped (they were never read); the file always ends with a
 * newline. The body's own leading blank lines are trimmed.
 */
export function serializeEntry(meta: EntryMeta, body: string): string {
  const lines = [
    "---",
    `date: ${meta.date ?? ""}`,
    `id: ${meta.id ?? ""}`,
    `from: ${meta.from ?? ""}`,
    `to: ${meta.to ?? ""}`,
    `subject: ${meta.subject ?? ""}`,
    "---",
    "",
  ];
  const content = lines.join("\n") + body.replace(/^\n+/, "");
  return content.endsWith("\n") ? content : content + "\n";
}
