# QA Suite Pro (headless browser)

Everything `qa-suite` does for code testing, plus a real **headless browser E2E** pass. A QA architect designs a layered code-test strategy AND derives UI user stories; the engineer writes the missing code tests and runs them; a coverage critic verifies code coverage; then each UI story is driven through a real headless browser (`playwright-cli`) with a screenshot after every step; and one report covers both.

This is the headless variant. For a headed run driven by Claude's real Chrome (authenticated sites, observable automation), use `qa-suite-pro-computer-use`.

## Usage

```
/qa-suite-pro the checkout flow
```

The command generates a timestamped `runId`, runs the workflow, writes the report to `docs/qa-reports/<slug>-qa-pro.md`, and leaves the generated story YAML and per-step screenshots under `qa-runs/qa-suite-pro-<runId>/`.

## Requirements

- `playwright-cli` installed and on PATH (the browser capability). If it is missing, the browser phase reports `blocked` instead of failing silently; the code-test half still runs.

## Pipeline

```
Scope (1 agent)
  -> Strategy (1 agent: code-test matrix + gaps AND derived UI user stories)
    -> Implement (qa-engineer) ⇄ Verify (qa-coverage-critic)   [code tests, capped 2 rounds]
      -> Author stories (1 agent: write the UI stories to YAML in the run folder)
        -> Browse (N agents in parallel: one headless browser runner per UI story)
          -> Report (1 agent: code results + browser results in one report)
```

The browser phase only runs when the architect produced UI stories (a pure-backend target skips it).

## How it maps to Bowser

The browser E2E layer is a port of the `builder` repo's "Bowser" QA system into a self-contained Claude Code workflow:

- **Capability** - the `qa-suite-pro-browser-runner` agent embeds the `playwright-cli` command surface (named persistent sessions, `snapshot` + ref-based `click`/`fill`, per-step `screenshot`, `console` for JS errors) directly, so no external skill is needed. It assumes `playwright-cli` is installed.
- **Scale** - one browser runner executes one story step-by-step, screenshots every step, fails fast, and returns a structured pass/fail with console errors - the `bowser-qa-agent` model.
- **Orchestration** - the workflow script fans out one runner per story in parallel (isolated sessions), the `/ui-review` fan-out expressed as a `parallel()` stage.
- **Stories** - the architect derives them from the app, docs, and routes; the story-author persists them as Bowser-format `stories:` YAML in the run folder, so they are inspectable and re-runnable.

## Files

- `.claude/agents/*.md` - qa-suite-pro-{scoper, architect, engineer, coverage-critic, story-author, browser-runner, reporter}, each narrow with a "what you do not do" section. Architect/engineer are distilled from `experts/qa-architect.md` and `experts/qa-engineer.md`; the browser-runner embeds the Bowser/playwright-cli how-to.
- `.claude/workflows/qa-suite-pro.js` - the orchestration script.
- `.claude/commands/qa-suite-pro.md` - the `/qa-suite-pro <target>` entry point; it generates the `runId` timestamp the script cannot.

## Run folder layout

```
qa-runs/qa-suite-pro-<runId>/
├── user-stories/stories.yaml     the derived UI stories (Bowser format, re-runnable)
└── screenshots/<story-slug>/     NN_<step>.png per step, the evidence trail
docs/qa-reports/<slug>-qa-pro.md  the written report
```

## Why the browser knowledge is embedded, not a dependency

The `playwright-cli` command surface and the step-by-step screenshot-and-assert discipline live inside the browser-runner agent itself, so the workflow is self-contained and installs into any project with just the standard copy. It assumes the `playwright-cli` binary is present; it does not bundle or install it.

## Smoke test

Wiring verified: `node --check` passes on the orchestration script, and every `agentType` referenced resolves to an agent definition in `.claude/agents/`. A full end-to-end run needs a real running app plus `playwright-cli` installed; it was not run inline to avoid spending tokens on a live browser fan-out. Run `/qa-suite-pro <a real UI area>` against a served app to exercise it end to end and record the result here.
