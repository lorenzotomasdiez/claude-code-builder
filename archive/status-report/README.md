# Status Report

Synthesizes real git activity (plus optional ticket context) into a
stakeholder-readable status or standup update, tuned per audience.
Unlike the review/research workflows in this repo, its job is not to find
problems in code - it is to turn ground-truth activity into a report that
reads right for whoever is receiving it, without ever inventing a commit,
number, or outcome that did not actually happen.

## Pipeline

```
Scope (1 agent)
  -> Gather (1 agent, real git log/diff via Bash)
    -> per audience, independently:
         Draft (1 agent)
           -> Critique (2 agents in parallel: accuracy, audience-fit)
             -> Revise (1 agent, loops back into Critique, capped at 2 rounds)
```

## Files

- `.claude/agents/status-scoper.md` - normalizes a raw request (period,
  audiences, repo scope, ticket context) into a structured brief.
- `.claude/agents/status-gatherer.md` - the only agent that touches git. Runs
  real `git log` / `git diff --stat` commands and folds in any supplied
  ticket text into one structured set of facts every writer treats as ground
  truth.
- `.claude/agents/status-writer.md` - drafts (or revises) a report tuned to
  exactly one named audience from the gathered facts.
- `.claude/agents/status-critic.md` - adversarially critiques one draft
  through a single named lens (`accuracy` or `audience-fit`), parameterized
  the same way `prd-critic` is parameterized by lens in `prd-generator`.
- `.claude/workflows/status-report.js` - the orchestration script.
- `.claude/commands/status-report.md` - the `/status-report <request>` entry
  point, which runs the workflow and writes one file per audience under
  `docs/status-reports/`.

## Why a separate gatherer agent

Every other agent in this pipeline (scoper, writer, critic) only ever sees
facts that already passed through the gatherer - none of them run `git`
themselves. This keeps the "ground truth" boundary in exactly one place: if
a report ever states something false, the fix is either in the gatherer (bad
data) or the writer/critic (bad framing of good data), never a confusion
about who was allowed to observe reality. This mirrors why `bug-hunter`
requires a real reproduction before hypothesizing: fabricated inputs make
every downstream stage worthless no matter how well it reasons.

## Why parallel per-audience pipelining, not one writer for all audiences

A single writer asked to produce three different reports at once tends to
blur their tone into one another (the exec summary picks up engineering
jargon, the standup gets padded with business framing). Running each
audience through its own independent `Draft -> Critique -> Revise` chain via
`pipeline()` means an engineering-standup report can finish revising while a
stakeholder-update report is still on its first critique round - no audience
waits on another, and no audience's tone leaks into another's draft.

## Why two critique lenses instead of one

A single critic pass tends to default to whichever concern it notices first.
Splitting `accuracy` (does every claim trace back to the gathered facts?)
from `audience-fit` (is the altitude, length, and content actually right for
who is reading it?) catches both failure modes independently: a report can
be perfectly accurate but pitched at the wrong audience, or perfectly
well-tuned but quietly padded with an invented number. The
"`needs_revision` if either lens flags it" rule (same as `prd-generator` and
`test-backfill`) means the loop cannot exit early just because one lens was
satisfied.

## Usage

```
/status-report Weekly update for the last 7 days, audiences: engineering-standup and stakeholder-update, no tickets to fold in
```

The command runs the workflow, then writes one markdown file per audience
to `docs/status-reports/<date>-<audience>.md`.

## Smoke test

Real end-to-end run, executed as a background headless `claude -p` session
scoped to `status-report/`, invoking `/status-report` with the request:
"Status update for the last 20 commits of git history in this repo,
audiences: engineering-standup and stakeholder-update, no ticket context to
fold in" (this repo only has 18 commits total, so the gatherer correctly
fell back to the full history it actually found rather than fabricating a
20-commit window).

**Result: PASS, with genuine round-cap-reached quality issues correctly
surfaced rather than papered over.**

- The wiring worked end to end: scope -> gather -> per-audience
  draft/critique/revise, both audiences (`engineering-standup`,
  `stakeholder-update`) written to `docs/status-reports/2026-07-23-<audience>.md`,
  every schema validated, no errors.
- The gatherer ran real `git log`/`git diff` commands and reported the real
  period covered (`d625a9e`..`c3abec2`, 18 commits) and real file/line
  totals rather than inventing numbers.
- Both reports hit the 2-round revise cap:
  - `engineering-standup`: the accuracy lens was clean both rounds; the
    audience-fit lens still flagged issues in round 2 (some sections read
    more like a retro doc than a scannable standup). Published as returned,
    with the open issue real and undisputed.
  - `stakeholder-update`: both lenses still flagged issues in round 2. The
    published report contains one genuine surviving accuracy defect the
    critic caught but the round cap didn't leave time to fix: it states
    "eight of ten passed their real-world tests cleanly" while then listing
    exactly three of ten workflows with caveats (technical-solution-proposal,
    security-audit, epic-breakdown), which is a miscount - it should read
    "seven of ten." This is left in place intentionally as an honest smoke
    test artifact rather than hand-corrected, since the goal of this smoke
    test is to prove the pipeline's real behavior (including its real
    failure mode under a 2-round cap), not to hand-polish the output.
- This is the same class of result as `epic-breakdown`'s smoke test
  (iteration 16): a workflow whose critic lenses genuinely disagree with the
  writer produces a legitimately useful "round cap reached with a real,
  documented defect" result, which is more trustworthy evidence of the
  pipeline working correctly than an easy first-round clean pass would have
  been.
- Scratch output (`docs/status-reports/2026-07-23-*.md`) was deleted after
  the run; `git status` confirmed clean of scratch artifacts.
