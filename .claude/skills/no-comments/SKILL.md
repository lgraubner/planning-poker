---
name: no-comments
description: 'Strip comments that restate code from a diff or files, fix the code smells they hid, and turn claimed constraints into types, tests, or lints. Use for /no-comments before a commit or PR.'
disable-model-invocation: true
license: MIT, adapted from pstack by Lauren Tan; see .claude/LICENSE-pstack
---

# No comments

Spawn Comment Sicko and act on its findings. Accept every finding the table in step 2 does not reject.

## Scope

Use the caller's files or diff. Otherwise use the current diff against the base branch, default `main`, including the working tree.

## Steps

1. Spawn `Agent` with `subagent_type: "comment-sicko"`. Pass the scope. Do not restate its rules.
2. Check its report and diff. Before deciding on an `IMPORTANT` or `do not remove` comment, trace its symbol yourself: read its callers and its history with `git log -S` and `git blame`.

   | Finding                                                                 | Action                                                                                         |
   | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
   | An edit to application code, or to a file outside the scope             | Reject the report.                                                                             |
   | A deleted comment that the keep list in `CLAUDE.md` protects            | Reject the report.                                                                             |
   | A `MUST KILL` with a wrong reason, or on code that is intentional       | Reject the report.                                                                             |
   | A `MUST KILL` on a surprise in our own code                             | Accept it for steps 3 and 4. Do not restore the comment.                                       |
   | A deleted comment whose keep claim stays ambiguous after tracing        | Accept the deletion.                                                                           |
   | A kept comment not proven to be about something we cannot change        | Delete it.                                                                                     |
   | A lint or TypeScript suppression in scope that the report does not name | Correctness or safety rule: add a `MUST KILL`. Faulty, pedantic, or style-only rule: leave it. |

   On a rejected report, revert its changes and spawn Comment Sicko once more with the failure named. If the second report is rejected too, report it open and fail `/no-comments`.

3. Fix trivial accepted flags directly by deleting a dead path, dropping a parameter, or using the real API. If any fix needs a shape, sketch one design for the accepted set and surrounding code. Stop at the sketch. Step 4 implements.
4. Implement the smallest root-cause fix in scope. Remove every named workaround. If the root cause is out of scope, land the smallest in-scope fix and report the rest open. `.claude/principles/changes-and-debugging.md` guides intent only. It does not authorize widening the fence or fixing instances outside it. Never bolt on symptom guards.
5. Constraint comments say `do not remove`, `do not change wording`, or `talk to X before changing`. Leave keeps about things we cannot change. Offer the cheapest in-scope type, runtime, test, or CI lint. Wait for interactive approval. Unattended and eval require caller pre-approval. If approved, encode then delete. Otherwise delete, report the constraint open, and sketch out-of-scope work.
6. Report the deletion count, rejected reports and reruns, design sketch, fixes, encoding offers, encodings, unenforced constraints, and other open work.
