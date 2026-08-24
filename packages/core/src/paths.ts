import { homedir } from "node:os";
import { join } from "node:path";

/** Root of the fanaa store. Overridable for tests with FANAA_DIR. */
export function fanaaRoot(): string {
  return process.env.FANAA_DIR || join(homedir(), ".fanaa");
}

/**
 * Root of a category's journal. The default category "fanaa" lives at the
 * store root; every other category is its own repo under cats/<name>/.
 */
export function journalRoot(root: string, category: string): string {
  return category === "fanaa" ? root : join(root, "cats", category);
}

export function entriesDir(root: string): string {
  return join(root, "entries");
}

export function configPath(root: string): string {
  return join(root, "config.toml");
}
