import { writeFileSync } from "node:fs";
import { join } from "node:path";
import React, { useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";
import { fanaaRoot } from "fanaa-core";
import { loadLetters, type Letter } from "./data";
import { LetterList } from "./components/letterList";
import { LetterView } from "./components/letterView";
import { AMBER, DIVIDER, FAINT, GOLD, MUTED, ACCENT, gradientColors } from "./util";

type View = "browse" | "letter" | "compose";

const TITLE = "\u2767 FANAA"; // ❧ FANAA

function Title() {
  const colors = gradientColors(TITLE, AMBER, GOLD);
  return (
    <Text bold>
      {[...TITLE].map((c, i) => (
        <Text key={i} color={c === " " ? undefined : colors[i]}>
          {c}
        </Text>
      ))}
    </Text>
  );
}

export function App() {
  const { stdout } = useStdout();
  const [letters, setLetters] = useState<Letter[]>(() => loadLetters());
  const [idx, setIdx] = useState(0);
  const [view, setView] = useState<View>("browse");
  const [offset, setOffset] = useState(0);
  const [subject, setSubject] = useState("");

  const cols = stdout.columns ?? 80;
  const rows = stdout.rows ?? 24;
  const selected = letters[idx];

  useInput((input, key) => {
    if (view === "compose") {
      if (key.escape) setView("browse");
      else if (key.ctrl && input === "c") process.exit(0);
      return;
    }
    if (view === "letter") {
      if (key.downArrow || input === "j") setOffset((o) => o + 1);
      else if (key.upArrow || input === "k") setOffset((o) => Math.max(0, o - 1));
      else if (key.return || key.escape || key.rightArrow || input === "q") setView("browse");
      return;
    }
    if (key.downArrow || input === "j") setIdx((i) => Math.min(letters.length - 1, i + 1));
    else if (key.upArrow || input === "k") setIdx((i) => Math.max(0, i - 1));
    else if (input === "g") setIdx(0);
    else if (input === "G") setIdx(letters.length - 1);
    else if (key.return && selected) {
      setOffset(0);
      setView("letter");
    } else if (input === "a") {
      setSubject("");
      setView("compose");
    } else if (input === "r") setLetters(loadLetters());
    else if (input === "q" || (key.ctrl && input === "c")) process.exit(0);
  });

  /**
   * Hand off to the CLI's write flow by fully exiting the TUI (exit 66).
   * The `fanaa tui` wrapper sees the code, reads the subject from
   * ~/.fanaa/.tui-pending, runs the editor with a clean terminal, then
   * relaunches this TUI.
   */
  const submitCompose = () => {
    writeFileSync(join(fanaaRoot(), ".tui-pending"), subject.trim());
    process.exit(66);
  };

  if (view === "compose") {
    return (
      <Box flexDirection="column" height={rows} paddingX={2} paddingTop={3}>
        <Title />
        <Text color={MUTED}>a new letter — subject first, then your editor opens</Text>
        <Box marginTop={1}>
          <Text bold color={ACCENT}>
            {"\u276f"} {" "}
          </Text>
          <TextInput
            value={subject}
            onChange={setSubject}
            onSubmit={submitCompose}
            placeholder="(no subject)"
          />
        </Box>
        <Text color={FAINT}>enter = write · esc = cancel</Text>
      </Box>
    );
  }

  if (letters.length === 0) {
    return (
      <Box flexDirection="column" height={rows} alignItems="center" justifyContent="center">
        <Title />
        <Box marginTop={1}>
          <Text color={MUTED}>no letters yet</Text>
        </Box>
        <Text color={FAINT}>press a to write your first one</Text>
      </Box>
    );
  }

  if (view === "letter") {
    const bodyH = Math.max(3, rows - 9);
    return (
      <Box flexDirection="column" height={rows} paddingX={1}>
        <LetterView letter={selected} width={cols - 2} height={bodyH} offset={offset} />
        <Text color={FAINT}>j/k scroll · esc back</Text>
      </Box>
    );
  }

  const listW = Math.min(42, Math.floor(cols * 0.38));
  const showPreview = cols >= 62;
  const previewW = showPreview ? cols - listW - 1 : 0;
  const listH = Math.max(3, rows - 4);
  const listTop = Math.min(Math.max(0, idx - listH + 1), Math.max(0, idx));
  const visible = letters.slice(listTop, listTop + listH);
  const selInList = idx - listTop;
  const hasAbove = listTop > 0;
  const hasBelow = letters.length > listTop + listH;

  return (
    <Box flexDirection="column" height={rows}>
      {/* header */}
      <Box paddingX={1} alignItems="center">
        <Box width={12}>
          <Title />
        </Box>
        <Box flexGrow={1} justifyContent="center">
          <Text color={MUTED}>letters only you will ever read</Text>
        </Box>
        <Box width={12} alignItems="flex-end">
          <Text color={MUTED}>
            {letters.length} letter{letters.length === 1 ? "" : "s"}
          </Text>
        </Box>
      </Box>
      <Text color={DIVIDER}>{"\u2500".repeat(Math.max(4, cols))}</Text>

      {/* panes */}
      <Box flexDirection="row" flexGrow={1}>
        <Box flexDirection="column" width={listW}>
          {hasAbove && (
            <Text color={FAINT}>{" \u2191"}</Text>
          )}
          <LetterList
            letters={visible}
            selected={selInList}
            width={listW}
            height={listH - (hasAbove ? 1 : 0) - (hasBelow ? 1 : 0)}
          />
          {hasBelow && (
            <Text color={FAINT}>{" \u2193"}</Text>
          )}
        </Box>
        {showPreview && selected && (
          <>
            <Text color={DIVIDER}>{"\u2502"}</Text>
            <Box flexDirection="column" width={previewW}>
              <LetterView letter={selected} width={previewW} height={listH} offset={0} />
            </Box>
          </>
        )}
      </Box>

      {/* footer */}
      <Text color={DIVIDER}>{"\u2500".repeat(Math.max(4, cols))}</Text>
      <Box paddingX={1}>
        <Text color={FAINT}>
          <Text color={MUTED}>j/k</Text> navigate · <Text color={MUTED}>enter</Text> read ·{" "}
          <Text color={MUTED}>a</Text> write · <Text color={MUTED}>r</Text> refresh ·{" "}
          <Text color={MUTED}>q</Text> quit
        </Text>
      </Box>
    </Box>
  );
}
