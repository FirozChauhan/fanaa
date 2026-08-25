/**
 * Re-exported from fanaa-core so the CLI package keeps working unchanged.
 * The TUI's embedded editor also uses these through fanaa-core directly.
 */
export { commitEntry, ensureRepo, gitEmail } from "fanaa-core";