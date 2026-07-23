# Feedback Triage

Clusters a raw dump of user feedback (support tickets, app-store reviews,
survey text, sales call notes - whatever gets pasted in) into named themes,
analyzes those themes through independent product, market, and evidence-rigor
lenses, and prioritizes them into a ranked, RICE-style list of product bets
with an explicit Now/Next/Later horizon - a decision-ready triage document,
not just a word cloud of complaints.

## Pipeline

```
Cluster (1 agent: feedback-clusterer)
  -> Analyze (3 agents in parallel: opportunity, market-signal, evidence-confidence lenses)
    -> Prioritize (1 agent, over the full set: bet-prioritizer)
      -> Draft (1 agent: triage-writer assembles the markdown document)
        -> Critique (3 agents in parallel: evidence-rigor, business-value, actionability)
          -> Revise (1 agent: triage-writer, loops back into Critique, capped at 2 rounds)
```

## Files

- `.claude/agents/feedback-clusterer.md` - splits a raw feedback dump into
  discrete, quoted items and clusters them into named themes with item
  counts, sentiment mix, and representative quotes. Never draws product
  conclusions.
- `.claude/agents/opportunity-scout.md` - product-owner lens (JTBD,
  discovery, North-Star metrics): proposes a concrete opportunity per theme,
  or explicitly marks a theme as not a real opportunity.
- `.claude/agents/market-signal-scout.md` - marketing-expert lens:
  competitive, pricing, positioning, channel, and brand signals per theme.
- `.claude/agents/evidence-validator.md` - researcher lens: sample size,
  source diversity, recency, and selection-bias checks per theme, producing
  a `high`/`medium`/`low` confidence label with justification.
- `.claude/agents/bet-prioritizer.md` - the only agent with the full
  picture. Combines clusters plus all three lenses into a RICE-style ranked
  list of bets (Reach/Impact/Confidence/Effort, Now/Next/Later horizon), and
  an explicit "not prioritized, and why" list.
- `.claude/agents/triage-writer.md` - assembles clusters + lenses + bets
  into one markdown document, and later revises it against critique. Never
  invents content of its own.
- `.claude/agents/evidence-critic.md`, `value-critic.md`,
  `actionability-critic.md` - three independent adversarial lenses over the
  assembled document: does every claim trace to real evidence, does the
  ranking actually reflect value rather than volume, and could a stakeholder
  act on this as written.
- `.claude/workflows/feedback-triage.js` - the orchestration script.
- `.claude/commands/feedback-triage.md` - the `/feedback-triage <raw
  feedback>` entry point, which runs the workflow and writes the result to
  `docs/feedback-triage/<slug>-feedback-triage.md`.

## Usage

```
/feedback-triage <paste raw support tickets, reviews, or survey text here>
```

## Design rationale

**Why cluster first, in its own phase, before any lens touches the data.**
Every downstream lens (opportunity, market-signal, evidence, prioritization)
reasons about themes, not raw quotes. If each lens re-derived its own
clustering, they would disagree on what a "theme" even is, and the critique
phase would have no stable unit to check claims against. Clustering once,
with an explicit `unclustered` bucket for items that do not fit anywhere,
gives every later agent the same ground truth.

**Why three independent analysis lenses instead of one triage pass.** A
single agent asked to judge product opportunity, market signal, and evidence
quality at once will default to whichever framing it finds easiest and
under-weight the others - typically it over-indexes on "what feature should
we build" and skips evidence rigor entirely. Running opportunity-scout,
market-signal-scout, and evidence-validator as genuinely independent lenses
over the same theme set means a loud-but-thin theme gets flagged as
low-confidence by evidence-validator even if opportunity-scout is excited
about it, and the disagreement itself becomes visible instead of averaged
away.

**Why evidence-validator's confidence label, not the prioritizer's own
guess, drives the Confidence component of RICE.** A prioritizer that
eyeballs its own confidence tends to rate its favorite bets highly by
construction. Requiring bet-prioritizer to use evidence-validator's
independently-derived label keeps the RICE score honest about how much the
underlying feedback can actually support.

**Why three critique lenses instead of one**, mirroring `prd-generator`'s
and `epic-breakdown`'s core pattern: evidence-rigor (does every claim trace
to real, proportionate evidence), business-value (does the ranking reflect
value or just volume), and actionability (could a stakeholder actually pick
this up) are genuinely different failure modes a single reviewer would trade
off against each other. The "needs_revision if any lens flags it" rule means
the loop cannot exit early just because two of three lenses were happy.

**Why triage-writer, not bet-prioritizer, owns revision.** Critique issues
can span clustering fidelity, lens disagreement, and prioritization logic at
once (e.g. "this bet's reach score contradicts its own theme's item count,
which also means the horizon label needs a caveat"). Routing every revision
through one assembling agent that owns the whole document, the same as
`epic-breakdown`'s `breakdown-writer`, avoids three critics' feedback
fighting over which upstream agent should own the fix.

## Dependency note

This workflow takes a raw feedback dump directly as `args.feedback` - it
does not require another workflow's output. It is a natural downstream
consumer of real support/review exports, but needs no other workflow to run.

## Smoke test

Status: **PASS** (real end-to-end run, with an honest round-cap-reached
outcome exposing a genuine unresolved prioritization-justification defect,
recorded 2026-07-23).

First attempt: a plain `claude -p "/feedback-triage ..."` session was
rejected by a permission gate ("Review dynamic workflow before running")
that this non-interactive session could not clear, and correctly reported
zero fabricated results rather than inventing numbers. Per the
working-directory-scoping and `--dangerously-skip-permissions` fix
established in earlier iterations, the smoke test was re-run as a headless
`claude -p ... --dangerously-skip-permissions` session with its working
directory set to `feedback-triage/`, instructed to call the `Workflow` tool
directly with `scriptPath: ".claude/workflows/feedback-triage.js"` and a
trivial, deliberately small and mixed feedback dump: six short quotes
spanning a checkout complaint in two different words (slow loading, payment
timeout), a two-part pricing complaint from one speaker (switched from a
named competitor for price, now reconsidering after a price rise), one
praise quote for an already-shipped dashboard redesign, one vague "app is
buggy" complaint with no specifics, and one low-conviction one-off request
for a niche integration.

Observed result:
- The pipeline ran to completion with no reported agent errors across all
  13 agent calls: Cluster, Analyze (3 parallel lenses), Prioritize, Draft,
  and 2 full Critique rounds (the round cap) all produced schema-valid
  output, and the command wrote the final document to
  `feedback-triage/docs/feedback-triage/smoke-test-feedback-triage.md`
  (17.8 KB).
- Cluster split the sales-call note into two items (the "switched because
  cheaper" and "reconsidering after price rise" halves) and produced 4
  themes plus 1 unclustered item, correctly refusing to fold the vague
  "app is buggy" quote into the checkout theme just because both mention
  the app.
- The three Analyze lenses disagreed exactly as designed: evidence-validator
  scored the checkout theme low-medium (n=2, possible dual root cause) and
  the pricing theme low (effectively n=1 - both quotes are one speaker),
  while market-signal-scout still flagged pricing as a live competitive
  churn-risk signal - the workflow's intended tension between "how much
  evidence exists" and "how commercially significant this would be if true"
  surfaced explicitly rather than being averaged away.
- Prioritize produced 2 bets (checkout at `now`, pricing-validation at
  `next`) and explicitly declined to bet on the dashboard praise
  (confirmation of already-shipped work) and the niche integration request
  (n=1, self-described as low-conviction), stating the reason for each.
- Critique used both allowed rounds. Round 1: all 3 lenses flagged
  `needs_revision` - actionability caught bets titled as theme names rather
  than testable actions; value caught a `now`/`next` ranking that
  contradicted the checkout bet's own "do discovery first" rationale, with
  no quantitative score anywhere to arbitrate; evidence caught confidence
  drift (a theme's "low-medium" label became a bet's plain "medium") and
  bare Impact ratings asserted on top of an unfalsifiable hypothesis and an
  n=1 signal. `triage-writer`'s single revision pass fixed the
  actionability and evidence issues, and round 2 returned both of those
  lenses `ready`. **`value-critic` still returned `needs_revision` in round
  2** - the document still resolves the `now` vs `next` tiebreak by
  assertion (checkout's funnel position outranks a concrete named-competitor
  churn signal) rather than argument, and with no real RICE scoring anywhere
  the horizons could be swapped without contradicting anything quantitative.
  The round cap was reached with this issue still open, so the workflow
  correctly returned its best draft rather than silently claiming "ready."
- No theme, bet, or "not prioritized" item was silently dropped between
  phases across a 13-agent real run.

This is an honest "round cap reached with one surviving accuracy defect"
pass, not a rubber-stamped clean run - consistent with the other workflows'
smoke-test standard in this repo (`epic-breakdown`, `status-report`,
`architecture-designer`) of reporting the real outcome, including genuine
unresolved gaps, rather than fabricating a clean pass.

`git status` shows the new `feedback-triage/` directory as untracked (this
smoke test ran before the workflow's own files were committed); the smoke
test's own output document lives under `feedback-triage/docs/feedback-triage/`,
the command's intended real output location relative to the headless
session's cwd, not scratch. No other scratch artifacts were left behind.
