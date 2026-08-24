import { requestCode, verifyCode, setName, loadSyncState, saveSyncState, resolveApiUrl, runSync } from "fanaa-sync";
import { journalRoot, fanaaRoot } from "fanaa-core";
import { promptText } from "./prompt";
import { dim } from "./render";

/**
 * Cloud-sync commands (`fanaa login|logout|sync`).
 *
 * Auth is one session per machine: `fanaa login <email>` mints a 6-digit
 * code server-side (emailed, or logged to the server console in dev mode),
 * exchanges it for a 30-day token, and stores it at <store>/state/sync.json
 * (0600, git-guarded). `fanaa sync` then runs the outbox engine for the
 * active journal: push pending deletes + dirty letters, pull server changes.
 * Local letters keep working fully offline — sync is an optional backup.
 */

/** `fanaa login [email]` — email + code → store the session token. */
export async function cmdLogin(argEmail?: string): Promise<void> {
  const store = fanaaRoot();
  const st = loadSyncState(store);
  const apiUrl = resolveApiUrl(st);

  const email = (argEmail ?? (await promptText("Email", st.email || ""))).trim().toLowerCase();
  if (!email) {
    console.log("No email given — nothing to do.");
    return;
  }

  const req = await requestCode(apiUrl, email);
  if (req.channel === "dev") {
    console.log(dim("(dev server — the code is printed on the server console)"));
  } else {
    console.log(`Code sent to ${email}.`);
  }
  const code = (await promptText("6-digit code")).trim();

  const { token, user } = await verifyCode(apiUrl, email, code, req.verification_id);
  st.apiUrl = apiUrl;
  st.email = email;
  st.token = token;

  // First sign-in: ask for the full name (shown in the TUI header). It is
  // optional — edit it later with `fanaa name "…"`.
  if (!user.name) {
    const name = (await promptText("Full name (shown in the TUI header)", "")).trim();
    if (name) {
      try {
        const updated = await setName(apiUrl, token, name);
        st.name = updated.user.name;
        console.log(`\u001b[32m\u2713\u001b[0m hello, ${updated.user.name} — nice to meet you`);
      } catch {
        // Name is optional — the account still works without it.
      }
    }
  } else {
    st.name = user.name;
  }

  saveSyncState(store, st);
  console.log(`\u001b[32m\u2713\u001b[0m signed in as ${email} — try \`fanaa sync\``);
}

/**
 * `fanaa name [Full Name]` — set/edit the account's full name (display
 * only, not a username; shown in the TUI header). No arg → prompt; empty
 * name clears it.
 */
export async function cmdName(argName?: string): Promise<void> {
  const store = fanaaRoot();
  const st = loadSyncState(store);
  if (!st.token) {
    console.log("Not signed in — run \u001b[1mfanaa login\u001b[0m first.");
    return;
  }
  const apiUrl = resolveApiUrl(st);
  const name = (argName ?? (await promptText("Full name", st.name))).trim();
  try {
    const updated = await setName(apiUrl, st.token, name);
    st.name = updated.user.name;
    saveSyncState(store, st);
    console.log(name ? `\u001b[32m\u2713\u001b[0m name set to: ${name}` : "Name cleared.");
  } catch (err) {
    console.log(
      err instanceof Error && /unauthorized/i.test(err.message)
        ? "Session expired — run \u001b[1mfanaa login\u001b[0m again."
        : err instanceof Error
          ? err.message
          : String(err),
    );
  }
}

/** `fanaa logout` — drop the token; local letters are untouched. */
export function cmdLogout(): void {
  const store = fanaaRoot();
  const st = loadSyncState(store);
  if (!st.token) {
    console.log("Not signed in.");
    return;
  }
  st.token = "";
  saveSyncState(store, st);
  console.log("Signed out. Local letters are untouched.");
}

/** `fanaa sync` — one outbox round for the active journal. */
export async function cmdSync(category: string): Promise<void> {
  const store = fanaaRoot();
  const st = loadSyncState(store);
  if (!st.token) {
    console.log("Not signed in — run \u001b[1mfanaa login\u001b[0m first.");
    return;
  }
  const root = journalRoot(store, category);
  const s = await runSync(store, root, st, category);
  const bits = [
    s.pushed > 0 ? `${s.pushed} pushed (${s.accepted} accepted)` : "nothing to push",
    s.pulled > 0 ? `${s.pulled} pulled` : "no changes",
  ];
  if (s.tombstoned > 0) bits.push(`${s.tombstoned} removed`);
  const cursor = s.cursor ? dim(`cursor ${s.cursor}`) : dim("full pull");
  console.log(`\u001b[32m\u2713\u001b[0m sync: ${bits.join(" · ")} · ${cursor}`);
}
