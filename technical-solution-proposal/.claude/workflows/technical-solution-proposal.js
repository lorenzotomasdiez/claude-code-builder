export const meta = {
  name: 'technical-solution-proposal',
  description: 'Turn a PRD into a technical solution proposal via a cross-examining expert panel debate, not isolated parallel review',
  phases: [
    { title: 'Scope', detail: 'turn the PRD into a solution-neutral technical brief' },
    { title: 'Propose', detail: 'parallel fan-out: architect, backend, frontend, devops, qa, security each propose independently' },
    { title: 'Debate', detail: 'panelists cross-examine and revise each other\'s proposals, capped rounds' },
    { title: 'Synthesize', detail: 'resolve agreement and disagreement into one coherent proposal' },
  ],
}

const BRIEF_SCHEMA = {
  type: 'object',
  properties: {
    problem: { type: 'string' },
    functionalScope: { type: 'array', items: { type: 'string' } },
    nonFunctionalRequirements: { type: 'array', items: { type: 'string' } },
    constraints: { type: 'array', items: { type: 'string' } },
    integrationPoints: { type: 'array', items: { type: 'string' } },
    outOfScope: { type: 'array', items: { type: 'string' } },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['problem', 'functionalScope'],
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

const prd = typeof input === 'string' ? input : input && (input.prd || input.idea)
if (!prd) {
  throw new Error(
    'Missing the PRD/brief. Call this workflow with args set to either a plain string ' +
    '(the PRD text, or a path to it) or an object shaped { "prd": "..." }.'
  )
}

const PANEL = [
  { key: 'architect', agentType: 'tsp-panel-architect' },
  { key: 'backend', agentType: 'tsp-panel-backend' },
  { key: 'frontend', agentType: 'tsp-panel-frontend' },
  { key: 'devops', agentType: 'tsp-panel-devops' },
  { key: 'qa', agentType: 'tsp-panel-qa' },
  { key: 'security', agentType: 'tsp-panel-security' },
]

// --- Phase 1: Scope (single agent, sequential) ---
phase('Scope')
const brief = await agent(
  `Turn this PRD/brief into a structured, solution-neutral technical brief that a panel of experts will each propose a solution against: ${prd}`,
  { agentType: 'tsp-scoper', schema: BRIEF_SCHEMA }
)
log(`Brief ready: ${brief.problem}`)

// --- Phase 2: Propose (parallel fan-out, one agent per panel seat) ---
phase('Propose')
const initialResults = await parallel(PANEL.map(p => () =>
  agent(
    `You are proposing (not debating yet). Propose your approach to this technical brief:\n\n${JSON.stringify(brief, null, 2)}`,
    { agentType: p.agentType, label: `propose:${p.key}`, phase: 'Propose', schema: PROPOSAL_SCHEMA }
  )
))

// current[key] tracks each seat's latest approach/decisions/risks across rounds.
// Keyed by the PANEL seat key (not the agent-echoed `lens` string, which is freeform
// and doesn't reliably match PANEL keys) - pair positionally since parallel() preserves order.
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
      `Respond to those challenges (concede and revise, or defend with reasoning), then raise your own concrete challenges against other seats' proposals where you disagree, and list anything still unresolved.`,
      { agentType: p.agentType, label: `debate:${p.key}:r${round}`, phase: 'Debate', schema: DEBATE_SCHEMA }
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
const proposal = await agent(
  `Synthesize this panel debate into one coherent technical solution proposal.\n\n` +
  `Technical brief:\n${JSON.stringify(brief, null, 2)}\n\n` +
  `Final proposals per seat:\n${JSON.stringify(finalProposals, null, 2)}\n\n` +
  `Full debate transcript (challenges, responses, concessions, unresolved disagreements per round):\n${JSON.stringify(debateTranscript, null, 2)}`,
  { agentType: 'tsp-synthesizer' }
)

return { brief, initialProposals, debateTranscript, finalProposals, proposal }
