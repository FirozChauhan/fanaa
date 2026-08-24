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
fanaa                    # asks for a subject, opens $EDITOR blank — just write
                         # (built-in composer if no $EDITOR is set — no vim needed)
fanaa add "milk, eggs"   # quick capture: appends to today's letter
fanaa add                # compose a letter without any editor
printf 'subject\nbody' | fanaa    # fully piped letter
fanaa -v                 # set from / to / subject (from & to become defaults)
fanaa yesterday          # read a letter as email (today, YYYY-MM-DD, MM-DD)
fanaa ls                 # list recent letters
fanaa whoami             # show who you write as, and to
fanaa --from kitten --to heart   # costume change for one letter
fanaa --date 2026-08-23  # backdate (forgot to write last night)
```

No `$EDITOR`? `fanaa` falls back to a built-in composer: type lines, finish
with Ctrl+D or `.end` on its own line. Quick captures via `fanaa add` never
touch an editor at all.

## Layout

```
~/.fanaa/
├── entries/2026/08/2026-08-24.md   # markdown, frontmatter, git-committed
└── config.toml                     # identity defaults
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
