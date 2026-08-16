#!/usr/bin/env node
// Self-test for the workflow script's pure logic.
//
//   node gated-sdlc/.claude/hooks/logic-selftest.mjs
//
// A Workflow script cannot be imported and run - it has top-level `return`, it
// awaits `agent()`, and its globals only exist inside the harness. So this
// EXTRACTS the pure helpers from the real source and exercises those. Nothing
// here is a copy: if someone edits the file, this test sees the edit.
//
// The regressions it locks down were all found on real runs, not by imagination:
//
//   - stripExit / parseFingerprint: the probe appends `EXIT:<code>` to every
//     `observed`, and parsing that as data made a clean tree read as dirty.
//   - permitted: PROTECTED was evaluated after the allow list, so `**/*.md`
//     let the documenter rewrite the agents that judge it.
//   - committable: `build` is reassigned by every repair, so committing the
//     last call's changedFiles dropped 17 of 20 files on the my-rag run.
//   - shq: the probe doubled a backslash retyping an escaped commit message
//     and killed the code commit, so escaping is now refused outright.
//
// Exit 0 = the logic holds. Exit 1 = do not run the workflow.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const WORKFLOW = resolve(dirname(fileURLToPath(import.meta.url)), '../workflows/gated-sdlc.js')
const SRC = readFileSync(WORKFLOW, 'utf8')

function grab(re, label) {
  const m = re.exec(SRC)
  if (!m) throw new Error(`could not find ${label} in ${WORKFLOW} - the test cannot verify what it cannot read`)
  return m[0]
}

const pieces = [
  `const HANDOFF = '.claude/runs/run/handoff'`,
  grab(/const stripExit = [^\n]+/, 'stripExit'),
  grab(/const isExitLine = [^\n]+/, 'isExitLine'),
  grab(/function parseFingerprint\(observed\) \{[\s\S]*?\n\}/, 'parseFingerprint'),
  grab(/function changedPaths\(before, after\) \{[\s\S]*?\n\}/, 'changedPaths'),
  grab(/function matches\(path, pattern\) \{[\s\S]*?\n\}/, 'matches'),
  grab(/const WRITES = \{[\s\S]*?\n\}/, 'WRITES'),
  grab(/const PROTECTED = \[[^\]]*\]/, 'PROTECTED'),
  grab(/function permitted\(path, agentType\) \{[\s\S]*?\n\}/, 'permitted'),
  grab(/const SHELL_UNSAFE = [^\n]+/, 'SHELL_UNSAFE'),
  grab(/function shq\(s\) \{[\s\S]*?\n\}/, 'shq'),
  grab(/const shellSafe = [^\n]+/, 'shellSafe'),
  grab(/const committable = \(paths\) =>[\s\S]*?\.sort\(\)/, 'committable'),
  grab(/const redirected = [^\n]+/, 'redirected'),
  grab(/const PURE = \{[\s\S]*?\n\}/, 'PURE'),
]

const M = await import(`data:text/javascript,${encodeURIComponent(
  pieces.join('\n') +
  '\nexport { stripExit, parseFingerprint, changedPaths, permitted, matches, shq, shellSafe, committable, redirected, PURE }')}`)

let failures = 0
const eq = (name, actual, expected) => {
  if (JSON.stringify(actual) === JSON.stringify(expected)) console.log(`  ok   ${name}`)
  else {
    console.error(`  FAIL ${name}\n         expected ${JSON.stringify(expected)}\n         got      ${JSON.stringify(actual)}`)
    failures++
  }
}
const throws = (name, fn) => {
  try { fn(); console.error(`  FAIL ${name}: expected a throw, got none`); failures++ }
  catch { console.log(`  ok   ${name}`) }
}

// ── The my-rag run, verbatim ─────────────────────────────────────────────────
// Taken from wf_19ad1ba8-cb8/journal.jsonl. These are the actual declarations
// that produced a 3-file commit of a 20-file change.
const BUILD_FILES = [
  '.gitignore', 'bun.lock', 'package.json', 'rag', 'tsconfig.json',
  'knowledge/identity.md', 'knowledge/decisions/why-lancedb.md',
  'src/cli.ts', 'src/kernel/config.ts', 'src/kernel/corpus.ts', 'src/kernel/corpus.test.ts',
  'src/kernel/chunk.ts', 'src/kernel/chunk.test.ts', 'src/kernel/embed.ts', 'src/kernel/store.ts',
  'src/slices/reindex/index.ts', 'src/slices/search/index.ts',
  'src/slices/search/merge.ts', 'src/slices/search/merge.test.ts',
]
const REVISE_FILES = [
  'src/kernel/chunk.ts', 'src/kernel/chunk.test.ts',
  '.claude/runs/ph1w7k2/handoff/phase-1-revise-notes.md',
]

console.log('the my-rag regression: a repair must not shrink the commit')
const declared = new Set([...BUILD_FILES, ...REVISE_FILES])
const union = M.committable([...declared])
eq('every source file survives the revision', union.length, 19)
eq('the revision adds no duplicates', new Set(union).size, union.length)
eq('the walking skeleton is all there',
  ['package.json', 'tsconfig.json', 'src/cli.ts', 'src/kernel/store.ts', 'src/slices/search/merge.ts']
    .every(f => union.includes(f)), true)
eq('run scratch is never committed', union.filter(p => p.startsWith('.claude/runs/')), [])
eq('the old behaviour would have committed only', M.committable(REVISE_FILES).length, 2)
eq('committable is sorted and deduped', M.committable(['b', 'a', 'b']), ['a', 'b'])
eq('committable drops empties', M.committable(['a', '', null, undefined]), ['a'])

console.log('\nshq refuses what the probe cannot retype')
throws('the exact message that broke the run', () => M.shq("in its own section's text"))
throws('double quote', () => M.shq('say "hi"'))
throws('backslash', () => M.shq('a\\b'))
throws('newline', () => M.shq('line1\nline2'))
throws('backtick', () => M.shq('`whoami`'))
throws('dollar', () => M.shq('$HOME'))
eq('plain text still quotes', M.shq('src/kernel/chunk.ts'), `'src/kernel/chunk.ts'`)
eq('spaces are fine', M.shq('my file.ts'), `'my file.ts'`)
eq('shellSafe agrees with shq', M.shellSafe("section's"), false)
eq('shellSafe passes a normal path', M.shellSafe('src/a-b_c.2.ts'), true)

console.log('\nthe shell_safe gate')
eq('flags an unsafe entry in a list',
  M.PURE.shell_safe({ changedFiles: ['ok.ts', "we're.ts"] }, { field: 'changedFiles' }).length, 1)
eq('passes a clean list',
  M.PURE.shell_safe({ changedFiles: ['a.ts', 'b.ts'] }, { field: 'changedFiles' }), [])
eq('handles a scalar field',
  M.PURE.shell_safe({ branchName: "feat/o'brien" }, { field: 'branchName' }).length, 1)
eq('ignores an absent field',
  M.PURE.shell_safe({}, { field: 'documentPath' }), [])

console.log('\nthe EXIT footer never becomes data')
eq('clean tree with footer', M.parseFingerprint('---UNTRACKED---\nEXIT:0'), {})
eq('the real my-rag preflight capture',
  M.parseFingerprint('---UNTRACKED---\nEXIT:0'), {})
eq('the real my-rag plan-phase capture',
  M.parseFingerprint('---UNTRACKED---\nspecs/phase-1-walking-skeleton-plan.md\nEXIT:0'),
  { 'specs/phase-1-walking-skeleton-plan.md': 'untracked' })
eq('binary file (numstat prints -)',
  M.parseFingerprint('-\t-\tlogo.png\n---UNTRACKED---\nEXIT:0'), { 'logo.png': '-,-' })
eq('sha loses its footer', M.stripExit('d7e7d4e\nEXIT:0'), 'd7e7d4e')
eq('branch_free note is stripped too',
  M.stripExit('fatal: Needed a single revision\nEXIT:128 (branch_free: ...)'),
  'fatal: Needed a single revision')

// Executed against a real shell, not asserted as a string: the claim is about
// what the shell DOES with a compound command, and only the shell settles that.
console.log('\nthe suite log captures a compound command whole')
{
  const { execFileSync } = await import('node:child_process')
  const { mkdtempSync, readFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')

  const dir = mkdtempSync(join(tmpdir(), 'gated-redirect-'))
  try {
    const run = (cmd) => {
      let status = 0
      try { execFileSync('sh', ['-c', cmd], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] }) }
      catch (e) { status = e.status }
      return status
    }

    // The shape the workflow emits for `make backend-test && npm test`.
    const log = 'out.log'
    eq('exit 0 when both halves pass',
      run(M.redirected('echo FIRST-HALF && echo SECOND-HALF', log)), 0)
    const captured = readFileSync(join(dir, log), 'utf8')
    eq('the FIRST half reaches the log', captured.includes('FIRST-HALF'), true)
    eq('the second half reaches the log', captured.includes('SECOND-HALF'), true)

    // Without the subshell the first half leaks to stdout and never lands.
    const naive = 'naive.log'
    run(`echo FIRST-HALF && echo SECOND-HALF > ${naive} 2>&1`)
    eq('the naive form loses the first half',
      readFileSync(join(dir, naive), 'utf8').includes('FIRST-HALF'), false)

    // A red suite must stay red, and stderr must be in the log.
    eq('an early failure short-circuits with its own status',
      run(M.redirected('sh -c "echo BOOM >&2; exit 3" && echo NEVER', 'fail.log')), 3)
    const failLog = readFileSync(join(dir, 'fail.log'), 'utf8')
    eq('stderr is captured', failLog.includes('BOOM'), true)
    eq('the short-circuited half did not run', failLog.includes('NEVER'), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// The premise the build gate now rests on, checked against real git rather
// than assumed: a deletion is reported by `git diff --name-only HEAD`, and
// `git add` on that path stages the removal. If either were false, dropping
// `exists` from the gate would be trading one broken check for another.
console.log('\na moved file: git reports the deletion and can stage it')
{
  const { execFileSync } = await import('node:child_process')
  const { mkdtempSync, writeFileSync, mkdirSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')

  const dir = mkdtempSync(join(tmpdir(), 'gated-move-'))
  const git = (...a) => execFileSync('git', a, { cwd: dir, encoding: 'utf8' })
  try {
    git('init', '-q', '.')
    git('config', 'user.email', 't@t.t')
    git('config', 'user.name', 't')
    mkdirSync(join(dir, 'old'), { recursive: true })
    writeFileSync(join(dir, 'old/merge.ts'), 'export const merge = 1\n')
    git('add', '-A')
    git('commit', '-q', '-m', 'base')

    // The exact shape of run 2: move a tracked file to a new directory.
    mkdirSync(join(dir, 'new'), { recursive: true })
    writeFileSync(join(dir, 'new/merge.ts'), 'export const merge = 2\n')
    rmSync(join(dir, 'old/merge.ts'))

    const tracked = git('diff', '--name-only', 'HEAD').split('\n').filter(Boolean)
    const untracked = git('ls-files', '--others', '--exclude-standard').split('\n').filter(Boolean)
    const inDiff = (p) => tracked.includes(p) || untracked.includes(p)

    eq('the deleted path is in the diff', inDiff('old/merge.ts'), true)
    eq('the new path is in the diff', inDiff('new/merge.ts'), true)
    eq('but the deleted path does NOT exist (what exists checked)',
      execFileSync('sh', ['-c', `[ -e ${JSON.stringify(join(dir, 'old/merge.ts'))} ]; echo $?`],
        { encoding: 'utf8' }).trim(), '1')

    git('add', '--', 'old/merge.ts', 'new/merge.ts')
    const staged = git('diff', '--cached', '--name-status').trim().split('\n').sort()
    eq('git add stages the deletion', staged.some(l => l.startsWith('D\told/merge.ts')), true)
    eq('git add stages the addition', staged.some(l => l.startsWith('A\tnew/merge.ts')), true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

console.log('\nthe write boundary floor')
for (const p of ['.claude/agents/gated-probe.md', '.claude/commands/gated-sdlc.md', 'CLAUDE.md']) {
  eq(`documenter cannot write ${p}`, M.permitted(p, 'gated-documenter'), false)
}
eq('documenter can write README.md', M.permitted('README.md', 'gated-documenter'), true)
eq('builder can write source', M.permitted('src/app.ts', 'gated-builder'), true)
eq('framer writes nothing', M.permitted('src/app.ts', 'gated-framer'), false)
eq('a reverted path counts as changed',
  M.changedPaths({ 'a.ts': '1,0' }, {}), ['a.ts'])

// A probe that does not name its phase is filed under whatever `probe()`
// defaults to, and `opts.phase` overrides the ambient `phase()` state rather
// than deferring to it. That is how Preflight, Branch and Test spent four runs
// rendering as boxes that never ran: they HAD run, under Gate. The bug is
// invisible from the outside - the run is correct and only the display lies -
// so it needs a test or it comes back the next time someone adds a probe call.
console.log('\nevery phase whose only agent is a probe still names itself')
{
  // Phases with a real agent of their own cannot be emptied by a probe.
  const PROBE_ONLY = ['Preflight', 'Branch', 'Test']
  const declared = [...SRC.matchAll(/title: '([A-Za-z]+)'/g)].map(m => m[1])
  for (const title of PROBE_ONLY) {
    eq(`${title} is declared in meta.phases`, declared.includes(title), true)
    eq(`some probe call names ${title}`, SRC.includes(`phase: '${title}'`), true)
  }
  // Every meta phase must be reachable, which is what the anatomy validator
  // checks too - asserted here so this file fails first and says why.
  for (const title of declared) {
    eq(`${title} is used by a phase() call or a probe opt`,
      SRC.includes(`phase('${title}')`) || SRC.includes(`phase: '${title}'`), true)
  }
}

// A run died with every check green: the plan asked the builder for the phase
// write-up, so it landed inside the code commit, and the documenter's commit
// found an empty index. Nothing anyone claimed had been false - the defect was
// a missing question, in two places.
console.log('\nthe write-up belongs to the documenter')
{
  const declared = (files) => M.PURE.docs_not_yours({ changedFiles: files }, { field: 'changedFiles' })

  eq('a docs/ path is refuted', declared(['src/a.ts', 'docs/phase-4.md']).length, 1)
  eq('the refusal names the path', declared(['docs/phase-4.md'])[0].startsWith('docs/phase-4.md'), true)
  eq('every docs/ path is named, not just the first',
    declared(['docs/a.md', 'docs/b.md', 'src/x.ts']).length, 2)
  eq('a normal build is untouched', declared(['src/a.ts', 'README.md', 'evals/questions.md']), [])
  // Only the directory this pipeline reserves. A file that merely has "docs" in
  // its name is the builder's like any other.
  eq('docs-adjacent names are not docs/', declared(['src/docs.ts', 'mydocs/x.md', 'a/docs/b.md']), [])
  eq('an empty list is fine', declared([]), [])
  eq('a missing field is fine', M.PURE.docs_not_yours({}, { field: 'changedFiles' }), [])
  eq('a non-string entry does not throw', declared([null, 42, 'docs/x.md']).length, 1)

  // It has to be a CHECK, never a boundary entry: a boundary breach kills the
  // run with no retry, and the builder that did this was obeying its plan.
  eq('the builder is still allowed to write docs/ at all',
    M.permitted('docs/phase-4.md', 'gated-builder'), true)
  eq('docs_not_yours is wired into the build gate',
    /\{ type: 'docs_not_yours', field: 'changedFiles' \}/.test(SRC), true)
}

// `exists` answers for the disk, `in_diff` answers for the repo. For a file one
// step away from being committed, only the second question means anything - the
// same lesson run 2 taught in the build phase, reached here from the other side.
console.log('\nthe document gate asks about the repo, not the disk')
{
  const gate = grab(/\(c\) => \[\s*\{ type: 'no_placeholder', fields: \['documentPath'\] \}[\s\S]*?\n      \]/, 'documentChecks')
  eq('the write-up is checked with in_diff', /type: 'in_diff'[^}]*c\.documentPath/.test(gate), true)
  eq('the write-up is no longer checked with exists', /type: 'exists'/.test(gate), false)
  eq('it is still checked for being a stub', /type: 'min_bytes'/.test(gate), true)
}

// Reporting every declared path as uncommitted whenever the run was not
// accepted told a reader that 14 files of work were lost, when all 14 were in
// the code commit and the tree was clean.
console.log('\nuncommitted means uncommitted')
{
  // A window rather than a shaped match on purpose: a regex that only matches
  // the CORRECT form turns a regression into a crash inside grab() instead of a
  // named failure, which is how the first version of this test behaved when it
  // was mutation-checked. A test has to fail legibly to be worth having.
  const at = SRC.indexOf('uncommitted:')
  eq('the uncommitted field exists at all', at !== -1, true)
  const src = SRC.slice(at, at + 300)
  eq('it subtracts what actually landed', /commitsMade\.some/.test(src), true)
  eq('it no longer keys off accepted', /!accepted \?/.test(src), false)

  // The real numbers from the run that exposed it: 14 declared, 14 committed in
  // commit 2, and the run still ended not-accepted because commit 3 died.
  const declaredFiles = ['docs/phase-4-sharpening.md', 'evals/questions.md', 'src/cli.ts']
  const commitsMade = [{ label: 'commit_build', files: ['docs/phase-4-sharpening.md', 'evals/questions.md', 'src/cli.ts'] }]
  const left = M.committable(declaredFiles).filter(p => !commitsMade.some(c => (c.files || []).includes(p)))
  eq('nothing is reported lost when everything landed', left, [])

  const partial = [{ label: 'commit_build', files: ['src/cli.ts'] }]
  eq('what genuinely did not land is still reported',
    M.committable(declaredFiles).filter(p => !partial.some(c => (c.files || []).includes(p))),
    ['docs/phase-4-sharpening.md', 'evals/questions.md'])
}

// The review loop is review -> revise -> review, so the round count buys one
// fewer revision than it reads like. A cap of 2 buys ONE revision, which is
// what ran out on my-rag Phase 3 with a one-line finding still open.
console.log('\nthe repair budgets')
{
  const cap = (name) => Number((SRC.match(new RegExp(`const ${name} = (\\d+)`)) || [])[1])
  const revisions = cap('MAX_REVISION_LOOPS')
  eq('MAX_REVISION_LOOPS parses', Number.isInteger(revisions), true)
  eq('the review loop buys more than one revision', revisions - 1 >= 2, true)
  eq('the review budget is not below the suite budget',
    revisions >= cap('MAX_FIX_LOOPS'), true)
  eq('the review loop is still capped', revisions <= 5, true)
}

console.log('')
if (failures) {
  console.error(`${failures} logic self-test(s) failed. Do NOT run the workflow.`)
  process.exit(1)
}
console.log('Workflow logic holds.')
