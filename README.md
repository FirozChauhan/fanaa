# Fanaa

> Write letters only you will ever read.
> From whoever you want to be. To whoever you love.

A terminal-first daily journal. Every entry is a letter — stamped with a date
automatically (like git), addressed *from* a persona *to* a recipient, and
stored as plain markdown on your disk. Local-first: the cloud is only ever a
backup, never a requirement.

## Install

**Prebuilt binary (recommended)** — no Bun needed:

```bash
curl -fsSL https://raw.githubusercontent.com/FirozChauhan/fanaa/main/install.sh | sh
```

Installs the latest release to `~/.local/bin/fanaa` (override with
`FANAA_BIN`), verifies the SHA-256 checksum, and creates `~/.fanaa`.
Pin a version with `| sh -s -- v0.8.1`. Linux (x64/arm64), macOS
(x64/arm64), and Windows x64 (via MSYS/Cygwin) are prebuilt on every
`v*` tag — see [the release workflow](.github/workflows/release.yml).

**From source:**

```bash
cd packages/cli
bun install
bun link          # makes `fanaa` available everywhere
```

## Usage

```bash
fanaa                    # asks for a subject, opens vim on the body
fanaa tui                # full-window TUI: `a` compose, `e` edit, `d` delete
                         # (vim opens on the body; letters addressed to ME)
fanaa add "milk, eggs"   # quick capture: a fresh letter from the argument
fanaa add                # compose on the command line (ctrl-d or .end to finish)
printf 'subject\nbody' | fanaa    # fully piped letter
fanaa -v                 # set from / to / category / subject (become defaults)
fanaa --cat work         # write to the "work" journal (default category: fanaa)
fanaa yesterday          # read letters as email (today, YYYY-MM-DD, MM-DD)
fanaa ls                 # list recent letters
fanaa whoami             # show who you write as, and to
fanaa login [email]      # sign in for cloud sync (email code)
fanaa logout             # forget the session token
fanaa sync               # push local letters, pull cloud changes
fanaa --from kitten --to heart   # costume change for one letter
fanaa --date 2026-08-23  # backdate (forgot to write last night)
```

Fanaa uses vim as its letter editor (git-commit style): the TUI prompts for
a subject, then opens vim on an empty temp file; write your letter, save and
quit (`:wq`), and the entry is written. Cancel with `:cq` or save an empty
file to abort. Set `FANAA_EDITOR=nano` (or any editor) to override. The raw
`fanaa` command does the same — subject prompt, then vim.

Every capture writes a fresh letter file — nothing is ever merged or
appended; editing a letter rewrites its body in place and commits an
`edit: <subject>` revision, and deleting one commits a `delete: <subject>`
revision (recoverable with git).

Letters are addressed to **ME** by default (`fanaa -v` to change your
identity; `--to` overrides one letter at a time).

## Categories

Letters belong to a **journal category** — one git repo per category.
The default category is `fanaa` (letters live in `~/.fanaa/`); pick
another with `fanaa -v` (the category prompt) or for one write with
`fanaa --cat work`. Category journals live in `~/.fanaa/cats/<name>/`,
each with its own history:

```
~/.fanaa/
├── config.toml                      # identity + active category
├── entries/2026/08/…                # default "fanaa" journal
└── cats/work/entries/2026/08/…      # the "work" journal (own git repo)
```

## Layout

```
~/.fanaa/
├── entries/2026/08/2026-08-24-0912-K7X2.md   # one letter = one file, unique ID
└── config.toml                          # identity defaults
```

Every letter gets a unique key `YYYY-MM-DD-HHMM-XXXX` (`XXXX` is a
4-character hash) and the frontmatter carries the concatenated ID
(`id: 0912K7X2`). Old letters with longer hashes (or no hash at all) are
read without issue.

## Cloud sync

Local letters are the source of truth; the cloud is an optional backup
(powered by the `fanaa-api` package — a Hono worker on Neon/Postgres, with
email-code auth handled by Clerk so codes land in your inbox with no SMTP
of your own). Nothing is uploaded until you sign in:

```bash
fanaa login you@example.com   # a 6-digit code is emailed to you
fanaa name "Ada Lovelace"     # your full name, shown in the TUI header (optional)
fanaa sync                    # push local letters, pull cloud changes
fanaa logout                  # forget the session token
```

On the **first** sign-in the CLI (and the TUI) ask for your full name — it
is display-only (not a username), optional, and editable any time with
`fanaa name "…"` or the `n` key in the TUI's cloud panel. Once set it
appears in the TUI topbar next to your letter stats.

Sync is a **local-first outbox**: writes, edits and deletes made offline
are queued locally and pushed on the next sync; changes from other
devices are pulled since the last cursor. Conflicts resolve
last-write-wins on timestamps, and deletes replicate as tombstones (a
letter deleted on one device disappears everywhere). The session token and
sync state live in `~/.fanaa/state/` (0600, git-guarded). Set
`FANAA_API_URL` to point the CLI at a specific server (default
`https://fanaa-api.jigar1155.workers.dev`).

**In the TUI**, the same flow lives in one key: press `p` from anywhere
to open the cloud panel — sign in (email → code from your inbox), sync
now, or sign out — without ever leaving the app. The CLI and the TUI
share the same session, so `fanaa login` once and either one stays signed
in. Deletes made in the TUI are queued as tombstones automatically.
## Roadmap

- [x] Write flow: blank editor, auto date/subject, git commit per letter
- [x] Read flow: email-style render, list, whoami
- [x] Identity system: `-v`, `--from`, `--to`, defaults
- [x] Cloud sync: email-code auth, `fanaa login` — in the CLI **and** the TUI (`p` key)
- [x] Local-first outbox sync: offline writes, retry on next sync
- [ ] Threads: `fanaa to heart` (all letters to a recipient)
- [ ] Weekly digest: `fanaa digest -w`
- [ ] E2E encryption derived from your password (zero-knowledge)
