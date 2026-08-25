import React, { memo } from "react";
import { Box, Text } from "ink";
import { pad, rfcDate } from "fanaa-core";
import type { Letter } from "../data";
import { clean, truncate, wrapBodyCached } from "../util";
import { usePalette } from "../theme";

/** Wrap email addresses in angle brackets; names ("ME") stay bare. */
const email = (v: string) => (v.includes("@") ? `<${clean(v)}>` : clean(v));

/**
 * A letter's letterhead: date/time, from/to, subject heading and the divider
 * rule (5 rows total). Shared by LetterView and the edit pane, which keeps the
 * letterhead visible above vim while writing.
 */
export const LetterHeader = memo(function LetterHeader({
  letter,
  width,
  highlightSubject = false,
}: {
  letter: Letter;
  width: number;
  highlightSubject?: boolean;
}) {
  const pal = usePalette();
  const m = letter.meta;
  const time = `${pad(letter.date.getHours())}:${pad(letter.date.getMinutes())}:${pad(letter.date.getSeconds())}`;
  const rule = "\u2500".repeat(Math.max(4, width - 2));
  return (
    <>
      <Text>
        <Text color={pal.faint}>Date:    </Text>
        <Text color={pal.paper}>
          {rfcDate(letter.date).toUpperCase()}  {time}
        </Text>
      </Text>
      <Text>
        <Text color={pal.faint}>From:    </Text>
        <Text color={pal.muted}>{truncate(email(m.from || ""), Math.max(4, width - 12))}</Text>
      </Text>
      <Text>
        <Text color={pal.faint}>To:      </Text>
        <Text color={pal.accent}>{truncate(email(m.to || ""), Math.max(4, width - 12))}</Text>
      </Text>
      <Text>
        <Text color={pal.faint}>Subject: </Text>
        <Text bold backgroundColor={highlightSubject ? pal.selBg : undefined} color={pal.gold}>
          {truncate(clean(m.subject || "(no subject)"), Math.max(4, width - 11))}
        </Text>
      </Text>
      <Text color={pal.divider}>{rule}</Text>
    </>
  );
});

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
  const pal = usePalette();
  const m = letter.meta;
  // Control chars (ESC etc.) in frontmatter are stripped so they can't inject
  // into the terminal.
  const body = letter.body.replace(/\n+$/, "");
  const bodyLines = wrapBodyCached(letter.key, body, Math.max(20, width - 2));
  // Reserve 5 rows for Date/From/To/Subject + the rule, plus one for "… more".
  const overhead = 5;
  const more = bodyLines.length > (offset + (height ?? 0));
  const bodyCount = height ? Math.max(0, height - overhead - (more ? 1 : 0)) : undefined;
  const shown = bodyCount !== undefined ? bodyLines.slice(offset, offset + bodyCount) : bodyLines.slice(offset);

  return (
    <Box flexDirection="column" paddingX={1}>
      <LetterHeader letter={letter} width={width} highlightSubject={highlightSubject} />
      <Box flexDirection="column">
        {shown.map((ln, i) => (
          <Text key={i}>
            {ln.map((seg, j) => (
              <Text key={j} color={pal.paper} bold={seg.bold} italic={seg.italic} underline={seg.underline}>
                {seg.text || " "}
              </Text>
            ))}
          </Text>
        ))}
      </Box>
      {more && (
        <Text color={pal.faint}>
          {"\u2026"} more
        </Text>
      )}
    </Box>
  );
});
