# product-blueprint

A slash command that takes a basic, rough PRD and returns an engineering-grade one, written by a dedicated subagent:

- `index.md` - the structured PRD: evidenced problem, measurable goals, numbered functional and non-functional requirements with acceptance criteria, flows, assumptions, risks.
- `fr-N.md` - any requirement heavy enough to earn its own page, promoted by an explicit split policy rather than by feel.

This is not a Workflow-tool pipeline. It is one command plus one agent definition: `/product-blueprint` runs in the main session and drives `blueprint-prd-author` with the Agent tool.

## What the command does

```
/product-blueprint docs/ideas/expense-tracker.md
```

```
Step 0  resolve the input (file path or inline text), derive docs/prd/<slug>/,
        and resolve the source's gaps into a labeled assumption list handed to
        the author rather than left for it to fill silently

Step 1  blueprint-prd-author -> writes index.md and any fr-N.md

Step 2  read the PRD back and check only what the author cannot see from inside
        its own draft: coverage of the source, split-file integrity, internal
        contradictions. One fix pass.

Step 3  report: paths, requirement counts, assumptions, open questions
```

## Design rationale

**The assumption list is the whole trick.** A basic PRD is under-specified by definition, and every gap the orchestrator leaves unresolved is a gap the author fills mid-draft without saying so. The orchestrator resolves each gap once and labels it, so it lands in the PRD's Assumptions section where a human can correct it. Anything that cannot responsibly be assumed becomes an open question that gets reported instead of silently decided.

**The orchestrator checks the set, not the prose.** Step 2 deliberately only looks for things invisible from inside the draft: a requirement in the source that never made it in, an `fr-N.md` referenced by the index table that does not exist, two sections stating different numbers for the same thing. Judging the document's internal quality is not the orchestrator's job and would just relitigate work the author already did against its own `<verification>` checks.

**One fix pass, then report.** Without a script holding a loop, an unbounded review cycle in the main session is how a command quietly burns an afternoon. Anything still wrong gets reported rather than ground on.

**Structured returns without a schema validator.** A Workflow script could enforce output shapes with JSON schemas; a command cannot. The agent instead carries a "what you return" contract: it writes its files to disk and returns a short status, never document text.

**Document boundaries survive the companion documents being gone.** The author still routes implementation detail and visual detail out of the PRD - a PRD that hardcodes a queue or a hex color goes stale on the first refactor. With no architecture or design doc to link to, it names the document that would own the detail in prose instead of emitting a link to a file nobody wrote. "There is nowhere to put it" is not a reason to absorb it.

## Files

| Path | Role |
|---|---|
| `.claude/commands/product-blueprint.md` | The `/product-blueprint` entry point. Resolves the input, builds the assumption list, launches the author, checks the result, and reports. |
| `.claude/agents/blueprint-prd-author.md` | The only agent that writes PRD prose. Writes `index.md` and any `fr-N.md` to disk. |

## Usage

Copy `.claude/commands/product-blueprint.md` and `.claude/agents/blueprint-prd-author.md` into the target project's `.claude/` directory - the subagent name only resolves when the agent definition is registered in the session's project root (or `~/.claude/agents/`). Then:

```
/product-blueprint docs/ideas/expense-tracker.md
/product-blueprint docs/ideas/expense-tracker.md focus on the approvals flow
/product-blueprint <paste a rough PRD directly>
```

Output lands in `docs/prd/<slug>/`.

The command refuses to run on a bare one-line idea. It expands an existing rough PRD; it does not invent a product.

## Relationship to the other packages

`prd-generator-v2` does this job as a full Workflow-tool pipeline with research fan-out and adversarial critique panels. Use that when you want depth. Use this when you want one solid PRD from one command in one session.

`architecture-designer` and `design-system-foundation-v2` produce the architecture and design documents this PRD deliberately routes detail out to. Run them after this if you want the matching set; the author emits links to them when they exist and prose handoffs when they do not.

## Smoke test

**Not yet run.** Nothing here is proven end to end: not that the subagent returns the status shape its definition asks for, not that the split policy fires correctly on a real input, and not that the orchestrator's check catches anything real in one pass.

There is no anatomy validator covering this package either - `scripts/validate-workflow.mjs` only inspects directories containing `.claude/workflows`, and this one deliberately has none.

Whoever picks this up next: run it once against a trivial basic PRD (a few sentences describing something small), and record here what the input was, which steps ran, and whether it worked. If it breaks, record the blocker and the evidence rather than editing this README to look clean.
