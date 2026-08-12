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
preflight (probe)      abort if the tree is dirty
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
| `gated-framer` | `understanding` (string), `intent` (enum: feat/fix/chore/docs/refactor/test), `slug` (string, kebab-case), `branchName` (string), `conventionEvidence` (string), `testCommand` (string), `blockers` (string[]) |
| `gated-planner` | `commitMessage` (string - imperative subject for the commit of THE PLAN FILE) |
| `gated-builder` | `changedFiles` (string[]), `fileCount` (number), `commitMessage` (string - imperative subject for the commit of THE CODE) |
| `gated-reviewer` | `approved` (boolean), `findings` (array of `{requirement, met, evidence}`), `blocking` (string[]) |
| `gated-documenter` | `documentPath` (string), `commitMessage` (string - imperative subject for the commit of THE WRITE-UP) |
| `gated-probe` | `checks` (array of `{id, ok, observed}`) - and NOT the envelope base; the probe returns only this |

Each `commitMessage` describes **its own agent's work product, never the next one's**.
The planner's covers the spec file, the builder's the code, the documenter's the write-up.
Reusing one agent's sentence for another's diff is how a commit log starts lying.

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

Two check names mean something specific and are easy to misread:

- `branch_free` is the one check whose underlying command is supposed to **fail**. `git rev-parse --verify` exiting zero means the branch already exists. The probe owns that inversion and reports `ok` already flipped.
- `fingerprint` hashes **one file** against an expected hash. The working-tree changeset used by the write boundary is a `capture` of a fixed command, not a `fingerprint`.

When a gate refutes a claim, the workflow re-prompts the same agent **cold**, carrying the previous claim and the harness's verbatim observation ("`src/auth.ts: no such file`", not "files missing"). Exactly one retry. If the second attempt does not verify either, the problem is not phrasing: the phase dies and the run closes with `accepted: false`.

## Rules that bind every agent

1. **A known command is code, not judgement.** If the invocation can be written down, the probe runs it. Agents are for reading and deciding.
2. **Judge by exit status, never by scanning output for words.** `error` inside passing output is text, not a failure.
3. **You inherit the operator's shell environment.** Call tools by bare name (`npm`, `uv`, `git`); never hunt for a binary or fall back to an absolute `/usr/bin/*` path.
4. **Nobody edits their own evaluator.** `.claude/workflows/`, `.claude/agents/` and `CLAUDE.md` are off limits to every agent in this package.
5. **The tree starts clean.** The run aborts otherwise. So anything that appears in the working tree during the run was introduced by the run.
6. **Never `git add -A`.** Commits stage exactly the paths a gate already verified.

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
It also finds and verifies `testCommand` by actually running it, because every later phase depends on it.
`blockers` is how it says the run cannot start: ambiguous request, no test suite, not a git repo.

### gated-planner

Turns the framed request into a plan the builder can implement without asking questions.
Writes `plan.md` into the handoff dir. That file, not the envelope, is the plan.
It has `Write` but no `Edit` and no `Bash`: it produces one document and touches nothing else.

### gated-builder

The only agent that writes production code, and the only one allowed in the source tree.
Its spec is `plan.md`. When it is called to fix, its spec is the verbatim test output; when called to revise, the reviewer's blocking findings.
It reports every file it changed in `changedFiles`, and `fileCount` must match that array's length - the redundancy is deliberate, the gate cross-checks it.
That verified list becomes the commit's file list, so an inaccurate claim is not a cosmetic problem: it decides what lands.

### gated-reviewer

Confirms that what was built is what was asked for. This is not testing.
Its spec is `plan.md`. It judges the code on disk, never the builder's summary of it.
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
