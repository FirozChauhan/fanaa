#!/usr/bin/env bun
import React from "react";
import { render } from "ink";
import { App } from "./app";

/**
 * TUI entrypoint. Rendered by the CLI wrapper (`fanaa tui`) in a loop; this
 * process exits 66 to hand off editing to vim and 0 to quit (see packages/cli).
 *
 * exitOnCtrlC: false — the app handles ctrl+c itself (the editor needs it for
 * cancel/discard, and Ink's built-in exit would swallow the keypress).
 */
await render(<App />, { exitOnCtrlC: false }).waitUntilExit();
