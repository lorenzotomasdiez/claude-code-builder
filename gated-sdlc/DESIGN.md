# gated-sdlc - design spec

This is the single source of truth for every agent definition and the workflow script in this package.
It is the contract, not a suggestion.
If something you are writing contradicts this file, this file wins.

## The thesis

A schema-validated `agent()` result is a **manifest of claims**, not evidence.
The schema guarantees the JSON has the right shape and nothing more: `changedFiles: ["src/auth.ts"]` validates perfectly even when that file does not exist.
Every claim that can be checked mechanically gets checked against the repo before the next stage is allowed to believe it.

Agent proposes, code disposes.

This package is the flow of the Super Simple Software Factory (`adw_simple_sdlc.py`) ported to the Claude Code Workflow tool, plus a framing and branching step at the front.

## The chain

```
operator input         request + runId + testCommand
  -> preflight (probe) abort if the tree is dirty
  -> frame (framer)    understand the task, derive the branch name from the repo
  -> [gate]
  -> branch (probe)    git checkout -b
  -> plan (planner)
  -> [gate]
  -> commit_plan (probe)                          commit 1 of 3
  -> build (builder)
  -> [gate]
  -> test (probe)  -> fix (builder) -> test ...   bounded at 3
  -> review (reviewer)
  -> [gate]
  -> revise (builder) -> retest (probe) -> review  bounded at 2
  -> commit_build (probe)                         commit 2 of 3
  -> changes (probe)   diff the whole run against the pinned baseline
  -> document (documenter)
  -> [gate]
  -> commit_docs (probe)                          commit 3 of 3
  -> accepted = suite green AND review approved AND no unverified claim
```

## The envelope contract

Every agent returns an object extending this base.
`status` is load-bearing: an envelope that parses but reports `fail` is not a successful phase.

```js
const ENVELOPE = {
  status:  { type: 'string', enum: ['success', 'fail'] },
  summary: { type: 'string', description: 'One sentence: what happened' },
  artifacts: { type: 'array', items: { type: 'string' },
               description: 'Paths written, normally inside the handoff dir' },
  notesForNextAgent: { type: 'string' },
}
```

Per-agent additions, verbatim.
**Your `.md` must describe exactly these fields and no others.**
If you invent a field, the schema rejects it and the phase dies.

| Agent | Adds |
|---|---|
| `gated-framer` | `understanding` (string), `intent` (enum: feat/fix/chore/docs/refactor/test), `slug` (string, kebab-case), `branchName` (string), `conventionEvidence` (string), `blockers` (string[]) |
| `gated-planner` | `planPath` (string - required, the plan file's exact path), `commitMessage` (string - imperative subject for the commit of THE PLAN FILE, also written to the run's message file) |
| `gated-builder` | `changedFiles` (string[]), `fileCount` (number), `commitMessage` (string - imperative subject for the commit of THE CODE) |
| `gated-reviewer` | `approved` (boolean), `findings` (array of `{requirement, met, evidence}`), `blocking` (string[]) |
| `gated-documenter` | `documentPath` (string), `commitMessage` (string - imperative subject for the commit of THE WRITE-UP) |
| `gated-probe` | `checks` (array of `{id, ok, observed}`) - and NOT the envelope base; the probe returns only this |

Each `commitMessage` describes **its own agent's work product, never the next one's**.
The planner's covers the spec file, the builder's the code, the documenter's the write-up.
Reusing one agent's sentence for another's diff is how a commit log starts lying.

Each of those three agents also **writes its subject line to a message file** the script names, and git reads it with `commit -F`. The envelope field is for the report; the file is what lands. See rule 9.
The builder writes it once, in `build` mode. A `fix` or `revise` leaves it alone: the commit covers the whole work product, so its subject is the build's, not whatever the last repair happened to touch.

## The two output channels

An agent produces output in exactly two ways:

1. **Files written into the handoff dir**, for the agents that follow.
2. **Its final JSON envelope**, and nothing else.

The handoff dir is passed in the prompt. It is the only place agents hand work to each other, because there is no session resume between `agent()` calls: every agent starts cold, and a file on disk is the only memory that survives.

## The gate vocabulary

Gates verify the claim's own words after the fact. They never guess and they never judge quality.

**Tier 0 - pure**, runs in the workflow script, costs nothing:
`verdict_consistent`, `counts_match`, `slug_shape`, `branch_matches_intent`, `no_placeholder`.

**Tier 1 - world**, batched into one `gated-probe` call per phase:
`exists`, `non_empty`, `min_bytes`, `in_diff`, `branch_free`, `parses`, `contains`, `exits_zero`, `fingerprint`, `run`, `capture`.

Both tiers are named by a `type` field on the check object, and the workflow hands the probe one check per item: a claim about five files becomes five `exists` checks, so the report names the file that failed rather than the claim that contained it.

The **invocation for every named world check lives in `gated-probe.md`**, not in the script. The script names a type and its parameters (`path`, `bytes`, `branchName`, `pattern`); the probe runs the one fixed command that type maps to. Only `run`, `capture` and `exits_zero` carry a literal `command`, and even there the probe runs exactly what it was handed.

The vocabulary is **closed**. The hole it guards against is the probe inventing a command, not code authoring one: "a known command is code, not a judgement call" is the whole point.

**`exists` is never the right check for a changed file.** A deletion is a change and a deleted file does not exist, so `exists` refutes a true claim about any move or removal. `in_diff` asks git the actual question - "is this path really in the change set" - and git reports deletions, additions and modifications alike. Run 2 died on this: in a single gate, `in_diff` passed on a moved-away path while `exists` failed on it, and the builder had no legal answer, because dropping the deleted path would have left the removal unstaged and kept the file it had just moved away from. `exists` belongs only on a document a phase promises to have WRITTEN - `planPath`, `documentPath` - never on `changedFiles`.

Two check names mean something specific and are easy to misread:

- `branch_free` is the one check whose underlying command is supposed to **fail**. `git rev-parse --verify` exiting zero means the branch already exists. The probe owns that inversion and reports `ok` already flipped.
- `fingerprint` hashes **one file** against an expected hash. The working-tree changeset used by the write boundary is a `capture` of a fixed command, not a `fingerprint`.

When a gate refutes a claim, the workflow re-prompts the same agent **cold**, carrying the previous claim and the harness's verbatim observation ("`src/auth.ts: no such file`", not "files missing"). Exactly one retry. If the second attempt does not verify either, the problem is not phrasing: the phase dies and the run closes with `accepted: false`.

## The test command belongs to the operator

`testCommand` arrives in `args`. No agent finds it, verifies it, or supplies one when it is missing.

An agent that locates `npm test` has established that a command exists, not that it tests anything. A repo whose test script is `echo "no tests" && exit 0` exits zero forever, and every phase downstream reads that as a green suite: the run commits and returns `accepted: true` having verified nothing at all. The system this ports refuses to guess for exactly this reason - its test block ships as a placeholder that announces it is fake, on the principle that *a wrong-but-plausible command that silently passes is worse than one that says so out loud*.

It is also the only agent-authored string that would ever reach the shell unquoted, since a test command is a command line by nature and `shq()` would destroy it. Taking it from the operator closes the injection surface and the fake-green hole with one decision.

When no `testCommand` is given the run still proceeds: the plan is committed, the code stays in the working tree, and the verdict is `accepted: false` naming the reason. A missing test command is a reported state, never a blocker.

## Rules that bind every agent

1. **A known command is code, not judgement.** If the invocation can be written down, the probe runs it. Agents are for reading and deciding.
2. **Judge by exit status, never by scanning output for words.** `error` inside passing output is text, not a failure.
3. **You inherit the operator's shell environment.** Call tools by bare name (`npm`, `uv`, `git`); never hunt for a binary or fall back to an absolute `/usr/bin/*` path.
4. **Nobody edits their own evaluator.** `.claude/workflows/`, `.claude/agents/`, `.claude/commands/` and `CLAUDE.md` are off limits to every agent in this package, unconditionally. In code this means `PROTECTED` is tested **before** the allow list, in both copies of the boundary: an allow list is a widening, a protected path is a floor, and a widening evaluated first turns the floor into a suggestion. The documenter's `**/*.md` reaches `.claude/agents/*.md` exactly, so this is not hypothetical.
5. **The tree starts clean.** The run aborts otherwise. So anything that appears in the working tree during the run was introduced by the run.
6. **Never `git add -A`.** Commits stage exactly the paths a gate already verified.
7. **`observed` is not raw output.** The probe appends `EXIT:<code>` to everything it reports. Any value read as data goes through `stripExit()` first - a sha with a footer is not a rev, and an `EXIT:0` parsed as a filename makes a clean tree read as dirty.
8. **Bulk output goes to a file, never through the probe.** The probe transcribes into a JSON string and is permitted to truncate. A check that needs volume redirects (`cmd > path.log 2>&1`) and reports only the exit code; whoever needs the content opens it with `Read`. The probe's transcription surface is the determinism budget - spend it on exit codes.
9. **No command line ever contains an escape sequence.** `shq()` throws on any value holding a quote, backslash, newline, backtick, dollar or control character, and the `shell_safe` gate refuses one before it gets that far. Free-form text goes in a file the probe never has to retype: commit messages are written by their author agent and read with `git commit -F`.

## Why rule 9 exists

The probe does not reproduce an escaped command verbatim. This is measured, not feared.

On the first real run (`my-rag`, 2026-08-13) the script emitted the textbook POSIX form for a subject containing an apostrophe:

```
git commit -m 'Fix ... in its own section'\''s text'
```

and the probe executed:

```
git commit -m 'Fix ... in its own section'\\''s text'
                                          ^^ one backslash became two
```

which parses as a closed string, a literal backslash, an empty string, `s`, then an unquoted space and `text'` opening a quote that never closes. The shell reported `unmatched '` and the run lost its code commit at the last step, after a green suite and an approved review.

`shq()` was correct: that command line runs fine in a real shell, directly and through `eval`. The corruption was transcription, and nothing upstream survives a model retyping a backslash. So the rule is not "escape properly" - it is **never emit something that needs escaping**.

This is the same lesson as rule 8, arrived at from the other direction: the probe is reliable at reporting what a command did, and unreliable at reproducing what a command says. Design so it only ever has to do the first.

## The commit stages every declaration, not the last one

`build` is reassigned by each `fix_N` and `revise_N`, so committing `build.changedFiles` commits only whatever the final repair touched. On the my-rag run that was 3 files out of 20 - the entire walking skeleton, `package.json` and `tsconfig.json` and all of `src/`, would have been left behind while the run reported success, because the revision that closed the reviewer's one finding only edited `chunk.ts`.

The workflow accumulates every declared path into one set, re-verifies the whole set with `in_diff` immediately before staging, and commits that. Paths under `.claude/runs/` are filtered out: the handoff dir is scratch and does not belong in a commit, which the same run demonstrated by staging the builder's own working notes.

`adw_simple_sdlc.py` does not have this bug because `git add -A` sweeps everything. Staging only verified paths is still the better rule - it is what keeps an unrelated dirty file out of a commit its author never wrote - but it is only correct if the verified set accumulates across every call.

## The write boundary is two layers

`tools:` is a capability list, not a boundary: `Bash` runs `git checkout` and `Write` reaches any path, so no tool list makes "this agent changes nothing" true.

1. **Prevention** - `.claude/hooks/gated-write-boundary.mjs`, wired as a `PreToolUse` hook in the target repo's `settings.json`. Deterministic shell, exit 2, zero tokens, and the write never lands. It only has an opinion when `agent_type` starts with `gated-`; every other caller in that repo gets exit 0, because installing this package must not change what the repo's normal work may do.
2. **Detection** - `settle()` in the script. Compares the working-tree changeset before and after each phase and rolls back anything out of bounds.

**Keep both.** They fail in opposite directions. The hook does nothing if it is not installed, or if `agent_type` turns out not to be populated for subagents spawned inside a Workflow run - a hook that looks armed and enforces nothing. `settle()` cannot prevent anything and costs an observation. Until a real run proves the hook fires in this context, `settle()` is the layer holding the line, and it is free: the tree capture rides along in the phase's gate batch rather than taking its own probe call.

Comparing **changesets** rather than watching writes also catches what no interceptor can: a path that was dirty before and clean now was reverted, and reverting is modifying.

The boundary table is written twice, in two languages of the same repo. `.claude/hooks/boundary-selftest.mjs` extracts `WRITES`, `PROTECTED` and `matches()` from both files and fails if they differ, because two copies of a security rule drift.

## The roster

| Agent | Model | Tools | May write | Never |
|---|---|---|---|---|
| `gated-framer` | opus | Read, Grep, Glob, Bash | nothing in the repo | plans, writes code, creates the branch itself |
| `gated-planner` | opus | Read, Grep, Glob, Write | `specs/`, handoff dir | edits any repo file - it has no `Edit` and no `Bash` |
| `gated-builder` | sonnet | Read, Write, Edit, Grep, Glob, Bash | anywhere except protected paths | edits a test to make it pass, touches its own evaluator |
| `gated-reviewer` | opus | Read, Grep, Glob, Bash | nothing in the repo | fixes anything, runs the suite, gives style opinions |
| `gated-documenter` | sonnet | Read, Write, Edit, Grep, Glob | `docs/`, `**/*.md` | documents anything the diff does not show |
| `gated-probe` | haiku | Bash, Read | nothing | interprets, fixes, or reports a result it did not observe |

## Per-agent briefs

### gated-framer

Turns the raw request into something buildable and names the branch.
The only agent that decides what the run is about.

Its single most important output is `conventionEvidence`: it must run `git branch -a --sort=-committerdate | head -20` and derive the branch convention from the **real branch names in this repo**, then quote them. A generic convention invented from training data is a refuted claim - the gate checks this field is non-empty and non-generic.
It does **not** produce a `testCommand`; there is no such field on its schema. See "The test command belongs to the operator".
`blockers` is how it says the run cannot start: ambiguous request, not a git repo, or work that cannot be done without a protected path. A missing test command is never one.

### gated-planner

Turns the framed request into a plan the builder can implement without asking questions.
Writes the plan to `specs/<slug>-plan.md` - in `specs/` and not the handoff dir, because it gets committed and the handoff dir is scratch space not meant to outlive the run. That file, not the envelope, is the plan.
It returns the path as `planPath`, a required field, and that is what every later phase resolves. Never `artifacts[0]`: `artifacts` is unordered and unrequired, so a planner that writes a second file first hands the builder and the reviewer the wrong document, and one that writes none passes every gate before dying at the commit.
It has `Write` but no `Edit` and no `Bash`: it produces one document and touches nothing else.

### gated-builder

The only agent that writes production code, and the only one allowed in the source tree.
Its spec is the plan file at `planPath`. When it is called to fix, its spec is the suite's **log file** and it must open it - the output is redirected to disk precisely so no model has to retype it; when called to revise, the reviewer's blocking findings.
It reports every file it changed in `changedFiles`, and `fileCount` must match that array's length - the redundancy is deliberate, the gate cross-checks it.
That verified list becomes the commit's file list, so an inaccurate claim is not a cosmetic problem: it decides what lands.

### gated-reviewer

Confirms that what was built is what was asked for. This is not testing.
Its spec is the plan file at `planPath`. It judges the code on disk, never the builder's summary of it.
It breaks the spec into concrete requirements and rules on each: met, or not met with the evidence - a `file:line`, or exactly what is missing.
`approved` is true **only** when every requirement is met and `blocking` is empty. A `blocking` item names the specific gap so the builder can close it without guessing.
It changes nothing. Findings go back to the builder; that is the only repair path.

### gated-documenter

Writes up the change that was just made, from the diff, after the code is committed.
It reads the captured diff in full before writing, and documents only what the diff shows.
`documentPath` is the write-up's home in the repo.

### gated-probe

The substitute for a `kind="code"` phase.
In the original this is a subprocess: free, instant, impossible to persuade. Here it is a model, and its whole definition exists to get it as close to a subprocess as possible.

It receives a JSON list of checks from the closed vocabulary and returns one result per check.
`ok` comes from the exit code or the stat, never from an impression.
`observed` is what the command actually printed, verbatim - a truncated tail is fine, a summary is not, and "looks correct" is a failure to do the job.
It never fixes anything, never runs a command it was not given, and never reports a result it did not observe.
If a command fails, that is a finding, not a problem to solve.

## Anatomy every agent file must follow

Match `archive/prd-generator/.claude/agents/*.md`: YAML frontmatter with `name`, `description`, `tools`, `model`, then a body of XML-ish tagged sections written as direct instruction to the agent.
Every agent gets an explicit section naming what it does **not** do.
The `description` is one or two sentences: what it does, and the sharpest thing it is not allowed to do.
