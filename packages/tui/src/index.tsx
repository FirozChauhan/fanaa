#!/usr/bin/env bun
import { runTui } from "./runTui";

/**
 * TUI entrypoint for `bun run src/index.tsx` (dev). The compiled `fanaa`
 * binary re-execs itself with FANAA_TUI=1 and runs runTui() from the CLI
 * entry — see runTui.ts for the full story.
 */
await runTui();
