import React from "react";
import { Text } from "ink";
import type { Letter } from "../data";
import { ACCENT, FAINT, GOLD, MUTED, PAPER, SEL_BG, truncate } from "../util";

/** One row of the timeline sidebar tree. */
export type TreeRow =
  | { kind: "year"; text: string }
  | { kind: "month"; text: string }
  | { kind: "letter"; letter: Letter };

const MONTHS = "JAN FEB MAR APR MAY JUN JUL AUG SEP OCT NOV DEC".split(" ");

/** Capitalize the first letter of a string. */
function cap(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Folder-style Year → Month → entries sidebar (timeline mode). */
export function TimelineList({
  rows,
  selRow,
  width,
  height,
}: {
  rows: TreeRow[];
  selRow: number;
  width: number;
  height: number;
}) {
  const view = rows.slice(0, height);
  return (
    <>
      {view.map((row, i) => {
        if (row.kind === "year") {
          return (
            <Text key={`y${i}`} color={GOLD} bold>
              {row.text}
            </Text>
          );
        }
        if (row.kind === "month") {
          const n = Number(row.text) - 1;
          return (
            <Text key={`m${i}`} color={ACCENT} bold>
              {"    "}
              {MONTHS[n] ?? row.text}
            </Text>
          );
        }
        const l = row.letter;
        const sel = i === selRow;
        const id = l.key.slice(11, 15) + l.key.slice(16);
        const subjW = Math.max(4, width - 1 - 8 - id.length - 2);
        const subject = cap(truncate(l.meta.subject || "(no subject)", subjW)).padEnd(subjW);
        return (
          <Text key={l.key} backgroundColor={sel ? SEL_BG : undefined} wrap="truncate">
            <Text color={FAINT}>        </Text>
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
