# Functional Test Plan

Reads a PRD, launches **one agent per functional requirement, all at once**, and each writes the complete set of tests for its requirement in natural language. A final agent then makes them findable: it writes an index and injects a `Tests` link into every requirement, wherever that requirement lives.

The output is prose, not code. That is the point - these plans are written before any implementation exists, so they are the contract the real tests get written against rather than a guess at a framework nobody has chosen yet.

## The three things that define it

**Natural language, never test code.** No `describe`, no `it`, no fixtures, no snippets "to get you started". A plan that ships code presumes a runner, a directory layout, and function signatures that do not exist yet, and every one of those guesses becomes something the developer has to undo. Worse, code in the plan makes the plan look finished when the thinking has not been done. Scenarios still name concrete data - real strings, numbers, dates - because a scenario with "some value" in it is not yet a test.

**Fast, by having no review phase.** Requirements are independent by construction: a writer that reached into another requirement would be duplicating coverage, which its instructions forbid. So there is no barrier between them, nothing for a later stage to reconcile, and no critique loop. The whole run is one wide fan-out between two cheap single-agent phases, and wall-clock is roughly the slowest single plan rather than the sum of all of them.

**The link-back is a phase, not an afterthought.** Plans nobody can find are plans nobody reads. The last agent closes the loop so that a developer opening `FR-7` sees its test plan from one line, and it is built to be re-run: an existing `Tests` link gets updated in place rather than duplicated.

## Where it sits

```
product-blueprint  ->  tech-blueprint  ->  functional-test-plan  ->  tdd-blueprint  ->  feature-implementer
    (what)               (how)              (what to verify)          (build order)
```

The technical blueprint is optional but makes the plans materially better: its **Testing Seams** section is what lets each scenario say honestly whether it is cheap to automate, needs a fake, or needs real infrastructure, and its **What Will Bite** section feeds each plan's predictions. Without it the workflow still runs and marks every run note as unknown rather than inventing a stack.

## How it differs from `tdd-blueprint`

Both turn requirements into test specifications, and they are not interchangeable.

| | `functional-test-plan` | `tdd-blueprint` |
|---|---|---|
| Shape | One agent per requirement, one flat fan-out | Frame, strategy, per-slice specs, critique panel, revise loop, sequencer |
| Review | None - speed is the feature | Three adversarial lenses, capped at 2 rounds |
| Produces | One plan file per requirement, plus an index | Six documents: strategy, specs, build order, traceability matrix |
| Answers | "What do we need to verify about this requirement?" | "In what order do we build it, and what proves coverage?" |
| Run it | Early and often, whenever requirements change | Once, when you are about to start building |

Reach for this one when you want the test thinking done today and linked into the PRD. Reach for `tdd-blueprint` when you need a sequenced red-green build order and a traceability matrix to defend.

## Pipeline

```
Inventory (1 agent, sonnet/low - list every FR across index.md and any fr-N.md)
  -> Write (N agents in parallel, sonnet - one per requirement, each writes its own file)
    -> Link (1 agent, sonnet - writes the index, injects a Tests link into each requirement)
```

## Files

- `.claude/agents/test-plan-inventory.md` - produces the worklist. Records each requirement's ID byte-identically (these become filenames and test IDs), its source file, and a one-line summary. Judges nothing: every functional requirement gets an entry, including thin ones.
- `.claude/agents/test-plan-writer.md` - the core agent, run once per requirement. Carries the no-code rule, a nine-category coverage checklist worked in order (happy path, every acceptance criterion, boundaries, empty and absent, invalid input, error states, state and ordering, permissions, applicable NFR bars), a rule for collapsing near-identical scenarios into examples tables, and a banned-words list so no scenario ships with "works correctly" where an observable result belongs. Owns exactly one file and is forbidden from touching any other.
- `.claude/agents/test-plan-linker.md` - the only agent with write access to the PRD, with a deliberately narrow permission: add or update one `Tests` link per requirement, change nothing else. Handles both requirement shapes (a header-table row in a promoted `fr-N.md`, a line at the end of the block for an inline one), works out relative paths per file, and is explicitly idempotent.
- `.claude/workflows/functional-test-plan.js` - the orchestration script.
- `.claude/commands/functional-test-plan.md` - the `/functional-test-plan <prd> [blueprint] [FR ids]` entry point.

## Usage

```
/functional-test-plan docs/prd/expense-tracker
/functional-test-plan docs/prd/expense-tracker docs/tech/expense-tracker/index.md
/functional-test-plan docs/prd/expense-tracker FR-3 FR-7
```

Plans land in `docs/tests/<slug>/fr-N.md`, the index at `docs/tests/<slug>/index.md`, and each requirement in the PRD gains a `Tests` link.

**This run edits the PRD.** Only the link lines, and only one per requirement, but it is a write to a document another workflow produced - worth knowing before running it over uncommitted changes.

## Design rationale

**Why one agent per requirement rather than one agent for the whole PRD.** Test design degrades with breadth in a way most tasks do not: an agent holding twelve requirements writes six good plans and then starts producing thinner ones, because the marginal attention per requirement keeps dropping. One requirement per agent means the twelfth plan gets the same attention as the first. The parallelism is a nice side effect; the real reason is uniform depth.

**Why there is no critique phase, and what replaces it.** This was a deliberate scope decision: the workflow is meant to be run early and often, and a review loop would roughly triple its wall-clock for output that gets revised by hand anyway once someone reads it. What replaces it is not nothing, though - the checks that a reviewer would have caught are pushed into places that cost no extra agent call: a banned-words list that makes "works correctly" a violation rather than a judgment, a required boundaries table with all three columns filled, a mandatory `Covers` field tying scenarios to acceptance criteria, and the script's own deterministic accounting of which requirements got a plan. What genuinely is not checked is scenario *quality*, and the README says so rather than implying the plans are reviewed.

**Why the writers do not receive the requirement text inline.** They get an ID, a summary, and a path, and open the file themselves. Passing full text would mean the inventory agent carrying every requirement's complete body through its own context and out through its schema, which is the whole PRD copied twice before a single plan is written. The summary orients; the file is the source of truth, and the writer's instructions say so explicitly.

**Why the shared context is built once and placed before the per-requirement token.** All N writer prompts share one large prefix (product, blueprint path, NFR summary, date) and differ only in a small block at the end. That ordering is what lets the fan-out hit one prompt-cache prefix instead of missing on every call - the rule documented in `../PROMPT_CACHE_ORDERING.md`, applied here from the start rather than retrofitted.

**Why linking is one agent, not one per requirement.** The links go into a small number of shared files, `index.md` especially. N agents editing one file concurrently is a corruption bug, not a speedup. The link phase is cheap enough that serializing it costs almost nothing.

**Why the linker may only touch link lines.** It is editing another workflow's output, and possibly a document with uncommitted human edits. An unrequested "improvement" from it shows up in someone's diff as noise they have to review and undo. If it notices a real defect it reports it in `notes` and leaves the file alone - which is also why an unfindable requirement becomes an honest `unlinked` entry rather than a link guessed into the nearest heading.

**Why the requirement cap logs every dropped ID.** A silent truncation reads as "the whole PRD is covered" when it is not. Dropped requirements are named in the log, carried into the index's "Requirements with no plan" section, and returned in `notCovered`.

## Smoke test

**Status: not yet run.** The package is anatomy-clean (`node scripts/validate-workflow.mjs functional-test-plan` exits 0), the script parses (`node --check`), and its schemas pass `schema-lint`. Nothing beyond that is proven.

It could not be run in the session that built it: this repo's harness snapshots the subagent registry at session start, so the three agent definitions were not resolvable to the Workflow tool until a later session. The same constraint blocked `tech-blueprint`'s first attempts and is recorded against several packages in `STATUS.md`.

Whoever picks this up next: the three agents have been copied into the repo's top-level `.claude/agents/` (`test-plan-inventory`, `test-plan-writer`, `test-plan-linker`), so a **fresh session** needs no setup. Run:

```
Workflow({scriptPath: 'functional-test-plan/.claude/workflows/functional-test-plan.js',
          args: {prdPath: 'docs/prd/smoke-clipboard-history',
                 outDir: 'docs/tests/smoke-clipboard-history',
                 date: '2026-07-28'}})
```

against the three-requirement test PRD already at `docs/prd/smoke-clipboard-history/index.md`, and record the input, the phases that ran, and pass or fail here. If a `tech-blueprint` run has produced `docs/tech/smoke-clipboard-history/index.md` by then, pass it as `blueprintPath` too - that exercises the seam-reading path, which is otherwise untested.

Specific things to watch, because they are the most likely to be wrong:

- Whether the writers actually stay in prose. The no-code rule is the package's defining constraint and the easiest for a model to violate under a heading called "test plan".
- Whether the linker is genuinely idempotent. **Run it twice** and confirm the second run reports `linksUpdated` rather than adding a second `Tests` row.
- Whether the linker's relative paths resolve from inside `docs/prd/<slug>/` to `docs/tests/<slug>/`, and whether it correctly handles the inline-requirement case, since the test PRD has all three requirements inline in `index.md` with no promoted `fr-N.md`. The promoted-file path is not covered by this input at all.
- Whether `test-plan-inventory` returns exactly three requirements and does not renumber them.

Afterwards, remove the three agents from `.claude/agents/` and delete the generated `docs/tests/smoke-clipboard-history/` along with the `Tests` links it injected into the test PRD.
