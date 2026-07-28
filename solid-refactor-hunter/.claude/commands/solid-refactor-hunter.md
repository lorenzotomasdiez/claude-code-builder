---
description: Hunt this repo for real SOLID violations, redundancy, and structural design smells, dedup against open PRs, then implement/verify/push/PR the best findings for real via gh - each in its own isolated worktree and branch
argument-hint: [optional area or path to focus on] [optional max findings, e.g. "max 2"]
---

Hunt for SOLID/redundancy/structural refactors and open real PRs for the best ones: $ARGUMENTS

Call the Workflow tool now, as an actual tool call (not a description of one), with:
- `scriptPath`: `.claude/workflows/solid-refactor-hunter.js`
- `args`: a JSON object literal `{ "area": "$ARGUMENTS" }` (an actual object in the tool call payload, NOT a JSON-encoded string, and not omitted). If the user specified a max number of findings, also pass `"maxFindings": <that number>` (default is 3 if not specified).

Do not paraphrase this into prose for a background workflow to interpret - the `args` field must be set directly on the Workflow tool call.

**Before calling it**, confirm out loud to the user that this workflow performs real, consequential actions on their behalf: it creates git worktrees and branches, commits code, **pushes to the remote**, and **opens real PRs via `gh`** - unattended, without a review step in between. If the user has not already signaled they understand this (e.g. by naming this command explicitly), ask for confirmation before proceeding. This is not the same risk class as this repo's other planning/review workflows, which only write local documents.

When it returns:
1. Report the recon: how many open PRs existed, how many candidate findings each lens produced, and how many were dropped as duplicates of an open PR or as overlapping each other.
2. For each result: the finding's title and justification, its status (`shipped` with the real PR URL, or `blocked` with the reason - a failed verification, no detectable gate commands, or a failed push/PR step), and which SOLID principle/redundancy/structural category it addressed.
3. If nothing was shipped (no findings, everything deduped away, or every attempt blocked), say so plainly rather than implying the run accomplished something it didn't.
4. Remind the user that every shipped item is a real, open PR against the repo's default branch awaiting their review - this workflow does not merge anything itself.
