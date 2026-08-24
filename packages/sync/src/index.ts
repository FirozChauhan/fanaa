/**
 * fanaa-sync — cloud sync for the fanaa journal.
 *
 *   client.ts  HTTP wrappers over the fanaa-api REST surface
 *   state.ts   persisted session (token/cursor/outbox) at <store>/state/sync.json
 *   engine.ts  the local-first outbox engine (push dirty → pull since cursor)
 *
 * Local files stay the source of truth; the cloud is a backup that converges
 * via last-write-wins on timestamps. See engine.ts for the full semantics.
 */
export * from "./client";
export * from "./state";
export * from "./engine";
