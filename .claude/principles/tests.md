# Tests

A test is a claim about what the code does for its users: a caller, an end user, or another service. Assert what they can observe: return values, errors callers branch on, state they can read back, and effects outside the code, such as a row written, a message sent, or the payload another participant receives. Internal helpers, call order, and intermediate data are implementation.

Judge each test against two imagined edits:

- **Break the behavior.** Return a wrong value, skip an effect, or do it twice. A test that still passes proves nothing.
- **Change the internals.** Restructure the code and keep every observable result. A test that now fails is pinned to the implementation.

Keep tests that catch the first edit and survive the second. Rewrite or delete the rest.

- A new test counts once you have seen it go **red**: break the behavior it covers, watch it fail, restore.
- Prefer end-to-end tests through the real app as proof that a feature works. Test units in isolation only where end-to-end reaches poorly: limits, validation edge cases, timing. There, work test-first: list every way the unit could fail, write a test per failure mode, then the code.
- Derive the expected value from the requirement, never from the code under test.
- Pair a "not called" assertion with a "called" case, so the test shows it can see the call.
- Assert the error type or code callers branch on, not the wording of a message nobody reads.

## In this repo

- E2E: `web/e2e/room.spec.ts` with helpers from `web/e2e/fixtures.ts`. Use one browser context per participant (`newParticipant()`), and assert on the other participant's frames or cards.
- Go: `internal/room/store_test.go` and `internal/httpserver/server_test.go` for limits, validation, and timing; run with `-race`.
- Vitest: `web/src/consensus.test.ts` for pure logic such as the agreement score.

Adapted from pstack (MIT), see `.claude/LICENSE-pstack`.
