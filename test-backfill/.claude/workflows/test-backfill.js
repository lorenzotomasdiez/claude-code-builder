export const meta = {
  name: 'test-backfill',
  description: 'Find the highest-risk under-tested code, write meaningful tests, and prove each one catches a real regression',
  phases: [
    { title: 'Scan', detail: 'find the highest-risk under-tested code, ranked by impact not coverage %' },
    { title: 'Write', detail: 'per target: write tests -> mutation-check -> critique -> capped revise' },
  ],
}

const RISK_SCHEMA = {
  type: 'object',
  properties: {
    targets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          reason: { type: 'string' },
          riskLevel: { type: 'string', enum: ['high', 'medium', 'low'] },
          suggestedFocus: { type: 'string' },
        },
        required: ['file', 'reason', 'riskLevel'],
      },
    },
    scopeNotes: { type: 'string' },
  },
  required: ['targets'],
}

const WRITE_SCHEMA = {
  type: 'object',
  properties: {
    file: { type: 'string' },
    testFile: { type: 'string' },
    testCode: { type: 'string' },
    casesAdded: { type: 'array', items: { type: 'string' } },
    testResult: { type: 'string', enum: ['pass', 'fail', 'not_run'] },
    notes: { type: 'string' },
  },
  required: ['file', 'testFile', 'testResult'],
}

const MUTATION_SCHEMA = {
  type: 'object',
  properties: {
    file: { type: 'string' },
    mutationDescription: { type: 'string' },
    testFailedOnMutation: { type: 'boolean' },
    testPassedAfterRevert: { type: 'boolean' },
    verdict: { type: 'string', enum: ['proven', 'theater', 'inconclusive'] },
    notes: { type: 'string' },
  },
  required: ['file', 'testFailedOnMutation', 'testPassedAfterRevert', 'verdict'],
}

const CRITIQUE_SCHEMA = {
  type: 'object',
  properties: {
    file: { type: 'string' },
    verdict: { type: 'string', enum: ['ready', 'needs_revision'] },
    issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['file', 'verdict', 'issues'],
}

const scope = (typeof args === 'string' ? args : args && args.scope) || 'the whole repository'
const maxTargets = (args && typeof args === 'object' && args.maxTargets) || 5

// --- Phase 1: Scan (single agent) ---
phase('Scan')
const scan = await agent(
  `Scan this scope for the highest-risk under-tested code: ${scope}. Cap your selection at ${maxTargets} targets, ranked by real failure/business impact, not raw coverage percentage.`,
  { agentType: 'test-backfill-risk-scanner', schema: RISK_SCHEMA }
)
if (!scan.targets || scan.targets.length === 0) {
  log('No under-tested risk targets found in scope - nothing to backfill')
  return { stopped: 'no_targets', scan }
}
log(`Found ${scan.targets.length} risk target(s): ${scan.targets.map(t => t.file).join(', ')}`)

// --- Phase 2: per-target pipeline: Write -> Mutation-check -> Critique (capped revise) ---
phase('Write')
const MAX_REVISE_ROUNDS = 2

async function processTarget(target) {
  let write = await agent(
    `Write meaningful tests for this risk target.\nFile: ${target.file}\nWhy it's risky and under-tested: ${target.reason}\nSuggested focus: ${target.suggestedFocus || 'use your judgement based on the reason above'}`,
    { agentType: 'test-backfill-writer', label: `write:${target.file}`, phase: 'Write', schema: WRITE_SCHEMA }
  )

  let round = 0
  let mutation
  let critique
  while (round < MAX_REVISE_ROUNDS) {
    mutation = await agent(
      `Mutation-check these new tests to prove they catch a real regression.\nFile: ${write.file}\nTest file: ${write.testFile}\nTest code:\n${write.testCode || '(see test file on disk)'}`,
      { agentType: 'test-backfill-mutation-verifier', label: `mutate:${target.file}`, phase: 'Write', schema: MUTATION_SCHEMA }
    )

    critique = await agent(
      `Critique these new tests.\nFile: ${write.file}\nSuggested focus: ${target.suggestedFocus || 'n/a'}\nTest code:\n${write.testCode || '(see test file on disk)'}\nMutation verdict: ${JSON.stringify(mutation)}`,
      { agentType: 'test-backfill-critic', label: `critique:${target.file}`, phase: 'Write', schema: CRITIQUE_SCHEMA }
    )

    if (critique.verdict === 'ready' && mutation.verdict === 'proven') break

    round++
    if (round >= MAX_REVISE_ROUNDS) {
      log(`Round cap (${MAX_REVISE_ROUNDS}) reached for ${target.file} - handing back best attempt (mutation: ${mutation.verdict}, critique: ${critique.verdict})`)
      break
    }

    log(`Revising tests for ${target.file}: mutation=${mutation.verdict}, critique=${critique.verdict}`)
    write = await agent(
      `Revise these tests to address the issues below. Keep any cases that already work and were not flagged.\nFile: ${write.file}\nTest file: ${write.testFile}\nCurrent test code:\n${write.testCode || '(see test file on disk)'}\nMutation verdict: ${JSON.stringify(mutation)}\nCritique issues: ${JSON.stringify(critique.issues)}`,
      { agentType: 'test-backfill-writer', label: `rewrite:${target.file}`, phase: 'Write', schema: WRITE_SCHEMA }
    )
  }

  return { target, write, mutation, critique }
}

const results = await pipeline(scan.targets, processTarget)

const summary = results.filter(Boolean).map(r => ({
  file: r.target.file,
  testFile: r.write.testFile,
  casesAdded: r.write.casesAdded,
  mutationVerdict: r.mutation.verdict,
  critiqueVerdict: r.critique.verdict,
}))

return { scan, results: summary }
