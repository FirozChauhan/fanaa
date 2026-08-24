import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { configPath } from "fanaa-core";

export interface FanaaConfig {
  identity?: {
    default_from?: string;
    default_to?: string;
  };
}

export function loadConfig(root: string): FanaaConfig {
  try {
    const raw = readFileSync(configPath(root), "utf8");
    return (Bun.TOML.parse(raw) as FanaaConfig) ?? {};
  } catch {
    return {};
  }
}

export function saveConfig(root: string, cfg: FanaaConfig): void {
  mkdirSync(root, { recursive: true });
  const lines: string[] = [];
  lines.push("[identity]");
  lines.push(`default_from = ${tomlQuote(cfg.identity?.default_from ?? "")}`);
  lines.push(`default_to = ${tomlQuote(cfg.identity?.default_to ?? "")}`);
  writeFileSync(configPath(root), lines.join("\n") + "\n", { mode: 0o600 });
}

function tomlQuote(s: string): string {
  return `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
