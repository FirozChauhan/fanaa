# Fanaa

![Bun](https://img.shields.io/badge/Bun-black?style=for-the-badge&logo=bun&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React%20%2F%20Ink-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Hono](https://img.shields.io/badge/Hono-E36002?style=for-the-badge&logo=hono&logoColor=white)
![Postgres](https://img.shields.io/badge/Neon%20Postgres-316192?style=for-the-badge&logo=postgresql&logoColor=white)
![Cloudflare](https://img.shields.io/badge/Cloudflare%20Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)
![Clerk](https://img.shields.io/badge/Clerk-6C47FF?style=for-the-badge&logo=clerk&logoColor=white)
![GitHub Actions](https://img.shields.io/badge/GitHub%20Actions-2088FF?style=for-the-badge&logo=githubactions&logoColor=white)

> Write letters only you will ever read.
> From whoever you want to be. To whoever you love.

A terminal-first daily journal. Every entry is a **letter** — stamped with a
date automatically (like git), addressed *from* a persona *to* a recipient,
and stored as plain markdown on your disk. Local-first: the cloud is only
ever a backup, never a requirement.

## Stack

| Concern | Choice |
|---|---|
| Runtime | [Bun](https://bun.sh) (single static binary, cross-compiled) |
| Language | [TypeScript](https://www.typescriptlang.org) |
| CLI + TUI | [Ink](https://github.com/vadimdemedes/ink) (React for terminals) |
| API framework | [Hono](https://hono.dev) |
| Hosting | [Cloudflare Workers](https://workers.cloudflare.com) |
| Database | [Neon Postgres](https://neon.tech) (pooled connection) |
| Auth | [Clerk](https://clerk.com) (email-code OTP) |
| Storage | Local markdown files + git history |
| CI/CD | [GitHub Actions](https://github.com/features/actions) (multi-arch release, smoke tests) |

## Getting started

The simplest path needs **no Bun** — just a prebuilt binary:

```bash
curl -fsSL https://raw.githubusercontent.com/FirozChauhan/fanaa/main/install.sh | sh
```

This installs the latest release to `~/.local/bin/fanaa` (override with
`FANAA_BIN`), verifies the SHA-256 checksum, and creates `~/.fanaa`. Pin a
version with `| sh -s -- v0.8.1`. Linux (x64/arm64) and macOS (x64/arm64)
are prebuilt on every `v*` tag.

**From source** (GitHub):

```bash
git clone https://github.com/FirozChauhan/fanaa
cd fanaa
bun install
bun run build    # → a single static `fanaa` binary (CLI + TUI)
```

The repo is a Bun workspace: `packages/` holds the CLI, TUI, sync engine,
and the Hono API worker.

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
fanaa name "Ada Lovelace"  # your full name, shown in the TUI header
fanaa logout             # forget the session token
fanaa sync               # push local letters, pull cloud changes
fanaa --from kitten --to heart   # costume change for one letter
fanaa --date 2026-08-23  # backdate (forgot to write last night)
```

Fanaa uses **vim** as its letter editor (git-commit style): the TUI prompts
for a subject, then opens vim on an empty temp file; write your letter, save
and quit (`:wq`), and the entry is written. Cancel with `:cq` or save an
empty file to abort. Set `FANAA_EDITOR=nano` (or any editor) to override.

Every capture writes a fresh letter file — nothing is ever merged or
appended; editing a letter rewrites its body in place and commits an
`edit: <subject>` revision, and deleting one commits a `delete: <subject>`
revision (recoverable with git).

Letters are addressed to **ME** by default (`fanaa -v` to change your
identity; `--to` overrides one letter at a time).

## Project structure

```
packages/
├── cli/          # the `fanaa` binary: prompts, editor, dispatch, login/sync
├── tui/          # Ink full-window TUI (runTui.tsx shared boot)
├── core/         # entries, store, config, date, paths, git
├── sync/         # local-first outbox sync engine + client
└── api/          # Hono worker: letters, auth (Clerk), Neon + drizzle
```

Letters on disk — one file per letter, unique ID, git history per journal:

```
~/.fanaa/
├── config.toml                      # identity + active category
├── entries/2026/08/2026-08-24-0912-K7X2.md   # one letter = one file
└── cats/work/entries/2026/08/…      # the "work" journal (own git repo)
```

Every letter gets a unique key `YYYY-MM-DD-HHMM-XXXX` (`XXXX` is a 4-char
hash) and the frontmatter carries the concatenated ID (`id: 0912K7X2`).

## Cloud sync

Local letters are the **source of truth**; the cloud is an optional backup
(powered by the `fanaa-api` package — a Hono worker on Neon/Postgres, with
email-code auth handled by Clerk so codes land in your inbox with no SMTP
of your own). Nothing is uploaded until you sign in:

```bash
fanaa login you@example.com   # a 6-digit code is emailed to you
fanaa name "Ada Lovelace"     # your full name, shown in the TUI header (optional)
fanaa sync                    # push local letters, pull cloud changes
fanaa logout                  # forget the session token
```

Sync is a **local-first outbox**: writes, edits and deletes made offline are
queued locally and pushed on the next sync; changes from other devices are
pulled since the last cursor. Conflicts resolve last-write-wins on
timestamps, and deletes replicate as tombstones. The session token and sync
state live in `~/.fanaa/state/` (0600, git-guarded). Set `FANAA_API_URL` to
point the CLI at a specific server (default
`https://fanaa-api.jigar1155.workers.dev`).

**In the TUI**, the same flow lives in one key: press `p` from anywhere to
open the cloud panel — sign in (email → code from your inbox), sync now, or
sign out — without ever leaving the app. The CLI and the TUI share the same
session, so `fanaa login` once and either one stays signed in.

## Notes

- The `fanaa` binary hosts **both** the CLI and the TUI — `FANAA_TUI=1`
  re-execs the same binary into the Ink TUI, no separate install.
- Binary is a pure JS/TS app (no native modules), so Bun cross-compiles all
  four targets from a single Linux runner.
- `words.txt` (completion dictionary) is embedded into the binary and
  materialized to `/tmp/fanaa-words.txt` at runtime for vim compatibility.

## Roadmap

- [x] Write flow: blank editor, auto date/subject, git commit per letter
- [x] Read flow: email-style render, list, whoami
- [x] Identity system: `-v`, `--from`, `--to`, defaults
- [x] Cloud sync: email-code auth, `fanaa login` — in the CLI **and** the TUI (`p` key)
- [x] Local-first outbox sync: offline writes, retry on next sync
- [ ] Threads: `fanaa to heart` (all letters to a recipient)
- [ ] Weekly digest: `fanaa digest -w`
- [ ] E2E encryption derived from your password (zero-knowledge)

## Author

**Firoz Khan Chauhan**
