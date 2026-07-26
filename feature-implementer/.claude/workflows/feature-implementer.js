export const meta = {
  name: 'feature-implementer',
  description: 'Take a TDD blueprint to a PR by doing real TDD: read the blueprint\'s behavior specs and red-green build order, then per slice write the failing test first, verify it is genuinely red, implement until a real exit code says green, and review through three independent lenses. Runs downstream of /tdd-blueprint and invents no acceptance criteria of its own.',
  phases: [
    { title: 'Read blueprint', detail: 'normalize the TDD blueprint into behavior specs and an ordered slice list, preserving spec IDs' },
    { title: 'Red', detail: 'per slice: write the failing test first, then verify it actually fails' },
    { title: 'Green', detail: 'per slice: implement until the verifier reports a real exit code of 0' },
    { title: 'Review', detail: 'three independent lenses in parallel: spec conformance, regression risk, code quality' },
    { title: 'Draft PR', detail: 'synthesize every slice into one PR body, blocked work stated first' },
  ],
}

// Normalized blueprint. Spec IDs are the spine of this whole workflow: they come from
// /tdd-blueprint's behavior-specs.md, they travel through the tests, and they are what the
// spec lens reviews against. Nothing downstream is allowed to mint new ones.
const BLUEPRINT_SCHEMA = {
  type: 'object',
  properties: {
    product: { type: 'string' },
    specs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          layer: { type: 'string' },
          given: { type: 'string' },
          when: { type: 'string' },
          then: { type: 'string' },
        },
        required: ['id', 'given', 'when', 'then'],
      },
    },
    slices: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          step: { type: 'number' },
          sliceKey: { type: 'string' },
          goal: { type: 'string' },
          firstFailingSpecId: { type: 'string' },
          specIds: { type: 'array', items: { type: 'string' } },
          doneWhen: { type: 'string' },
          dependsOn: { type: 'array', items: { type: 'string' } },
          risk: { type: 'string' },
        },
        required: ['step', 'sliceKey', 'goal', 'firstFailingSpecId', 'specIds'],
      },
    },
    gaps: { type: 'array', items: { type: 'string' } },
  },
  required: ['specs', 'slices'],
}

// The test author names the command but never reports a result - see VERIFY_SCHEMA.
const TEST_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    testsAdded: { type: 'array', items: { type: 'string' } },
    specIdsCovered: { type: 'array', items: { type: 'string' } },
    testCommand: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['summary', 'testsAdded', 'specIdsCovered', 'testCommand'],
}

// The machine gate. No `summary`, no `verdict`, nowhere to put an opinion - the orchestrator
// gates on the integer, never on prose. `ranAtAll: false` is its own outcome so that "there
// is no test runner here" can never be laundered into "the tests passed".
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

const IMPLEMENTATION_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    filesChanged: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['summary', 'filesChanged'],
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['ready', 'needs_revision'] },
    issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'issues'],
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

const behaviorSpecs = input && typeof input === 'object' && input.behaviorSpecs
const tddPlan = input && typeof input === 'object' && input.tddPlan
if (!behaviorSpecs || !tddPlan) {
  throw new Error(
    'This workflow runs downstream of /tdd-blueprint and does not invent its own acceptance criteria. ' +
    'Call it with args shaped { "behaviorSpecs": "<contents of docs/testing/<slug>/behavior-specs.md>", ' +
    '"tddPlan": "<contents of docs/testing/<slug>/tdd-plan.md>", "context": "<optional repo context>" }. ' +
    'If no blueprint exists yet, run /tdd-blueprint first.'
  )
}
const context = (input && typeof input === 'object' && input.context) || ''

// Two separate caps, because they fail for different reasons. FIX rounds address a machine
// failure (the command exits nonzero); REVIEW rounds address human-style judgment. Research
// on agent revise loops finds disagreements saturate within about two exchanges, and that a
// model cannot reliably decide when it is done - so the ceiling lives here in orchestrator
// code, and hitting it marks the slice blocked rather than quietly proceeding.
const MAX_FIX_ROUNDS = 2
const MAX_REVIEW_ROUNDS = 2

const REVIEW_LENSES = [
  { key: 'spec', agentType: 'feature-implementer-lens-spec' },
  { key: 'regression', agentType: 'feature-implementer-lens-regression' },
  { key: 'quality', agentType: 'feature-implementer-lens-quality' },
]

// A slice passes only when the machine agrees AND every lens agrees. Prose is never consulted.
function verifyPassed(v) {
  return Boolean(v) && v.ranAtAll === true && v.exitCode === 0
}

// --- Phase 1: Read the blueprint (single agent, sequential) ---
phase('Read blueprint')
const blueprint = await agent(
  `Normalize this TDD blueprint into behavior specs and an ordered slice list. Carry every spec ID through exactly as written - do not renumber, rename, invent, or drop any.\n\n` +
  `<behavior_specs>\n${behaviorSpecs}\n</behavior_specs>\n\n<tdd_plan>\n${tddPlan}\n</tdd_plan>`,
  { agentType: 'feature-implementer-blueprint-reader', schema: BLUEPRINT_SCHEMA }
)
log(`Blueprint read: ${blueprint.specs.length} spec(s), ${blueprint.slices.length} slice(s) in build order`)
if (blueprint.gaps && blueprint.gaps.length) {
  log(`Blueprint carries ${blueprint.gaps.length} known gap(s) - these travel to the PR body`)
}

const specById = new Map(blueprint.specs.map(s => [s.id, s]))
const slices = [...blueprint.slices].sort((a, b) => a.step - b.step)

// --- Phase 2-4: per slice, red -> green -> review (sequential: slices build on each other) ---
const priorSlices = []
for (const slice of slices) {
  const sliceSpecs = (slice.specIds || []).map(id => specById.get(id)).filter(Boolean)
  const firstFailing = specById.get(slice.firstFailingSpecId)
  const specContext = JSON.stringify({ firstFailingSpec: firstFailing, allSpecsForThisSlice: sliceSpecs }, null, 2)

  phase('Red')
  log(`Slice ${slice.step} (${slice.sliceKey}): ${slice.goal} - first failing spec ${slice.firstFailingSpecId}`)

  const tests = await agent(
    `Write the failing test(s) for this slice, from its behavior specs, before any implementation exists. Start with the first failing spec. Carry each spec ID into the test name or a comment so the test is traceable back to the blueprint.\n\n` +
    `Slice: ${JSON.stringify(slice, null, 2)}\n\nSpecs:\n${specContext}\n\n` +
    `Repo context: ${context || 'none supplied'}\n\n` +
    `Prior slices already built:\n${JSON.stringify(priorSlices.map(s => ({ sliceKey: s.slice.sliceKey, status: s.status })), null, 2)}`,
    { agentType: 'feature-implementer-test-author', label: `write-test:${slice.sliceKey}`, phase: 'Red', schema: TEST_SCHEMA }
  )

  const runTests = (label, ph) => agent(
    `Run this command and report exactly what happened. Do not fix, retry, or interpret.\n\nCommand: ${tests.testCommand}`,
    { agentType: 'feature-implementer-verifier', label, phase: ph, schema: VERIFY_SCHEMA }
  )

  const noRunner = { command: '', exitCode: -1, ranAtAll: false, outputTail: 'No test command reported - this codebase appears to have no test runner.' }

  // The red step. A test that passes before the code exists is not testing anything, so a
  // green result here is a defect in the test, not good news. Recorded either way.
  const redCheck = tests.testCommand ? await runTests(`verify-red:${slice.sliceKey}`, 'Red') : noRunner
  const wasGenuinelyRed = Boolean(tests.testCommand) && redCheck.ranAtAll === true && redCheck.exitCode !== 0
  if (!tests.testCommand) {
    log(`Slice ${slice.step}: no test runner in this codebase - TDD cannot be verified for this slice`)
  } else if (!redCheck.ranAtAll) {
    log(`Slice ${slice.step}: red check could not run - ${redCheck.outputTail || 'no output'}`)
  } else if (redCheck.exitCode === 0) {
    log(`Slice ${slice.step}: WARNING - the new test passed before implementation. It is probably not asserting anything real.`)
  } else {
    log(`Slice ${slice.step}: red confirmed (exit ${redCheck.exitCode})`)
  }

  // --- Green: implement until the machine says so ---
  phase('Green')
  let implementation = await agent(
    `Make these failing tests pass. The tests are the specification - do not weaken, skip, or delete them to get to green.\n\n` +
    `Slice: ${JSON.stringify(slice, null, 2)}\n\nSpecs:\n${specContext}\n\n` +
    `Tests just written: ${JSON.stringify(tests, null, 2)}\n\n` +
    `Failing test output:\n${redCheck.outputTail || '(none captured)'}\n\n` +
    `Prior slices already implemented:\n${JSON.stringify(priorSlices.map(s => ({ slice: s.slice, implementation: s.implementation, status: s.status })), null, 2)}`,
    { agentType: 'feature-implementer-developer', label: `implement:${slice.sliceKey}`, phase: 'Green', schema: IMPLEMENTATION_SCHEMA }
  )

  let verification = tests.testCommand ? await runTests(`verify-green:${slice.sliceKey}`, 'Green') : noRunner

  let fixRound = 0
  while (!verifyPassed(verification) && fixRound < MAX_FIX_ROUNDS && tests.testCommand) {
    fixRound++
    log(`Slice ${slice.step}: still failing (exit ${verification.exitCode}) - fix round ${fixRound}/${MAX_FIX_ROUNDS}`)
    implementation = await agent(
      `Your slice still fails its tests. Fix the implementation. Do not weaken or delete the tests to make them green.\n\n` +
      `Slice: ${JSON.stringify(slice, null, 2)}\n\nCurrent implementation: ${JSON.stringify(implementation, null, 2)}\n\n` +
      `Command run: ${verification.command}\nExit code: ${verification.exitCode}\nOutput:\n${verification.outputTail || '(none captured)'}`,
      { agentType: 'feature-implementer-developer', label: `fix:${slice.sliceKey}`, phase: 'Green', schema: IMPLEMENTATION_SCHEMA }
    )
    verification = await runTests(`reverify:${slice.sliceKey}`, 'Green')
  }

  // --- Review: three independent lenses, any one can hold the slice back ---
  let reviews = []
  let reviewRound = 0
  let flagged = []
  while (reviewRound < MAX_REVIEW_ROUNDS) {
    phase('Review')
    const label = reviewRound === 0 ? 'review' : 'rereview'
    reviews = (await parallel(REVIEW_LENSES.map(lens => () =>
      agent(
        `Review this slice through the ${lens.key} lens only.\n\n` +
        `Slice: ${JSON.stringify(slice, null, 2)}\n\nBlueprint specs this slice must satisfy:\n${specContext}\n\n` +
        `Implementation: ${JSON.stringify(implementation, null, 2)}\n\nTests written: ${JSON.stringify(tests, null, 2)}\n\n` +
        `Verifier result (authoritative - do not re-run or dispute):\n${JSON.stringify(verification, null, 2)}\n\n` +
        `Was the test genuinely red before implementation: ${wasGenuinelyRed}`,
        { agentType: lens.agentType, label: `${label}:${lens.key}:${slice.sliceKey}`, phase: 'Review', schema: REVIEW_SCHEMA }
      ).then(r => ({ lens: lens.key, ...r }))
    ))).filter(Boolean)

    flagged = reviews.filter(r => r.verdict === 'needs_revision')
    if (flagged.length === 0) break

    reviewRound++
    if (reviewRound >= MAX_REVIEW_ROUNDS) {
      log(`Slice ${slice.step}: review cap (${MAX_REVIEW_ROUNDS}) reached with ${flagged.length}/${reviews.length} lens(es) still flagging - marking blocked`)
      break
    }

    phase('Green')
    log(`Slice ${slice.step}: revising (round ${reviewRound}) - ${flagged.length}/${reviews.length} lens(es) flagged`)
    implementation = await agent(
      `Revise your implementation to address the review issues below. Keep what already works and was not flagged. Do not weaken the tests.\n\n` +
      `Slice: ${JSON.stringify(slice, null, 2)}\n\nPrevious implementation: ${JSON.stringify(implementation, null, 2)}\n\n` +
      `Issues by lens:\n${JSON.stringify(flagged.map(f => ({ lens: f.lens, issues: f.issues })), null, 2)}`,
      { agentType: 'feature-implementer-developer', label: `revise:${slice.sliceKey}`, phase: 'Green', schema: IMPLEMENTATION_SCHEMA }
    )
    if (tests.testCommand) verification = await runTests(`reverify:${slice.sliceKey}`, 'Green')
  }

  // A slice ships only if the machine agrees and every lens agrees. Anything else is blocked,
  // loudly, and travels to the PR writer as such.
  const machineOk = verifyPassed(verification)
  const lensesOk = flagged.length === 0
  const status = machineOk && lensesOk ? 'shipped' : 'blocked'
  const blockedReason = machineOk
    ? (lensesOk ? '' : `${flagged.length} review lens(es) still flagging after ${MAX_REVIEW_ROUNDS} round(s): ${flagged.map(f => f.lens).join(', ')}`)
    : (verification.ranAtAll
        ? `tests failed with exit code ${verification.exitCode} after ${fixRound} fix round(s)`
        : 'tests never ran - no runner in this codebase, or the command could not start')

  if (status === 'blocked') log(`Slice ${slice.step} (${slice.sliceKey}): BLOCKED - ${blockedReason}`)
  else log(`Slice ${slice.step} (${slice.sliceKey}): shipped (tests exit 0, all ${reviews.length} lenses ready)`)

  priorSlices.push({ slice, specs: sliceSpecs, tests, redCheck, wasGenuinelyRed, implementation, verification, reviews, status, blockedReason })
}

const blockedSlices = priorSlices.filter(s => s.status === 'blocked')
const notGenuinelyRed = priorSlices.filter(s => !s.wasGenuinelyRed)
if (blockedSlices.length) {
  log(`${blockedSlices.length}/${priorSlices.length} slice(s) blocked - the PR body will lead with them`)
}
if (notGenuinelyRed.length) {
  log(`${notGenuinelyRed.length}/${priorSlices.length} slice(s) were never confirmed red before implementation - their tests may not assert anything`)
}
if (priorSlices.length > 0 && blockedSlices.length === priorSlices.length) {
  throw new Error(
    `Every slice is blocked - this run produced no shippable work. Reasons:\n` +
    blockedSlices.map(s => `  - ${s.slice.sliceKey}: ${s.blockedReason}`).join('\n')
  )
}

// --- Phase 5: Draft PR (single agent, sequential) ---
phase('Draft PR')
const prBody = await agent(
  `Synthesize this TDD run into one PR description. Lead with blocked work if there is any.\n\n` +
  `Blueprint specs:\n${JSON.stringify(blueprint.specs, null, 2)}\n\n` +
  `Blueprint gaps carried in:\n${JSON.stringify(blueprint.gaps || [], null, 2)}\n\n` +
  `Slices:\n${JSON.stringify(priorSlices, null, 2)}`,
  { agentType: 'feature-implementer-pr-writer' }
)

return { blueprint, slices: priorSlices, blockedSlices, notGenuinelyRed, prBody }
