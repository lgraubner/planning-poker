# Planning Poker

Self-hosted planning poker: one Go binary (Chi, coder/websocket, optional SQLite) that embeds a React SPA (Vite, TanStack Router, TanStack Form, Base UI, Tailwind). Read `GLOSSARY.md` for the domain language, and the Technical overview in `README.md` plus `docs/adr/` for architecture.

## Working

- When a step doesn't need my input, keep going. Put status notes in the same message as your next action.
- Stop and ask only when you can't continue without me, or before anything destructive: deleting data, force-pushing, publishing, or changing anything outside this repository.
- Before asking which approach to take, check whether running something can answer it: behavior, timing, output, or performance. If it can, try it and let the result decide. Ask only for product or preference calls no experiment settles.
- Give your real judgment. Push back or say that something does not earn its place when that is true; agreement is not the default.
- Back each claim with its evidence, or label it as measured, inferred, or a guess. Run any check you could run yourself instead of handing it to me.

## Conventions

One home per kind of code, and the file to copy when adding one:

- Room state and its rules: `internal/room/store.go`; SQLite only in `internal/room/sqlite.go`.
- HTTP and WebSocket handlers: `internal/httpserver/server.go`.
- Pages: TanStack Router file routes in `web/src/routes/`, follow `$code.tsx` (data through the route's `loader`).
- The room's WebSocket: only `web/src/hooks/useRoom.ts`.
- UI components: `web/src/components/`, one per file, follow `SelectField.tsx`.
- Wire schemas: zod in `web/src/api.ts` (HTTP) and `web/src/hooks/useRoom.ts` (room snapshot).

## Boundaries

Untrusted data is parsed where it enters:

| Boundary               | Parser                                                                          |
| ---------------------- | ------------------------------------------------------------------------------- |
| Environment            | `cmd/server/main.go`, which exits on an invalid value                           |
| HTTP request bodies    | `json.Decoder` with `DisallowUnknownFields` and `MaxBytesReader` in `server.go` |
| WebSocket commands     | `wsjson.Read` into `command` in `server.go`, then `room.Store.Command`          |
| Labels (names, titles) | `room.ValidateLabel`; an estimate must be in its deck (`room.Decks`)            |
| Server data in the SPA | zod schemas in `web/src/api.ts` and `web/src/hooks/useRoom.ts`                  |
| `localStorage`         | `web/src/identity.ts`                                                           |

Public contracts with callers outside the repo stay compatible: the WebSocket protocol of already open tabs (they reconnect to a new deploy), the JSON API under `/api/rooms`, room links `/{code}`, `/healthz`, the environment variables in `README.md`, existing SQLite files (migrated on open in `sqlite.go`), and the `poker.*` keys in `localStorage`.

## Principles

Read the matching file in `.claude/principles/` before the work:

- Types, status fields, validation, or external data: `types-and-boundaries.md`.
- Debugging, refactoring, or replacing an API: `changes-and-debugging.md`.
- The sweep, persistence, reconnects, or multi-step lifecycles: `idempotent-operations.md`.
- Writing or changing a test: `tests.md`.
- Adding a pattern, a workaround, a module, or a boundary: `agent-friendly-codebase.md`.
- Declaring work done: `proof.md`.

## Documentation

- `GLOSSARY.md` is the glossary. Use its terms in code, UI copy, and conversation. When a discussion settles a new or sharper term, update it in the same change.
- Record a decision in `docs/adr/` only when it is hard to reverse, would surprise a reader without context, and came from a real trade-off.
- Architecture docs describe current behavior. Update them in the same change when that behavior changes.
- `TODO.md` is speculation, never current behavior or authorization to implement.
- Keep credentials, secret values, production identifiers, and private URLs out of documentation.

## Tests

Playwright E2E tests in `web/e2e/` drive the real Go server (`npm --prefix web run e2e`). Unit tests: Go `*_test.go` (`go test -race ./...`) and Vitest `web/src/**/*.test.{ts,tsx}` (`npm --prefix web test`).

- An end-to-end test asserts what reaches the other participant (WebSocket frames), because the UI can hide a server bug.
- Finish E2E work with the HTML report as the artifact: `npx --prefix web playwright test -c web/playwright.config.ts --reporter=html` writes `web/playwright-report/`. CI uploads the same report.
- Hand tests for code you just wrote to the `test-writer` agent, with the spec and the entry points instead of the diff. A test written first, before the code, stays with you.

## Comments

Write a comment only for one of these; `/no-comments` removes the rest:

- A legal or license header.
- An outside rule the code works around: a dependency, platform, vendor, spec, or protocol we cannot reshape. The comment names the rule, even when the workaround is our own code.
- A doc comment on one of the public contracts under Boundaries. Exported symbols in Go `internal/` packages are not public.
- An issue or RFC link that explains a constraint code cannot express.
- `// prettier-ignore`, or a lint suppression whose rule is faulty, pedantic, or style-only.
- A lint or type exception from `/correct`: it names its reason, an expiry date, and the approving human.

Write them in short, full sentences. `.claude/rules/typescript.md` sets their punctuation in TypeScript. Record a deliberate shortcut's limit in the PR description, or enforce it with a type, lint, or test. This overrides the ponytail plugin's `ponytail:` comment markers.

## Commits

Write every commit message as a Conventional Commit: `type(scope)!: subject`, with a lowercase subject. Pull request titles follow the same format. The `commit-msg` hook and CI on pull requests enforce it with commitlint (`web/commitlint.config.mjs`); when commitlint rejects a message, rewrite the message and commit again.

## Done

A change is done when `make check` (lint, format, build, unit and E2E tests) is **green**. Judge by its own exit code (`make check; echo $?`): a pipe through `tail` or `grep` reports the last command's status instead. A change to any file in the `paths` filter of `.github/workflows/docker.yml` also needs `make smoke` green.

To see a change working in the real app, use the `verify-planning-poker` skill: it launches an isolated instance, drives it as several participants, and keeps screenshots and WebSocket frames as evidence.
