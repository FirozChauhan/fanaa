import { spawnSync } from "child_process";

/** True when the TUI runs inside kitty (TERM or KITTY_* env vars). */
export function inKitty(): boolean {
  return process.env.TERM === "xterm-kitty" || !!process.env.KITTY_WINDOW_ID;
}

const CURATED = [
  "Fira Code",
  "JetBrains Mono",
  "Iosevka",
  "Hack",
  "Cascadia Code",
  "CommitMono Nerd Font",
];

/**
 * Installed monospace families, via fontconfig (fc-list : family). Weight
 * variants (… Black/Light/etc.) are dropped; only real installed fonts are
 * returned (curated names first), capped at 6 to match the 1-6 keys.
 */
export function listMonospaceFonts(): string[] {
  try {
    const r = spawnSync("fc-list", [":", "family"], { encoding: "utf8", timeout: 3000 });
    if (r.status === 0 && r.stdout) {
      const weight = /\s(Black|Light|Medium|Thin|Bold|Italic|Book|Roman|SemiBold|ExtraBold)$/;
      const all: string[] = [];
      for (const line of r.stdout.split("\n")) {
        for (const raw of line.split(",")) {
          const f = raw.trim();
          if (!f || weight.test(f)) continue;
          if (!/mono|code|iosevka|hack|fira|jetbrains|cascadia|terminal/i.test(f)) continue;
          if (!all.includes(f)) all.push(f);
        }
      }
      // Drop "X Nerd Font Mono/Propo" variants when the plain family also exists.
      const set = new Set(all);
      const out = all.filter((f) => {
        const short = f.replace(/ (Mono|Propo)$/, "");
        return short === f || !set.has(short);
      });
      if (out.length > 0) {
        out.sort((a, b) => {
          const ac = CURATED.indexOf(a);
          const bc = CURATED.indexOf(b);
          return (ac === -1 ? 99 : ac) - (bc === -1 ? 99 : bc);
        });
        return out.slice(0, 6);
      }
    }
  } catch {
    // fc-list missing — fall through to curated list
  }
  return CURATED;
}

/**
 * Switch the active kitty window's font family. Needs kitty remote control:
 * `allow_remote_control yes` in ~/.config/kitty/kitty.conf (kitty restart).
 * Returns a short status line for the help popup.
 */
export function setKittyFont(family: string): { ok: boolean; msg: string } {
  if (!inKitty()) return { ok: false, msg: "fonts: only inside kitty" };
  const r = spawnSync("kitty", ["@", "action", "set_font_family", family], {
    encoding: "utf8",
    timeout: 1500, // kitty replies fast when remote control is on; no reply = disabled
  });
  if (r.status === 0) return { ok: true, msg: `font set: ${family}` };
  return { ok: false, msg: "fonts: add allow_remote_control yes to kitty.conf + restart" };
}
