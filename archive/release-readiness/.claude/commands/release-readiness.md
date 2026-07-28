---
description: Run a go/no-go release readiness check across independent tests, security, docs, migrations, and rollback gates
argument-hint: <description of what is shipping and where, or a repo/diff to check>
---

Run a release readiness check for: $ARGUMENTS

Call the Workflow tool now, as an actual tool call (not a description of one), with:
- `scriptPath`: `.claude/workflows/release-readiness.js`
- `args`: a JSON object literal `{ "target": "$ARGUMENTS" }` (an actual object in the tool call payload, NOT a JSON-encoded string, and not omitted). Add a `"context"` field with any extra release context you already know (target environment, release type) if useful.

Do not paraphrase this into prose for a background workflow to interpret - the `args` field must be set directly on the Workflow tool call.

When it returns:
1. Derive a short kebab-case slug from the release description and today's date (YYYY-MM-DD, from your own system context).
2. Write the returned `report` field to `docs/release-readiness/<date>-<slug>.md` (create the folder if it does not exist).
3. Tell the user the overall verdict (`go` / `conditional-go` / `no-go`) up front, then a one-line status per gate. If `no-go`, list the concrete blockers. If `conditional-go`, list the accepted residual risks.
