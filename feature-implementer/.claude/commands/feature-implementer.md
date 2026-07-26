---
description: Take a TDD blueprint to a PR by doing real TDD - failing test first, verified red, implemented to a real green exit code, reviewed by three independent lenses. Runs after /tdd-blueprint.
argument-hint: [the feature name or docs/testing/<slug>/ path whose TDD blueprint should be implemented - defaults to asking which blueprint to build]
---

Implement the TDD blueprint for: $ARGUMENTS

1. Locate the blueprint. This workflow runs downstream of `/tdd-blueprint` and does not invent its own acceptance criteria, so it cannot start without one.
   - Look under `docs/testing/` for the folder matching `$ARGUMENTS`. You need two files from it: `behavior-specs.md` and `tdd-plan.md`.
   - If `$ARGUMENTS` is empty, list the folders under `docs/testing/` and ask the user which blueprint to implement. Stop until they answer.
   - If there is no `docs/testing/` folder, or the named folder is missing `behavior-specs.md` or `tdd-plan.md`, stop and tell the user to run `/tdd-blueprint <the feature>` first. Do not substitute a ticket, an issue, or your own reading of the codebase for a blueprint - the whole design of this workflow assumes the specs were produced and adversarially critiqued upstream.

2. Read both files in full. Pass their **contents**, not their paths - the workflow's reader agent works from the real text.

3. Call the Workflow tool now, as an actual tool call (not a description of one), with:
   - `scriptPath`: `.claude/workflows/feature-implementer.js`
   - `args`: a JSON object literal `{ "behaviorSpecs": "<contents of behavior-specs.md>", "tddPlan": "<contents of tdd-plan.md>", "context": "<optional: target repo area, constraints, related work>" }` (an actual object in the tool call payload, NOT a JSON-encoded string).

Do not paraphrase this into prose for a background workflow to interpret - the `args` field must be set directly on the Workflow tool call.

4. When it returns, lead with the bad news, not the PR body:
   - If `blockedSlices` is non-empty, say so first: how many slices are blocked, which ones, and each `blockedReason`. A blocked slice means the tests did not reach a real exit code of 0, or a review lens never cleared it. This is the single most important thing for the user to know and must not be buried under the PR description.
   - If `notGenuinelyRed` is non-empty, flag those slices too: their tests passed *before* the implementation existed, which usually means the test is not asserting anything real. A green suite over hollow tests is worse than a red one.
   - Then show the `prBody` field directly as the PR description.
   - Finally, note any `blueprint.gaps` carried in from the blueprint itself - open questions or assumed thresholds a human still needs to settle.

5. Do not push a branch or open the actual PR yourself unless the user explicitly asks you to - this command produces the PR body and the working-tree changes; opening the PR is a separate, confirmable action. If any slice is blocked, say plainly that the PR is not ready to open.
