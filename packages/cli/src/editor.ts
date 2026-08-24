import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline";

function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Open the user's $EDITOR (git-style) on a file and wait for exit. */
export function runEditor(path: string): void {
  const editor = process.env.EDITOR || process.env.VISUAL || "vim";
  const res = spawnSync(`${editor} ${shellQuote(path)}`, {
    shell: true,
    stdio: "inherit",
  });
  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(`Editor exited with status ${res.status}`);
  }
}

/** Built-in composer for people without an $EDITOR: type lines, finish with Ctrl+D or ".end" on its own line. */
export function composeLines(prefix = ""): Promise<string> {
  if (!process.stdin.isTTY) return Promise.resolve("");
  if (prefix) console.log(`\u001b[2m${prefix.trimEnd()}\u001b[0m\n`);
  console.log(
    "\u001b[2m(write your letter — press Ctrl+D or type .end on its own line to finish)\u001b[0m",
  );
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.setPrompt("> ");
  const lines: string[] = [];
  rl.prompt();
  return new Promise((resolve) => {
    rl.on("line", (l) => {
      if (l.trim() === ".end") {
        rl.close();
        return;
      }
      lines.push(l);
      rl.prompt();
    });
    rl.on("close", () => resolve(lines.join("\n")));
  });
}
