#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, basename, join } from "node:path";
import { loadConfig, saveConfig } from "./config";
import { dayKey, entryPath, localISO, parseDayKey, parseDateArg, stampKey } from "fanaa-core";
import { composeLines } from "./editor";
import { parseEntry, serializeEntry, type EntryMeta } from "fanaa-core";
import { commitEntry, gitEmail } from "./git";
import { listEntries } from "./list";
import { fanaaRoot } from "fanaa-core";
import { pipedInput, promptText } from "./prompt";
import { renderEntry, dim } from "./render";

function help(): void {
  console.log(`fanaa — write letters only you will ever read.

Usage:
  fanaa                 write today's letter — asks subject, opens vim
                        (FANAA_EDITOR=your-editor to override)
  fanaa add "text"      quick letter — body from the argument
  fanaa add             compose a letter on the command line (ctrl-d or .end)
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

/** The editor used for letter bodies: vim by default, FANAA_EDITOR to override. */
function runEditor(file: string): void {
  const e = (process.env.FANAA_EDITOR?.trim() || "vim").split(/\s+/);
  const args = [...e.slice(1)];
  // Queue GA (last line + append) via feedkeys — vim processes queued keys
  // before any terminal input, so it's genuinely in insert mode when the
  // user types. (`-c 'normal GA'` fails: late terminal handshake bytes can
  // kick vim back to normal mode before the first keystroke lands.)
  if (/vim$/.test(e[0])) args.push("-c", "call feedkeys(\"GA\")");
  args.push(file);
  const res = spawnSync(e[0], args, { stdio: "inherit" });
  if (res.error) {
    console.error(`fanaa: could not launch ${e[0]}: ${res.error.message}`);
    process.exitCode = 1;
  }
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

  // One letter = one file: key YYYY-MM-DD-HHMM, deduped with -2, -3…
  const now = new Date();
  let key = stampKey(opts.dateKey, now);
  for (let n = 2; existsSync(entryPath(root, key)); n++) {
    key = `${stampKey(opts.dateKey, now)}-${n}`;
  }
  const p = entryPath(root, key);
  mkdirSync(dirname(p), { recursive: true });

  // Every capture is a fresh letter; nothing is merged or pre-filled.
  let newBody: string;
  if (opts.mode === "editor") {
    const tmp = join(mkdtempSync(join(tmpdir(), "fanaa-")), "entry.md");
    writeFileSync(tmp, "");
    runEditor(tmp);
    newBody = readFileSync(tmp, "utf8");
  } else if (opts.mode === "lines") {
    newBody = await composeLines();
  } else if (opts.mode === "arg") {
    newBody = opts.argBody ?? "";
  } else {
    newBody = pipedInput();
  }
  newBody = newBody.replace(/\n+$/, "");

  if (newBody.trim() === "") {
    console.log("Aborting fanaa due to empty entry.");
    return;
  }

  const meta: EntryMeta = {
    date: stampFor(key),
    from,
    to,
    subject,
  };
  writeFileSync(p, serializeEntry(meta, newBody));
  const rev = commitEntry(root, p, subject || "(no subject)");
  const tail = rev ? `  [git: ${rev}]` : "";
  console.log(`\n\u001b[32m\u2713\u001b[0m saved (${key}) as ${from} \u2192 ${to}${tail}`);
}

/** Rewrite an existing letter's body; frontmatter (date/from/to/subject) is kept. */
async function cmdEdit(key: string, newBody: string): Promise<void> {
  const root = fanaaRoot();
  const p = entryPath(root, key);
  if (!existsSync(p)) {
    console.error(`No letter found at ${key}.`);
    process.exitCode = 1;
    return;
  }
  const text = readFileSync(p, "utf8");
  const { meta, body } = parseEntry(text);
  const cleaned = newBody.replace(/\n+$/, "");
  if (cleaned.trim() === "") {
    console.log("Aborting fanaa due to empty entry.");
    return;
  }
  writeFileSync(p, serializeEntry(meta, cleaned));
  const rev = commitEntry(root, p, `edit: ${meta.subject || "(no subject)"}`);
  const tail = rev ? `  [git: ${rev}]` : "";
  console.log(`\n\u001b[32m\u2713\u001b[0m edited ${key}${tail}`);
}

async function cmdRead(arg: string): Promise<void> {
  const root = fanaaRoot();
  const exact = /^\d{4}-\d{2}-\d{2}-\d{4}(-\d+)?$/.test(arg);
  const glob = new Bun.Glob("entries/**/*.md");
  const hits: { key: string; text: string }[] = [];
  for (const f of glob.scanSync({ cwd: root, absolute: false, onlyFiles: true })) {
    const key = basename(f).replace(/\.md$/, "");
    if (exact ? key === arg : key.startsWith(arg)) {
      hits.push({ key, text: readFileSync(join(root, f), "utf8") });
    }
  }
  hits.sort((a, b) => b.key.localeCompare(a.key));
  if (hits.length === 0) {
    console.error(`No letters for ${arg}. Write one: fanaa`);
    process.exitCode = 1;
    return;
  }
  hits.forEach((h, i) => {
    if (i > 0) console.log("");
    const { meta, body } = parseEntry(h.text);
    renderEntry(meta, body);
  });
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
    // Loop: the TUI fully exits before the editor runs (terminal handoff), then restarts.
    // Exit 66 = "compose requested" (subject stashed in .tui-pending).
    const tuiEntry = join(import.meta.dir, "../../tui/src/index.tsx");
    const pending = join(root, ".tui-pending");
    while (true) {
      const res = spawnSync("bun", ["run", tuiEntry], { stdio: "inherit" });
      if (res.status === 66) {
        // The TUI hands the letter off to vim (git-commit style): it writes
        // the subject (new letter) or "EDIT:<key>" (rewrite) to .tui-pending
        // and exits; we open vim on a temp file, then write/commit the entry.
        const raw = existsSync(pending) ? readFileSync(pending, "utf8") : "";
        rmSync(pending, { force: true });
        if (raw.startsWith("EDIT:")) {
          const key = raw.slice(5).trim();
          const p = entryPath(root, key);
          if (!existsSync(p)) {
            console.error(`No letter found at ${key}.`);
            continue;
          }
          const { meta, body } = parseEntry(readFileSync(p, "utf8"));
          const tmp = join(mkdtempSync(join(tmpdir(), "fanaa-")), "entry.md");
          writeFileSync(tmp, body.replace(/\n+$/, ""));
          runEditor(tmp);
          const newBody = readFileSync(tmp, "utf8").replace(/\n+$/, "");
          if (newBody !== body.replace(/\n+$/, "")) {
            await cmdEdit(key, newBody);
          } else {
            console.log("No changes — nothing saved.");
          }
        } else {
          const subject = raw.trim();
          const tmp = join(mkdtempSync(join(tmpdir(), "fanaa-")), "entry.md");
          writeFileSync(tmp, "");
          runEditor(tmp);
          const body = readFileSync(tmp, "utf8");
          await cmdWrite({ dateKey: dayKey(new Date()), subject, mode: "arg", argBody: body, values: false });
        }
        continue;
      }
      if (res.status === 0) break; // normal quit
      if (res.status === 130) continue; // ctrl+c in editor → back to TUI
      break; // unexpected error
    }
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

  // Plain `fanaa`: always the built-in full-screen editor (TTY), stdin when piped.
  const mode: BodyMode = process.stdin.isTTY ? "editor" : "stdin";
  await cmdWrite({ dateKey, from, to, subject, values, mode });
}

main().catch((err) => {
  console.error(`\u001b[31mfanaa:\u001b[0m ${err instanceof Error ? err.message : err}`);
  process.exitCode = 1;
});
