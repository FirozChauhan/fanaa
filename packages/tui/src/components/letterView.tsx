import React from "react";
import { Box, Text } from "ink";
import { rfcDate } from "fanaa-core";
import type { Letter } from "../data";
import { ACCENT, DIVIDER, FAINT, GOLD, MUTED, PAPER, truncate, wrap } from "../util";

/** A letter, laid out like a real letter: date, from/to, subject heading, body. */
export function LetterView({
  letter,
  width,
  height,
  offset = 0,
}: {
  letter: Letter;
  width: number;
  height?: number;
  offset?: number;
}) {
  const m = letter.meta;
  // Wrap email addresses in angle brackets; names ("ME") stay bare.
  const email = (v: string) => (v.includes("@") ? `<${v}>` : v);
  const bodyLines = wrap(letter.body.replace(/\n+$/, ""), Math.max(20, width - 2));
  const shown = height ? bodyLines.slice(offset, offset + height) : bodyLines.slice(offset);
  const rule = "\u2500".repeat(Math.max(4, width - 2));

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text>
        <Text color={FAINT}>Date:    </Text>
        <Text color={PAPER}>{rfcDate(letter.date).toUpperCase()}</Text>
      </Text>
      <Text>
        <Text color={FAINT}>From:    </Text>
        <Text color={MUTED}>{truncate(email(m.from || ""), Math.max(4, width - 12))}</Text>
      </Text>
      <Text>
        <Text color={FAINT}>To:      </Text>
        <Text color={ACCENT}>{truncate(email(m.to || ""), Math.max(4, width - 12))}</Text>
      </Text>
      <Text>
        <Text color={FAINT}>Subject: </Text>
        <Text bold color={GOLD}>
          {truncate(m.subject || "(no subject)", Math.max(4, width - 11))}
        </Text>
      </Text>
      <Text color={DIVIDER}>{rule}</Text>
      <Box flexDirection="column">
        {shown.map((ln, i) => (
          <Text key={i} color={PAPER}>
            {ln || " "}
          </Text>
        ))}
      </Box>
      {bodyLines.length > (offset + (height ?? 0)) && (
        <Text color={FAINT}>
          {"\u2026"} more
        </Text>
      )}
    </Box>
  );
}
