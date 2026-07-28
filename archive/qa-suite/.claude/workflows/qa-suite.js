export const meta = {
  name: 'qa-suite',
  description: 'QA a service/area end to end: architect a layered test strategy from existing tests + docs, engineer the missing tests and run the suite, verify coverage against the strategy, and report findings',
  phases: [
    { title: 'Scope', detail: 'normalize the target and locate its code, existing tests, docs, and test runner' },
    { title: 'Strategy', detail: 'qa-architect: inventory existing coverage, build a layered test matrix, and list the gaps' },
    { title: 'Implement', detail: 'qa-engineer: write the missing tests per the gaps, then run the suite and capture results' },
    { title: 'Verify', detail: 'qa-coverage-critic: check delivered coverage against the proposed strategy; loop back to the engineer while gaps remain, capped' },
    { title: 'Report', detail: 'qa-reporter: synthesize the strategy, what was tested, results, coverage, and remaining risk' },
  ],
}

const SCOPE_SCHEMA = {
  type: 'object',
  properties: {
    target: { type: 'string' },
    codePaths: { type: 'array', items: { type: 'string' } },
    existingTestPaths: { type: 'array', items: { type: 'string' } },
    testRunner: { type: 'string' },
    runCommand: { type: 'string' },
    docPaths: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['target', 'testRunner'],
}

const STRATEGY_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    testMatrix: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          area: { type: 'string' },
          layer: { type: 'string', enum: ['unit', 'integration', 'e2e', 'contract', 'performance'] },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
          rationale: { type: 'string' },
        },
        required: ['area', 'layer', 'priority'],
      },
    },
    existingCoverage: { type: 'array', items: { type: 'string' } },
    gaps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          area: { type: 'string' },
          layer: { type: 'string', enum: ['unit', 'integration', 'e2e', 'contract', 'performance'] },
          whatToTest: { type: 'string' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['area', 'layer', 'whatToTest'],
      },
    },
    staleOrRisky: { type: 'array', items: { type: 'string' } },
    docIssues: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'testMatrix', 'gaps'],
}

const ENGINEER_SCHEMA = {
  type: 'object',
  properties: {
    testsWritten: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          layer: { type: 'string' },
          covers: { type: 'string' },
        },
        required: ['path', 'covers'],
      },
    },
    executed: { type: 'boolean' },
    runCommand: { type: 'string' },
    passed: { type: 'number' },
    failed: { type: 'number' },
    skipped: { type: 'number' },
    failures: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['executed', 'notes'],
}

const COVERAGE_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['complete', 'incomplete'] },
    coveredGaps: { type: 'array', items: { type: 'string' } },
    remainingGaps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          area: { type: 'string' },
          layer: { type: 'string', enum: ['unit', 'integration', 'e2e', 'contract', 'performance'] },
          whatToTest: { type: 'string' },
          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['area', 'layer', 'whatToTest'],
      },
    },
    qualityIssues: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'remainingGaps'],
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

const target = typeof input === 'string' ? input : input && input.target
if (!target) {
  throw new Error(
    'Missing the QA target. Call this workflow with args set to either a plain string ' +
    '(the service/area to QA, e.g. "the auth API") or an object shaped { "target": "...", "context": "optional extra context" }.'
  )
}
const context = (input && typeof input === 'object' && input.context) || ''

// --- Phase 1: Scope (single agent, sequential) ---
phase('Scope')
const scope = await agent(
  `Normalize this QA target and locate what QA needs to see: "${target}". Extra context: ${context || 'none'}.\n` +
  `Find the code paths that make up this area, the tests that already exist for it, the relevant documentation, and detect the project's test runner and the command that runs the suite. Do not judge coverage or write anything - just map the terrain.`,
  { agentType: 'qa-scoper', schema: SCOPE_SCHEMA }
)
log(`Scope ready: target "${scope.target}", runner ${scope.testRunner}, ${(scope.existingTestPaths || []).length} existing test file(s)`)

// --- Phase 2: Strategy (single agent, sequential) ---
phase('Strategy')
const strategy = await agent(
  `Design the QA strategy for this target. First inventory what is ALREADY tested (including tests any prior workflow left behind - read them, do not assume) and check the documentation for the expected behavior. Then produce a layered test matrix (unit/integration/e2e/contract/performance) sized to the real risk, and list the concrete gaps between what should be tested and what is.\n\nScope:\n${JSON.stringify(scope, null, 2)}`,
  { agentType: 'qa-architect', schema: STRATEGY_SCHEMA }
)
log(`Strategy ready: ${strategy.testMatrix.length} matrix entries, ${strategy.gaps.length} gap(s), ${(strategy.existingCoverage || []).length} area(s) already covered`)

// --- Phase 3/4: Implement -> Verify, capped revise loop ---
const MAX_ROUNDS = 2
let round = 0
let gapsToAddress = strategy.gaps
let engineering = null
let coverage = null

while (round < MAX_ROUNDS) {
  phase('Implement')
  const gapNote = gapsToAddress.length
    ? `Write the tests for these gaps, following the runner and conventions already in the repo:\n${JSON.stringify(gapsToAddress, null, 2)}`
    : `The architect found no gaps. Do not invent tests - just run the existing suite for this target and report what you find.`
  engineering = await agent(
    `${gapNote}\n\nAfter writing any tests, RUN the suite with the project's real runner (${scope.runCommand || scope.testRunner}) and report actual results - never claim a pass you did not observe. If a test reveals a real defect in the code under test, report it as a finding rather than weakening the test to make it pass.\n\nScope:\n${JSON.stringify(scope, null, 2)}\n\nFull strategy for context:\n${JSON.stringify(strategy, null, 2)}`,
    { agentType: 'qa-engineer', phase: 'Implement', schema: ENGINEER_SCHEMA }
  )
  log(`Implement round ${round + 1}: ${(engineering.testsWritten || []).length} test file(s) written, executed=${engineering.executed}${engineering.executed ? `, ${engineering.passed ?? '?'} passed / ${engineering.failed ?? '?'} failed` : ''}`)

  phase('Verify')
  coverage = await agent(
    `Verify whether the delivered tests actually cover the strategy the architect proposed. Re-read the tests and, where useful, re-run them - do not take the engineer's summary at face value. A gap counts as covered only if a real, meaningful test exercises the behavior (not a trivial no-op). Flag weak assertions and anything from the matrix still missing.\n\nProposed test matrix:\n${JSON.stringify(strategy.testMatrix, null, 2)}\n\nGaps this round was meant to close:\n${JSON.stringify(gapsToAddress, null, 2)}\n\nWhat the engineer reported:\n${JSON.stringify(engineering, null, 2)}`,
    { agentType: 'qa-coverage-critic', phase: 'Verify', schema: COVERAGE_SCHEMA }
  )

  if (coverage.verdict === 'complete') {
    log('Coverage verified complete against the proposed strategy')
    break
  }

  round++
  if (round >= MAX_ROUNDS) {
    log(`Round cap (${MAX_ROUNDS}) reached with ${coverage.remainingGaps.length} gap(s) still open - reporting as-is`)
    break
  }

  gapsToAddress = coverage.remainingGaps
  log(`Coverage incomplete: ${coverage.remainingGaps.length} gap(s) remain, looping back to the engineer (round ${round + 1})`)
}

// --- Phase 5: Report (single agent, sequential) ---
phase('Report')
const report = await agent(
  `Write a QA report in markdown for this target. Cover: the strategy and why, what was already covered vs newly written, the actual test run results and any failures/defects found, coverage against the proposed matrix, and the remaining gaps and risk with a clear recommendation. Be honest about anything unverified.\n\nTarget: ${scope.target}\n\nStrategy:\n${JSON.stringify(strategy, null, 2)}\n\nEngineering result:\n${JSON.stringify(engineering, null, 2)}\n\nCoverage verdict:\n${JSON.stringify(coverage, null, 2)}`,
  { agentType: 'qa-reporter' }
)

return { scope, strategy, engineering, coverage, report }
