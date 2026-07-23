---
description: Multi-lens adversarial review of the current diff or a supplied PR/diff, with adversarial verification of every finding
argument-hint: [optional path, PR number, or description of what to diff - defaults to the working tree diff against the base branch]
---

Review this: $ARGUMENTS

1. Determine the diff to review:
   - If `$ARGUMENTS` names a PR (e.g. a number or URL), fetch it with `gh pr diff`.
   - If `$ARGUMENTS` names a path or ref range, run the appropriate `git diff`.
   - Otherwise, default to `git diff` against the repo's base branch (fall back to `git diff HEAD` if there is no clear base) for the working tree's pending changes.
   - If the diff is empty, tell the user there is nothing to review and stop - do not call the workflow with an empty diff.

2. Call the Workflow tool now, as an actual tool call (not a description of one), with:
   - `scriptPath`: `.claude/workflows/code-review.js`
   - `args`: a JSON object literal `{ "diff": "<the unified diff text>", "context": "<PR title/description or a one-line description of the change, if known>" }` (an actual object in the tool call payload, NOT a JSON-encoded string).

Do not paraphrase this into prose for a background workflow to interpret - the `args` field must be set directly on the Workflow tool call.

3. When it returns, show the user the `report` field directly. Mention the raw counts too: how many findings were raised across all five lenses (`allFindings.length`) versus how many survived adversarial verification (`confirmed.length`), so the user knows how much noise was filtered out.
