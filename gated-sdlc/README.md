# gated-sdlc

Take one request from understanding to three commits on its own branch - frame, plan, build, test, review, document - refuting every agent claim against the repo before the next stage is allowed to believe it.

## The idea

A schema-validated `agent()` result is a **manifest of claims**, not evidence.
The schema guarantees the JSON has the right shape and nothing more: `changedFiles: ["src/auth.ts"]` validates perfectly even when that file does not exist.

Every other workflow in this library trusts that manifest.
This one refutes it.
After each phase, the claims that can be checked mechanically get checked against the repo, and a claim that fails goes back to its author with the harness's verbatim observation attached.

The flow is the Super Simple Software Factory's `adw_simple_sdlc.py` ported to the Claude Code Workflow tool, plus a framing and branching step at the front.
Its thesis, which this package keeps: **code owns sequencing, retries and acceptance; the agent owns only the work inside one bounded phase.**

## The pipeline

```
preflight (probe)        the tree must be CLEAN or the run does not start
   |
   v
frame (framer, opus)     understand the task, derive the branch name from this
   |                     repo's real branch names, verify the test command
   |--> gate             slug_shape, branch_matches_intent, no_placeholder
   v
branch (probe)           git checkout -b, after branch_free
   |
   v
plan (planner, opus)     write plan.md into the handoff dir
   |--> gate             exists, min_bytes, no_placeholder
   v
commit_plan (probe)      COMMIT 1/3 - the planner's words, about the plan
   |
   v
build (builder, sonnet)  implement plan.md
   |--> gate             counts_match, exists, in_diff
   v
test (probe) -----------> fix (builder) --+   bounded at 3
   |  ^                                   |
   |  +-----------------------------------+
   v
review (reviewer, opus)  judge the code on disk against plan.md
   |--> gate             verdict_consistent
   |
   +--> revise (builder) --> retest (probe) --> review     bounded at 2
   v
commit_build (probe)     COMMIT 2/3 - only now: green suite, approved review
   |
   v
changes (probe)          diff the whole run against its pinned baseline
   |
   v
document (documenter)    write up what the diff shows, nothing else
   |--> gate             exists, min_bytes
   v
commit_docs (probe)      COMMIT 3/3 - the write-up beside the code
   |
   v
accepted = suite green AND review approved AND no unverified claim
```

## Why it is shaped this way

### Gates come in two tiers, because the script has no filesystem

The Workflow tool is explicit: *"Scripts are plain JavaScript... No filesystem or Node.js API access."*
So a gate that needs to look at the disk cannot run in the script, and that single constraint splits the whole design:

- **Tier 0, pure gates** compare the claim against itself. `verdict_consistent`, `counts_match`, `slug_shape`, `branch_matches_intent`, `no_placeholder`. They run in the script. Zero tokens, zero latency.
- **Tier 1, world gates** compare the claim against the repo. `exists`, `non_empty`, `min_bytes`, `in_diff`, `branch_free`, `parses`, `contains`, `exits_zero`, `run`, `capture`. They are **batched into one `gated-probe` call per phase**, so ten checks cost the same as one.

A claim about five files becomes five `exists` checks rather than one, so a failure names the file, not the claim that contained it.

`verdict_consistent` is the cheapest useful gate in the package: an `approved: true` that ships blocking items, or an `approved: false` that names no problem, is a claim the harness refutes without reading a line of the diff.

### The probe is a subprocess wearing a model

In the original, running the suite is a subprocess: free, instant, impossible to persuade.
Here it is a model, and the entire `gated-probe` definition exists to get it as close to a subprocess as possible - haiku, `Bash` and `Read` only, a closed vocabulary of check kinds, and a schema that forces `observed` to carry the raw output instead of a conclusion.

The distinction that keeps this honest: **the probe never decides what to run.**
Every command is composed in the workflow script and handed over.
That is why `run` and `capture` taking a `cmd` is not a hole in the closed vocabulary - the hole would be the probe inventing a command.

If the probe starts reasoning, the determinism of the whole chain goes with it.

### Correction is a cold retry, and that is a real loss

The original re-prompts the **same live session**, so the model still has in context the work that produced the near-miss.
Inside a Workflow script there is no `SendMessage` and `agent()` always starts fresh, so a correction here is a cold retry.

What makes it work anyway is the payload: the retry prompt carries the task, the previous claim in full, and the harness's verbatim observation - not "files missing" but `src/auth.ts: no such file`.
Exactly one retry. If the second attempt does not verify either, the problem is not phrasing, so the phase dies and the run closes with `accepted: false` naming the claim that was never verified.

Because a retry costs a whole stage, only phases whose output feeds expensive downstream work are gated.

### Never `git add -A`, and the gate is what makes that possible

`adw_simple_sdlc.py` commits with `git add -A`.
That sweeps everything dirty in the tree, including your uncommitted work that has nothing to do with the run - and with a fresh branch on top, that work lands in a commit you did not write, on a branch you were not watching.

This package stages **exactly the paths a gate already verified**.
The builder declares `changedFiles`; `in_diff` confirms against git that they are really in the diff; that verified list becomes the commit's file list.
The verification stops being only a check and becomes the commit's manifest.

### A clean tree is not tidiness, it is what makes the rest safe

The run aborts if anything is uncommitted.
The payoff is larger than it looks: with the starting state empty, **every path that appears later was introduced by the run**, so the write-boundary rollback can never destroy your work and no commit can sweep it up.
The original has to carefully distinguish what the agent introduced from what was already dirty; that whole class of edge case disappears here.

### `tools:` is a capability list; `writes:` is the boundary

`Bash` runs anything, including `git checkout`, and `Write` reaches any path, so no tool list can make "this agent changes nothing" true.
The boundary is verified against git instead: one `fingerprint` per phase, compared to the previous one in plain JS.

Comparing **changesets** rather than watching writes is what catches a reversion - a path that was dirty before and is clean now was reverted, and reverting is modifying. No write interceptor sees that.

A breach is **not** a gate violation: the write already happened and no re-prompt undoes it, so the phase dies and every path is named.

### Acceptance is a separate question from phase success

A phase that ran the suite and saw it red **did its job**: the phase succeeds while the run must not.
Collapsing the two is how a partial run disguises itself as a complete one, so the return value carries `accepted` plus the evidence the verdict rests on.

### Deliberate deviations from this repo's template

Two, both recorded rather than hidden:

1. **One reviewer, not a panel of lenses.** `CLAUDE.md` prefers independent lenses over a single rubber-stamp reviewer, and that preference is right in general. Here fidelity to the original flow won. What softens it is that the single reviewer cannot rubber-stamp unnoticed: `verdict_consistent` mechanically refutes a self-contradicting verdict.
2. **No `parallel()` fan-out.** The chain is loop-shaped, not fan-out-shaped: two bounded repair loops rather than concurrent lenses. The control flow is real, but it is sequential by nature of the SDLC it models.

One more worth naming: `gated-documenter` is distilled from `experts/software-developer.md` because the knowledge base has no `technical-writer.md`. A dedicated expert file would be the cleaner home for that role.

## The files

| File | What it is |
|---|---|
| `DESIGN.md` | The contract every agent and the script were written against. Read this first when changing anything. |
| `.claude/workflows/gated-sdlc.js` | The orchestration: schemas, gates, the probe helper, the write boundary, the chain, the acceptance verdict. |
| `.claude/commands/gated-sdlc.md` | The `/gated-sdlc` entry point, including what the workflow does to your repo. |
| `.claude/agents/gated-framer.md` | Understands the task and names the branch from this repo's real conventions. Plans nothing. |
| `.claude/agents/gated-planner.md` | Writes `plan.md`. Has `Write` but no `Edit` and no `Bash`. |
| `.claude/agents/gated-builder.md` | The only agent that writes production code. Called in three modes: build, fix, revise. |
| `.claude/agents/gated-reviewer.md` | Judges the code on disk against `plan.md`. Fixes nothing. |
| `.claude/agents/gated-documenter.md` | Writes up what the captured diff shows, and only that. |
| `.claude/agents/gated-probe.md` | The `kind="code"` substitute. Runs given commands, reports exit codes and raw output. |

## Usage

```
/gated-sdlc add a --dry-run flag to the export command
```

The working tree must be clean.
The run creates a branch, makes up to three commits on it, and **leaves you standing on that branch** whether it succeeded or not.

Calling the workflow directly:

```
Workflow({ scriptPath: '.claude/workflows/gated-sdlc.js',
           args: { request: 'add a --dry-run flag to the export command', runId: 'a1b2c3' } })
```

`runId` names the handoff directory under `.claude/runs/<runId>/handoff/`, which is where agents write files for the agents that follow.
It is the only memory that survives between phases: there is no session resume between `agent()` calls, so every agent starts cold and a file on disk is all it inherits.

## Cost

Roughly, for a run with no repair loops: 2 opus calls (frame, plan), 1 opus call (review), 2 sonnet calls (build, document), and 10-14 haiku probe calls.
Each repair loop adds one sonnet call plus one haiku probe.
The gates themselves are the cheap part: tier 0 is free, and tier 1 is batched to one call per phase.

## Smoke test

**Not yet run.**

The package is complete and passes the repo's anatomy validator (`node scripts/validate-workflow.mjs gated-sdlc`), but it has not been executed end to end, so the command -> workflow -> agents wiring is unproven and no schema has been validated against a real agent response.

The smoke test this needs, per `CLAUDE.md`:

- One real invocation, on this repo, with a minimal but genuine request.
- A clean tree at the start, since the run refuses to begin otherwise.
- The three commits live, on a disposable branch, so the path being proven is the path that will actually be used.
- Result recorded here: the input used, which phases ran, whether every schema validated, and an honest pass/fail.

Until that has happened, treat this package as unproven. Known unknowns that only a real run can settle:

- Whether `gated-probe` holds the line on `observed` carrying raw output rather than a summary. This is the assumption the whole design rests on.
- Whether the `fingerprint` parsing survives real `git diff --numstat` output for renames and binary files, where numstat prints `-` instead of counts.
- Whether the framer's `conventionEvidence` gate is strict enough to actually reject an invented convention.
