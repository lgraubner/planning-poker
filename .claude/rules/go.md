---
paths: ['**/*.go']
---

# Go

## Blank lines

gofmt never adds blank lines, so write function bodies in **paragraphs**, one per logical step, separated by a blank line:

- A statement and the check on its result form one paragraph: `x, err := f()` sits directly above `if err != nil`, and `mu.Lock()` directly above `defer mu.Unlock()`.
- A blank line follows each closing `}` and each run of `defer`s when more statements follow.
- A blank line precedes an `if`, `for`, `switch`, or `select` that starts a new step, and the final `return` of a function with several steps.

## Comments

A doc comment starts with the name it documents (`// clientIP groups …`). Any other `//` comment starts with a capital letter. A one-line comment holding a single sentence ends without a full stop; one with several sentences ends each sentence with one.
