import { homedir } from "node:os";
import { join } from "node:path";

/** Root of the fanaa store. Overridable for tests with FANAA_DIR. */
export function fanaaRoot(): string {
  return process.env.FANAA_DIR || join(homedir(), ".fanaa");
}

export function entriesDir(root: string): string {
  return join(root, "entries");
}

export function configPath(root: string): string {
  return join(root, "config.toml");
}
