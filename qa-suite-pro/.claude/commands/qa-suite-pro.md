---
description: Full QA of a service/area (or one row of a task-breakdown task index) - code test strategy + missing tests + coverage, PLUS browser E2E of derived UI user stories (headless by default, or headed to watch it happen), in one report
argument-hint: <service or area to QA, e.g. "the checkout flow"> [headed] OR <path to tasks.md> | <task ID> [headed]
---

Run a full QA pass (code tests + browser E2E) on: $ARGUMENTS

If the word "headed" appears anywhere in `$ARGUMENTS`, strip it out and set `headed: true`; otherwise `headed: false` (the default - headless, for CI/unattended runs).

There are two ways to invoke this, after stripping "headed":

**Task-scoped** (preferred whenever a `task-breakdown` index exists): the remaining `$ARGUMENTS` is `<path to tasks.md> | <task ID>` (e.g. `docs/tasks/on-call-tracker/tasks.md | T3`). Pass both straight through as paths/IDs - do not read the task index yourself first. The workflow's own `qa-suite-pro-scoper` agent reads the task's row and, if `/tdd-blueprint` already ran for it, grounds the derived UI stories in that task's actual behavior specs instead of inventing flows from the code alone.

**Whole-target**: the remaining `$ARGUMENTS` is the service/area description, e.g. "the checkout flow".

Call the Workflow tool now, as an actual tool call (not a description of one), with:
- `scriptPath`: `.claude/workflows/qa-suite-pro.js`
- `args`: a JSON object literal (an actual object in the tool call payload, NOT a JSON-encoded string):
  - Task-scoped: `{ "tasksPath": "<the tasks.md path>", "taskId": "<the task ID>", "headed": <true or false>, "date": "<today's date as YYYY-MM-DD>" }`.
  - Whole-target: `{ "target": "<the area, with 'headed' stripped out>", "runId": "<timestamp>", "baseUrl": "<optional app URL>", "context": "<optional extra context>", "headed": <true or false> }`.
    - `runId`: generate a timestamp yourself from your own system context, formatted `YYYYMMDD-HHMMSS` (the workflow cannot generate time, so you must supply it).

This workflow drives a real browser via `playwright-cli`, which must be installed and on PATH (`npm install -g @playwright/cli@latest`). Headed mode opens a real, visible window per story instead of an invisible one - same engine, same parallelism. If `playwright-cli` is not available the browser phase will report `blocked` rather than fail silently.

Do not paraphrase this into prose for a background workflow to interpret - the `args` field must be set directly on the Workflow tool call.

When it returns:
1. The report is already written to disk at `reportPath` (under `outDir`) - do not write it yourself, the workflow's own `qa-suite-pro-reporter` agent wrote it directly. The run's UI story YAML and per-step screenshots also live under `outDir` (`user-stories/`, `screenshots/`).
2. Summarize for the user: `target`, whether it has a UI, `codeGapsFound` vs `codeGapsRemaining` after `codeRoundsRun` round(s), `testsWritten`/`testsPassed`/`testsFailed`, and `uiStoriesPassed`/`uiStoriesRun` - for any story in `browserResults` with `status` `fail` or `blocked`, show its `failureDetail` and `screenshotDir`. Note whether the run was headless or headed.
3. If `codeCoverageVerdict` is `incomplete` at the round cap, or any browser story is `blocked`, say so plainly rather than presenting the run as finished.
4. Give the user the path to `outDir` for the full report and visual evidence.
