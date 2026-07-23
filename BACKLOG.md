# Workflow backlog

Build these in order. Each is a self-contained workflow following the anatomy and quality bar in `CLAUDE.md`, with `prd-generator/` as the reference.
Build one complete workflow per iteration. Distill the relevant `experts/*.md` into each workflow's own subagents.
You may add workflows beyond this list when you judge them valuable; if you do, append them here with a one-line intent and mark them `[added]`.

## Order and intent

1. `prd-generator` - DONE (reference implementation). Do not rebuild; use as template.
2. `docs-generator` - produce the full pre-code documentation set (vision, scope, glossary, user journeys, requirements) before any code. Consumes a PRD. Experts: product-owner, researcher, project-manager.
3. `architecture-designer` - produce the architecture document set the way "Fundamentals of Software Architecture" prescribes: architecture characteristics, component design, ADRs, tech-stack decision records. Consumes docs + PRD. Experts: software-architect.
4. `api-builder` - scaffold and design the backend/API (contracts, data model, endpoints, non-functional requirements) from the architecture docs. Experts: software-architect, software-developer, python-developer.
5. `frontend-builder` - scaffold and design the frontend from the architecture docs and PRD, defaulting to Astro where it fits. Experts: astro-developer, software-developer.
6. `infra-builder` - design the infrastructure and delivery setup (IaC, CI/CD, observability, environments). Experts: devops-engineer, software-architect.
7. `security-test-suite` - design an authorized security-testing plan and test set (OWASP-driven, plus AI/LLM-specific checks where relevant). Assumes explicit authorization. Experts: pentester, qa-architect.
8. `dev-qa-report` - generate development + QA reports: test strategy, coverage, defect analysis, quality metrics, and a readable status report for stakeholders. Experts: qa-architect, qa-engineer, project-manager.

## Notes for the builder

- A later workflow may assume the artifacts of an earlier one exist; document that dependency in its README, but keep each workflow independently runnable with a trivial/mock input for the smoke test.
- If a role you need is not in `experts/`, add the file there first, then build the workflow.
- Prefer finishing and smoke-testing one workflow over starting the next.
