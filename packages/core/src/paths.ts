import { homedir } from "node:os";
import { join } from "node:path";

/**
 * On-disk store layout (~/.fanaa unless FANAA_DIR overrides it):
 *
 *   config.toml            identity + active journal category
 *   entries/YYYY/MM/*.md   letters of the default journal ("fanaa")
 *   cats/<name>/entries/…  per-category journals, each its own git repo
 */

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

/** Directory holding entries of the default journal: <root>/entries. */
export function entriesDir(root: string): string {
  return join(root, "entries");
}

/** Path of config.toml inside the store root. */
export function configPath(root: string): string {
  return join(root, "config.toml");
}
