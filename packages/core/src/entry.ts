export interface EntryMeta {
  date?: string;
  id?: string;
  from?: string;
  to?: string;
  subject?: string;
}

export interface ParsedEntry {
  meta: EntryMeta;
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

/** Serialize frontmatter + body, always ending with a newline. */
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
