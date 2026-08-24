import React, { memo } from "react";
import { Box, Text } from "ink";
import { pad, rfcDate } from "fanaa-core";
import type { Letter } from "../data";
import { ACCENT, DIVIDER, FAINT, GOLD, MUTED, PAPER, SEL_BG, clean, truncate, wrapBodyCached } from "../util";

/**
 * A letter, laid out like a real letter: date/time, from/to, subject heading,
 * divider rule, then the markdown-formatted body (wrapped, scrollable via
 * `offset`). Serves both the browse-mode preview pane and the focused letter
 * view (which passes a highlightSubject flag and its own offset).
 */
export const LetterView = memo(function LetterView({
  letter,
  width,
  height,
  offset = 0,
  highlightSubject = false,
}: {
  letter: Letter;
  width: number;
  height?: number;
  offset?: number;
  highlightSubject?: boolean;
}) {
  const m = letter.meta;
  // Wrap email addresses in angle brackets; names ("ME") stay bare. Control
  // chars (ESC etc.) in frontmatter are stripped so they can't inject into
  // the terminal.
  const email = (v: string) => (v.includes("@") ? `<${clean(v)}>` : clean(v));
  const time = `${pad(letter.date.getHours())}:${pad(letter.date.getMinutes())}:${pad(letter.date.getSeconds())}`;
  const body = letter.body.replace(/\n+$/, "");
  const bodyLines = wrapBodyCached(letter.key, body, Math.max(20, width - 2));
  // Reserve 5 rows for Date/From/To/Subject + the rule, plus one for "… more".
  const overhead = 5;
  const more = bodyLines.length > (offset + (height ?? 0));
  const bodyCount = height ? Math.max(0, height - overhead - (more ? 1 : 0)) : undefined;
  const shown = bodyCount !== undefined ? bodyLines.slice(offset, offset + bodyCount) : bodyLines.slice(offset);
  const rule = "\u2500".repeat(Math.max(4, width - 2));

  return (
    <Box flexDirection="column" paddingX={1}>
      <Text>
        <Text color={FAINT}>Date:    </Text>
        <Text color={PAPER}>
          {rfcDate(letter.date).toUpperCase()}  {time}
        </Text>
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
        <Text bold backgroundColor={highlightSubject ? SEL_BG : undefined} color={GOLD}>
          {truncate(clean(m.subject || "(no subject)"), Math.max(4, width - 11))}
        </Text>
      </Text>
      <Text color={DIVIDER}>{rule}</Text>
      <Box flexDirection="column">
        {shown.map((ln, i) => (
          <Text key={i}>
            {ln.map((seg, j) => (
              <Text key={j} color={PAPER} bold={seg.bold} italic={seg.italic} underline={seg.underline}>
                {seg.text || " "}
              </Text>
            ))}
          </Text>
        ))}
      </Box>
      {more && (
        <Text color={FAINT}>
          {"\u2026"} more
        </Text>
      )}
    </Box>
  );
});
