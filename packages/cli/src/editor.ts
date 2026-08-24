import { stdin, stdout } from "node:process";

/**
 * Line composer for `fanaa add` — no full-screen editor at all.
 * Type lines; Ctrl+D or a line that is exactly ".end" finishes.
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
