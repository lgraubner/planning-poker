# Idempotent operations

Every job, cron, and multi-step lifecycle converges to the same end state, however many times it runs and wherever the previous run stopped.

Answer three questions for each operation that changes state:

1. What happens if it runs twice in a row?
2. What happens if the previous run crashed at each possible point?
3. Does running it again converge to the same end state?

If an answer is "it depends on what the last run left behind", add a reconciliation step.

- Derive each step from the current state, not from what the previous run meant to do. Read the state, compare it to the goal, apply the difference.
- Make anything a run leaves behind recognizable as stale by the next run. Judge staleness by stored evidence, such as a timestamp or a status, not by memory of the run.
- Write in an order that keeps every intermediate state valid: write the new object, then switch the pointer to it, then delete the old one.
- Deduplicate enqueues with a deterministic job ID derived from the entity.
- A job that can never succeed fails permanently instead of retrying.

## In this repo

- `Store.Sweep` runs every second from `cmd/server/main.go` and removes rooms and participants by their stored timestamps, so a missed or doubled tick changes nothing.
- `room.Open` creates and migrates the SQLite schema on every start (`CREATE TABLE IF NOT EXISTS`, then additive `ALTER TABLE`). A new migration must be safe to run against a file that already has it.
- A reconnect replays `join` with the remembered id: joining twice with the same id keeps one participant.

Adapted from pstack (MIT), see `.claude/LICENSE-pstack`.
