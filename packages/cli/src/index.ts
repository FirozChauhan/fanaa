#!/usr/bin/env bun
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadConfig, saveConfig } from "./config";
import { dayKey, entryPath, localISO, parseDayKey, parseDateArg } from "./date";
import { runEditor } from "./editor";
import { parseEntry, serializeEntry, type EntryMeta } from "./entry";
import { commitEntry, gitEmail } from "./git";
import { listEntries } from "./list";
import { fanaaRoot } from "./paths";
import { promptText } from "./prompt";
import { renderEntry, dim } from "./render";

function help(): void {
  console.log(`fanaa — write letters only you will ever read.

Usage:
  fanaa                 write today's letter (asks for subject, opens $EDITOR)
  fanaa yesterday       read a letter  (also: today, YYYY-MM-DD, MM-DD)
  fanaa ls              list recent letters
  fanaa whoami          show who you write as, and to
  fanaa -v              set from/to/subject (from/to become your defaults)
  fanaa --date YYYY-MM-DD   backdate a letter
  fanaa --from X --to Y     write with overrides
  fanaa -s "subject"        set the subject, skip the prompt`);
}

/** Stamp a date for storage. Backdated entries keep the target day. */
function stampFor(dateKey: string): string {
  const base = parseDayKey(dateKey);
  const now = new Date();
  base.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0);
  return localISO(base);
}

async function cmdWrite(opts: {
  dateKey: string;
  from?: string;
  to?: string;
  subject?: string;
  values: boolean;
}): Promise<void> {
  const root = fanaaRoot();
  const cfg = loadConfig(root);
  let from = opts.from ?? cfg.identity?.default_from ?? gitEmail() ?? "me";
  let to = opts.to ?? cfg.identity?.default_to ?? "future self";
  let subject = opts.subject;

  if (opts.values) {
    from = await promptText("From (your default until you change it)", from);
    to = await promptText("To", to);
    subject = await promptText("Subject");
    saveConfig(root, { ...cfg, identity: { default_from: from, default_to: to } });
  } else if (subject === undefined) {
    subject = await promptText("Subject");
  }
  subject = subject || "";

  const p = entryPath(root, opts.dateKey);
  mkdirSync(dirname(p), { recursive: true });
  const existing = existsSync(p) ? readFileSync(p, "utf8") : "";
  const prevBody = parseEntry(existing).body;

  // Open a blank buffer with the previous body only — frontmatter is re-stamped on save.
  const tmp = join(mkdtempSync(join(tmpdir(), "fanaa-")), "entry.md");
  writeFileSync(tmp, prevBody);
  runEditor(tmp);
  const newBody = readFileSync(tmp, "utf8").replace(/\n+$/, "");

  if (newBody.trim() === "") {
    console.log("Aborting fanaa due to empty entry.");
    return;
  }
  if (newBody.trim() === prevBody.trim()) {
    console.log("No changes made; nothing saved.");
    return;
  }

  const meta: EntryMeta = {
    date: stampFor(opts.dateKey),
    from,
    to,
    subject,
  };
  writeFileSync(p, serializeEntry(meta, newBody));
  const rev = commitEntry(root, p, subject || "(no subject)");
  const tail = rev ? `  [git: ${rev}]` : "";
  console.log(`\n\u001b[32m\u2713\u001b[0m saved as ${from} \u2192 ${to}${tail}`);
}

function cmdRead(key: string): void {
  const root = fanaaRoot();
  const p = entryPath(root, key);
  if (!existsSync(p)) {
    console.error(`No letter for ${key}. Write one: fanaa`);
    process.exitCode = 1;
    return;
  }
  const { meta, body } = parseEntry(readFileSync(p, "utf8"));
  renderEntry(meta, body);
}

function cmdWhoami(): void {
  const root = fanaaRoot();
  const cfg = loadConfig(root);
  const from = cfg.identity?.default_from ?? gitEmail() ?? "me";
  const to = cfg.identity?.default_to ?? "future self";
  console.log(`From: ${from}`);
  console.log(`To:   ${to}`);
  console.log(dim("Use `fanaa -v` to change."));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let values = false;
  let from: string | undefined;
  let to: string | undefined;
  let subject: string | undefined;
  let dateArg: string | undefined;
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-v" || a === "--values") values = true;
    else if (a === "--from") from = args[++i];
    else if (a === "--to") to = args[++i];
    else if (a === "-s" || a === "--subject") subject = args[++i];
    else if (a === "--date") dateArg = args[++i];
    else if (a === "-h" || a === "--help") {
      help();
      return;
    } else if (a.startsWith("-")) {
      console.error(`Unknown flag: ${a}`);
      help();
      process.exitCode = 1;
      return;
    } else positional.push(a);
  }

  const root = fanaaRoot();
  const cmd = positional[0];

  if (cmd === "ls" || cmd === "list") {
    listEntries(root);
    return;
  }
  if (cmd === "whoami") {
    cmdWhoami();
    return;
  }
  if (cmd !== undefined) {
    const key = parseDateArg(cmd);
    if (!key) {
      console.error(`Unknown date or command: ${cmd}`);
      process.exitCode = 1;
      return;
    }
    cmdRead(key);
    return;
  }

  // Write mode.
  const dateKey = dateArg ? (parseDateArg(dateArg) ?? dayKey(new Date())) : dayKey(new Date());
  await cmdWrite({ dateKey, from, to, subject, values });
}

main().catch((err) => {
  console.error(`\u001b[31mfanaa:\u001b[0m ${err instanceof Error ? err.message : err}`);
  process.exitCode = 1;
});
