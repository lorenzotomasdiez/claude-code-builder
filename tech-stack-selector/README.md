# Tech Stack Selector

Turns a PRD into a **researched, weighted tech-stack decision matrix**: for each
decision area this product actually has to decide, the real candidates with
sourced evidence, a weighted score, a winner, an explicit statement of what that
winner gives up, and what would flip the decision later.

The output is designed to be handed to `/architecture-designer`, which currently
fills its "Tech-Stack Decision Records" table from the model's own head - its
writer agent is explicitly told not to research beyond its brief. This workflow
is the missing step: it does the research, and the architecture cites it.

## Why this exists (and what it is not)

- `architecture-designer` has a tech-stack table, but no research behind it: no
  candidates compared, no versions, no prices, no sources.
- `spike-research` does real sourced research, but for **one** question ("should
  we adopt X"), not for a whole stack shaped by a PRD.
- `technical-solution-proposal` debates approaches through a panel; it does not
  produce a per-layer evidence table.

This workflow does exactly one thing: decide the stack, on evidence, with the
weights derived from the PRD rather than from fashion.

## Pipeline

```
Frame (1 agent)
  decision areas (max 5, ranked by stakes) + weighted criteria per area
  + hard constraints. Names no technology.
        |
        v
Pipeline, one independent chain per decision area (no barrier between stages):

  Research (1 agent/area)        ->   Score (1 agent/area, opus)
  3-4 real candidates incl.           hard constraints first, then every
  the boring/default option;          cell scored 1-5 with a cited
  versions, license, cost,            justification; weighted total;
  operational burden, known           winner, runner-up, margin,
  failure modes, lock-in;             what the winner gives up,
  every claim sourced.                what would flip it, reversibility.
        |
        v  (barrier - coherence is a cross-area property)
Author (1 agent)
  writes the document: recommended stack, one matrix per area,
  coherence check, what was NOT decided, risks, architect handoff, sources
        |
        v
Critique (3 agents in parallel, opus) -> Revise (author again)
  integration-coherence | evidence-quality | boring-alternative
  needs_revision if ANY lens flags anything; capped at 2 rounds
```

## Files

- `.claude/agents/stack-framer.md` - turns the PRD into decision areas and
  **weighted** criteria traced back to PRD drivers, plus the hard constraints
  that disqualify candidates. Names no technology, researches nothing.
- `.claude/agents/stack-researcher.md` - spawned once per decision area. Gathers
  sourced evidence per candidate (version + as-of date, license, cost at the
  stated scale, operational burden, known failure modes, lock-in and exit cost).
  Scores nothing.
- `.claude/agents/stack-scorer.md` - spawned once per decision area. Applies the
  hard constraints, scores every cell 1-5 with a justification tied to a specific
  evidence item, and produces the winner plus what it gives up. Adds no facts.
- `.claude/agents/stack-author.md` - the only agent that writes document prose.
  Handles both the first draft and revision passes.
- `.claude/agents/stack-critic.md` - adversarial review through exactly one lens
  per invocation, against a fixed per-lens checklist.
- `.claude/workflows/tech-stack-selector.js` - the orchestration script.
- `.claude/commands/tech-stack-selector.md` - the `/tech-stack-selector` entry
  point; writes the result to `docs/architecture/<slug>-tech-stack.md`.

## Usage

```
/tech-stack-selector docs/product/notification-service-prd.md | 2 backend devs, no infra engineer, 3-month deadline, must run on the client's existing AWS account
```

Or with the product described inline:

```
/tech-stack-selector A B2B invoice reconciliation tool for accounting teams, ~200 customers, CSV imports up to 500k rows | small team, TypeScript shop, GDPR
```

Everything after `|` is treated as constraints. The document lands in
`docs/architecture/`. To hand it to the architect, paste it into the
`/architecture-designer` request.

## Design rationale

**Why research and scoring are separate agents.** An agent that finds the
evidence and then grades it has already decided by the time it writes the
scores - it collects what supports the pick it formed on the first search. The
scorer sees only the criteria, the weights, and the evidence table, and is
explicitly forbidden from adding facts: a criterion with no evidence gets capped
at 3 and marked `low-evidence` rather than filled in from memory. That
constraint is what makes the matrix mean something.

**Why the criteria are weighted, and why the framer derives the weights from the
PRD.** This is the whole mechanism by which the PRD, rather than fashion, decides
the outcome. A 3-month MVP with two developers weights "time to first working
version" and "the team already knows it" heavily and "handles 50k rps" near zero;
a regulated data platform inverts that. The framer must trace each criterion to a
driver and is told an even weight spread is an admission it did not think. It is
also forbidden from naming technologies, so it cannot rig a criterion toward a
candidate it already has in mind.

**Why a pipeline for research -> score, and a barrier before critique.** The
decision areas are independent during research and scoring - the datastore chain
can be scoring while the frontend chain is still researching, so wall-clock is
the slowest single chain rather than the sum of the slowest stages. The critique
is different: `integration-coherence` is a property of the whole stack (two
caches, three runtimes, five things to operate for two developers), so it
genuinely needs every area at once. That is the one barrier in the workflow, and
it is there because a cross-item property forced it.

**Why these three critique lenses.** One reviewer defaults to whichever concern
it notices first. These three catch disjoint failure classes:
`integration-coherence` catches a set of individually-defensible choices that no
real team could operate together; `evidence-quality` catches the specific way a
generated document goes wrong, laundering a close, low-evidence call into a
confident sentence (it cross-checks Section 3's prose against Section 3's own
tables); `boring-alternative` catches the failure mode of *this* workflow in
particular - picking the interesting thing. It requires the default option to be
present in every area on equal footing, requires the boring option to have lost
on an evidenced criterion tied to a stated driver rather than on a criterion that
exists to make the novel option win, and asks whether the decision could have
been deleted rather than won.

**Why max 5 decision areas.** A stack document that decides ten things is mostly
noise about defaults nobody was going to change. The framer must rank by stakes,
keep the top 5, and record the rest in "Not Decided Here" with the assumed
default - which is more honest than a matrix comparing four logging libraries.

**Why the author cannot overturn a scorer's winner.** Separation of powers. If
the author disagrees with a decision it must raise it as an open question in
Section 6, where a human sees it, rather than quietly writing up a different
answer than the one the matrix produced.

## Handoff

The output feeds `/architecture-designer`: paste the document into the request.
Section 7 of the document ("Handoff to the Architect") states which decisions the
architecture must take as given and must not silently contradict, and what the
architecture still has to decide (component boundaries, data flow, deployment
topology). `architecture-designer` is deliberately left unmodified - this
workflow, like every other in this repo, is independently runnable and does not
reach into another workflow.

## Smoke test

Ran once, end to end, via a headless `claude -p` session with its working
directory set to `tech-stack-selector/` (so the Workflow tool resolves the custom
`agentType`s against this directory's own `.claude/agents/`), invoking
`/tech-stack-selector` with a deliberately trivial input:

> A small internal tool for a 3-person team to track which client invoices have
> been paid. ~50 invoices a month, CSV export, no public signup. | 1 developer
> part-time, TypeScript, must deploy somewhere free or near-free

Note: the first attempt died at the headless 600s wait ceiling with the workflow
still running. The real run set `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0` and took
roughly 25 minutes wall-clock. Budget for that: the researchers do real web
research and the scorers and critics run on Opus.

**Result: PASS**, with an honest round-cap-reached outcome and one design
deviation worth recording (below).

- **17 agent calls** (1 framer + 4 researchers + 4 scorers + 1 author + 3 critics
  + 1 reviser + 3 critics), 0 errors, all four schemas validated on every call.
- The framer produced **4** decision areas (datastore, hosting, frontend
  delivery, auth) rather than padding to the cap of 5, and pushed API style,
  background jobs, observability, search, and payments into
  `areasDeliberatelyExcluded` with an assumed default each - the "deleting a
  decision beats winning it" behaviour the design targets. Weights were skewed to
  the drivers (cost durability 30, ops burden 30, access restriction 25, runtime
  fit 15 for hosting), not spread evenly.
- Researchers included the boring/default option everywhere (SQLite and Postgres
  in the datastore area, a server-rendered monolith in the frontend area) and
  returned versions, licenses, and free-tier pricing with sources.
- Scorers marked low-evidence cells `*` and every area returned a non-empty
  `whatTheWinnerGivesUp`.
- Critique did real adversarial work. Round 1: all 3 lenses flagged. Round 2
  (the cap): **all 3 still flagged** - integration-coherence 12 issues,
  evidence-quality 15, boring-alternative 10 - so the workflow returned the best
  draft rather than a fabricated clean pass, the same honest cap behaviour
  already seen in `architecture-designer` and `release-readiness`.
- The document caught its own hardest problem: the stated "free or near-free"
  constraint is **not met** by the recommendation (Render Starter, ~$7/month, is
  needed for a persistent disk), and this is disclosed in Section 2, Section 3.1,
  Section 3.2, the risk table, and as blocking Open Question 6 - rather than
  quietly redefining the constraint. The datastore decision came back **low
  confidence on a 0.25 margin** and says so.

**Deviation found by the smoke test.** `stack-author` is told not to overturn a
scorer's winner, only to raise disagreement as an open question. In Section 3.2
it did overturn one: the matrix scored Cloudflare Pages/Workers highest (4.25),
but Workers cannot run a persistent-disk SQLite file or a long-lived Node
process, so the operative recommendation became Render (3.35). The author
disclosed the override in full - kept the original matrix visible, stated the
reason as a cross-cutting constraint, and flagged that Cloudflare's 4.25
double-counted its Access capability with Section 3.4. That is the transparent
version of the behaviour, and arguably the right call, but it is still a rule
being bent, and it exists because the per-area scorers are deliberately blind to
each other - a compute choice that cannot host the datastore choice is invisible
until the coherence stage. The honest options are to let the author disqualify a
winner on a cross-area constraint (making the current behaviour the rule and
requiring the disclosure it already produced) or to add a cross-area
re-score after the coherence check. Left as-is and recorded here rather than
changed on the strength of a single run.

Per the repo's definition of done, this smoke test was run exactly once. It
proves the command -> workflow -> agent wiring and schema validation, not
production quality. The output document
(`docs/architecture/invoice-payment-tracker-tech-stack.md`, 416 lines, all 9
sections present) was deleted afterward as a scratch artifact.
