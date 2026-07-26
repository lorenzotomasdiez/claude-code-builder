export const meta = {
  name: 'epic-breakdown',
  description: 'Turn a PRD or raw idea into epics, stories with acceptance criteria, estimates, sequencing, and risks',
  phases: [
    { title: 'Scope', detail: 'split the idea/PRD into a small set of value-sized epics' },
    { title: 'Draft Stories', detail: 'one agent per epic, independently, writing INVEST stories with acceptance criteria' },
    { title: 'Sequence & Estimate', detail: 'single pass over all epics/stories: t-shirt estimates, dependencies, delivery sequence, risks (opus: judgment-heavy)' },
    { title: 'Draft', detail: 'assemble scope + stories + sequencing into one markdown breakdown document' },
    { title: 'Critique', detail: 'parallel adversarial review: feasibility, delivery/sequencing-risk, invest-quality' },
    { title: 'Revise', detail: 'incorporate critique, re-review, repeat until clean or capped' },
  ],
}

const SCOPE_SCHEMA = {
  type: 'object',
  properties: {
    epics: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          name: { type: 'string' },
          goal: { type: 'string' },
          boundary: { type: 'string' },
        },
        required: ['key', 'name', 'goal'],
      },
    },
    targetUsers: { type: 'array', items: { type: 'string' } },
    nonGoals: { type: 'array', items: { type: 'string' } },
    assumptions: { type: 'array', items: { type: 'string' } },
  },
  required: ['epics'],
}

const STORIES_SCHEMA = {
  type: 'object',
  properties: {
    epicKey: { type: 'string' },
    stories: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          asA: { type: 'string' },
          iWant: { type: 'string' },
          soThat: { type: 'string' },
          acceptanceCriteria: { type: 'array', items: { type: 'string' } },
        },
        required: ['title', 'asA', 'iWant', 'soThat', 'acceptanceCriteria'],
      },
    },
  },
  required: ['epicKey', 'stories'],
}

const SEQUENCE_SCHEMA = {
  type: 'object',
  properties: {
    sequencedStories: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          epicKey: { type: 'string' },
          title: { type: 'string' },
          estimate: { type: 'string', enum: ['XS', 'S', 'M', 'L', 'XL'] },
          order: { type: 'number' },
          dependsOn: { type: 'array', items: { type: 'string' } },
        },
        required: ['epicKey', 'title', 'estimate', 'order'],
      },
    },
    risks: { type: 'array', items: { type: 'string' } },
    rationale: { type: 'string' },
  },
  required: ['sequencedStories'],
}

const CRITIQUE_SCHEMA = {
  type: 'object',
  properties: {
    lens: { type: 'string' },
    verdict: { type: 'string', enum: ['ready', 'needs_revision'] },
    issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['lens', 'verdict', 'issues'],
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

const brief = typeof input === 'string' ? input : input && input.brief
if (!brief) {
  throw new Error(
    'Missing the brief. Call this workflow with args set to either a plain string ' +
    '(the raw idea or PRD text) or an object shaped { "brief": "...", "date": "YYYY-MM-DD" }.'
  )
}
const date = (input && typeof input === 'object' && input.date) || 'unknown - fill in before this leaves draft'

// --- Phase 1: Scope (single agent, sequential) ---
phase('Scope')
const scope = await agent(
  `Split this raw idea or PRD into a small set of value-sized epics: "${brief}". If critical details are missing, make explicit, labeled assumptions instead of blocking.`,
  { agentType: 'epic-scoper', schema: SCOPE_SCHEMA }
)
log(`Scope ready: ${scope.epics.length} epic(s) - ${scope.epics.map(e => e.key).join(', ')}`)

// --- Phase 2: Draft Stories (pipeline, one agent per epic, independent) ---
phase('Draft Stories')
const storiesByEpic = (await pipeline(
  scope.epics,
  epic => agent(
    `Write user stories with acceptance criteria for this epic. Epic: ${JSON.stringify(epic)}. Target users: ${(scope.targetUsers || []).join('; ') || 'not stated'}. Overall non-goals (do not write stories that violate these): ${(scope.nonGoals || []).join('; ') || 'none stated'}.`,
    { agentType: 'story-writer', label: `stories:${epic.key}`, phase: 'Draft Stories', schema: STORIES_SCHEMA }
  )
)).filter(Boolean)

const totalStories = storiesByEpic.reduce((n, e) => n + e.stories.length, 0)
log(`Stories drafted: ${totalStories} across ${storiesByEpic.length} epic(s)`)

// --- Phase 3: Sequence & Estimate (single agent, sequential) ---
phase('Sequence & Estimate')
const sequence = await agent(
  `Estimate, sequence, and flag delivery risks for this full breakdown.\n\nEpics:\n${JSON.stringify(scope.epics, null, 2)}\n\nStories by epic:\n${JSON.stringify(storiesByEpic, null, 2)}`,
  { agentType: 'sequencing-estimator', schema: SEQUENCE_SCHEMA, model: 'opus' }
)
log(`Sequencing ready: ${sequence.sequencedStories.length} stories sequenced, ${(sequence.risks || []).length} risk(s) flagged`)

// --- Phase 4: Draft (single agent, sequential) ---
phase('Draft')
let draft = await agent(
  `Assemble this scope, stories, and sequencing into one coherent markdown epic-breakdown document. Date to use for the header: ${date}.\n\nScope:\n${JSON.stringify(scope, null, 2)}\n\nStories by epic:\n${JSON.stringify(storiesByEpic, null, 2)}\n\nSequencing/estimates/risks:\n${JSON.stringify(sequence, null, 2)}`,
  { agentType: 'breakdown-writer' }
)

// --- Phase 5/6: Critique -> Revise loop (parallel critics, capped rounds) ---
const CRITIC_LENSES = [
  { key: 'feasibility', agentType: 'feasibility-critic' },
  { key: 'delivery', agentType: 'delivery-critic' },
  { key: 'invest-quality', agentType: 'invest-critic' },
]
const MAX_ROUNDS = 2
let round = 0
let allCritiques = []

while (round < MAX_ROUNDS) {
  phase('Critique')
  const critiques = (await parallel(CRITIC_LENSES.map(lens => () =>
    agent(
      `Critique this epic breakdown through your assigned lens. Be adversarial - look for gaps, unhonored dependencies, and untestable acceptance criteria.\n\n${draft}`,
      { agentType: lens.agentType, label: `critique:${lens.key}`, phase: 'Critique', schema: CRITIQUE_SCHEMA }
    )
  ))).filter(Boolean)
  allCritiques = critiques

  const needsWork = critiques.filter(c => c.verdict === 'needs_revision')
  if (needsWork.length === 0) {
    log('All lenses signed off - breakdown is ready')
    break
  }

  round++
  if (round >= MAX_ROUNDS) {
    log(`Round cap (${MAX_ROUNDS}) reached with ${needsWork.length}/${critiques.length} lenses still flagging issues - returning best draft`)
    break
  }

  phase('Revise')
  log(`Revising: ${needsWork.length}/${critiques.length} lenses flagged issues (round ${round})`)
  draft = await agent(
    `Revise this epic breakdown to address the following critique. Keep everything that already works and was not flagged.\n\nCurrent draft:\n${draft}\n\nCritique:\n${JSON.stringify(needsWork, null, 2)}`,
    { agentType: 'breakdown-writer' }
  )
}

return { scope, stories: storiesByEpic, sequence, critiques: allCritiques, breakdown: draft }
