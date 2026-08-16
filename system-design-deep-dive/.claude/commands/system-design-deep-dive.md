---
description: Phases 5 and 6 of a system design - component deep dives (data, caching, async, consistency, resilience, security), then 10x bottlenecks, SPOFs and the trade-off ledger. Runs in the conversation, writes no files, ends ready for /lavish.
argument-hint: <nothing, if /system-design-sprint just ran - otherwise the design summary or a path to it>
---

Run the deep dive for: $ARGUMENTS

You are the orchestrator and you stay in the conversation. Like `/system-design-sprint`, this command has no
workflow script and **writes no files** - not a scratch note, not a draft. Its output lives in the chat and
then goes to `/lavish`, where the human resolves the open problems visually.

This is the expensive half of the pair. The sprint is minutes; this is a real fan-out. Spend the effort where
Step 1 says to spend it and nowhere else.

## Step 0 - get the design, without re-interrogating the human

In order of preference:

1. **`/system-design-sprint` already ran in this conversation** - use its output directly. Ask nothing. This is
   the intended path and the human should notice that it just starts working.
2. **`$ARGUMENTS` is a path to a design document** - read it. Reading is fine; this command's no-files rule is
   about writing.
3. **`$ARGUMENTS` is a pasted summary** - use it as given.
4. **Nothing usable** - do not improvise a deep dive on a system you cannot see. Ask for the design in one
   line, or suggest running `/system-design-sprint` first, and stop.

Whatever the source, restate the brief to yourself in five lines - scope, users, scale, binding NFRs, the
architecture's boxes - and pass those five lines to every agent below. Every agent works from the same brief
or their outputs cannot be compared, which is the whole mechanism of this package.

## Step 1 - triage, then one confirmation click

Launch **`sdd-triage`** with the brief. It returns `deep`/`light`/`skip` for each of the six areas, the one
question each deep area must answer, and any contradictions it already sees.

Then call **AskUserQuestion** once, `multiSelect: true`, listing the areas the triage marked `deep` as
preselected options plus any it marked `light`, and ask the human to confirm the split. This is the only
blocking moment in the command, it costs one click, and it exists because the next step spends four to six
expensive agents - a bad selection is worth catching before that, not after.

If the human adds an area the triage skipped, run it. If they drop one, drop it and say in the synthesis that
it was dropped by choice rather than by analysis.

## Step 2 - fan out the deep dives

Launch every selected area **in one message**, in parallel, each with the same five-line brief, the triage's
question for that area, and nothing about what the other agents are doing:

- **`sdd-data`** - model, indexes, sharding key, replication.
- **`sdd-caching`** - what is cached, invalidation, cache-aside vs write-through, staleness budget.
- **`sdd-async`** - what to decouple, delivery guarantees, idempotency, ordering, DLQ.
- **`sdd-consistency`** - CAP per data class, transaction boundaries, the partition narrative.
- **`sdd-resilience`** - rate limits, backpressure, timeouts, retries, degradation.
- **`sdd-security`** - actors, authorization model and its chokepoint, tenancy, encryption.

They run blind to each other on purpose, for the same reason the sprint's three phases do: independent passes
disagree, and the disagreements at the seams (a TTL longer than a staleness budget, at-least-once delivery
onto a non-idempotent consumer) are findings that no amount of sequential politeness would have produced.
Do not chain them, and do not tell one what another decided.

Areas marked `light` get one paragraph you write yourself in the synthesis. No agent.

## Step 3 - Phase 6, after the barrier

Both of these need every deep dive, so wait for all of them, then launch **both in one message**:

- **`sdd-scaling`** - the 10x bottleneck chain, the SPOF inventory, RPO/RTO.
- **`sdd-tradeoffs`** - the ledger of decisions, rejected alternatives, costs, and flip conditions.

## Step 4 - the adversarial pass

Launch **`sdd-red-team`** with the brief, every deep dive, and both Phase 6 outputs. One pass. Its
`Problems to resolve` section is what the human actually works on in `/lavish`, so carry it through intact
rather than compressing it into a bullet list.

## Step 5 - synthesize in the chat

Write the final deep dive directly in the conversation, in this order:

1. **Brief** - the five lines, plus which areas were deep, light and skipped, with the skip reasons. The skips
   justify the document's length and are the fastest thing for the human to challenge.
2. **Per area** - each selected area, compressed to its decisions and its diagram. Keep every ASCII diagram
   for terminal readability, and keep every ```mermaid block intact - those are what `/lavish` renders.
3. **Scaling and failure** - the bottleneck chain, the SPOF table with keep-or-fix calls, RPO/RTO.
4. **Trade-off ledger** - ranked by reversal cost, with the flip conditions. Do not drop the flip column; it
   is the most reusable thing in the whole document.
5. **Problems to resolve** - the red team's list, merged with the trade-off agent's open decisions,
   deduplicated, each with its options and a recommendation. This is the payload.
6. **Contradictions and how you resolved them** - every cross-agent contradiction, which side you took, and
   why. Never silently pick a winner.

Compress hard between the agents and the reader. Six agent outputs concatenated is not a synthesis, and the
human will stop reading before the part that matters.

## Step 6 - hand off

Close with one line offering to run `/lavish` on this, noting that the `Problems to resolve` section is built
to be worked through there - each one a decision with options, annotatable in place. Offer it; do not run it
unless the human says yes.
