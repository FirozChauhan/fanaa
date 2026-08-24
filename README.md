# Fanaa

> Write letters only you will ever read.
> From whoever you want to be. To whoever you love.

A terminal-first daily journal. Every entry is a letter — stamped with a date
automatically (like git), addressed *from* a persona *to* a recipient, and
stored as plain markdown on your disk. Local-first: the cloud is only ever a
backup, never a requirement.

## Install

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
fanaa -v                 # set from / to / subject (from & to become defaults)
fanaa yesterday          # read letters as email (today, YYYY-MM-DD, MM-DD)
fanaa ls                 # list recent letters
fanaa whoami             # show who you write as, and to
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

## Layout

```
~/.fanaa/
├── entries/2026/08/2026-08-24-0912.md   # one letter = one file, git-committed
└── config.toml                          # identity defaults
```

## Roadmap

- [x] Write flow: blank editor, auto date/subject, git commit per letter
- [x] Read flow: email-style render, list, whoami
- [x] Identity system: `-v`, `--from`, `--to`, defaults
- [ ] Threads: `fanaa to heart` (all letters to a recipient)
- [ ] Weekly digest: `fanaa digest -w`
- [ ] Cloud sync: Neon + Hono + Better Auth, `fanaa login` (pure CLI)
- [ ] Local-first outbox sync: offline writes, retry with backoff
- [ ] E2E encryption derived from your password (zero-knowledge)
