# Tenant Isolation Audit

Authorized multi-tenant isolation audit of a diff or a described service surface.
Four independent isolation lenses (data-layer, authz/session, background-jobs, integrations/AI-context) audit the same target in parallel, every individual finding is then adversarially re-checked by a verifier that has no stake in being right, and only what survives verification reaches the final ranked report with remediation guidance.

This is not a BACKLOG.md line - it was added after research (see below) found tenant isolation is the single class of defect the existing library has no workflow for, even though `security-audit` already covers OWASP-plus-AI/LLM concerns broadly. Built to the same anatomy and quality bar as `prd-generator/` (the canonical template) and closely mirrors `security-audit/`'s independent-lens-plus-adversarial-verify pattern, applied here to the concern that is specific to running a SaaS product rather than any single application: keeping one customer's data out of another customer's reach.

This workflow assumes explicit authorization to review the target, the same framing `security-audit` uses.

## Why this workflow, and not something else

Research for this addition (July 2026) looked at three angles before picking this:

- **Community/industry direction.** Multiple 2026 primary sources on multi-tenant AI-era SaaS architecture converge on the same point: a tenant-boundary failure in a system with an LLM/agent layer is qualitatively worse than in traditional SaaS, because a leaked row does not just return the wrong response with a bounded blast radius - it can enter an agent's reasoning chain and be acted on through a further tool call (see Blaxel's "Multi-tenant isolation for AI agents" and Prefactor's "MCP Security for Multi-Tenant AI Agents" write-ups). Four concrete leak paths recur across these sources: the prompt itself, retrieval/RAG context, agent tool calls, and the response - each a way for tenant A's data to reach tenant B's context without ever crossing a database join. Separately, "scaffold me a SaaS app with auth, billing, and a dashboard" is now treated as a baseline prompt AI coding agents are expected to handle well (DEV Community, "How AI Coding Agents Will Choose Your SaaS Boilerplate in 2026") - meaning agents are already routinely asked to build the exact shared-schema, JWT-tenant-claim, background-job architectures this workflow reviews, which is exactly where a scaffolded-fast, reviewed-never gap opens up.
- **Repo gap, not memory.** `BACKLOG.md` and `STATUS.md` were read in full first. All 30 catalogued workflows already exist with real anatomy (`.claude/agents`, `.claude/workflows`, `.claude/commands`, `README.md`) - the backlog itself is fully built, which ruled out "pick the next unclaimed line" as the actual next-highest-value move. `security-audit` is the closest existing workflow (OWASP Top 10 plus AI/LLM, five parallel lenses, adversarial verify) but its lenses are explicitly injection / authn-authz-session / secrets-crypto / supply-chain-infra / AI-LLM - none of them is scoped to "does this query, job, or integration leak across tenants," which is a distinct failure class (a query can be perfectly free of SQL injection and still return another tenant's row by a missing `WHERE tenant_id = ...` clause). No existing workflow, expert file, or reports directory in this repo covers tenant isolation specifically.
- **What "SaaS builder" actually needs beyond generic software.** The repo's other workflows (`code-review`, `bug-hunter`, `security-audit`, the whole greenfield pipeline) are correct for any product, not specific to SaaS. Multi-tenancy is the one architectural concern that is inherent to "SaaS" as a category rather than to software generally - a single-tenant desktop app or a personal CLI tool has no equivalent failure mode. That made it a better fit for "make this repo a better SaaS builder workflow library" than, for example, another general code-quality or delivery workflow the backlog already covers in some form.

Alternatives considered and set aside: a `billing-integration-reviewer` (real but narrower - one vendor integration, not an architectural property that recurs across the whole codebase) and an `AGENTS.md`-generator (a real 2026 convergence point per the research, but it is a documentation/onboarding concern for *this* repo's own consumers rather than a workflow a SaaS team runs against their product, so it did not fit the "workflow library" shape this repo builds).

## Pipeline

```
Scope (1 agent)
  -> Audit (4 agents in parallel: data-layer, authz/session, background-jobs, integrations/AI-context)
    -> Verify (1 agent per finding, in parallel, independent of the lens that raised it)
      -> Report (1 agent, ranks, deduplicates, and adds remediation guidance to surviving findings)
```

The Audit and Verify stages are pipelined per lens, not run behind one big barrier: the authz lens's findings start verification as soon as authz finishes, without waiting for the (potentially slower) integrations lens to also finish. Wall-clock time is bounded by the slowest single lens-plus-its-verification chain, not the sum of every stage.

## Why four independent lenses instead of one auditor

A single auditor asked to "check for tenant leaks" tends to anchor on the most obvious surface (usually the request-path data query) and skim the rest - especially background jobs and third-party/AI integrations, which are less visible than a request handler but are exactly where ambient request-scoped state silently stops applying. Four agents, each restricted to one isolation surface with an explicit "what you do not do" section, cannot skip their assigned concern and cannot bleed into someone else's - the data lens is not allowed to comment on session/JWT derivation, the jobs lens is not allowed to flag a webhook. That separation is enforced by each agent's system prompt, mirroring `security-audit`'s per-lens design.

The integrations lens is deliberately the one that owns LLM/agent prompt and retrieval-context leakage (the four-leak-path finding from the research above), kept distinct from `security-audit`'s AI/LLM lens: this workflow's integrations lens asks "does this prompt/retrieval/tool-call carry another tenant's data," not "is this prompt injectable" - a different question, answered by a different agent, even when both point at the same code.

## Why verify every finding instead of trusting the lens

Lenses are instructed to be adversarial, which makes them prone to over-flagging (a false "critical" cross-tenant leak is exactly the failure mode adversarial prompting invites, and a report full of false positives trains reviewers to ignore it). The `tenant-isolation-audit-verifier` agent is spawned once per finding, is blind to which lens raised it, and is explicitly told to try to refute the finding against the real target code - defaulting to `rejected` when it cannot confirm the cross-tenant scenario is actually reachable. This is the same adversarial-verify pattern used in `code-review`, `bug-hunter`, and `security-audit`, applied here because an unverified isolation report is actively harmful: it either causes alarm over a query that was already correctly scoped by a helper the lens missed, or gets ignored wholesale once a team learns to distrust it.

## Files

- `.claude/agents/tenant-isolation-audit-scoper.md` - maps the tenancy model, tenant-context carriers, and boundary-crossing entry points so four lenses do not each re-derive the same context.
- `.claude/agents/tenant-isolation-audit-data-lens.md` - unscoped queries/writes, missing tenant columns, unnamespaced cache/index keys, unscoped migrations, admin-bypass paths, cross-tenant exports. Distilled from `experts/software-architect.md`'s data-architecture and multi-tenancy-adjacent fundamentals.
- `.claude/agents/tenant-isolation-audit-authz-lens.md` - client-trusted tenant IDs, session/token boundary on tenant switch, role checks missing the tenant-membership half, impersonation/support tooling, API-key scope. Distilled from `experts/pentester.md`'s broken-access-control and IDOR knowledge.
- `.claude/agents/tenant-isolation-audit-jobs-lens.md` - job payload scoping, unscoped worker fan-out, dead-letter/retry queue exposure, shared connection/pool state, dedup-key collisions, coarse-grained rate limits/quotas. Distilled from `experts/devops-engineer.md`'s distributed-systems and CI/CD-delivery fundamentals.
- `.claude/agents/tenant-isolation-audit-integration-lens.md` - webhook attribution, per-tenant credential lookup, cross-tenant exports/reports, LLM/RAG context and agent tool-call scoping, shared external services. Distilled from `experts/software-architect.md`'s AI/LLM-systems section and `experts/pentester.md`'s AI/LLM 2026-trends section.
- `.claude/agents/tenant-isolation-audit-verifier.md` - the adversarial verifier, spawned once per finding.
- `.claude/agents/tenant-isolation-audit-reporter.md` - deduplicates, ranks, and adds remediation guidance to verified findings into one markdown report.
- `.claude/workflows/tenant-isolation-audit.js` - the orchestration script: Scope sequentially, Audit/Verify pipelined per lens, Report sequentially.
- `.claude/commands/tenant-isolation-audit.md` - the `/tenant-isolation-audit [target]` entry point. Resolves the diff or service description (PR, ref range, working-tree default, or a plain description), confirms authorization, calls the workflow, and surfaces the report plus the raw-vs-verified finding counts.

## Usage

```
/tenant-isolation-audit
/tenant-isolation-audit 142
/tenant-isolation-audit main..my-branch
/tenant-isolation-audit "our orders API and the nightly export job behind it"
```

With no argument it audits the working tree's pending diff against the repo's base branch. With a PR number it uses `gh pr diff`. With a ref range it diffs that range directly. With a plain description it audits the described surface directly (useful for a service that has no in-flight diff to point at).

## Dependency note

Independently runnable with a trivial or mock target, same as `security-audit`. No dependency on another workflow's output, though in practice it is often run after `code-review` and/or `security-audit` on the same change, or ahead of `release-readiness` before a release that touches tenant-scoped data paths.

## Smoke test

**Status: PASS.**

The smoke test used a self-contained fixture app at `tenant-isolation-audit/.smoke-scratch/app/` (deleted after this test ran) so the lenses had real on-disk state to inspect rather than only a prose description:

- `README.md` - states the tenancy model (shared schema, single `orders` table with a `tenant_id` column) and that tenant identity comes from the JWT `tenantId` claim.
- `src/auth.js` - a real `requireAuth` middleware that derives `req.tenantId` strictly from a verified JWT claim, never from client input (a correct control, included so the lenses had a real contrast to compare planted bugs against).
- `src/orders.js` - `GET /orders/:id` (a deliberately planted bug: `SELECT * FROM orders WHERE id = $1` with no `tenant_id` filter, even though `req.tenantId` is available) alongside `GET /orders` (correctly scoped by `tenant_id`, as a control).
- `src/db.js` - a bare `pg` pool wrapper, no tenant-aware ORM scope or row-level security.
- `jobs/exportJob.js` - a deliberately planted bug: a nightly export job that runs `SELECT * FROM orders` with no tenant filter and writes every tenant's rows into one shared `/tmp/nightly-export.csv`.

Ran via a headless `claude -p` session with its working directory set to `tenant-isolation-audit/`, calling the `Workflow` tool directly with `scriptPath: ".claude/workflows/tenant-isolation-audit.js"` and `target` pointing at the fixture app as real on-disk state (not a diff).

**Result:** the full pipeline ran end-to-end (scoper -> 4 parallel lenses -> per-finding adversarial verification -> reporter, 10 agents total, 0 errors) and every schema validated.

- `scope`: tenancy model correctly identified as `shared-schema`; `tenantContextCarriers` correctly named the JWT `tenantId` claim as server-derived, not client-supplied; `entryPoints` named the unscoped single-order handler, the correctly-scoped list handler (as a contrast reference), and the export job; `limitations` honestly noted the fixture had no route-mounting file, admin/webhook/LLM surfaces, or schema/migration files to check for DB-level constraints.
- `allFindings.length`: 4, all `confirmed` by the independent verifier.
  - The `data` lens caught the planted `GET /orders/:id` bug (`critical`) - no `tenant_id` filter despite `req.tenantId` being available and used one route below.
  - The `data`, `jobs`, and `integrations` lenses each independently caught the planted export-job bug from their own angle (data-layer unscoped query, unscoped worker fan-out, and cross-tenant export/report respectively) - proving the four lenses are genuinely looking through different lenses at the same code, not just duplicating each other's output.
  - The `authz` lens correctly reported zero findings: the fixture's only tenant-context derivation point (`requireAuth`) was already correct, and the lens did not manufacture a finding to justify its existence.
- Each verifier (`opus`, one per finding) independently confirmed by reading the actual cited line and explicitly checking for - and correctly finding none of - an upstream scoping helper, RLS hook, or session-level tenant filter that would have defeated the claim.
- The reporter deduplicated the three `exportJob.js` findings (data/jobs/integrations) into one entry as instructed, kept its severity at `critical` rather than downgrading it for tidiness, computed a `no-go` recommendation, and gave concrete remediation for each finding (the specific missing `AND tenant_id = $2` clause; the specific per-tenant export loop), not generic advice.

This confirms the required wiring fact (command -> workflow -> agents path works, every structured agent output validated against its schema) and, unlike a purely descriptive target, confirms the verifier and lenses catch a real, planted cross-tenant defect end to end rather than only exercising the all-clear path - matching the standard `security-audit/README.md` and `release-readiness/README.md` set for this repo's smoke tests.

**Prompt-cache-ordering retrofit (2026-07-28):** `auditPrompt(lens)` previously interpolated the lens name before the shared scope brief and target, breaking cache-prefix stability across the 4 parallel lens calls (see `PROMPT_CACHE_ORDERING.md`). Reordered so the shared, tagged `<scope>`/`<target>` payload comes first and the lens instruction last - matching this file's own `verifyPrompt`, which already used this ordering. Verified via the same mechanism proven live for `code-review` and `security-audit` (see their READMEs): a single targeted `Agent` tool call against the reordered prompt shape returned schema-valid, correctly-flagged output. A full 4-lens fan-out was not re-run for this package - the change is prompt-string ordering only, no schema/control-flow change, and `node scripts/validate-workflow.mjs tenant-isolation-audit` still passes.
