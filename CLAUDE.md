## Done

A change is done when `make check` (lint, format, build, unit and E2E tests) is **green**. Judge by its own exit code (`make check; echo $?`): a pipe through `tail` or `grep` reports the last command's status instead. A change to any file in the `paths` filter of `.github/workflows/docker.yml` also needs `make smoke` green.

## Testing

Playwright E2E tests in `web/e2e/` are the proof that a feature works; they drive the real Go server.

- A new E2E test counts once you have seen it go **red**: break the behaviour it covers, watch it fail, restore. Assert what reaches the other participant (WebSocket frames), because the UI can hide a server bug.
- Finish E2E work with the HTML report as the **artifact**: `npx --prefix web playwright test -c web/playwright.config.ts --reporter=html` writes `web/playwright-report/`. CI uploads the same report.
- Test in isolation (Go `*_test.go`, Vitest `web/src/**/*.test.{ts,tsx}`) only what E2E reaches poorly: limits, validation edge cases, timing. Work test-first: list every way the unit could fail, write a test per failure mode, then the code.

## Go style

gofmt never adds blank lines, so write Go function bodies in **paragraphs**, one per logical step, separated by a blank line:

- A statement and the check on its result form one paragraph: `x, err := f()` sits directly above `if err != nil`, and `mu.Lock()` directly above `defer mu.Unlock()`.
- A blank line follows each closing `}` and each run of `defer`s when more statements follow.
- A blank line precedes an `if`, `for`, `switch` or `select` that starts a new step, and the final `return` of a function with several steps.

## Commits

Write every commit message as a Conventional Commit: `type(scope)!: subject`, with a lowercase subject. Pull request titles follow the same format. The `commit-msg` hook and CI on pull requests enforce it with commitlint (`web/commitlint.config.mjs`); when commitlint rejects a message, rewrite the message and commit again.
