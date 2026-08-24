import { spawn } from "node:child_process";
import { join } from "node:path";

/**
 * Hand off to the CLI's write flow (subject → $EDITOR or built-in composer).
 * Requires pausing Ink's raw-mode stdin while the child owns the terminal.
 */
export function openEditor(subject: string): Promise<number> {
  const cli = join(import.meta.dir, "../../cli/src/index.ts");
  const wasRaw = process.stdin.isRaw;
  try {
    process.stdin.setRawMode(false);
  } catch {
    /* not a tty */
  }
  return new Promise((resolve) => {
    const child = spawn("bun", ["run", cli, "-s", subject], {
      stdio: "inherit",
      env: process.env,
    });
    const restore = () => {
      try {
        process.stdin.setRawMode(wasRaw);
      } catch {
        /* ignore */
      }
    };
    child.on("exit", (code) => {
      restore();
      resolve(code ?? 0);
    });
    child.on("error", () => {
      restore();
      resolve(1);
    });
  });
}
