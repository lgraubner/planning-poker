# Agent-friendly codebase

Agents extend the patterns they see in the files they open. Shape the code so the easiest change is the right one, and treat every pattern you add as one that will be copied.

## Conventions

- Give each kind of code one home and one shape: where it lives, what it is named, and which existing file is the example to follow. The project's `CLAUDE.md` names them.
- Co-locate a feature's code in one folder. Shared code stays generic.
- Split a file once it holds several concerns. Agents keep appending to the largest file in reach.
- Keep one supported way per task. Before adding a second way, migrate the callers of the first and delete it.
- Enforce module boundaries through the import graph (lint rules, package exports, separate packages), not through prose.

## Stopping bad patterns

- A workaround, or a comment explaining one, is a pattern too: the next agent copies it. Fix the cause instead.
- When a bad pattern already exists, add a lint rule that fails only on new instances first, then clean up the existing ones.
- Fix a mistake at the highest level that works: architecture, then types and lint, then tests, then rules, then skills.
- Leave the code you touched in a state you would want copied.

## In this repo

- `CLAUDE.md` names the home of each kind of code. `internal/room/` is split by concern (`store.go`, `command.go`, `validation.go`, `sqlite.go`); add to the matching file and split again before one grows past a single concern. E2E specs are split per feature in `web/e2e/`: add a test to the matching file or start a new one.
- Base UI popups go through the wrappers in `web/src/components/Popover.tsx` and `Menu.tsx` (`.claude/rules/react.md`), not another copy of their class string. oxlint enforces this and the other homes in `CLAUDE.md`.
