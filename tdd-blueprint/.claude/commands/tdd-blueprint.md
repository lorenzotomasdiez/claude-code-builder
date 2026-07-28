---
description: Turn a PRD plus architecture and design docs (or one row of a task-breakdown task index) into the test blueprint a developer does TDD from - strategy, Given/When/Then specs, red-green build order, traceability. Writes no code.
argument-hint: <what is being built, or a path to a PRD / architecture / design doc> [| for a task-scoped run: a path to tasks.md | a task ID]
---

Produce the TDD blueprint for: $ARGUMENTS

There are two ways to invoke this:

**Task-scoped** (preferred whenever a `task-breakdown` index exists): `$ARGUMENTS` is `<path to tasks.md> | <task ID>` (e.g. `docs/tasks/on-call-tracker/tasks.md | T3`). Pass both straight through as paths/IDs - do not read the task index or any document yourself first. The workflow's own `tdd-framer` agent reads the task's row and follows only its references, so this stays cheap regardless of how large the rest of the project's documents are.

**Whole-target** (no task index yet, or blueprinting the whole product at once): $ARGUMENTS is a sentence describing what's being built, or a path to a PRD/architecture/design document. First, look for matching documents in this repo: a PRD under `docs/product-specs/`, architecture documents under `docs/architecture/`, design documents under `docs/design/`. Pass whatever you find as **paths**, not file contents - the workflow's `tdd-framer` agent has its own Read/Grep/Glob tools and reads them itself; do not read these files into your own context first just to paste them into `args`.

Call the Workflow tool now, as an actual tool call (not a description of one), with:
- `scriptPath`: `.claude/workflows/tdd-blueprint.js`
- `args`: a JSON object literal (an actual object in the tool call payload, NOT a JSON-encoded string):
  - Task-scoped: `{ "tasksPath": "<the tasks.md path>", "taskId": "<the task ID>" }`.
  - Whole-target: `{ "target": "$ARGUMENTS", "prd": "<PRD path, or omit>", "architecture": "<architecture doc path, or omit>", "design": "<design doc path, or omit>" }`. Omit any key you found no document for - the workflow runs from `target` alone if none exist.

Do not paraphrase this into prose for a background workflow to interpret - the `args` field must be set directly on the Workflow tool call.

When it returns:
1. The six documents are already written to disk at `documentsPath` - do not write them yourself, the workflow's own `tdd-doc-author` agent wrote each one directly. `documents` lists each one's `path`, `charCount`, and `version` for reference, not their text.
2. Summarize for the user: `product`, the number of slices and specs produced (`sliceCount`/`specCount` - one slice is expected on a task-scoped run), `strategyShape`, how many critique rounds ran (`roundsRun`) and any issues still open (`openIssues`) at the round cap - note if `openIssuesTotal` is larger than the `openIssues` list returned (it's capped at 15) - the number of build steps and `firstFailingSpecId`, `coveredCount` against `traceabilityGaps` (anything not fully covered), any `orphanSpecs`, and any `ambiguities` a human needs to resolve. Give them `documentsPath`.
3. If `taskScoped` is true, tell the user the next step is `/feature-implementer <the same tasks.md path> | <the same task ID>`, and that once every slice ships it will mark this task done in `tasks.md` itself.
4. Remind them that this workflow deliberately produced no test code: the point is that the developer (or `/feature-implementer`) writes the first failing test themselves from `tdd-plan.md`.
