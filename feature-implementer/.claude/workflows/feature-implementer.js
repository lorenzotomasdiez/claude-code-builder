export const meta = {
  name: 'feature-implementer',
  description: 'Take a ticket to a PR: clarify -> plan into slices -> implement/test/self-review each slice in order -> draft the PR body',
  phases: [
    { title: 'Clarify', detail: 'turn the raw ticket into a structured, testable requirement spec' },
    { title: 'Plan', detail: 'architect lens breaks the spec into an ordered list of small slices' },
    { title: 'Implement', detail: 'per slice, in order: implement -> test -> self-review -> revise once if needed' },
    { title: 'Draft PR', detail: 'synthesize spec, plan, and every slice into one PR body' },
  ],
}

const SPEC_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    acceptanceCriteria: { type: 'array', items: { type: 'string' } },
    nonGoals: { type: 'array', items: { type: 'string' } },
    assumptions: { type: 'array', items: { type: 'string' } },
    openQuestions: { type: 'array', items: { type: 'string' } },
    sizing: { type: 'string', enum: ['small', 'medium', 'large'] },
  },
  required: ['title', 'acceptanceCriteria', 'sizing'],
}

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    architectureNotes: { type: 'string' },
    slices: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } },
          risk: { type: 'string' },
        },
        required: ['id', 'title', 'description'],
      },
    },
  },
  required: ['slices'],
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

const TEST_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    testsAdded: { type: 'array', items: { type: 'string' } },
    testResult: { type: 'string', enum: ['pass', 'fail', 'not_run'] },
    notes: { type: 'string' },
  },
  required: ['summary', 'testsAdded', 'testResult'],
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['ready', 'needs_revision'] },
    issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'issues'],
}

const ticket = typeof args === 'string' ? args : args && args.ticket
if (!ticket) {
  throw new Error(
    'Missing the ticket/user story. Call this workflow with args set to either a plain string ' +
    '(the ticket text itself) or an object shaped { "ticket": "...", "context": "optional extra context" } - not a JSON-encoded string.'
  )
}
const context = (args && typeof args === 'object' && args.context) || ''
const MAX_REVISION_ROUNDS = 1

// --- Phase 1: Clarify (single agent, sequential) ---
phase('Clarify')
const spec = await agent(
  `Turn this raw ticket into a structured requirement spec. Context: ${context || 'none supplied'}.\n\nTicket:\n${ticket}`,
  { agentType: 'feature-implementer-clarifier', schema: SPEC_SCHEMA }
)
log(`Spec ready (sizing: ${spec.sizing}): ${spec.title}`)

// --- Phase 2: Plan (single agent, sequential) ---
phase('Plan')
const plan = await agent(
  `Break this requirement spec into an ordered list of small, independently reviewable implementation slices.\n\nSpec:\n${JSON.stringify(spec, null, 2)}`,
  { agentType: 'feature-implementer-planner', schema: PLAN_SCHEMA }
)
log(`Plan ready: ${plan.slices.length} slice(s)`)

// --- Phase 3: Implement (sequential per slice - each slice can depend on the last) ---
phase('Implement')
const priorSlices = []
for (const slice of plan.slices) {
  log(`Slice ${slice.id}: ${slice.title}`)

  let implementation = await agent(
    `Implement this slice of a larger plan. Requirement spec:\n${JSON.stringify(spec, null, 2)}\n\nFull plan (for context only - implement just your slice):\n${JSON.stringify(plan.slices, null, 2)}\n\nYour slice:\n${JSON.stringify(slice, null, 2)}\n\nPrior slices already implemented:\n${JSON.stringify(priorSlices, null, 2)}`,
    { agentType: 'feature-implementer-developer', label: `implement:${slice.id}`, phase: 'Implement', schema: IMPLEMENTATION_SCHEMA }
  )

  let tests = await agent(
    `Write and run tests for this just-implemented slice.\n\nSlice: ${JSON.stringify(slice, null, 2)}\n\nImplementation: ${JSON.stringify(implementation, null, 2)}`,
    { agentType: 'feature-implementer-tester', label: `test:${slice.id}`, phase: 'Implement', schema: TEST_SCHEMA }
  )

  let review = await agent(
    `Adversarially self-review this slice against the requirement spec's acceptance criteria.\n\nSpec: ${JSON.stringify(spec, null, 2)}\n\nSlice: ${JSON.stringify(slice, null, 2)}\n\nImplementation: ${JSON.stringify(implementation, null, 2)}\n\nTests: ${JSON.stringify(tests, null, 2)}`,
    { agentType: 'feature-implementer-self-reviewer', label: `review:${slice.id}`, phase: 'Implement', schema: REVIEW_SCHEMA }
  )

  let round = 0
  while (review.verdict === 'needs_revision' && round < MAX_REVISION_ROUNDS) {
    round++
    log(`Slice ${slice.id}: revising (round ${round}) - ${review.issues.length} issue(s) flagged`)
    implementation = await agent(
      `Revise your implementation of this slice to address the review issues below. Keep what already works.\n\nSlice: ${JSON.stringify(slice, null, 2)}\n\nPrevious implementation: ${JSON.stringify(implementation, null, 2)}\n\nReview issues:\n${JSON.stringify(review.issues, null, 2)}`,
      { agentType: 'feature-implementer-developer', label: `revise:${slice.id}`, phase: 'Implement', schema: IMPLEMENTATION_SCHEMA }
    )
    tests = await agent(
      `Re-check tests for this revised slice, updating them if the revision changed behavior.\n\nSlice: ${JSON.stringify(slice, null, 2)}\n\nImplementation: ${JSON.stringify(implementation, null, 2)}\n\nPrevious tests: ${JSON.stringify(tests, null, 2)}`,
      { agentType: 'feature-implementer-tester', label: `retest:${slice.id}`, phase: 'Implement', schema: TEST_SCHEMA }
    )
    review = await agent(
      `Re-review this revised slice against the requirement spec's acceptance criteria.\n\nSpec: ${JSON.stringify(spec, null, 2)}\n\nSlice: ${JSON.stringify(slice, null, 2)}\n\nImplementation: ${JSON.stringify(implementation, null, 2)}\n\nTests: ${JSON.stringify(tests, null, 2)}`,
      { agentType: 'feature-implementer-self-reviewer', label: `rereview:${slice.id}`, phase: 'Implement', schema: REVIEW_SCHEMA }
    )
  }

  const sliceResult = { slice, implementation, tests, review }
  priorSlices.push(sliceResult)
}

// --- Phase 4: Draft PR (single agent, sequential) ---
phase('Draft PR')
const prBody = await agent(
  `Synthesize this requirement spec, plan, and every implemented slice into one PR description.\n\nSpec:\n${JSON.stringify(spec, null, 2)}\n\nPlan:\n${JSON.stringify(plan, null, 2)}\n\nSlices:\n${JSON.stringify(priorSlices, null, 2)}`,
  { agentType: 'feature-implementer-pr-writer' }
)

return { spec, plan, slices: priorSlices, prBody }
