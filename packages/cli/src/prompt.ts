import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

/**
 * When stdin is piped (not a TTY), pre-read all lines once so sequential
 * prompts can consume them deterministically (readline + EOF is flaky).
 * For a TTY this stays empty and we use real interactive prompts.
 */
const pipedLines: string[] = (() => {
  if (process.stdin.isTTY) return [];
  try {
    return readFileSync(0, "utf8")
      .split("\n")
      .map((s) => s.trim());
  } catch {
    return [];
  }
})();

/** Simple interactive prompt with a default value shown dimmed. */
export async function promptText(label: string, def?: string): Promise<string> {
  if (!process.stdin.isTTY) {
    return pipedLines.shift() ?? def ?? "";
  }
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const suffix = def ? ` \u001b[2m(${def})\u001b[0m` : "";
  try {
    const ans = await rl.question(`\u001b[36m?\u001b[0m ${label}${suffix} `);
    const t = ans.trim();
    return t || def || "";
  } finally {
    rl.close();
  }
}

/** Remaining piped stdin lines, used as a letter body in non-interactive mode. */
export function pipedInput(): string {
  return pipedLines.join("\n");
}
