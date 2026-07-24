# QA Suite Pro (computer-use / headed Chrome)

Everything `qa-suite` does for code testing, plus a **headed browser E2E** pass driven by Claude's real Chrome (computer-use / in-Chrome tools). A QA architect designs a layered code-test strategy AND derives UI user stories; the engineer writes the missing code tests and runs them; a coverage critic verifies code coverage; then each UI story is driven through a real, visible Chrome one at a time, judged by looking at the actual rendered page, with a screenshot after every step; and one report covers both.

This is the headed / computer-use variant. For a headless, parallel, CI-friendly run via `playwright-cli`, use `qa-suite-pro`.

## qa-suite-pro vs qa-suite-pro-computer-use

| | `qa-suite-pro` | `qa-suite-pro-computer-use` |
|---|---|---|
| Browser | Headless (`playwright-cli`) | Headed real Chrome (Claude computer-use / in-Chrome) |
| Parallelism | Yes - one session per story | No - single shared instance, stories run sequentially |
| Observation | element refs from `snapshot` | vision: screenshot the rendered page |
| Best for | CI, public sites, batch/parallel QA | authenticated flows, real Chrome profile/extensions, watch-it-happen runs |
| Requires | `playwright-cli` on PATH | a browser session, e.g. `claude --chrome` |

Everything else (the code-testing pipeline, the architect deriving stories, the story-author, the report) is identical - only the browser driver and its concurrency differ.

## Usage

```
/qa-suite-pro-computer-use the checkout flow
```

The command generates a timestamped `runId`, runs the workflow, writes the report to `docs/qa-reports/<slug>-qa-pro-cu.md`, and leaves the generated story YAML and per-step screenshots under `qa-runs/qa-suite-pro-computer-use-<runId>/`.

## Requirements

- A real browser session available to Claude (e.g. `claude --chrome`, or the computer-use browser tools). If none is available, the browser phase reports `blocked` instead of failing silently; the code-test half still runs.

## Pipeline

```
Scope (1 agent)
  -> Strategy (1 agent: code-test matrix + gaps AND derived UI user stories)
    -> Implement (qa-engineer) ⇄ Verify (qa-coverage-critic)   [code tests, capped 2 rounds]
      -> Author stories (1 agent: write the UI stories to YAML in the run folder)
        -> Browse (N stories, SEQUENTIAL: one headed-Chrome runner per story, single shared instance)
          -> Report (1 agent: code results + browser results in one report)
```

The browser phase only runs when the architect produced UI stories (a pure-backend target skips it). Because there is a single shared Chrome instance, stories run one after another, not in parallel - this is the key structural difference from the headless variant.

## How it maps to Bowser

The browser E2E layer ports the `builder` repo's "Bowser" QA system - specifically the `claude-bowser` / Chrome-MCP path - into a self-contained Claude Code workflow:

- **Capability** - the `qa-suite-pro-computer-use-browser-runner` agent drives a real Chrome via Claude's computer-use / in-Chrome tools (screenshot to observe, click/type/key/scroll to act), embedded directly so no external skill is needed.
- **Scale** - one runner executes one story step-by-step, screenshots every step, fails fast, returns structured pass/fail with console errors - the `bowser-qa-agent` model, single-instance.
- **Orchestration** - the workflow script runs the runners sequentially on the shared instance (Bowser notes claude-bowser is single-instance, no parallelism).
- **Stories** - the architect derives them; the story-author persists them as Bowser-format `stories:` YAML in the run folder, inspectable and re-runnable.

## Files

- `.claude/agents/*.md` - qa-suite-pro-computer-use-{scoper, architect, engineer, coverage-critic, story-author, browser-runner, reporter}, each narrow with a "what you do not do" section. Architect/engineer are distilled from `experts/qa-architect.md` and `experts/qa-engineer.md`; the browser-runner embeds the headed-Chrome computer-use how-to.
- `.claude/workflows/qa-suite-pro-computer-use.js` - the orchestration script (sequential browse).
- `.claude/commands/qa-suite-pro-computer-use.md` - the `/qa-suite-pro-computer-use <target>` entry point; it generates the `runId` timestamp the script cannot.

## Run folder layout

```
qa-runs/qa-suite-pro-computer-use-<runId>/
├── user-stories/stories.yaml     the derived UI stories (Bowser format, re-runnable)
└── screenshots/<story-slug>/     NN_<step>.png per step, the evidence trail
docs/qa-reports/<slug>-qa-pro-cu.md  the written report
```

## Smoke test

Wiring verified: `node --check` passes on the orchestration script, and every `agentType` referenced resolves to an agent definition in `.claude/agents/`. A full end-to-end run needs a real running app plus a headed Chrome session (`claude --chrome`); it was not run inline. Run `/qa-suite-pro-computer-use <a real UI area>` against a served app to exercise it end to end and record the result here.
