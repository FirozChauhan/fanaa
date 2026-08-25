#!/usr/bin/env bun
import React from "react";
import { render } from "ink";
import { App } from "./app";

/**
 * TUI entrypoint. Rendered by the CLI wrapper (`fanaa tui`) in a loop; this
 * process exits 0 to quit. Editing is in-process — vim runs inside the right
 * pane (VimPane) and the app saves letters directly, so no exit-code handoff
 * is needed (exit 66 remains a legacy CLI path for older frontends).
 *
 * exitOnCtrlC: false — the app handles ctrl+c itself (the editor needs it for
 * cancel/discard, and Ink's built-in exit would swallow the keypress).
 */
await render(<App />, { exitOnCtrlC: false }).waitUntilExit();
