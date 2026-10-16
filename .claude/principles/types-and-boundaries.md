# Types and boundaries

Make the compiler reject impossible states. Parse untrusted data once, where it enters, into a named domain type. Trust the types everywhere else.

## Model the domain

- Model variants as a discriminated union, not as a bag of optional fields. If a comment explains when a combination of fields is valid, split it into a union.
- Give each lifecycle one status field with a literal union instead of a second boolean that must stay in sync with the first.
- Prefer a lookup table or a `satisfies Record<Union, …>` map over an if/else chain that grows by one branch per feature.
- Keep the plain type while every operation on it stays total. Strengthen it only where the loose type forces a `!`, an `as`, or a "should never happen" branch.
- Brand an ID when two IDs of the same primitive type travel through the same call and can be swapped.
- Keep code boring when the shape is clear, local, and unlikely to grow. An abstraction earns its place by deleting branches, duplicated rules, or invalid states.

## Parse at the boundary

Boundaries: environment, network input (HTTP, WebSocket), queue payloads, external API responses, files, storage. The project's `CLAUDE.md` names its parser per boundary.

- Derive the type from the schema (`z.infer`), so the schema and the type cannot drift.
- Hand the parsed value on, not the raw input. Code behind the boundary takes the domain type and does not validate again.
- Expose domain types across a boundary, not the transport, storage, or wire types behind it.
- Resolve an `as` cast by finding the boundary it skips and parsing there. A cast is right only for a fact the type system cannot express, after validation.

## In this repo

- `RoomStatusSchema` in `web/src/api.ts` is the model: a zod discriminated union on `available`, its type derived with `z.infer`.
- The room snapshot from `useRoom` is the one parse of WebSocket data in the SPA; components take its `Participant` type.
- Go has no sum types: the server rejects an unknown command `type` in `internal/room/command.go` and an unknown deck in `store.go`; the deck values live in one map in `validation.go`.
- Name length counts code points on both sides (`utf8.RuneCountInString` in Go, `Array.from(...)` in TypeScript), so client and server agree on the 40-character limit.

Adapted from pstack (MIT), see `.claude/LICENSE-pstack`.
