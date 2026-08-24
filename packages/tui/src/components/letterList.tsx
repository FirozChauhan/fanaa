import React from "react";
import { Text } from "ink";
import { dayKey, parseDayKey } from "fanaa-core";
import type { Letter } from "../data";
import { ACCENT, FAINT, GOLD, MUTED, PAPER, SEL_BG, truncate } from "../util";

/** "today 1930" / "yest 1930" / "sat 1930" / "08-24 1930" — time shown when the day has several letters. */
function dayLabel(base: string, time: string, multi: boolean): string {
  const today = dayKey(new Date());
  const suffix = multi && time ? ` ${time}` : "";
  if (base === today) return `today${suffix}`;
  const y = new Date(Date.now() - 86400000);
  if (base === dayKey(y)) return `yest${suffix}`;
  const d = parseDayKey(base);
  const now = new Date();
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((todayMid.getTime() - d.getTime()) / 86400000);
  if (diff >= 0 && diff < 7) {
    const wd = d.toLocaleDateString("en-GB", { weekday: "short" }).toLowerCase();
    return `${wd}${suffix}`;
  }
  return `${base.slice(5).replace("-", " ")}${suffix}`;
}

export function LetterList({
  letters,
  selected,
  width,
  height,
}: {
  letters: Letter[];
  selected: number;
  width: number;
  height: number;
}) {
  const rows = letters.slice(0, height);
  const labelW = 11;
  const trailW = Math.max(0, Math.min(20, Math.floor(width / 3)));
  const subjW = Math.max(6, width - 2 - labelW - (trailW ? trailW + 2 : 0));
  return (
    <>
      {rows.map((l, i) => {
        const sel = i === selected;
        const base = l.key.slice(0, 10);
        const time = l.key.length > 10 ? l.key.slice(11, 15) : "";
        const multi = rows.filter((r) => r.key.slice(0, 10) === base).length > 1;
        const label = dayLabel(base, time, multi);
        const subject = truncate(l.meta.subject || "(no subject)", subjW);
        const to = l.meta.to?.trim();
        // Default recipient is ME — only show the arrow when it's someone else.
        const trail = to && to.toLowerCase() !== "me" ? truncate(`\u2192 ${to}`, trailW) : "";
        return (
          <Text key={l.key} backgroundColor={sel ? SEL_BG : undefined} wrap="truncate">
            <Text color={sel ? ACCENT : FAINT}>{sel ? "\u25b8 " : "  "}</Text>
            <Text color={sel ? GOLD : MUTED} bold={sel}>
              {label.padEnd(labelW)}
            </Text>
            <Text color={sel ? GOLD : PAPER} bold={sel}>
              {subject}
            </Text>
            {trail && (
              <Text color={FAINT}>
                {"  "}
                {trail}
              </Text>
            )}
          </Text>
        );
      })}
    </>
  );
}
