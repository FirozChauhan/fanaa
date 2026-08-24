import React from "react";
import { Text } from "ink";
import { dayKey, parseDayKey } from "fanaa-core";
import type { Letter } from "../data";
import { ACCENT, FAINT, GOLD, MUTED, PAPER, SEL_BG, truncate } from "../util";

/** "today" / "yesterday" / weekday / MM-DD — newest first. */
function dayLabel(key: string): string {
  const today = dayKey(new Date());
  if (key === today) return "today";
  const y = new Date(Date.now() - 86400000);
  if (key === dayKey(y)) return "yesterday";
  const d = parseDayKey(key);
  const now = new Date();
  const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((todayMid.getTime() - d.getTime()) / 86400000);
  if (diff >= 0 && diff < 7) {
    return d.toLocaleDateString("en-GB", { weekday: "long" }).toLowerCase();
  }
  return key.slice(5);
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
  const labelW = 10;
  const trailW = Math.max(0, Math.min(20, Math.floor(width / 3)));
  const subjW = Math.max(6, width - 2 - labelW - (trailW ? trailW + 2 : 0));
  return (
    <>
      {rows.map((l, i) => {
        const sel = i === selected;
        const label = dayLabel(l.key);
        const subject = truncate(l.meta.subject || "(no subject)", subjW);
        const trail = truncate(`\u2192 ${l.meta.to ?? ""}`, trailW);
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
