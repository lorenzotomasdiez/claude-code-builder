---
description: Authorized multi-tenant isolation audit of the current diff or a supplied PR/diff/service description, with adversarial verification of every finding
argument-hint: [optional path, PR number, or description of the multi-tenant service/surface to audit - defaults to the working tree diff against the base branch]
---

Audit this: $ARGUMENTS

0. Confirm this is an authorized review: the requester should already have permission to review this code or service for tenant-isolation issues. This workflow assumes that authorization and does not itself gate on it - if the user has not indicated authorization and the target is not their own code/service, ask before proceeding.

1. Determine the target to audit:
   - If `$ARGUMENTS` names a PR (e.g. a number or URL), fetch it with `gh pr diff`.
   - If `$ARGUMENTS` names a path or ref range, run the appropriate `git diff`.
   - If `$ARGUMENTS` is a description of a service or surface (not a diff), use that description directly as the target.
   - Otherwise, default to `git diff` against the repo's base branch (fall back to `git diff HEAD` if there is no clear base) for the working tree's pending changes.
   - If the diff is empty and no service description was given, tell the user there is nothing to audit and stop - do not call the workflow with an empty target.

2. Call the Workflow tool now, as an actual tool call (not a description of one), with:
   - `scriptPath`: `.claude/workflows/tenant-isolation-audit.js`
   - `args`: a JSON object literal `{ "target": "<the unified diff text or service description>", "context": "<authorization note, PR title/description, or a one-line description of the surface, if known>" }` (an actual object in the tool call payload, NOT a JSON-encoded string).

Do not paraphrase this into prose for a background workflow to interpret - the `args` field must be set directly on the Workflow tool call.

3. When it returns, show the user the `report` field directly. Mention the raw counts too: how many findings were raised across all four lenses (`allFindings.length`) versus how many survived adversarial verification (`confirmed.length`), so the user knows how much noise was filtered out.
