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

/** Next month-or-year row after index i (a month's next sibling, or the year boundary). */
function nextMonthOrYear(rows: TreeRow[], i: number): TreeRow | undefined {
  for (let j = i + 1; j < rows.length; j++) {
    const k = rows[j].kind;
    if (k === "month" || k === "year") return rows[j];
  }
  return undefined;
}

/**
 * Folder-style Year → Month → entries sidebar (timeline mode):
 *
 *   2026
 *   ├── AUG
 *   │   ├── 1433A4U78J: This is testy
 *   │   └── 1416HGU3AL: Bold test
 *   └── JUL
 *       └── 0915TESTJ1: July test entry
 *   2025
 *   └── DEC
 *       └── 0800TESTD1: December test
 *
 * `rows` is the FULL tree (connectors must see siblings beyond the viewport);
 * `start`/`height` pick the visible window, `selAbs` is the absolute row of the
 * selected letter.
 */
export function TimelineList({
  rows,
  start,
  selAbs,
  width,
  height,
}: {
  rows: TreeRow[];
  start: number;
  selAbs: number;
  width: number;
  height: number;
}) {
  const view = rows.slice(start, start + height);
  return (
    <>
      {view.map((row, k) => {
        const abs = start + k;
        if (row.kind === "year") {
          return (
            <Text key={`y${abs}`} color={GOLD} bold>
              {row.text}
            </Text>
          );
        }
        if (row.kind === "month") {
          const n = Number(row.text) - 1;
          const sib = nextMonthOrYear(rows, abs);
          const conn = sib && sib.kind === "month" ? "├── " : "└── ";
          return (
            <Text key={`m${abs}`} color={ACCENT} bold>
              <Text color={FAINT}>{conn}</Text>
              {MONTHS[n] ?? row.text}
            </Text>
          );
        }
        const l = row.letter;
        const sel = abs === selAbs;
        const id = l.key.slice(11, 15) + l.key.slice(16);
        // Parent month still has more months after this letter → guide line.
        const sib = nextMonthOrYear(rows, abs);
        const guid = sib && sib.kind === "month" ? "│   " : "    ";
        const next = rows[abs + 1];
        const conn = next && next.kind === "letter" ? "├── " : "└── ";
        const subjW = Math.max(4, width - 1 - 8 - id.length - 2);
        const subject = cap(truncate(l.meta.subject || "(no subject)", subjW)).padEnd(subjW);
        return (
          <Text key={l.key} backgroundColor={sel ? SEL_BG : undefined} wrap="truncate">
            <Text color={FAINT}>
              {guid}
              {conn}
            </Text>
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
