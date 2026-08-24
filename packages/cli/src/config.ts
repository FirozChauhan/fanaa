import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { configPath } from "fanaa-core";

/**
 * Identity + journal preference, stored as TOML at ~/.fanaa/config.toml.
 * `fanaa -v` rewrites it; every other command reads it for defaults
 * (from/to addresses and the active category).
 */

export interface FanaaConfig {
  identity?: {
    /** Default sender — git email unless overridden with -v/--from. */
    default_from?: string;
    /** Default recipient, conventionally "ME". */
    default_to?: string;
  };
  /** Which journal letters go to: "fanaa" (default) or a named category. */
  journal?: {
    category?: string;
  };
}

/** Read config.toml; an unreadable/missing file yields an empty config. */
export function loadConfig(root: string): FanaaConfig {
  try {
    const raw = readFileSync(configPath(root), "utf8");
    return (Bun.TOML.parse(raw) as FanaaConfig) ?? {};
  } catch {
    return {};
  }
}

/**
 * Write the full config (both sections, current values defaulted).
 * File mode 0600 — letters are private. Existing identity settings survive
 * because callers pass the merged config back (see cmdWrite).
 */
export function saveConfig(root: string, cfg: FanaaConfig): void {
  mkdirSync(root, { recursive: true });
  const lines: string[] = [];
  lines.push("[identity]");
  lines.push(`default_from = ${tomlQuote(cfg.identity?.default_from ?? "")}`);
  lines.push(`default_to = ${tomlQuote(cfg.identity?.default_to ?? "")}`);
  lines.push("");
  lines.push("[journal]");
  lines.push(`category = ${tomlQuote(cfg.journal?.category ?? "fanaa")}`);
  writeFileSync(configPath(root), lines.join("\n") + "\n", { mode: 0o600 });
}

/** Quote a string for TOML: backslashes and double quotes escaped. */
function tomlQuote(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
