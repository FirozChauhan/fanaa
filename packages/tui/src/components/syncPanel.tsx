import React, { useCallback, useState } from "react";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import {
  FanaaApiError,
  loadSyncState,
  logout,
  requestCode,
  resolveApiUrl,
  runSync,
  saveSyncState,
  setName,
  verifyCode,
} from "fanaa-sync";
import { usePalette } from "../theme";

/**
 * The cloud-sync panel — sign in / sign out / sync now, all inside the TUI.
 *
 * Backed by the fanaa-sync engine, the same session file (~/.fanaa/state/
 * sync.json) the CLI uses, so `fanaa login`/`fanaa sync` and the TUI agree
 * on one account and one sync cursor.
 *
 * Interaction is deliberately minimal: one key per action, plain text-input
 * for the email and the 6-digit code, and a single status line for what just
 * happened. `esc` always takes you back to the journal.
 */

type Phase = "idle" | "busy" | "email" | "code" | "name" | "api";
type NameCtx = "signup" | "edit";

// NOTE: keep panel titles free of ambiguous-width glyphs (⚡ etc.) — they
// render 2 cells in modern terminals while Ink counts 1, breaking the box
// border's right edge by a column or two.

/**
 * Bordered, centered shell — the sync menu shares the help menu's look
 * (round accent border) so it reads as an overlay, not a page.
 */
function PanelBox({ cols, rows, children }: { cols: number; rows: number; children: React.ReactNode }) {
  const pal = usePalette();
  const w = Math.min(56, cols - 4);
  const h = Math.min(16, rows - 4);
  return (
    <Box
      width={w}
      height={h}
      flexDirection="column"
      borderStyle="round"
      borderColor={pal.accent}
      paddingX={2}
      paddingTop={1}
    >
      {children}
    </Box>
  );
}

export function SyncPanel({
  storeRoot,
  journalRoot,
  category,
  cols,
  rows,
  onClose,
  onSynced,
  onStateChange,
}: {
  storeRoot: string;
  journalRoot: string;
  category: string;
  cols: number;
  rows: number;
  onClose: () => void;
  /** Fired after a sync round finishes writing letters (lets the app reload). */
  onSynced: () => void;
  /** Fired after any session-state change (login/logout/name) — header updates. */
  onStateChange?: () => void;
}) {
  const pal = usePalette();
  const [state, setState] = useState(() => loadSyncState(storeRoot));
  const [phase, setPhase] = useState<Phase>("idle");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [verificationId, setVerificationId] = useState<string | undefined>(undefined);
  const [nameInput, setNameInput] = useState("");
  const [nameCtx, setNameCtx] = useState<NameCtx>("signup");
  const [apiUrlInput, setApiUrlInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = resolveApiUrl(state);
  const signedIn = state.token !== "";
  const j = state.journals[category];

  /** Format an error, hinting at the API url when the server was unreachable. */
  const fmtErr = (e: unknown): string => {
    const msg = e instanceof Error ? e.message : String(e);
    if (/fetch failed|ECONNREFUSED|ENOTFOUND|Undici|network|unable to connect/i.test(msg)) {
      return `${msg} \u2014 can't reach ${apiUrl} (u to change, or set FANAA_API_URL)`;
    }
    return msg;
  };
  const refresh = useCallback(
    (next: typeof state) => {
      saveSyncState(storeRoot, next);
      setState(next);
      onStateChange?.();
    },
    [storeRoot, onStateChange],
  );

  /** Fire a full sync round; updates the panel's status + reloads letters. */
  const doSync = useCallback(async () => {
    setPhase("busy");
    setError(null);
    setMessage("syncing\u2026");
    try {
      const s = loadSyncState(storeRoot);
      const summary = await runSync(storeRoot, journalRoot, s, category);
      refresh(s);
      onSynced();
      const parts = [
        summary.pushed > 0 ? `${summary.pushed} pushed (${summary.accepted} accepted)` : null,
        summary.pulled > 0 ? `${summary.pulled} pulled` : null,
        summary.tombstoned > 0 ? `${summary.tombstoned} removed` : null,
      ].filter(Boolean);
      setMessage(
        summary.pushed === 0 && summary.pulled === 0 && summary.tombstoned === 0
          ? "up to date \u2014 nothing to push, nothing new"
          : `\u2713 sync done: ${parts.join(" \u00b7 ")}`,
      );
    } catch (e) {
      setError(fmtErr(e));
      setMessage(null);
    }
    setPhase("idle");
  }, [storeRoot, journalRoot, category, refresh, onSynced]);

  /** Sign-in: request a code for the given email (Clerk emails it). */
  const startLogin = useCallback(async (addr: string) => {
    setPhase("busy");
    setError(null);
    setMessage("requesting code\u2026");
    try {
      const req = await requestCode(apiUrl, addr);
      setVerificationId(req.verification_id);
      setMessage(
        req.channel === "dev"
          ? "(dev server \u2014 the code is printed on the server console)"
          : `code sent to ${addr} \u2014 check your inbox`,
      );
      setPhase("code");
    } catch (e) {
      setError(fmtErr(e));
      setMessage(null);
      setPhase("idle");
    }
  }, [apiUrl]);

  /** Verify the code, persist the session, then ask for the name (first sign-in) or sync. */
  const finishLogin = useCallback(async (addr: string, verificationId: string | undefined, c: string) => {
    setPhase("busy");
    setError(null);
    setMessage("verifying\u2026");
    try {
      const { token, user } = await verifyCode(apiUrl, addr, c, verificationId);
      const next = loadSyncState(storeRoot);
      next.apiUrl = apiUrl;
      next.email = addr;
      next.token = token;
      next.name = user.name ?? "";
      refresh(next);
      setMessage(`\u2713 signed in as ${addr}`);
      if (!next.name) {
        // Brand-new account — capture the full name before the first sync.
        setNameInput("");
        setNameCtx("signup");
        setPhase("name");
      } else {
        setPhase("idle");
        await doSync();
      }
    } catch (e) {
      setError(fmtErr(e));
      setMessage(null);
      setPhase("idle");
    }
  }, [apiUrl, storeRoot, refresh, doSync]);

  /** Save the full name (sign-up or edit); then finish the sign-up sync. */
  const saveName = useCallback(async () => {
    const trimmed = nameInput.trim().slice(0, 80);
    setPhase("busy");
    setError(null);
    setMessage("saving name\u2026");
    try {
      const st = loadSyncState(storeRoot);
      const updated = await setName(apiUrl, st.token, trimmed);
      st.name = updated.user.name;
      refresh(st);
      setMessage(trimmed ? `\u2713 hello, ${trimmed}` : "name cleared");
      setPhase("idle");
      if (nameCtx === "signup") await doSync();
    } catch (e) {
      setError(fmtErr(e));
      setMessage(null);
      setPhase("idle");
    }
  }, [nameInput, nameCtx, apiUrl, storeRoot, refresh, doSync]);

  /** Save the API base URL (normalizes a trailing slash). */
  const saveApiUrl = useCallback(() => {
    const url = apiUrlInput.trim().replace(/\/+$/, "");
    if (!/^https?:\/\/\S+$/.test(url)) {
      setError("invalid url \u2014 need http(s)://host[:port]");
      return;
    }
    const s = loadSyncState(storeRoot);
    s.apiUrl = url;
    refresh(s);
    setError(null);
    setMessage(`api url set to ${url}`);
    setPhase("idle");
  }, [apiUrlInput, storeRoot, refresh]);

  /** Sign out: revoke server-side (best-effort), drop the local token+name. */
  const doLogout = useCallback(() => {
    const next = loadSyncState(storeRoot);
    const token = next.token;
    next.token = "";
    next.email = "";
    next.name = "";
    refresh(next);
    setMessage("signed out \u2014 local letters are untouched");
    setPhase("idle");
    if (token) void logout(apiUrl, token).catch(() => {});
  }, [storeRoot, refresh, apiUrl]);

  useInput((input, key) => {
    if (key.ctrl && input === "c") process.exit(0);
    if (phase === "email" || phase === "code") {
      // TextInput owns typing; esc cancels back to the status view.
      if (key.escape) {
        setPhase("idle");
        setError(null);
      }
      return;
    }
    if (phase === "name") {
      // esc skips (sign-up: name is optional) or cancels (edit keeps old).
      if (key.escape) {
        setPhase("idle");
        if (nameCtx === "signup") void doSync();
      }
      return;
    }
    if (phase === "api") {
      // TextInput owns typing; esc cancels back to the status view.
      if (key.escape) {
        setPhase("idle");
        setError(null);
      }
      return;
    }
    if (phase === "busy") return; // a sync/login is in flight
    if (key.escape || input === "q") {
      onClose();
    } else if (input === "u") {
      setApiUrlInput("");
      setError(null);
      setMessage("api base url \u2014 where the sync server lives");
      setPhase("api");
    } else if (!signedIn && (input === "l" || key.return)) {
      setEmail("");
      setCode("");
      setVerificationId(undefined);
      setError(null);
      setMessage("sign in \u2014 email address for the code");
      setPhase("email");
    } else if (signedIn && (input === "p" || key.return)) {
      void doSync();
    } else if (signedIn && input === "o") {
      doLogout();
    } else if (signedIn && input === "n") {
      setNameInput(state.name);
      setNameCtx("edit");
      setError(null);
      setMessage("edit your full name");
      setPhase("name");
    }
  });

  // ----- text-input phases (login) -----
  if (phase === "email") {
    return (
      <PanelBox cols={cols} rows={rows}>
        <Text bold color={pal.gold}>
          SIGN IN
        </Text>
        <Box marginTop={1}>
          <Text bold color={pal.accent}>
            {"\u276f"} {" "}
          </Text>
          <TextInput
            value={email}
            onChange={setEmail}
            onSubmit={(v) => {
              const addr = v.trim().toLowerCase();
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr)) {
                setError("invalid email");
                return;
              }
              void startLogin(addr);
            }}
            placeholder="you@example.com"
          />
        </Box>
        <Text color={pal.faint}>enter = request 6-digit code · esc = cancel</Text>
        {error && (
          <Text color="#e07a5f">
            {"\u2717"} {error}
          </Text>
        )}
      </PanelBox>
    );
  }

  if (phase === "code") {
    return (
      <PanelBox cols={cols} rows={rows}>
        <Text bold color={pal.gold}>
          SIGN IN
        </Text>
        <Text color={pal.muted}>{message}</Text>
        <Box marginTop={1}>
          <Text bold color={pal.accent}>
            {"\u276f"} {" "}
          </Text>
          <TextInput
            value={code}
            onChange={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
            onSubmit={(v) => {
              if (!/^\d{6}$/.test(v)) {
                setError("code is 6 digits");
                return;
              }
              void finishLogin(email, verificationId, v);
            }}
            placeholder="000000"
          />
        </Box>
        <Text color={pal.faint}>enter = verify · esc = cancel</Text>
        {error && (
          <Text color="#e07a5f">
            {"\u2717"} {error}
          </Text>
        )}
      </PanelBox>
    );
  }

  if (phase === "name") {
    return (
      <PanelBox cols={cols} rows={rows}>
        <Text bold color={pal.gold}>
          YOUR NAME
        </Text>
        <Text color={pal.muted}>
          {nameCtx === "signup" ? "what should the TUI header call you?" : "edit your full name"}
        </Text>
        <Box marginTop={1}>
          <Text bold color={pal.accent}>
            {"\u276f"} {" "}
          </Text>
          <TextInput
            value={nameInput}
            onChange={setNameInput}
            onSubmit={() => void saveName()}
            placeholder={nameCtx === "signup" ? "(skip — no name)" : "(clear)"}
          />
        </Box>
        <Text color={pal.faint}>
          {nameCtx === "signup" ? "enter = save (optional) · esc = skip" : "enter = save · esc = cancel"}
        </Text>
        {error && (
          <Text color="#e07a5f">
            {"\u2717"} {error}
          </Text>
        )}
      </PanelBox>
    );
  }

  if (phase === "api") {
    return (
      <PanelBox cols={cols} rows={rows}>
        <Text bold color={pal.gold}>
          API URL
        </Text>
        <Text color={pal.muted}>where the sync server lives (FANAA_API_URL overrides it)</Text>
        <Text color={pal.faint}>current: {apiUrl}</Text>
        <Box marginTop={1}>
          <Text bold color={pal.accent}>
            {"\u276f"} {" "}
          </Text>
          <TextInput
            value={apiUrlInput}
            onChange={setApiUrlInput}
            onSubmit={() => void saveApiUrl()}
            placeholder="https://api.example.com"
          />
        </Box>
        <Text color={pal.faint}>enter = save · esc = cancel</Text>
        {error && (
          <Text color="#e07a5f">
            {"\u2717"} {error}
          </Text>
        )}
      </PanelBox>
    );
  }

  // ----- status + actions -----
  return (
    <PanelBox cols={cols} rows={rows}>
      <Text bold color={pal.gold}>
        CLOUD SYNC
      </Text>
      <Box flexDirection="column" marginTop={1}>
        <Text>
          <Text color={pal.muted}>status </Text>
          <Text color={signedIn ? pal.accent : pal.paper}>
            {signedIn
              ? state.name
                ? `signed in as ${state.name} (${state.email})`
                : `signed in as ${state.email}`
              : "not signed in"}
          </Text>
        </Text>
        <Text>
          <Text color={pal.muted}>api    </Text>
          <Text color={pal.paper}>{apiUrl}</Text>
        </Text>
        <Text>
          <Text color={pal.muted}>journal</Text>
          <Text color={pal.paper}> {category}</Text>
          {j?.cursor ? <Text color={pal.faint}> · synced (cursor {j.cursor.slice(0, 10)}…)</Text> : null}
        </Text>
      </Box>
      {(message || error) && (
        <Box marginTop={1}>
          <Text color={error ? "#e07a5f" : pal.accent}>{error ? `\u2717 ${error}` : message}</Text>
        </Box>
      )}
      <Box flexDirection="column" marginTop={1}>
        <Text>
          <Text bold color={pal.accent}>u</Text>
          <Text color={pal.muted}>  change api url</Text>
        </Text>
        {signedIn ? (
          <>
            <Text>
              <Text bold color={pal.accent}>p</Text>
              <Text color={pal.muted}>  sync now</Text>
            </Text>
            <Text>
              <Text bold color={pal.accent}>n</Text>
              <Text color={pal.muted}>  edit name</Text>
            </Text>
            <Text>
              <Text bold color={pal.accent}>o</Text>
              <Text color={pal.muted}>  sign out</Text>
            </Text>
          </>
        ) : (
          <Text>
            <Text bold color={pal.accent}>l</Text>
            <Text color={pal.muted}>  sign in</Text>
          </Text>
        )}
        <Box marginTop={1}>
          <Text color={pal.faint}>esc / q — back to the journal</Text>
        </Box>
      </Box>
    </PanelBox>
  );
}
