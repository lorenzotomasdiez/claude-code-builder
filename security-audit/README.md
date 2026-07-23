# Security Audit

Authorized OWASP plus AI/LLM security audit of a diff or a described service surface.
Five independent attack-surface lenses (injection, authn/authz/session, secrets/crypto/data-exposure, supply-chain/infra, AI/LLM) audit the same target in parallel, every individual finding is then adversarially re-checked by a verifier that has no stake in being right, and only what survives verification reaches the final ranked report with remediation guidance.

This is BACKLOG.md item 6, built to the same anatomy and quality bar as `prd-generator/` (the canonical template) and closely mirrors `code-review/`'s adversarial-lens pattern, applied to security specifically.

This workflow assumes explicit authorization to test the target, consistent with `experts/pentester.md`'s framing - it is a defensive audit tool, not an offensive engagement enabler.

## Pipeline

```
Scope (1 agent)
  -> Audit (5 agents in parallel: injection, authn/authz, secrets/crypto, supply-chain/infra, AI/LLM)
    -> Verify (1 agent per finding, in parallel, independent of the lens that raised it)
      -> Report (1 agent, ranks, deduplicates, and adds remediation guidance to surviving findings)
```

The Audit and Verify stages are pipelined per lens, not run behind one big barrier: the authn lens's findings start verification as soon as authn finishes, without waiting for the (potentially slower) supply-chain lens to also finish. Wall-clock time is bounded by the slowest single lens-plus-its-verification chain, not the sum of every stage.

## Why five independent lenses instead of one auditor

A single auditor prompted to "check everything" tends to default to whatever category it happens to favor (usually injection) and skims the rest, especially AI/LLM-specific risks which are newer and easy to under-weight. Five agents, each restricted to one attack surface with an explicit "what you do not do" section, cannot skip their assigned concern and cannot bleed into someone else's - the injection lens is not allowed to comment on IAM policy, the AI/LLM lens is not allowed to flag a hardcoded secret. That separation is enforced by each agent's system prompt, mirroring `code-review`'s per-lens design.

The AI/LLM lens is deliberately allowed - and expected - to return an empty finding list when the target has no LLM/agent surface at all, rather than forcing a finding to justify its existence.

## Why verify every finding instead of trusting the lens

Lenses are instructed to be adversarial, which makes them prone to over-flagging (a false "critical" is exactly the failure mode adversarial security prompting invites, and a report full of false positives trains reviewers to ignore it). The `security-audit-verifier` agent is spawned once per finding, is blind to which lens raised it, and is explicitly told to try to refute the finding against the real target code - defaulting to `rejected` when it cannot confirm the exploit scenario is actually reachable. This is the same "adversarial verify" pattern used in `code-review` and `bug-hunter`, applied here to security findings specifically because an unverified security report is actively harmful (it either causes alarm over non-issues or gets ignored wholesale).

## Files

- `.claude/agents/security-audit-scoper.md` - maps entry points, trust boundaries, data sensitivity, and existing controls so five lenses do not each re-derive the same context.
- `.claude/agents/security-audit-injection-lens.md` - SQL/NoSQL/command/template/log injection, SSRF, deserialization, path traversal, XXE. Distilled from `experts/pentester.md`'s OWASP Top 10 knowledge.
- `.claude/agents/security-audit-authn-lens.md` - broken access control, IDOR, privilege escalation, session management, token handling. Distilled from `experts/pentester.md`.
- `.claude/agents/security-audit-secrets-lens.md` - hardcoded secrets, weak cryptography, sensitive data exposure, transport security. Distilled from `experts/pentester.md` and `experts/software-architect.md`'s data-handling concerns.
- `.claude/agents/security-audit-supplychain-lens.md` - vulnerable dependencies, insecure CI/CD, cloud/container misconfiguration, exposed admin surfaces, missing rate limiting. Distilled from `experts/pentester.md`'s cloud-security trends and `experts/qa-architect.md`'s SAST/DAST-in-pipeline notes.
- `.claude/agents/security-audit-ai-llm-lens.md` - prompt injection, unsafe agent tool actions, output-handling risks, data poisoning, excessive agency. Distilled from `experts/pentester.md`'s 2026 AI/LLM security trends and `experts/qa-architect.md`'s notes on testing autonomous agents.
- `.claude/agents/security-audit-verifier.md` - the adversarial verifier, spawned once per finding.
- `.claude/agents/security-audit-reporter.md` - deduplicates, ranks, and adds remediation guidance to verified findings into one markdown report.
- `.claude/workflows/security-audit.js` - the orchestration script: Scope sequentially, Audit/Verify pipelined per lens, Report sequentially.
- `.claude/commands/security-audit.md` - the `/security-audit [target]` entry point. Resolves the diff or service description (PR, ref range, working-tree default, or a plain description), confirms authorization, calls the workflow, and surfaces the report plus the raw-vs-verified finding counts.

## Usage

```
/security-audit
/security-audit 142
/security-audit main..my-branch
/security-audit "our public /upload endpoint and the image-processing service behind it"
```

With no argument it audits the working tree's pending diff against the repo's base branch. With a PR number it uses `gh pr diff`. With a ref range it diffs that range directly. With a plain description it audits the described surface directly (useful for a service that has no in-flight diff to point at).

## Dependency note

Independently runnable with a trivial or mock target, same as `code-review`. No dependency on another workflow's output.

## Smoke test

**Status: PASS (wiring and schema validation), with an honest caveat on finding confirmation.** Recorded here per the project's Definition of Done.

Per the working-directory-scoping fix established in earlier iterations (Claude Code's subagent discovery walks up from the session's cwd, not down into subdirectories), the smoke test ran from a headless session (`claude -p ... --dangerously-skip-permissions`) with its working directory set to `security-audit/`. The `Workflow` tool was called directly with `scriptPath: ".claude/workflows/security-audit.js"` and a trivial synthetic target diff describing several deliberately planted vulnerabilities (a missing auth check on an admin delete-user route, a SQL query built via string concatenation, a hardcoded AWS key, and an agent route that concatenates user input directly into a system prompt for an unguarded destructive `deleteFile` tool):

```json
{"target": "diff --git a/app.js b/app.js\n... (adds /admin/deleteUser with no auth check, SQL built via string concatenation, a hardcoded AWS key, and an /assistant route that concatenates req.body.message into the system prompt for an agent with an unguarded deleteFile tool)", "context": "smoke-test diff for the security-audit workflow; authorized synthetic target"}
```

**Result:** the full pipeline ran end-to-end (scoper -> 5 parallel lenses -> per-finding adversarial verification -> reporter, 17 agents total, 0 errors) and every schema validated.

- `allFindings.length`: 10 (raised by the injection, authn, secrets, and ai_llm lenses; the supplychain lens correctly found nothing, since the synthetic snippet has no dependency/CI/cloud-config content).
- `confirmed.length`: 0. Every verifier agent independently rejected its assigned finding for the same, legitimate reason: the verifier's job (by design, see `security-audit-verifier.md`) is to `Read`/`Grep`/`Glob` the actual on-disk target and refuse to confirm anything it cannot locate in real code. This smoke test's target was a synthetic diff describing a fictitious `app.js` that does not exist anywhere on disk (this repo is the workflow library itself, not the Express app the diff describes), so every verifier correctly defaulted to `rejected` rather than trusting the diff text at face value.
- The reporter correctly handled the empty-confirmed-list case: it stated plainly that nothing survived verification, gave an explicit severity breakdown of all zeros, and - notably - added an honest caveat of its own that an empty result should not be read as a clean bill of health without confirming which lenses and scope were actually covered. This is the reporter behaving exactly as instructed ("do not manufacture findings to make the report look substantive").

This confirms the required wiring fact (command -> workflow -> agents path works, every structured agent output validated against its schema) and additionally confirms the verifier is not a rubber stamp: it will not confirm a finding it cannot check against real code, even when the finding is plausible on its face. The trade-off this surfaces for future users of this workflow: unlike `code-review`'s smoke test (which reviewed a diff against files that existed in that run's context), a target described only as prose with no corresponding real files on disk will legitimately produce zero confirmed findings - real usage should point this workflow at an actual diff or codebase the verifier agents can read, not a purely hypothetical description.
