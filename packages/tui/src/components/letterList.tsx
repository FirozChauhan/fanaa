import React, { memo } from "react";
import { Text } from "ink";
import type { Letter } from "../data";
import { GOLD, MUTED, PAPER, SEL_BG, truncate } from "../util";

/**
 * The flat (non-timeline) sidebar: one row per letter — unique ID (HHMM+hash)
 * + subject. The selected row gets a full-width background: the subject is
 * padded to the computed width so the SEL_BG span covers the whole line.
 *
 * Receives a pre-sliced viewport (`letters.slice(top, top+height)` from App)
 * plus the selection offset within it.
 */

/** Capitalize the first letter of a string. */
function cap(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

export const LetterList = memo(function LetterList({
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
        const subjW = Math.max(4, width - 1 - id.length - 2);
        // Pad the subject so the selection background spans the full row width.
        const subject = cap(truncate(l.meta.subject || "(no subject)", subjW)).padEnd(subjW);
        return (
          <Text
            key={l.key}
            backgroundColor={sel ? SEL_BG : undefined}
            wrap="truncate"
          >
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
});
