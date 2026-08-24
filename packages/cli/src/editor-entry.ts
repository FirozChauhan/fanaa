#!/usr/bin/env bun
/**
 * Editor entry point — spawned as a FRESH bun process by `runEditor()` so its
 * stdin is pristine (the caller's stdin has been touched by readline/spawnSync
 * and can no longer receive keys reliably). Exit 0 = saved, 1 = cancelled.
 */
import { interactiveEdit } from "./editor";

const path = process.argv[2];
if (!path) {
  console.error("fanaa: editor needs a file path");
  process.exit(1);
}

interactiveEdit(path)
  .then(() => process.exit(0))
  .catch((err) => {
    try {
      process.stdout.write("\x1b[?25h\x1b[0m\x1b[?2004l\x1b[2J\x1b[H");
    } catch {}
    console.error(`fanaa: editor failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
