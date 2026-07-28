# SOLID Refactor Hunter

Hunts a codebase for real SOLID violations, redundant code, and structural design smells, then - for a small, carefully-selected set of the best findings - actually does the work: implements the fix in its own isolated git worktree and branch, verifies it with the repo's real gate commands, and pushes and opens a real PR via `gh`, justifying the change plainly in the PR body.

**This workflow takes real, consequential actions on a real repo: it pushes branches and opens live PRs, unattended.** Every other planning/review workflow in this library only writes local documents; this one mutates shared state. Read the whole README, especially "What this workflow will actually do to your repo," before running it somewhere that matters.

## Usage

```
/solid-refactor-hunter
/solid-refactor-hunter src/billing
/solid-refactor-hunter max 1
```

Defaults to scanning the whole repo and shipping up to 3 findings; pass an area/path to focus the hunt, and/or a max-findings number to change the cap.

## Pipeline

```
Recon (2 agents in parallel: srh-pr-scanner via gh, srh-scoper)
  -> scan every OPEN PR (so nothing gets re-proposed) and detect the repo's REAL gate commands
    -> Hunt (3 agents in parallel: srh-lens-solid, srh-lens-redundancy, srh-lens-structure)
       -> each hunts independently for concrete, quotable issues in its own lane
        -> Dedup & Rank (1 agent, opus: srh-dedup-ranker)
           -> drops anything already covered by an open PR or overlapping another finding,
              selects up to maxFindings non-overlapping, high-value findings
            -> per selected finding, IN PARALLEL, each in its OWN isolated worktree:
                 Refactor (srh-refactorer)  -> implement the fix, commit, do not push
                   -> Verify (srh-verifier) -> run the repo's real gate commands, real exit code
                      -> fails: fix-and-reverify loop in the SAME worktree, capped at 2 rounds
                      -> passes: Open PR (srh-pr-writer) -> push + `gh pr create`, justification first
```

## Why open-PR scanning comes before hunting, not after

The single most concrete risk this workflow's own design has to defend against is proposing a fix that's already sitting in review - a wasted worktree, a duplicate PR, and a confusing signal to whoever's triaging PRs. So `srh-pr-scanner` runs in Recon, before any hunting starts, and its output travels all the way to `srh-dedup-ranker`, which is required to check every finding against it and record what it dropped and why (`skippedDuplicates`). If the PR scan itself fails (bad `gh` auth, not a real repo), the workflow throws immediately rather than hunting and proposing duplicates anyway.

## Why three hunting lenses instead of one

A single reviewer asked to cover "SOLID, redundancy, and structural smells" at once defaults to whichever category it notices first and under-covers the rest - the same failure mode this repo's other multi-lens workflows (`code-review`, `epic-breakdown`) exist to prevent. The three lenses here are deliberately told to stay out of each other's territory (the redundancy lens explicitly does not report SOLID violations, etc.) so a real issue doesn't get triple-counted and inflate the dedup step's job.

## Why dedup-and-rank is a single opus call

Two genuinely hard judgment calls live in one place: recognizing that a finding is "the same issue" as an open PR or another lens's finding (not just superficially similar), and picking the highest-value, lowest-risk, non-overlapping subset to actually act on. This mirrors `epic-breakdown`'s `sequencing-estimator` and `gnhf-backlog-maker`'s `gbm-decomposer` - the one step in an otherwise-sonnet pipeline where getting the judgment right matters more than speed, per this repo's model-selection convention.

## Why each finding gets its own isolated worktree, and why fix rounds don't get a new one

Findings are independent and their fixes must not collide in one working tree, so each selected finding's `srh-refactorer` call runs with `isolation: 'worktree'` - the Workflow tool spins up a fresh worktree and branch for it, running in parallel with every other finding's worktree safely. But a **fix round** (after a failed verification) must edit the SAME branch the first attempt produced, not start over in a new one - so only the very first call for a finding requests `isolation: 'worktree'`; every subsequent call (the fix-round refactorer, the verifier, the PR writer) is a plain call that's told the exact worktree path and `cd`s into it. Requesting a fresh worktree on every call would silently verify and fix an empty, untouched tree instead of the real one.

## Why verification is a separate agent from the refactorer, with no verdict field

`srh-verifier` has only `Bash`, reports `{ command, exitCode, ranAtAll, outputTail }`, and is explicitly forbidden to fix, retry, or interpret - there is nowhere in its schema to put an opinion. This is the same split `feature-implementer` uses between its test-author/developer and its verifier, for the same reason: an agent grading its own refactor is exactly the failure mode this split closes off. A finding only reaches the PR-writer if the machine, not the refactorer's self-report, says the gate commands actually passed.

## Why a failed/unverifiable finding never reaches `gh pr create`

If the repo has no detectable gate commands at all, or verification still fails after the fix-round cap, the finding is marked `blocked` with the reason and the workflow moves on to the next finding - it never calls `srh-pr-writer`. Opening a PR for an unverified refactor would be worse than not attempting it: it puts unverified code in front of a human reviewer dressed up as if it had been checked.

## What this workflow will actually do to your repo

- Read `gh pr list` and repo metadata (read-only, safe).
- Read/grep/glob source files while hunting (read-only, safe).
- Create one git worktree and branch **per shipped finding** (isolated, does not touch your current working tree).
- **Commit** changes on those branches.
- **Push** those branches to `origin`.
- **Open real PRs** via `gh pr create` against the repo's detected default branch.

It never merges, force-pushes, or pushes to the default branch directly, and it never touches an existing open PR. But pushing and opening PRs are real, visible, shared-state actions - point this at a repo and a moment where that's genuinely welcome, and expect the command entry point to ask for explicit confirmation before it runs.

## Files

- `.claude/agents/srh-pr-scanner.md` - lists open PRs and the default branch via `gh`. Ground truth for dedup, nothing more.
- `.claude/agents/srh-scoper.md` - maps languages/structure and detects the repo's real gate commands.
- `.claude/agents/srh-lens-solid.md`, `srh-lens-redundancy.md`, `srh-lens-structure.md` - three independent hunting lenses, each explicitly scoped out of the others' territory.
- `.claude/agents/srh-dedup-ranker.md` - drops duplicates/overlap, selects up to `maxFindings`, sharpens each into a final justification. Runs on `opus`.
- `.claude/agents/srh-refactorer.md` - implements one finding; on a fix round, revises the same worktree against a real failure. Never pushes or opens a PR.
- `.claude/agents/srh-verifier.md` - runs the real gate commands, reports raw exit code/output only. No verdict field.
- `.claude/agents/srh-pr-writer.md` - the only agent that pushes and opens a PR, and only once verification has genuinely passed.
- `.claude/workflows/solid-refactor-hunter.js` - the orchestration script: parallel Recon, parallel Hunt, single Dedup & Rank, then per-finding parallel Refactor -> Verify (capped fix loop) -> Open PR, with `isolation: 'worktree'` used exactly once per finding.
- `.claude/commands/solid-refactor-hunter.md` - the `/solid-refactor-hunter [area] [max N]` entry point; explicitly asks the user to confirm they understand this workflow pushes and opens real PRs before calling it.

## Smoke test

Wiring verified: `node --check` passes on the orchestration script, and every `agentType` referenced resolves to an agent definition in `.claude/agents/`. A full end-to-end run needs a real repo with `gh` authenticated, real gate commands, and a genuine appetite for it to push branches and open real PRs - it was not run inline, both because that would spend tokens on a live fan-out and because it would push real branches and open real PRs as a side effect of testing. Run `/solid-refactor-hunter` against a real repo you're comfortable seeing PRs opened on, with `maxFindings` set low (e.g. 1), to exercise it end to end, and record the result here.
