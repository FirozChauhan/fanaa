/**
 * Theme system for the TUI: a set of named palettes (warm paper-and-ink
 * schemes with a distinct accent hue) plus a tiny module-level store with
 * useSyncExternalStore subscriptions, so any component can call usePalette()
 * and re-render the instant the theme cycles. The active theme persists to
 * <store>/settings.json.
 *
 * Every palette keeps the same warm paper base — body text (paper), muted,
 * faint, dividers and the selection background all stay warm-neutral — while
 * accent / gold / amber carry the hue. That keeps the letter-writing vibe
 * intact no matter which color you pick.
 */

import { useSyncExternalStore } from "react";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type ThemeName =
  | "ember"
  | "rose"
  | "violet"
  | "azure"
  | "emerald"
  | "crimson"
  | "gold"
  | "mint";

export interface ThemePalette {
  accent: string;
  gold: string;
  amber: string;
  paper: string;
  muted: string;
  faint: string;
  divider: string;
  selBg: string;
}

export const PALETTES: Record<ThemeName, ThemePalette> = {
  // ember — the original: ember orange, parchment, warm umber selection.
  ember: {
    accent: "#ffa94d",
    gold: "#ffd88a",
    amber: "#c98a3d",
    paper: "#cfc7b8",
    muted: "#8a8175",
    faint: "#5c564d",
    divider: "#3a362f",
    selBg: "#3a3124",
  },
  // rose — soft pink on rose-tinted paper.
  rose: {
    accent: "#ff7eaa",
    gold: "#ffb3c8",
    amber: "#cf5f80",
    paper: "#d6c2c0",
    muted: "#97817e",
    faint: "#665250",
    divider: "#40312f",
    selBg: "#432f33",
  },
  // violet — grape/lavender accents on lavender paper.
  violet: {
    accent: "#b49bf8",
    gold: "#d8c4ff",
    amber: "#8f74d8",
    paper: "#cfc7dd",
    muted: "#8e829f",
    faint: "#5e566c",
    divider: "#3a3545",
    selBg: "#3a3248",
  },
  // azure — bright blue on cool slate paper.
  azure: {
    accent: "#6db1ff",
    gold: "#a8d4ff",
    amber: "#5586d6",
    paper: "#c3ccd8",
    muted: "#808a99",
    faint: "#545d69",
    divider: "#333a44",
    selBg: "#303b4a",
  },
  // emerald — fresh green on cool mint paper.
  emerald: {
    accent: "#5fd39f",
    gold: "#a5e8c6",
    amber: "#3fa873",
    paper: "#c2d1c5",
    muted: "#7f9185",
    faint: "#546159",
    divider: "#333d36",
    selBg: "#2e3d33",
  },
  // crimson — bold red on warm blush paper.
  crimson: {
    accent: "#ff6d6d",
    gold: "#ffa8a8",
    amber: "#cf4444",
    paper: "#d5c2bf",
    muted: "#95807d",
    faint: "#665452",
    divider: "#40322f",
    selBg: "#432e2c",
  },
  // gold — sunny yellow on warm sand paper.
  gold: {
    accent: "#ffd23d",
    gold: "#ffe97a",
    amber: "#c79c2c",
    paper: "#d7cdaf",
    muted: "#968c6f",
    faint: "#655e48",
    divider: "#403a2c",
    selBg: "#40371f",
  },
  // mint — teal on pale sea-glass paper.
  mint: {
    accent: "#4dd0c0",
    gold: "#96e8dd",
    amber: "#39a394",
    paper: "#bcd0cc",
    muted: "#7d908b",
    faint: "#525f5b",
    divider: "#303a37",
    selBg: "#2c3a36",
  },
};

/** Cycle order for the T hotkey (ember first — the original look). */
export const THEMES: ThemeName[] = [
  "ember",
  "rose",
  "violet",
  "azure",
  "emerald",
  "crimson",
  "gold",
  "mint",
];

/** Display names for the footer/help. */
export const THEME_NAMES: Record<ThemeName, string> = {
  ember: "Ember",
  rose: "Rose",
  violet: "Violet",
  azure: "Azure",
  emerald: "Emerald",
  crimson: "Crimson",
  gold: "Gold",
  mint: "Mint",
};

let storeRoot = join(homedir(), ".fanaa");
let current: ThemeName = "ember";
const listeners = new Set<() => void>();

/**
 * Load the persisted theme from <root>/settings.json and adopt it as the
 * active one. Call once at startup (app.tsx passes its STORE root).
 */
export function initTheme(root: string): void {
  storeRoot = root;
  try {
    const path = join(root, "settings.json");
    if (existsSync(path)) {
      const parsed = JSON.parse(readFileSync(path, "utf8"));
      const saved = parsed?.theme;
      if (typeof saved === "string" && saved in PALETTES) {
        current = saved as ThemeName;
      }
    }
  } catch {
    // Corrupt/missing settings — keep the default theme.
  }
}

export function getTheme(): ThemeName {
  return current;
}

export function getPalette(): ThemePalette {
  return PALETTES[current];
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Switch the active theme and persist it (best-effort write). */
export function setTheme(t: ThemeName): void {
  if (t === current) return;
  current = t;
  try {
    mkdirSync(storeRoot, { recursive: true });
    writeFileSync(join(storeRoot, "settings.json"), JSON.stringify({ theme: t }, null, 2) + "\n");
  } catch {
    // Unwritable store — the in-memory theme still applies for this session.
  }
  for (const l of listeners) l();
}

/** Advance to the next theme in the cycle; returns the new name. */
export function cycleTheme(): ThemeName {
  const i = THEMES.indexOf(current);
  const next = THEMES[(i + 1) % THEMES.length];
  setTheme(next);
  return next;
}

/** Subscribe to the active theme (re-renders the calling component). */
export function useTheme(): ThemeName {
  return useSyncExternalStore(subscribe, getTheme);
}

/** The current palette — call at the top of any component that colors text. */
export function usePalette(): ThemePalette {
  return PALETTES[useTheme()];
}
