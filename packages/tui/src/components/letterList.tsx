import React from "react";
import { Text } from "ink";
import { dayKey, parseDayKey } from "fanaa-core";
import type { Letter } from "../data";
import { ACCENT, FAINT, GOLD, MUTED, PAPER, SEL_BG, truncate } from "../util";

/** "today" / "yest" / "sat" / "08-24" — day label for the sidebar. */
function dayLabel(base: string): string {
  const today = dayKey(new Date());
  if (base === today) return `today`;
  const y = new Date(Date.now() - 86400000);
  if (base === dayKey(y)) return `yest`;
  const d = parseDayKey(base);
  const now = new Date();
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((todayMid.getTime() - d.getTime()) / 86400000);
  if (diff >= 0 && diff < 7) {
    return d.toLocaleDateString("en-GB", { weekday: "short" }).toLowerCase();
  }
  return base.slice(5).replace("-", " ");
}

/** Capitalize the first letter of a string. */
function cap(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
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
  return (
    <>
      {rows.map((l, i) => {
        const sel = i === selected;
        const base = l.key.slice(0, 10);
        // Unique entry ID = HHMM timestamp + 6-char hash ("1220EACOE3").
        const id = l.key.slice(11, 15) + l.key.slice(16);
        const label = cap(dayLabel(base));
        const subjW = Math.max(4, width - 3 - label.length - id.length - 2);
        const subject = cap(truncate(l.meta.subject || "(no subject)", subjW));
        return (
          <Text key={l.key} backgroundColor={sel ? SEL_BG : undefined} wrap="truncate">
            <Text color={sel ? ACCENT : FAINT}>{sel ? "\u25b8 " : "  "}</Text>
            <Text color={sel ? GOLD : MUTED} bold={sel}>
              {label}
            </Text>
            <Text color={sel ? GOLD : PAPER} bold={sel}>
              : {id}
            </Text>
            <Text color={sel ? GOLD : PAPER} bold={sel}>
              : {subject}
            </Text>
          </Text>
        );
      })}
    </>
  );
}
