import React from "react";
import { Box, Text } from "ink";
import type { Letter } from "../data";
import { ACCENT, truncate } from "../util";

export function LetterList({
  letters,
  selected,
  width,
}: {
  letters: Letter[];
  selected: number;
  width: number;
}) {
  const rows = letters.slice(0, 100);
  return (
    <Box flexDirection="column">
      {rows.map((l, i) => {
        const sel = i === selected;
        const date = l.key.slice(5); // MM-DD
        const subject = truncate(l.meta.subject || "(no subject)", Math.max(4, width - 30));
        const trail = truncate(`${l.meta.from ?? ""} \u2192 ${l.meta.to ?? ""}`, Math.max(0, width - 12));
        return (
          <Text key={l.key} backgroundColor={sel ? "#3a3a3a" : undefined} wrap="truncate">
            <Text color={sel ? ACCENT : "#555"}>{sel ? "\u25b8 " : "  "}</Text>
            <Text color={sel ? ACCENT : "#777"} bold={sel}>
              {date}
            </Text>
            {"  "}
            <Text bold={sel}>{subject}</Text>
            {trail && (
              <Text color="#666" dimColor>
                {"  "}
                {trail}
              </Text>
            )}
          </Text>
        );
      })}
      {rows.length === 0 && <Text color="#777" dimColor>no letters yet — press "a" to write your first one</Text>}
    </Box>
  );
}
