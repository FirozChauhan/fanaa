import { readFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";

/**
 * Prompt helpers: when stdin is a TTY, `promptText` asks interactively;
 * when piped, it consumes lines from the pre-read buffer so the entire
 * pipeline (e.g. `echo -e "subject\nbody" | fanaa`) is deterministic
 * and doesn't deadlock on readline EOF.
 */

/**
 * Pre-read piped stdin once at module load. For TTY this stays empty
 * and we use real interactive prompts.
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

/**
 * Interactive prompt with a dimmed default value. When stdin is piped,
 * returns the next pre-read line (or the default).
 */
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
