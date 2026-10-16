# Changes and debugging

Fix the fault where it starts, and leave the design simpler than you found it.

## Debugging

- The root cause is the first place the system did something it should not, or failed to handle a state it should. The symptom is only where that became visible.
- Ask whether the state that broke the code is legitimate. If it is, handle it where it broke. If it is not, find what produced it. Guards, retries, swallowed errors, clamped values, and fallback defaults are the usual ways to hide a bug.
- Instrument when stuck: read the actual error, the log, the stored state.
- After a fix, search for the same fault elsewhere and fix every instance.
- When the deciding fact took a deep dig to find, propose the cheap always-on signal (a log field, a metric, a status) that would have shown it at first look.

## Changing the design

- Integrate a new requirement as if it had been there from the start. Propagate it through types, docs, and tests, then deliver it in small steps.
- Remove dead code, stale validators, and unused options before building on top of them.
- Design for observed usage. Validation belongs at boundaries the data actually crosses.
- Replace an internal API in one change: inventory its callers, migrate them, and delete the old API. A temporary adapter needs a named removal step.
- For a mechanical change across many files, write a codemod or script first and run it, instead of editing each file by hand. When the work is split across subagents, hand each the same tool.
- **Public contracts are the exception.** An API, protocol, or published package with callers outside the repo stays compatible; version a breaking change instead of deleting the old path. The project's `CLAUDE.md` names its public contracts.

## Repeated mistakes

When the same correction comes up twice, make the mistake impossible (a type, lint rule, test, or hook) instead of writing another instruction: use the `/correct` skill.

## In this repo

- A wrong room in the UI is usually a wrong snapshot: read the WebSocket frames (the `verify-planning-poker` skill records them) before patching a component.
- A change to the snapshot or a command must keep working for tabs that loaded the previous build and reconnect to the new server. Add fields; do not rename or remove them.
- Server logs are JSON on stdout and omit room codes, names, titles, and estimates. Keep it that way when adding a log field.

Adapted from pstack (MIT), see `.claude/LICENSE-pstack`.
