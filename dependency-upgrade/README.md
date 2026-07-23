# Dependency Upgrade

Assesses a dependency upgrade for breaking changes, security advisories,
and migration risk, applies it, and verifies the real build and test
suite still pass - looping back to fix a real failure instead of stopping
at "the version bump compiles."

## Pipeline

```
Assess (3 agents in parallel)
  - breaking-change-analyst: what actually breaks, and where in this repo
  - security-advisor: advisories fixed/introduced, urgency
  - migration-planner: sequencing, CI impact, rollback plan
    -> Apply (1 agent: bump the version, apply the required code changes)
      -> Verify (1 agent: run the real build + test suite)
         pass -> done
         fail -> back to Apply, capped at 3 rounds
```

## Files

- `.claude/agents/*.md` - `dependency-upgrade-breaking-change-analyst`,
  `dependency-upgrade-security-advisor`, `dependency-upgrade-migration-planner`,
  `dependency-upgrade-applier`, `dependency-upgrade-verifier`. Distilled from
  `experts/software-developer.md` (breaking-change/API analysis, the actual
  code migration), `experts/devops-engineer.md` (migration sequencing, CI
  impact, rollback planning), and `experts/pentester.md` (security-advisory
  due diligence, assumed authorized internal use).
- `.claude/workflows/dependency-upgrade.js` - the orchestration script:
  `parallel()` over the three assessment lenses, then a capped `while`
  revise loop between Apply and Verify.
- `.claude/commands/dependency-upgrade.md` - the
  `/dependency-upgrade <dependency> <target version> [current version] [scope]`
  entry point.

## Usage

```
/dependency-upgrade left-pad 2.0.0
```

The command runs the workflow and reports the breaking-change risk and
affected call sites, the security recommendation and urgency, the
migration plan's rollback step, exactly what the applier changed, and the
final verify verdict - naming the specific failure plainly if it is still
`fail` after the round cap.

## Why three parallel assessment lenses instead of one "assess the upgrade" agent

Breaking-change analysis, security-advisory due diligence, and migration
sequencing are different skills with different failure modes: a single
agent doing all three tends to either skip the security check because the
diff "looks fine," or bury a rollback plan under a wall of changelog
paraphrase. Running them independently and in parallel - the same pattern
`code-review` uses for its five lenses - means a real security exposure
can't get lost in the noise of a large changelog, and the migration plan
gets built by someone thinking about sequencing and rollback specifically,
not as an afterthought.

## Why Apply and Verify loop instead of running once

A version bump that "should" work is not the same as one that does. The
`dependency-upgrade-verifier` agent is required to run the actual build
and test commands via Bash and report only what it genuinely observed -
never an assumed pass. If verification fails, the failure detail (the real
error, not a paraphrase) goes back to the applier to fix, capped at 3
rounds so a genuinely broken upgrade doesn't loop forever; the cap and the
"only pass on a real observed result" rule mirror `bug-hunter`'s
regression-tester and `test-backfill`'s mutation-verifier, which apply the
same "prove it, don't assume it" discipline to different problems.

## Smoke test

Status: PASS.

Setup: a self-contained scratch project at `dependency-upgrade/.smoke-scratch/`
with no external network dependency. It vendors two local versions of a
fake package, `fake-lib`, under `.smoke-scratch/vendor/`:

- `fake-lib-v1` (1.0.0): `greet(name)` - a plain string argument.
- `fake-lib-v2` (2.0.0, BREAKING, documented in its own `CHANGELOG.md`):
  `greet({ name })` - an options object instead.

`.smoke-scratch/package.json` depends on `fake-lib` via a local `file:`
path pointing at the v1 vendor directory (installable with `npm install`
and no network access), and `.smoke-scratch/index.js` calls the old
`greet(name)` signature. `.smoke-scratch/index.test.js` is a `node:test`
test asserting the current behavior. The baseline (`npm install && npm run
build && npm test`) was verified to pass before handing anything to the
workflow.

The smoke-test task: upgrade `fake-lib` from `1.0.0` to `2.0.0` (repointing
the `file:` dependency at the `fake-lib-v2` vendor directory), which
requires the applier to migrate `index.js`'s call site from `greet(name)`
to `greet({ name })` per the breaking change - a genuine breaking-change
migration, not just a version-string edit - then verify the real
build/test suite still pass. Run as a headless `claude -p` session with
cwd set to `dependency-upgrade/` (custom subagents in a nested
`.claude/agents/` only resolve when the session's cwd is inside that
workflow's own directory, per the pattern established by earlier
workflows in this repo).

Result: ran via `Workflow` with
`{ "dependency": "fake-lib", "fromVersion": "1.0.0", "toVersion": "2.0.0", "scope": ".smoke-scratch" }`.
All three phases ran: Assess (breaking-change analyst correctly flagged
the `greet(name)` -> `greet({ name })` signature change as the sole,
high-risk breaking change with the exact affected call site; security
advisor correctly reported neutral/low since `fake-lib` is a local fixture
with no real advisory history; migration planner produced a full
sequenced plan with rollback), Apply (repointed `package.json`'s `file:`
dependency from `vendor/fake-lib-v1` to `vendor/fake-lib-v2`, ran `npm
install` to regenerate the lockfile, and updated the one call site in
`index.js` from `greet(name)` to `greet({ name })`), and Verify (ran the
real `npm install`, `npm run build`, and `npm test` inside
`.smoke-scratch` - both build and test passed against the actual v2
package). Passed on the first round, no revise loop needed.

Note: a harness quirk in this environment delivered the `Workflow` tool's
`args` parameter to the script as a JSON-encoded string rather than a
plain object, tripping the script's `typeof args === 'object'` guard
regardless of how `args` was passed in the tool call. Worked around by
having the script `JSON.parse` `args` when it arrives as a string
(`.claude/workflows/dependency-upgrade.js`); this is a defensive
compatibility shim for the calling harness, not a workflow design choice.
