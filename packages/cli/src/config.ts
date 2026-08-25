/**
 * Re-exported from fanaa-core so the CLI package keeps working unchanged.
 * The TUI's embedded editor also uses these through fanaa-core directly.
 */
export { loadConfig, saveConfig } from "fanaa-core";
export type { FanaaConfig } from "fanaa-core";