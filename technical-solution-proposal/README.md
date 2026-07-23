# Technical Solution Proposal

Takes a PRD (or a raw feature description) and produces a proposed
technical solution by having a panel of experts interact, not just review
in isolation.

This is the "panel-debate" pattern, distinct from the independent-parallel-
lens pattern used by `code-review`, `security-audit`, and `perf-investigation`.
There, N lenses look at the same artifact and never see each other's output
until a reporter merges them. Here, six seats propose independently, then
read each other's proposals, raise concrete challenges, and are required to
respond to challenges raised against them - disagreements that survive that
exchange are recorded explicitly as open trade-offs rather than smoothed
over by a synthesizer picking a side.

## Pipeline

```
Scope (1 agent: tsp-scoper)
  -> turns the PRD into a solution-neutral technical brief

Propose (6 agents in parallel: architect, backend, frontend, devops, qa, security)
  -> each seat proposes an approach to the brief, independently, blind to the others

Debate (up to 2 rounds, 6 agents in parallel per round)
  -> each seat sees every current proposal, must respond to challenges raised
     against it in the prior round (concede+revise, or defend), and raises new
     challenges against others - loop ends early if a round produces zero new
     challenges and zero unresolved disagreements

Synthesize (1 agent: tsp-synthesizer)
  -> resolves what debate settled, and explicitly records what stayed
     unresolved as an open trade-off rather than picking a side by fiat
```

## Why panel-debate instead of independent parallel lenses

An independent-parallel-lens workflow (like `code-review`) is right when the
lenses are genuinely orthogonal - a correctness bug and a readability nit
don't need to argue with each other. A technical solution is different: the
architect's pattern choice constrains what the backend seat can build, the
frontend seat's rendering strategy constrains the API shape, and the
security seat's authZ model constrains almost everyone. Reviewing those in
isolation and merging afterward would either produce five proposals that
don't fit together, or a synthesizer quietly overruling four of them with no
visibility into why. Making the seats actually read and challenge each
other's proposals - and requiring an explicit response to every challenge,
not a silent revision - is what surfaces real disagreement (e.g. devops
flags an architecture as unaffordable at the stated scale) instead of
letting it get lost in independent parallel monologues.

## Why a capped debate loop instead of a single challenge round

A single "everyone challenges everyone once" round catches surface
disagreement but not the disagreement that only becomes visible once a seat
has revised in response to someone else's challenge (e.g. backend revises
its data model after the architect's challenge, and that revision now
conflicts with something the frontend seat proposed). The loop re-runs the
full panel against the latest state of every proposal, capped at 2 rounds
(mirroring `prd-generator`'s critique/revise cap) so debate converges
instead of running indefinitely, and exits early the moment a round
produces no new challenges and no unresolved disagreements.

## Why the synthesizer records open trade-offs instead of always resolving

Forcing every disagreement to a single resolved answer would hide genuine,
still-open engineering trade-offs (e.g. "monolith now vs. microservices from
day one" with real arguments on both sides that debate did not settle)
behind a false consensus. The `tsp-synthesizer` agent is explicitly
instructed to only resolve what the transcript shows was actually resolved,
and to surface the rest as an "Open Trade-offs & Disagreements" section with
both sides' reasoning intact - closer to how a real staff-engineer synthesis
of a design review would read.

## Files

- `.claude/agents/tsp-scoper.md` - turns the PRD into a solution-neutral brief.
- `.claude/agents/tsp-panel-*.md` - one subagent per panel seat (architect,
  backend, frontend, devops, qa, security), each distilled from its matching
  `experts/*.md` file (backend also folds in `python-developer.md`, frontend
  folds in `astro-developer.md`), each reused across both the Propose and
  Debate phases via different prompts.
- `.claude/agents/tsp-synthesizer.md` - resolves the debate into one
  coherent proposal document, explicit about what stayed unresolved.
- `.claude/workflows/technical-solution-proposal.js` - the orchestration
  script: Scope -> Propose (parallel) -> Debate (capped-round loop, parallel
  per round) -> Synthesize.
- `.claude/commands/technical-solution-proposal.md` - the
  `/technical-solution-proposal <PRD path or description>` entry point,
  which runs the workflow and writes the result to
  `docs/technical-proposals/`.

## Usage

```
/technical-solution-proposal docs/product-specs/on-call-rotation-tracker-prd.md
```

The command runs the workflow, the workflow orchestrates the eight agents
above, and the final proposal lands in `docs/technical-proposals/`.

## Smoke test

Real end-to-end run, headless `claude -p` session scoped to
`technical-solution-proposal/` (subagent discovery requires the session cwd
to be inside the workflow's own directory - a finding confirmed across all
prior workflows in this repo), against a trivial synthetic brief: "a public
status page service that shows uptime for 5-10 internal services, updated by
a small scheduled job polling health endpoints every 5 minutes, viewed
unauthenticated by non-technical stakeholders, cheap to run and simple to
maintain."

**Result: PASS**, after the smoke-test session itself found and fixed two
real bugs in the orchestration script (kept - see below), then re-ran clean.

- Scope produced a solution-neutral brief (constraints, functional scope,
  NFRs, integration points, open questions) with no architecture smuggled in.
- All 6 panel seats proposed independently in the Propose phase; all 6
  schemas validated, including a genuine build-vs-buy framing from the
  architect seat (an off-the-shelf status-page tool as a real alternative to
  building) that the rest of the debate implicitly built past by assuming
  "build" - a real gap worth noting for future PRDs that should make
  build-vs-buy an explicit brief input rather than leaving it to one seat.
- Debate ran the full 2 rounds: round 1 raised 19 challenges, round 2 raised
  12 more after seats revised. A genuine architectural fork surfaced across
  independent proposals - dynamic/edge-rendered-on-request (architect,
  eventually frontend) vs. build-at-poll-time static publish (devops) - and
  neither side conceded after two rounds of concrete argument on both sides.
- Backend explicitly conceded three challenges backed by real implementation
  reasoning (process topology, storage default, poller-egress hardening) and
  revised accordingly rather than defending by default.
- The synthesizer correctly recorded the unresolved dynamic-vs-static fork
  as an explicit "Open Trade-offs & Disagreements" entry (verified in the
  raw output) instead of silently picking a side, while folding every
  actually-conceded point into the main proposal body.
- 20 agents total (1 scope + 6 propose + 12 debate across 2 rounds + 1
  synthesize), all schemas validated, ~27k-character final proposal document
  covering all required sections.

**Bugs the smoke test found and fixed in `technical-solution-proposal.js`
(kept, not reverted):**

1. A crash risk in the debate-round merge (`current[r.lens]`) when a panel
   seat's result was missing - fixed with a guard.
2. A silent data-loss bug that was the real root cause: `current` was keyed
   by the agent's freeform `lens` field (e.g. `"software-architect"`,
   `"backend/software-developer"`), which never matched the fixed `PANEL`
   seat keys (`"architect"`, `"backend"`, ...) used everywhere downstream -
   so the Debate phase silently ran on zero seats and the synthesizer
   received empty input on the first attempt. Fixed by pairing each round's
   agent results **positionally** with the `PANEL` array instead of trusting
   the agent-echoed `lens` string as a key.

This is the same class of issue iteration 10's dependency-upgrade smoke test
surfaced (a real bug in the target script, found and fixed mid-run by the
smoke-test session itself, not a fabricated pass) - worth diffing what a
background smoke-test session touched beyond the README before assuming it
only ran the workflow unmodified.
