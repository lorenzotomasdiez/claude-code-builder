---
description: Take a TDD blueprint to a PR by doing real TDD - failing test first, verified red, implemented to a real green exit code, reviewed by three independent lenses. Runs after /tdd-blueprint. When run task-scoped, marks the task done in tasks.md once everything ships.
argument-hint: [the feature name or docs/testing/<slug>/ path whose TDD blueprint should be implemented] [| for a task-scoped run: a path to tasks.md | a task ID] [- defaults to asking which blueprint to build]
---

Implement the TDD blueprint for: $ARGUMENTS

There are two ways to invoke this:

**Task-scoped** (preferred whenever a `task-breakdown` index exists): `$ARGUMENTS` is `<path to tasks.md> | <task ID>` (e.g. `docs/tasks/on-call-tracker/tasks.md | T3`). Locate the blueprint folder by globbing for `docs/testing/*/<task ID>/behavior-specs.md`. If it is not found, stop and tell the user to run `/tdd-blueprint <that tasks.md path> | <that task ID>` first - do not substitute a whole-product blueprint or your own reading of the codebase.

**Whole-target**: $ARGUMENTS is a feature name or a `docs/testing/<slug>/` path.
- Look under `docs/testing/` for the folder matching `$ARGUMENTS`. You need two files from it: `behavior-specs.md` and `tdd-plan.md`.
- If `$ARGUMENTS` is empty, list the folders under `docs/testing/` and ask the user which blueprint to implement. Stop until they answer.
- If there is no `docs/testing/` folder, or the named folder is missing either file, stop and tell the user to run `/tdd-blueprint <the feature>` first. Do not substitute a ticket, an issue, or your own reading of the codebase for a blueprint - the whole design of this workflow assumes the specs were produced and adversarially critiqued upstream.

In both cases, pass the two files' **paths**, not their contents - the workflow's reader agent has its own Read/Grep/Glob tools and reads them itself.

Call the Workflow tool now, as an actual tool call (not a description of one), with:
- `scriptPath`: `.claude/workflows/feature-implementer.js`
- `args`: a JSON object literal `{ "behaviorSpecsPath": "<path to behavior-specs.md>", "tddPlanPath": "<path to tdd-plan.md>", "context": "<optional: target repo area, constraints, related work>", "tasksPath": "<the tasks.md path, task-scoped runs only>", "taskId": "<the task ID, task-scoped runs only>", "date": "<today's date as YYYY-MM-DD, task-scoped runs only>" }` (an actual object in the tool call payload, NOT a JSON-encoded string). Omit `tasksPath`/`taskId`/`date` entirely on a whole-target run.

Do not paraphrase this into prose for a background workflow to interpret - the `args` field must be set directly on the Workflow tool call.

When it returns, lead with the bad news, not the PR body:
1. If `blockedSlices` is non-empty, say so first: how many slices are blocked, which ones (`sliceKey`), and each `blockedReason`. A blocked slice means the tests did not reach a real exit code of 0, or a review lens never cleared it - `reviewIssues` on that slice names which lens and why. This is the single most important thing for the user to know and must not be buried under the PR description.
2. If `notGenuinelyRed` (an array of slice keys) is non-empty, flag those slices too: their tests passed *before* the implementation existed, which usually means the test is not asserting anything real. A green suite over hollow tests is worse than a red one.
3. Then show the `prBody` field directly as the PR description.
4. If `taskScoped` is true: report `taskMarkedDone` - if true, tell the user task `taskId` is now marked done in `tasksPath`; if false (which will happen whenever any slice was blocked, by design), tell them the task was deliberately left as-is because not everything shipped, and it will need a follow-up run once the blocked work is fixed.
5. Finally, note any `blueprintGaps` carried in from the blueprint itself - open questions or assumed thresholds a human still needs to settle.

Do not push a branch or open the actual PR yourself unless the user explicitly asks you to - this command produces the PR body and the working-tree changes; opening the PR is a separate, confirmable action. If any slice is blocked, say plainly that the PR is not ready to open.
