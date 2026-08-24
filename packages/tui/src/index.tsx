#!/usr/bin/env bun
import React from "react";
import { render } from "ink";
import { App } from "./app";

// exitOnCtrlC: false — the app handles ctrl+c itself (the editor needs it for
// cancel/discard, and Ink's built-in exit would swallow the keypress).
await render(<App />, { exitOnCtrlC: false }).waitUntilExit();
