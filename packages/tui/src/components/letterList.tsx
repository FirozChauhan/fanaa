import React from "react";
import { Text } from "ink";
import type { Letter } from "../data";
import { ACCENT, FAINT, GOLD, MUTED, PAPER, SEL_BG, truncate } from "../util";

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
        // Unique entry ID = HHMM timestamp + 6-char hash ("1220EACOE3").
        const id = l.key.slice(11, 15) + l.key.slice(16);
        const subjW = Math.max(4, width - 3 - id.length - 2);
        const subject = cap(truncate(l.meta.subject || "(no subject)", subjW));
        return (
          <Text key={l.key} backgroundColor={sel ? SEL_BG : undefined} wrap="truncate">
            <Text color={sel ? ACCENT : FAINT}>{sel ? "\u25b8 " : "  "}</Text>
            <Text color={sel ? GOLD : MUTED} bold={sel}>
              {id}
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
