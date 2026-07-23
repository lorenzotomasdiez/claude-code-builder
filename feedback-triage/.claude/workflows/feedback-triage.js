export const meta = {
  name: 'feedback-triage',
  description: 'Cluster raw user feedback into themes, analyze it through product/market/evidence lenses, and prioritize it into ranked product bets',
  phases: [
    { title: 'Cluster', detail: 'normalize raw feedback into items and cluster them into named themes' },
    { title: 'Analyze', detail: 'parallel fan-out: product-opportunity, market-signal, evidence-confidence lenses' },
    { title: 'Prioritize', detail: 'single pass over all clusters and lenses: RICE-style ranked bets, now/next/later' },
    { title: 'Draft', detail: 'assemble clusters + lenses + bets into one markdown triage document' },
    { title: 'Critique', detail: 'parallel adversarial review: evidence-rigor, business-value, actionability' },
    { title: 'Revise', detail: 'incorporate critique, re-review, repeat until clean or capped' },
  ],
}

const CLUSTER_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          quote: { type: 'string' },
          source: { type: 'string' },
          sentiment: { type: 'string', enum: ['positive', 'negative', 'neutral', 'mixed'] },
        },
        required: ['quote'],
      },
    },
    themes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          name: { type: 'string' },
          itemCount: { type: 'number' },
          sentimentMix: { type: 'string' },
          representativeQuotes: { type: 'array', items: { type: 'string' } },
        },
        required: ['key', 'name', 'itemCount', 'representativeQuotes'],
      },
    },
    unclustered: { type: 'array', items: { type: 'string' } },
  },
  required: ['themes'],
}

const LENS_SCHEMA = {
  type: 'object',
  properties: {
    lens: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          themeKey: { type: 'string' },
          note: { type: 'string' },
        },
        required: ['themeKey', 'note'],
      },
    },
  },
  required: ['lens', 'findings'],
}

const PRIORITIZATION_SCHEMA = {
  type: 'object',
  properties: {
    bets: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          themeKey: { type: 'string' },
          reach: { type: 'string' },
          impact: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
          effort: { type: 'string', enum: ['S', 'M', 'L', 'XL'] },
          rationale: { type: 'string' },
          horizon: { type: 'string', enum: ['now', 'next', 'later'] },
        },
        required: ['themeKey', 'confidence', 'effort', 'rationale', 'horizon'],
      },
    },
    notPrioritized: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          themeKey: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['themeKey', 'reason'],
      },
    },
    openTensions: { type: 'array', items: { type: 'string' } },
  },
  required: ['bets'],
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

const feedback = typeof input === 'string' ? input : input && input.feedback
if (!feedback) {
  throw new Error(
    'Missing the raw feedback. Call this workflow with args set to either a plain string ' +
    '(the raw feedback dump itself) or an object shaped { "feedback": "...", "date": "YYYY-MM-DD" }.'
  )
}
const date = (input && typeof input === 'object' && input.date) || 'unknown - fill in before this leaves draft'

// --- Phase 1: Cluster (single agent, sequential) ---
phase('Cluster')
const clusters = await agent(
  `Normalize this raw feedback dump into discrete items and cluster them into named themes: ${feedback}`,
  { agentType: 'feedback-clusterer', schema: CLUSTER_SCHEMA }
)
log(`Clustered ${(clusters.items || []).length} item(s) into ${clusters.themes.length} theme(s), ${(clusters.unclustered || []).length} unclustered`)

// --- Phase 2: Analyze (parallel fan-out, one agent per lens, over all clusters) ---
phase('Analyze')
const LENSES = [
  { key: 'opportunity', agentType: 'opportunity-scout' },
  { key: 'market-signal', agentType: 'market-signal-scout' },
  { key: 'evidence', agentType: 'evidence-validator' },
]
const analysis = (await parallel(LENSES.map(l => () =>
  agent(
    `Analyze these clustered feedback themes through your assigned lens.\n\nThemes:\n${JSON.stringify(clusters.themes, null, 2)}`,
    { agentType: l.agentType, label: `analyze:${l.key}`, phase: 'Analyze', schema: LENS_SCHEMA }
  )
))).filter(Boolean)

// --- Phase 3: Prioritize (single agent, sequential) ---
phase('Prioritize')
const prioritization = await agent(
  `Combine these clustered themes and lens analyses into one ranked list of prioritized product bets.\n\nThemes:\n${JSON.stringify(clusters.themes, null, 2)}\n\nLens analyses:\n${JSON.stringify(analysis, null, 2)}`,
  { agentType: 'bet-prioritizer', schema: PRIORITIZATION_SCHEMA }
)
log(`Prioritized ${prioritization.bets.length} bet(s), ${(prioritization.notPrioritized || []).length} theme(s) not prioritized`)

// --- Phase 4: Draft (single agent, sequential) ---
phase('Draft')
let draft = await agent(
  `Assemble this clustering, lens analysis, and prioritization into one coherent markdown feedback-triage document. Date to use for the header: ${date}.\n\nClusters:\n${JSON.stringify(clusters, null, 2)}\n\nLens analyses:\n${JSON.stringify(analysis, null, 2)}\n\nPrioritization:\n${JSON.stringify(prioritization, null, 2)}`,
  { agentType: 'triage-writer' }
)

// --- Phase 5/6: Critique -> Revise loop (parallel critics, capped rounds) ---
const CRITIC_LENSES = [
  { key: 'evidence-rigor', agentType: 'evidence-critic' },
  { key: 'business-value', agentType: 'value-critic' },
  { key: 'actionability', agentType: 'actionability-critic' },
]
const MAX_ROUNDS = 2
let round = 0
let allCritiques = []

while (round < MAX_ROUNDS) {
  phase('Critique')
  const critiques = (await parallel(CRITIC_LENSES.map(lens => () =>
    agent(
      `Critique this feedback-triage document through your assigned lens. Be adversarial - look for claims that outrun the evidence, prioritization that just chases volume, and output a stakeholder could not actually act on.\n\n${draft}`,
      { agentType: lens.agentType, label: `critique:${lens.key}`, phase: 'Critique', schema: CRITIQUE_SCHEMA }
    )
  ))).filter(Boolean)
  allCritiques = critiques

  const needsWork = critiques.filter(c => c.verdict === 'needs_revision')
  if (needsWork.length === 0) {
    log('All lenses signed off - triage is ready')
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
    `Revise this feedback-triage document to address the following critique. Keep everything that already works and was not flagged.\n\nCurrent draft:\n${draft}\n\nCritique:\n${JSON.stringify(needsWork, null, 2)}`,
    { agentType: 'triage-writer' }
  )
}

return { clusters, analysis, prioritization, critiques: allCritiques, triage: draft }
