#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadConfig, saveConfig } from "./config";
import { dayKey, entryPath, localISO, parseDayKey, parseDateArg } from "fanaa-core";
import { composeLines, runEditor } from "./editor";
import { parseEntry, serializeEntry, type EntryMeta } from "fanaa-core";
import { commitEntry, gitEmail } from "./git";
import { listEntries } from "./list";
import { fanaaRoot } from "fanaa-core";
import { pipedInput, promptText } from "./prompt";
import { renderEntry, dim } from "./render";

function help(): void {
  console.log(`fanaa — write letters only you will ever read.

Usage:
  fanaa                 write today's letter (asks subject, opens $EDITOR,
                        or built-in composer if no $EDITOR is set)
  fanaa add "text"      quick letter — body from the argument
  fanaa add             compose letter without opening an editor
  fanaa write           same as \"fanaa add\", explicit
  fanaa yesterday       read a letter  (also: today, YYYY-MM-DD, MM-DD)
  fanaa tui             the beautiful full-screen TUI
  fanaa ls              list recent letters
  fanaa whoami          show who you write as, and to
  fanaa -v              set from/to/subject (from/to become your defaults)
  fanaa --date YYYY-MM-DD   backdate a letter
  fanaa --from X --to Y     write with overrides
  fanaa -s "subject"        set the subject, skip the prompt

Piping:
  echo -e "subject\nbody line" | fanaa        letter from stdin
  echo "body" | fanaa add -s "subject"        quick letter from stdin`);
}

/** Stamp a date for storage. Backdated entries keep the target day. */
function stampFor(dateKey: string): string {
  const base = parseDayKey(dateKey);
  const now = new Date();
  base.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), 0);
  return localISO(base);
}

type BodyMode = "editor" | "lines" | "arg" | "stdin";

async function cmdWrite(opts: {
  dateKey: string;
  from?: string;
  to?: string;
  subject?: string;
  values: boolean;
  mode: BodyMode;
  argBody?: string;
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
    // Never prompt when the body comes from stdin — those lines are the letter.
    if (opts.mode !== "stdin") subject = await promptText("Subject");
  }
  subject = subject || "";

  const p = entryPath(root, opts.dateKey);
  mkdirSync(dirname(p), { recursive: true });
  const existing = existsSync(p) ? readFileSync(p, "utf8") : "";
  const prevBody = parseEntry(existing).body;

  // Acquire the body. Quick modes (add/stdin/lines) append to any existing
  // entry for the day; editor mode lets you edit the full content.
  let newBody: string;
  if (opts.mode === "editor") {
    const tmp = join(mkdtempSync(join(tmpdir(), "fanaa-")), "entry.md");
    writeFileSync(tmp, prevBody);
    runEditor(tmp);
    newBody = readFileSync(tmp, "utf8");
  } else if (opts.mode === "lines") {
    const composed = await composeLines(prevBody);
    newBody = prevBody ? `${prevBody}\n${composed}` : composed;
  } else if (opts.mode === "arg") {
    newBody = prevBody ? `${prevBody}\n${opts.argBody ?? ""}` : (opts.argBody ?? "");
  } else {
    const piped = pipedInput();
    newBody = prevBody ? `${prevBody}\n${piped}` : piped;
  }
  newBody = newBody.replace(/\n+$/, "");

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
  const dateKey = dateArg ? (parseDateArg(dateArg) ?? dayKey(new Date())) : dayKey(new Date());

  if (cmd === "tui") {
    const tuiEntry = join(import.meta.dir, "../../tui/src/index.tsx");
    const res = spawnSync("bun", ["run", tuiEntry], { stdio: "inherit" });
    process.exitCode = res.status ?? 1;
    return;
  }
  if (cmd === "ls" || cmd === "list") {
    listEntries(root);
    return;
  }
  if (cmd === "whoami") {
    cmdWhoami();
    return;
  }
  if (cmd === "add" || cmd === "write") {
    const argBody = cmd === "add" ? positional.slice(1).join(" ") : undefined;
    const mode: BodyMode = argBody
      ? "arg"
      : process.stdin.isTTY
        ? "lines"
        : "stdin";
    await cmdWrite({ dateKey, from, to, subject, values, mode, argBody });
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

  // Plain `fanaa`: $EDITOR if set, built-in composer otherwise (stdin when piped).
  const mode: BodyMode = process.env.EDITOR || process.env.VISUAL
    ? "editor"
    : process.stdin.isTTY
      ? "lines"
      : "stdin";
  await cmdWrite({ dateKey, from, to, subject, values, mode });
}

main().catch((err) => {
  console.error(`\u001b[31mfanaa:\u001b[0m ${err instanceof Error ? err.message : err}`);
  process.exitCode = 1;
});
