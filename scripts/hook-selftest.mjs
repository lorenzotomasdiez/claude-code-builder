#!/usr/bin/env node
// Self-test for the hooks. Run after ANY change to a hook script or to settings.json:
//
//   node scripts/hook-selftest.mjs
//
// Exists because a hook can look installed and enforce nothing. Two real precedents:
// the `jq | xargs` pattern from the official docs (pipeline swallows the exit code), and
// the pre-v2.1.214 bug where exit-2-with-malformed-JSON was silently non-blocking. In both
// cases the hook runs, prints its complaint, and the violation survives. The only way to
// know a hook is armed is to assert on its exit code.

import { writeFileSync, mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..')
let failures = 0

function check(name, actual, expected) {
  if (actual === expected) {
    console.log(`  ok   ${name} (exit ${actual})`)
  } else {
    console.error(`  FAIL ${name}: expected exit ${expected}, got ${actual}`)
    failures++
  }
}

function runHook(script, payload) {
  const r = spawnSync(process.execPath, [join(REPO, 'scripts', script)], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    cwd: REPO,
  })
  return r.status
}

console.log('hook-validate.mjs')
// A file in a package that currently passes -> must be silent, exit 0.
check('clean package passes', runHook('hook-validate.mjs', {
  tool_input: { file_path: join(REPO, 'feature-implementer/.claude/workflows/feature-implementer.js') },
}), 0)

// A file outside any workflow package -> not our business, exit 0.
check('non-package path ignored', runHook('hook-validate.mjs', {
  tool_input: { file_path: join(REPO, 'BACKLOG.md') },
}), 0)

// Garbage payload -> fail open, exit 0.
check('unparsable payload fails open', (() => {
  const r = spawnSync(process.execPath, [join(REPO, 'scripts/hook-validate.mjs')], {
    input: 'not json at all', encoding: 'utf8', cwd: REPO,
  })
  return r.status
})(), 0)

// THE IMPORTANT ONE: a genuinely broken package must produce exit 2, not 0 and not 1.
// Build a throwaway package that violates the bar, and assert the hook actually blocks.
const tmp = mkdtempSync(join(tmpdir(), 'hook-selftest-'))
try {
  const pkg = join(REPO, '.selftest-tmp-package')
  rmSync(pkg, { recursive: true, force: true })
  mkdirSync(join(pkg, '.claude/workflows'), { recursive: true })
  mkdirSync(join(pkg, '.claude/agents'), { recursive: true })
  mkdirSync(join(pkg, '.claude/commands'), { recursive: true })
  // Deliberately broken: no meta block, no schema, no README, no agents.
  writeFileSync(join(pkg, '.claude/workflows/.selftest-tmp-package.js'), 'const x = 1\n')
  check('broken package blocks', runHook('hook-validate.mjs', {
    tool_input: { file_path: join(pkg, '.claude/workflows/.selftest-tmp-package.js') },
  }), 2)
  rmSync(pkg, { recursive: true, force: true })
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

console.log('\nhook-stop-audit.mjs')
// stop_hook_active must short-circuit immediately - this is the anti-loop guard.
check('stop_hook_active short-circuits', runHook('hook-stop-audit.mjs', {
  stop_hook_active: true, session_id: 'selftest-reentry',
}), 0)

// One block per session, then never again.
const sid = `selftest-${process.pid}`
const marker = join(tmpdir(), 'claude-workflows-stop-audit', `${sid}.blocked`)
rmSync(marker, { force: true })
const first = runHook('hook-stop-audit.mjs', { session_id: sid })
const second = runHook('hook-stop-audit.mjs', { session_id: sid })
if (first === 2) {
  check('second stop does not block again', second, 0)
} else {
  console.log(`  skip second-stop check - repo is currently clean, first stop exited ${first}`)
  if (first !== 0) { console.error(`  FAIL unexpected first-stop exit ${first}`); failures++ }
}
rmSync(marker, { force: true })

console.log('')
if (failures) {
  console.error(`${failures} hook self-test(s) failed. The hooks are NOT reliably armed.`)
  process.exit(1)
}
console.log('All hook self-tests passed. Hooks are armed and exit codes propagate.')
