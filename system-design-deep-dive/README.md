# system-design-deep-dive

Phases 5 and 6 of a system design: the component deep dives, then scalability, failure and trade-offs.

It is the second half of a pair.
`system-design-sprint` covers Phases 1-4 in minutes and answers "what are we building and roughly how".
This one answers "and what exactly happens inside each box, and where does it break".

It writes no files.
The output lives in the conversation and ends in a list of problems built to be resolved in `/lavish`.

## Usage

Right after a sprint, in the same conversation:

```
/system-design-deep-dive
```

It picks up the sprint's output and starts working without asking anything.

Standalone, against an existing design:

```
/system-design-deep-dive docs/architecture/checkout.md
/system-design-deep-dive <paste the design summary>
```

## The pipeline

```
        /system-design-deep-dive   (design from the sprint, a path, or pasted)
                          |
                     sdd-triage
        deep / light / skip per area + the one question each must answer
                          |
              AskUserQuestion (one click, multiSelect)
                 confirm what gets an agent
                          |
   +--------+--------+--------+--------+--------+--------+
   |        |        |        |        |        |        |
 data    caching   async  consistency resilience security   <- parallel, blind to each other
   |        |        |        |        |        |        |
   +--------+--------+--------+--------+--------+--------+
                          |
                     BARRIER (Phase 6 needs all of them)
                          |
              +-----------+-----------+
              |                       |
        sdd-scaling            sdd-tradeoffs
   10x chain, SPOFs,      ledger: chosen / rejected /
   RPO+RTO                 cost / what would flip it
              |                       |
              +-----------+-----------+
                          |
                    sdd-red-team
       contradictions between agents that never met,
       over-engineering, unmodelled failures
                -> PROBLEMS TO RESOLVE
                          |
              SYNTHESIS in the conversation
                          |
                offer -> /lavish (never automatic)
```

## Design rationale

**Triage before spend, because six deep dives is not thoroughness.**
The default failure of a deep-dive tool is producing a sharding strategy for a table that will hold 40,000 rows.
`sdd-triage` marks each of the six areas `deep`, `light` or `skip`, and every call must be anchored in something specific from the brief rather than in the area's general importance.
Security is the one area with a floor - it can only be skipped when the system holds no user data, no credentials and no proprietary content - because it is the area whose skip is most often wrong.
The one human click that confirms the triage costs a second and gates four to six expensive agents.

**Each deep dive gets a question, not a topic.**
The triage's second job is to write the one contested, system-shaped question each selected area must answer.
"Which key do orders shard on, given that the two dominant queries are by-customer and by-date-range and one will be forced into a scatter-gather" produces a decision.
"How should we design the database" produces a textbook chapter.

**The six areas run blind to each other, on purpose.**
This is inherited from the sprint and it matters more here.
Chaining them would let each agent rationalize toward what the previous one decided; running them independently guarantees they disagree at the seams, and the seams are where the real bugs live.
A TTL longer than the staleness budget that same data was granted.
At-least-once delivery landing on a consumer nobody made idempotent.
A data class marked strongly consistent whose reads were put on a replica.
`sdd-red-team` exists to mine exactly those, and it has a specific list of seams to check because they are predictable.

**Phase 6 is a genuine barrier, and it is two agents.**
"Where does it break at 10x" and "what did we give up" both need every deep dive, so this is one of the few places a barrier is honest rather than lazy.
They are split because they are different lenses: `sdd-scaling` traces consequences forward through the design, `sdd-tradeoffs` accounts backward over the decisions.
One agent doing both writes a weaker version of each.

**Every diagram is emitted twice.**
ASCII for the terminal, where the conversation actually lives, and the same content as a ```mermaid block that survives into `/lavish` and renders there.
The ER diagram, the message sequence with its retry and dead-letter arrows - these are the parts of a design that are genuinely faster to see than to read.

**The output is decisions, not observations.**
`sdd-tradeoffs` closes with open decisions, `sdd-red-team` closes with problems rewritten as choices, and the synthesis merges them into one `Problems to resolve` section.
Each entry has options, costs, and a recommendation, so a human can read it once and pick.
This is the section `/lavish` is for: a finding that only describes a worry is not finished work, and it is useless in a visual review where the whole point is to annotate and decide.

**The flip condition.**
Every row of the trade-off ledger carries the concrete observable fact that should make someone revisit it - `if write volume passes ~2,000/s`, `if a second team takes ownership of billing`.
It is the highest-value field in the document, because it converts a decision into a tripwire and it is the reason the ledger is still useful a year later.

## Why it is a command and not a workflow

Same two reasons as `system-design-sprint`, plus one of its own.

The triage confirmation is a real question to a real human, and a `Workflow` subagent runs in the background where it cannot ask.
The output is conversational and file-free by design.
And the input, on the intended path, is *the previous command's output sitting in this conversation* - there is no artifact on disk for a workflow to be pointed at, and creating one purely to hand it to a workflow would defeat the point of both commands.

The cost is the same and is worth naming: no workflow script means no JSON-schema validation of agent output and no `scripts/validate-workflow.mjs` coverage.
The output contracts live in the agent definitions as prose.

## The files

| File | Role |
|---|---|
| `.claude/commands/system-design-deep-dive.md` | The `/system-design-deep-dive` entry point. Orchestrates all six steps in the conversation. |
| `.claude/agents/sdd-triage.md` | Selects which areas get an agent, writes the one question each must answer, names contradictions already visible in the brief. |
| `.claude/agents/sdd-data.md` | Model (ASCII + mermaid ER), queries then indexes, sharding key with its scatter-gather cost, replication, regret list. |
| `.claude/agents/sdd-caching.md` | Cache table with a mandatory staleness budget, write policy per item, stampede and cache-down behavior. |
| `.claude/agents/sdd-async.md` | What to decouple and what stays sync, per-queue delivery guarantee and idempotency key, retries, DLQ, mermaid sequence diagram, backlog behavior. |
| `.claude/agents/sdd-consistency.md` | CAP per data class rather than globally, transaction boundaries, a narrated partition scenario, the sacrifice in one sentence. |
| `.claude/agents/sdd-resilience.md` | Rate limits with real numbers, backpressure and drop priority, timeout/retry amplification, per-dependency degradation, leading indicators. |
| `.claude/agents/sdd-security.md` | Actors, the authorization model and its chokepoint, the object-level access walk, tenancy, classification-driven encryption. |
| `.claude/agents/sdd-scaling.md` | The ordered 10x bottleneck chain with cost classes, the SPOF inventory with keep-or-fix calls, RPO/RTO. |
| `.claude/agents/sdd-tradeoffs.md` | The ledger: decision, rejected alternative, why, cost, flip condition. Plus what was never actually decided. |
| `.claude/agents/sdd-red-team.md` | The adversarial pass. Cross-agent contradictions with both sides quoted, over-engineering, unmodelled failures, claims with no mechanism. |

There is no `.claude/workflows/` directory, for the reasons above.

## What it deliberately does not do

- It does not write a document, and it does not write scratch notes.
- It does not run `/lavish` for you.
- It does not produce code, DDL, migrations, or API specifications. It stops at decisions and diagrams.
- It does not run all six areas by default. A run where the triage marks everything `deep` should be treated as suspicious.

## Smoke test

**Not yet run.**
Status: built, not verified end to end.

Like the sprint, it cannot be smoke-tested autonomously: Step 1 blocks on a human confirming the triage.
The smoke test has to be a real invocation, ideally chained straight off a `/system-design-sprint` run so the Step 0 handoff is exercised on its intended path.

Record here, on the first real run: the design it ran against, how many areas the triage marked `deep` versus `skip` (and whether the skips were defensible), whether the parallel agents produced at least one real seam contradiction for the red team to find, whether the mermaid blocks survived into `/lavish`, and whether the `Problems to resolve` section was actually resolvable as written.

## Related

- `system-design-sprint` - Phases 1-4. Run it first.
- `architecture-designer` - the heavyweight, file-producing alternative for a system whose decisions get revisited for years.
- `tech-blueprint` - a right-sized single technical document from a PRD, when the output needs to live on disk.
