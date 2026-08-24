import { spawnSync } from "node:child_process";

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
