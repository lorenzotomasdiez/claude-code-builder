# Architecture Designer

Produces the architecture document set that "Fundamentals of Software
Architecture" recommends for a new service or feature: a ranked architecture
characteristics scorecard, a component design, Architecture Decision Records
(ADRs), and tech-stack decision records - end to end from a raw request.

The core discipline this workflow enforces is the book's central claim:
architecture characteristics compete, and a design that does not name its
trade-offs is not finished. Every High-priority characteristic in the
scorecard must state what was traded away for it, every ADR must record a
real rejected alternative and both an upside and a downside, and every
tech-stack choice must state how reversible it is.

## Pipeline

```
Clarify (1 agent)
  -> Draft (1 agent)
    -> Critique (3 agents in parallel: trade-off-rigor, adr-quality, operability)
      -> Revise (1 agent, loops back into Critique, capped at 2 rounds)
```

## Files

- `.claude/agents/architecture-clarifier.md` - turns a raw request into a
  structured brief: problem, scope boundary, a ranked list of driving
  architecture characteristics (with rationale), constraints, scale
  expectations, and existing landscape. Does not design anything itself.
- `.claude/agents/architecture-writer.md` - the only agent that writes the
  document prose: characteristics scorecard, component design, ADRs, and
  tech-stack decision records, following one fixed house structure. Handles
  both first-draft and revision passes.
- `.claude/agents/architecture-critic.md` - adversarially reviews a draft
  through exactly one lens per invocation (trade-off-rigor, adr-quality, or
  operability) against a fixed checklist, and returns `ready` /
  `needs_revision`.
- `.claude/workflows/architecture-designer.js` - the orchestration script:
  Clarify -> Draft sequentially, then fans Critique out to 3 parallel agents
  and loops Critique -> Revise up to 2 rounds, following
  `prd-generator.js`'s proven shape.
- `.claude/commands/architecture-designer.md` - the `/architecture-designer
  <request>` entry point, which runs the workflow and writes the result to
  `docs/architecture/<slug>-architecture.md`.

## Usage

```
/architecture-designer A new notification service that fans out events to email, push, and in-app channels for a B2B SaaS product
```

The command runs the workflow, the workflow orchestrates the agents above,
and the final document lands in `docs/architecture/`.

## Design rationale

**Why a single expert (software-architect) split into three narrow agents
instead of one agent doing everything.** This backlog item names only one
expert, unlike code-review or technical-solution-proposal which draw on
several. The anatomy's "one subagent per role" requirement is still
satisfied by separating the three distinct *responsibilities* a single
expert performs in the book's own practice: clarifying the driving forces
(clarifier), producing the artifacts (writer), and adversarially checking
them against a checklist (critic) - mirroring `prd-generator`'s
clarifier/writer/critic split rather than inventing a fan-out of experts
that do not exist in `experts/`.

**Why three critique lenses instead of one reviewer.** A single reviewer
tends to default to whichever concern it notices first. Splitting into
trade-off-rigor (does the design own its costs), adr-quality (does each
decision record actually decide something), and operability (could a team
run this) catches distinct classes of defect a single pass would blur
together, and the "needs_revision if any lens flags it" rule (same as
prd-generator and every other review-style workflow in this repo) prevents
an early clean exit just because two of three lenses were satisfied.

**Why Clarify and Draft are sequential, not parallel, unlike the
research/critique phases.** There is only one upstream expert lens here (no
market/technical/ux-style fan-out possible), so there is nothing to
parallelize until the critique stage, where three genuinely independent
checklists exist.

## Smoke test

Ran a real end-to-end smoke test via a headless `claude -p` session with its
working directory set to `architecture-designer/` (so the Workflow tool
resolves the custom `agentType`s against this directory's own
`.claude/agents/`), invoking `/architecture-designer` with the request: "A
new internal rate-limiting service that all our backend microservices call
before hitting third-party APIs, to avoid getting throttled or banned by
those providers."

Result: **PASS**, with an honest round-cap-reached outcome. 6 agent calls
(1 clarifier + 1 writer + 3 parallel critics + 1 reviser), 0 errors, both
schemas validated on every call. The clarifier ranked availability,
latency/performance, consistency, scalability, and operability as the top
five driving characteristics, each with a stated rationale. The writer
produced a genuinely substantive first draft (~200 lines): a text
component/context diagram with 8 named nodes and protocol-labeled edges, a
5-row characteristics scorecard where every row named a real trade-off
(e.g. "traded strict, globally-accurate limit enforcement for
survivability: during a Limit Store outage the service falls back to a
conservative local token bucket"), an AP-leaning CAP justification, and
ADRs with real rejected alternatives.

Round 1 critique: all 3 lenses flagged real issues (e.g. `adr-quality`
caught an ADR with no stated downside; `operability` caught a missing
autoscaling trigger metric). The writer revised. Round 2 critique (the cap):
**all 3 lenses still flagged issues** - the workflow correctly returned the
best draft rather than fabricating a clean pass. Open issues at the cap
included: security missing entirely from the characteristics scorecard
despite the service centralizing a new attack surface around provider API
keys; a High-priority Latency/Performance characteristic with no dedicated
ADR; a failure path mislabeled "bulkhead" when it is actually a
circuit-breaker/fallback; and risk mitigations (game-day testing) with no
stated cadence or owner. This is the same honest "round cap reached with a
real, undisputed defect" failure mode already validated by epic-breakdown,
status-report, and release-readiness - further evidence the critique lenses
do real adversarial work rather than rubber-stamping.

The output document was written to
`docs/architecture/third-party-rate-limiting-service-architecture.md`
during the smoke test and then deleted afterward as a scratch artifact;
`git status` confirmed clean afterward.
