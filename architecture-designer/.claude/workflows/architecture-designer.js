export const meta = {
  name: 'architecture-designer',
  description: 'Produce an architecture document set (characteristics, component design, ADRs, tech-stack decisions) for a new service or feature via clarify -> draft -> critique -> revise',
  phases: [
    { title: 'Clarify', detail: 'turn the raw request into a structured architecture brief (opus: architecture-level judgment)' },
    { title: 'Draft', detail: 'write the first document set: characteristics, components, ADRs, tech stack (opus: architecture-level judgment)' },
    { title: 'Critique', detail: 'parallel adversarial review: trade-off-rigor, adr-quality, operability (opus: architecture-level judgment)' },
    { title: 'Revise', detail: 'incorporate critique, re-review, repeat until clean or capped (opus: architecture-level judgment)' },
  ],
}

const BRIEF_SCHEMA = {
  type: 'object',
  properties: {
    problem: { type: 'string' },
    scopeBoundary: { type: 'string' },
    drivingCharacteristics: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          rationale: { type: 'string' },
        },
        required: ['name', 'rationale'],
      },
    },
    constraints: { type: 'array', items: { type: 'string' } },
    scaleExpectations: { type: 'string' },
    existingLandscape: { type: 'array', items: { type: 'string' } },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['problem', 'drivingCharacteristics'],
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

const request = typeof input === 'string' ? input : input && input.request
if (!request) {
  throw new Error(
    'Missing the architecture request. Call this workflow with args set to either a plain string ' +
    '(the request itself) or an object shaped { "request": "...", "date": "YYYY-MM-DD" }.'
  )
}
const date = (input && typeof input === 'object' && input.date) || 'unknown - fill in before this leaves Draft'

// --- Phase 1: Clarify (single agent, sequential) ---
phase('Clarify')
const brief = await agent(
  `Turn this raw architecture request into a structured brief: "${request}". If critical details are missing, make explicit, labeled assumptions instead of blocking.`,
  { agentType: 'architecture-clarifier', schema: BRIEF_SCHEMA, model: 'opus' }
)
log(`Brief ready. Top characteristic: ${brief.drivingCharacteristics[0]?.name}`)

// --- Phase 2: Draft (single agent, sequential) ---
phase('Draft')
let draft = await agent(
  `<brief>\n${JSON.stringify(brief, null, 2)}\n</brief>\n\n` +
  `Write the full architecture document set from the brief above, following the house structure exactly. Date to use for "Last updated": ${date}. Design what the brief asks for at the scope it states - where a detail is missing, use a clearly marked placeholder or labeled assumption rather than expanding the design to cover it.`,
  { agentType: 'architecture-writer', model: 'opus' }
)

// --- Phase 3/4: Critique -> Revise loop (parallel critics, capped rounds) ---
const CRITIQUE_LENSES = ['trade-off-rigor', 'adr-quality', 'operability']
const MAX_ROUNDS = 2
let round = 0
let allCritiques = []

while (round < MAX_ROUNDS) {
  phase('Critique')
  const critiques = (await parallel(CRITIQUE_LENSES.map(lens => () =>
    agent(
      `<architecture_draft>\n${draft}\n</architecture_draft>\n\n` +
      `Critique the architecture document above through the ${lens} lens only. Be adversarial - look for hidden trade-offs, weak ADRs, and unoperable designs - and list every checklist item that fails, including the small ones. The verdict rule, not your sense of importance, decides what happens next.`,
      { agentType: 'architecture-critic', label: `critique:${lens}`, phase: 'Critique', schema: CRITIQUE_SCHEMA, model: 'opus' }
    )
  ))).filter(Boolean)
  allCritiques = critiques

  const needsWork = critiques.filter(c => c.verdict === 'needs_revision')
  if (needsWork.length === 0) {
    log('All lenses signed off - architecture design is ready')
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
    `<current_draft>\n${draft}\n</current_draft>\n\n` +
    `<critique>\n${JSON.stringify(needsWork, null, 2)}\n</critique>\n\n` +
    `Revise the document above to address every issue in the critique. Keep everything that already works and was not flagged, and change nothing the critique did not raise - this is a revision pass, not a rewrite.`,
    { agentType: 'architecture-writer', model: 'opus' }
  )
}

return { brief, critiques: allCritiques, architecture: draft }
