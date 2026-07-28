# Tech Stack Selector

Turns a PRD into a **researched, weighted tech-stack decision matrix**: for each
decision area this product actually has to decide, the real candidates with
sourced evidence, a weighted score, a winner, an explicit statement of what that
winner gives up, and what would flip the decision later.

The output is designed to be handed to `/architecture-designer`: when this
workflow is run against a real PRD file, it writes its document as a sibling of
that PRD and links back to it with one minimal edit to the PRD's header - the
same hub-and-spoke handoff `architecture-designer` itself uses for its own
document. `architecture-designer`'s clarifier already reads the whole PRD, so
it picks up that link on its own and feeds the decided choices to its writer,
which cites them in its "Tech-Stack Decision Records" table instead of
re-deriving a stack from its own head. No pasting one document into another.

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
  writes the document to disk: recommended stack, one matrix per area,
  coherence check, what was NOT decided, risks, architect handoff, sources.
  If given a real PRD path, links back to it with one minimal edit and
  reports only {path, charCount, version, prdLinked} - never the full text.
        |
        v
Critique (3 agents in parallel, opus) -> Revise (author again)
  integration-coherence | evidence-quality | boring-alternative
  each reads the draft from disk by path; needs_revision if ANY lens flags
  anything; capped at 2 rounds, re-reading/re-writing the same file in place
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
  Handles first-draft and revision passes. Writes the document directly to disk
  (`Write` tool) and, on the first pass only and only when a real PRD path was
  given, makes one targeted edit (`Edit` tool) to the source PRD's header Links
  row so it references the new document. Never returns document text, only a
  status (`{path, charCount, version, prdLinked}`).
- `.claude/agents/stack-critic.md` - adversarial review through exactly one lens
  per invocation, against a fixed per-lens checklist, reading the draft from
  disk by path rather than receiving it inline.
- `.claude/workflows/tech-stack-selector.js` - the orchestration script.
- `.claude/commands/tech-stack-selector.md` - the `/tech-stack-selector` entry
  point. Does not write the file itself - `stack-author` already did.

## Usage

```
/tech-stack-selector docs/product-specs/notification-service-prd.md | 2 backend devs, no infra engineer, 3-month deadline, must run on the client's existing AWS account
```

Or with the product described inline (no PRD file, so no sibling path and no automatic link):

```
/tech-stack-selector A B2B invoice reconciliation tool for accounting teams, ~200 customers, CSV imports up to 500k rows | small team, TypeScript shop, GDPR
```

Everything after `|` is treated as constraints. When `prd` is a real path to a
`.md` file, the document lands next to it (`<prd-dir>/<slug>-tech-stack.md`) and
the PRD's Links row is updated to reference it - see Handoff below. When `prd`
is an inline description instead, there is no PRD file to sit beside or link
from, so the document falls back to a standalone path under `docs/architecture/`.

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

The output feeds `/architecture-designer` automatically when this workflow was
run against a real PRD file: the PRD's header Links row now references the
tech-stack document, and `architecture-designer`'s `architecture-clarifier`
already reads the whole PRD, so it picks up that link, reads the document, and
carries the decided choices into its own brief as `techStackDecisions` for
`architecture-writer` to cite in Section 5. No pasting one document into
another, and no direct coupling between the two workflow packages either - each
reads the PRD, neither imports the other's agents or code. Section 7 of the
tech-stack document ("Handoff to the Architect") still states which decisions
the architecture must take as given and must not silently contradict, and what
the architecture still has to decide (component boundaries, data flow,
deployment topology) - that section is for the human reader; the automatic
handoff above is for the next workflow run.

If `tech-stack-selector` was run with an inline product description instead of
a real PRD path, there is nothing to link, and `architecture-designer` will not
discover the document - run it again against the PRD once one exists, or point
`architecture-designer`'s `focus` field at it manually.

## Smoke test

**Status: PASS**, re-run for the write-to-disk/PRD-linking behavior in a
separate consuming project (`workflows-folder-test`), audited via this repo's
`context-bloat-forensics` tool rather than run again from here - see
`../reports/context-bloat-forensics/2026-07-27-workflows-folder-test-tech-stack-selector-run.md`
for the full forensic detail. Summary:

- Ran against a real PRD for a browser-only AI-assisted Markdown editor, with
  shadcn/ui pre-decided as a constraint. Frame -> Research (5 areas) -> Score ->
  Author -> Critique/Revise (capped at 2 rounds) all ran; 19 agent invocations, 0
  errors, all schemas validated.
- The document was written to disk and the PRD's Links row was updated - the
  write-to-disk/PRD-link behavior this refactor was for works end to end.
- Round cap (2) was reached with all 3 critique lenses still returning
  `needs_revision` - the same honest "return the best draft, do not fabricate a
  clean pass" behavior already established elsewhere in this library.
- The audit surfaced three real problems the write-to-disk refactor did not
  cover, since they are a different failure mode: (1) the Author phase receives
  the entire framing-plus-all-scoring-matrices payload inline (92,802 tokens in
  one turn) instead of the research/scoring being persisted to scratch files and
  referenced by path, (2) the critique-to-revise handoff quotes full issue text
  rather than citing section/line references, which grew the document 51%
  between v0.1 and v0.2 without the flagged issues actually converging, and (3)
  `stack-author`'s self-reported `charCount` after a revise pass was off by
  2.2x from the real file on disk (32,500 reported vs 71,448 actual) - fixed
  below. (1) and (2) are follow-up work, not yet fixed, and are a different bug
  class from the write-to-disk fix this refactor already made.

### Prior result (pre-refactor for the write/link behavior; pipeline and critique behavior unchanged)

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

## Hardening after a real-world failure

A later run against a real PRD produced a fully-formed document about nothing.
The cause was upstream of every agent that looked broken: `stack-framer` read the
PRD correctly, then malformed its `StructuredOutput` call three times (it packed
XML-tagged prose into `productSummary` instead of using the schema's separate
fields), and on the fourth attempt submitted a stub - `productSummary: "test"`,
one decision area named `"Test area"`, one criterion named `"test"` - purely to
get the call accepted.

That stub validated, so nothing failed. The researchers honestly reported no
candidates, the scorers honestly reported no winner, the author wrote a document
about its own lack of input, and the three critics spent an Opus round each
reviewing placeholder text. Eleven agents and seven minutes, no error anywhere.

Three changes, because the failure had three separable causes:

1. **Explicit output mechanics on every schema-validated prompt.** The
   `OUTPUT_MECHANICS` helper spells out that each schema field is a separate
   top-level JSON property, that nothing may be XML-wrapped or
   string-serialized, and - the important part - that a rejected call must be
   fixed with real data and never with placeholder content. The same rule is in
   `stack-framer.md` itself so it survives a caller writing their own prompt.
2. **The framer runs on Opus.** It is the load-bearing step: it is the only
   agent whose output every other agent inherits, and it was the cheapest agent
   in the pipeline. That was the wrong place to save money.
3. **Guards that fail loudly.** After framing, a short/placeholder-looking
   `productSummary` or decision-area name throws instead of proceeding, and a
   research step that returns zero candidates drops that area rather than handing
   the scorer an empty matrix. A degraded run now costs one agent, not eleven,
   and it reports the real cause instead of a document full of critique about
   placeholder text.

The general lesson, worth carrying into other workflows: schema validation
proves an agent's output has the right *shape*, not that it has content. Any
step whose output the entire run inherits needs a content check too, and an
agent that can escape a validator by submitting a stub eventually will.
