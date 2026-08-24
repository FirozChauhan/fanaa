import { writeFileSync } from "node:fs";
import { join } from "node:path";
import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";
import { fanaaRoot, journalRoot } from "fanaa-core";
import { loadLetters, dayCounts, computeStreak, sortLetters, type Letter, type SortMode } from "./data";
import { LetterList } from "./components/letterList";
import { TimelineList, type TreeRow } from "./components/timelineList";
import { LetterView } from "./components/letterView";
import { AMBER, DIVIDER, FAINT, GOLD, MUTED, PAPER, ACCENT, gradientColors, wrapBodyCached } from "./util";

// The wrapper passes the active journal category; entries live in its repo.
import { readFileSync } from "node:fs";

const CATEGORY = process.env.FANAA_CATEGORY?.trim() || "fanaa";
const STORE = fanaaRoot();
const JOURNAL = journalRoot(STORE, CATEGORY);

type View = "browse" | "letter" | "compose" | "help";

const TITLE = "FANAA";
const VERSION = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version as string;

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
    ["/", "search letters"],
    ["s", "sort: date→alpha→len"],
    ["t", "timeline sidebar"],
    ["enter", "read letter"],
    ["a", "write new"],
    ["e", "edit letter"],
    ["d", "delete letter"],
    ["r", "refresh"],
    ["h / ?", "help"],
    ["q", "quit"],
    ["f", "fullscreen (letter)"],
    ["n", "next highlight (letter)"],
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
  const [letterFull, setLetterFull] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hlIdx, setHlIdx] = useState(-1); // -1 = before first highlight
  const [subject, setSubject] = useState("");
  // Search + sort state (browse mode).
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("date");
  const [timeline, setTimeline] = useState(false);

  // Terminal size in state: Ink's own resize handler re-lays-out the existing
  // vDOM but never re-invokes component functions, so a bare `stdout.rows`
  // read stays stale until some keystroke forces a re-render. Re-render on
  // resize so the layout follows the window immediately.
  const [dims, setDims] = useState({ rows: stdout.rows ?? 24, cols: stdout.columns ?? 80 });
  useEffect(() => {
    const onResize = () => setDims({ rows: stdout.rows ?? 24, cols: stdout.columns ?? 80 });
    stdout.on("resize", onResize);
    return () => {
      stdout.off("resize", onResize);
    };
  }, [stdout]);

  // Clamp to sane minima: a 0×0 stdout (pipes, weird PTYs, early frames)
  // would collapse every layout to nothing.
  const cols = Math.max(40, dims.cols);
  const rows = Math.max(12, dims.rows);
  // Sorted + search-filtered views of the letters.
  const sorted = useMemo(() => sortLetters(letters, sortMode), [letters, sortMode]);
  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return sorted;
    return sorted.filter((l) => (l.meta.subject + "\n" + l.body).toLowerCase().includes(q));
  }, [sorted, q]);
  // Timeline mode pins chronological order (overrides the current sort mode).
  const order = useMemo(() => (timeline ? sortLetters(filtered, "date") : filtered), [timeline, filtered]);
  // Selection stays within the ordered list even as search/sort/timeline shrink it.
  const fIdx = Math.min(idx, Math.max(0, order.length - 1));
  const selected = order[fIdx];
  // Timeline sidebar rows: Year → Month → letters, plus letter→row index map.
  const tree = useMemo(() => {
    if (!timeline) return null;
    const rows: TreeRow[] = [];
    const map: number[] = [];
    let lastYear = "";
    let lastMonth = "";
    for (const l of order) {
      const y = l.key.slice(0, 4);
      const m = l.key.slice(5, 7);
      if (y !== lastYear) {
        rows.push({ kind: "year", text: y });
        lastYear = y;
        lastMonth = "";
      }
      if (m !== lastMonth) {
        rows.push({ kind: "month", text: m });
        lastMonth = m;
      }
      map.push(rows.length);
      rows.push({ kind: "letter", letter: l });
    }
    return { rows, map };
  }, [timeline, order]);
  const stats = useMemo(() => {
    const counts = dayCounts(letters);
    return { total: letters.length, streak: computeStreak(counts) };
  }, [letters]);

  // Exit cleanly when the terminal dies (stdin EOF, EIO, stdout EPIPE…)
  // so orphaned Ink processes don't busy-loop consuming 100% CPU.
  useEffect(() => {
    const onEnd = () => process.exit(0);
    process.stdin.on("end", onEnd);
    process.stdin.on("close", onEnd);
    process.stdin.on("error", onEnd);
    process.stdout.on("error", onEnd);
    process.stderr.on("error", onEnd);
    return () => {
      process.stdin.off("end", onEnd);
      process.stdin.off("close", onEnd);
      process.stdin.off("error", onEnd);
      process.stdout.off("error", onEnd);
      process.stderr.off("error", onEnd);
    };
  }, []);

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
      if (key.downArrow || input === "j") setOffset((o) => Math.min(maxOffset, o + 1));
      else if (key.upArrow || input === "k") setOffset((o) => Math.max(0, o - 1));
      else if (input === "f") setLetterFull((v) => !v);
      else if (input === "n" && hlLines.length > 0) {
        const next = (hlIdx + 1) % hlLines.length;
        setHlIdx(next);
        setOffset(Math.min(hlLines[next], maxOffset));
      } else if (input === "e" && selected) handOff(`EDIT:${selected.key}`);
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
    if (searching) {
      if (key.escape) {
        setSearching(false);
        setQuery("");
      } else if (key.return || /[\r\n]/.test(input)) setSearching(false);
      return;
    }
    if (key.downArrow || input === "j") setIdx((i) => Math.min(filtered.length - 1, i + 1));
    else if (key.upArrow || input === "k") setIdx((i) => Math.max(0, i - 1));
    else if (input === "g") setIdx(0);
    else if (input === "G") setIdx(filtered.length - 1);
    else if (input.startsWith("/")) {
      // Ink can batch multiple printable keys into one event (e.g. "/tes").
      setQuery(input.slice(1));
      setSearching(true);
      setIdx(0);
    }
    else if (input === "s") setSortMode((m) => (m === "date" ? "alpha" : m === "alpha" ? "len" : "date"));
    else if (input === "t") setTimeline((v) => !v);
    else if (key.return && selected) {
      setOffset(0);
      setHlIdx(-1);
      setView("letter");
    } else if (input === "a") {
      setSubject("");
      setView("compose");
    } else if (input === "e" && selected) handOff(`EDIT:${selected.key}`);
    else if (input === "d" && selected) handOff(`DELETE:${selected.key}`);
    else if (input === "h" || input === "?") {
      setHelpReturn("browse");
      setView("help");
    } else if (input === "r") {
      setLetters(loadLetters(JOURNAL));
      setIdx(0);
    } else if (input === "q" || (key.ctrl && input === "c")) process.exit(0);
  });

  // Layout numbers are view-independent (the empty/help/compose returns below
  // must NOT skip them — hooks must run on every render or React throws
  // "Rendered fewer hooks than expected").
  const inLetter = view === "letter";
  const full = inLetter && letterFull;
  const listW = Math.min(42, Math.floor(cols * 0.38));
  const showPreview = inLetter || cols >= 62;
  const previewW = showPreview ? (full ? cols - 2 : cols - listW - 2) : 0;
  const listH = Math.max(3, rows - 4 - (searching ? 1 : 0));

  // Wrapped body lines of the selected letter (shared cache with LetterView).
  const bodyLines = useMemo(() => {
    if (!selected) return [];
    return wrapBodyCached(selected.key, selected.body.replace(/\n+$/, ""), Math.max(20, previewW - 2));
  }, [selected, previewW]);
  // Body line indices that contain a #"…"# / #…# highlight. Must use the same
  // wrap width as LetterView (Math.max(20, previewW - 2)) so `n` lands correctly.
  const hlLines = useMemo(
    () => bodyLines.map((ln, i) => (ln.some((s) => s.underline) ? i : -1)).filter((i) => i >= 0),
    [bodyLines]
  );
  // The letter body fits in (listH - 5) rows (Date/From/To/Subject + rule are
  // overhead); beyond that you may scroll, never further than the last line.
  const maxOffset = Math.max(0, bodyLines.length - (listH - 5));

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

  if (view === "letter") {
    // letter shares the split layout below; fullscreen is a pane-level toggle
  } else if (letters.length === 0) {
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

  // Scroll window over the sidebar rows (letters, or tree rows in timeline mode).
  const listLen = tree ? tree.rows.length : filtered.length;
  const selRow = tree ? (tree.map[fIdx] ?? 0) : fIdx;
  const listTop = tree
    ? Math.min(Math.max(0, selRow - listH + 1), Math.max(0, listLen - listH))
    : Math.min(Math.max(0, fIdx - listH + 1), Math.max(0, fIdx));
  const selInList = selRow - listTop;
  const hasAbove = listTop > 0;
  const hasBelow = listLen > listTop + listH;

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

      {/* search bar (browse only) */}
      {searching && view === "browse" && (
        <Box paddingX={1} height={1}>
          <Text bold color={ACCENT}>
            /
          </Text>
          <TextInput
            value={query}
            onChange={(v) => {
              setQuery(v);
              setIdx(0);
            }}
            onSubmit={() => setSearching(false)}
            placeholder="search subject or body"
          />
          <Text color={FAINT}> ({filtered.length})</Text>
        </Box>
      )}

      {/* panes */}
      <Box flexDirection="row" flexGrow={1}>
        {!full && (
          <Box flexDirection="column" width={listW} paddingLeft={1}>
            {filtered.length === 0 ? (
              <Text color={AMBER}>no matches for "{query}"</Text>
            ) : (
              <>
                {hasAbove && <Text color={FAINT}>{" \u2191"}</Text>}
                {tree ? (
                  <TimelineList
                    rows={tree.rows.slice(listTop, listTop + listH)}
                    selRow={selInList}
                    width={listW - 1}
                    height={listH - (hasAbove ? 1 : 0) - (hasBelow ? 1 : 0)}
                  />
                ) : (
                  <LetterList
                    letters={filtered.slice(listTop, listTop + listH)}
                    selected={selInList}
                    width={listW - 1}
                    height={listH - (hasAbove ? 1 : 0) - (hasBelow ? 1 : 0)}
                  />
                )}
                {hasBelow && <Text color={FAINT}>{" \u2193"}</Text>}
              </>
            )}
          </Box>
        )}
        {!full && showPreview && selected && (
          <Box flexDirection="column" width={1}>
            {Array.from({ length: dividerLines }).map((_, i) => (
              <Text key={i} color={DIVIDER}>
                {"\u2502"}
              </Text>
            ))}
          </Box>
        )}
        {showPreview && selected && (
          // Clip the letter to the pane: an auto-height preview column that
          // overflows its row corrupts Yoga's layout of the whole tree (the
          // header's children get laid out at y=-1 and vanish from the output).
          <Box flexDirection="column" width={previewW} marginLeft={1} height={listH} overflowY="hidden">
            <LetterView
              letter={selected}
              width={previewW}
              height={listH}
              offset={inLetter ? offset : 0}
              highlightSubject={inLetter}
            />
          </Box>
        )}
      </Box>

      {/* footer */}
      <Text color={DIVIDER}>{"\u2500".repeat(Math.max(4, cols))}</Text>
      <Box paddingX={1}>
        <Text color={MUTED}>{VERSION}</Text>
        <Text color={FAINT}> · </Text>
        {!timeline && (
          <>
            <Text color={FAINT}>
              <Text color={MUTED}>S</Text>: {sortMode}
            </Text>
            <Text color={FAINT}> · </Text>
          </>
        )}
        <Text color={FAINT}>
          <Text color={MUTED}>T</Text>: {timeline ? "timeline" : "list"}
        </Text>
        <Text color={FAINT}> · </Text>
        <Text color={FAINT}>
          <Text color={MUTED}>H</Text>: Help
        </Text>
        {q && !searching && view === "browse" && (
          <>
            <Text color={FAINT}> · </Text>
            <Text color={AMBER}>
              /{q}/ ({filtered.length})
            </Text>
          </>
        )}
      </Box>
    </Box>
  );
}
