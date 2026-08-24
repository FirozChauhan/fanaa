import { writeFileSync } from "node:fs";
import { join } from "node:path";
import React, { useMemo, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";
import { fanaaRoot, journalRoot } from "fanaa-core";
import { loadLetters, dayCounts, computeStreak, type Letter } from "./data";
import { LetterList } from "./components/letterList";
import { LetterView } from "./components/letterView";
import { AMBER, DIVIDER, FAINT, GOLD, MUTED, PAPER, ACCENT, gradientColors } from "./util";

// The wrapper passes the active journal category; entries live in its repo.
const CATEGORY = process.env.FANAA_CATEGORY?.trim() || "fanaa";
const STORE = fanaaRoot();
const JOURNAL = journalRoot(STORE, CATEGORY);

type View = "browse" | "letter" | "compose" | "help";

const TITLE = "FANAA";

function Title() {
  // Show the journal category next to the logo when it's not the default.
  const title = CATEGORY === "fanaa" ? TITLE : `${TITLE} \u00b7 ${CATEGORY}`;
  const colors = gradientColors(title, AMBER, GOLD);
  return (
    <Text bold>
      {[...title].map((c, i) => (
        <Text key={i} color={c === " " ? undefined : colors[i]}>
          {c}
        </Text>
      ))}
    </Text>
  );
}

/** Centered popup listing every keybinding. */
function HelpOverlay({
  cols,
  rows,
  onClose,
}: {
  cols: number;
  rows: number;
  onClose: () => void;
}) {
  const w = Math.min(44, cols - 4);
  const h = Math.min(20, rows - 4);
  const binds: [string, string][] = [
    ["j/k ↑↓", "navigate"],
    ["g / G", "top / bottom"],
    ["enter", "read letter"],
    ["a", "write new"],
    ["e", "edit letter"],
    ["d", "delete letter"],
    ["r", "refresh"],
    ["h / ?", "help"],
    ["q", "quit"],
    ["j/k", "scroll letter"],
    ["esc", "back"],
    ["enter", "open vim"],
    ["esc", "cancel"],
  ];
  return (
    <Box
      width={w}
      height={h}
      flexDirection="column"
      borderStyle="round"
      borderColor={ACCENT}
      paddingX={2}
      paddingTop={1}
    >
      <Text bold color={GOLD}>
        HELP
      </Text>
      <Box flexDirection="column" marginTop={1}>
        {binds.map(([k, desc], i) => (
          <Text key={`${k}-${i}`}>
            <Text color={MUTED}>{k.padEnd(12)}</Text>
            <Text color={PAPER}>{desc}</Text>
          </Text>
        ))}
      </Box>
      <Text color={FAINT}>esc / h — close</Text>
    </Box>
  );
}

export function App() {
  const { stdout } = useStdout();
  const [letters, setLetters] = useState<Letter[]>(() => loadLetters(JOURNAL));
  const [idx, setIdx] = useState(0);
  const [view, setView] = useState<View>("browse");
  const [helpReturn, setHelpReturn] = useState<View>("browse");
  const [offset, setOffset] = useState(0);
  const [subject, setSubject] = useState("");

  // Clamp to sane minima: a 0×0 stdout (pipes, weird PTYs, early frames)
  // would collapse every layout to nothing.
  const cols = Math.max(40, stdout.columns ?? 80);
  const rows = Math.max(12, stdout.rows ?? 24);
  const selected = letters[idx];
  const stats = useMemo(() => {
    const counts = dayCounts(letters);
    return { total: letters.length, streak: computeStreak(counts) };
  }, [letters]);

  /**
   * Hand off to the CLI wrapper: it opens vim on the letter body (git-commit
   * style), writes/edits the entry, then relaunches this TUI. Pending payload:
   *   new letter:  subject
   *   edit letter: EDIT:<key>
   */
  const handOff = (payload: string) => {
    writeFileSync(join(STORE, ".tui-pending"), payload);
    process.exit(66);
  };

  useInput((input, key) => {
    if (view === "compose") {
      if (key.escape) setView("browse");
      else if (key.ctrl && input === "c") process.exit(0);
      else if (/[\r\n]/.test(input)) {
        // Enter can arrive glued to the typed subject (fast typing, pasted
        // input) — ink-text-input only submits on a lone key.return, so we
        // detect the newline ourselves and submit on the pre-newline text.
        const merged = subject + input;
        const i = merged.search(/[\r\n]/);
        handOff(merged.slice(0, i).trim());
      }
      return;
    }
    if (view === "letter") {
      if (key.downArrow || input === "j") setOffset((o) => o + 1);
      else if (key.upArrow || input === "k") setOffset((o) => Math.max(0, o - 1));
      else if (input === "e" && selected) handOff(`EDIT:${selected.key}`);
      else if (input === "d" && selected) handOff(`DELETE:${selected.key}`);
      else if (input === "h" || input === "?") {
        setHelpReturn("letter");
        setView("help");
      } else if (key.return || key.escape || key.rightArrow || input === "q") setView("browse");
      return;
    }
    if (view === "help") {
      if (key.escape || input === "h" || input === "?" || input === "q") setView(helpReturn);
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
    } else if (input === "e" && selected) handOff(`EDIT:${selected.key}`);
    else if (input === "d" && selected) handOff(`DELETE:${selected.key}`);
    else if (input === "h" || input === "?") {
      setHelpReturn("browse");
      setView("help");
    } else if (input === "r") setLetters(loadLetters(JOURNAL));
    else if (input === "q" || (key.ctrl && input === "c")) process.exit(0);
  });

  if (view === "help") {
    return (
      <Box flexDirection="column" height={rows} alignItems="center" justifyContent="center">
        <HelpOverlay cols={cols} rows={rows} onClose={() => setView(helpReturn)} />
      </Box>
    );
  }

  if (view === "compose") {
    return (
      <Box flexDirection="column" height={rows} paddingX={2} paddingTop={3}>
        <Title />
        <Text color={MUTED}>a new letter — subject first, then vim</Text>
        <Box marginTop={1}>
          <Text bold color={ACCENT}>
            {"\u276f"} {" "}
          </Text>
          <TextInput
            value={subject}
            onChange={setSubject}
            onSubmit={() => handOff(subject.trim())}
            placeholder="(no subject)"
          />
        </Box>
        <Text color={FAINT}>enter = vim · esc = cancel</Text>
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
        <Text color={FAINT}>j/k scroll · e edit · d delete · esc back</Text>
      </Box>
    );
  }

  const listW = Math.min(42, Math.floor(cols * 0.38));
  const showPreview = cols >= 62;
  const previewW = showPreview ? cols - listW - 2 : 0; // 1 = divider, 1 = margin
  const listH = Math.max(3, rows - 4);
  const listTop = Math.min(Math.max(0, idx - listH + 1), Math.max(0, idx));
  const visible = letters.slice(listTop, listTop + listH);
  const selInList = idx - listTop;
  const hasAbove = listTop > 0;
  const hasBelow = letters.length > listTop + listH;

  // Number of lines the divider column should span.
  const dividerLines = (hasAbove ? 1 : 0) + listH + (hasBelow ? 1 : 0);

  return (
    <Box flexDirection="column" height={rows}>
      {/* header */}
      <Box paddingX={1} alignItems="center">
        <Title />
        <Box flexGrow={1} />
        <Text color={MUTED}>
          <Text bold color={GOLD}>
            {stats.total}
          </Text>{" "}
          {stats.total === 1 ? "letter" : "letters"}
          {stats.streak > 1 && (
            <>
              {"  "}•{"  "}
              <Text bold color={ACCENT}>
                {stats.streak}
              </Text>{" "}
              day streak
            </>
          )}
        </Text>
      </Box>
      <Text color={DIVIDER}>{"\u2500".repeat(Math.max(4, cols))}</Text>

      {/* panes */}
      <Box flexDirection="row" flexGrow={1}>
        <Box flexDirection="column" width={listW} paddingLeft={1}>
          {hasAbove && (
            <Text color={FAINT}>{" \u2191"}</Text>
          )}
          <LetterList
            letters={visible}
            selected={selInList}
            width={listW - 1}
            height={listH - (hasAbove ? 1 : 0) - (hasBelow ? 1 : 0)}
          />
          {hasBelow && (
            <Text color={FAINT}>{" \u2193"}</Text>
          )}
        </Box>
        {showPreview && selected && (
          <>
            <Box flexDirection="column" width={1}>
              {Array.from({ length: dividerLines }).map((_, i) => (
                <Text key={i} color={DIVIDER}>
                  {"\u2502"}
                </Text>
              ))}
            </Box>
            <Box flexDirection="column" width={previewW} marginLeft={1}>
              <LetterView letter={selected} width={previewW} height={listH} offset={0} />
            </Box>
          </>
        )}
      </Box>

      {/* footer */}
      <Box paddingX={1}>
        <Text color={FAINT}>
          <Text color={MUTED}>H</Text>: Help
        </Text>
      </Box>
    </Box>
  );
}
