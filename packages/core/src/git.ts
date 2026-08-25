import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * The journal store is a git repo: every write/edit/delete is a commit, so
 * the whole letter archive is versioned and diffable (one entry file = one
 * commit, subject line = the letter's subject). Shared by the CLI and the
 * TUI's embedded editor.
 */

/** Run git in `root`, returning status + trimmed stdout/stderr. */
function git(root: string, args: string[]) {
  const res = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  return {
    status: res.status ?? -1,
    stdout: (res.stdout ?? "").trim(),
    stderr: (res.stderr ?? "").trim(),
  };
}

/** The user's global git email, used as default "from" until they change it. */
export function gitEmail(): string | null {
  const res = git(process.cwd(), ["config", "--get", "user.email"]);
  return res.status === 0 && res.stdout ? res.stdout : null;
}

/** Initialize a repo (main branch) at `root` if it doesn't have one yet. */
export function ensureRepo(root: string): void {
  if (!existsSync(join(root, ".git"))) {
    const res = git(root, ["init", "-b", "main"]);
    if (res.status !== 0) throw new Error(`git init failed: ${res.stderr}`);
  }
}

/**
 * Commit an entry file. Returns the short hash, or null if there was
 * nothing to commit (e.g. an edit that changed nothing). If the user has
 * no global git identity, a local repo-level one ("Fanaa") is configured
 * so commits still succeed on first use.
 */
export function commitEntry(root: string, file: string, subject: string): string | null {
  ensureRepo(root);
  const add = git(root, ["add", file]);
  if (add.status !== 0) throw new Error(`git add failed: ${add.stderr}`);

  let c = git(root, ["commit", "-m", subject || "(no subject)"]);
  if (c.status !== 0 && /user\.(name|email)/.test(c.stderr)) {
    git(root, ["config", "user.name", "Fanaa"]);
    git(root, ["config", "user.email", gitEmail() ?? "fanaa@localhost"]);
    c = git(root, ["commit", "-m", subject || "(no subject)"]);
  }
  if (c.status !== 0) {
    if (c.stderr.includes("nothing to commit") || c.stdout.includes("nothing to commit")) {
      return null;
    }
    throw new Error(`git commit failed: ${c.stderr}`);
  }
  const rev = git(root, ["rev-parse", "--short", "HEAD"]);
  return rev.stdout || "HEAD";
}
