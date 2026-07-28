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

// Structured-output mechanics. Appended to every schema-validated prompt: agents have
// been observed malforming the StructuredOutput call (XML-tagged prose packed into one
// field, arrays serialized as strings) and then, after repeated rejections, submitting
// placeholder content just to get the call accepted. A stub that validates poisons every
// downstream agent silently, so the instruction is explicit and the rule is "fail, never stub".
const OUTPUT_MECHANICS = (fields) =>
  `\n\nOUTPUT MECHANICS - read before calling StructuredOutput. Pass each schema field as a ` +
  `separate top-level JSON property of the tool input: ${fields}. Do NOT wrap any value in ` +
  `XML/HTML tags, do NOT serialize arrays or objects as strings, and do NOT pack several ` +
  `fields into one. If a call is rejected for a missing or malformed property, add that ` +
  `property as real structured data - never substitute placeholder or stub content ` +
  `("test", "n/a", "TBD", "example") to get the call accepted. Returning a stub is a worse ` +
  `failure than returning nothing: every agent after you would treat it as real.`

// A framing that validated but says nothing is the one failure mode that wastes the whole
// run, so it is checked explicitly rather than trusted.
const looksLikeStub = (s) =>
  !s || /^(test|n\/?a|tbd|todo|example|placeholder|foo|bar|lorem)\b/i.test(String(s).trim())

const CRITIQUE_SCHEMA = {
  type: 'object',
  properties: {
    lens: { type: 'string' },
    verdict: { type: 'string', enum: ['ready', 'needs_revision'] },
    issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['lens', 'verdict', 'issues'],
}

// The stack-author agent always writes the document to disk itself and reports back only
// this - never the document text - so it is never re-embedded into downstream prompts.
// Critics and revise passes are given the path and read it themselves. prdLinked is only
// meaningful on the first-pass Author call, and only when a real PRD path was available.
const DRAFT_STATUS_SCHEMA = {
  type: 'object',
  properties: {
    path: { type: 'string' },
    charCount: { type: 'number' },
    version: { type: 'string' },
    prdLinked: { type: 'boolean' },
  },
  required: ['path', 'charCount', 'version'],
}

function slugify(text) {
  const slug = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
  return slug || 'untitled'
}

// If `prd` looks like a real path to a PRD file (no spaces, ends in .md), write the stack
// document as a sibling of it and link back from its Links row - the hub-and-spoke pattern
// shared with architecture-designer.js. If `prd` is an inline product description instead
// (has spaces, is not a .md path), there is no PRD file to sit next to or link from, so fall
// back to a standalone path under docs/architecture/.
function stackPathFor(prdPath, productSummary) {
  if (prdPath) {
    const lastSlash = prdPath.lastIndexOf('/')
    const dir = lastSlash === -1 ? '' : prdPath.slice(0, lastSlash + 1)
    const base = lastSlash === -1 ? prdPath : prdPath.slice(lastSlash + 1)
    const stem = base.replace(/\.md$/i, '').replace(/-?prd$/i, '')
    return `${dir}${stem ? stem + '-' : ''}tech-stack.md`
  }
  return `docs/architecture/${slugify(productSummary)}-tech-stack.md`
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
const trimmedPrd = prd.trim()
const prdPath = /\.md$/i.test(trimmedPrd) && !/\s/.test(trimmedPrd) ? trimmedPrd : null

// --- Phase 1: Frame (single agent, sequential - everything downstream depends on it) ---
phase('Frame')
const framing = await agent(
  `Frame the tech-stack decision for this product. The PRD is below (it may be a file path - if so, read that file).\n\n` +
  `<prd>\n${prd}\n</prd>\n\n` +
  `Stated constraints: ${constraints}\n\n` +
  `Derive the decision areas that are genuinely open for THIS product (maximum 5), the weighted criteria for each one traced back to a driver in the PRD, and the hard constraints that disqualify candidates outright. Name no technologies.` +
  OUTPUT_MECHANICS('productSummary (a plain string, no markup), drivers, decisionAreas, hardConstraints, areasDeliberatelyExcluded, openQuestions'),
  // Opus, not sonnet: this is the load-bearing step - every downstream agent inherits it.
  { agentType: 'stack-framer', schema: FRAMING_SCHEMA, model: 'opus' }
)

const areas = (framing.decisionAreas || []).slice(0, 5)
if (areas.length === 0) {
  throw new Error('The framer returned no decision areas - nothing to research or score.')
}
// Fail loudly on a degraded framing rather than burning the whole fan-out on a stub.
if ((framing.productSummary || '').trim().length < 60 || looksLikeStub(framing.productSummary)) {
  throw new Error(
    `The framer returned a placeholder-looking product summary (${JSON.stringify(framing.productSummary)}) ` +
    `- refusing to research and score a stub. Re-run; if it repeats, the PRD may not have been readable.`
  )
}
const stubAreas = areas.filter(a => (a.area || '').trim().length < 4 || looksLikeStub(a.area))
if (stubAreas.length > 0) {
  throw new Error(
    `The framer returned placeholder-looking decision areas (${JSON.stringify(stubAreas.map(a => a.area))}) ` +
    `- refusing to research and score a stub.`
  )
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
    `Include the boring/default option for this area on equal footing. Source every factual claim. Score nothing and recommend nothing.` +
    OUTPUT_MECHANICS('area, candidates, unknowns, sourcesConsulted'),
    { agentType: 'stack-researcher', label: `research:${area.area}`, phase: 'Research', schema: EVIDENCE_SCHEMA }
  ).then(evidence => {
    if (!evidence || !(evidence.candidates || []).length) {
      throw new Error(`Research for "${area.area}" returned no candidates - dropping this area rather than scoring an empty matrix.`)
    }
    return evidence
  }),
  (evidence, area) => agent(
    `Score this decision area's candidates against its weighted criteria. Apply the hard constraints first, then score every cell before you look at the totals.\n\n` +
    `Product: ${framing.productSummary}\n\n` +
    `Decision area: ${area.area}\n\n` +
    `Criteria and weights:\n${criteriaText(area)}\n\n` +
    `Hard constraints:\n${(framing.hardConstraints || []).map(c => `- ${c}`).join('\n') || '- none stated'}\n\n` +
    `Evidence gathered by the researcher (this is all you get - do not add facts):\n${JSON.stringify(evidence, null, 2)}` +
    OUTPUT_MECHANICS('area, matrix, disqualified, winner, runnerUp, margin, whatTheWinnerGivesUp, conditionsThatWouldFlipThis, reversibility, confidence, framingConcerns'),
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

// --- Phase 4: Author (single agent - one voice owns the document) - writes to disk,
// links back from the PRD when one exists, returns status only ---
phase('Author')
const stackPath = stackPathFor(prdPath, framing.productSummary)
let draftStatus = await agent(
  `Write the tech-stack decision document to file ${stackPath} from the framing and the scored decision areas below, following the house structure exactly. Date to use for "Last updated": ${date}. Version: v0.1.\n\n` +
  `Framing:\n${JSON.stringify(framing, null, 2)}\n\n` +
  `Scored decision areas (evidence plus scoring, one per area):\n${JSON.stringify(scored, null, 2)}` +
  (prdPath
    ? `\n\nThen link back from the source PRD: read ${prdPath}, find its header "Links" row, and add a reference to ${stackPath} there - if a "Tech design" entry already exists (e.g. an architecture document already linked it), append " · [Tech Stack](path)" to that same cell; otherwise replace the bare "Tech design" placeholder with "Tech design: [Tech Stack](path)". This must be a minimal, targeted edit - do not touch anything else in the PRD. Set prdLinked to whether this succeeded.`
    : ''),
  { agentType: 'stack-author', schema: DRAFT_STATUS_SCHEMA }
)
const prdLinked = draftStatus.prdLinked === true
log(`Stack document written to ${draftStatus.path} (${draftStatus.charCount} chars, ${draftStatus.version})` + (prdPath ? ` - PRD linked: ${prdLinked}` : ' - no PRD path given, standalone document'))

// --- Phase 5/6: Critique -> Revise loop (parallel lenses read from disk, capped rounds) ---
// The critique needs the whole stack at once (coherence is a cross-area property),
// so this is the one place a barrier is genuinely justified.
const CRITIQUE_LENSES = ['integration-coherence', 'evidence-quality', 'boring-alternative']
const MAX_ROUNDS = 2
let round = 0
let lastNeedsWork = []

while (round < MAX_ROUNDS) {
  phase('Critique')
  const critiques = (await parallel(CRITIQUE_LENSES.map(lens => () =>
    agent(
      `Read the tech-stack decision document draft at ${draftStatus.path} and review it through the ${lens} lens only, against that lens's checklist. Be adversarial. List every checklist item that fails, including the small ones. The verdict rule, not your sense of importance, decides what happens next.` +
      OUTPUT_MECHANICS('lens, verdict, issues'),
      { agentType: 'stack-critic', label: `critique:${lens}`, phase: 'Critique', schema: CRITIQUE_SCHEMA, model: 'opus' }
    )
  ))).filter(Boolean)

  const needsWork = critiques.filter(c => c.verdict === 'needs_revision')
  lastNeedsWork = needsWork
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
  draftStatus = await agent(
    `Read the current tech-stack decision document at ${draftStatus.path} and revise it to address the following critique. Keep everything that already works and was not flagged. Append a Section 9 decision-log entry for every material change. Bump the version and overwrite the file at the same path. Do not touch the PRD again - it was already linked on the first pass.\n\n` +
    `Critique:\n${JSON.stringify(needsWork, null, 2)}`,
    { agentType: 'stack-author', phase: 'Revise', schema: DRAFT_STATUS_SCHEMA }
  )
}

// Cap openIssues rather than concatenating every lens's every issue across every round -
// see prd-generator-v2's Changelog for why (a real run's uncapped equivalent hit 32.7KB
// and got truncated on read).
const MAX_OPEN_ISSUES = 15
const allOpenIssues = lastNeedsWork.flatMap(c => c.issues.map(issue => `[${c.lens}] ${issue}`))
const openIssues = allOpenIssues.slice(0, MAX_OPEN_ISSUES)
if (allOpenIssues.length > MAX_OPEN_ISSUES) {
  log(`${allOpenIssues.length} open issues found across all lenses - returning the first ${MAX_OPEN_ISSUES}; see ${draftStatus.path}'s critique history for the rest`)
}

// Return a summary-shaped result, not the full framing/critique/document blob: the document
// already lives on disk at draftStatus.path, and the PRD (when one exists) already links to it.
return {
  productSummary: framing.productSummary,
  decisions: scored.map(s => ({
    area: s.area.area,
    winner: s.scoring.winner,
    runnerUp: s.scoring.runnerUp,
    reversibility: s.scoring.reversibility,
    confidence: s.scoring.confidence,
  })),
  roundsRun: round,
  openIssues,
  openIssuesTotal: allOpenIssues.length,
  stackPath: draftStatus.path,
  stackVersion: draftStatus.version,
  prdPath,
  prdLinked,
}
