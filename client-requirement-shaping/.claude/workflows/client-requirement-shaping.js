export const meta = {
  name: 'client-requirement-shaping',
  description: 'Turn a vague client ask into a buildable proposal: sourced research, an 8-seat expert panel that cross-examines itself, two outside voices that cut the scope and argue against building at all, then a client proposal plus a PRD-ready seed',
  phases: [
    { title: 'Intake', detail: 'separate what the client asked for from what they actually need' },
    { title: 'Research', detail: 'parallel fan-out: market, existing solutions, technical prior art, user evidence - with sources' },
    { title: 'Propose', detail: 'parallel fan-out: 8 expert seats each propose independently' },
    { title: 'Debate', detail: 'seats cross-examine and revise each other, capped rounds' },
    { title: 'Challenge', detail: 'two outside voices judge the panel: the reductionist cuts, the devil\'s advocate argues against building - either can send the panel back' },
    { title: 'Synthesize', detail: 'resolve everything into one coherent set of decisions, disagreements recorded not hidden' },
    { title: 'Author', detail: 'write the client proposal and the PRD-ready seed in parallel' },
  ],
}

const BRIEF_SCHEMA = {
  type: 'object',
  properties: {
    clientAsk: { type: 'string' },
    restatedNeed: { type: 'string' },
    targetUsers: { type: 'array', items: { type: 'string' } },
    jobsToBeDone: { type: 'array', items: { type: 'string' } },
    successLooksLike: { type: 'array', items: { type: 'string' } },
    statedConstraints: { type: 'array', items: { type: 'string' } },
    outOfScopeSignals: { type: 'array', items: { type: 'string' } },
    assumptions: { type: 'array', items: { type: 'string' } },
    unknowns: { type: 'array', items: { type: 'string' } },
    ideaType: { type: 'string', enum: ['greenfield', 'addition', 'replacement'] },
  },
  required: ['clientAsk', 'restatedNeed', 'targetUsers'],
}

const RESEARCH_SCHEMA = {
  type: 'object',
  properties: {
    lens: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          claim: { type: 'string' },
          evidence: { type: 'string' },
          source: { type: 'string' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
        required: ['claim', 'confidence'],
      },
    },
    implications: { type: 'array', items: { type: 'string' } },
    contradictions: { type: 'array', items: { type: 'string' } },
    gaps: { type: 'array', items: { type: 'string' } },
  },
  required: ['lens', 'findings'],
}

const PROPOSAL_SCHEMA = {
  type: 'object',
  properties: {
    lens: { type: 'string' },
    position: { type: 'string' },
    keyDecisions: { type: 'array', items: { type: 'string' } },
    mustBeTrue: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['lens', 'position'],
}

const DEBATE_SCHEMA = {
  type: 'object',
  properties: {
    lens: { type: 'string' },
    revisedPosition: { type: 'string' },
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
  required: ['lens', 'revisedPosition'],
}

const CUT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['proportionate', 'overbuilt'] },
    oneSentenceCut: { type: 'string' },
    minimalVersion: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          item: { type: 'string' },
          why: { type: 'string' },
        },
        required: ['item'],
      },
    },
    cutList: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          item: { type: 'string' },
          why: { type: 'string' },
          timing: { type: 'string', enum: ['not_now', 'not_ever'] },
          reentrySignal: { type: 'string' },
        },
        required: ['item', 'timing'],
      },
    },
    refusedToCut: { type: 'array', items: { type: 'string' } },
    reasoning: { type: 'string' },
  },
  required: ['verdict', 'minimalVersion', 'cutList'],
}

const CASE_AGAINST_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['worth_building', 'reframe', 'do_not_build'] },
    strongestObjection: { type: 'string' },
    caseAgainst: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          objection: { type: 'string' },
          evidence: { type: 'string' },
        },
        required: ['objection'],
      },
    },
    killCriteria: { type: 'array', items: { type: 'string' } },
    whatWouldChangeMyMind: { type: 'array', items: { type: 'string' } },
    caseFor: { type: 'string' },
    reframeDirection: { type: 'string' },
  },
  required: ['verdict', 'strongestObjection', 'caseAgainst'],
}

const DECISIONS_SCHEMA = {
  type: 'object',
  properties: {
    productName: { type: 'string' },
    whatTheyAskedFor: { type: 'string' },
    whatTheyActuallyNeed: { type: 'string' },
    recommendedShape: { type: 'string' },
    minimalVersion: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          item: { type: 'string' },
          rationale: { type: 'string' },
        },
        required: ['item'],
      },
    },
    recommendedScope: {
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
    explicitlyNotBuilding: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          item: { type: 'string' },
          timing: { type: 'string', enum: ['not_now', 'not_ever'] },
          reentrySignal: { type: 'string' },
        },
        required: ['item', 'timing'],
      },
    },
    uxDirection: {
      type: 'object',
      properties: {
        flows: {
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
        screens: { type: 'array', items: { type: 'string' } },
      },
    },
    effortAndSequencing: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          phase: { type: 'string' },
          contents: { type: 'string' },
          roughSize: { type: 'string' },
        },
        required: ['phase'],
      },
    },
    risks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          risk: { type: 'string' },
          mitigation: { type: 'string' },
        },
        required: ['risk'],
      },
    },
    keyAssumptions: { type: 'array', items: { type: 'string' } },
    killCriteria: { type: 'array', items: { type: 'string' } },
    unresolvedDebates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          topic: { type: 'string' },
          sideA: { type: 'string' },
          sideB: { type: 'string' },
          call: { type: 'string' },
        },
        required: ['topic'],
      },
    },
    openQuestions: { type: 'array', items: { type: 'string' } },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    confidenceReasoning: { type: 'string' },
  },
  required: ['whatTheyActuallyNeed', 'recommendedShape', 'recommendedScope'],
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

const clientAsk = typeof input === 'string' ? input : input && (input.ask || input.idea)
if (!clientAsk) {
  throw new Error(
    'Missing the client ask. Call this workflow with args set to either a plain string ' +
    '(the client\'s request itself) or an object shaped ' +
    '{ "ask": "...", "context": "optional background on the client/product", "debateRounds": 2 }.'
  )
}
const clientContext = (input && typeof input === 'object' && input.context) || ''

// Debate depth is tunable so a smoke test can run cheap (1) while a real engagement runs full (2+).
const MAX_DEBATE_ROUNDS = (input && typeof input === 'object' && Number(input.debateRounds)) || 2
// How many times the outside voices may send the panel back to answer them.
const MAX_OUTSIDE_ROUNDS = 2

const PANEL = [
  { key: 'architect-systems', agentType: 'crs-panel-architect-systems' },
  { key: 'architect-pragmatic', agentType: 'crs-panel-architect-pragmatic' },
  { key: 'ux-designer', agentType: 'crs-panel-ux-designer' },
  { key: 'user-researcher', agentType: 'crs-panel-user-researcher' },
  { key: 'product-owner', agentType: 'crs-panel-product-owner' },
  { key: 'business-model', agentType: 'crs-panel-business-model' },
  { key: 'delivery-lead', agentType: 'crs-panel-delivery-lead' },
  { key: 'domain-skeptic', agentType: 'crs-panel-domain-skeptic' },
]

// --- Phase 1: Intake (single agent, sequential) ---
phase('Intake')
const brief = await agent(
  `Turn this client ask into a structured, solution-neutral requirement brief. Separate what they literally asked for from the underlying job.\n\n` +
  `Client ask:\n${clientAsk}\n\n` +
  `Additional context: ${clientContext || 'none supplied'}`,
  { agentType: 'crs-intake', schema: BRIEF_SCHEMA }
)
log(`Brief ready (${brief.ideaType || 'unclassified'}): they asked for "${brief.clientAsk.slice(0, 90)}" - underlying need identified`)

// --- Phase 2: Research (parallel fan-out, one agent per lens) ---
phase('Research')
const RESEARCH_LENSES = [
  { key: 'market-and-competitors', prompt: `Research the market and competitors for this need: ${brief.restatedNeed}. Target users: ${brief.targetUsers.join('; ')}. Who already sells something for this job, at what price, to whom, and where are they weak?` },
  { key: 'existing-solutions', prompt: `Research what people currently do instead, for this need: ${brief.restatedNeed}. Include non-product workarounds (spreadsheets, manual process, agencies) and off-the-shelf or open-source tools that already cover part of it. Could the client simply use one of those? Known workarounds from intake: ${(brief.outOfScopeSignals || []).join('; ') || 'none noted'}` },
  { key: 'technical-prior-art', prompt: `Research how this class of problem is normally solved technically: ${brief.restatedNeed}. Standard architectures, what is bought rather than built, the known hard parts, the integrations this inevitably needs, and realistic cost drivers. Stated constraints: ${(brief.statedConstraints || []).join('; ') || 'none stated'}` },
  { key: 'user-evidence', prompt: `Research evidence that these users actually have this problem and act on it: ${brief.restatedNeed}. Target users: ${brief.targetUsers.join('; ')}. Jobs to be done: ${(brief.jobsToBeDone || []).join('; ') || 'not yet stated'}. Grade the evidence hard, and report thin evidence as a finding rather than padding it.` },
]
const research = (await parallel(RESEARCH_LENSES.map(l => () =>
  agent(l.prompt, { agentType: 'crs-researcher', label: `research:${l.key}`, phase: 'Research', schema: RESEARCH_SCHEMA })
))).filter(Boolean)
const totalFindings = research.reduce((n, r) => n + (r.findings || []).length, 0)
const lowConfidence = research.reduce((n, r) => n + (r.findings || []).filter(f => f.confidence === 'low').length, 0)
log(`Research done: ${research.length}/${RESEARCH_LENSES.length} lenses, ${totalFindings} findings (${lowConfidence} low-confidence)`)

const researchContext = JSON.stringify(research, null, 2)
const briefContext = JSON.stringify(brief, null, 2)

// --- Phase 3: Propose (parallel fan-out, one agent per panel seat) ---
phase('Propose')
const initialResults = await parallel(PANEL.map(p => () =>
  agent(
    `You are proposing (not debating yet). Put forward your position on what should be built here, from your lens only.\n\n` +
    `Requirement brief:\n${briefContext}\n\nResearch findings:\n${researchContext}`,
    { agentType: p.agentType, label: `propose:${p.key}`, phase: 'Propose', schema: PROPOSAL_SCHEMA }
  )
))

// current[key] tracks each seat's latest position across rounds. Keyed by the PANEL seat key
// (not the agent-echoed `lens` string, which is freeform); paired positionally since
// parallel() preserves input order.
const current = {}
PANEL.forEach((p, i) => {
  const r = initialResults[i]
  if (r) {
    current[p.key] = {
      position: r.position,
      keyDecisions: r.keyDecisions || [],
      mustBeTrue: r.mustBeTrue || [],
      risks: r.risks || [],
      openQuestions: r.openQuestions || [],
    }
  }
})
const initialProposals = PANEL.map((p, i) => initialResults[i] ? { key: p.key, ...initialResults[i] } : null).filter(Boolean)
log(`${initialProposals.length}/${PANEL.length} seats proposed`)

if (initialProposals.length === 0) {
  throw new Error('No panel seat produced a proposal - cannot continue to debate. Check that the crs-panel-* agents resolve from this workflow directory.')
}

// --- Debate machinery, reused by the debate rounds and the outside-voice answer rounds ---
const debateTranscript = []
let pendingChallenges = {} // seat key -> [{ fromLens, challenge }]

async function runDebateRound(roundLabel, extraInstruction) {
  const activeSeats = PANEL.filter(p => current[p.key])
  const snapshot = activeSeats.map(p => ({ lens: p.key, ...current[p.key] }))

  const raw = await parallel(activeSeats.map(p => () => {
    const challengesForMe = pendingChallenges[p.key] || []
    return agent(
      `Debate round "${roundLabel}". Here are all current positions, including your own (you are the "${p.key}" seat):\n\n${JSON.stringify(snapshot, null, 2)}\n\n` +
      `Challenges other seats raised against you in the previous round (empty if none yet):\n${JSON.stringify(challengesForMe, null, 2)}\n\n` +
      (extraInstruction ? `${extraInstruction}\n\n` : '') +
      `Respond to the challenges against you (concede and revise where they are right, defend with reasoning where they are not), then raise your own concrete challenges against other seats where you genuinely disagree, and list anything still unresolved.\n\n` +
      `Requirement brief:\n${briefContext}\n\nResearch findings:\n${researchContext}`,
      { agentType: p.agentType, label: `debate:${p.key}:${roundLabel}`, phase: 'Debate', schema: DEBATE_SCHEMA }
    )
  }))

  // Pair positionally with activeSeats - r.lens is agent-echoed and unreliable as a key.
  const results = activeSeats
    .map((p, i) => raw[i] ? { key: p.key, ...raw[i] } : null)
    .filter(Boolean)

  const nextChallenges = {}
  let totalChallenges = 0
  let totalUnresolved = 0
  let totalConcessions = 0

  for (const r of results) {
    current[r.key] = {
      position: r.revisedPosition || current[r.key].position,
      keyDecisions: (r.keyDecisions && r.keyDecisions.length) ? r.keyDecisions : current[r.key].keyDecisions,
      mustBeTrue: current[r.key].mustBeTrue,
      risks: (r.risks && r.risks.length) ? r.risks : current[r.key].risks,
      openQuestions: current[r.key].openQuestions,
    }
    for (const c of (r.challengesRaised || [])) {
      totalChallenges++
      // Only route a challenge to a seat that actually exists; otherwise it is silently lost.
      const target = PANEL.find(p => p.key === c.targetLens) ? c.targetLens : null
      if (!target) continue
      if (!nextChallenges[target]) nextChallenges[target] = []
      nextChallenges[target].push({ fromLens: r.key, challenge: c.challenge })
    }
    totalUnresolved += (r.unresolvedDisagreements || []).length
    totalConcessions += (r.responsesToChallenges || []).filter(x => x.conceded).length
  }

  pendingChallenges = nextChallenges
  debateTranscript.push({ round: roundLabel, results })
  log(`Debate "${roundLabel}": ${results.length} seats, ${totalChallenges} challenges raised, ${totalConcessions} concessions, ${totalUnresolved} unresolved`)
  return { results, totalChallenges, totalUnresolved }
}

// --- Phase 4: Debate (capped rounds, parallel per seat each round) ---
for (let round = 1; round <= MAX_DEBATE_ROUNDS; round++) {
  phase('Debate')
  const { totalChallenges, totalUnresolved } = await runDebateRound(`r${round}`)
  if (totalChallenges === 0 && totalUnresolved === 0) {
    log('Panel converged with no new challenges - ending debate early')
    break
  }
}

// --- Phase 5: Challenge (two outside voices, capped loop back into Debate) ---
let cut = null
let caseAgainst = null
let outsideRound = 0

while (outsideRound < MAX_OUTSIDE_ROUNDS) {
  outsideRound++
  phase('Challenge')

  const panelPositions = PANEL.filter(p => current[p.key]).map(p => ({ lens: p.key, ...current[p.key] }))
  const panelContext =
    `Requirement brief:\n${briefContext}\n\n` +
    `Research findings:\n${researchContext}\n\n` +
    `The panel's current positions (8 expert seats):\n${JSON.stringify(panelPositions, null, 2)}\n\n` +
    `Full debate transcript:\n${JSON.stringify(debateTranscript, null, 2)}`

  const outside = await parallel([
    () => agent(
      `The panel has converged on the positions below. Cut it down to what is actually needed.\n\n${panelContext}`,
      { agentType: 'crs-reductionist', label: `reduce:r${outsideRound}`, phase: 'Challenge', schema: CUT_SCHEMA }
    ),
    () => agent(
      `The panel has converged on the positions below. Build the strongest honest case for NOT building this at all.\n\n${panelContext}`,
      { agentType: 'crs-devils-advocate', label: `case-against:r${outsideRound}`, phase: 'Challenge', schema: CASE_AGAINST_SCHEMA }
    ),
  ])
  cut = outside[0] || cut
  caseAgainst = outside[1] || caseAgainst

  const overbuilt = cut && cut.verdict === 'overbuilt'
  const contested = caseAgainst && caseAgainst.verdict !== 'worth_building'
  log(
    `Outside voices (round ${outsideRound}): reductionist says ${cut ? cut.verdict : 'no response'} ` +
    `(${cut ? (cut.cutList || []).length : 0} items cut), devil's advocate says ${caseAgainst ? caseAgainst.verdict : 'no response'}`
  )

  if (!overbuilt && !contested) {
    log('Both outside voices accept the panel\'s position - moving to synthesis')
    break
  }
  if (outsideRound >= MAX_OUTSIDE_ROUNDS) {
    log(`Outside-voice round cap (${MAX_OUTSIDE_ROUNDS}) reached with objections still standing - carrying them into the synthesis rather than resolving them`)
    break
  }

  // Send the panel back to answer the outside voices directly.
  phase('Debate')
  await runDebateRound(`outside${outsideRound}`,
    `An outside reviewer who was NOT in this debate has judged the panel's converged position. You must answer them directly in this round.\n\n` +
    `THE REDUCTIONIST'S CUT (verdict: ${cut ? cut.verdict : 'none'}):\n${JSON.stringify(cut, null, 2)}\n\n` +
    `THE CASE AGAINST BUILDING (verdict: ${caseAgainst ? caseAgainst.verdict : 'none'}):\n${JSON.stringify(caseAgainst, null, 2)}\n\n` +
    `Take these seriously - they have no stake in this debate and you do. For each cut that affects your lens, either accept it or name the specific user who abandons the product without that item. Do not defend scope out of ownership.`
  )
}

// --- Phase 6: Synthesize (single agent, sequential) ---
phase('Synthesize')
const finalPositions = PANEL.filter(p => current[p.key]).map(p => ({ lens: p.key, ...current[p.key] }))
const decisions = await agent(
  `Resolve this ten-expert engagement into one coherent set of decisions. Decide - do not average. Record every disagreement the panel did not settle.\n\n` +
  `Requirement brief:\n${briefContext}\n\n` +
  `Research findings:\n${researchContext}\n\n` +
  `Final positions from the 8 panel seats:\n${JSON.stringify(finalPositions, null, 2)}\n\n` +
  `Full debate transcript (challenges, responses, concessions, unresolved disagreements per round):\n${JSON.stringify(debateTranscript, null, 2)}\n\n` +
  `THE REDUCTIONIST'S CUT (outside voice):\n${JSON.stringify(cut, null, 2)}\n\n` +
  `THE CASE AGAINST BUILDING (outside voice):\n${JSON.stringify(caseAgainst, null, 2)}`,
  { agentType: 'crs-synthesizer', schema: DECISIONS_SCHEMA }
)
log(
  `Decisions ready: ${(decisions.recommendedScope || []).length} scope item(s), ` +
  `${(decisions.minimalVersion || []).length} in the first version, ` +
  `${(decisions.explicitlyNotBuilding || []).length} explicitly excluded, ` +
  `${(decisions.unresolvedDebates || []).length} unresolved debate(s), confidence: ${decisions.confidence || 'unstated'}`
)

// --- Phase 7: Author (parallel, one agent per document) ---
phase('Author')
const docContext =
  `Requirement brief:\n${briefContext}\n\n` +
  `Synthesized decisions:\n${JSON.stringify(decisions, null, 2)}\n\n` +
  `Research findings (for evidence grading and sources):\n${researchContext}\n\n` +
  `The reductionist's cut:\n${JSON.stringify(cut, null, 2)}\n\n` +
  `The case against building it:\n${JSON.stringify(caseAgainst, null, 2)}\n\n` +
  `Debate transcript (for the reasoning behind the decisions):\n${JSON.stringify(debateTranscript, null, 2)}`

const authored = await parallel([
  () => agent(
    `Write the client-facing proposal document. Prose only - no code, no schemas, no architecture diagrams.\n\n${docContext}`,
    { agentType: 'crs-proposal-writer', label: 'author:proposal', phase: 'Author' }
  ),
  () => agent(
    `Write the compact PRD seed that will be pasted into /prd-generator. Dense, self-contained, assumptions labeled.\n\n${docContext}`,
    { agentType: 'crs-prd-seed-writer', label: 'author:prd-seed', phase: 'Author' }
  ),
])
const proposal = authored[0]
const prdSeed = authored[1]
log(`Authored: proposal ${proposal ? 'ok' : 'FAILED'}, PRD seed ${prdSeed ? 'ok' : 'FAILED'}`)

return {
  brief,
  research,
  initialProposals,
  debateTranscript,
  finalPositions,
  reductionistCut: cut,
  caseAgainst,
  decisions,
  proposal,
  prdSeed,
}
