# Planning Poker verification map

This directory is the maintained source for verifying Planning Poker's user-facing behavior. Read this index, then use the matching feature file as the recipe. Domain terms (room, participant, spectator, round, reveal, reset, estimate) are defined in the repo's `CONTEXT.md`.

## Baseline preconditions

- An instance launched by this run: `RUN=<name> verify.sh launch`, then `verify.sh doctor` all `OK`.
- The instance starts empty apart from the launch probe room. Every journey creates its own room with `createRoom`; nothing is seeded.
- Never drive an instance this run did not launch.

## Driving conventions

- Journeys are Playwright specs run with `verify.sh drive <spec>`. Import `createRoom`, `join`, `card`, `newParticipant` from `web/e2e/fixtures.ts` and `recordFrames`, `snapshots`, `shot`, `saveFrames` from `journeys/evidence.ts`.
- One `newParticipant()` per person. Two tabs in one context are the same participant.
- Prefer ARIA roles and accessible names. Deck buttons need `exact: true`.
- Rooms are disposable. Cleanup stops the instance and drops its database; no per-room cleanup is needed.

## Proof and skip reporting

- Each step gets a `shot()`; the participant who did not act gets a `recordFrames()` and a `saveFrames()`.
- Assert the server's view from frames for anything another participant must see or must not see.
- Name the project (`desktop` or `mobile`) with every artifact. Some entry points exist only on one (see each feature's Gotchas).
- Report an unreachable path with the attempted step and the unmet precondition. Do not report a skipped entry point as verified through a different one.

## Feature entry contract

Each feature file starts with an H1 and one paragraph, then four H2s in order: `Sub-features`, `How to get to it (user POV)`, `Driving it with verify.sh`, `Gotchas`. The driving section starts with `Preconditions:` and pairs each user action with the exact locator and the observable result.

## Features

- [Create a room](./create-room.md) covers the home form, deck choice, title validation, and the rate limit.
- [Join and presence](./join-and-presence.md) covers joining, name validation, saved-identity rejoin, invite link, leaving, and reconnect.
- [Estimation round](./round.md) covers private estimates, reveal, results and agreement, confetti, vote again, and Discuss! (journey: `journeys/round.spec.ts`).
- [Spectators](./spectators.md) covers joining as a spectator, the spectator list, and switching roles.
- [Rename](./rename.md) covers renaming the room and your own name for everyone.
