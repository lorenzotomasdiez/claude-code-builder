#!/usr/bin/env node
// Self-test for the gated-sdlc write boundary.
//
//   node gated-sdlc/.claude/hooks/boundary-selftest.mjs
//
// Two jobs, and the second is the one that earns this file:
//
//   1. Assert the hook's exit codes. A hook can look installed and enforce
//      nothing - a pipeline that swallows the exit code, a payload shape it
//      silently ignores. The only way to know it is armed is to assert on the
//      code it returns.
//   2. Assert the hook's boundary table is IDENTICAL to the workflow script's.
//      The boundary is written twice on purpose - the hook runs in a shell with
//      a filesystem, the script runs in a sandbox without one - and two copies
//      of a security rule drift. This extracts both from source and compares.
//
// Exit 0 = armed and in sync. Exit 1 = do not trust the boundary.

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const HERE = dirname(fileURLToPath(import.meta.url))
const HOOK = join(HERE, 'gated-write-boundary.mjs')
const WORKFLOW = resolve(HERE, '../workflows/gated-sdlc.js')

let failures = 0

function check(name, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    console.log(`  ok   ${name}`)
  } else {
    console.error(`  FAIL ${name}\n         expected ${JSON.stringify(expected)}` +
                  `\n         got      ${JSON.stringify(actual)}`)
    failures++
  }
}

// The repo root under test is `/repo`, passed in the PAYLOAD (which is where
// the hook reads it from). It is deliberately NOT the child's real cwd: that
// directory does not exist, and spawning into it fails with status null - which
// looks like every assertion failing at once rather than like a broken test.
function runHook(payload) {
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload), encoding: 'utf8',
  })
  if (r.error) throw new Error(`could not run the hook: ${r.error.message}`)
  if (r.status === null) throw new Error(`the hook did not exit normally (signal ${r.signal})`)
  return r.status
}

const write = (agentType, file_path, extra = {}) => ({
  hook_event_name: 'PreToolUse', tool_name: 'Write', cwd: '/repo',
  agent_type: agentType, tool_input: { file_path }, ...extra,
})

// ── 1. The hook blocks what it must ──────────────────────────────────────────
console.log('gated-write-boundary.mjs - blocking')
check('documenter blocked from .claude/agents/', runHook(write('gated-documenter', '.claude/agents/gated-probe.md')), 2)
check('documenter blocked from .claude/commands/', runHook(write('gated-documenter', '.claude/commands/gated-sdlc.md')), 2)
check('documenter blocked from CLAUDE.md', runHook(write('gated-documenter', 'CLAUDE.md')), 2)
check('builder blocked from .claude/workflows/', runHook(write('gated-builder', '.claude/workflows/gated-sdlc.js')), 2)
check('framer blocked from everything', runHook(write('gated-framer', 'src/app.ts')), 2)
check('reviewer blocked from everything', runHook(write('gated-reviewer', 'src/app.ts')), 2)
check('planner blocked outside specs/', runHook(write('gated-planner', 'src/app.ts')), 2)
check('documenter blocked from source tree', runHook(write('gated-documenter', 'src/app.ts')), 2)
check('absolute path outside the repo blocked', runHook(write('gated-builder', '/etc/hosts')), 2)

// ── 2. The hook allows what it must ──────────────────────────────────────────
console.log('\ngated-write-boundary.mjs - allowing')
check('builder writes source', runHook(write('gated-builder', 'src/app.ts')), 0)
check('planner writes specs/', runHook(write('gated-planner', 'specs/x-plan.md')), 0)
check('documenter writes docs/', runHook(write('gated-documenter', 'docs/writeup.md')), 0)
check('documenter writes root markdown', runHook(write('gated-documenter', 'README.md')), 0)
check('any gated agent writes the handoff dir', runHook(write('gated-framer', '.claude/runs/abc123/handoff/notes.md')), 0)
check('absolute path inside the repo resolves', runHook(write('gated-builder', '/repo/src/app.ts')), 0)

// ── 3. The hook keeps its hands off everyone else ────────────────────────────
console.log('\ngated-write-boundary.mjs - not our business')
check('no agent_type (a human session)', runHook({ tool_name: 'Write', cwd: '/repo', tool_input: { file_path: '.claude/agents/x.md' } }), 0)
check('another workflow\'s subagent', runHook(write('tech-doc-author', '.claude/agents/x.md')), 0)
check('an unknown gated-* name', runHook(write('gated-nonexistent', '.claude/agents/x.md')), 0)
check('unparsable payload fails open', spawnSync(process.execPath, [HOOK], { input: 'not json', encoding: 'utf8' }).status, 0)
check('missing file_path fails open', runHook({ agent_type: 'gated-framer', tool_input: {}, cwd: '/repo' }), 0)

// ── 4. The two copies of the boundary agree ──────────────────────────────────
console.log('\nboundary tables are in sync')

function extract(src, label, re) {
  const m = re.exec(src)
  if (!m) throw new Error(`could not find ${label} - the self-test cannot verify what it cannot read`)
  return m[0]
}

// Normalized so the two files' local spellings of the handoff dir compare equal:
// the script interpolates the runId, the hook cannot know it and matches the
// `.claude/runs/` prefix instead.
const normalize = (s) => s
  .replace(/`\$\{HANDOFF\}\/`/g, "'HANDOFF/'")
  .replace(/\s+/g, ' ')
  .trim()

const hookSrc = readFileSync(HOOK, 'utf8')
const wfSrc = readFileSync(WORKFLOW, 'utf8')
const WRITES_RE = /const WRITES = \{[\s\S]*?\n\}/
const PROTECTED_RE = /const PROTECTED = \[[^\]]*\]/
const MATCHES_RE = /function matches\(path, pattern\) \{[\s\S]*?\n\}/

// Comments differ between the two files by design; only the code must match.
const stripComments = (s) => s.replace(/\/\/[^\n]*/g, '')

check('WRITES identical',
  normalize(stripComments(extract(hookSrc, 'WRITES (hook)', WRITES_RE))),
  normalize(stripComments(extract(wfSrc, 'WRITES (workflow)', WRITES_RE))))
check('PROTECTED identical',
  normalize(extract(hookSrc, 'PROTECTED (hook)', PROTECTED_RE)),
  normalize(extract(wfSrc, 'PROTECTED (workflow)', PROTECTED_RE)))
check('matches() identical',
  normalize(stripComments(extract(hookSrc, 'matches (hook)', MATCHES_RE))),
  normalize(stripComments(extract(wfSrc, 'matches (workflow)', MATCHES_RE))))

// permitted() differs by one line on purpose (the script also short-circuits on
// the interpolated HANDOFF path), so assert the ORDER instead, which is the
// actual rule: PROTECTED must be tested before the allow list in both.
for (const [label, src] of [['hook', hookSrc], ['workflow', wfSrc]]) {
  const body = extract(src, `permitted (${label})`, /function permitted\(path, agentType\) \{[\s\S]*?\n\}/)
  const stripped = stripComments(body)
  check(`${label}: PROTECTED is tested before the allow list`,
    stripped.indexOf('PROTECTED') < stripped.indexOf('allow ||'), true)
}

console.log('')
if (failures) {
  console.error(`${failures} boundary self-test(s) failed. Do NOT trust the write boundary.`)
  process.exit(1)
}
console.log('Write boundary armed, and both copies agree.')
