# Research log

Append-only history of the `/gnhf-research-run` loop.

Each entry is written by the GNHF worker at the end of its own run, before it opens the PR.
The next run reads this file first so it does not re-investigate the same ground.

Do not edit past entries. If a decision from a past entry turns out to be wrong, say so in a new entry instead of rewriting history.

## Format

```
## YYYY-MM-DD - <one-line topic>

- Investigated: <what was researched, and where - community sources, competing tools, repo gaps>
- Decision: <what was built or changed, and why this over the alternatives considered>
- Result: <workflow/file touched, PR link, smoke-test outcome>
- Next: <a concrete follow-up or open question for a future run, if any>
```

## Entries

## 2026-07-28 - SaaS multi-tenant isolation audit workflow

- Investigated: Read `CLAUDE.md`, `BACKLOG.md`, and `STATUS.md` first - all 30 catalogued workflows already exist with full anatomy, so the backlog itself is fully built and "next unclaimed line" wasn't the actual next-highest-value move. `gh pr list --state all` showed no prior PRs (first run of this loop). Web research (primary/engineering sources): Blaxel's "Multi-tenant isolation for AI agents" and Prefactor's "MCP Security for Multi-Tenant AI Agents" (both 2026) - in an LLM/agent-era SaaS system, a tenant-boundary failure is worse than in traditional SaaS because a leaked row enters the agent's reasoning chain and can be acted on via a further tool call, not just displayed; four leak paths recur across sources (prompt, retrieval/RAG context, tool call, response). DEV Community's "How AI Coding Agents Will Choose Your SaaS Boilerplate in 2026" - "scaffold me a SaaS app with auth, billing, and a dashboard" is now a baseline prompt agents are expected to handle well, meaning the shared-schema/JWT-tenant-claim/background-job architectures this workflow reviews are already being built fast by agents. AGENTS.md-spec sources (github/spec-kit, morphllm, asdlc.io) confirmed a real 2026 convergence point but were set aside as a documentation-onboarding concern, not a workflow shape. Repo gap: `security-audit`'s five lenses (injection/authn/authz/secrets/supply-chain/AI-LLM) come close but none is scoped to cross-tenant data leakage specifically; no expert file or workflow in the repo covers it.
- Decision: Built `tenant-isolation-audit`, a `security-audit`-shaped workflow (scoper -> 4 parallel adversarial lenses: data-layer, authz/session, background-jobs, integrations/AI-context -> per-finding adversarial verification -> ranked report) scoped to the one architectural failure class that is specific to SaaS rather than software generally. Considered and set aside: a `billing-integration-reviewer` (real but narrower, one vendor integration rather than a recurring architectural property) and an AGENTS.md generator (real trend, wrong shape for this repo's workflow-library format). Distilled from `experts/software-architect.md`, `experts/pentester.md`, `experts/devops-engineer.md` - no new expert file needed. Appended to `BACKLOG.md` as item 25 `[added]`.
- Result: `tenant-isolation-audit/` (full anatomy: 7 agents, 1 workflow script, 1 command, 1 README). PR: https://github.com/lorenzotomasdiez/claude-code-builder/pull/1 (open against `main`, not merged). Smoke test: PASS - real end-to-end run via headless `claude -p` against a fixture app with two planted bugs (an unscoped order-lookup route, an unscoped nightly export job); both caught and confirmed by independent verifiers, the export-job bug independently caught by three lenses from three angles and correctly deduplicated into one report entry, zero false positives on the correctly-scoped control route and on the `authz` lens. Full detail in `tenant-isolation-audit/README.md`.
- Next: `security-audit` and `tenant-isolation-audit` currently overlap only at the AI/LLM surface by design (one asks "is this prompt injectable," the other asks "does this prompt/retrieval/tool-call carry another tenant's data") - a future run could consider whether they should share a combined entry point once both have more real-world usage, though splitting them was the right call for now since tenant leakage needed lenses (data-layer, background-jobs) security-audit has no equivalent of. A `billing-integration-reviewer` workflow remains a real, unbuilt gap if a future run wants a narrower, vendor-specific companion to this one.
