import React from "react";
import { Text } from "ink";
import type { Letter } from "../data";
import { ACCENT, truncate } from "../util";

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
        const date = l.key.slice(5); // MM-DD
        const subject = truncate(l.meta.subject || "(no subject)", Math.max(4, width - 22));
        const trail = truncate(l.meta.to || "", Math.max(0, width - 16));
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
    </>
  );
}
