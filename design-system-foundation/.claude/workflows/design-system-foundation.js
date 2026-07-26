export const meta = {
  name: 'design-system-foundation',
  description: 'Turn design-blueprint output into a stack-agnostic design system: principles, tokens, component contracts, usage rules, implementation contract',
  phases: [
    { title: 'Frame', detail: 'extract the real UI surface, drivers, and component needs, each traced to a source' },
    { title: 'Foundations', detail: 'parallel: UX principles and the token set (opus: judgment)' },
    { title: 'Catalog', detail: 'one agent per component group: full implementation-independent contracts' },
    { title: 'Rules', detail: 'the when-to-use-what decision rules, state policy, and content voice (opus: judgment)' },
    { title: 'Author', detail: 'parallel: write the five documents' },
    { title: 'Critique', detail: 'parallel adversarial review of the whole set: justification, accessibility, consistency, implementability (opus: judgment)' },
    { title: 'Revise', detail: 're-author only the documents that were flagged, then re-review, capped' },
  ],
}

const FRAME_SCHEMA = {
  type: 'object',
  properties: {
    productSummary: { type: 'string' },
    platform: { type: 'string' },
    platformConventions: { type: 'array', items: { type: 'string' } },
    uxDrivers: {
      type: 'array',
      items: {
        type: 'object',
        properties: { driver: { type: 'string' }, source: { type: 'string' } },
        required: ['driver'],
      },
    },
    surfaceInventory: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          surface: { type: 'string' },
          purpose: { type: 'string' },
          primaryAction: { type: 'string' },
          elements: { type: 'array', items: { type: 'string' } },
          states: { type: 'array', items: { type: 'string' } },
          source: { type: 'string' },
        },
        required: ['surface', 'purpose'],
      },
    },
    componentGroups: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          group: { type: 'string' },
          rationale: { type: 'string' },
          components: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                purpose: { type: 'string' },
                seenOn: { type: 'array', items: { type: 'string' } },
                variantsObserved: { type: 'array', items: { type: 'string' } },
              },
              required: ['name', 'seenOn'],
            },
          },
        },
        required: ['group', 'components'],
      },
    },
    interactionPatternsNeeded: {
      type: 'array',
      items: {
        type: 'object',
        properties: { pattern: { type: 'string' }, seenOn: { type: 'array', items: { type: 'string' } } },
        required: ['pattern'],
      },
    },
    brandConstraints: { type: 'array', items: { type: 'string' } },
    assumptions: { type: 'array', items: { type: 'string' } },
    openQuestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: { question: { type: 'string' }, blocking: { type: 'boolean' } },
        required: ['question'],
      },
    },
  },
  required: ['productSummary', 'platform', 'surfaceInventory', 'componentGroups'],
}

const PRINCIPLES_SCHEMA = {
  type: 'object',
  properties: {
    principles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          principle: { type: 'string' },
          whyForThisProduct: { type: 'string' },
          source: { type: 'string' },
          meansWeDo: { type: 'array', items: { type: 'string' } },
          meansWeDoNot: { type: 'array', items: { type: 'string' } },
          tradeoffAccepted: { type: 'string' },
        },
        required: ['principle', 'whyForThisProduct', 'meansWeDo', 'meansWeDoNot', 'tradeoffAccepted'],
      },
    },
    conflictsAndPrecedence: {
      type: 'array',
      items: {
        type: 'object',
        properties: { tension: { type: 'string' }, winner: { type: 'string' }, reason: { type: 'string' } },
        required: ['tension', 'winner'],
      },
    },
    nonPrinciples: {
      type: 'array',
      items: {
        type: 'object',
        properties: { virtue: { type: 'string' }, whyNotAPrinciple: { type: 'string' } },
        required: ['virtue', 'whyNotAPrinciple'],
      },
    },
  },
  required: ['principles'],
}

const TOKENS_SCHEMA = {
  type: 'object',
  properties: {
    rationale: { type: 'string' },
    namingConvention: { type: 'string' },
    scales: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          scale: { type: 'string' },
          basis: { type: 'string' },
          tokens: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                value: { type: 'string' },
                tier: { type: 'string', enum: ['primitive', 'semantic'] },
                role: { type: 'string' },
                useFor: { type: 'string' },
                doNotUseFor: { type: 'string' },
              },
              required: ['name', 'value', 'tier'],
            },
          },
        },
        required: ['scale', 'tokens'],
      },
    },
    colorRoles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          value: { type: 'string' },
          tier: { type: 'string', enum: ['primitive', 'semantic'] },
          onColorToken: { type: 'string' },
          useFor: { type: 'string' },
          doNotUseFor: { type: 'string' },
        },
        required: ['name', 'value', 'tier'],
      },
    },
    contrastPairs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          foreground: { type: 'string' },
          background: { type: 'string' },
          theme: { type: 'string' },
          ratio: { type: 'number' },
          meets: { type: 'string' },
          usage: { type: 'string' },
        },
        required: ['foreground', 'background', 'ratio', 'meets'],
      },
    },
    themes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          theme: { type: 'string' },
          overrides: {
            type: 'array',
            items: {
              type: 'object',
              properties: { role: { type: 'string' }, value: { type: 'string' } },
              required: ['role', 'value'],
            },
          },
        },
        required: ['theme', 'overrides'],
      },
    },
    platformMapping: {
      type: 'array',
      items: {
        type: 'object',
        properties: { target: { type: 'string' }, mapping: { type: 'string' } },
        required: ['target', 'mapping'],
      },
    },
    adjustmentsMade: { type: 'array', items: { type: 'string' } },
    tokensDeliberatelyExcluded: {
      type: 'array',
      items: {
        type: 'object',
        properties: { token: { type: 'string' }, reason: { type: 'string' } },
        required: ['token', 'reason'],
      },
    },
    usageNotes: { type: 'array', items: { type: 'string' } },
  },
  required: ['rationale', 'namingConvention', 'scales', 'colorRoles', 'contrastPairs'],
}

const COMPONENTS_SCHEMA = {
  type: 'object',
  properties: {
    group: { type: 'string' },
    components: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          purpose: { type: 'string' },
          whenToUse: { type: 'string' },
          whenNotToUse: { type: 'string' },
          alternative: { type: 'string' },
          anatomy: { type: 'array', items: { type: 'string' } },
          variants: {
            type: 'array',
            items: {
              type: 'object',
              properties: { name: { type: 'string' }, useWhen: { type: 'string' } },
              required: ['name', 'useWhen'],
            },
          },
          properties: {
            type: 'array',
            items: {
              type: 'object',
              properties: { property: { type: 'string' }, values: { type: 'string' }, useWhen: { type: 'string' } },
              required: ['property', 'values'],
            },
          },
          states: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                state: { type: 'string' },
                applies: { type: 'boolean' },
                behavior: { type: 'string' },
                tokensUsed: { type: 'array', items: { type: 'string' } },
              },
              required: ['state', 'applies', 'behavior'],
            },
          },
          accessibility: {
            type: 'object',
            properties: {
              role: { type: 'string' },
              keyboard: { type: 'array', items: { type: 'string' } },
              focusBehavior: { type: 'string' },
              labeling: { type: 'string' },
              announces: { type: 'string' },
              minTargetSize: { type: 'string' },
              ariaPattern: { type: 'string' },
            },
            required: ['role', 'keyboard', 'focusBehavior', 'labeling'],
          },
          content: {
            type: 'object',
            properties: {
              labelStyle: { type: 'string' },
              maxLengthPolicy: { type: 'string' },
              examples: { type: 'array', items: { type: 'string' } },
              counterExample: { type: 'string' },
            },
            required: ['labelStyle'],
          },
          responsive: { type: 'string' },
          tokensUsed: { type: 'array', items: { type: 'string' } },
          tracedTo: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'purpose', 'whenToUse', 'whenNotToUse', 'states', 'accessibility', 'tokensUsed', 'tracedTo'],
      },
    },
    componentsRejected: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, reason: { type: 'string' } },
        required: ['name', 'reason'],
      },
    },
    tokenGapsFound: { type: 'array', items: { type: 'string' } },
    neighbouringGapsNoticed: { type: 'array', items: { type: 'string' } },
  },
  required: ['group', 'components'],
}

const RULES_SCHEMA = {
  type: 'object',
  properties: {
    decisionRules: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          decision: { type: 'string' },
          options: {
            type: 'array',
            items: {
              type: 'object',
              properties: { option: { type: 'string' }, useWhen: { type: 'string' } },
              required: ['option', 'useWhen'],
            },
          },
          defaultChoice: { type: 'string' },
          never: { type: 'array', items: { type: 'string' } },
          rationale: { type: 'string' },
          tracedTo: { type: 'array', items: { type: 'string' } },
          appliesToComponents: { type: 'array', items: { type: 'string' } },
        },
        required: ['decision', 'options', 'defaultChoice', 'never'],
      },
    },
    statePolicy: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          situation: { type: 'string' },
          requiredTreatment: { type: 'string' },
          minimumToShip: { type: 'string' },
          owner: { type: 'string' },
        },
        required: ['situation', 'requiredTreatment', 'minimumToShip'],
      },
    },
    layoutRules: {
      type: 'array',
      items: {
        type: 'object',
        properties: { rule: { type: 'string' }, rationale: { type: 'string' } },
        required: ['rule'],
      },
    },
    contentVoice: {
      type: 'array',
      items: {
        type: 'object',
        properties: { rule: { type: 'string' }, example: { type: 'string' }, counterExample: { type: 'string' } },
        required: ['rule', 'example'],
      },
    },
    escalationPath: { type: 'string' },
    rulesDeliberatelyOmitted: {
      type: 'array',
      items: {
        type: 'object',
        properties: { situation: { type: 'string' }, reason: { type: 'string' } },
        required: ['situation', 'reason'],
      },
    },
  },
  required: ['decisionRules', 'statePolicy', 'escalationPath'],
}

const CRITIQUE_SCHEMA = {
  type: 'object',
  properties: {
    lens: { type: 'string' },
    verdict: { type: 'string', enum: ['ready', 'needs_revision'] },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          document: {
            type: 'string',
            enum: ['ux-principles', 'design-tokens', 'components', 'usage-rules', 'implementation-contract', 'all'],
          },
          issue: { type: 'string' },
          severity: { type: 'string', enum: ['blocking', 'minor'] },
        },
        required: ['document', 'issue'],
      },
    },
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

const design = typeof input === 'string' ? input : input && input.design
if (!design) {
  throw new Error(
    'Missing the design input. Call this workflow with args set to either a plain string (a path to ' +
    'the design-blueprint output, or the product description itself) or an object shaped ' +
    '{ "design": "...", "platform": "...", "brand": "...", "date": "YYYY-MM-DD" }.'
  )
}
const platform = (input && typeof input === 'object' && input.platform) || 'not stated - infer it and record the inference as an assumption'
const brand = (input && typeof input === 'object' && input.brand) || 'none stated'
const date = (input && typeof input === 'object' && input.date) || 'unknown - fill in before this leaves Draft'

const DOC_TYPES = [
  { key: 'ux-principles', title: 'UX principles' },
  { key: 'design-tokens', title: 'Design tokens' },
  { key: 'components', title: 'Component contracts' },
  { key: 'usage-rules', title: 'Usage rules - when to use what' },
  { key: 'implementation-contract', title: 'Implementation contract' },
]

// --- Phase 1: Frame (single agent, sequential - everything downstream is derived from it) ---
phase('Frame')
const frame = await agent(
  `Extract the real UI surface of this product. The design input is below - it may be a directory or file path ` +
  `(typically design-blueprint output: screens-and-ui.md, user-flows.md, design-decisions.md). If it is a path, read those files.\n\n` +
  `<design_input>\n${design}\n</design_input>\n\n` +
  `Platform target: ${platform}\n` +
  `Brand constraints: ${brand}\n\n` +
  `Inventory only what the source actually describes, trace every item back to where it came from, and cluster the component needs into at most 4 groups. Design nothing.`,
  { agentType: 'ds-framer', schema: FRAME_SCHEMA }
)

const groups = (frame.componentGroups || []).filter(g => (g.components || []).length > 0).slice(0, 4)
if (frame.surfaceInventory.length === 0 || groups.length === 0) {
  throw new Error(
    'The framer found no surfaces or no component needs in the design input - there is no product surface to build a system from. ' +
    'Point this workflow at design-blueprint output or a description that names actual screens.'
  )
}
log(`Framed ${frame.surfaceInventory.length} surface(s) on ${frame.platform}, ${groups.length} component group(s): ${groups.map(g => `${g.group} (${g.components.length})`).join(', ')}`)

const frameContext =
  `Product: ${frame.productSummary}\n` +
  `Platform: ${frame.platform}\n` +
  `Platform conventions: ${(frame.platformConventions || []).join('; ') || 'none recorded'}\n` +
  `Brand constraints: ${(frame.brandConstraints || []).join('; ') || 'none stated'}\n\n` +
  `UX drivers:\n${JSON.stringify(frame.uxDrivers || [], null, 2)}\n\n` +
  `Surface inventory:\n${JSON.stringify(frame.surfaceInventory, null, 2)}\n\n` +
  `Interaction patterns needed:\n${JSON.stringify(frame.interactionPatternsNeeded || [], null, 2)}`

// --- Phase 2: Foundations (parallel - principles and tokens are independent derivations of the frame) ---
// A barrier here is genuine: every component contract needs BOTH the principles it applies
// and the token roles it consumes, so the catalog cannot start until both have landed.
phase('Foundations')
const [principles, tokens] = await parallel([
  () => agent(
    `Derive the UX design principles for this product. Three to five, each contestable, each with a stated trade-off.\n\n${frameContext}`,
    { agentType: 'ds-principles-author', label: 'foundations:principles', phase: 'Foundations', schema: PRINCIPLES_SCHEMA, model: 'opus' }
  ),
  () => agent(
    `Define the design tokens for this product. Only the scales these surfaces actually need. Compute every contrast ratio - do not estimate one.\n\n${frameContext}`,
    { agentType: 'ds-token-author', label: 'foundations:tokens', phase: 'Foundations', schema: TOKENS_SCHEMA, model: 'opus' }
  ),
])

if (!principles || !tokens) {
  throw new Error(
    `Foundations failed (${principles ? '' : 'principles '}${tokens ? '' : 'tokens'} missing) - the component contracts cannot be written without both.`
  )
}
const failingPairs = (tokens.contrastPairs || []).filter(p => /fail/i.test(p.meets || ''))
log(`Foundations ready: ${principles.principles.length} principle(s), ${(tokens.colorRoles || []).length} color role(s), ${(tokens.contrastPairs || []).length} contrast pair(s)${failingPairs.length ? ` - WARNING: ${failingPairs.length} pair(s) reported as failing` : ''}`)

const foundationsContext =
  `Design principles (apply these, do not restate them):\n${JSON.stringify(principles, null, 2)}\n\n` +
  `Token set - reference SEMANTIC ROLE NAMES from here only, never a raw value:\n${JSON.stringify(tokens, null, 2)}`

// --- Phase 3: Catalog (parallel fan-out, one agent per component group) ---
phase('Catalog')
const catalogResults = await parallel(groups.map(g => () =>
  agent(
    `Write the full implementation-independent contracts for exactly one component group: "${g.group}".\n\n` +
    `Why this group exists: ${g.rationale || 'not stated'}\n\n` +
    `The components in your group, with the surfaces each was seen on:\n${JSON.stringify(g.components, null, 2)}\n\n` +
    `${frameContext}\n\n${foundationsContext}\n\n` +
    `Every component needs a non-empty tracedTo. Any component whose tracedTo would be empty goes in componentsRejected instead. Cover every state - do not omit focus-visible or loading. Write no code and name no framework.`,
    { agentType: 'ds-component-author', label: `catalog:${g.group}`, phase: 'Catalog', schema: COMPONENTS_SCHEMA }
  )
))
const catalog = groups
  .map((g, i) => catalogResults[i] ? { ...catalogResults[i], group: g.group } : null)
  .filter(Boolean)

if (catalog.length === 0) {
  throw new Error('Every component group failed - there is no catalog to write rules against.')
}
if (catalog.length < groups.length) {
  log(`Warning: ${groups.length - catalog.length} of ${groups.length} component group(s) failed and are missing from the catalog`)
}
const componentCount = catalog.reduce((n, c) => n + (c.components || []).length, 0)
const rejectedCount = catalog.reduce((n, c) => n + (c.componentsRejected || []).length, 0)
const tokenGaps = catalog.flatMap(c => c.tokenGapsFound || [])
log(`Catalog: ${componentCount} component(s) contracted, ${rejectedCount} rejected as unjustified${tokenGaps.length ? `, ${tokenGaps.length} token gap(s) reported` : ''}`)

// --- Phase 4: Rules (single agent, sequential - it must see the WHOLE catalog to choose between components) ---
phase('Rules')
const rules = await agent(
  `Write the usage rules for this design system: the recurring decisions a developer would otherwise re-make differently every feature. ` +
  `Draw the situations from the interaction patterns and surfaces below, not from a generic list. Every rule needs a default and an explicit never.\n\n` +
  `${frameContext}\n\n` +
  `Design principles:\n${JSON.stringify(principles, null, 2)}\n\n` +
  `The full component catalog you are choosing between (reference these exact names):\n${JSON.stringify(catalog, null, 2)}\n\n` +
  `Token roles available:\n${JSON.stringify((tokens.colorRoles || []).map(r => r.name).concat((tokens.scales || []).flatMap(s => (s.tokens || []).map(t => t.name))), null, 2)}`,
  { agentType: 'ds-rules-author', schema: RULES_SCHEMA, model: 'opus' }
)
log(`Rules: ${rules.decisionRules.length} decision rule(s), ${rules.statePolicy.length} state policy entr(ies)`)

// --- Phase 5: Author (parallel, one agent per document) ---
const systemContext =
  `Framing:\n${JSON.stringify(frame, null, 2)}\n\n` +
  `Principles:\n${JSON.stringify(principles, null, 2)}\n\n` +
  `Tokens:\n${JSON.stringify(tokens, null, 2)}\n\n` +
  `Component catalog:\n${JSON.stringify(catalog, null, 2)}\n\n` +
  `Usage rules:\n${JSON.stringify(rules, null, 2)}\n\n` +
  `Token gaps reported by the component authors:\n${JSON.stringify(tokenGaps, null, 2)}\n\n` +
  `Date to use for "Last updated": ${date}`

const authorDoc = (doc, revisionIssues) => agent(
  `Write the "${doc.key}" document ("${doc.title}") of this design system set, following your instructions for that specific document and the house style.\n\n` +
  `${systemContext}` +
  (revisionIssues
    ? `\n\nThis is a revision. Your previous version of this document is below, followed by the critique issues routed to it. ` +
      `Fix every issue. Keep everything that was not flagged - do not rewrite from scratch.\n\n` +
      `<previous_version>\n${revisionIssues.previous}\n</previous_version>\n\n` +
      `<issues_for_this_document>\n${JSON.stringify(revisionIssues.issues, null, 2)}\n</issues_for_this_document>`
    : ''),
  {
    agentType: 'ds-doc-author',
    label: revisionIssues ? `revise:${doc.key}` : `author:${doc.key}`,
    phase: revisionIssues ? 'Revise' : 'Author',
  }
)

phase('Author')
const authored = await parallel(DOC_TYPES.map(d => () => authorDoc(d)))
const documents = {}
DOC_TYPES.forEach((d, i) => { if (authored[i]) documents[d.key] = authored[i] })

const authoredKeys = Object.keys(documents)
if (authoredKeys.length === 0) {
  throw new Error('Every document failed to author - nothing to review or return.')
}
if (authoredKeys.length < DOC_TYPES.length) {
  log(`Warning: ${DOC_TYPES.length - authoredKeys.length} document(s) failed to author and are missing from the set`)
}

// --- Phase 6/7: Critique -> Revise loop (parallel lenses over the WHOLE set, capped rounds) ---
// The critics need every document at once: an orphan token, a rule naming a component that
// does not exist, and an oversized catalog are all cross-document properties. So the barrier
// before critique is genuine. Revision then routes each issue back to the ONE document that
// owns the fix and re-authors only those, instead of rewriting the whole set every round.
const CRITIQUE_LENSES = ['justification', 'accessibility', 'consistency', 'implementability']
const MAX_ROUNDS = 2
let round = 0
let allCritiques = []

const renderSet = () => DOC_TYPES
  .filter(d => documents[d.key])
  .map(d => `<document key="${d.key}">\n${documents[d.key]}\n</document>`)
  .join('\n\n')

while (round < MAX_ROUNDS) {
  phase('Critique')
  const critiques = (await parallel(CRITIQUE_LENSES.map(lens => () =>
    agent(
      `<design_system_document_set>\n${renderSet()}\n</design_system_document_set>\n\n` +
      `Review the whole document set above through the ${lens} lens only, against that lens's checklist. Be adversarial. ` +
      `List every checklist item that fails, including the small ones, and route each issue to the one document that owns the fix. ` +
      `The verdict rule, not your sense of importance, decides what happens next.`,
      { agentType: 'ds-critic', label: `critique:${lens}`, phase: 'Critique', schema: CRITIQUE_SCHEMA, model: 'opus' }
    )
  ))).filter(Boolean)
  allCritiques = critiques

  const needsWork = critiques.filter(c => c.verdict === 'needs_revision')
  if (needsWork.length === 0) {
    log('All four lenses signed off - the design system set is ready')
    break
  }

  round++
  if (round >= MAX_ROUNDS) {
    const open = needsWork.reduce((n, c) => n + (c.issues || []).length, 0)
    log(`Round cap (${MAX_ROUNDS}) reached with ${needsWork.length}/${critiques.length} lens(es) still flagging ${open} issue(s) - returning the best set`)
    break
  }

  // Route every issue to the document that owns it; `all` fans out to every document.
  const issuesByDoc = {}
  for (const c of needsWork) {
    for (const issue of (c.issues || [])) {
      const targets = issue.document === 'all' ? authoredKeys : [issue.document]
      for (const key of targets) {
        if (!documents[key]) continue
        if (!issuesByDoc[key]) issuesByDoc[key] = []
        issuesByDoc[key].push({ lens: c.lens, severity: issue.severity || 'unstated', issue: issue.issue })
      }
    }
  }

  const toRevise = DOC_TYPES.filter(d => issuesByDoc[d.key])
  if (toRevise.length === 0) {
    log('Lenses flagged needs_revision but routed no issue to any document - nothing actionable, stopping')
    break
  }

  phase('Revise')
  log(`Revising ${toRevise.length}/${authoredKeys.length} document(s) (round ${round}): ${toRevise.map(d => `${d.key} (${issuesByDoc[d.key].length})`).join(', ')}`)
  const revised = await parallel(toRevise.map(d => () =>
    authorDoc(d, { previous: documents[d.key], issues: issuesByDoc[d.key] })
  ))
  toRevise.forEach((d, i) => { if (revised[i]) documents[d.key] = revised[i] })
}

return {
  frame,
  principles,
  tokens,
  catalog,
  rules,
  critiques: allCritiques,
  documents: DOC_TYPES
    .filter(d => documents[d.key])
    .map(d => ({ key: d.key, title: d.title, markdown: documents[d.key] })),
}
