---
description: Full QA of a service/area - code test strategy + missing tests + coverage, PLUS headed browser E2E driven by Claude's real Chrome (computer-use), in one report
argument-hint: <service or area to QA, e.g. "the checkout flow">
---

Run a full QA pass (code tests + headed browser E2E via Claude's real Chrome) on: $ARGUMENTS

Call the Workflow tool now, as an actual tool call (not a description of one), with:
- `scriptPath`: `.claude/workflows/qa-suite-pro-computer-use.js`
- `args`: a JSON object literal `{ "target": "$ARGUMENTS", "runId": "<timestamp>", "baseUrl": "<optional app URL>", "context": "<optional extra context>" }` (an actual object in the tool call payload, NOT a JSON-encoded string, and not omitted).
  - `runId`: generate a timestamp yourself from your own system context, formatted `YYYYMMDD-HHMMSS` (the workflow cannot generate time, so you must supply it). It names this run's folder `qa-runs/qa-suite-pro-computer-use-<runId>/`.
  - `baseUrl`: if you already know where the app serves (e.g. `http://localhost:3000`), pass it; otherwise omit and the scoper will detect or assume it.

This workflow drives a real, headed Chrome through Claude's computer-use / in-Chrome browser tools, so it needs a browser session available (e.g. `claude --chrome`). It uses a single shared browser instance and runs UI stories one at a time (no parallelism). If no browser is available the browser phase reports `blocked` rather than failing silently; the code-test half still runs. Prefer the headless `qa-suite-pro` for CI, public sites, or parallel batches; use this variant for authenticated flows and observable, watch-it-happen runs.

Do not paraphrase this into prose for a background workflow to interpret - the `args` field must be set directly on the Workflow tool call.

When it returns:
1. Derive a short kebab-case slug from the target.
2. Write the returned `report` field to `docs/qa-reports/<slug>-qa-pro-cu.md`. The run's generated story YAML and per-step screenshots already live under the returned `runDir` (`qa-runs/qa-suite-pro-computer-use-<runId>/`); point the user there for the visual evidence.
3. Summarize for the user: the overall verdict, code tests newly written and pass/fail counts, any code defects, the UI stories run and how many passed (with the failing steps for any that failed), and any gaps still open against the strategy. If code coverage was `incomplete` at the round cap, or any browser story was `blocked`, say so plainly rather than presenting the run as finished.
