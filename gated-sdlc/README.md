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
args                     request + runId + testCommand (the OPERATOR's, not an
   |                     agent's - see "The test command is not an agent's job")
   v
preflight (probe)        the tree must be CLEAN or the run does not start
   |
   v
frame (framer, opus)     understand the task, derive the branch name from this
   |                     repo's real branch names
   |--> gate             slug_shape, branch_matches_intent, no_placeholder
   v
branch (probe)           git checkout -b, after branch_free
   |
   v
plan (planner, opus)     write specs/<slug>-plan.md, return it as planPath
   |--> gate             exists, min_bytes, no_placeholder
   v
commit_plan (probe)      COMMIT 1/3 - the planner's words, about the plan
   |
   v
build (builder, sonnet)  implement plan.md
   |--> gate             counts_match, shell_safe, in_diff (never exists:
   |                     a deletion is a change and does not exist),
   v                     docs_not_yours (the write-up is the documenter's)
test (probe) -----------> fix (builder) --+   bounded at 3
   |  ^                  reads the log     |   output redirected to a file;
   |  +-----------------------------------+    the probe reports the exit code
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
   |--> gate             in_diff (the write-up must be a PENDING change,
   |                     not merely a file that exists), min_bytes
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

- **Tier 0, pure gates** compare the claim against itself. `verdict_consistent`, `counts_match`, `slug_shape`, `branch_matches_intent`, `no_placeholder`, `shell_safe`, `docs_not_yours`. They run in the script. Zero tokens, zero latency.
- **Tier 1, world gates** compare the claim against the repo. Eleven of them: `exists`, `non_empty`, `min_bytes`, `in_diff`, `branch_free`, `parses`, `contains`, `exits_zero`, `fingerprint`, `run`, `capture`. They are **batched into one `gated-probe` call per phase**, so ten checks cost the same as one - and the working-tree capture the write boundary needs rides along in that same batch rather than taking a second call.

A claim about five files becomes five checks rather than one, so a failure names the file, not the claim that contained it.

Picking the right check matters as much as running it. `exists` and `in_diff` look interchangeable on a changed file and are not. Only `in_diff` can describe a deletion, so asking `exists` refutes a true claim about a moved file - run 2. And only `in_diff` can tell a pending change from a file that is merely present, so asking `exists` accepts a write-up that was already committed and leaves the next commit with an empty index - run 6. The two failures are the same mistake in opposite directions: `exists` answers for the disk, `in_diff` answers for the repo.

`verdict_consistent` is the cheapest useful gate in the package: an `approved: true` that ships blocking items, or an `approved: false` that names no problem, is a claim the harness refutes without reading a line of the diff.

### The probe is a subprocess wearing a model

In the original, running the suite is a subprocess: free, instant, impossible to persuade.
Here it is a model, and the entire `gated-probe` definition exists to get it as close to a subprocess as possible - haiku, `Bash` and `Read` only, a closed vocabulary of check kinds, and a schema that forces `observed` to carry the raw output instead of a conclusion.

The distinction that keeps this honest: **the probe never decides what to run.**
Every command is composed in the workflow script and handed over.
That is why `run` and `capture` taking a `cmd` is not a hole in the closed vocabulary - the hole would be the probe inventing a command.

If the probe starts reasoning, the determinism of the whole chain goes with it.

Two consequences follow, and both are load-bearing:

**`observed` is not raw output.** The probe appends `EXIT:<code>` to everything it reports, by its own definition, so the exit code lands in text it already has. Read as data, that footer corrupts whatever consumed it: a captured sha becomes `abc123\nEXIT:0`, which is not a rev any later command accepts, and an `EXIT:0` line parsed out of the untracked section makes a clean tree look dirty and aborts every run at preflight. Everything read as data goes through `stripExit()` first.

**Bulk output never travels through the probe.** It transcribes into a JSON string and is permitted to truncate. Asking it to relay a few thousand lines of test log is asking a small model to be a pipe: what reaches the builder is whatever survived retyping, and the run pays output tokens to re-emit a log that already exists on disk. So the suite runs redirected to `<handoff>/test-N.log`, the probe reports one exit code, and the builder opens the real bytes with `Read`. The system this ports does the same thing - it writes `command.log` and hands over a bounded tail.

The redirect wraps the command in a subshell, and that is not cosmetic. `a && b > log` redirects only `b`, because redirection binds to the simple command it sits on rather than to the list. Real test commands are routinely compound - `make backend-test && npm test` - and the naive form captures the second half only, so a builder in fix mode reads a log missing exactly the failures it was sent to repair. `( ... ) > log 2>&1` makes the list one unit while leaving its exit status alone.

The general rule: **the probe's transcription surface is the determinism budget.** Spend it on exit codes.

### Correction is a cold retry, and that is a real loss

The original re-prompts the **same live session**, so the model still has in context the work that produced the near-miss.
Inside a Workflow script there is no `SendMessage` and `agent()` always starts fresh, so a correction here is a cold retry.

What makes it work anyway is the payload: the retry prompt carries the task, the previous claim in full, and the harness's verbatim observation - not "files missing" but `src/auth.ts: no such file`.
Exactly one retry. If the second attempt does not verify either, the problem is not phrasing, so the phase dies and the run closes with `accepted: false` naming the claim that was never verified.

Because a retry costs a whole stage, only phases whose output feeds expensive downstream work are gated.

### Nothing that needs escaping ever reaches a command line

The probe reports faithfully and retypes badly. Run 1 proved both in the same call: it returned honest raw output for every check, and it executed `'...section'\\''s text'` where the script had written `'...section'\''s text'` - one backslash doubled, one unterminated quote, one lost commit.

`shq()` was not wrong. A correct escape does not help when a model is the wire. So the invariant became: **never emit a string that needs escaping.** `shq()` throws on a quote, backslash, newline, backtick, dollar or control character; the `shell_safe` gate refuses such a value one layer earlier, with the phase named; and free-form text - commit messages, which routinely hold an apostrophe - is written to a file by the agent that owns it and read by `git commit -F`.

Same lesson as the test log, from the other direction. The probe is good at saying what a command *did* and bad at reproducing what a command *says*. Only ask it for the first.

### Never `git add -A`, and the gate is what makes that possible

`adw_simple_sdlc.py` commits with `git add -A`.
That sweeps everything dirty in the tree, including your uncommitted work that has nothing to do with the run - and with a fresh branch on top, that work lands in a commit you did not write, on a branch you were not watching.

This package stages **exactly the paths a gate already verified**.
The builder declares `changedFiles`; `in_diff` confirms against git that they are really in the diff; that verified list becomes the commit's file list.
The verification stops being only a check and becomes the commit's manifest.

**The set has to accumulate, and forgetting that is how run 1 nearly shipped a broken commit.** `build` is reassigned by every `fix_N` and `revise_N`, so staging the last call's `changedFiles` stages only the last repair - 3 files of a 20-file change, with `package.json` and all of `src/` left behind, reported as a success. The workflow now unions every declaration, re-verifies the whole set with `in_diff` immediately before staging, and drops anything under `.claude/runs/` so the run's own scratch notes stay out of the history.

`git add -A` does not have this failure mode, which is worth saying plainly: this is a bug the improvement introduced. The improvement is still right - it is what keeps your unrelated dirty file out of a commit you did not write - but only with the accumulation.

### The run's own scratch must not dirty the next run

The handoff dir under `.claude/runs/<runId>/` outlives the run, and untracked files are a dirty tree, so without care the first run makes every later run abort at preflight on the leftovers of the previous one.

Preflight adds `.claude/runs/` to `.git/info/exclude`, not to `.gitignore`. `.gitignore` belongs to the target repo and a workflow has no business editing it; `.git/info/exclude` is local, does the same job, and is exactly what gnhf does with its own run metadata for the same reason.

The commit path filters those paths out separately, because an agent can still *declare* one - run 1's builder listed its own working notes in `changedFiles` and staged them into the code commit.

### A clean tree is not tidiness, it is what makes the rest safe

The run aborts if anything is uncommitted.
The payoff is larger than it looks: with the starting state empty, **every path that appears later was introduced by the run**, so the write-boundary rollback can never destroy your work and no commit can sweep it up.
The original has to carefully distinguish what the agent introduced from what was already dirty; that whole class of edge case disappears here.

### `tools:` is a capability list; the boundary is two layers

`Bash` runs anything, including `git checkout`, and `Write` reaches any path, so no tool list can make "this agent changes nothing" true.

**Layer 1, prevention.** `.claude/hooks/gated-write-boundary.mjs`, wired as a `PreToolUse` hook in the target repo. Exit 2 blocks the write before it lands. Deterministic shell, zero tokens, no model in the path - this is the `kind="code"` phase the Workflow script itself cannot have. It only has an opinion when the caller's `agent_type` starts with `gated-`; any other caller in that repo gets exit 0, because installing this package must not change what the repo's normal work is allowed to do.

**Layer 2, detection.** `settle()` in the script captures the working-tree changeset before and after each phase, compares them in plain JS, and rolls back anything out of bounds.

**Both are kept, deliberately.** The hook does nothing if it is not installed, or if `agent_type` turns out not to be populated for subagents spawned inside a Workflow run - and a hook that looks armed while enforcing nothing is a documented failure mode, not a hypothetical one (see `scripts/hook-selftest.mjs` at the repo root for two real precedents). `settle()` cannot prevent anything, but it costs nothing extra now that the tree capture rides along in the phase's gate batch. Until a real run proves the hook fires in this context, layer 2 is the one holding the line.

Comparing **changesets** rather than watching writes also catches what no interceptor can: a path that was dirty before and is clean now was reverted, and reverting is modifying.

A breach caught by layer 2 is **not** a gate violation: the write already happened and no re-prompt undoes it, so the phase dies and every path is named.

**`PROTECTED` is tested before the allow list, and that order is the rule.** An allow list is a widening; a protected path is a floor. Evaluate the widening first and the floor becomes a suggestion - the documenter's `**/*.md` matches `.claude/agents/gated-probe.md` exactly, which would have let it rewrite the agents that judge it. The table is written twice (the hook has a filesystem, the script does not), so `.claude/hooks/boundary-selftest.mjs` extracts `WRITES`, `PROTECTED` and `matches()` from both files and fails if they ever differ.

### The test command is not an agent's job

It comes from `args`, given by the operator. No agent finds it, verifies it, or supplies one when it is missing.

An agent that locates `npm test` has proven a command exists, not that it tests anything. A repo whose `test` script is `echo "no tests" && exit 0` exits zero forever, and every phase downstream reads that as a green suite: the run commits and returns `accepted: true` having verified nothing. That is the exact failure this package exists to prevent, arriving through the one door it had left open.

`adw_simple_sdlc.py` refuses to guess for the same reason. Its test block ships as a placeholder that exits 0 and *announces it is fake*, on the stated principle that a wrong-but-plausible command which silently passes is worse than one that says so out loud.

It closes a second hole at the same time: a test command is a command line by nature, so it cannot be `shq()`-quoted, which made it the only agent-authored string in the package that reached the shell raw.

### A run with no test command does not get accepted

If no `testCommand` is given, the run keeps going but `accepted` is `false`, the code is never committed, and the reason says so plainly.

That is deliberate and it follows from everything above. Nothing in a suiteless run proved the code runs, and treating "there was nothing to check" as "it checked out" is the exact failure this package exists to prevent.
You still get the plan committed, the code sitting in the working tree, and the branch to inspect it on.

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
| `.claude/workflows/gated-sdlc.js` | The orchestration: schemas, gates, the probe helper, the write boundary's detection layer, the chain, the acceptance verdict. |
| `.claude/commands/gated-sdlc.md` | The `/gated-sdlc` entry point, including confirming the test command and what the workflow does to your repo. |
| `.claude/hooks/gated-write-boundary.mjs` | The write boundary's prevention layer: a `PreToolUse` hook that blocks an out-of-bounds write with exit 2. Needs wiring into the target repo's `settings.json`. |
| `.claude/hooks/boundary-selftest.mjs` | Asserts the hook's exit codes and that its boundary table is identical to the script's. Run it after touching either. |
| `.claude/hooks/logic-selftest.mjs` | Exercises the script's pure logic - the changed-file union, the shell-safety refusal, the `EXIT:` stripping - against functions extracted from the real source. Run it after touching the workflow. |
| `.claude/agents/gated-framer.md` | Understands the task and names the branch from this repo's real conventions. Plans nothing, and does not choose the test command. |
| `.claude/agents/gated-planner.md` | Writes the plan to `specs/<slug>-plan.md` and returns it as `planPath`. Has `Write` but no `Edit` and no `Bash`. |
| `.claude/agents/gated-builder.md` | The only agent that writes production code. Called in three modes: build, fix, revise. |
| `.claude/agents/gated-reviewer.md` | Judges the code on disk against `plan.md`. Fixes nothing. |
| `.claude/agents/gated-documenter.md` | Writes up what the captured diff shows, and only that. |
| `.claude/agents/gated-probe.md` | The `kind="code"` substitute. Runs given commands, reports exit codes and raw output. |

## Install

Copying `.claude/` into the target repo gets you the workflow, the command, and the agents. The hook needs one more step, because a hook only exists if `settings.json` names it:

```jsonc
// <target repo>/.claude/settings.json
{
  "hooks": {
    "PreToolUse": [
      { "matcher": "Write|Edit|NotebookEdit",
        "hooks": [{ "type": "command",
                    "command": "node .claude/hooks/gated-write-boundary.mjs" }] }
    ]
  }
}
```

Then prove it is armed, because a hook that is present and inert looks exactly like one that works:

```
node .claude/hooks/boundary-selftest.mjs
```

Skipping this is survivable: the workflow's `settle()` still catches an out-of-bounds write after the fact and rolls it back. You lose prevention, not detection.

## Usage

```
/gated-sdlc add a --dry-run flag to the export command
```

The working tree must be clean.
The command confirms the test command with you before it starts, then the run creates a branch, makes up to three commits on it, and **leaves you standing on that branch** whether it succeeded or not.

Calling the workflow directly:

```
Workflow({ scriptPath: '.claude/workflows/gated-sdlc.js',
           args: { request: 'add a --dry-run flag to the export command',
                   runId: 'a1b2c3',
                   testCommand: 'npm test' } })
```

`testCommand` is what "verified" means for this run. Omit it and the run still executes, but nothing proves the code works, so the code is not committed and the verdict is `accepted: false`.

`runId` names the handoff directory under `.claude/runs/<runId>/handoff/`, which is where agents write files for the agents that follow, and where the suite's logs and the captured diff land.
It is the only memory that survives between phases: there is no session resume between `agent()` calls, so every agent starts cold and a file on disk is all it inherits.

## Cost

Roughly, for a run with no repair loops: 3 opus calls (frame, plan, review), 2 sonnet calls (build, document), and 8-11 haiku probe calls.
Each repair loop adds one sonnet call plus one haiku probe.

The gates are the cheap part: tier 0 is free, tier 1 is batched to one call per phase, and the write boundary's observation rides inside that same batch instead of doubling the probe count.
Redirecting the suite's output to a file also keeps a large test log out of the probe's output tokens entirely.

## Smoke test

**PASSED, with fixes landed since that are not re-verified.** Six real runs on record, in `my-rag`. Runs 3 and 5 completed; runs 1, 2, 4 and 6 each exposed a defect, and all six are kept below, because what the failures exposed is why the passes work. The most recent run is the one to read first.

### Run 6: NOT ACCEPTED - every check green, and the run still died

`my-rag`, 2026-08-14, Phase 4 of that repo's `PRD.md` - the eval question set, `rag eval`, and config-driven retrieval knobs. `runId: ph4k7dq`, `testCommand: bun test`, branch `feat/phase-4-sharpening`.

The suite went green on the first attempt, the reviewer approved 34 of 34 requirements, two commits landed, and the run still ended `accepted: false` - with **not one failed check anywhere in the run** until the very last command.

```
commit_plan   305ec1a  COMMIT 1/3    ok
commit_build  210f75d  COMMIT 2/3    ok, 14 files
commit_docs            COMMIT 3/3    git commit -> "nothing to commit,
                                     working tree clean"  EXIT:1
```

**The plan asked the builder for the write-up.** `specs/phase-4-sharpening-plan.md:98` listed `docs/phase-4-sharpening.md` among the files to produce, and requirement R-34 made its existence a checkable criterion. So the builder wrote it, declared it among its 14 changed files - truthfully - and `commit_build` took it. The documenter then read the diff, found its own deliverable already written, verified it against the code hunks, and correctly wrote nothing. Its mtime proves it: the file stayed at `01:55`, the builder's write, while the documenter's message file is stamped `02:03`.

Everything was green because **every claim was true**. The write-up did exist. It was 6811 bytes, not a stub. The builder's declared files were all genuinely in the diff. The defect was a question nobody asked.

The sharpest detail is that the evidence was already in the failing gate's own probe batch:

```
probe:gate:document
  [ok] the working tree            ---UNTRACKED---      <- a completely clean tree
  [ok] the write-up is on disk     6811 bytes
  [ok] the write-up is not a stub  6811 > 400
```

The tree row rides along in every gate for the write boundary. It was read, reported correctly, and no check consulted it for this question.

A second defect fell out of the same run: the report claimed **14 paths left uncommitted**, and all 14 were in `210f75d` with a clean tree. `uncommitted` listed everything declared whenever `accepted` was false, on the assumption that a run which did not finish did not commit - which breaks the moment a run gets past commit 2 and dies later. A reader would have concluded the run lost a day of work; it lost a commit whose contents were already committed.

Four fixes, none of them using the write boundary:

1. **`docs_not_yours`**, a pure check refuting any `docs/` path in the builder's `changedFiles`. Deliberately a check and not a boundary entry: a breach is fatal with no retry, and this builder was obeying its plan. A refutation hands back the observation and calls it again.
2. **`in_diff` replaces `exists`** on `documentPath` - the same lesson run 2 taught in the build phase, arrived at from the opposite side.
3. **The planner is told the write-up is not the builder's to produce**, with the failure that taught it.
4. **`uncommitted` subtracts what actually landed**, computed from the confirmed commit records.

Covered by 18 new assertions in `.claude/hooks/logic-selftest.mjs`, all four mutation-checked. The first attempt at the `uncommitted` assertions was itself rewritten: under mutation it crashed inside the extractor instead of failing by name, and a test has to fail legibly to be worth having.

**None of these four is verified by a real run.**

### Run 5: PASSED - the same Phase 3 the previous run declined

`my-rag`, 2026-08-14, Phase 3 of that repo's `PRD.md` - the `rag add` / `rag sources` / `rag remember` ingestion slices, plus a pure incremental reindex planner. `testCommand: bun test`, branch `feat/phase-3-ingestion`.

Same input as run 4, on a branch reset back to `master` first, with two fixes in between: `MAX_REVISION_LOOPS` raised to 3, and `probe()` taking its phase from the caller.

```
0b1e538  Add plan for Phase 3 ingestion slices and a provable       COMMIT 1/3
         incremental reindex
d86e7fd  Add rag add, rag sources, and rag remember ingestion       COMMIT 2/3
         slices with a pure incremental reindex planner
0ce1490  Document Phase 3 ingestion slices and the pure reindex     COMMIT 3/3
         planner
```

19 agent calls, zero failed checks across 14 probes. Verified independently of the run's own report: the tree is clean, and `bun test` passes at 140 tests across 15 files, up from 51.

**The finding that blocked run 4 did not recur.** `src/slices/ingest/index.ts:139` lets an empty content-type fall through to the refusal branch, reported as `"unknown"` and citing the non-goal - no `|| contentType === ""` this time - and the reviewer approved all 39 plan requirements on the first pass.

What this run does and does not verify, stated separately because they are different claims:

- **The per-phase probe fix: confirmed**, by direct observation of the progress tree during the run. Preflight, Branch and Test rendered populated rather than as empty boxes. This is the only evidence that can exist for it - `phase` is not recorded in the journal or in any agent transcript, so it cannot be checked from disk after the fact.
- **The model split: exercised.** Of 14 probes, 9 ran on sonnet (the calls that produce a fingerprint the script parses) and 5 on haiku (the calls read only for an exit code). No transcription failure.
- **The revision budget: NOT verified.** The reviewer was called exactly once and approved. Raising the cap is confirmed to have broken nothing, which is not the same as confirming it helps. `revise_2` and `review_3` remain unexecuted.

One gap worth naming, found by reading the code rather than the report: run 4's reviewer asked for a test asserting that a 200 with no content-type header is refused. The behaviour is correct now, but no test covers it. The test helper supports omitting the header (`ingest.test.ts:28`) and none of the 11 tests takes that branch. Not a blocker, and this run's reviewer had no reason to raise it, since the code was already right - noted because it is the exact case that cost a whole run.

### Run 3: PASSED

`my-rag`, 2026-08-13, Phase 2 of that repo's `PRD.md` - the `rag ask` agent slice. `runId: p2ask7q`, `testCommand: bun test`, branch `feat/phase-2-agent-ask`.

Three commits landed, the working tree came back clean, and 21 agent calls produced zero failed checks:

```
00076a1  Add plan for Phase 2 rag ask agent slice                 COMMIT 1/3
8bf8e2c  Add rag ask agent slice with search_knowledge and        COMMIT 2/3
         read_document tools, streaming, and citations             18 paths
f8f2264  Document the Phase 2 rag ask agent slice                 COMMIT 3/3
```

Verified independently of the run's own report: `bun test` passes at 51 tests across 7 files (26 before the change), the working tree is clean so nothing the run produced was left behind, and `docs/phase-2-agent-ask.md` describes the change the diff actually contains, including the kernel move.

Exercised for the first time:

- **The whole chain to completion.** The diff capture, the documenter and the third commit had never executed in any prior attempt.
- **The `exists` fix, on the exact case that killed run 2.** The builder moved `src/slices/search/merge.ts` into `src/kernel/retrieve.ts`; git recorded it as a rename in commit 2, so the deletion was staged rather than refuting a true claim.
- **The cold-retry correction, driven by a pure gate.** The framer's first attempt returned `slug: "rag-ask-agent-slice"` alongside `branchName: "feat/phase-2-agent-ask"` - a branch name not containing its own slug. `branch_matches_intent` refuted it in-script at zero token cost, and the retry returned a consistent pair.
- **The suite redirect.** `test-1.log` holds the real `bun test` output; the probe reported only the exit code.

Not exercised: the fix loop (the suite was green first try), the revision loop (the review approved 30/30 first try), and therefore the accumulated change set across more than one builder call - the union check ran, but over a single declaration of 18 paths.

### Run 4: NOT ACCEPTED - the reviewer was right and the budget was wrong

`my-rag`, 2026-08-14, Phase 3 of that repo's `PRD.md` - the `rag add` / `rag sources` / `rag remember` ingestion slices. `runId: p3k7fq2`, `testCommand: bun test`, branch `feat/phase-3-ingestion`.

This one did not fail. It declined, correctly, and the distinction matters: no gate was refuted, no claim was wrong, and the code it refused to commit was 21 files of mostly-good work with one line that contradicted the plan.

```
commit_plan  4960f48  COMMIT 1/3 landed
build        21 paths, suite green first try
review_1     BLOCKED: decodeEntities crashed on out-of-range surrogates
revise_1     closed it                        <- the only revision the cap allowed
review_2     BLOCKED: contentType === "" widens the plan's allowlist
             no budget left
accepted: false, code left uncommitted
```

The second finding was real. `specs/phase-3-ingestion-plan.md:125` is an allowlist - `text/html`, `application/xhtml+xml`, `text/markdown`, `text/plain`, and anything else refused citing the PRD's permanent no-binary non-goal - and the builder had added `|| contentType === ""` to it, which lets a 200 with no content-type header through as text.

Exercised for the first time, all of it clean:

- **The revision loop.** `review_1` blocked, `revise_1` closed the finding, `review_2` ran against the revised code.
- **The accumulated change set across more than one builder call.** 21 paths declared across `build` and `revise_1`, and all 21 were genuinely in the tree - the union check the run-1 defect was fixed with.
- **The refusal itself.** A gate that declines to commit code failing its own spec is the package working, not breaking.

What it exposed was a budget bug, not a logic bug. `MAX_REVISION_LOOPS` counts review/revise ROUNDS, so a cap of 2 bought exactly one revision. Fixing one blocker is what lets the reviewer see past it to the next, so a new finding on the second pass is the normal case. Worse, the asymmetry ran backwards: the suite - a mechanical signal a builder chases down alone - had three rounds, and the review, which blocked two runs out of four, had the fewest. Both are 3 now, and both are still capped.

The same run also surfaced a display bug with no effect on correctness: `probe()` hardcoded `phase: 'Gate'`, and since `opts.phase` overrides the ambient `phase()` state, Preflight, Branch and Test had been rendering as boxes that never ran across all four runs. They ran; they were filed under Gate. Each caller names its own phase now.

Both fixes are covered by 9 new assertions in `.claude/hooks/logic-selftest.mjs`, each mutation-checked - the file was reverted to the buggy values and the assertions were confirmed to fail. Run 5 re-ran this same input afterwards: the per-phase fix was confirmed by watching the progress tree, and the raised budget went unexercised, because that run's reviewer approved on the first pass.

### Run 1: FAILED at commit 2 of 3

Real end-to-end invocation, `my-rag`, 2026-08-13.

Input: Phase 1 of that repo's `PRD.md` - a Bun/TypeScript walking skeleton - on a repo containing only `PRD.md` and the package. `runId: ph1w7k2`, `testCommand: bun test`.

Phases that ran, in order:

```
preflight   clean tree on master
frame       feat/phase-1-walking-skeleton, convention derived from real branches
branch      created
plan        specs/phase-1-walking-skeleton-plan.md, 39 requirements, 288 lines
commit_plan d7e7d4e  COMMIT 1/3 landed
build       19 files
test_1      green
review_1    BLOCKED - chunk.ts contradicted the plan's chunking behaviour
revise_1    3 files
review_2    approved, 39/39
retest      green
commit_build FAILED
```

Every schema validated. Nineteen probe calls, every `observed` carrying real command output.

**What it proved works.** The review loop is not decorative: `review_1` read the code on disk, found that `chunk.ts` excluded ATX heading lines from the stored chunk text in contradiction of the plan, and blocked. `revise_1` closed it and `review_2` approved 39/39. `branch_free`'s inversion reported correctly. The suite's output went to a file and the probe returned only `EXIT:0`. And the preflight did not abort, which it would have before the `stripExit` fix - this run could not have existed.

**What it broke on.** Two defects, one loud and one silent.

**1. The probe corrupted a command it was told to run verbatim.** The script emitted `git commit -m 'Fix ... in its own section'\''s text'`; the probe executed the same line with the backslash doubled, which parses to an unterminated quote. `shq()` was correct - that line runs fine in a real shell. The corruption was transcription. Fixed by removing escapes from the pipeline entirely: `shq()` now throws on anything needing one, a `shell_safe` gate refuses such values upstream, and commit messages are written to a file by their author agent and read with `git commit -F`.

**2. The commit would have carried 3 of 20 files.** `build` is reassigned by every repair, so `commit(build.changedFiles)` staged only what `revise_1` touched. Had the quoting held, the run would have reported `accepted: true` with a commit missing `package.json`, `tsconfig.json`, and all of `src/`. This one is worse than the first: it fails silently, and it was introduced by this package's own improvement over `git add -A`. Fixed by accumulating every declaration into one set, re-verifying it with `in_diff` before staging, and filtering out `.claude/runs/` scratch - which the same run also staged.

### Run 2: FAILED at the build gate

`my-rag`, 2026-08-13, Phase 2 (`rag ask`), `runId: p2ask4k`, branch `feat/phase-2-ask-agent`.

Preflight, frame, branch, plan and `commit_plan` (`5c2e927`) all passed. The build produced 23 files and the gate refuted it twice, so the phase died and the run closed `accepted: false`.

**What run 1's fixes proved.** `git commit -F` worked - the planner and the builder both wrote their message files and the plan commit landed through the file rather than the command line. Preflight's `exclude run metadata` check ran, so the handoff dir no longer dirties the tree for the next run. Neither had ever executed before.

**The new defect: a deletion is a change, and `exists` cannot say so.** The builder moved `src/slices/search/merge.ts` into `src/kernel/merge.ts` and correctly declared both paths. In the same gate, for the same path:

```
PASS   declared file is in the diff:  src/slices/search/merge.ts
FAIL   declared file exists:          src/slices/search/merge.ts
```

git reported the deletion; the filesystem could not. The builder had no legal answer either - dropping the deleted path passes the gate but leaves the removal unstaged, so the commit would keep the file it had just moved away from. `exists` was redundant with `in_diff` for this purpose and wrong for every refactor that moves or removes a file, so it is gone from the build gate. It stays where it means something: on a document a phase promises to have written.

**A caveat on this run's evidence.** The package was being edited in the target repo *while the run executed* - the working tree shows `.claude/workflows/`, `.claude/commands/` and `.claude/hooks/` modified between the plan commit and the build gate. That did not cause the failure above, which is fully explained by the gate output, but it means the run's write-boundary evidence is worthless: those are protected paths, and a breach would have been attributed to the builder. Do not edit an installed package while a run is using it.

### What is verified now

| Check | How |
|---|---|
| Anatomy | `node scripts/validate-workflow.mjs gated-sdlc` |
| The script parses | `node --check`, with the async wrapper the Workflow tool supplies |
| Workflow logic, 83 assertions | `node .claude/hooks/logic-selftest.mjs` - the my-rag file lists verbatim, the suite redirect executed against a real shell, and a real git repo proving a moved file's deletion is reported and stageable |
| Write boundary, 25 assertions | `node .claude/hooks/boundary-selftest.mjs` - the hook's exit codes, plus both copies of the boundary table in sync |

Both self-tests extract the real functions out of the source rather than copying them, so they cannot drift from the code they check.

Three further defects, found by reading before any run happened and all covered by those tests: `PROTECTED` evaluated after the allow list (the documenter could rewrite the agents that judge it), `**/*.md` matching nothing at the repo root, and the `EXIT:` footer parsed as a filename - which would have aborted every run at preflight.

### One operational rule, learned the hard way

**Do not edit an installed copy of this package while a run is using it.** Sync between runs, never during one. Run 2's evidence was spoiled exactly this way: the package was being updated in the target repo mid-run, leaving protected paths modified in the working tree, so any boundary check would have blamed the builder for edits it never made.

### Still unexercised after six runs

None of these is a known defect. They are code paths six runs never happened to take, listed so nobody reads a green smoke test as full coverage.

Struck-through items were closed by a later run and are kept rather than deleted, because what closed them is worth more than the fact that they are closed.

1. ~~**The repair loops.**~~ Closed by run 4: `review_1` blocked on a real crash and `revise_1` closed it. The `fix_N` loop is still unexercised - no run has ever gone red on the suite.
2. ~~**The change set across more than one builder call.**~~ Closed by run 4: 21 paths accumulated across `build` and `revise_1`, and the union check confirmed all 21 against the tree. This is where run 1's silent 3-of-20 bug lived.
3. **The `PreToolUse` hook.** Still never observed firing. It has been installed for every run, but no agent has attempted an out-of-bounds write, and a hook that exits 0 leaves no trace. This is why `settle()` was not deleted.
4. **`conventionEvidence` against a fabrication.** Every framer so far derived a real convention, so the gate has never had to reject an invented one. `no_placeholder` only catches empty or templated text.
5. **`git diff --numstat` on a rename.** Run 3 contained a rename and the working-tree parse survived it, but numstat's `old => new` path form was never the thing being parsed, because the move showed up as a delete plus an add. Binary files are covered (`-` for both counts parses to a stable `-,-`).

6. **The second revision.** `MAX_REVISION_LOOPS` is 3 now, but run 4 died at the old cap and run 5's reviewer approved on the first pass, so no run has ever reached `revise_2` or `review_3`. The open question is whether a reviewer that found something new on pass 2 converges on pass 3 or just keeps finding things - if it is the latter, the cap is doing its job and the run should end, but nobody has watched it happen. **The most valuable one left.**
7. ~~**The fingerprint calls on sonnet.**~~ Exercised by run 5: 9 of 14 probes ran on sonnet, 5 on haiku, no transcription failure. Still insurance against a failure observed exactly once, on run 1, rather than a fix for anything currently broken.

Also closed, and not by a transcript: the **per-phase probe fix**, confirmed by watching the progress tree during run 5. `phase` appears in neither the journal nor any agent transcript, so direct observation while the run is live is the only evidence that can exist for it. Worth remembering if that fix ever regresses - no automated check will catch it, which is why `logic-selftest.mjs` asserts on the source instead.

**Answered by run 1:** `gated-probe` does hold the line on `observed` - nineteen checks, raw output and honest exit codes throughout, including reporting its own failure. What it does *not* do is reproduce an escaped command line, which is now designed around rather than relied upon.
