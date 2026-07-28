# Archive

These workflows are fully built, anatomy-clean, and still runnable - they are archived, not deprecated or broken.
They moved here because they are not part of the two groups the root `README.md` calls out as this library's best, most-trusted work: the **Solid** flagships and the **greenfield pipeline**.
See `STATUS.md` for what each package's own README says about its real run history.

Reasons a package ends up here, by example:

- **Superseded by a v2 in the same family.** `prd-generator` and `design-system-foundation` are the reference implementation and first cut of ideas that `prd-generator-v2` and `design-system-foundation-v2` later rebuilt with the hub-and-spoke, write-to-disk-return-status conventions. The v1s still work; the v2s are what the pipeline actually uses.
- **Needs review, standalone.** `epic-breakdown`, `status-report`, `feedback-triage`, `release-readiness`, and `docs-sync` each have a real smoke test with a named, still-open caveat (see `STATUS.md`), and none of them feed into the greenfield pipeline.
- **Never verified, standalone.** `design-blueprint`, `client-requirement-shaping`, `qa-suite`, `competitor-design-tokens`, `shadcn-installer`, `gnhf-backlog-maker`, and `solid-refactor-hunter` have no recorded real run yet and are not wired into the pipeline either.

Nothing here was deleted. Every package keeps its own README, its own smoke-test record (or honest absence of one), and its full git history under this new path.
Promoting a package out of archive is a judgment call for whoever picks it up next: run its smoke test (or re-verify it since its last fix), update its own README and `STATUS.md`, then `git mv` it back to the repo root and link it from the root `README.md`.
