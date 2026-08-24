import { stdin, stdout } from "node:process";

/**
 * Line composer for `fanaa add` — no full-screen editor, just a readline
 * prompt. The user types lines until Ctrl+D or a line that is exactly `.end`.
 * Pasted multi-line text works too (readline handles each line as a separate
 * event). Can also append to a prefix (the editor's `fanaa` handoff uses this
 * to show that the previous TUI body is being continued).
 */
export async function composeLines(prefix = ""): Promise<string> {
  const readline = (await import("node:readline")).default;
  const rl = readline.createInterface({ input: stdin, output: stdout });
  if (prefix) {
    stdout.write(prefix.replace(/\n$/, "") + "\n");
    stdout.write("\x1b[2m--- continuing above ---\x1b[0m\n");
  }
  stdout.write("\x1b[2m(type .end or ctrl-d to finish)\x1b[0m\n");
  const body: string[] = [];
  try {
    for await (const line of rl) {
      if (line.trim() === ".end") break;
      body.push(line);
    }
  } finally {
    rl.close();
  }
  return body.join("\n");
}
