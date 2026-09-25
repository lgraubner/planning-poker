# Planning Poker

Create a titled room, share its link, and join with a display name. Each participant chooses from `0, 1, 2, 3, 5, 8, 13, 21, ?, ☕`. Anyone can reveal the estimates and reset for another round.

## Run locally

Requires Go 1.27+, Node.js 24+, npm, and Make.

```sh
make build
./bin/planning-poker
```

Open <http://localhost:8080>. The binary embeds the production frontend and needs no adjacent assets or database. Set `PORT` to change its listening port.

For development, run these in separate terminals after the first build:

```sh
make dev-server
make dev-web
```

Open the Vite address printed in the second terminal. Vite proxies HTTP and WebSocket requests to Go on port 8080. Restart Go after backend changes.

## Verify

Install the Playwright browser once with `npx --prefix web playwright install chromium`. Install the Git hooks once with `npx --prefix web lefthook install`; the pre-commit hook formats staged frontend and Go files. CI still rejects unformatted code, and the project `.editorconfig` keeps formatting independent of personal editor settings.

```sh
make check
make e2e
make smoke
```

`check` runs Oxlint and Oxfmt checks, builds and type-checks the SPA, runs frontend unit tests (Vitest, `web/src/**/*.test.{ts,tsx}`), runs Go vet, runs race-enabled Go tests, and runs the end-to-end tests. `e2e` builds the SPA, starts the real Go server on port 8182, and drives it with Playwright in desktop and mobile Chromium. It covers the estimate, reveal and reset round (including that unrevealed estimates never reach other browsers), automatic rejoin, shared tabs, name validation, leaving, reconnecting after a dropped socket, missing rooms, and copying the link. Run a single test with `npx --prefix web playwright test -c web/playwright.config.ts -g "<name>"`. Use `npm --prefix web run format` to format frontend source files. Generated routes and build assets are excluded. `smoke` builds the container, starts it on a temporary loopback port, checks health, embedded HTML, and room creation, then stops that test container. It requires Docker and curl. CI runs `check` as parallel web and Go jobs followed by end-to-end tests (`.github/workflows/ci.yml`), and runs the container smoke test on every push to `main` and on pull requests that change the image inputs (`.github/workflows/docker.yml`).

## Deploy

```sh
docker build -t planning-poker .
docker run --rm -p 8080:8080 planning-poker
```

The final distroless image runs as a non-root user and contains one static Go executable. Run exactly one replica. Put HTTPS termination in front of it, preserve the public `Host` header, and forward WebSocket upgrades. Set `CLIENT_IP_HEADER` to the header your proxy sets with the client address (for example `X-Forwarded-For`, whose last entry is used) so rate limits apply per client instead of to the proxy. Only set it when every request passes through that proxy, because clients can otherwise forge it. `/healthz` returns process health. Logs go to stdout and omit room codes, names, titles, and estimates. No analytics are included.

Rooms disappear on server restart or deployment. Empty rooms expire after one hour, or after ten minutes if nobody ever joined, checked once per minute. Closing a tab hides its participant card when no other tab remains. After an unexpected disconnect, the card remains for 30 seconds so the participant can reconnect. Presence cleanup runs once per second. A connected participant keeps their room alive.

## Behavior and limits

- An eight-character room code grants access. Anyone with the link can join, reveal, or reset. There are no accounts or facilitator privileges.
- The browser stores a random private participant ID and last-used name locally. Room visits automatically use the stored name; visitors without one are asked for a name. Tabs in the same browser share one card and the first joined name. Another browser or device creates another participant.
- Estimates may change until reveal. Reveal freezes the round, including for late arrivals. Reset clears every estimate. Clients never queue disconnected commands, and commands from an older round are rejected.
- Other participants receive only selection status before reveal. A participant receives their own estimate so their deck selection stays synchronized across tabs. Public card IDs are separate from the private reconnect ID.
- Each room allows 30 participants, including cards in the reconnect grace period, 60 WebSocket connections, and five connections per participant. Existing participants may rejoin a room at the participant limit.
- Titles require 1–100 Unicode characters; names require 1–40. Surrounding whitespace is trimmed and control characters are rejected. Duplicate names are allowed.
- The process allows 1,000 rooms. Room creation allows each client one room per minute with a burst of five, within a global token bucket of 10 per second with a burst of 20. Room lookups and WebSocket connections allow each client five per second with a burst of 60. Clients are identified by IP address, grouping IPv6 by /64. Each socket allows 20 commands per second with a burst of 20. Request bodies are limited to 4 KiB and WebSocket messages to 1 KiB. A socket must join within 10 seconds.
- There is no story backlog, result history, timer, observer role, chat, or integration. The fixed deck and native light/dark theme follow the MVP scope.

## Structure

`cmd/server` starts the process. `internal/room` owns room state; `internal/httpserver` exposes Chi routes and Coder WebSockets; `internal/webui` embeds Vite output; `web` contains the React, TanStack Router, and Tailwind CSS SPA.

HTTP endpoints are `POST /api/rooms`, `GET /api/rooms/{code}`, and `GET /api/rooms/{code}/ws`. The room lookup accepts an optional `X-Participant-ID` header to check availability for a returning participant without placing their identity in a URL. It returns only title and availability. WebSocket messages use `join`, `leave`, `select`, `reveal`, and `reset`; the server returns participant-specific `snapshot` messages and `error` messages. Commands after joining carry the current `round` number, except `leave`.

The glossary is in [CONTEXT.md](CONTEXT.md). The deployment trade-off is recorded in [ADR 0001](docs/adr/0001-single-process-embedded-application.md).

## Todo

- UI
- AGENTS.md
- MCP für Results?
