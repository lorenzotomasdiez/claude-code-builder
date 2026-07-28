export const meta = {
  name: 'solid-refactor-hunter',
  description: 'Hunt this repo for real SOLID violations, redundancy, and structural design smells, cross-check candidates against already-open PRs so nothing gets re-proposed, pick a small non-overlapping set of the best findings, and for each one: implement the fix in an isolated worktree, verify it with the repo\'s real gate commands (fixing forward on failure), then push the branch and open a real PR via gh with the justification stated plainly',
  phases: [
    { title: 'Recon', detail: 'in parallel: scan open PRs via gh, and scope the repo\'s structure + real gate commands' },
    { title: 'Hunt', detail: 'three independent lenses in parallel: SOLID violations, redundancy, structural design smells' },
    { title: 'Dedup & Rank', detail: 'drop anything already covered by an open PR or overlapping another finding, select up to maxFindings (opus: judgment-heavy)' },
    { title: 'Refactor', detail: 'per selected finding, in its own isolated worktree: implement the fix' },
    { title: 'Verify', detail: 'per finding: run the repo\'s real gate commands independently; fix-and-reverify loop, capped' },
    { title: 'Open PR', detail: 'per verified finding: push the branch and open a real PR via gh, justification first' },
  ],
}

const PR_SCAN_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['ok', 'blocked'] },
    defaultBranch: { type: 'string' },
    openPRs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          number: { type: 'number' },
          title: { type: 'string' },
          headRefName: { type: 'string' },
          summary: { type: 'string' },
          url: { type: 'string' },
        },
      },
    },
    notes: { type: 'string' },
  },
  required: ['status'],
}

const SCOPE_SCHEMA = {
  type: 'object',
  properties: {
    mainLanguages: { type: 'array', items: { type: 'string' } },
    structureNotes: { type: 'string' },
    gateCommands: {
      type: 'object',
      properties: {
        lint: { type: 'string' },
        typecheck: { type: 'string' },
        build: { type: 'string' },
        test: { type: 'string' },
      },
    },
    notes: { type: 'string' },
  },
  required: ['mainLanguages', 'gateCommands'],
}

const FINDING = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    category: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    description: { type: 'string' },
    whyChange: { type: 'string' },
    riskLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
  },
  required: ['title', 'files', 'description', 'whyChange'],
}

const LENS_SCHEMA = {
  type: 'object',
  properties: {
    lens: { type: 'string' },
    findings: { type: 'array', items: FINDING },
  },
  required: ['lens', 'findings'],
}

const DEDUP_SCHEMA = {
  type: 'object',
  properties: {
    selected: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } },
          description: { type: 'string' },
          justification: { type: 'string' },
          riskLevel: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
        required: ['id', 'title', 'files', 'justification'],
      },
    },
    skippedDuplicates: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: { type: 'string' }, matchingPrNumber: { type: 'number' }, reason: { type: 'string' } },
      },
    },
    skippedOverlap: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: { type: 'string' }, reason: { type: 'string' } },
      },
    },
  },
  required: ['selected'],
}

const REFACTOR_SCHEMA = {
  type: 'object',
  properties: {
    worktreePath: { type: 'string' },
    branch: { type: 'string' },
    summary: { type: 'string' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['worktreePath', 'branch', 'summary'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    command: { type: 'string' },
    exitCode: { type: 'integer' },
    ranAtAll: { type: 'boolean' },
    outputTail: { type: 'string' },
  },
  required: ['command', 'exitCode', 'ranAtAll'],
}

const PR_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    pushed: { type: 'boolean' },
    prUrl: { type: 'string' },
    prNumber: { type: 'number' },
    notes: { type: 'string' },
  },
  required: ['pushed'],
}

// Normalize args: this environment can deliver the Workflow `args` as a JSON-encoded
// string. Parse it back to an object when that happens; keep a genuine plain-string arg as-is.
let input = args
if (typeof input === 'string') {
  try {
    const parsed = JSON.parse(input)
    if (parsed && typeof parsed === 'object') input = parsed
  } catch {
    // not JSON - a genuine plain-string argument, keep as-is
  }
}

const areaHint = (typeof input === 'string' && input) || (input && typeof input === 'object' && input.area) || 'the whole repository'
const maxFindings = (input && typeof input === 'object' && Number.isInteger(input.maxFindings) && input.maxFindings > 0)
  ? input.maxFindings
  : 3
const MAX_FIX_ROUNDS = 2

function verifyPassed(v) {
  return Boolean(v) && v.ranAtAll === true && v.exitCode === 0
}

// --- Phase 1: Recon (PR scan + scope, independent, in parallel) ---
phase('Recon')
const [prScan, scope] = await parallel([
  () => agent(
    `List every currently open PR on this repo via gh, and detect the default base branch. This is ground truth other agents will dedup against - do not judge the PRs, just report them.`,
    { agentType: 'srh-pr-scanner', phase: 'Recon', schema: PR_SCAN_SCHEMA }
  ),
  () => agent(
    `Map this repo's structure and languages, focused on: ${areaHint}. Detect the REAL lint/typecheck/build/test commands this repo actually uses - never invent one.`,
    { agentType: 'srh-scoper', phase: 'Recon', schema: SCOPE_SCHEMA }
  ),
])
if (!prScan || prScan.status === 'blocked') {
  throw new Error(`Cannot proceed without a real read of open PRs (gh scan ${prScan ? 'reported blocked' : 'failed'}${prScan && prScan.notes ? ': ' + prScan.notes : ''}). Fix gh auth/repo access and retry - this workflow must not risk duplicating an already-open PR.`)
}
log(`Recon ready: ${prScan.openPRs.length} open PR(s), default branch ${prScan.defaultBranch}, languages: ${(scope.mainLanguages || []).join(', ')}`)

// --- Phase 2: Hunt (three independent lenses, in parallel) ---
phase('Hunt')
const HUNT_LENSES = [
  { key: 'solid', agentType: 'srh-lens-solid' },
  { key: 'redundancy', agentType: 'srh-lens-redundancy' },
  { key: 'structure', agentType: 'srh-lens-structure' },
]
const huntResults = (await parallel(HUNT_LENSES.map(lens => () =>
  agent(
    `Hunt this repo for real, concrete issues through your assigned lens only. Focus area: ${areaHint}.\n\nRepo scope:\n${JSON.stringify(scope, null, 2)}`,
    { agentType: lens.agentType, label: `hunt:${lens.key}`, phase: 'Hunt', schema: LENS_SCHEMA }
  )
))).filter(Boolean)
const allFindings = huntResults.flatMap(r => (r.findings || []).map(f => ({ ...f, lens: r.lens })))
log(`Hunt ready: ${allFindings.length} candidate finding(s) across ${huntResults.length} lens(es)`)

if (!allFindings.length) {
  log('No findings from any lens - nothing to refactor this run')
  return { prScan, scope, huntResults, dedup: { selected: [] }, results: [] }
}

// --- Phase 3: Dedup & Rank (single agent, judgment-heavy) ---
phase('Dedup & Rank')
const dedup = await agent(
  `Cross-check these findings against the open PRs, drop overlapping findings among what's left, and select up to ${maxFindings} non-overlapping, high-value findings to act on this run.\n\n` +
  `Open PRs:\n${JSON.stringify(prScan.openPRs, null, 2)}\n\nCandidate findings:\n${JSON.stringify(allFindings, null, 2)}\n\nmaxFindings: ${maxFindings}`,
  { agentType: 'srh-dedup-ranker', schema: DEDUP_SCHEMA }
)
log(`Dedup & Rank: ${dedup.selected.length} finding(s) selected, ${(dedup.skippedDuplicates || []).length} skipped as already-open PRs, ${(dedup.skippedOverlap || []).length} skipped as overlapping`)

if (!dedup.selected.length) {
  log('Every candidate was a duplicate or overlap - nothing new to refactor this run')
  return { prScan, scope, huntResults, dedup, results: [] }
}

// --- Phases 4-6: per selected finding, in parallel: Refactor -> Verify (fix loop) -> Open PR ---
const gateCommandList = Object.values(scope.gateCommands || {}).filter(Boolean)
const gateCommandText = gateCommandList.length ? gateCommandList.join(' && ') : ''

const results = (await parallel(dedup.selected.map(finding => async () => {
  phase('Refactor')
  // Only the FIRST call for this finding gets a fresh isolated worktree - fix rounds reuse
  // the SAME worktree path via a plain (non-isolated) call, or they would each spin up a new,
  // untouched tree and verification would check nothing real.
  let refactor = await agent(
    `Implement exactly this refactor finding, in your own isolated branch. Do not push or open a PR.\n\nFinding:\n${JSON.stringify(finding, null, 2)}`,
    { agentType: 'srh-refactorer', label: `refactor:${finding.id}`, phase: 'Refactor', schema: REFACTOR_SCHEMA, isolation: 'worktree' }
  )
  if (!refactor) return { finding, status: 'blocked', reason: 'refactorer call failed to return a result' }
  log(`Finding ${finding.id}: implemented on branch ${refactor.branch} at ${refactor.worktreePath}`)

  if (!gateCommandText) {
    log(`Finding ${finding.id}: no real gate commands detected for this repo - cannot verify, marking blocked rather than opening an unverified PR`)
    return { finding, refactor, status: 'blocked', reason: 'no real gate commands detected for this repo' }
  }

  phase('Verify')
  const runVerify = (label) => agent(
    `Run this repo's real gate commands and report exactly what happened. Do not fix, retry, or interpret.\n\nWorktree path: ${refactor.worktreePath}\nCommand(s): ${gateCommandText}`,
    { agentType: 'srh-verifier', label, phase: 'Verify', schema: VERIFY_SCHEMA }
  )

  let verification = await runVerify(`verify:${finding.id}`)
  let fixRound = 0
  while (!verifyPassed(verification) && fixRound < MAX_FIX_ROUNDS) {
    fixRound++
    log(`Finding ${finding.id}: verification failed (exit ${verification.exitCode}) - fix round ${fixRound}/${MAX_FIX_ROUNDS}`)
    phase('Refactor')
    refactor = await agent(
      `Your refactor's verification failed. Fix it in the SAME worktree - do not create a new one.\n\n` +
      `Worktree path: ${refactor.worktreePath}\nBranch: ${refactor.branch}\n\n` +
      `Command run: ${verification.command}\nExit code: ${verification.exitCode}\nOutput:\n${verification.outputTail || '(none captured)'}`,
      { agentType: 'srh-refactorer', label: `fix:${finding.id}:${fixRound}`, phase: 'Refactor', schema: REFACTOR_SCHEMA }
    )
    phase('Verify')
    verification = await runVerify(`reverify:${finding.id}:${fixRound}`)
  }

  if (!verifyPassed(verification)) {
    log(`Finding ${finding.id}: BLOCKED - verification still failing after ${fixRound} fix round(s), no PR will be opened`)
    return { finding, refactor, verification, status: 'blocked', reason: `verification failed after ${fixRound} fix round(s): ${verification.outputTail || 'no output captured'}` }
  }
  log(`Finding ${finding.id}: verification passed (exit 0)`)

  phase('Open PR')
  const prResult = await agent(
    `Verification passed - push this branch and open the real PR via gh, justifying the change plainly.\n\n` +
    `Worktree path: ${refactor.worktreePath}\nBranch: ${refactor.branch}\nDefault base branch: ${prScan.defaultBranch}\n\n` +
    `Finding and justification:\n${JSON.stringify(finding, null, 2)}\n\nImplementation summary:\n${JSON.stringify(refactor, null, 2)}\n\nVerification:\n${JSON.stringify(verification, null, 2)}`,
    { agentType: 'srh-pr-writer', label: `pr:${finding.id}`, phase: 'Open PR', schema: PR_RESULT_SCHEMA }
  )
  if (prResult && prResult.pushed && prResult.prUrl) {
    log(`Finding ${finding.id}: PR opened - ${prResult.prUrl}`)
    return { finding, refactor, verification, prResult, status: 'shipped' }
  }
  log(`Finding ${finding.id}: BLOCKED - PR step did not confirm a real push/PR`)
  return { finding, refactor, verification, prResult, status: 'blocked', reason: 'PR step did not confirm a real push or PR URL' }
}))).filter(Boolean)

const shipped = results.filter(r => r.status === 'shipped')
const blocked = results.filter(r => r.status === 'blocked')
log(`Done: ${shipped.length}/${results.length} finding(s) shipped as real PRs, ${blocked.length} blocked`)

return { prScan, scope, huntResults, dedup, results, shipped, blocked }
