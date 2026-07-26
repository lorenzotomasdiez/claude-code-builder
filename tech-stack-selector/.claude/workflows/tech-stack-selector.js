export const meta = {
  name: 'tech-stack-selector',
  description: 'Turn a PRD into a researched, weighted tech-stack decision matrix via frame -> (research -> score per area) -> author -> critique -> revise',
  phases: [
    { title: 'Frame', detail: 'derive the decision areas, weighted criteria, and hard constraints from the PRD' },
    { title: 'Research', detail: 'one agent per decision area: sourced candidate evidence, versions, cost, failure modes' },
    { title: 'Score', detail: 'one agent per decision area: weighted matrix, winner, what it gives up (opus: judgment)' },
    { title: 'Author', detail: 'write the decision document' },
    { title: 'Critique', detail: 'parallel adversarial review: integration-coherence, evidence-quality, boring-alternative (opus: judgment)' },
    { title: 'Revise', detail: 'incorporate critique, re-review, repeat until clean or capped' },
  ],
}

const FRAMING_SCHEMA = {
  type: 'object',
  properties: {
    productSummary: { type: 'string' },
    drivers: {
      type: 'array',
      items: {
        type: 'object',
        properties: { driver: { type: 'string' }, source: { type: 'string' } },
        required: ['driver'],
      },
    },
    decisionAreas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          area: { type: 'string' },
          whyItMatters: { type: 'string' },
          criteria: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                criterion: { type: 'string' },
                weight: { type: 'number' },
                fromDriver: { type: 'string' },
              },
              required: ['criterion', 'weight'],
            },
          },
        },
        required: ['area', 'criteria'],
      },
    },
    hardConstraints: { type: 'array', items: { type: 'string' } },
    areasDeliberatelyExcluded: {
      type: 'array',
      items: {
        type: 'object',
        properties: { area: { type: 'string' }, reason: { type: 'string' }, assumedDefault: { type: 'string' } },
        required: ['area', 'reason'],
      },
    },
    openQuestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: { question: { type: 'string' }, blocking: { type: 'boolean' } },
        required: ['question'],
      },
    },
  },
  required: ['productSummary', 'decisionAreas', 'hardConstraints'],
}

const EVIDENCE_SCHEMA = {
  type: 'object',
  properties: {
    area: { type: 'string' },
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          currentVersion: { type: 'string' },
          versionAsOf: { type: 'string' },
          license: { type: 'string' },
          maintenanceStatus: { type: 'string' },
          disqualified: { type: 'boolean' },
          disqualifiedBy: { type: ['string', 'null'] },
          evidenceByCriterion: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                criterion: { type: 'string' },
                finding: { type: 'string' },
                source: { type: 'string' },
              },
              required: ['criterion', 'finding'],
            },
          },
          cost: { type: 'string' },
          operationalBurden: { type: 'string' },
          knownFailureModes: { type: 'array', items: { type: 'string' } },
          lockInAndExitCost: { type: 'string' },
        },
        required: ['name', 'evidenceByCriterion'],
      },
    },
    unknowns: { type: 'array', items: { type: 'string' } },
    sourcesConsulted: { type: 'array', items: { type: 'string' } },
  },
  required: ['area', 'candidates'],
}

const SCORING_SCHEMA = {
  type: 'object',
  properties: {
    area: { type: 'string' },
    matrix: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          candidate: { type: 'string' },
          scores: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                criterion: { type: 'string' },
                weight: { type: 'number' },
                score: { type: 'number' },
                justification: { type: 'string' },
                lowEvidence: { type: 'boolean' },
              },
              required: ['criterion', 'score', 'justification'],
            },
          },
          weightedTotal: { type: 'number' },
        },
        required: ['candidate', 'scores', 'weightedTotal'],
      },
    },
    disqualified: {
      type: 'array',
      items: {
        type: 'object',
        properties: { candidate: { type: 'string' }, constraintViolated: { type: 'string' } },
        required: ['candidate'],
      },
    },
    winner: { type: 'string' },
    runnerUp: { type: 'string' },
    margin: { type: 'string' },
    whatTheWinnerGivesUp: { type: 'array', items: { type: 'string' } },
    conditionsThatWouldFlipThis: { type: 'array', items: { type: 'string' } },
    reversibility: { type: 'string', enum: ['low', 'medium', 'high'] },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    framingConcerns: { type: 'array', items: { type: 'string' } },
  },
  required: ['area', 'matrix', 'winner', 'whatTheWinnerGivesUp', 'reversibility', 'confidence'],
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

const prd = typeof input === 'string' ? input : input && input.prd
if (!prd) {
  throw new Error(
    'Missing the PRD. Call this workflow with args set to either a plain string (the PRD text ' +
    'or a path to it) or an object shaped { "prd": "...", "constraints": "...", "date": "YYYY-MM-DD" }.'
  )
}
const constraints = (input && typeof input === 'object' && input.constraints) || 'none stated'
const date = (input && typeof input === 'object' && input.date) || 'unknown - fill in before this leaves Draft'

// --- Phase 1: Frame (single agent, sequential - everything downstream depends on it) ---
phase('Frame')
const framing = await agent(
  `Frame the tech-stack decision for this product. The PRD is below (it may be a file path - if so, read that file).\n\n` +
  `<prd>\n${prd}\n</prd>\n\n` +
  `Stated constraints: ${constraints}\n\n` +
  `Derive the decision areas that are genuinely open for THIS product (maximum 5), the weighted criteria for each one traced back to a driver in the PRD, and the hard constraints that disqualify candidates outright. Name no technologies.`,
  { agentType: 'stack-framer', schema: FRAMING_SCHEMA }
)

const areas = (framing.decisionAreas || []).slice(0, 5)
if (areas.length === 0) {
  throw new Error('The framer returned no decision areas - nothing to research or score.')
}
log(`Framed ${areas.length} decision area(s): ${areas.map(a => a.area).join(', ')}`)

// --- Phase 2/3: Research -> Score, pipelined per area ---
// Pipeline, not a barrier: one area can be scoring while another is still researching.
// Scoring is a separate agent from research on purpose - the agent that finds the
// evidence must not be the agent that grades it.
const criteriaText = a => a.criteria.map(c => `- ${c.criterion} (weight ${c.weight}) - from driver: ${c.fromDriver || 'unstated'}`).join('\n')

const scored = (await pipeline(
  areas,
  area => agent(
    `Research the candidate technologies for exactly one decision area of this product.\n\n` +
    `Product: ${framing.productSummary}\n\n` +
    `Decision area: ${area.area}\nWhy it matters: ${area.whyItMatters || 'not stated'}\n\n` +
    `Criteria you must gather evidence against:\n${criteriaText(area)}\n\n` +
    `Hard constraints (a candidate violating one is disqualified, not omitted):\n${(framing.hardConstraints || []).map(c => `- ${c}`).join('\n') || '- none stated'}\n\n` +
    `Include the boring/default option for this area on equal footing. Source every factual claim. Score nothing and recommend nothing.`,
    { agentType: 'stack-researcher', label: `research:${area.area}`, phase: 'Research', schema: EVIDENCE_SCHEMA }
  ),
  (evidence, area) => agent(
    `Score this decision area's candidates against its weighted criteria. Apply the hard constraints first, then score every cell before you look at the totals.\n\n` +
    `Product: ${framing.productSummary}\n\n` +
    `Decision area: ${area.area}\n\n` +
    `Criteria and weights:\n${criteriaText(area)}\n\n` +
    `Hard constraints:\n${(framing.hardConstraints || []).map(c => `- ${c}`).join('\n') || '- none stated'}\n\n` +
    `Evidence gathered by the researcher (this is all you get - do not add facts):\n${JSON.stringify(evidence, null, 2)}`,
    { agentType: 'stack-scorer', label: `score:${area.area}`, phase: 'Score', schema: SCORING_SCHEMA, model: 'opus' }
  ).then(scoring => ({ area, evidence, scoring }))
)).filter(Boolean)

if (scored.length === 0) {
  throw new Error('Every decision area failed to research or score - nothing to write up.')
}
if (scored.length < areas.length) {
  log(`Warning: ${areas.length - scored.length} of ${areas.length} decision area(s) failed and are missing from the document`)
}
log(`Scored: ${scored.map(s => `${s.area.area} -> ${s.scoring.winner} (${s.scoring.confidence} confidence)`).join('; ')}`)

// --- Phase 4: Author (single agent - one voice owns the document) ---
phase('Author')
let draft = await agent(
  `Write the tech-stack decision document from the framing and the scored decision areas below, following the house structure exactly. Date to use for "Last updated": ${date}.\n\n` +
  `Framing:\n${JSON.stringify(framing, null, 2)}\n\n` +
  `Scored decision areas (evidence plus scoring, one per area):\n${JSON.stringify(scored, null, 2)}`,
  { agentType: 'stack-author' }
)

// --- Phase 5/6: Critique -> Revise loop (parallel lenses, capped rounds) ---
// The critique needs the whole stack at once (coherence is a cross-area property),
// so this is the one place a barrier is genuinely justified.
const CRITIQUE_LENSES = ['integration-coherence', 'evidence-quality', 'boring-alternative']
const MAX_ROUNDS = 2
let round = 0
let allCritiques = []

while (round < MAX_ROUNDS) {
  phase('Critique')
  const critiques = (await parallel(CRITIQUE_LENSES.map(lens => () =>
    agent(
      `<stack_document>\n${draft}\n</stack_document>\n\n` +
      `Review the tech-stack decision document above through the ${lens} lens only, against that lens's checklist. Be adversarial. List every checklist item that fails, including the small ones. The verdict rule, not your sense of importance, decides what happens next.`,
      { agentType: 'stack-critic', label: `critique:${lens}`, phase: 'Critique', schema: CRITIQUE_SCHEMA, model: 'opus' }
    )
  ))).filter(Boolean)
  allCritiques = critiques

  const needsWork = critiques.filter(c => c.verdict === 'needs_revision')
  if (needsWork.length === 0) {
    log('All lenses signed off - stack document is ready')
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
    `Revise this tech-stack decision document to address the following critique. Keep everything that already works and was not flagged. Append a Section 9 decision-log entry for every material change.\n\n` +
    `Current draft:\n${draft}\n\n` +
    `Critique:\n${JSON.stringify(needsWork, null, 2)}`,
    { agentType: 'stack-author', phase: 'Revise' }
  )
}

return {
  framing,
  decisions: scored.map(s => ({
    area: s.area.area,
    winner: s.scoring.winner,
    runnerUp: s.scoring.runnerUp,
    reversibility: s.scoring.reversibility,
    confidence: s.scoring.confidence,
  })),
  critiques: allCritiques,
  stackDocument: draft,
}
