---
description: Turn an existing PRD - plus its linked tech-stack, architecture, and design-system documents - into a short, reference-only task index that always opens with the fixed repo/infra/toolchain/gallery bootstrap sequence, updates incrementally when re-run, and archives completed tasks once they're safely done
argument-hint: <path to a PRD> [| path to an existing tasks.md, for an incremental update]
---

Break down the tasks for: $ARGUMENTS

The argument is a path to a PRD - this workflow designs task breakdowns FOR a PRD that already exists, and refuses to run without one. It may be followed by `|` and a path to an already-existing `tasks.md` (typically `docs/tasks/<slug>/tasks.md` from a prior run) to run an incremental update instead of a fresh one - new requirements get new tasks appended, and tasks that have long since finished and nothing active depends on get archived. Omit the second part on the first run for a product.

Call the Workflow tool now, as an actual tool call (not a description of one), with:
- `scriptPath`: `.claude/workflows/task-breakdown.js`
- `args`: a JSON object literal `{ "prd": "<the PRD path, everything before the | >", "existingTasksPath": "<the existing tasks.md path if given, or omit>", "date": "<today's date as YYYY-MM-DD, from your own system context>" }` (an actual object in the tool call payload, NOT a JSON-encoded string, and not omitted).

Do not paraphrase this into prose for a background workflow to interpret - the `args` field must be set directly on the Workflow tool call.

When it returns:
1. The task index (and its archive file) are already written to disk at `tasksPath`/`archivePath` - do not write them yourself, the workflow's own `task-author` and `task-archiver` agents wrote them directly. If `mode` was `initial` and `prdLinked` is false, tell the user the automatic PRD link failed and point them at both files.
2. Summarize for the user: how many requirements were framed and how many tasks exist now (`taskCount`), whether this was an initial or incremental run, how many tasks were archived this run (`archivedThisRun` - `0` is a normal result on most incremental runs and every initial run), how many critique rounds ran (`roundsRun`), and any issues still open (`openIssues`) when the round cap was hit - note if `openIssuesTotal` is larger than the `openIssues` list returned (it's capped at 15).
3. Tell the user the index always opens with T0 (repo & infra scaffold), T1 (toolchain verification), T2 (design-system gallery page) before any product task, and that `/tdd-blueprint <tasksPath> | <task-id>` followed by `/feature-implementer <tasksPath> | <task-id>` is how a single row gets built - point them at the first pending task's ID as the natural next command.
