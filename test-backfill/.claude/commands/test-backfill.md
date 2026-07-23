---
description: Find the highest-risk under-tested code in a scope and backfill it with meaningful, mutation-proven tests
argument-hint: <scope, e.g. a directory or module - optional, defaults to the whole repo>
---

Backfill tests for the highest-risk under-tested code in: $ARGUMENTS

Call the Workflow tool now, as an actual tool call (not a description of one), with:
- `scriptPath`: `.claude/workflows/test-backfill.js`
- `args`: a JSON object literal `{ "scope": "$ARGUMENTS" }` (an actual object in the tool call payload, NOT a JSON-encoded string). If `$ARGUMENTS` is empty, pass `{ "scope": "the whole repository" }`. Add a `"maxTargets"` number field if the user asked for a specific number of targets.

Do not paraphrase this into prose for a background workflow to interpret - the `args` field must be set directly on the Workflow tool call.

When it returns:
1. If `stopped === 'no_targets'`, tell the user plainly that no risky under-tested code was found in that scope.
2. Otherwise, summarize for the user, per target: the file, why it was flagged as risky, what tests were added, whether the mutation check proved the test catches a real regression, and the critic's final verdict.
3. If any target's mutation verdict is not `proven` or critique verdict is `needs_revision` after the revise cap, say so clearly rather than presenting it as fully done - name which targets still need human follow-up.
