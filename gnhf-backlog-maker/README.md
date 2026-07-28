# GNHF Backlog Maker

Turns a raw, human-shaped task ("update all the design docs, write the tests and implementations, and verify everything works") into an exhaustive, verification-bearing `backlog.md` and a ready-to-launch [GNHF](../gnhf) worker prompt - so an autonomous GNHF run can grind through the work in a loop without anything falling through the cracks, and without you having to supervise every step.

This exists for the handoff moment between "I know roughly what needs to happen" and "an unattended agent is now working through it for hours." The gap that handoff is prone to - a doc nobody remembered, a test that only checks the happy path, a row GNHF can mark done without real proof - is exactly what this workflow's critique lenses are built to catch before the run starts, not after.

## Usage

```
/gnhf-backlog-maker update all the design docs, write the tests and implementations, and verify everything works
```

If you already have a backlog file at a non-default path:

```
/gnhf-backlog-maker finish the onboarding flow | backlogPath: docs/plan/backlog.md
```

## Pipeline

```
Scope (1 agent: gbm-scoper)
  -> inspect the repo: relevant code/docs/tests, the REAL gate-chain commands (typecheck/lint/build/test),
     and any existing backlog.md to continue rather than duplicate
    -> Decompose (1 agent: gbm-decomposer, opus)
       -> an EXHAUSTIVE, already-sequenced list of vertical-slice rows, each with a real test
          and a real verification command - completeness is the whole point of this workflow
        -> Draft (1 agent: gbm-backlog-writer)
           -> assembles rows into backlog.md, merging with existing content, never overwriting it
            -> Critique (3 agents in parallel: completeness, verification-rigor, sequencing/scope)
              -> Revise (gbm-backlog-writer, loops back into Critique, capped at 2 rounds)
                -> compose the GNHF launch prompt (deterministic, no agent - the skeleton is fixed)
```

## Why this exists, and what it hands off

GNHF itself is a loop, not a planner: it repeatedly calls a coding agent against one worker prompt until a stop condition is met. In practice, the durable state that keeps a long GNHF run honest across many iterations is a **row-based backlog file** - GNHF reads the next `todo` row, does the work, runs the row's verification, marks it done (or `blocked` with evidence), commits, and moves to the next row. That pattern only works if the backlog itself is complete and every row's verification is real; a GNHF worker executes exactly what the backlog says and nothing more, unattended, so a gap in the backlog is a gap in the shipped result - discovered hours later, if at all.

This workflow's whole job is to produce that backlog well, before the loop starts, and to produce it as the two files a human actually needs to launch the run:

- `docs/build-plan/backlog.md` (or wherever you point it) - the row-based file GNHF reads from during the run.
- `docs/build-plan/<slug>-gnhf-prompt.md` - the ready `Objective: ... / Stop only when: ...` worker prompt, in the exact shape the `gnhf` skill expects, so launching is copy-paste rather than composing a prompt from scratch under time pressure.

## Design rationale

**Why decomposition is a single opus call, not a per-category fan-out.** A task like "docs + tests + implementations + verification" could be split into four parallel lenses, but real backlog rows are vertical slices (the real GNHF example this workflow is modeled on ships a token module, its lint rule, and its contrast test together as one row) - splitting by category first would produce four disconnected lists that then need to be re-merged into slices anyway. One pass that sees the whole task and the whole scope at once, on the model tier reserved for judgment calls, produces coherent slices directly. This mirrors `epic-breakdown`'s `sequencing-estimator`: the step where completeness/ordering has to be judged in one shot, over everything at once, is exactly the phase this repo's model-selection convention gives opus to.

**Why three critique lenses, not one.** Completeness (is anything missing), verification-rigor (is every check real), and sequencing/scope (is the order sound and does nothing quietly touch what wasn't asked) are genuinely different failure modes - a single reviewer defaults to whichever it favors. This is the same "needs_revision if any lens flags it" pattern as `code-review` and `epic-breakdown`. Completeness is the lens this whole workflow exists to run: it re-derives what the task implies independently, before reading the rows, specifically so it isn't anchored by whatever the decomposer already thought of.

**Why the backlog-writer, not the decomposer, owns revision.** Critique can span missing rows, vague verification, and bad sequencing at once; routing every fix through the one agent that owns the assembled document (same as `epic-breakdown`'s `breakdown-writer`) avoids three critics' feedback fighting over the decomposer's original output.

**Why continuing an existing backlog is a first-class case, not an afterthought.** Real GNHF backlogs are long-lived - a repo's `backlog.md` accumulates rows over many runs, some done, some still open. Scope reads the existing file and its highest row id; the decomposer numbers new rows after it and is explicitly forbidden from touching existing ones; the writer appends rather than overwrites, byte-for-byte preserving what's already there. A workflow that silently regenerated the whole file on every call would corrupt an in-flight GNHF run's progress.

**Why the GNHF prompt is composed deterministically, not by an agent.** The `gnhf` skill's worker-prompt skeleton (`Objective: ... / Stop only when: ...`) is fixed and every value it needs (the task, the backlog path, the detected gate-chain commands, the decomposer's `nonGoals`) is already known by this point - an agent call here would spend a step restating data the workflow already has. This keeps the pipeline at four real agent-judgment phases instead of five, in the same spirit as this repo's other lean pipelines.

## Files

- `.claude/agents/gbm-scoper.md` - inspects the repo for relevant code/docs/tests, the real gate-chain commands, and any existing backlog to continue.
- `.claude/agents/gbm-decomposer.md` - the completeness-critical agent: turns the task into an exhaustive, sequenced list of vertical-slice rows, each with a real test and verification. Runs on `opus`.
- `.claude/agents/gbm-backlog-writer.md` - assembles/merges rows into the actual `backlog.md`, and later revises it against critique.
- `.claude/agents/gbm-completeness-critic.md`, `gbm-verification-critic.md`, `gbm-sequencing-critic.md` - three independent adversarial lenses over the drafted backlog.
- `.claude/workflows/gnhf-backlog-maker.js` - the orchestration script. Composes the GNHF launch prompt deterministically after the critique loop, from the scope's gate-chain commands and the decomposer's `nonGoals`.
- `.claude/commands/gnhf-backlog-maker.md` - the `/gnhf-backlog-maker <task>` entry point; writes `backlogDoc` to the backlog path and `gnhfPrompt` to a reference file.

## Where it sits relative to other workflows

`epic-breakdown` produces a stakeholder-readable backlog of INVEST stories for humans to plan sprints from. This workflow produces a mechanically verifiable row list for an unattended GNHF worker to execute - different reader, different bar for vagueness (a human planner tolerates "update the docs" as a placeholder to refine later; a GNHF row cannot, because nothing refines it before it runs). If you need both - a human-facing plan and an autonomous execution backlog for the same body of work - run `epic-breakdown` first and feed its stories into this workflow's task description.

## Smoke test

Wiring verified: `node --check` passes on the orchestration script, and every `agentType` referenced resolves to an agent definition in `.claude/agents/`. A full end-to-end run needs a real repo with detectable gate-chain commands to decompose against; it was not run inline. Run `/gnhf-backlog-maker <a small real task in a real repo>` to exercise it end to end and record the result here.
