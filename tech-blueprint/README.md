# Tech Blueprint

Takes a PRD and produces **one document**: the stack, the infrastructure, the testing seams, what will bite, and the open questions - with as many of those questions as possible already settled by an agent that went and actually ran something.

Two things make it different from the other technical-design packages in this library.

**It is sized by deployment tier, not by ambition.** The first phase's most important output is a single field: is this a `throwaway` demo, a `local` tool, an `internal` service, or a `production` system. Every phase downstream treats that as a budget. A demo that will be shown once and deleted does not get a container, a queue, or an auth layer, and a reviewer whose whole job is catching that runs against every draft.

**Open questions get answered empirically, not deferred.** The designer classifies every uncertainty as `empirical` (a script could settle this in fifteen minutes) or `human` (needs a credential, a budget, a preference). Every empirical one gets its own sandboxed agent with a real terminal that creates a scratch directory, installs packages into it, writes the smallest program that makes the question falsifiable, and runs it. Its verdict must be backed by command output it actually saw - documentation and reasoning are how it decides what to run, never what to conclude. A refuted probe feeds straight back into the design before anyone has written a line of the real thing.

**No ADRs, no scorecard, no artifact suite.** One `index.md`, split only if a section genuinely earns its own file. The decisions, their alternatives, and their reversibility ratings live in one table inside it - that table is the ADR set, compressed to the part anyone rereads. Ceremony documents cost more to maintain than the small builds this workflow is for.

## Where it sits

```
product-blueprint  ->  tech-blueprint  ->  tdd-blueprint  ->  feature-implementer
   (what)               (how, and                (what to test)
                       what will hurt)
```

Section 6 of the output, **Testing Seams**, is written specifically for the next step: what the pure core is, how every external dependency gets faked, and - by name - the first failing test someone writes on day one.

## How it differs from the other design packages here

| Package | Produces | Best for |
|---|---|---|
| `architecture-designer` | ADRs, an architecture characteristics scorecard, component design, tech-stack decision records | A long-lived system with a team that will revisit decisions for years |
| `tech-stack-selector` | A scored comparison across candidate stacks | When the question is genuinely "which of these three", and the comparison itself is the deliverable |
| **`tech-blueprint`** | **One document, right-sized to the tier, with its risky assumptions already tested** | **A small build someone is about to start, where the expensive mistake is over-engineering or an unchecked assumption** |

`architecture-designer` and this package deliberately overlap in input and diverge in output weight. Reach for that one when the artifact suite is what you want; reach for this one when a folder of decision records would outlive the thing being built.

## Pipeline

```
Frame (1 agent, sonnet - reads the PRD, fixes the deployment tier)
  -> Design (1 agent, opus - stack + infra sized to the tier, emits classified open questions)
    -> Probe (0-4 agents in parallel, sonnet - one sandboxed terminal per empirical question)
      -> Reconcile (0-1 agent, opus - runs ONLY if a probe refuted or qualified a decision)
        -> Author (1 agent, opus - writes the single document to disk)
          -> Critique (3 agents in parallel, opus: right-sizing, testability, risk-honesty)
            -> Revise (1 agent, opus - in place, loops back into Critique, capped at 2 rounds)
```

## Files

- `.claude/agents/tech-framer.md` - reads the PRD and returns the brief. Its highest-stakes field is the deployment tier, chosen from four defined tiers with an explicit signal-priority rule and an escape hatch (`tierConflict`) for when the signals genuinely disagree. **Forbidden from naming any technology**, so it cannot anchor the designer to a first instinct. Returns `prdFound: false` rather than inventing a product.
- `.claude/agents/tech-designer.md` - chooses the stack and infrastructure, and classifies every uncertainty as `empirical` or `human`. Carries the rule that catches over-engineering (every component must name the requirement that fails without it) and the one that catches its opposite (below `production`, every shortcut must name what it costs and what would force an upgrade). Also runs the Reconcile phase, where probe evidence outranks its own prior belief.
- `.claude/agents/stack-prober.md` - the agent with a real terminal. One question each, one scratch directory each, a fifteen-minute budget, and an explicit ban on writing outside its sandbox, installing globally, mutating git state, or touching anything the user did not point it at. Its one rule: the verdict must be backed by output it actually saw, and `inconclusive` is a first-class answer.
- `.claude/agents/tech-critic.md` - one lens per invocation, reading the draft from disk by path. Three checklists: `right-sizing` (does anything exceed the tier's budget, and is anything under-specified), `testability` (could you write the first failing test from this document alone), `risk-honesty` (do the probe results appear accurately, and is anything asserted as fact that was only believed).
- `.claude/agents/tech-doc-author.md` - the only agent that writes prose. Handles first draft and revision, writes files itself, and **measures character counts by reading its own files back from disk** rather than self-estimating. Carries the split policy and the probe-fidelity rules.
- `.claude/workflows/tech-blueprint.js` - the orchestration script.
- `.claude/commands/tech-blueprint.md` - the `/tech-blueprint <prd-path> [tier] [notes]` entry point.

## Usage

```
/tech-blueprint docs/prd/expense-tracker
/tech-blueprint docs/prd/expense-tracker throwaway
/tech-blueprint docs/prd/expense-tracker/index.md focus on the ingestion path
```

Output lands in `docs/tech/<slug>/index.md`. Probe scratch work lands in `.tech-blueprint-probes/<slug>/` and is safe to delete.

The tier argument is optional and usually better left out - `tech-framer` infers it from the PRD, and an inferred tier comes with the evidence that justified it. Pass one explicitly when you know something the PRD does not say.

## Design rationale

**Why the deployment tier is a separate phase rather than a field the designer fills in.** If the same agent both decides how serious a build is and chooses its technology, the tier becomes a post-hoc justification for the stack it already wanted. Splitting it means the tier is fixed, with evidence, by an agent that is not allowed to name a single technology - so the designer inherits a budget rather than setting its own.

**Why the prober is a separate agent with different tools, not the designer running a command.** Three reasons, and the third is the real one. First, tool scope: the designer has no Bash and cannot accidentally mutate anything, while the prober has Bash and a sandbox contract written specifically to constrain it. Second, parallelism: four questions get four terminals at once. Third, and most importantly, **an agent that forms a hypothesis is the worst agent to test it**. The prober is given the hypothesis explicitly and told that refuting it is the most valuable outcome available, which is a very different job from confirming your own reasoning.

**Why Reconcile is conditional.** Running the designer again to review probes that confirmed everything it already believed is a paid agent call whose best case is a restatement. It runs only when a probe returned `refuted` or `partial` - when there is genuinely something to change. When nothing was refuted, the author still receives the raw probe results and writes the findings section from them directly.

**Why `right-sizing` is the first critique lens.** Over-engineering is this document's default failure mode and it always arrives dressed as professionalism: nobody gets criticized in review for adding Redis. The checklist therefore does not ask "is this reasonable" - it asks, for every single component, which requirement fails without it, and treats "best practice", "future-proofing", and "when we scale" as findings on sight. The lens cuts both ways though: a `production` design that says "we'll use a database" fails it too, for being undecidable rather than simple.

**Why the critique lenses read from disk instead of receiving the draft inline.** The document is already written. Passing it into three critic prompts plus a reviser is the same document paid for five times, and this repo has two context-bloat audits in `reports/` about exactly that pattern. The critics get a path; they have Read tools.

**Why "needs_revision if any lens flags it".** Same rule as every review workflow in this library. Two satisfied lenses do not buy an early exit, and a critic that weighs importance instead of reporting honestly is a critic that rubber-stamps.

**Why the author measures its own files by reading them back.** A real run of the sibling `tech-stack-selector` workflow had its author self-report 32,500 characters for a file that was 71,448 on disk (`../reports/context-bloat-forensics/2026-07-27-workflows-folder-test-tech-stack-selector-run.md`). Any size discipline built on self-estimated counts is decorative. This package requires a read-back from day one.

**Why probes are capped and every dropped question is logged.** Each probe is a real terminal installing real packages. An over-eager designer emitting twenty empirical questions must not silently become twenty sandboxes - and a cap that drops questions quietly reads as "everything was checked" when it was not. Dropped questions are named in the log and carried into the document as open questions for a human.

**Why the workflow refuses to run without a PRD.** Same hub-and-spoke reasoning as `architecture-designer`: the PRD is the one place a reader starts, and a technical design invented from a one-line description is a design for a product nobody specified. `tech-framer` returns `prdFound: false` and the workflow throws.

## Smoke test

**Status: attempted, blocked. Not proven end to end.**

The run was set up and launched twice, and failed both times in the same place, before any agent did any work.

- **What was prepared**: a trivial PRD written for the test at `docs/prd/smoke-clipboard-history/index.md` - a personal clipboard-history CLI, described explicitly as running on one laptop and never deployed, chosen because a correct run should land on a low tier and a small stack. The five agent definitions were copied into the repo's top-level `.claude/agents/` (how this repo's harness resolves subagents - see `archive/prd-generator/README.md`).
- **What was run**: `Workflow({scriptPath: 'tech-blueprint/.claude/workflows/tech-blueprint.js', args: {prdPath: 'docs/prd/smoke-clipboard-history', outDir: 'docs/tech/smoke-clipboard-history', probeDir: '.tech-blueprint-probes/smoke-clipboard-history', date: '2026-07-28', maxProbes: 2}})`, twice.
- **The blocker**, identical both times, 2.3s and 6.0s in:

  ```
  Error: agent({agentType}): agent type 'tech-framer' not found.
  Available agents: claude, claude-code-guide, context-bloat-forensics-critic,
  context-bloat-forensics-discoverer, context-bloat-forensics-narrator,
  context-bloat-forensics-synthesizer, Explore, general-purpose, Plan, statusline-setup
  ```

  The available-agents list is exactly the contents of `.claude/agents/` **as it was when the session started**. The agent registry is snapshotted at session start, so definitions copied in mid-session are invisible to it no matter how many times the workflow is re-invoked. This is a harness constraint, not a defect in this package: the four `context-bloat-forensics-*` agents resolve fine because they were on disk before the session began.
- **What this does and does not tell us**: `Frame` failed at the first `agent()` call, so nothing downstream ran. No document was written, no probe directory was created, and no schema was exercised. The only things actually verified are that the package is anatomy-clean (`node scripts/validate-workflow.mjs tech-blueprint` exits 0) and that the script parses (`node --check`, clean).
- **What the next session must do**: the five agents are already sitting in the repo's top-level `.claude/agents/` (`tech-framer`, `tech-designer`, `stack-prober`, `tech-critic`, `tech-doc-author`), so a **fresh session** will pick them up with no setup. Re-run the exact command above, then record the phases that ran and the result here. Afterwards, remove those five files from `.claude/agents/` and delete `docs/prd/smoke-clipboard-history/`, `docs/tech/smoke-clipboard-history/`, and `.tech-blueprint-probes/`.
- **What to watch for in that run**, since these are the paths most likely to be wrong and none of them has been exercised: whether `tech-framer` returns `local` rather than something heavier; whether the conditional `Reconcile` phase correctly skips when no probe is refuted; whether `stack-prober` respects its scratch-directory sandbox; and whether the author's read-back character count matches the real file size on disk.
