export const meta = {
  name: 'design-blueprint',
  description: 'Turn a product idea or PRD into a set of buildable UX/UI design documents via a cross-examining panel debate (UX designer, product owner, growth) that weighs what works best against what is most profitable, then synthesizes and authors the docs',
  phases: [
    { title: 'Frame', detail: 'turn the idea/PRD into a solution-neutral design brief' },
    { title: 'Propose', detail: 'parallel fan-out: UX, product, and growth each propose independently (opus: panel-debate judgment)' },
    { title: 'Debate', detail: 'seats cross-examine and revise each other\'s proposals, capped rounds (opus: panel-debate judgment)' },
    { title: 'Synthesize', detail: 'resolve the tensions into one coherent set of design decisions (opus: panel-debate judgment)' },
    { title: 'Author', detail: 'write the design-decisions, user-flows, screens & UI, and landing-page documents in parallel' },
  ],
}

const BRIEF_SCHEMA = {
  type: 'object',
  properties: {
    product: { type: 'string' },
    targetUsers: { type: 'array', items: { type: 'string' } },
    jobsToBeDone: { type: 'array', items: { type: 'string' } },
    primaryUseCases: { type: 'array', items: { type: 'string' } },
    businessGoal: { type: 'string' },
    successMetrics: { type: 'array', items: { type: 'string' } },
    constraints: { type: 'array', items: { type: 'string' } },
    outOfScope: { type: 'array', items: { type: 'string' } },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['product', 'targetUsers'],
}

const PROPOSAL_SCHEMA = {
  type: 'object',
  properties: {
    lens: { type: 'string' },
    approach: { type: 'string' },
    keyDecisions: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['lens', 'approach'],
}

const DEBATE_SCHEMA = {
  type: 'object',
  properties: {
    lens: { type: 'string' },
    revisedApproach: { type: 'string' },
    keyDecisions: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    challengesRaised: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          targetLens: { type: 'string' },
          challenge: { type: 'string' },
        },
        required: ['targetLens', 'challenge'],
      },
    },
    responsesToChallenges: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          fromLens: { type: 'string' },
          response: { type: 'string' },
          conceded: { type: 'boolean' },
        },
        required: ['fromLens', 'response', 'conceded'],
      },
    },
    unresolvedDisagreements: { type: 'array', items: { type: 'string' } },
  },
  required: ['lens', 'revisedApproach'],
}

const DECISIONS_SCHEMA = {
  type: 'object',
  properties: {
    productDirection: { type: 'string' },
    prioritizedScope: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          item: { type: 'string' },
          priority: { type: 'string', enum: ['must', 'should', 'later'] },
          rationale: { type: 'string' },
        },
        required: ['item', 'priority'],
      },
    },
    userFlows: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          summary: { type: 'string' },
        },
        required: ['name'],
      },
    },
    screenInventory: { type: 'array', items: { type: 'string' } },
    landingPlan: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          section: { type: 'string' },
          intent: { type: 'string' },
        },
        required: ['section'],
      },
    },
    tradeoffs: { type: 'array', items: { type: 'string' } },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['productDirection', 'prioritizedScope'],
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

const idea = typeof input === 'string' ? input : input && (input.idea || input.prd)
if (!idea) {
  throw new Error(
    'Missing the product idea/PRD. Call this workflow with args set to either a plain string ' +
    '(the idea text, or a path to a PRD) or an object shaped { "idea": "..." }.'
  )
}

const PANEL = [
  { key: 'ux', agentType: 'db-panel-ux' },
  { key: 'product', agentType: 'db-panel-product' },
  { key: 'growth', agentType: 'db-panel-growth' },
]

// --- Phase 1: Frame (single agent, sequential) ---
phase('Frame')
const brief = await agent(
  `Turn this product idea/PRD into a structured, solution-neutral design brief that a panel (UX designer, product owner, growth) will each design against:\n\n${idea}`,
  { agentType: 'db-framer', schema: BRIEF_SCHEMA }
)
log(`Brief ready: ${brief.product}`)

// --- Phase 2: Propose (parallel fan-out, one agent per panel seat) ---
phase('Propose')
const initialResults = await parallel(PANEL.map(p => () =>
  agent(
    `You are proposing (not debating yet). Put forward your view on how this product should be designed, from your lens:\n\n${JSON.stringify(brief, null, 2)}`,
    { agentType: p.agentType, label: `propose:${p.key}`, phase: 'Propose', schema: PROPOSAL_SCHEMA, model: 'opus' }
  )
))

// current[key] tracks each seat's latest approach/decisions/risks across rounds.
// Keyed by the PANEL seat key (not the agent-echoed `lens` string, which is freeform);
// paired positionally since parallel() preserves order.
const current = {}
PANEL.forEach((p, i) => {
  const r = initialResults[i]
  if (r) current[p.key] = { approach: r.approach, keyDecisions: r.keyDecisions || [], risks: r.risks || [], openQuestions: r.openQuestions || [] }
})
const initialProposals = initialResults.filter(Boolean)
log(`${initialProposals.length}/${PANEL.length} seats proposed`)

// --- Phase 3: Debate (capped rounds, parallel per seat each round) ---
const MAX_DEBATE_ROUNDS = 2
const debateTranscript = []
let pendingChallenges = {} // lens -> array of {fromLens, challenge}

for (let round = 1; round <= MAX_DEBATE_ROUNDS; round++) {
  phase('Debate')
  const proposalsSnapshot = PANEL
    .filter(p => current[p.key])
    .map(p => ({ lens: p.key, ...current[p.key] }))

  const activeSeats = PANEL.filter(p => current[p.key])
  const rawRoundResults = await parallel(activeSeats.map(p => () => {
    const challengesForMe = pendingChallenges[p.key] || []
    return agent(
      `Round ${round} of debate. Here are all current proposals, including your own (lens: ${p.key}):\n\n${JSON.stringify(proposalsSnapshot, null, 2)}\n\n` +
      `Challenges other seats raised against you in the previous round (empty if none yet):\n${JSON.stringify(challengesForMe, null, 2)}\n\n` +
      `Respond to those challenges (concede and revise, or defend with reasoning), then raise your own concrete challenges against other seats' proposals where you disagree - especially where the best UX and the most profitable choice pull apart - and list anything still unresolved.`,
      { agentType: p.agentType, label: `debate:${p.key}:r${round}`, phase: 'Debate', schema: DEBATE_SCHEMA, model: 'opus' }
    )
  }))
  // Pair positionally with activeSeats (not by r.lens, which is agent-echoed and unreliable)
  const roundResults = activeSeats
    .map((p, i) => rawRoundResults[i] ? { key: p.key, ...rawRoundResults[i] } : null)
    .filter(Boolean)

  debateTranscript.push({ round, results: roundResults })

  // Apply revisions and collect next round's incoming challenges
  const nextChallenges = {}
  let totalChallenges = 0
  let totalUnresolved = 0
  for (const r of roundResults) {
    current[r.key] = {
      approach: r.revisedApproach || current[r.key].approach,
      keyDecisions: (r.keyDecisions && r.keyDecisions.length) ? r.keyDecisions : current[r.key].keyDecisions,
      risks: (r.risks && r.risks.length) ? r.risks : current[r.key].risks,
      openQuestions: current[r.key].openQuestions,
    }
    for (const c of (r.challengesRaised || [])) {
      totalChallenges++
      if (!nextChallenges[c.targetLens]) nextChallenges[c.targetLens] = []
      nextChallenges[c.targetLens].push({ fromLens: r.key, challenge: c.challenge })
    }
    totalUnresolved += (r.unresolvedDisagreements || []).length
  }
  pendingChallenges = nextChallenges
  log(`Round ${round}: ${totalChallenges} challenges raised, ${totalUnresolved} disagreements still flagged unresolved`)

  if (totalChallenges === 0 && totalUnresolved === 0) {
    log('Panel converged with no new challenges - ending debate early')
    break
  }
}

// --- Phase 4: Synthesize (single agent, sequential) ---
phase('Synthesize')
const finalProposals = PANEL.filter(p => current[p.key]).map(p => ({ lens: p.key, ...current[p.key] }))
const decisions = await agent(
  `Resolve this panel debate into one coherent set of design decisions.\n\n` +
  `Design brief:\n${JSON.stringify(brief, null, 2)}\n\n` +
  `Final proposals per seat:\n${JSON.stringify(finalProposals, null, 2)}\n\n` +
  `Full debate transcript (challenges, responses, concessions, unresolved disagreements per round):\n${JSON.stringify(debateTranscript, null, 2)}`,
  { agentType: 'db-synthesizer', schema: DECISIONS_SCHEMA, model: 'opus' }
)
log(`Decisions ready: ${(decisions.prioritizedScope || []).length} scope item(s), ${(decisions.userFlows || []).length} flow(s), ${(decisions.landingPlan || []).length} landing section(s)`)

// --- Phase 5: Author the document set (parallel, one agent per document) ---
phase('Author')
const DOC_TYPES = [
  { key: 'design-decisions', title: 'Design decisions & priorities' },
  { key: 'user-flows', title: 'User flows' },
  { key: 'screens-and-ui', title: 'Screens & UI' },
  { key: 'landing-page', title: 'Landing page' },
]
const docContext =
  `Design brief:\n${JSON.stringify(brief, null, 2)}\n\n` +
  `Synthesized design decisions:\n${JSON.stringify(decisions, null, 2)}\n\n` +
  `Debate transcript (for the reasoning behind the decisions):\n${JSON.stringify(debateTranscript, null, 2)}`

const authored = await parallel(DOC_TYPES.map(d => () =>
  agent(
    `Write the "${d.key}" document ("${d.title}") for this product, following your instructions for that specific document. Use only what the decisions and brief support.\n\n${docContext}`,
    { agentType: 'db-doc-author', label: `author:${d.key}`, phase: 'Author' }
  )
))
const documents = DOC_TYPES
  .map((d, i) => authored[i] ? { key: d.key, title: d.title, markdown: authored[i] } : null)
  .filter(Boolean)
log(`Authored ${documents.length}/${DOC_TYPES.length} document(s)`)

return { brief, initialProposals, debateTranscript, finalProposals, decisions, documents }
