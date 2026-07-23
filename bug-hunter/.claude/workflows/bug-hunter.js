export const meta = {
  name: 'bug-hunter',
  description: 'Reproduce a bug end-to-end, converge on the real root cause from parallel hypotheses, fix it, add a proven regression test, and independently verify',
  phases: [
    { title: 'Reproduce', detail: 'confirm the bug as an end user would actually hit it' },
    { title: 'Hypothesize', detail: 'parallel root-cause investigation: data-flow, state/timing, boundary-input, integration lenses' },
    { title: 'Converge', detail: 'pick the one real root cause, backed by evidence, rejecting the rest' },
    { title: 'Fix', detail: 'implement the minimal correct fix' },
    { title: 'Regression Test', detail: 'write a test proven (via mutation check) to catch this exact bug' },
    { title: 'Verify', detail: 'independently re-run the repro and the new test against the fixed code' },
  ],
}

const REPRO_SCHEMA = {
  type: 'object',
  properties: {
    reproduced: { type: 'boolean' },
    reproSteps: { type: 'array', items: { type: 'string' } },
    input: { type: 'string' },
    actualOutput: { type: 'string' },
    expectedOutput: { type: 'string' },
    approximations: { type: 'string' },
    severity: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['reproduced', 'reproSteps', 'actualOutput', 'expectedOutput'],
}

const HYPOTHESIS_SCHEMA = {
  type: 'object',
  properties: {
    lens: { type: 'string' },
    hypothesis: { type: 'string' },
    location: { type: 'string' },
    mechanism: { type: 'string' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    evidence: { type: 'array', items: { type: 'string' } },
  },
  required: ['lens', 'hypothesis', 'confidence'],
}

const CONVERGENCE_SCHEMA = {
  type: 'object',
  properties: {
    rootCause: { type: 'string' },
    location: { type: 'string' },
    rejectedHypotheses: {
      type: 'array',
      items: {
        type: 'object',
        properties: { lens: { type: 'string' }, reason: { type: 'string' } },
        required: ['lens', 'reason'],
      },
    },
    fixApproach: { type: 'string' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
  },
  required: ['rootCause', 'location', 'fixApproach'],
}

const FIX_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    deviationFromFixApproach: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['summary', 'filesChanged'],
}

const REGRESSION_TEST_SCHEMA = {
  type: 'object',
  properties: {
    testAdded: { type: 'string' },
    testCode: { type: 'string' },
    mutationCheckPassed: { type: 'boolean' },
    testResult: { type: 'string', enum: ['pass', 'fail', 'not_run'] },
    notes: { type: 'string' },
  },
  required: ['testAdded', 'mutationCheckPassed', 'testResult'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    originalReproFixed: { type: 'boolean' },
    regressionTestPassed: { type: 'boolean' },
    nearbyProbeNotes: { type: 'string' },
    issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'originalReproFixed', 'regressionTestPassed'],
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

const bugReport = typeof input === 'string' ? input : input && input.bugReport
if (!bugReport) {
  throw new Error(
    'Missing the bug report. Call this workflow with args set to either a plain string ' +
    '(the bug report itself) or an object shaped { "bugReport": "...", "context": "optional extra context" }.'
  )
}
const context = (input && typeof input === 'object' && input.context) || ''

// --- Phase 1: Reproduce (single agent, sequential) ---
phase('Reproduce')
const repro = await agent(
  `Reproduce this bug end-to-end, as close to how a real user would trigger it as this environment allows. Context: ${context || 'none supplied'}.\n\nBug report:\n${bugReport}`,
  { agentType: 'bug-hunter-reproducer', schema: REPRO_SCHEMA }
)
log(`Reproduced: ${repro.reproduced} - ${repro.actualOutput}`)
if (!repro.reproduced) {
  log('Could not reproduce the bug - stopping before root-cause work, since there is nothing confirmed to fix.')
  return { repro, stopped: 'not_reproduced' }
}

// --- Phase 2: Hypothesize (parallel fan-out, one agent per lens) ---
phase('Hypothesize')
const LENSES = ['data-flow', 'state-timing', 'boundary-input', 'integration-dependency']
const hypotheses = (await parallel(LENSES.map(lens => () =>
  agent(
    `Investigate this confirmed bug strictly through the ${lens} lens.\n\nConfirmed repro:\n${JSON.stringify(repro, null, 2)}`,
    { agentType: 'bug-hunter-hypothesizer', label: `hypothesize:${lens}`, phase: 'Hypothesize', schema: HYPOTHESIS_SCHEMA }
  )
))).filter(Boolean)
log(`${hypotheses.length} hypothesis/es gathered`)

// --- Phase 3: Converge (single agent, sequential) ---
phase('Converge')
const convergence = await agent(
  `Converge on the single real root cause for this bug from the competing hypotheses below, verifying against the code directly rather than trusting self-reported confidence.\n\nConfirmed repro:\n${JSON.stringify(repro, null, 2)}\n\nHypotheses:\n${JSON.stringify(hypotheses, null, 2)}`,
  { agentType: 'bug-hunter-converger', schema: CONVERGENCE_SCHEMA }
)
log(`Root cause: ${convergence.rootCause} (${convergence.location})`)

// --- Phase 4: Fix (single agent, sequential) ---
phase('Fix')
const fix = await agent(
  `Implement the minimal correct fix for this confirmed root cause.\n\nRoot cause:\n${JSON.stringify(convergence, null, 2)}`,
  { agentType: 'bug-hunter-fixer', schema: FIX_SCHEMA }
)
log(`Fix applied: ${fix.summary}`)

// --- Phase 5: Regression Test (single agent, sequential) ---
phase('Regression Test')
const regressionTest = await agent(
  `Write and prove a regression test for this exact bug scenario, now that the fix is applied.\n\nOriginal repro:\n${JSON.stringify(repro, null, 2)}\n\nFix:\n${JSON.stringify(fix, null, 2)}`,
  { agentType: 'bug-hunter-regression-tester', schema: REGRESSION_TEST_SCHEMA }
)
log(`Regression test: ${regressionTest.testAdded} - mutation check passed: ${regressionTest.mutationCheckPassed}`)

// --- Phase 6: Verify (single agent, sequential, independent) ---
phase('Verify')
const verdict = await agent(
  `Independently re-run the original repro and the new regression test against the current (fixed) code, and give a final pass/fail verdict. Do not trust the earlier agents' self-reports - re-run everything yourself.\n\nOriginal repro:\n${JSON.stringify(repro, null, 2)}\n\nFix:\n${JSON.stringify(fix, null, 2)}\n\nRegression test:\n${JSON.stringify(regressionTest, null, 2)}`,
  { agentType: 'bug-hunter-verifier', schema: VERDICT_SCHEMA }
)
log(`Final verdict: ${verdict.verdict}`)

return { repro, hypotheses, convergence, fix, regressionTest, verdict }
