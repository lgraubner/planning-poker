---
name: verify-planning-poker
description: 'Drive the real Planning Poker app (Go server + embedded React SPA, multi-participant rooms over WebSocket) in a browser and capture proof that a feature works. Use when you need to confirm a change in the running app, not just in tests: launch an isolated instance, drive a feature as several participants, and keep screenshots, WebSocket frames, and a Playwright trace as evidence.'
---

# Verify Planning Poker

Planning Poker is one Go binary that serves a React SPA and one WebSocket per tab (`/api/rooms/{code}/ws`). The user surface is the browser: the home page creates a room, the room page (`/{8-char code}`) is where people join, estimate, reveal, and vote again. There is no CLI and no auth; the room link is the only key. The JSON API (`POST /api/rooms`, `GET /api/rooms/{code}`, `/healthz`) is secondary and only worth driving directly for server checks.

Everything goes through one helper, run from the repo root:

```sh
S=.claude/skills/verify-planning-poker/verify.sh
RUN=<name> $S launch | doctor | drive <journey.spec.ts> [playwright args] | cleanup
```

`RUN` names the instance (default `default`). Each run owns `$TMPDIR/planning-poker-verify/$RUN/` with `state/` (binary, pid, port, logs, SQLite db) and `evidence/`. Use a fresh `RUN` per task so you never drive someone else's instance. The developer often has a server on `:8080` (`make dev-server`) and Playwright's suite uses `:8182`; the helper picks a free port and touches neither.

## Launch

```sh
RUN=mytask .claude/skills/verify-planning-poker/verify.sh launch
```

It runs `npm --prefix web run build` (Vite build into `internal/webui/dist` plus `tsc`), `go build`s the server into `state/`, and starts it on a free `127.0.0.1` port with a fresh SQLite file (`DATABASE_PATH`, created and migrated on open), `CLIENT_IP_HEADER=X-Forwarded-For`, and example legal links, matching `web/playwright.config.ts`. Ready is printed as `ready: http://127.0.0.1:<port>  run: <dir>` only after `/healthz` answers, `/` serves the embedded SPA, and a probe room is created and read back. Build errors print the tail of `state/build.log`; startup errors print `state/server.log` (JSON lines).

Needs `web/node_modules` (`npm --prefix web ci`) and Chromium (`npx --prefix web playwright install chromium`). `launch` refuses if that `RUN` is already live: run `cleanup` first.

**After any code change, relaunch** (`cleanup` then `launch`): the SPA is embedded at `go build` time, so a running binary never picks up edits.

## Doctor

```sh
RUN=mytask .claude/skills/verify-planning-poker/verify.sh doctor
```

Read-only. Checks that the recorded pid is the binary in this run's `state/`, that it owns the recorded port, that `/healthz` is ok, that the served page references the same asset hash as `internal/webui/dist/index.html`, and that no source under `cmd/`, `internal/`, or `web/src/` is newer than the binary. `STALE` means relaunch; `FAIL` means do not drive it. Exit code is non-zero on anything but all `OK`. Run it before the first drive and after any drive that fails surprisingly.

## Drive

Journeys are Playwright specs that run against the launched instance (the config never starts a server):

```sh
RUN=mytask .claude/skills/verify-planning-poker/verify.sh drive .claude/skills/verify-planning-poker/journeys/round.spec.ts --project=desktop
```

Extra args go to `playwright test`: `--project=desktop|mobile` (Desktop Chrome or Pixel 7; both run when omitted), `-g <title>`, `--headed`. Workers are fixed at 1.

Write a new journey per feature you prove. Put a reusable one in `journeys/`; put a throwaway one in `$TMPDIR/planning-poker-verify/$RUN/journeys/` and import with absolute paths. A journey imports from the repo's E2E fixtures and the evidence helper:

```ts
import { card, createRoom, expect, join, test } from '<repo>/web/e2e/fixtures';
import {
  recordFrames,
  saveFrames,
  shot,
  snapshots,
} from '<repo>/.claude/skills/verify-planning-poker/journeys/evidence';
```

- `createRoom(page, title?, deck?)` fills `Room title`, optionally picks `Estimation deck` (`Modified Fibonacci` or `T-shirt sizes`), clicks `Create room`, and returns the room URL.
- `join(page, url, name)` fills `Name`, clicks `Join`, and waits for the `Choose your card` group.
- `newParticipant()` opens a new browser context, so a second person with their own identity and forwarded IP. Tabs in one context share an identity and a card.
- `card(page, name)` is the `article` named `<name>: <state>`, where state is `not selected`, `selected`, `no estimate`, or the revealed value.
- `recordFrames(page)` collects every WebSocket frame that page sends and receives; call it before `join`. `snapshots(frames)` returns the received room snapshots (`{title, round, deck, revealed, self, participants[{id,name,connected,selected,spectator,estimate?}]}`).
- `shot(page, name)` waits for animations to finish, then saves `<name>.png`. `saveFrames(name, frames)` saves `<name>.frames.json`.

Stable handles: ARIA roles and names as in `web/e2e/*.spec.ts` (`getByRole('button', { name: '5', exact: true })` for a card in the deck, `Reveal cards`, `Vote again`, `status` filtered by `Proposed estimate` or `Discuss!`, `list` named `Results`). Use `exact: true` for deck buttons: `1` otherwise matches `13` and `100`. The feature files list the handles per feature.

## Evidence

Each drive writes to `$TMPDIR/planning-poker-verify/$RUN/evidence/<journey>-<timestamp>/`, printed as `evidence:` at the start:

- `results/<test>-<project>/` holds the named `shot()` PNGs, `*.frames.json`, `trace.zip` (every action with DOM snapshots, open with `npx --prefix web playwright show-trace <path>`), and the final screenshot.
- `report/index.html` is the HTML report with all of the above attached.

Proof standards:

- Drive the real user path through the UI. Do not post to the WebSocket or call the API to set up the state you are proving.
- Prove what reaches the other participant from their recorded frames, not only from the UI. The UI hides unrevealed estimates, so a server that leaked them would look fine on screen; `journeys/round.spec.ts` asserts on Bob's frames and goes red when the server leaks Alice's estimate.
- Capture each step's action and resulting state (`shot` after each step), not just the last screen.
- Read the PNGs before you claim a visual result. An accessible name updates before the card flip finishes; `shot` waits for animations for that reason.
- Room persistence across a restart is out of reach here, because cleanup deletes `state/rooms.db`. `make smoke` proves it against the Docker image.
- No mocks. `page.routeWebSocket` is fine to hold or drop frames when proving reconnect behaviour, as `web/e2e/room.spec.ts` does, but never to fake the server's answer.

## Cleanup

```sh
RUN=mytask .claude/skills/verify-planning-poker/verify.sh cleanup
```

Stops the recorded pid (SIGTERM, then SIGKILL after 10 s) and deletes `state/`. It never kills by name and never touches `evidence/`, which stays at `$TMPDIR/planning-poker-verify/$RUN/evidence/` for you to cite. Run it after the last drive and after every failed attempt. Delete old evidence yourself with `rm -rf $TMPDIR/planning-poker-verify/<run>` once nobody needs it.

## Feature map

[features/README.md](features/README.md) lists the user-facing features with their entry points, handles, and proof. A proof covers every entry point its feature file lists.
