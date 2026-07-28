# QA Suite Pro

Everything `qa-suite` does for code testing, plus a real **browser E2E** pass. A QA architect designs a layered code-test strategy AND derives UI user stories; the engineer writes the missing code tests and runs them; a coverage critic verifies code coverage; then each UI story is driven through a real browser (`playwright-cli`) with a screenshot after every step; and one report covers both.

Browser mode is a single toggle, not a separate workflow: **headless** by default (CI, unattended batches), or **headed** to watch the run happen in a real, visible window per story. Both modes use the same engine, the same agents, and the same parallelism.

```
/qa-suite-pro the checkout flow            # headless
/qa-suite-pro the checkout flow headed     # headed, one visible window per story
```

## Design note: why this isn't computer-use

An earlier iteration split this into two workflows: this one (headless, `playwright-cli`) and `qa-suite-pro-computer-use`, which drove Claude's computer-use / in-Chrome tools (`claude --chrome`), mirroring the `builder` repo's `claude-bowser` path. That path requires an interactive session with the Chrome extension connected - subagents spawned by a background `Workflow()` run never have that, so every real run against a served app came back `0/7 stories executed, all blocked`.

Reading `builder/.pi/agents/bowser-qa-agent.md` - the agent Bowser actually runs in production, as opposed to the `architecture.md` description of `claude-bowser` - showed it uses `playwright-cli --headed`, not computer-use: a real, visible window under CLI control, no interactive-session dependency, no single-instance constraint. Headed and headless are the same capability with one flag, so the two workflows collapsed into this one with a `headed` toggle. `qa-suite-pro-computer-use` was removed.

## Model tiering

Mechanical, execution-only steps run on `haiku` for speed and cost; steps that require judgment or synthesis stay on `sonnet`:

| Agent | Model | Why |
|---|---|---|
| scoper | haiku | locates files/config - no judgment |
| architect | sonnet | designs the test matrix and derives stories - reasoning |
| engineer | sonnet | writes tests, diagnoses failures - reasoning |
| coverage-critic | sonnet | judges whether coverage is genuine - reasoning |
| story-author | haiku | writes a YAML file verbatim - no judgment |
| browser-runner | haiku | executes fixed steps and screenshots - no judgment |
| reporter | sonnet | synthesizes both halves into one report - reasoning |

## Usage

```
/qa-suite-pro the checkout flow
/qa-suite-pro the checkout flow headed
/qa-suite-pro docs/tasks/on-call-tracker/tasks.md | T3
/qa-suite-pro docs/tasks/on-call-tracker/tasks.md | T3 headed
```

The first two forms are **whole-target**: the command generates a timestamped `runId` and the workflow's own `qa-suite-pro-reporter` agent writes the report directly to `docs/qa-reports/<slug>/<runId>/report.md`, alongside the generated story YAML and per-step screenshots in the same folder.

The last two are **task-scoped**, feeding from `/task-breakdown`'s output: given a `tasks.md` path and one task ID, `qa-suite-pro-scoper` reads that row to resolve the target and the code it touched, and - if `/tdd-blueprint` already produced a blueprint for that task - grounds the derived UI stories in its actual behavior specs instead of inventing flows from reading the code alone. Output lands at `docs/qa-reports/<slug>/<taskId>/report.md` instead, where `<slug>` is taken from the task index's own parent folder - the same product, the same task ID, across `docs/testing/`, `docs/qa-reports/`, and `tasks.md` itself.

## Requirements

- `playwright-cli` installed and on PATH (`npm install -g @playwright/cli@latest`). If it is missing, the browser phase reports `blocked` instead of failing silently; the code-test half still runs.

## Pipeline

```
Scope (1 agent)
  -> Strategy (1 agent: code-test matrix + gaps AND derived UI user stories)
    -> Implement (qa-engineer) ⇄ Verify (qa-coverage-critic)   [code tests, capped 2 rounds]
      -> Author stories (1 agent: write the UI stories to YAML in the run folder)
        -> Browse (N agents in parallel: one browser runner per UI story, headless or headed per the toggle)
          -> Report (1 agent: code results + browser results in one report)
```

The browser phase only runs when the architect produced UI stories (a pure-backend target skips it).

## How it maps to Bowser

The browser E2E layer is a port of the `builder` repo's "Bowser" QA system into a self-contained Claude Code workflow, following the `bowser-qa-agent` / `playwright-bowser` path:

- **Capability** - the `qa-suite-pro-browser-runner` agent embeds the `playwright-cli` command surface (named persistent sessions, `snapshot` + ref-based `click`/`fill`, per-step `screenshot`, `console` for JS errors) directly, so no external skill is needed. It assumes `playwright-cli` is installed, and takes the headless/headed choice from its prompt.
- **Scale** - one browser runner executes one story step-by-step, screenshots every step, fails fast, and returns a structured pass/fail with console errors - the `bowser-qa-agent` model.
- **Orchestration** - the workflow script fans out one runner per story in parallel (isolated sessions), the `/ui-review` fan-out expressed as a `parallel()` stage.
- **Stories** - the architect derives them from the app, docs, and routes; the story-author persists them as Bowser-format `stories:` YAML in the run folder, so they are inspectable and re-runnable.

## Files

- `.claude/agents/*.md` - qa-suite-pro-{scoper, architect, engineer, coverage-critic, story-author, browser-runner, reporter}, each narrow with a "what you do not do" section. Architect/engineer are distilled from `experts/qa-architect.md` and `experts/qa-engineer.md`; the browser-runner embeds the Bowser/playwright-cli how-to for both browser modes. `reporter` writes its report to disk itself (`Write` tool) and returns only `{path, charCount, version}` - never the report text.
- `.claude/workflows/qa-suite-pro.js` - the orchestration script. Reads `headed` from `args` and threads it into the Browse phase's agent prompts; accepts either a free-text `target` or a task-scoped `{tasksPath, taskId}` pair and computes one output folder either way.
- `.claude/commands/qa-suite-pro.md` - the `/qa-suite-pro <target> [headed]` or `/qa-suite-pro <tasks.md> | <task-id> [headed]` entry point; it generates the `runId` timestamp the script cannot (whole-target only) and detects the `headed` keyword.

## Run folder layout

Both invocation forms land under one coherent tree - no more a separately-timestamped `qa-runs/` folder split from a differently-named report file:

```
docs/qa-reports/<slug>/<runId-or-taskId>/
├── report.md                     written directly by qa-suite-pro-reporter
├── user-stories/stories.yaml     the derived UI stories (Bowser format, re-runnable)
└── screenshots/<story-slug>/     NN_<step>.png per step, the evidence trail
```

For a task-scoped run, `<slug>` is the task index's own parent folder name and `<runId-or-taskId>` is the task ID - so `docs/testing/<slug>/<taskId>/`, `docs/qa-reports/<slug>/<taskId>/`, and the row in `docs/tasks/<slug>/tasks.md` all agree on the same two names.

## Antibloat

`qa-suite-pro-reporter` used to return the full report as markdown, and the workflow's final return carried the complete `scope`/`strategy`/`engineering`/`coverage`/`browserResults` objects a second time on top of that - the same return-everything pattern found and fixed elsewhere in this library (`prd-generator`, `tech-stack-selector`, `tdd-blueprint`). The report now writes to disk directly; the return is a compact summary (counts, verdicts, and only the failing/blocked browser stories' detail) instead of the full structured history of the run.

## Why the browser knowledge is embedded, not a dependency

The `playwright-cli` command surface and the step-by-step screenshot-and-assert discipline live inside the browser-runner agent itself, so the workflow is self-contained and installs into any project with just the standard copy. It assumes the `playwright-cli` binary is present; it does not bundle or install it.

## Smoke test

Not yet run end to end, before or after the task-scoped-mode and antibloat changes above.

Wiring verified: `node --check` passes on the orchestration script, `node scripts/validate-workflow.mjs qa-suite-pro` passes, and every `agentType` referenced resolves to an agent definition in `.claude/agents/`. A full end-to-end run needs a real running app plus `playwright-cli` installed; it was not run inline to avoid spending tokens on a live browser fan-out. Run `/qa-suite-pro <a real UI area>` (and once with `headed`) against a served app, and separately `/qa-suite-pro <a real tasks.md> | <a task ID>` against a task `/feature-implementer` already shipped, to exercise both modes end to end and record the results here.
