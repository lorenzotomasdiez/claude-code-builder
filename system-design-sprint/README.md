# system-design-sprint

A fast, conversational system design sprint.
It walks the four phases a senior engineer walks when handed "design X" - clarify, requirements, estimate, architecture - in one pass, using parallel subagents, and ends with a summary sitting in the chat ready to hand to `/lavish`.

It writes no files. That is a design decision, not an omission.

## Usage

```
/system-design-sprint a service that lets our 5000 internal engineers submit and track hardware build requests
```

You answer one round of four clicked questions.
Everything after that runs without blocking you.

## The pipeline

```
                 /system-design-sprint "<what to design>"
                                 |
        +------------------------+------------------------+
        |                                                 |
  sds-context-prober                            AskUserQuestion (x4)
  (background, repo scan)                       users / scope / scale / constraints
        |                                                 |
        +------------------------+------------------------+
                                 |
                          LOCKED BRIEF (5 lines, recapped in chat)
                                 |
              +------------------+------------------+
              |                  |                  |
        sds-nfr-analyst      sds-sizer        sds-architect
        (Phase 2)            (Phase 3)        (Phase 4)
        binding NFRs         req/s, storage   boxes + 5 decisions
              |                  |                  |
              +------------------+------------------+
                                 |
                            sds-skeptic
                     (one adversarial pass, no loop)
                                 |
                    SYNTHESIS in the conversation
                                 |
                     offer -> /lavish (never automatic)
```

## Why it is a command and not a workflow

Every other package in this library is a `Workflow` script.
This one is not, for two reasons that are both hard blockers.

Phase 1 requires asking the human questions and using the answers to shape everything downstream.
Workflow subagents run in the background and cannot talk to the user, so a workflow would have to guess at the five things this sprint exists to pin down - and the guessing is precisely the failure mode Phase 1 prevents.

And the output is meant to be conversational.
A workflow returns a value and writes documents; this sprint's product is a summary in the chat that a human can correct in one line and then send to `/lavish`.
Persisting it is a separate, later step, deliberately not bundled here.

`product-blueprint` is the existing precedent in this repo for a command-only package with no workflow script.

The cost of this choice is real and worth naming: with no workflow script there is no JSON-schema validation of agent output and no `scripts/validate-workflow.mjs` coverage.
The output contracts live in the agent definitions as prose instead, and the orchestrator is the only thing checking them.

## Design rationale

**The scout runs while the human types.**
`sds-context-prober` is launched in the same message as the clarifying questions, so its repo scan costs zero wall-clock.
It matters because the repo often contradicts the human: a load test with real throughput numbers outranks a bucket someone clicked, and a `SECURITY.md` surfaces the compliance constraint nobody thinks to mention in Phase 1.

**One blocking round, not five.**
The temptation in a clarify phase is to ask each question in turn and react.
That is five round trips against a human's attention, and the sprint is supposed to be fast.
Instead: four questions with proposed options in one `AskUserQuestion` call, the success metric proposed rather than asked, and the recap stated as "correct any line or I proceed" rather than as a second gate.

**Phases 2, 3 and 4 run blind to each other.**
This is the least obvious choice in the package and the most important one.
Chaining them would be slower and would produce a worse design, because an architect who has already read a sizing verdict rationalizes toward it instead of designing independently.
Three independent passes disagree, and their disagreements are the actual signal - a queue drawn on top of 30 req/s, a strong-consistency requirement served off a read replica.
`sds-skeptic` exists to mine exactly that seam, and it only exists because the three ran in parallel.

**One review pass, no revise loop.**
Other packages in this library loop review/revise with a round cap.
This one does not, and the trade is deliberate: the human is sitting right there and is a better second reviewer than another agent round.
Contradictions get resolved by the orchestrator in the synthesis, with the call stated out loud so the human can overrule it.

**Every agent is pushed toward the smaller answer.**
`sds-sizer` is told that a small number is a finding, not a disappointment.
`sds-nfr-analyst` must dismiss the non-binding attributes out loud, because a dismissal is permission to build something simpler.
`sds-architect` must justify every box in one line or delete it.
`sds-skeptic` hunts over-engineering before under-engineering.
The default failure of an AI design sprint is a reference architecture with every box in it; four separate counterweights is not redundancy, it is the point.

## The files

| File | Role |
|---|---|
| `.claude/commands/system-design-sprint.md` | The `/system-design-sprint` entry point. Orchestrates all seven steps in the conversation. |
| `.claude/agents/sds-context-prober.md` | Scans the repo for stack, data stores, deploy target, real numbers and compliance markers, concurrently with the human answering. |
| `.claude/agents/sds-sizer.md` | Phase 3. Back-of-the-envelope arithmetic and a verdict on what class of system the numbers demand. |
| `.claude/agents/sds-nfr-analyst.md` | Phase 2. Functional list, the full non-functional menu with targets, and which 2-3 actually bind. |
| `.claude/agents/sds-architect.md` | Phase 4. ASCII diagram, one justified line per box, and the five standard decision questions. |
| `.claude/agents/sds-skeptic.md` | The single adversarial pass. Contradictions across the three, over-engineering, under-engineering, the unasked question. |

There is no `.claude/workflows/` directory, for the reasons above.

## What it deliberately does not do

- It does not write a document. Ask for one and it says so.
- It does not run `/lavish` for you. It offers, once, at the end.
- It does not specify schemas, endpoints, or code structure. Phase 4 stops at boxes and arrows.
- It does not design past the scoped flow. Narrowing scope in Phase 1 is treated as a success.

## Smoke test

**Not yet run.**
Status: built, not verified end to end.

This package cannot be smoke-tested autonomously, because Phase 1 blocks on a real human answering `AskUserQuestion` - which is the same property that makes it a command instead of a workflow.
The smoke test has to be a real invocation with a human present.

Record here, on the first real run: the input used, whether the prober returned before the human finished answering, whether all three parallel agents returned usable output, whether the skeptic found at least one real cross-agent contradiction, and whether the synthesis fit in one scroll.
