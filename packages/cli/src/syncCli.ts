import { requestCode, verifyCode, loadSyncState, saveSyncState, resolveApiUrl, runSync } from "fanaa-sync";
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

  const { token } = await verifyCode(apiUrl, email, code, req.verification_id);
  st.apiUrl = apiUrl;
  st.email = email;
  st.token = token;
  saveSyncState(store, st);
  console.log(`\u001b[32m\u2713\u001b[0m signed in as ${email} — try \`fanaa sync\``);
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
