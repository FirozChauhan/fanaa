import React from "react";
import { render } from "ink";
import { App } from "./app";

/**
 * Boot the full-screen TUI and wait until the user quits.
 *
 * Two callers:
 * - `src/index.tsx` — the dev/`bun run` entrypoint, which calls this directly.
 * - `fanaa` (CLI package) — the compiled binary re-execs itself with
 *   FANAA_TUI=1 and the CLI entry calls this in-process. This is how a single
 *   `bun build --compile` binary hosts both the CLI and the Ink TUI.
 *
 * exitOnCtrlC: false — the app handles ctrl+c itself (the editor needs it for
 * cancel/discard, and Ink's built-in exit would swallow the keypress).
 */
export async function runTui(): Promise<void> {
  await render(<App />, { exitOnCtrlC: false }).waitUntilExit();
}
