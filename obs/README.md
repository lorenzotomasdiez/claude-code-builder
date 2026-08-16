# obs

A read-only viewer for Claude Code workflow runs.
Every run this machine has ever executed, live ones included, with each agent's phase, model, token cost, and the verbatim result of every gate check it ran.

```
node obs/server.mjs        # http://localhost:4610
```

No install, no build step, no `node_modules`, no configuration.

This is not a workflow package, so it has no `.claude/` directory and `scripts/validate-workflow.mjs` correctly ignores it.
It is a tool for looking at the other packages.

## What it is for

A workflow that fans out across twenty agents produces a great deal of evidence and almost no way to look at it.
The terminal shows a progress tree while it runs and then scrolls away.
The transcripts hold everything, but reading a run means knowing that `journal.jsonl` exists, which of six file shapes to open, and how to correlate an opaque `agentId` across three of them.

Every real defect fixed in `gated-sdlc` was found by doing that by hand.
This is the same reading, done once, properly.

## The two sources, and why the difference matters

Everything shown here is read off disk from files the harness already writes.
Nothing is invented, nothing is inferred where the file does not say it, and no workflow had to be changed to cooperate.
A viewer that needed workflows to emit events for it would be a second thing to keep in sync, and the first workflow that forgot would render as a blank page instead of an honest gap.

**`<project>/<session>/workflows/wf_<id>.json`** is the complete record: `workflowName`, the args, the return value, every `log()` line, the phase list, and one entry per agent carrying its phase, model, tokens, duration, attempt number, and a preview of both its prompt and its result.

It is written **once, when the run ends**.
That is measured, not assumed - across five runs the file's mtime landed within one second of `startTime + durationMs` every time.
So it is worth everything after the fact and nothing during.

**`<project>/<session>/subagents/workflows/wf_<id>/journal.jsonl`** is appended live, as agents start and return.
It carries the `agentId` and the full result payload - which for a probe *is* the gate result, one row per check with its exit status and verbatim output - but no phase and no label.

So a live view is genuinely coarser than a finished one, and the page says so rather than papering over it.
Agent type, model, and every gate check are real while the run is going.
The grouping into phases is not available until it ends.

### Live, finished, and abandoned

A run is **live** when its journal exists, no record has been written beside it, and the journal was touched within the last ten minutes.

The third condition was learned by running this.
The first scan reported two live runs, which turned out to be genuinely in flight - but the logic without a staleness window would have called every interrupted run live forever.
A session that is killed or closed leaves its journal behind and never writes a record, so "no record" means "did not finish", which is not the same as "still going".
Those show as **abandoned**, which is worth surfacing: an abandoned run is a run whose result nobody ever saw.

The ten-minute window is deliberately generous. The longest gap between agent results in a real `gated-sdlc` run was an opus reviewer reading twenty-one files, and a viewer that flips a running job to "abandoned" because a model was thinking is worse than one that takes a few extra minutes to notice a dead one.

## What it shows

- **Every run on the machine**, live first then newest, filterable by workflow.
- **Per run**: the request, the verdict and its reason, duration, total tokens, tool calls, and a count of failed checks.
- **Every refuted claim, together and first.** For a gated workflow this is the part that matters, so it is hoisted above the phase list rather than buried inside whichever agent produced it.
- **Phases**, each with the agents that ran inside it. Phases that ran no agent are shown dimmed rather than hidden - an empty phase is information.
- **Per agent**: label, model, attempt number, tokens, duration, and on click the full check table with verbatim output, plus the prompt it was given.
- **Commits, paths left uncommitted, and the run's own log.**

Gate checks come from the journal rather than the record's `resultPreview`, because that preview is truncated, and a truncated gate result is a gate result nobody can check.

## Polling

A finished run is immutable, so it is fetched once and never again.
Only the run list and a currently-live run are polled, every four seconds.
Redrawing everything on a timer would throw away scroll position and open panels for nothing.

## Configuration

| variable | default | |
|---|---|---|
| `PORT` | `4610` | |
| `CLAUDE_PROJECTS` | `~/.claude/projects` | where to read runs from |

## Verified

Run against the real transcript store on this machine: **195 runs across 49 distinct workflows**, of which 5 are `gated-sdlc`.

- A completed run (`wf_baf3c5d2-f0c`, `gated-sdlc` run 5) renders 9 phases, 19 agents, 91 gate checks, 8 log lines and 3 commits, with 0 failures.
- A failed run (`wf_f49086ba-35c`, run 2) surfaces its 4 refuted claims, including the `declared file exists: src/slices/search/merge.ts` failure that actually killed it.
- A declined run (`wf_e8b9669b-766`, run 4) correctly shows 0 failed checks alongside the reviewer's blocking reason - the distinction between "a gate caught something" and "the reviewer did" survives intact.
- The live view was verified against a `gated-sdlc` run genuinely in flight in another repo, with `gated-builder` mid-execution.

## Known limits

**Pure gates are invisible.** Checks that `gated-sdlc` resolves in-script - `slug_shape`, `branch_matches_intent`, `counts_match`, `shell_safe` - never reach an agent, so they leave no trace in any transcript. `result.gates` records only the checks that went through a probe, plus violations when they fail. A passing pure gate is therefore unobservable here. That is a gap in the workflow's own logging, not in this viewer, and it is the one thing that would need a workflow change to fix.

**No phases while live.** Stated above; it is a property of when the harness writes its record, not something this can work around.

**Project names are lossy.** A project directory is the repo path with slashes flattened to dashes, so `my-rag` and `my/rag` flatten identically. The label is for recognition, not for resolution.
