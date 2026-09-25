## Done

A change is done when `make check` (lint, format, build, unit and E2E tests) is **green**. Judge by its own exit code (`make check; echo $?`): a pipe through `tail` or `grep` reports the last command's status instead. A change to any file in the `paths` filter of `.github/workflows/docker.yml` also needs `make smoke` green.

## Testing

Playwright E2E tests in `web/e2e/` are the proof that a feature works; they drive the real Go server.

- A new E2E test counts once you have seen it go **red**: break the behaviour it covers, watch it fail, restore. Assert what reaches the other participant (WebSocket frames), because the UI can hide a server bug.
- Finish E2E work with the HTML report as the **artifact**: `npx --prefix web playwright test -c web/playwright.config.ts --reporter=html` writes `web/playwright-report/`. CI uploads the same report.
- Test in isolation (Go `*_test.go`, Vitest `web/src/**/*.test.{ts,tsx}`) only what E2E reaches poorly: limits, validation edge cases, timing. Work test-first: list every way the unit could fail, write a test per failure mode, then the code.
