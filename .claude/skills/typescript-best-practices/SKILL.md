---
name: typescript-best-practices
description: TypeScript type mechanics with examples - constructive types, narrowing, type guards, casts, satisfies, schema-derived types, object arguments. Use when writing or reviewing types, casts, type guards, or function signatures in .ts or .tsx files.
paths: ['**/*.ts', '**/*.tsx']
license: MIT, adapted from pstack by Lauren Tan; see .claude/LICENSE-pstack
---

# TypeScript best practices

Read `.claude/principles/types-and-boundaries.md` first. It holds the modeling and boundary rules: unions, status fields, total types, branded IDs, parsing where data enters. This skill adds the TypeScript mechanics.

| Rule                  | Summary                                                                                                                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Constructive modeling | Build the shape so the illegal value can't be constructed. `[T, ...T[]]` for non-empty, `[T, T][]` for even length, `start` plus `duration` for a range. Not a runtime guard, not a wish for refinement types. |
| `unknown` over `any`  | External data is `unknown`.                                                                                                                                                                                    |
| Schemas before guards | Before hand-writing a property-by-property type guard, use the repository's runtime schema library and infer the type from the schema, such as `z.infer`.                                                      |
| No `as` casts         | Every `as` is a runtime crash waiting. Cast only after validation.                                                                                                                                             |
| Narrowing hierarchy   | Discriminant switch > `in` operator > `typeof`/`instanceof` > user-defined type guard > `as`.                                                                                                                  |
| Type guards           | Must verify the claim. A lying guard is worse than `as` because the bug hides behind a name that says it's safe. Name them `isX` or `hasX`.                                                                    |
| `satisfies` over `as` | Validates the value without widening literal types.                                                                                                                                                            |
| Schema-derived types  | Reach for `Pick`/`Omit`/`Parameters`/`ReturnType`/`Awaited`/`typeof` before declaring a new interface.                                                                                                         |
| Object args           | Pass objects, not positional, so argument order is self-documenting. Skip on hot paths (per-frame render, tokenizers, parsers).                                                                                |

`references/patterns.md` has an example for each rule here and in the principle. Read the section you need.
