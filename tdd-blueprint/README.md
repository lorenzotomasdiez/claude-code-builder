# TDD Blueprint

Turns a PRD - plus whatever `architecture-designer` and `design-blueprint` produced - into the test blueprint a developer actually does TDD from: a layered test strategy, a catalogue of Given/When/Then specs with stable IDs and concrete data, a red-green build order that names the first failing test of every step, and a traceability matrix that proves (or honestly fails to prove) coverage of what was asked for.

**It writes no code.** Not test code, not production code, not configuration. That is the point: if the workflow handed the developer a green suite, TDD would already be over before it started. The output is the contract the developer writes the first failing test against.

## Where it sits

```
client-requirement-shaping -> prd-generator -> architecture-designer + design-blueprint
   -> tdd-blueprint -> feature-implementer (starting red) -> code-review -> qa-suite
```

It is the missing step between "we know what to build and how it is shaped" and "someone starts typing".

## How it differs from the other test workflows in this library

| Workflow | Runs when | Input | Output |
|---|---|---|---|
| `qa-suite` | code already exists | the existing tests and docs | tests written and run, plus a report |
| `test-backfill` | code already exists | under-tested code | new tests, each proven by a mutation check |
| **`tdd-blueprint`** | **before a line of code exists** | PRD, architecture, design docs | **specification documents, zero code** |

The other two work *against* code. This one works *before* it.

## Usage

```
/tdd-blueprint the checkout flow
/tdd-blueprint docs/product-specs/team-invites-prd.md
/tdd-blueprint docs/tasks/on-call-tracker/tasks.md | T3
```

The first two forms are **whole-target**: the command locates any matching PRD, architecture, and design documents in the repo and passes their **paths** (not their contents) to the workflow - `tdd-framer` has its own Read/Grep/Glob tools and reads them itself, so the command's own context never has to hold a copy of the whole document set just to relay it. It writes six documents to `docs/testing/<slug>/`.

The third form is **task-scoped**, feeding from `/task-breakdown`'s output: given a `tasks.md` path and one task ID, `tdd-framer` reads only that row and the documents its `References` column names - not the whole PRD/architecture/design set - and derives exactly one behavior slice from it. Output lands at `docs/testing/<slug>/<taskId>/` instead. This is the cheap, repeatable way to get a blueprint for one row of a task index at a time rather than re-blueprinting an entire product on every task.

It also runs from nothing but a sentence describing what is being built - the framer records the gaps as ambiguities instead of blocking, which is what makes the workflow independently smoke-testable.

## Pipeline

```
Frame (1 agent)
  -> Strategy (1 agent, opus)
    -> Specify (parallel fan-out: 1 agent per behavior slice + 1 per NFR concern)
      -> Critique (3 agents in parallel over the WHOLE spec set, opus:
                   coverage-completeness, testability-determinism, tdd-usability)
        -> Revise (1 agent per flagged group, in parallel, + 1 coverage-gap sweep)
           └─ loops back into Critique, capped at 2 rounds
          -> Sequence (1 agent, opus: build order + traceability matrix)
            -> Author (6 agents in parallel, one per document)
```

The critique uses the "needs_revision if any lens flags it" rule from `prd-generator`: two satisfied lenses do not buy an early exit.

## What it produces

Six documents under `docs/testing/<slug>/`:

1. **`test-strategy.md`** - the layer model and why this shape fits this product, what belongs in each layer and what explicitly does not, the test-double decision for every external dependency, environments and data, the CI gates and what each blocks, exit criteria and quality metrics, and the anti-patterns this codebase invites.
2. **`behavior-specs.md`** - the functional spec catalogue grouped by slice. Each spec has a stable ID (`SPEC-SIGNUP-03`), a layer, a priority, Given/When/Then, concrete data values, what it deliberately does not cover, and what it traces back to.
3. **`tdd-plan.md`** - the red-green working order. One section per step: the goal, the first failing spec restated inline (the one thing the developer types first), the ordered spec IDs for the rest of the step, the done-when condition, dependencies, and a risk flag. Includes a Mermaid flowchart of the step order.
4. **`test-data-and-fixtures.md`** - the fixtures, factories, seed data, boundary-value sets, and time/randomness injection points the spec set implies, collected in one place.
5. **`nfr-test-plan.md`** - the cross-cutting specs for performance, security, accessibility, and resilience/data, each with its threshold and measurement point, and a visible list of every threshold that was assumed rather than stated.
6. **`traceability-matrix.md`** - every requirement, flow, component, and NFR against the specs covering it, with a covered/partial/uncovered status, plus the orphan specs and the uncovered items.

## Files

- `.claude/agents/tdd-framer.md` - reads the upstream documents and produces the testable-surface brief: behavior slices sized to about a day of red-green work, components, external dependencies, non-functional targets, and the honest ambiguities. Designs nothing.
- `.claude/agents/tdd-strategist.md` - the QA architect. Decides the suite shape, the layer boundaries (including what does *not* belong in each), the test-double policy dependency by dependency, environments, CI gates, and exit criteria. Writes no individual specs.
- `.claude/agents/tdd-spec-author.md` - writes the Given/When/Then specs for one functional slice, handles its revision passes, and runs the coverage-gap sweep. Writes no test code.
- `.claude/agents/tdd-nfr-spec-author.md` - writes the specs for exactly one cross-cutting concern (performance, security, accessibility, or resilience-and-data) across the whole product.
- `.claude/agents/tdd-critic.md` - adversarially reviews the whole spec set through exactly one lens against a fixed checklist, and routes each issue to the group that owns the fix.
- `.claude/agents/tdd-sequencer.md` - decides the red-green build order and produces the traceability matrix. Adds no specs.
- `.claude/agents/tdd-doc-author.md` - writes one of the six documents. Re-decides nothing.
- `.claude/workflows/tdd-blueprint.js` - the orchestration script: sequential Frame and Strategy, a parallel Specify fan-out, a capped Critique -> Revise loop with issue routing, then Sequence and a parallel Author fan-out.
- `.claude/commands/tdd-blueprint.md` - the `/tdd-blueprint <target>` entry point, which gathers the upstream docs and writes the result to `docs/testing/<slug>/`.

## Design rationale

**Why the critique is a barrier over the whole spec set, not per slice.** Everywhere else this library prefers `pipeline()` so items do not block each other. Here the most valuable defects are only visible across the set: a requirement nobody covered, two slices testing the same behavior at different layers, a boundary case that fell between two authors. Judging one slice in isolation cannot find any of those, so `parallel()` collecting every group before critique is the honest shape.

**Why three lenses, and why these three.** A spec set can fail in three unrelated ways. It can be *incomplete* (a flow nobody covered). It can be complete but *untestable* (an assertion on private state, a spec that depends on the wall clock, a test that is flaky by construction). And it can be complete and testable but still *unusable for TDD* - the failure this workflow exists to prevent. A spec that assumes an interface only knowable after implementation, or whose `then` a reasonable developer could satisfy two contradictory ways, reads fine and cannot be written first. Only a lens aimed specifically at "could you write this before the code exists" catches it.

**Why issues are routed rather than broadcast.** Critique issues carry the group that owns the fix, so each spec author revises only its own set, in parallel, with only the issues that concern it. Coverage gaps that no existing group owns go to a single sweep call that sees the whole inventory - which is what keeps the sweep from writing duplicates of specs that already exist.

**Why non-functional specs get their own authors.** Nobody writing the "invite a teammate" slice thinks to test that a role-A user cannot reach a role-B resource, or that the invite flow is completable by keyboard alone. Those properties hold across the product or not at all, so they are authored across the product, by an agent that sees every entry point at once.

**Why every spec carries concrete data and a layer.** These are the two fields that decide whether a spec is writable. Data that reads "a valid user" forces the developer to invent the test case, which is exactly the decision the blueprint exists to have already made. A spec with no layer defaults to end-to-end in practice, which is how slow, flaky suites get built one reasonable decision at a time.

**Why the sequencer is a separate opus agent.** Ordering is a real judgment call - hard dependencies, pulling unknowns early, one thin end-to-end slice before breadth, and fast feedback all pull against each other. Bolting it onto the spec authors would mean each one ordering its own slice with no view of the others, which is not an order at all.

**Why the traceability matrix reports gaps loudly.** A matrix with no gaps is usually a matrix that stopped looking. Orphan specs (invented scope) and uncovered requirements (real holes) are listed explicitly rather than smoothed into prose, because they are the most actionable content the workflow produces.

**Model selection.** Following `MODEL_SELECTION.md`: Strategy, Critique, and Sequence run on `opus` - suite architecture, adversarial verification, and build ordering are the judgment calls here. Frame, Specify, Revise, and Author stay on the session default, since they are breadth and drafting work.

## Smoke test

**Post-smoke-test changes, not yet re-verified.** After the PASS run below, `tdd-doc-author` was changed from returning full document text to writing each document to disk itself and returning `{path, charCount, version}`; the spec inventory that used to be pasted into every one of 3 parallel critics' prompts on every round (and into all 6 parallel authors' prompts) is now written once per round to a scratch file (`tdd-scratch-writer`) and read from disk instead; `openIssues` is now capped at 15 with `openIssuesTotal`; and the final return is a compact summary instead of the full brief/specs/critiques/plan/documents. The pipeline shape, phase order, and round-cap behavior described below are unchanged and still evidenced by this run - the write/reference behavior and the new return shape are not.

Also fixed since that run: in task-scoped mode, `docs/testing/<slug>/<taskId>/` now takes `<slug>` from the task index's own parent folder (`docs/tasks/<slug>/tasks.md`) instead of re-slugifying the framer's `brief.product` sentence - the same mismatch `design-system-foundation-v2` and `task-breakdown` had, which drifted from `docs/product-specs/`'s naming. Whole-target mode is unaffected (it still slugifies `brief.product`, same as before, since there is no task index to key off). Not yet re-verified end to end.

Ran a real end-to-end smoke test via a headless `claude -p` session with its working directory set to `tdd-blueprint/` (so the Workflow tool resolves the custom `agentType`s against this directory's own `.claude/agents/`), invoking `/tdd-blueprint` with the trivial input: "A tiny command-line tool that converts a CSV file to JSON, with a --pretty flag for indented output."

Result: **PASS**, with an honest round-cap-reached outcome. 30 agent calls across all seven phases, 0 errors, every schema validated on every call, and all six documents written.

What ran:

- **Frame**: 5 behavior slices (basic conversion, `--pretty`, header mapping, malformed/missing input, escaping edge cases).
- **Strategy** (opus): two layers only - a wide unit base over the pure parse/map/format core (~85% of tests) and a thin real-subprocess CLI layer (~15%). It explicitly dropped the integration, E2E, and contract tiers as ceremony for a single-process CLI, and made 7 test-double decisions.
- **Specify**: 9 groups in parallel (5 slices + 4 NFR concerns), 79 specs.
- **Critique** round 1 (opus): all three lenses returned `needs_revision` - 25 coverage-completeness, 32 tdd-usability, 59 testability-determinism issues, routed to 9 groups plus 5 unowned gaps.
- **Revise**: 8 group revisions in parallel plus the coverage-gap sweep, which added 3 specs (82 total).
- **Critique** round 2 (the cap): **all three lenses still flagged issues** (79 open: 16 / 29 / 34) - the workflow returned the best spec set and carried the open issues into the documents rather than fabricating a clean pass.
- **Sequence** (opus): 14 build steps, 35 traceability rows, 6 orphan specs.
- **Author**: all 6 documents written (755-line `behavior-specs.md`, 412-line `tdd-plan.md`, and the rest).

The output was substantive, not ceremonial. Step 1's first failing spec was a pure `convert(csvString, options)` returning an exact JSON string, chosen to establish the unit harness before any breadth; step 2 deliberately drove one narrow path through the real built binary before adding features. The traceability matrix reported 21 covered / 13 partial / 1 uncovered and named the uncovered item (whether the first row is always a header). The sequencer refused to smooth over contradictions the critics found and instead attached "Known conflict to resolve before writing this spec" callouts to the affected steps - including a real one where the core function and the formatter both claimed ownership of the trailing newline, which would have made two specs unsatisfiable at once.

Honest notes on the run:

- **The round cap was hit with all three lenses still objecting**, the same failure mode already validated by `architecture-designer`, `epic-breakdown`, and `release-readiness`. It is evidence the lenses do real adversarial work rather than rubber-stamping, and it is also the reason the documents carry the open issues rather than a sign-off.
- **The spec set over-specifies a trivial input.** 82 specs for a CSV-to-JSON CLI is more than that product earns, and the CLI-layer count (~37) overran the strategy's own stated cap of 15 - the per-group authors cannot see each other's totals, so nothing enforced the budget. On a real feature-sized input this matters less, but it is a genuine limitation of the parallel Specify fan-out, and the "number of specs" guidance in both spec-author agents is the lever if it needs tightening.
- Several critique issues at the cap were real contradictions between specs written by different groups (a Result-vs-throw error contract, an error-message exactness conflict). These are exactly the cross-group defects the whole-set critique exists to surface, and the two-round cap surfaced them without resolving them all.

Reproduce with: `cd tdd-blueprint && CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0 claude -p "/tdd-blueprint <your input>" --permission-mode acceptEdits --allowedTools "Workflow" "Read" "Write" "Glob" "Grep"`. The env var matters: without it a headless run kills its own background workflow at 600s, which is what happened on the first two attempts. The generated documents from the smoke test were deleted afterwards to keep this package clean and independently copyable.
