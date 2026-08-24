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
fanaa                    # asks for a subject, opens the built-in full-screen
                         # editor — no vim, no $EDITOR needed
fanaa tui                # full-window TUI; `a` composes a letter in the
                         # built-in in-app editor (same input pipeline)
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

Fanaa ships its own full-screen editor (insert mode, undo, paste):
`ctrl-s` saves, `ctrl-c` cancels, `ctrl-z` undoes. Set `FANAA_EDITOR=vim` if
you insist on an external editor. Every capture writes a fresh letter file —
nothing is ever merged or appended.

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
