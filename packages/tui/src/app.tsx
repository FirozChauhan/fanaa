import { writeFileSync } from "node:fs";
import { join } from "node:path";
import React, { useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";
import { fanaaRoot } from "fanaa-core";
import { computeStreak, dayCounts, loadLetters, type Letter } from "./data";
import { LetterList } from "./components/letterList";
import { LetterView } from "./components/letterView";
import { ACCENT } from "./util";

type View = "browse" | "letter" | "compose";

export function App() {
  const { stdout } = useStdout();
  const [letters, setLetters] = useState<Letter[]>(() => loadLetters());
  const [idx, setIdx] = useState(0);
  const [view, setView] = useState<View>("browse");
  const [offset, setOffset] = useState(0);
  const [subject, setSubject] = useState("");

  const cols = stdout.columns ?? 80;
  const rows = stdout.rows ?? 24;
  const counts = dayCounts(letters);
  const streak = computeStreak(counts);
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
      <Box flexDirection="column" height={rows} paddingX={2} paddingTop={2}>
        <Text bold color={ACCENT}>
          {"\u27ea"} fanaa — compose
        </Text>
        <Box marginTop={1}>
          <Text color="#777" dimColor>
            subject:{" "}
          </Text>
          <TextInput
            value={subject}
            onChange={setSubject}
            onSubmit={submitCompose}
            placeholder="(no subject)"
          />
        </Box>
        <Text color="#555" dimColor>
          enter = write · esc = cancel
        </Text>
      </Box>
    );
  }

  if (letters.length === 0) {
    return (
      <Box flexDirection="column" height={rows} alignItems="center" justifyContent="center">
        <Text bold color={ACCENT}>
          {"\u27ea"} fanaa
        </Text>
        <Text color="#777" dimColor>
          no letters yet
        </Text>
        <Text color="#555" dimColor>
          press a to write your first one
        </Text>
      </Box>
    );
  }

  if (view === "letter") {
    const bodyH = Math.max(3, rows - 8);
    return (
      <Box flexDirection="column" height={rows} paddingX={1}>
        <LetterView letter={selected} width={cols - 2} height={bodyH} offset={offset} />
        <Text color="#555" dimColor>
          j/k scroll · esc back
        </Text>
      </Box>
    );
  }

  const listW = Math.min(36, Math.floor(cols * 0.34));
  const listH = Math.max(3, rows - 3);
  const listTop = Math.min(Math.max(0, idx - listH + 1), Math.max(0, idx));
  const visible = letters.slice(listTop, listTop + listH);
  const selInList = idx - listTop;
  const hasAbove = listTop > 0;
  const hasBelow = letters.length > listTop + listH;
  const showPreview = cols >= 56;
  const previewW = cols - listW;

  return (
    <Box flexDirection="row" height={rows}>
      <Box flexDirection="column" width={listW} height={rows}>
        <Box paddingX={1} justifyContent="space-between">
          <Text bold color={ACCENT}>
            {"\u27ea"} fanaa
          </Text>
          <Text color="#777" dimColor>
            {streak > 0 ? `streak ${streak} · ` : ""}
            {letters.length}
          </Text>
        </Box>
        <Box flexDirection="column" flexGrow={1}>
          {hasAbove && (
            <Text color="#444" dimColor>
              {"\u2191"}
            </Text>
          )}
          <LetterList
            letters={visible}
            selected={selInList}
            width={listW}
            height={listH - (hasAbove ? 1 : 0) - (hasBelow ? 1 : 0)}
          />
          {hasBelow && (
            <Text color="#444" dimColor>
              {"\u2193"}
            </Text>
          )}
        </Box>
        <Box paddingX={1}>
          <Text color="#555" dimColor>
            j/k · enter · a · q
          </Text>
        </Box>
      </Box>
      {showPreview && selected && (
        <Box
          flexDirection="column"
          width={previewW}
          height={rows}
          borderStyle="round"
          borderColor="#333"
        >
          <LetterView letter={selected} width={previewW - 2} height={rows - 4} offset={0} />
        </Box>
      )}
    </Box>
  );
}
