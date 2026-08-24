import React, { useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";
import { computeStreak, dayCounts, loadLetters, type Letter } from "./data";
import { openEditor } from "./editor";
import { Heatmap } from "./components/heatmap";
import { LetterList } from "./components/letterList";
import { LetterView } from "./components/letterView";
import { ACCENT, truncate } from "./util";

type View = "browse" | "letter" | "compose";

export function App() {
  const { stdout } = useStdout();
  const [letters, setLetters] = useState<Letter[]>(() => loadLetters());
  const [idx, setIdx] = useState(0);
  const [view, setView] = useState<View>("browse");
  const [offset, setOffset] = useState(0);
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(false);

  const cols = stdout.columns ?? 80;
  const rows = stdout.rows ?? 24;
  const counts = dayCounts(letters);
  const streak = computeStreak(counts);
  const selected = letters[idx];

  useInput((input, key) => {
    if (busy) return;
    if (view === "compose") {
      if (key.escape) setView("browse");
      else if (key.ctrl && input === "c") process.exit(0);
      return;
    }
    if (view === "letter") {
      if (key.downArrow || input === "j") setOffset((o) => o + 1);
      else if (key.upArrow || input === "k") setOffset((o) => Math.max(0, o - 1));
      else if (key.return || input === "q" || key.escape || key.rightArrow) setView("browse");
      else if (input === "a") {
        setSubject("");
        setView("compose");
      }
      return;
    }
    // browse
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
    else if (input === "q" || key.ctrl === true && input === "c") process.exit(0);
  });

  const submitCompose = async () => {
    setBusy(true);
    try {
      await openEditor(subject.trim());
    } finally {
      setBusy(false);
    }
    setLetters(loadLetters());
    setIdx(0);
    setView("browse");
  };

  if (view === "compose") {
    return (
      <Box flexDirection="column" padding={2}>
        <Text bold color={ACCENT}>
          {"\u27ea"} fanaa — compose
        </Text>
        <Text color="#777" dimColor>
          A new letter to yourself. Subject first, then your editor opens.
        </Text>
        <Box marginTop={1}>
          <Text color="#777" dimColor>
            subject:{" "}
          </Text>
          <TextInput
            value={subject}
            onChange={setSubject}
            onSubmit={submitCompose}
            focus={!busy}
            placeholder="(no subject)"
          />
        </Box>
        {busy && <Text color="#777" dimColor>opening editor…</Text>}
        <Text color="#555" dimColor>
          enter = write · esc = cancel
        </Text>
      </Box>
    );
  }

  const listW = Math.min(42, Math.floor(cols * 0.4));
  const previewW = cols - listW - 5;
  const showPreview = previewW >= 36 && letters.length > 0;
  const headerH = 3;
  const heatmapH = cols >= 72 && letters.length > 0 ? 9 : 0;
  const footerH = 1;
  const bodyH = Math.max(4, rows - headerH - heatmapH - footerH - 4);

  return (
    <Box flexDirection="column" paddingX={1}>
      {/* header */}
      <Box>
        <Text bold color={ACCENT}>
          {"\u27ea"} fanaa
        </Text>
        <Text color="#777" dimColor>
          {"   "}letters to yourself
        </Text>
        <Text color="#777" dimColor>
          {"  ·  "}streak{" "}
        </Text>
        <Text bold color={streak > 0 ? ACCENT : "#555"}>
          {streak}
        </Text>
        <Text color="#777" dimColor>
          {"  ·  "}
          {letters.length} letter{letters.length === 1 ? "" : "s"}
        </Text>
      </Box>

      {/* heatmap */}
      {heatmapH > 0 && <Heatmap counts={counts} />}

      {/* split: list + preview */}
      <Box flexDirection="row" flexGrow={1} marginTop={1}>
        <Box flexDirection="column" width={listW}>
          <LetterList letters={letters} selected={idx} width={listW} />
        </Box>
        {showPreview && selected && (
          <Box flexDirection="column" width={previewW} paddingLeft={1} borderStyle="round" borderColor="#333">
            <LetterView letter={selected} width={previewW - 2} height={bodyH - 2} offset={offset} />
          </Box>
        )}
      </Box>

      {/* footer */}
      <Text color="#555" dimColor>
        j/k navigate · enter read · a compose · r refresh · q quit
      </Text>
    </Box>
  );
}
