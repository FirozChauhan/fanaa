import React from "react";
import { Box, Text } from "ink";
import { rfcDate } from "fanaa-core";
import type { Letter } from "../data";
import { ACCENT, truncate, wrap } from "../util";

/** Email-style rendering of a letter. `height` enables scrolling (full view). */
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
  const bodyLines = wrap(letter.body, Math.max(20, width - 2));
  const shown = height ? bodyLines.slice(offset, offset + height) : bodyLines.slice(offset);
  const rule = "\u2500".repeat(Math.max(10, Math.min(width, 64)));

  return (
    <Box flexDirection="column">
      <Text>
        <Text color="#777" dimColor>Date:    </Text>
        <Text bold>{rfcDate(letter.date)}</Text>
      </Text>
      <Text>
        <Text color="#777" dimColor>From:    </Text>
        <Text bold color={m.from ? ACCENT : undefined}>{truncate(m.from || "", Math.max(4, width))}</Text>
      </Text>
      <Text>
        <Text color="#777" dimColor>To:      </Text>
        <Text bold color={ACCENT}>{truncate(m.to || "", Math.max(4, width))}</Text>
      </Text>
      <Text>
        <Text color="#777" dimColor>Subject: </Text>
        <Text bold>{truncate(m.subject || "(no subject)", Math.max(4, width))}</Text>
      </Text>
      <Text color="#555" dimColor>{rule}</Text>
      <Box flexDirection="column">
        {shown.map((ln, i) => (
          <Text key={i}>{ln || " "}</Text>
        ))}
      </Box>
      {bodyLines.length > (offset + (height ?? 0)) && (
        <Text color="#777" dimColor>… more</Text>
      )}
    </Box>
  );
}
