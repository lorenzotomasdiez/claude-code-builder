# Client requirement shaping

Turn a vague client ask into a proposal you can actually build from.

A client says "we need an app for our customers to track their orders".
That sentence hides a job to be done, a set of users nobody has met, a business model nobody has priced, and about four months of scope.
This workflow puts ten experts on it - eight who debate each other and two who judge the result from outside - and produces a proposal document plus a PRD-ready seed.

It writes no code.
The deliverable is a decision, not an implementation.

This is the step **before** `/prd-generator`.
You read the proposal, argue with it, adjust it, and then feed the seed into the PRD workflow.

## Pipeline

```
Intake (1 agent)
  what they asked for  vs  what they actually need
  |
Research (4 agents in parallel, real sources, graded confidence)
  market-and-competitors | existing-solutions | technical-prior-art | user-evidence
  |
Propose (8 agents in parallel, one per panel seat)
  architect-systems | architect-pragmatic | ux-designer   | user-researcher
  product-owner     | business-model      | delivery-lead | domain-skeptic
  |
Debate (8 agents per round, capped at 2 rounds)
  challenges routed by target seat -> each seat concedes or defends -> positions revised
  early exit when no new challenges and nothing unresolved
  |
Challenge (2 agents in parallel - OUTSIDE the panel)
  reductionist      -> proportionate | overbuilt
  devils-advocate   -> worth_building | reframe | do_not_build
  |
  if either objects -> panel gets one more Debate round to answer them directly
  (capped at 2 outside rounds; objections still standing are carried into the synthesis, not buried)
  |
Synthesize (1 agent)
  decide, do not average - and record every disagreement that stayed unresolved
  |
Author (2 agents in parallel)
  proposal.md  (for the client)     prd-seed.md  (for /prd-generator)
```

## The ten experts

**Eight seats debate each other.** Each proposes independently first, then cross-examines the others over capped rounds, conceding where they are wrong and recording what stays unresolved.

| Seat | Owns the question |
|---|---|
| `architect-systems` | What shape survives success, and which decisions are one-way doors? |
| `architect-pragmatic` | What is the smallest boring approach that works, and what can we buy instead? |
| `ux-designer` | What does using this feel like, and how few steps to first value? |
| `user-researcher` | Who actually has this problem, and what are we assuming? |
| `product-owner` | What is this product, precisely, and what is the first version worth shipping? |
| `business-model` | Who pays, for what, at what price, against what cost to serve? |
| `delivery-lead` | In what order, at what rough cost, and what will actually go wrong? |
| `domain-skeptic` | Does this need to exist at all, and if so, is it this? |

**Two outside voices judge the panel.** They were not in the debate and have no position to defend.

| Voice | Job |
|---|---|
| `reductionist` | "You are proposing all of this - **this** is all that is actually needed." Returns a minimal version, a cut list, and a `proportionate`/`overbuilt` verdict. |
| `devils-advocate` | The strongest **honest** case for not building it at all, plus kill criteria. Returns `worth_building`, `reframe`, or `do_not_build`. |

## Design rationale

**Why two architects instead of one.**
A single architect seat silently picks a point on the durable-versus-minimal axis and nobody sees the trade-off being made.
Splitting it forces the argument into the open: the systems architect names the one-way doors, the pragmatic architect attacks speculative generality, and the synthesizer resolves it *per decision* rather than globally.
Each agent file names its own failure mode and requires conceding when the other is right, so this is a real tension rather than two agents talking past each other.

**Why the reductionist sits outside the panel.**
This is the seat the request was really about, and it only works from outside.
Every group of experts, working in good faith, converges on more than is needed - each seat adds what is correct from its own lens and nobody owns the total.
A reductionist who debated alongside them would have their own position to defend by the end.
This one arrives after convergence, reads everything, and owns only the total.
Their test is not "is this good?" but "what happens if we do not build it?", and a cut only survives an objection that names a specific user who abandons the product without the item.
The agent also holds a hard line on what is *not* a legitimate cut - security, accessibility, legal obligations, instrumentation, or anything that leaves a dead end.

**Why the devil's advocate is separate from the skeptic.**
The `domain-skeptic` sits inside the debate and must update when answered - they question whether the *problem* is real.
The devil's advocate arrives at the end and argues the *decision*: that this should not be built, or not in this form.
A panel convened to shape a product will shape a product; nobody in that room is paid to conclude "do not do this".
Their `killCriteria` output is often the single most useful artifact of the run, because it survives into the build.

**Why the outside voices can send the panel back.**
An outside critique that only gets appended to a document is decoration.
When either voice returns `overbuilt`, `reframe`, or `do_not_build`, the panel runs another round with the cut and the case against injected, and every seat must answer directly - accept the cut, or name the user who abandons the product without that item.
Capped at 2 outside rounds, and when the cap is hit with objections standing, that fact is logged and carried into the synthesis rather than quietly dropped.

**Why research runs before the panel, with graded confidence.**
Ten experts arguing from priors produces a confident, unfounded proposal.
Every finding carries a claim, its evidence, a source, and `high`/`medium`/`low` confidence, and thin evidence is reported as a finding rather than padded.
The `user-researcher` seat then keeps that grading visible through the debate, so an assumption never quietly becomes a fact.

**Why the synthesizer decides rather than averages.**
Averaging ten expert positions produces a mush that satisfies nobody and describes no real product.
The synthesizer names which argument won and why, must take a position on every item the reductionist cut, and must record unresolved disagreements rather than smoothing them into false consensus.
A disagreement recorded in the proposal is a gift to the client; the same disagreement hidden is a defect discovered in month three.

**Why the debate is positional, not name-matched.**
Seats are paired with their `parallel()` results **positionally**, never by the agent-echoed `lens` string, which is freeform and unreliable.
Challenges are routed only to seat keys that actually exist, so a hallucinated target lens cannot silently swallow a challenge.

## Files

- `.claude/agents/*.md` - 15 subagents, each with a narrow job and an explicit "what you do not do" section:
  `crs-intake`, `crs-researcher` (x4 in parallel, one per lens), the 8 `crs-panel-*` seats,
  `crs-reductionist`, `crs-devils-advocate`, `crs-synthesizer`, `crs-proposal-writer`, `crs-prd-seed-writer`.
- `.claude/workflows/client-requirement-shaping.js` - the orchestration script. Seven phases, six schema-validated structured outputs, a reusable debate-round function shared by the debate and outside-answer rounds, and two capped loops.
- `.claude/commands/client-requirement-shaping.md` - the `/client-requirement-shaping <ask>` entry point, which writes both documents under `docs/requirement-shaping/<slug>/`.

## Usage

```
/client-requirement-shaping A client wants an app so their customers can track order status without emailing support
```

Or point it at a client brief:

```
/client-requirement-shaping docs/clients/acme/brief.md
```

Output lands in `docs/requirement-shaping/<slug>/`:

- `proposal.md` - the client-facing document: what you asked for, what we think you actually need, who it is for, what we recommend, the first version, what we are **not** building, how it works for the user, what it would take, risks and kill criteria, what we still disagree on, and the honest case against building it.
- `prd-seed.md` - dense, self-contained, assumptions labeled `Assumption:`. Paste it into `/prd-generator` as the idea.

### Arguments

| Field | Meaning |
|---|---|
| `ask` | The client's request. A plain string arg works too. |
| `context` | Optional background on the client, their existing product, or constraints. |
| `debateRounds` | Optional, default `2`. Set to `1` for a cheaper run. |

### Cost

This is the largest workflow in the library: 25 to 45 agent calls depending on how many rounds run, including live web research.
That is the point - it is meant to be run once per client engagement, not casually.
Use `debateRounds: 1` when you want a faster read on a smaller ask.

## Handoff to `/prd-generator`

`prd-seed.md` is written **for the next workflow, not for a human**.
`prd-clarifier` makes labeled assumptions wherever its input is silent, so every gap in the seed becomes an assumption invented downstream - the seed writer's job is to leave as few as possible.
It deliberately carries forward the things a PRD written from a raw idea always gets wrong: real contested non-goals, explicitly labeled assumptions, evidence grading, and any decision the panel did not settle.

The intended loop:

1. Run `/client-requirement-shaping <the client ask>`.
2. Read `proposal.md`. Discuss it, push back, adjust.
3. When you are satisfied, run `/prd-generator` with the contents of `prd-seed.md`.

## Smoke test

**Status: not yet run.** Wiring is verified; the required real end-to-end run is not done.

Verified so far:

- `node --check` passes on the orchestration script.
- All 15 `agentType`s referenced by the script resolve to agent definitions in `.claude/agents/` (checked mechanically, including the 8 panel seats resolved through the `PANEL` table).
- Every structured output is schema-validated: `BRIEF_SCHEMA`, `RESEARCH_SCHEMA`, `PROPOSAL_SCHEMA`, `DEBATE_SCHEMA`, `CUT_SCHEMA`, `CASE_AGAINST_SCHEMA`, `DECISIONS_SCHEMA`.

Not yet proven, and what the real run must confirm:

- That the outside-voice loop actually fires - i.e. that a deliberately overbuilt ask makes the reductionist return `overbuilt` and sends the panel back for an answer round.
- That challenge routing lands challenges on the right seats across rounds.
- That the two authored documents come back with no code in them.

To run it, per the discovery mechanism documented in `code-review/README.md`, the session's working directory must be `client-requirement-shaping/` itself, because Claude Code resolves subagents by walking **up** from the cwd, never down into subdirectories:

```
cd client-requirement-shaping
claude -p "/client-requirement-shaping <a trivial ask>" --dangerously-skip-permissions
```

Use `debateRounds: 1` for the smoke test to keep it near the low end of the cost range.
Record the input used, the phases that ran, and the pass/fail result here afterwards.
