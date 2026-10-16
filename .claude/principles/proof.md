# Proof

Work is done when you observed the real result, not when it compiles, a proxy looks right, or a subagent says so.

- Read the actual value: the stored row, the sent message, the HTTP status, the page the user sees.
- Prefer a scripted check over a one-time look, and keep its output where a reviewer can rerun it.
- When a check fails unexpectedly, suspect the observation first: a stale page, the wrong instance, a cached build.
- Hand over an artifact that shows the change works as intended and is quicker to review than the diff: screenshots or a video for UI, the request and response for an API, the command and output for a CLI.
- For a user-facing change, drive the real app with the project's `verify-*` skill and report its evidence path. Name every entry point you did not drive as unverified.

## In this repo

- UI or protocol change: `verify-planning-poker`, citing its evidence directory (screenshots, `*.frames.json`, trace).
- A change to the Dockerfile or anything in the `paths` filter of `.github/workflows/docker.yml`: `make smoke`.
- Restart persistence is out of reach for the verify skill; prove it with `make smoke` or a Go test against `room.Open`.

Adapted from pstack (MIT), see `.claude/LICENSE-pstack`.
