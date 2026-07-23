# Release Readiness

A go/no-go release readiness check.
Five independent gates - tests, security, docs, migrations, rollback - each judge the release from their own narrow angle in parallel, blind to each other's verdicts, and a reporter synthesizes them into one report using a mechanical rule: any gate that reports itself blocking makes the overall verdict `no-go`, no exceptions.

This is BACKLOG.md item 12, built to the same anatomy and quality bar as `prd-generator/` (the canonical template).

## Pipeline

```
Scope (1 agent)
  -> Gates (5 agents in parallel: tests, security, docs, migrations, rollback)
    -> Report (1 agent synthesizes a go / conditional-go / no-go verdict)
```

## Why five independent gates instead of one release checklist agent

A single agent working through a checklist tends to rubber-stamp items it is not equipped to judge carefully (a checklist item is easy to tick without real verification) and tends to let a strong signal on one axis (tests look fine) bleed into leniency on another (so it skims the migration). Five agents, each restricted to one gate with an explicit "what you do not do" section, cannot see or be influenced by the other four gates' verdicts - the tests gate cannot excuse a missing rollback plan because the tests passed, and the migrations gate cannot wave through a destructive migration because the docs looked thorough. This mirrors `security-audit`'s and `code-review`'s independent-parallel-lens pattern, applied here to release gating specifically because gates are meant to be genuinely independent controls, not five opinions that get averaged.

## Why a mechanical no-go rule instead of a synthesizer's judgment call

The reporter is explicitly told not to overturn or soften any individual gate's verdict: `blocking: true` on any gate always means `no-go`. This is deliberate - a release gate that a synthesizer agent can talk its way around is not actually a gate. The orchestration script itself computes `verdict` from the raw gate results (not from the reporter's prose), so the mechanical rule is enforced in code, and the reporter's job is only to explain the verdict clearly, not to decide it. `conditional-go` (no blocking gate, but at least one `warn`) exists so residual risk the release owner is implicitly accepting gets written down explicitly instead of disappearing once the overall verdict says "go".

## Files

- `.claude/agents/release-readiness-scoper.md` - reads the release target (a diff, a repo path, or a description) and produces a brief: what is shipping, changed areas, target environment, release type.
- `.claude/agents/release-readiness-gate-tests.md` - actually runs the test suite where a command is discoverable rather than trusting file presence; fails only on a real observed failure. Distilled from `experts/qa-architect.md` and `experts/qa-engineer.md`.
- `.claude/agents/release-readiness-gate-security.md` - checks for hardcoded secrets, known-vulnerable new dependencies, and obviously unsafe patterns directly in the changed areas; deliberately scoped narrower than the full `security-audit` workflow. Distilled from `experts/pentester.md`.
- `.claude/agents/release-readiness-gate-docs.md` - checks whether user-visible changes have a corresponding doc/README/changelog update, and that nothing existing now contradicts the shipped behavior. Distilled from `experts/project-manager.md` and `experts/product-owner.md`.
- `.claude/agents/release-readiness-gate-migrations.md` - checks migration reversibility, backward compatibility during a rolling deploy, and destructive-operation risk. Distilled from `experts/devops-engineer.md` and `experts/software-architect.md`.
- `.claude/agents/release-readiness-gate-rollback.md` - checks whether a concrete, fast rollback path exists (feature flag, or a clean plain revert) versus one that would leave the system broken or data-losing. Distilled from `experts/devops-engineer.md` and `experts/project-manager.md`.
- `.claude/agents/release-readiness-reporter.md` - synthesizes the five verdicts into one report; cannot overturn any individual gate.
- `.claude/workflows/release-readiness.js` - the orchestration script: Scope sequentially, Gates in parallel, Report sequentially; the overall verdict is computed in the script from the raw gate results, not left to the reporter's prose.
- `.claude/commands/release-readiness.md` - the `/release-readiness <description or target>` entry point.

## Usage

```
/release-readiness "the v2.4 checkout release, shipping to production"
/release-readiness "the diff on this branch, targeting a staged rollout"
```

The target can be a plain description or point at a real repo path/diff the gate agents can `Read`/`Grep`/`Bash` into - gates that can inspect real on-disk state (an actual test command, an actual migration file) produce a materially stronger verdict than a purely descriptive target, the same trade-off documented in `security-audit/README.md`'s smoke-test notes.

## Dependency note

Independently runnable with a trivial or mock target. No dependency on another workflow's output, though in practice it is often run after `code-review` and/or `security-audit` on the same change.

## Smoke test

**Status: PASS.**

The smoke test used a self-contained fixture app at `release-readiness/.smoke-scratch/app/` (deleted after this test ran) so the gates had real on-disk state to inspect rather than only a prose description:

- `src/discount.js` + `test/discount.test.js` - a real `applyDiscount` function and its `node:test` tests.
- `README.md` + `FEATURE_FLAGS.md` - documenting the feature and stating it is guarded by a `NEW_CHECKOUT_DISCOUNT` flag that is off by default (the rollback path).
- `migrations/001_add_discount_percent.sql` - an additive, backward-compatible, nullable-column migration with a stated down step.
- `src/payment_client.js` - a deliberately planted hardcoded-looking Stripe secret key, to prove the security gate (and the mechanical no-go rule) actually fires on a real finding rather than the smoke test only exercising the all-clear path.

Ran via a headless `claude -p` session with its working directory set to `release-readiness/`, calling the `Workflow` tool directly with `scriptPath: ".claude/workflows/release-readiness.js"` and `target` pointing at the fixture app.

**Result:** the full pipeline ran end-to-end (scoper -> 5 parallel gates -> reporter, 7 agents total, 0 errors) and every schema validated.

- `gates`: 5/5 reported. `security`: `fail`, `blocking: true` - correctly caught the hardcoded Stripe key in `payment_client.js` with the exact file/line as evidence, and correctly treated it as in-scope because the file was in the release's changed areas, even though the scoper's own summary framed it as "unrelated to applyDiscount". `tests`: `warn` - the agent actually ran the tests two different ways (`node --test`, and the explicit file) and got 2/2 passing, but separately discovered that the officially discoverable `npm test` script (`node --test test/`, a directory arg) genuinely fails with `MODULE_NOT_FOUND` on the installed Node version, and reproduced that failure in an unrelated throwaway fixture to confirm it as a real Node/args quirk rather than a defect in the feature code - a materially useful, unprompted finding, not a scripted outcome. `docs`: `pass`. `migrations`: `pass` (additive nullable column, explicit down step noted). `rollback`: `pass` (flag-guarded, off by default, and the migration itself is additive so even a plain revert stays safe).
- Overall `verdict`: `no-go`, computed mechanically in the script (`blockingGates.length > 0`, from the raw gate results) rather than left to the reporter's prose, matching the single blocking `security` gate.
- The reporter correctly reflected the mechanical verdict without softening it, listed the concrete blockers (remove and rotate the hardcoded key; separately fix the broken `npm test` script), and called out the `tests` warning as a non-blocking but worth-fixing item rather than conflating it with the blocking security finding.

Two minor output-hygiene defects surfaced in the raw agent output (not the orchestration script): the `docs` gate's and `rollback` gate's `reasoning` strings each ended with a stray trailing artifact (`</reasoning>\n</invoke>\n` and a lone `"` respectively) - leftover fragments from the agents' own structured-output generation. These did not affect the schema validation (`reasoning` is typed as a plain string) or the computed verdict, but a future iteration should note this as a known rough edge if it recurs across other workflows' `reasoning`-style free-text fields.

This confirms both the required wiring fact (command -> workflow -> agents path works, every structured agent output validated against its schema) and that the mechanical no-go rule actually blocks a release end to end when a real, planted issue is present, rather than only exercising the easy all-pass path.
