# Workflow backlog

Build these in order. Each is a self-contained workflow following the anatomy and quality bar in `CLAUDE.md`, with `prd-generator/` as the reference.
Build one complete workflow per iteration. Distill the relevant `experts/*.md` into each workflow's own subagents.

These are the recurring tasks a product and engineering team actually does day to day, ordered by how often the workflow would get reused (most-used first), so if a run only finishes the first few, they are the highest-value ones.
You may add workflows beyond this list when you judge them valuable; if you do, append them here with a one-line intent and mark them `[added]`.

## Daily engineering (highest reuse, build first)

1. `code-review` - multi-lens adversarial review of a diff or PR: correctness, security, performance, tests, readability as independent parallel lenses; adversarially verify each finding to kill false positives; output findings ranked by severity. This is the flagship pattern. Experts: software-developer, qa-architect, software-architect, pentester.
2. `feature-implementer` - take a ticket or user story to a PR: clarify the requirement, plan with an architect lens, implement in small slices, write tests, self-review, and draft the PR body. Experts: software-developer, software-architect, qa-engineer.
3. `bug-hunter` - reproduce the bug end-to-end first (as a user would hit it), fan out parallel root-cause hypotheses, converge on the real cause, fix it, add a regression test, and verify. Experts: software-developer, qa-engineer.
4. `test-backfill` - find the highest-risk under-tested code, generate meaningful tests (not coverage theater), and prove each test actually catches a real regression. Experts: qa-engineer, qa-architect, software-developer.
5. `dependency-upgrade` - assess an upgrade: breaking changes, migration steps, security advisories; apply it; verify the build and tests still pass. Experts: software-developer, devops-engineer, pentester.
6. `security-audit` - authorized OWASP plus AI/LLM security review over a diff or service: parallel attack-surface lenses, adversarially verify each finding, output a ranked report. Assumes explicit authorization. Experts: pentester, qa-architect, software-architect.
7. `perf-investigation` - hypothesize performance hotspots, gather evidence, rank issues by impact, and propose fixes with an expected gain for each. Experts: software-architect, software-developer, devops-engineer.

## Product and delivery (recurring, cross-functional)

8. `technical-solution-proposal` - take a PRD and produce a proposed technical solution for how the app gets built, by having the experts interact rather than review in isolation: each expert (architect, backend/dev, frontend, devops, QA, security) puts forward an approach, they cross-examine each other's proposals over a few debate rounds, disagreements are surfaced explicitly, and a synthesis agent resolves them into one coherent proposal with the trade-offs and open questions recorded. This is the panel-debate pattern, distinct from independent parallel lenses. Experts: software-architect, software-developer, python-developer, astro-developer, devops-engineer, qa-architect, pentester.
9. `spike-research` - answer a "should we adopt X" or "how is Y usually solved" question: multi-modal sourced research, an options matrix, and a recommendation with a stated confidence level. Experts: researcher, software-architect, product-owner.
10. `epic-breakdown` - turn a PRD or raw idea into stories with acceptance criteria, estimates, sequencing, and risks. Experts: product-owner, project-manager, software-architect.
11. `status-report` - synthesize git activity and changed files (plus optional ticket input) into a stakeholder-readable status or standup update, tuned per audience. Experts: project-manager, product-owner.
12. `release-readiness` - go/no-go check across tests, security, docs, migrations, and rollback plan; each an independent gate; blocking if any gate fails. Experts: qa-architect, devops-engineer, project-manager.
13. `docs-sync` - detect drift between code and its docs, README, and ADRs, then propose targeted updates. Experts: software-developer, researcher, software-architect.

## Greenfield and product (occasional, lower daily reuse)

14. `architecture-designer` - produce the architecture document set the "Fundamentals of Software Architecture" way for a new service or feature: architecture characteristics, component design, ADRs, tech-stack decision records. Experts: software-architect.
15. `feedback-triage` - cluster raw user feedback into product signals, opportunities, and prioritized bets. Experts: product-owner, researcher, marketing-expert.
16. `qa-suite` [added] - QA a service/area end to end: the qa-architect inventories existing tests and docs and designs a layered test strategy (unit/integration/e2e/contract/performance) with concrete gaps, the qa-engineer writes the missing tests and runs the suite, a coverage critic verifies the delivered tests cover the strategy (capped loop), and a reporter writes up findings and remaining risk. Experts: qa-architect, qa-engineer.
17. `qa-suite-pro` [added] - everything qa-suite does PLUS a real headless browser E2E pass: the architect also derives UI user stories, a story-author persists them as Bowser-format YAML in a timestamped run folder, and one headless browser-runner per story drives playwright-cli step-by-step with screenshots and pass/fail, all synthesized into one report. Assumes playwright-cli installed. Browser how-to ported from the builder repo's Bowser system and embedded in the browser-runner agent. Experts: qa-architect, qa-engineer.
18. `qa-suite-pro-computer-use` [added] - same as qa-suite-pro but the browser is driven headed through Claude's real Chrome (computer-use / Chrome MCP) instead of headless playwright-cli, for authenticated sites and observable automation. Single shared browser instance, so UI stories run sequentially (no parallelism). Requires a browser session (e.g. `claude --chrome`).

## Notes for the builder

- Each workflow must be independently runnable with a trivial or mock input for its smoke test, even when it would normally consume another workflow's output. Document any such dependency in the README.
- Favor the orchestration patterns that fit the task: parallel lenses for review and research, adversarial verify to kill false findings, loop-until-clean for revise cycles, pipeline for per-item independent stages. Do not force a linear chain where a fan-out is more honest.
- If a role you need is not in `experts/`, add the file there first, then build the workflow.
- Prefer finishing and smoke-testing one workflow over starting the next.
