import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { parseEntry } from "./entry";
import { bold, dim } from "./render";

interface ListRow {
  key: string;
  subject: string;
  from: string;
  to: string;
}

export function listEntries(root: string, n = 20): void {
  const glob = new Bun.Glob("entries/**/*.md");
  const rows: ListRow[] = [];
  for (const f of glob.scanSync({ cwd: root, absolute: false, onlyFiles: true })) {
    const text = readFileSync(join(root, f), "utf8");
    const { meta } = parseEntry(text);
    const key = basename(f).replace(/\.md$/, "");
    rows.push({
      key,
      subject: meta.subject || "(no subject)",
      from: meta.from || "",
      to: meta.to || "",
    });
  }
  rows.sort((a, b) => b.key.localeCompare(a.key));
  if (rows.length === 0) {
    console.log("No entries yet. Write your first letter: fanaa");
    return;
  }
  for (const r of rows.slice(0, n)) {
    console.log(
      `${dim(r.key)}  ${dim(r.from + " \u2192 " + r.to)}  ${bold(r.subject)}`,
    );
  }
}
