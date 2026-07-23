# claude-workflows

This repo is a library of reusable Claude Code workflows for building and maintaining products from scratch.
Each workflow is a self-contained, runnable package that orchestrates specialized subagents to do one recurring product or engineering task (reviewing a diff, taking a ticket to a PR, hunting a bug, proposing a technical solution from a PRD, running a security audit, generating a status report, and so on).

The goal is a family of workflows a product team can reuse and maintain, each independently runnable and independently copyable.

## The canonical template

`prd-generator/` is the reference implementation.
Every workflow you build MUST match its anatomy and its quality bar.
Read it in full before building anything, and treat any deviation as a mistake unless a workflow genuinely needs a different shape.

### Required anatomy of every workflow

Each workflow lives in its own top-level directory named after the workflow (kebab-case), and contains:

- `.claude/agents/*.md` - one subagent per role, each with a narrow job and an explicit "what you do not do" section. Mirror the separation of concerns in `prd-generator/.claude/agents/`.
- `.claude/workflows/<name>.js` - the orchestration script. Real control flow, not a linear list: fan out with `parallel()`, pipeline with `pipeline()`, loop review/revise pairs with a round cap, and validate structured agent output with JSON schemas. Follow the shape and conventions of `prd-generator/.claude/workflows/prd-generator.js`.
- `.claude/commands/<name>.md` - the `/<name>` entry point that runs the workflow and writes its output to a sensible location under the repo.
- `README.md` - explains the pipeline as a diagram, the design rationale (why parallel here, why a critique loop there), the files, and usage. Match the depth of `prd-generator/README.md`.

### Quality bar

- Subagents are narrow and adversarial where review is involved.
- Never a single rubber-stamp reviewer where a panel of independent lenses would catch more. Use the "needs_revision if any lens flags it" rule from the template.
- Every workflow's structured outputs are schema-validated.
- READMEs explain the why, not just the what.

## Experts knowledge base

`experts/*.md` holds deep, current knowledge for each product role (product owner, software architect, QA architect, pentester, and so on).
These are SOURCE KNOWLEDGE, not agents.
When a workflow needs a role, distill the relevant `experts/<role>.md` into that workflow's own subagent definition under its `.claude/agents/`.
Keep workflows self-contained: do not share a live agent pool across workflows: share the knowledge, instantiate the agent locally.
If a needed role is missing from `experts/`, create it there first, then use it.

## The claude-code-expert skill

The user-global `claude-code-expert` skill is available to you automatically.
Use it whenever you need exact details about the Workflow tool, subagents, slash commands, schemas, or any Claude Code primitive.
Do not guess Workflow-tool semantics: consult the skill.

## Definition of done for a workflow

A workflow is done only when all of the following are true:

1. It has the full required anatomy above.
2. It has been smoke-tested exactly once: a single real end-to-end invocation with a trivial input, enough to prove the command -> workflow -> agents wiring works and every schema validates. Do NOT run it repeatedly, and do not run expensive real fan-outs more than once: a smoke test proves wiring, not production quality.
3. The smoke-test result (input used, phases that ran, and pass/fail) is recorded in that workflow's README.
4. If the smoke test cannot pass, leave honest notes in the README about the blocker and the evidence. Never fake success.

## Working agreement for autonomous runs

- Build one complete workflow per iteration, in `BACKLOG.md` order. Do not spread one iteration thinly across many workflows.
- You may add workflows you judge valuable beyond the backlog, but never at the cost of the quality bar, and record them in `BACKLOG.md`.
- Preserve existing work. Do not refactor `prd-generator/` or unrelated files unless fixing a real defect.
- Prefer completing and smoke-testing one workflow over starting three.

## Conventions

- Use plain dashes ("-"), never em dashes.
- No auto-added Claude co-author lines in commits.
- Keep each workflow independently runnable: no cross-workflow imports.
