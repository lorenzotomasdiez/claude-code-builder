# Design Blueprint

Turns a raw product idea (or a PRD) into a set of buildable UX/UI design documents by running a cross-examining panel debate. A UX/UI designer, a product owner, and a growth/marketing lens each propose how the product should be designed, then argue it out - the point of tension being *what works best for the user* vs *what is most profitable* vs *what is actually worth building first*. A synthesizer resolves the debate into one coherent set of decisions, and four document authors write it up as a design doc set the team can execute against.

## Usage

```
/design-blueprint a mobile app that helps freelancers track billable hours and invoice clients
```

or point it at a PRD:

```
/design-blueprint docs/prd/time-tracker.md
```

The command runs the workflow and writes the document set to `docs/design/<slug>/`:

- `design-decisions.md` - product direction, prioritized build list (must / should / later), resolved trade-offs, open questions
- `user-flows.md` - the core flows step by step with the empty/error/loading states and a Mermaid flowchart
- `screens-and-ui.md` - screen inventory, information architecture, components and states, primary action per screen
- `landing-page.md` - the landing page section by section, value proposition, proof, single CTA, conversion rationale

## Pipeline

```
Frame (1 agent: db-framer -> solution-neutral design brief)
  -> Propose (3 agents in parallel: db-panel-ux, db-panel-product, db-panel-growth each propose independently)
    -> Debate (same 3 seats, capped at 2 rounds: cross-examine, concede/defend, revise)
      -> Synthesize (1 agent: db-synthesizer -> structured design decisions)
        -> Author (4 agents in parallel: db-doc-author writes each of the 4 documents)
```

## How it maps to the request

- **Frame** turns the informal idea into a shared, solution-neutral brief (target users, jobs-to-be-done, business goal, success metrics) so the three seats debate the same target instead of talking past each other.
- **Propose** is a parallel fan-out: each seat puts forward its view first, in isolation, so no seat anchors the others before positions are on the table.
- **Debate** is the heart of it, and it is a *panel cross-examination*, not independent parallel review. Each seat challenges concrete points in the others' proposals - the UX seat resists a conversion tactic that buries time-to-value, growth resists a scope cut that removes the feature the positioning rests on, product forces the hard cut - responds to challenges against itself (conceding and revising, or defending), and flags what stays unresolved. Two rounds, with early exit if the panel converges.
- **Synthesize** resolves the tensions into one structured set of decisions, recording *why* each trade-off resolved the way it did, and surfacing genuinely unresolved tensions as open questions rather than silently siding with one seat.
- **Author** writes the four documents in parallel from the same resolved decisions, so the flows, screens, and landing page are all consistent with the agreed direction.

## Why a debate instead of three parallel reports

The whole value here is the friction between "best experience" and "most profitable". Three experts writing isolated reports would each optimize their own axis and hand you three documents that quietly contradict each other. Forcing them to cross-examine surfaces the real trade-offs - and makes the synthesizer resolve them on the record - so the team gets one coherent direction with the reasoning attached, not three wish-lists to reconcile themselves. This is the same panel-debate pattern as `technical-solution-proposal`, pointed at product/UX/business instead of engineering.

## Why a framer up front and a synthesizer at the end

Without the framer, each seat would infer a slightly different product and the debate would be about scope, not design. Without the synthesizer, you would get a transcript, not a decision - and the "what do we actually build" backbone (the prioritized must/should/later list) is exactly what the request asked for.

## Files

- `.claude/agents/*.md` - db-framer, db-panel-ux, db-panel-product, db-panel-growth, db-synthesizer, db-doc-author, each with a narrow job and an explicit "what you do not do" section. The panel seats are distilled from `experts/ux-designer.md`, `experts/product-owner.md`, and `experts/marketing-expert.md`.
- `.claude/workflows/design-blueprint.js` - the orchestration script: sequential Frame, parallel Propose, capped Debate loop, sequential Synthesize, parallel Author.
- `.claude/commands/design-blueprint.md` - the `/design-blueprint <idea or PRD>` entry point, which writes the document set to `docs/design/<slug>/`.

## Smoke test

Wiring verified: `node --check` passes on the orchestration script, and every `agentType` referenced in the workflow resolves to an agent definition in `.claude/agents/` (db-framer, db-panel-ux, db-panel-product, db-panel-growth, db-synthesizer, db-doc-author). A full end-to-end run should be done once against a real idea to confirm the four documents render as expected; it was not run inline to avoid spending tokens on a live fan-out. Run `/design-blueprint <a real idea>` to exercise it end to end and record the result here.
