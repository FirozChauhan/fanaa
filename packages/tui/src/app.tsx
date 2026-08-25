import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useInput, useStdout } from "ink";
import TextInput from "ink-text-input";
import { dayKey, editLetter, entryPath, fanaaRoot, journalRoot, parseEntry, removeLetter, writeLetter } from "fanaa-core";
import { loadSyncState, recordDelete } from "fanaa-sync";
import { loadLetters, sortLetters, type Letter, type SortMode } from "./data";
import { LetterList } from "./components/letterList";
import { TimelineList, type TreeRow } from "./components/timelineList";
import { LetterView } from "./components/letterView";
import { SyncPanel } from "./components/syncPanel";
import { VimPane } from "./components/vimPane";
import { AMBER, DIVIDER, FAINT, GOLD, MUTED, PAPER, ACCENT, gradientColors, wrapBodyCached } from "./util";

// The wrapper passes the active journal category; entries live in its repo.

/**
 * The fanaa TUI — a full-screen Ink app with four views:
 *
 *   browse   two-pane letter library (sidebar + preview), with search (`/`),
 *            sort (`s`), and a folder-style timeline sidebar (`t`) whose
 *            months can be collapsed (▸) / expanded (▾)
 *   letter   focused reading pane — scrollable body, `n` jumps between
 *            #highlight# lines, `f` fullscreen
 *   compose  subject prompt that opens the embedded editor (vim in the pane)
 *   help     keybinding popup
 *
 * Editing is in-process: vim runs inside the right pane (see VimPane), so
 * the sidebar, top bar and footer stay visible while you write. The CLI
 * wrapper's exit-66 handoff loop is kept for older frontends, but the TUI
 * itself no longer uses it — saves are written and committed right here.
 */

const CATEGORY = process.env.FANAA_CATEGORY?.trim() || "fanaa";
const STORE = fanaaRoot();
const JOURNAL = journalRoot(STORE, CATEGORY);

type View = "browse" | "letter" | "compose" | "help" | "sync";

/** An embedded vim session: a fresh letter, or a rewrite of an existing one. */
type EditSession = { mode: "compose"; subject: string } | { mode: "edit"; key: string };

const TITLE = "FANAA";
const VERSION = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
).version as string;

/**
 * Build the timeline sidebar's row list from letters, dropping the entries
 * of collapsed months (keyed "YYYY-MM" in `col`). Also returns a map of
 * visible letter key → row index, so the selection can jump to a letter's
 * row — or detect that its month is collapsed (letter absent from the map)
 * and fall back to a neighboring visible one.
 *
 * Module-scope on purpose: the `t` toggle handler calls it while the memo's
 * `tree` is null, and React runs `useMemo` factories eagerly on first render,
 * so a `const buildTree` declared later in the component body would throw a
 * TDZ ReferenceError before initialization.
 */
function buildTree(lst: Letter[], col: Set<string>) {
  const rows: TreeRow[] = [];
  const map = new Map<string, number>();
  let lastYear = "";
  let lastMonth = "";
  for (const l of lst) {
    const y = l.key.slice(0, 4);
    const m = l.key.slice(5, 7);
    const monthKey = `${y}-${m}`;
    const isCollapsed = col.has(monthKey);
    if (y !== lastYear) {
      rows.push({ kind: "year", text: y });
      lastYear = y;
      lastMonth = "";
    }
    if (m !== lastMonth) {
      rows.push({ kind: "month", text: m, collapsed: isCollapsed });
      lastMonth = m;
    }
    if (!isCollapsed) {
      map.set(l.key, rows.length);
      rows.push({ kind: "letter", letter: l });
    }
  }
  return { rows, map };
}

const titleGradCache = new Map<string, string[]>();
function Title() {
  // Show the journal category next to the logo when it's not the default.
  const title = CATEGORY === "fanaa" ? TITLE : `${TITLE} \u00b7 ${CATEGORY}`;
  let colors = titleGradCache.get(title);
  if (!colors) {
    colors = gradientColors(title, AMBER, GOLD);
    titleGradCache.set(title, colors);
  }
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

/**
 * Big boot logo — 5×5 pixel font, all straight lines (horizontal bars +
 * vertical strokes); only the N carries a diagonal staircase. Rendered
 * with a left→right AMBER→GOLD gradient across the whole block.
 */
const SPLASH_LOGO = `███████ ███████ ██   ██ ███████ ███████
██      ██   ██ ███  ██ ██   ██ ██   ██
███████ ███████ ██ █ ██ ███████ ███████
██      ██   ██ ██  ███ ██   ██ ██   ██
██      ██   ██ ██   ██ ██   ██ ██   ██`;

/** Boot splash duration before auto-advancing (any key skips sooner). */
const SPLASH_MS = 2000;

/**
 * Boot splash: the word FANAA centered on screen. Any key (or ~3s)
 * advances into the app; the CLI wrapper skips it when relaunching after
 * the vim handoff (FANAA_NO_SPLASH) so the write loop stays snappy.
 */
function Splash({ rows, onDone }: { rows: number; onDone: () => void }) {
  useInput(() => onDone());
  // Auto-advance after the boot moment (any key skips sooner).
  useEffect(() => {
    const t = setTimeout(onDone, SPLASH_MS);
    return () => clearTimeout(t);
  }, [onDone]);
  // Logo is static — parse + gradient once per mount.
  const { lines, colors } = useMemo(() => {
    const lines = SPLASH_LOGO.split("\n");
    const colors = gradientColors(SPLASH_LOGO.replace(/\n/g, ""), AMBER, GOLD);
    return { lines, colors };
  }, []);
  let ci = 0;
  return (
    <Box
      width="100%"
      height={rows}
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
    >
      <Box flexDirection="column" alignItems="center">
        {lines.map((ln, i) => (
          <Text key={i} bold>
            {[...ln].map((c, j) => {
              const col = colors[ci++];
              return (
                <Text key={j} color={c === " " ? undefined : col}>
                  {c}
                </Text>
              );
            })}
          </Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color={FAINT}>letters only you will ever read</Text>
      </Box>
      <Box marginTop={1}>
        <Text color={DIVIDER}>{VERSION}</Text>
      </Box>
    </Box>
  );
}

/** Centered popup listing every keybinding. */
type HelpSection = { title: string; items: [string, string][] };

function HelpSectionBox({ s }: { s: HelpSection }) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold color={GOLD}>
        {s.title}
      </Text>
      {s.items.map(([k, d]) => (
        <Text key={`${k}-${d}`}>
          <Text color={MUTED}>{k.padEnd(12)}</Text>
          <Text color={PAPER}>{d}</Text>
        </Text>
      ))}
    </Box>
  );
}

function HelpOverlay({ cols, onClose }: { cols: number; onClose: () => void }) {
  // Wide box, two key groups side by side; height follows the content so
  // nothing is ever clipped or stretched.
  const w = Math.min(78, cols - 4);
  const left: HelpSection[] = [
    {
      title: "NAVIGATE",
      items: [
        ["j/k ↑↓", "move"],
        ["g / G", "top / bottom"],
        ["enter", "read / toggle month"],
        ["esc", "back"],
      ],
    },
    {
      title: "LETTERS",
      items: [
        ["a", "write new"],
        ["e", "edit"],
        ["d", "delete"],
        ["r", "refresh"],
        ["/", "search letters"],
        ["s", "sort: date/alpha/len"],
        ["t", "timeline sidebar"],
        ["c", "collapse month"],
      ],
    },
  ];
  const right: HelpSection[] = [
    {
      title: "READING",
      items: [
        ["f", "fullscreen"],
        ["n", "next highlight"],
        ["j/k", "scroll"],
        ["enter", "open vim"],
      ],
    },
    {
      title: "CLOUD",
      items: [
        ["p", "sync (login/logout)"],
        ["h / ?", "help"],
        ["q", "quit"],
      ],
    },
  ];
  return (
    <Box
      width={w}
      flexDirection="column"
      borderStyle="round"
      borderColor={ACCENT}
      paddingX={2}
      paddingTop={1}
    >
      <Text bold color={GOLD}>
        HELP
      </Text>
      <Box flexDirection="row" gap={4}>
        <Box flexDirection="column" flexGrow={1}>
          {left.map((s) => (
            <HelpSectionBox key={s.title} s={s} />
          ))}
        </Box>
        <Box flexDirection="column" flexGrow={1}>
          {right.map((s) => (
            <HelpSectionBox key={s.title} s={s} />
          ))}
        </Box>
      </Box>
      <Box marginTop={1}>
        <Text color={FAINT}>esc / h — close</Text>
      </Box>
    </Box>
  );
}

/**
 * Root component. Owns ALL state (no context/reducers): letters, selection
 * (idx flat / tIdx tree), view, search query, sort mode, timeline mode,
 * collapsed months, letter scroll offset, highlight jump index.
 *
 * Ordering rule: every hook and derived value (layout math, wrapped body,
 * highlights) must run BEFORE the early returns for help/compose/empty —
 * otherwise React throws "Rendered fewer hooks than expected".
 */
export function App() {
  const { stdout } = useStdout();
  const [letters, setLetters] = useState<Letter[]>(() => loadLetters(JOURNAL));
  const [idx, setIdx] = useState(0);
  const [view, setView] = useState<View>("browse");
  // Boot splash — shown on a cold start, skipped on relaunch after the vim
  // handoff (the CLI wrapper sets FANAA_NO_SPLASH for those respawns).
  const [splash, setSplash] = useState(() => process.env.FANAA_NO_SPLASH !== "1");
  const [helpReturn, setHelpReturn] = useState<View>("browse");
  const [letterFull, setLetterFull] = useState(false);
  const [offset, setOffset] = useState(0);
  const [hlIdx, setHlIdx] = useState(-1); // -1 = before first highlight
  const [subject, setSubject] = useState("");
  // Embedded editor session: vim in the right pane (null = not editing).
  const [edit, setEdit] = useState<EditSession | null>(null);
  // Bumped per session so VimPane remounts (fresh PTY) between letters.
  const [editSeq, setEditSeq] = useState(0);
  // Transient status line (saved / deleted / aborted) in the footer.
  const [flash, setFlash] = useState("");
  // Temp file backing the current editor session.
  const editFileRef = useRef("");
  // Guards startEdit against double-firing (TextInput onSubmit + useInput's
  // glued-Enter branch can both see the same Enter keypress).
  const editBusyRef = useRef(false);
  // Search + sort state (browse mode).
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("date");
  const [timeline, setTimeline] = useState(false);

  // Collapsed months (timeline mode): "YYYY-MM" keys.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // Tree-row selection in timeline mode (index into tree.rows).
  const [tIdx, setTIdx] = useState(0);

  // Terminal size in state: Ink's own resize handler re-lays-out the existing
  // vDOM but never re-invokes component functions, so a bare `stdout.rows`
  // read stays stale until some keystroke forces a re-render. Re-render on
  // resize so the layout follows the window immediately.
  const [dims, setDims] = useState({ rows: stdout.rows ?? 24, cols: stdout.columns ?? 80 });
  // The signed-in account's full name (from the shared sync state) — shown in
  // the topbar; the cloud panel refreshes it via onStateChange.
  const [syncName, setSyncName] = useState(() => {
    const st = loadSyncState(STORE);
    return st.token ? st.name : "";
  });
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
  const tree = useMemo(() => (timeline ? buildTree(order, collapsed) : null), [timeline, order, collapsed]);

  // Transient footer status line (saved/deleted/aborted) auto-clears.
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(""), 3000);
    return () => clearTimeout(t);
  }, [flash]);

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
   * Open the embedded editor: prepare a temp file (empty for a new letter,
   * the current body for an edit) and show vim in the right pane. vim's
   * exit is reported back by VimPane → finishEdit.
   */
  const startEdit = (s: EditSession) => {
    if (editBusyRef.current) return; // idempotent: one session per Enter
    editBusyRef.current = true;
    const dir = mkdtempSync(join(tmpdir(), "fanaa-"));
    editFileRef.current = join(dir, "entry.md");
    if (s.mode === "edit") {
      const { body } = parseEntry(readFileSync(entryPath(JOURNAL, s.key), "utf8"));
      writeFileSync(editFileRef.current, body.replace(/\n+$/, ""));
    } else {
      writeFileSync(editFileRef.current, "");
    }
    setEditSeq((n) => n + 1);
    setEdit(s);
    setView("browse");
  };

  /** vim exited: save or abort, then reload the letter list. */
  const finishEdit = (body: string) => {
    const s = edit;
    try {
      if (s?.mode === "compose") {
        const cleaned = body.replace(/\n+$/, "");
        if (cleaned.trim() === "") {
          setFlash("aborted \u2014 empty letter");
        } else {
          const res = writeLetter({ root: JOURNAL, dateKey: dayKey(new Date()), subject: s.subject, body: cleaned });
          setFlash(`saved ${res.key} as ${res.from} \u2192 ${res.to}`);
        }
      } else if (s?.mode === "edit") {
        const res = editLetter(JOURNAL, s.key, body);
        if (res.status === "saved") setFlash(`edited ${s.key}`);
        else if (res.status === "unchanged") setFlash("no changes \u2014 nothing saved");
        else setFlash("aborted \u2014 empty letter");
      }
    } catch (err) {
      setFlash(`save failed: ${err instanceof Error ? err.message : err}`);
    }
    setEdit(null);
    editBusyRef.current = false;
    setLetters(loadLetters(JOURNAL));
    setIdx(0);
  };

  /** Delete a letter inline (was a CLI handoff; the git commit happens here). */
  const doDelete = (key: string) => {
    try {
      const res = removeLetter(JOURNAL, key);
      recordDelete(STORE, CATEGORY, key);
      setFlash(`deleted ${key} (${res.subject})`);
    } catch (err) {
      setFlash(`delete failed: ${err instanceof Error ? err.message : err}`);
    }
    setLetters(loadLetters(JOURNAL));
    setIdx(0);
  };

  useInput((input, key) => {
    if (splash) return; // Splash owns the input until it advances
    if (edit) return; // vim in the right pane owns the keys (VimPane forwards stdin)
    if (view === "sync") return; // SyncPanel owns its keys (and ctrl+c)
    if (view === "compose") {
      if (key.escape) setView("browse");
      else if (key.ctrl && input === "c") process.exit(0);
      else if (/[\r\n]/.test(input)) {
        // Enter can arrive glued to the typed subject (fast typing, pasted
        // input) — ink-text-input only submits on a lone key.return, so we
        // detect the newline ourselves and submit on the pre-newline text.
        const merged = subject + input;
        const i = merged.search(/[\r\n]/);
        startEdit({ mode: "compose", subject: merged.slice(0, i).trim() });
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
      } else if (input === "e" && selected) startEdit({ mode: "edit", key: selected.key });
      else if (input === "d" && selected) doDelete(selected.key);
      else if (input === "p") setView("sync");
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
    if (timeline && tree) {
      // Timeline mode: selection moves over ALL tree rows (years, months,
      // letters). Enter opens a letter or toggles a month's collapse.
      const last = tree.rows.length - 1;
      const row = tree.rows[Math.min(tIdx, last)];
      const rowLetter = row.kind === "letter" ? row.letter : null;
      if (key.downArrow || input === "j") setTIdx((i) => Math.min(last, i + 1));
      else if (key.upArrow || input === "k") setTIdx((i) => Math.max(0, i - 1));
      else if (input === "g") setTIdx(0);
      else if (input === "G") setTIdx(last);
      else if (input.startsWith("/")) {
        setQuery(input.slice(1));
        setSearching(true);
        setIdx(0);
      } else if (input === "s") setSortMode((m) => (m === "date" ? "alpha" : m === "alpha" ? "len" : "date"));
      else if (input === "t") {
        // Leaving timeline: keep the selected tree row's letter (or the
        // nearest letter after it) as the flat-mode selection.
        if (row.kind === "letter") {
          const i = order.findIndex((l) => l.key === row.letter.key);
          if (i >= 0) setIdx(i);
        } else {
          for (let i2 = Math.min(tIdx, last) + 1; i2 < tree.rows.length; i2++) {
            const r = tree.rows[i2];
            if (r.kind === "letter") {
              const i = order.findIndex((l) => l.key === r.letter.key);
              if (i >= 0) setIdx(i);
              break;
            }
          }
        }
        setTimeline(false);
      } else if (key.return || input === "c") {
        if (row.kind === "month") {
          // Year of this month = nearest year row above it.
          let year = "";
          for (let j = Math.min(tIdx, last) - 1; j >= 0; j--) {
            const yr = tree.rows[j];
            if (yr.kind === "year") {
              year = yr.text;
              break;
            }
          }
          const monthKey = `${year}-${row.text}`;
          setCollapsed((prev) => {
            const next = new Set(prev);
            if (next.has(monthKey)) next.delete(monthKey);
            else next.add(monthKey);
            return next;
          });
        } else if (row.kind === "letter") {
          const i = order.findIndex((l) => l.key === row.letter.key);
          if (i >= 0) setIdx(i);
          setOffset(0);
          setHlIdx(-1);
          setView("letter");
        }
        // year rows: Enter does nothing
      } else if (input === "a") {
        setSubject("");
        setView("compose");
      } else if (input === "e" && rowLetter) startEdit({ mode: "edit", key: rowLetter.key });
      else if (input === "d" && rowLetter) doDelete(rowLetter.key);
      else if (input === "p") setView("sync");
      else if (input === "h" || input === "?") {
        setHelpReturn("browse");
        setView("help");
      } else if (input === "r") {
        setLetters(loadLetters(JOURNAL));
        setIdx(0);
      } else if (input === "q" || (key.ctrl && input === "c")) process.exit(0);
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
    else if (input === "t") {
      // Entering timeline: select the tree row of the current letter (or the
      // nearest visible letter after it when its month is collapsed).
      const t = buildTree(order, collapsed);
      const direct = t.map.get(selected?.key ?? "");
      if (direct !== undefined) setTIdx(direct);
      else {
        let found = -1;
        for (let i = fIdx + 1; i < order.length && found < 0; i++) {
          const r = t.map.get(order[i].key);
          if (r !== undefined) found = r;
        }
        for (let i = fIdx - 1; i >= 0 && found < 0; i--) {
          const r = t.map.get(order[i].key);
          if (r !== undefined) found = r;
        }
        setTIdx(found < 0 ? 0 : found);
      }
      setTimeline(true);
    }
    else if (key.return && selected) {
      setOffset(0);
      setHlIdx(-1);
      setView("letter");
    } else if (input === "a") {
      setSubject("");
      setView("compose");
    } else if (input === "e" && selected) startEdit({ mode: "edit", key: selected.key });
    else if (input === "d" && selected) doDelete(selected.key);
    else if (input === "p") setView("sync");
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
  const editing = edit !== null;
  const full = inLetter && letterFull;
  const listW = Math.min(42, Math.floor(cols * 0.38));
  // Editing forces the preview pane on (even on narrow terminals) so vim
  // always has its window; the search bar is suppressed so the pane origin
  // stays at a fixed screen position.
  const showPreview = editing || inLetter || cols >= 62;
  const previewW = showPreview ? (full ? cols - 2 : cols - listW - 2) : 0;
  const listH = Math.max(3, rows - 4 - (searching && !editing ? 1 : 0));

  // Selection: flat mode picks the letter at idx; timeline mode picks the tree
  // row at tIdx (a month/year row has no letter → preview hides).
  const tRow = tree ? Math.min(tIdx, Math.max(0, tree.rows.length - 1)) : 0;
  const effectiveSelected = tree
    ? (tree.rows[tRow].kind === "letter" ? tree.rows[tRow].letter : null)
    : selected;

  // Wrapped body lines of the selected letter (shared cache with LetterView).
  const bodyLines = useMemo(() => {
    if (!effectiveSelected) return [];
    return wrapBodyCached(effectiveSelected.key, effectiveSelected.body.replace(/\n+$/, ""), Math.max(20, previewW - 2));
  }, [effectiveSelected, previewW]);
  // Body line indices that contain a #"…"# / #…# highlight. Must use the same
  // wrap width as LetterView (Math.max(20, previewW - 2)) so `n` lands correctly.
  const hlLines = useMemo(
    () => bodyLines.map((ln, i) => (ln.some((s) => s.underline) ? i : -1)).filter((i) => i >= 0),
    [bodyLines]
  );
  // The letter body fits in (listH - 5) rows (Date/From/To/Subject + rule are
  // overhead); beyond that you may scroll, never further than the last line.
  const maxOffset = Math.max(0, bodyLines.length - (listH - 5));

  // Scroll window over the sidebar rows (letters, or tree rows in timeline
  // mode). Computed unconditionally: every hook must run on every render —
  // including the splash one — or React throws "Rendered more hooks than
  // during the previous render" when the splash advances into the app
  // (the viewport useMemo used to sit after the splash early-return).
  const listLen = tree ? tree.rows.length : filtered.length;
  const selRow = tree ? tRow : fIdx;
  const listTop = Math.min(Math.max(0, selRow - listH + 1), Math.max(0, listLen - listH));
  const selInList = selRow - listTop;
  const hasAbove = listTop > 0;
  const hasBelow = listLen > listTop + listH;
  // Stable viewport slice so the memoized LetterList skips re-rendering on
  // unrelated keystrokes (it only redraws when the window actually moves).
  const viewport = useMemo(() => filtered.slice(listTop, listTop + listH), [filtered, listTop, listH]);

  if (splash) {
    return <Splash rows={rows} onDone={() => setSplash(false)} />;
  }

  if (view === "help") {
    return (
      <Box flexDirection="column" height={rows} alignItems="center" justifyContent="center">
        <HelpOverlay cols={cols} onClose={() => setView(helpReturn)} />
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
            onSubmit={() => startEdit({ mode: "compose", subject: subject.trim() })}
            placeholder="(no subject)"
          />
        </Box>
        <Text color={FAINT}>enter = vim · esc = cancel</Text>
      </Box>
    );
  }

  if (view === "sync") {
    // Cloud panel overlay — centered, like the help menu.
    return (
      <Box flexDirection="column" height={rows} alignItems="center" justifyContent="center">
        <SyncPanel
          cols={cols}
          rows={rows}
          storeRoot={STORE}
          journalRoot={JOURNAL}
          category={CATEGORY}
          onClose={() => setView("browse")}
          onSynced={() => {
            setLetters(loadLetters(JOURNAL));
            setIdx(0);
          }}
          onStateChange={() => {
            const st = loadSyncState(STORE);
            setSyncName(st.token ? st.name : "");
          }}
        />
      </Box>
    );
  }

  if (view === "letter") {
    // letter shares the split layout below; fullscreen is a pane-level toggle
  } else if (letters.length === 0 && !editing) {
    // All children must be Boxes: Ink/Yoga corrupts text measurement when
    // bare <Text> siblings are mixed with <Box> children in a centered
    // column ("no letters yet" vanished / texts merged — see repro3).
    return (
      <Box flexDirection="column" height={rows} alignItems="center" justifyContent="center">
        <Box>
          <Title />
        </Box>
        <Box marginTop={1}>
          <Text color={MUTED}>no letters yet</Text>
        </Box>
        <Box marginTop={1}>
          <Text color={FAINT}>press a to write your first one</Text>
        </Box>
        <Box marginTop={1}>
          <Text color={FAINT}>press p to sync from the cloud</Text>
        </Box>
      </Box>
    );
  }

  // Number of lines the divider column should span.
  const dividerLines = (hasAbove ? 1 : 0) + listH + (hasBelow ? 1 : 0);

  return (
    <Box flexDirection="column" height={rows}>
      {/* header */}
      <Box paddingX={1} alignItems="center">
        <Title />
        <Box flexGrow={1} />
        {syncName && (
          <Text bold color={ACCENT}>
            {syncName}
          </Text>
        )}
      </Box>
      <Text color={DIVIDER}>{"\u2500".repeat(Math.max(4, cols))}</Text>

      {/* search bar (browse only; hidden while editing so vim keeps its pane) */}
      {searching && view === "browse" && !editing && (
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
                    rows={tree.rows}
                    start={listTop}
                    selAbs={tRow}
                    width={listW - 1}
                    height={listH - (hasAbove ? 1 : 0) - (hasBelow ? 1 : 0)}
                  />
                ) : (
                  <LetterList
                    letters={viewport}
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
        {!full && showPreview && (editing || effectiveSelected) && (
          <Box flexDirection="column" width={1}>
            {Array.from({ length: dividerLines }).map((_, i) => (
              <Text key={i} color={DIVIDER}>
                {"\u2502"}
              </Text>
            ))}
          </Box>
        )}
        {showPreview && (editing || effectiveSelected) && (
          // Clip the letter to the pane: an auto-height preview column that
          // overflows its row corrupts Yoga's layout of the whole tree (the
          // header's children get laid out at y=-1 and vanish from the output).
          <Box flexDirection="column" width={previewW} marginLeft={1} height={listH} overflowY="hidden">
            {editing ? (
              // Embedded vim: the sidebar and top bar stay visible while the
              // editor owns the right pane.
              <VimPane
                key={editSeq}
                width={previewW}
                height={listH}
                file={editFileRef.current}
                start={edit.mode === "compose" ? "insert" : "append"}
                onExit={finishEdit}
              />
            ) : effectiveSelected ? (
              <LetterView
                letter={effectiveSelected}
                width={previewW}
                height={listH}
                offset={inLetter ? offset : 0}
                highlightSubject={inLetter}
              />
            ) : null}
          </Box>
        )}
      </Box>

      {/* footer */}
      <Text color={DIVIDER}>{"\u2500".repeat(Math.max(4, cols))}</Text>
      <Box paddingX={1}>
        {editing ? (
          <Text color={FAINT}>
            vim · <Text color={MUTED}>insert mode</Text> · <Text color={MUTED}>ctrl+s</Text> save · <Text color={MUTED}>ctrl+q</Text> close · <Text color={MUTED}>ctrl+c</Text> interrupt
          </Text>
        ) : (
          <>
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
            <Text color={FAINT}> · </Text>
            <Text color={FAINT}>
              <Text color={MUTED}>P</Text>: sync
            </Text>
            {q && !searching && view === "browse" && (
              <>
                <Text color={FAINT}> · </Text>
                <Text color={AMBER}>
                  /{q}/ ({filtered.length})
                </Text>
              </>
            )}
          </>
        )}
        {flash && (
          <>
            <Text color={FAINT}> · </Text>
            <Text color={AMBER}>{flash}</Text>
          </>
        )}
      </Box>
    </Box>
  );
}
