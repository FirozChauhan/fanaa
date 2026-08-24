#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, basename, join } from "node:path";
import { loadConfig, saveConfig } from "./config";
import { dayKey, entryPath, localISO, parseDayKey, parseDateArg, stampKey } from "fanaa-core";
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
  fanaa                 write today's letter — asks subject, opens the built-in
                        full-screen editor (FANAA_EDITOR=vim to use your own)
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
    await runEditor(tmp);
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

function cmdRead(arg: string): void {
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
        // The TUI writes "subject\nbody" to .tui-pending; the letter was
        // composed in the TUI's own editor (exit 66 is only a handoff back
        // so the entry write + git commit happen here).
        const raw = existsSync(pending) ? readFileSync(pending, "utf8") : "";
        rmSync(pending, { force: true });
        const nl = raw.indexOf("\n");
        const subject = (nl === -1 ? raw : raw.slice(0, nl)).trim();
        const body = nl === -1 ? "" : raw.slice(nl + 1);
        await cmdWrite({ dateKey: dayKey(new Date()), subject, mode: "arg", argBody: body, values: false });
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
