---
description: Hunt down a bug end-to-end: reproduce, converge on the real root cause, fix it, add a proven regression test, and verify
argument-hint: <bug report>
---

Hunt down this bug: $ARGUMENTS

Call the Workflow tool now, as an actual tool call (not a description of one), with:
- `scriptPath`: `.claude/workflows/bug-hunter.js`
- `args`: a JSON object literal `{ "bugReport": "$ARGUMENTS" }` (an actual object in the tool call payload, NOT a JSON-encoded string, and not omitted). Add a `"context"` field if the user supplied extra context (repro environment, affected version, etc.).

Do not paraphrase this into prose for a background workflow to interpret - the `args` field must be set directly on the Workflow tool call.

When it returns:
1. If `stopped === 'not_reproduced'`, tell the user plainly that the bug could not be reproduced and show the reproducer's notes - do not claim anything was fixed.
2. Otherwise, summarize for the user: the confirmed root cause and where it was rejected/accepted from among the hypotheses, the fix (files changed), the regression test added (and that it was proven via mutation check), and the final independent verdict (pass/fail) with any issues the verifier flagged.
3. If the final verdict is `fail`, say so clearly and do not present the bug as resolved.
