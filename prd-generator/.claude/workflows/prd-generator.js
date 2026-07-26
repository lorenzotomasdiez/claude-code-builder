export const meta = {
  name: 'prd-generator',
  description: 'Generate a Perfect-PRD-standard PRD from a raw idea via clarify -> research -> draft -> critique -> revise',
  phases: [
    { title: 'Clarify', detail: 'turn the raw idea into a structured, sized brief' },
    { title: 'Research', detail: 'parallel fan-out: market, technical, ux lenses' },
    { title: 'Draft', detail: 'write the first PRD draft against the house structure' },
    { title: 'Critique', detail: 'parallel adversarial review against the Quality Checklist: feasibility, completeness, business-value (opus: judgment-heavy)' },
    { title: 'Revise', detail: 'incorporate critique, re-review, repeat until clean or capped' },
  ],
}

const BRIEF_SCHEMA = {
  type: 'object',
  properties: {
    problem: { type: 'string' },
    evidence: { type: 'array', items: { type: 'string' } },
    currentStateAndWorkarounds: { type: 'string' },
    strategicFit: { type: 'string' },
    whyNow: { type: 'string' },
    costOfInaction: { type: 'string' },
    goals: { type: 'array', items: { type: 'string' } },
    primaryMetricHypothesis: { type: 'string' },
    targetUsers: { type: 'array', items: { type: 'string' } },
    antiPersona: { type: 'string' },
    nonGoals: { type: 'array', items: { type: 'string' } },
    constraints: { type: 'array', items: { type: 'string' } },
    productType: { type: 'string' },
    sizing: { type: 'string', enum: ['small', 'medium', 'large'] },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['problem', 'goals', 'targetUsers', 'sizing'],
}

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    lens: { type: 'string' },
    findings: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    dependencies: { type: 'array', items: { type: 'string' } },
  },
  required: ['lens', 'findings'],
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

const idea = typeof input === 'string' ? input : input && input.idea
if (!idea) {
  throw new Error(
    'Missing the product idea. Call this workflow with args set to either a plain string ' +
    '(the idea itself) or an object shaped { "idea": "...", "date": "YYYY-MM-DD" }.'
  )
}
const date = (input && typeof input === 'object' && input.date) || 'unknown - fill in before this leaves Draft'

// --- Phase 1: Clarify (single agent, sequential) ---
phase('Clarify')
const brief = await agent(
  `Turn this raw product idea into a structured brief: "${idea}". If critical details are missing, make explicit, labeled assumptions instead of blocking.`,
  { agentType: 'prd-clarifier', schema: BRIEF_SCHEMA }
)
log(`Brief ready (sizing: ${brief.sizing}): ${brief.problem}`)

// --- Phase 2: Research (parallel fan-out, one agent per lens) ---
phase('Research')
const LENSES = [
  { key: 'market', prompt: `Research the competitive/market landscape for: ${brief.problem}. Goals: ${brief.goals.join('; ')}. Strategic fit as stated in the brief: ${brief.strategicFit || 'not stated'}. Validate or challenge this evidence from the brief with sourced findings: ${(brief.evidence || []).join('; ') || 'none supplied'}` },
  { key: 'technical', prompt: `Assess technical feasibility, non-functional considerations, and dependencies for: ${brief.problem}. Known constraints: ${(brief.constraints || []).join('; ') || 'none stated'}. Product type: ${brief.productType || 'generic'}.` },
  { key: 'ux', prompt: `Research target user needs, UX expectations, and edge cases for: ${brief.problem}. Target users: ${brief.targetUsers.join('; ')}. Anti-persona: ${brief.antiPersona || 'not stated'}.` },
]
const research = (await parallel(LENSES.map(l => () =>
  agent(l.prompt, { agentType: 'prd-researcher', label: `research:${l.key}`, phase: 'Research', schema: FINDINGS_SCHEMA })
))).filter(Boolean)

// --- Phase 3: Draft (single agent, sequential) ---
phase('Draft')
let draft = await agent(
  `Write a full PRD in markdown from this brief and research, following the house structure and sizing rules exactly. Sizing tier: ${brief.sizing}. Date to use for "Last updated": ${date}.\n\nBrief:\n${JSON.stringify(brief, null, 2)}\n\nResearch:\n${JSON.stringify(research, null, 2)}`,
  { agentType: 'prd-writer' }
)

// --- Phase 4/5: Critique -> Revise loop (parallel critics, capped rounds) ---
const CRITIQUE_LENSES = ['feasibility', 'completeness', 'business-value']
const MAX_ROUNDS = 2
let round = 0
let allCritiques = []

while (round < MAX_ROUNDS) {
  phase('Critique')
  const critiques = (await parallel(CRITIQUE_LENSES.map(lens => () =>
    agent(
      `Critique this PRD draft through the ${lens} lens. Be adversarial - look for gaps, unstated assumptions, and unmeasurable goals.\n\n${draft}`,
      { agentType: 'prd-critic', label: `critique:${lens}`, phase: 'Critique', schema: CRITIQUE_SCHEMA, model: 'opus' }
    )
  ))).filter(Boolean)
  allCritiques = critiques

  const needsWork = critiques.filter(c => c.verdict === 'needs_revision')
  if (needsWork.length === 0) {
    log('All lenses signed off - PRD is ready')
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
    `Revise this PRD to address the following critique. Keep everything that already works and was not flagged.\n\nCurrent draft:\n${draft}\n\nCritique:\n${JSON.stringify(needsWork, null, 2)}`,
    { agentType: 'prd-writer' }
  )
}

return { brief, research, critiques: allCritiques, prd: draft }
