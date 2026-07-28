export const meta = {
  name: 'design-system-foundation-v2',
  description: 'Turn design-blueprint output (plus, when given a PRD, the tech-stack and architecture decisions already made) into a stack-agnostic design system, a component-to-codebase map, and the build spec for a Storybook-like gallery page - written to disk, never returned as text',
  phases: [
    { title: 'Frame', detail: 'extract the real UI surface, drivers, component needs, and any linked tech-stack/architecture decisions' },
    { title: 'Foundations', detail: 'parallel: UX principles and the token set (opus: judgment)' },
    { title: 'Catalog', detail: 'one agent per component group: full implementation-independent contracts' },
    { title: 'Rules', detail: 'the when-to-use-what decision rules, state policy, and content voice (opus: judgment)' },
    { title: 'Mapping', detail: 'place every component: custom, or a UI-library primitive/composition, at a real path' },
    { title: 'Gallery', detail: 'spec the isolation page every component renders on before any feature is built' },
    { title: 'Author', detail: 'parallel: write all seven documents to disk, return status only' },
    { title: 'Critique', detail: 'parallel adversarial review of the whole set: justification, accessibility, consistency, implementability, buildability (opus: judgment)' },
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
    techStackDecisions: {
      type: 'array',
      maxItems: 12,
      items: {
        type: 'object',
        properties: {
          area: { type: 'string', maxLength: 60 },
          choice: { type: 'string', maxLength: 150 },
          reversibility: { type: 'string', maxLength: 20 },
        },
        required: ['area', 'choice'],
      },
    },
    architectureComponents: {
      type: 'array',
      maxItems: 20,
      items: {
        type: 'object',
        properties: {
          component: { type: 'string', maxLength: 80 },
          responsibility: { type: 'string', maxLength: 200 },
        },
        required: ['component'],
      },
    },
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

const COMPONENT_MAP_SCHEMA = {
  type: 'object',
  properties: {
    uiLibrary: { type: 'string' },
    uiLibraryDecisionSource: { type: 'string' },
    entries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          component: { type: 'string' },
          group: { type: 'string' },
          sourcingStrategy: { type: 'string', enum: ['custom', 'library-primitive', 'library-composed'] },
          libraryComponents: { type: 'array', items: { type: 'string' } },
          location: { type: 'string' },
          locationBasis: { type: 'string' },
          visualSpecRef: { type: 'string' },
          tokensConsumed: { type: 'array', items: { type: 'string' } },
          isolationNotes: { type: 'string' },
          tracedTo: { type: 'array', items: { type: 'string' } },
        },
        required: ['component', 'sourcingStrategy', 'location', 'visualSpecRef'],
      },
    },
    componentsUnmapped: {
      type: 'array',
      items: {
        type: 'object',
        properties: { component: { type: 'string' }, reason: { type: 'string' } },
        required: ['component', 'reason'],
      },
    },
    conventionsAssumed: { type: 'array', items: { type: 'string' } },
  },
  required: ['uiLibrary', 'entries'],
}

const GALLERY_PLAN_SCHEMA = {
  type: 'object',
  properties: {
    approach: { type: 'string' },
    location: { type: 'string' },
    buildSequencing: { type: 'string' },
    entries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          component: { type: 'string' },
          variantsToRender: { type: 'array', items: { type: 'string' } },
          statesToRender: { type: 'array', items: { type: 'string' } },
          propsControlsNeeded: { type: 'array', items: { type: 'string' } },
          isolationCriteria: { type: 'string' },
        },
        required: ['component', 'statesToRender'],
      },
    },
    acceptanceCriteria: { type: 'array', items: { type: 'string' } },
    openGaps: { type: 'array', items: { type: 'string' } },
  },
  required: ['approach', 'location', 'buildSequencing', 'entries', 'acceptanceCriteria'],
}

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
            enum: [
              'ux-principles', 'design-tokens', 'components', 'usage-rules',
              'implementation-contract', 'component-map', 'gallery-plan', 'all',
            ],
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
    '{ "design": "...", "prd": "optional path to a PRD to link back to and pull tech-stack/architecture decisions from", "platform": "...", "brand": "...", "date": "YYYY-MM-DD" }.'
  )
}
const prdPath = (input && typeof input === 'object' && input.prd) || null
const platform = (input && typeof input === 'object' && input.platform) || 'not stated - infer it and record the inference as an assumption'
const brand = (input && typeof input === 'object' && input.brand) || 'none stated'
const date = (input && typeof input === 'object' && input.date) || 'unknown - fill in before this leaves Draft'

function slugify(text) {
  const slug = (text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
  return slug || 'untitled'
}

// When a PRD path is given, derive the folder name from the PRD's own filename (the same
// stem convention as tech-stack-selector.js and architecture-designer.js) so this package's
// output folder always agrees with docs/product-specs/, docs/architecture/, docs/tasks/,
// docs/testing/, and docs/qa-reports/ - instead of drifting from a re-derived, unstable
// product-summary sentence. Only fall back to slugifying the summary when no PRD was given.
function designSystemDirFor(prdPath, productSummary) {
  if (prdPath) {
    const base = prdPath.slice(prdPath.lastIndexOf('/') + 1)
    const stem = base.replace(/\.md$/i, '').replace(/-?prd$/i, '') || 'untitled'
    return `docs/design-system/${stem}/`
  }
  return `docs/design-system/${slugify(productSummary)}/`
}

const DOC_TYPES = [
  { key: 'ux-principles', title: 'UX principles', ceiling: 12000 },
  { key: 'design-tokens', title: 'Design tokens', ceiling: 20000 },
  { key: 'components', title: 'Component contracts', ceiling: 40000 },
  { key: 'usage-rules', title: 'Usage rules - when to use what', ceiling: 20000 },
  { key: 'implementation-contract', title: 'Implementation contract', ceiling: 16000 },
  { key: 'component-map', title: 'Component map', ceiling: 20000 },
  { key: 'gallery-plan', title: 'Gallery plan', ceiling: 14000 },
]

// --- Phase 1: Frame (single agent, sequential - everything downstream is derived from it) ---
phase('Frame')
const frame = await agent(
  `Extract the real UI surface of this product. The design input is below - it may be a directory or file path ` +
  `(typically design-blueprint output: screens-and-ui.md, user-flows.md, design-decisions.md). If it is a path, read those files.\n\n` +
  `<design_input>\n${design}\n</design_input>\n\n` +
  `Platform target: ${platform}\n` +
  `Brand constraints: ${brand}\n` +
  (prdPath
    ? `PRD path (read it, and check its Links row for a linked Tech Stack and/or Architecture document per your instructions): ${prdPath}\n`
    : `No PRD path was given - leave techStackDecisions and architectureComponents empty and note it as an assumption.\n`) +
  `\nInventory only what the source actually describes, trace every item back to where it came from, and cluster the component needs into at most 4 groups. Design nothing.`,
  { agentType: 'ds2-framer', schema: FRAME_SCHEMA }
)

const groups = (frame.componentGroups || []).filter(g => (g.components || []).length > 0).slice(0, 4)
if (frame.surfaceInventory.length === 0 || groups.length === 0) {
  throw new Error(
    'The framer found no surfaces or no component needs in the design input - there is no product surface to build a system from. ' +
    'Point this workflow at design-blueprint output or a description that names actual screens.'
  )
}
const techStackDecisions = frame.techStackDecisions || []
const architectureComponents = frame.architectureComponents || []
log(`Framed ${frame.surfaceInventory.length} surface(s) on ${frame.platform}, ${groups.length} component group(s): ${groups.map(g => `${g.group} (${g.components.length})`).join(', ')}${techStackDecisions.length ? `, ${techStackDecisions.length} tech-stack decision(s) picked up` : ''}`)

const frameContext =
  `Product: ${frame.productSummary}\n` +
  `Platform: ${frame.platform}\n` +
  `Platform conventions: ${(frame.platformConventions || []).join('; ') || 'none recorded'}\n` +
  `Brand constraints: ${(frame.brandConstraints || []).join('; ') || 'none stated'}\n\n` +
  `UX drivers:\n${JSON.stringify(frame.uxDrivers || [], null, 2)}\n\n` +
  `Surface inventory:\n${JSON.stringify(frame.surfaceInventory, null, 2)}\n\n` +
  `Interaction patterns needed:\n${JSON.stringify(frame.interactionPatternsNeeded || [], null, 2)}`

const docsDir = designSystemDirFor(prdPath, frame.productSummary)
const pathFor = key => `${docsDir}${key}.md`

// --- Phase 2: Foundations (parallel - principles and tokens are independent derivations of the frame) ---
// A barrier here is genuine: every component contract needs BOTH the principles it applies
// and the token roles it consumes, so the catalog cannot start until both have landed.
phase('Foundations')
const [principles, tokens] = await parallel([
  () => agent(
    `Derive the UX design principles for this product. Three to five, each contestable, each with a stated trade-off.\n\n${frameContext}`,
    { agentType: 'ds2-principles-author', label: 'foundations:principles', phase: 'Foundations', schema: PRINCIPLES_SCHEMA, model: 'opus' }
  ),
  () => agent(
    `Define the design tokens for this product. Only the scales these surfaces actually need. Compute every contrast ratio - do not estimate one.\n\n${frameContext}`,
    { agentType: 'ds2-token-author', label: 'foundations:tokens', phase: 'Foundations', schema: TOKENS_SCHEMA, model: 'opus' }
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
    { agentType: 'ds2-component-author', label: `catalog:${g.group}`, phase: 'Catalog', schema: COMPONENTS_SCHEMA }
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

// Trimmed catalog projections for the three downstream phases that each need a different
// slice of it, not the full per-component contract (anatomy/accessibility/content/responsive) -
// a real audited run found the full catalog (with those heavy blocks) re-embedded whole into
// Rules, Mapping, and Gallery, each of which only reads a handful of fields from it.
const catalogForRules = catalog.map(g => ({
  group: g.group,
  components: (g.components || []).map(c => ({
    name: c.name, purpose: c.purpose, whenToUse: c.whenToUse, whenNotToUse: c.whenNotToUse, alternative: c.alternative,
  })),
}))
const catalogForMapping = catalog.map(g => ({
  group: g.group,
  components: (g.components || []).map(c => ({ name: c.name, purpose: c.purpose, tracedTo: c.tracedTo })),
}))
const catalogForGallery = catalog.map(g => ({
  group: g.group,
  components: (g.components || []).map(c => ({ name: c.name, variants: c.variants, states: c.states })),
}))

// --- Phase 4: Rules (single agent, sequential - it must see the WHOLE catalog to choose between components) ---
phase('Rules')
const rules = await agent(
  `Write the usage rules for this design system: the recurring decisions a developer would otherwise re-make differently every feature. ` +
  `Draw the situations from the interaction patterns and surfaces below, not from a generic list. Every rule needs a default and an explicit never.\n\n` +
  `${frameContext}\n\n` +
  `Design principles:\n${JSON.stringify(principles, null, 2)}\n\n` +
  `The component catalog you are choosing between (reference these exact names):\n${JSON.stringify(catalogForRules, null, 2)}\n\n` +
  `Token roles available:\n${JSON.stringify((tokens.colorRoles || []).map(r => r.name).concat((tokens.scales || []).flatMap(s => (s.tokens || []).map(t => t.name))), null, 2)}`,
  { agentType: 'ds2-rules-author', schema: RULES_SCHEMA, model: 'opus' }
)
log(`Rules: ${rules.decisionRules.length} decision rule(s), ${rules.statePolicy.length} state policy entr(ies)`)

// --- Phase 5: Mapping (single agent, sequential - needs the WHOLE catalog plus tech-stack decisions) ---
phase('Mapping')
const componentMap = await agent(
  `Place every component in this catalog: where it lives, and whether it is custom, a UI-library primitive, or a composition of library primitives.\n\n` +
  `Tech-stack decisions already made (the source of truth for any UI library - do not choose one yourself):\n${JSON.stringify(techStackDecisions, null, 2)}\n\n` +
  `Architecture component boundaries, if any (use these for locations where they match):\n${JSON.stringify(architectureComponents, null, 2)}\n\n` +
  `Platform: ${frame.platform}\n\n` +
  `The component catalog to place:\n${JSON.stringify(catalogForMapping, null, 2)}`,
  { agentType: 'ds2-component-mapper', schema: COMPONENT_MAP_SCHEMA }
)
log(`Mapping: uiLibrary=${componentMap.uiLibrary}, ${componentMap.entries.length}/${componentCount} component(s) placed${(componentMap.componentsUnmapped || []).length ? `, ${componentMap.componentsUnmapped.length} unmapped` : ''}`)

// --- Phase 6: Gallery (single agent, sequential - needs the resolved map plus every state to render) ---
phase('Gallery')
const galleryPlan = await agent(
  `Spec the isolation gallery page for this design system: the one page built right after infrastructure and before any feature, rendering every component from the map in every state.\n\n` +
  `Resolved component map:\n${JSON.stringify(componentMap, null, 2)}\n\n` +
  `Platform: ${frame.platform}\n\n` +
  `Component catalog, for its states and variants:\n${JSON.stringify(catalogForGallery, null, 2)}`,
  { agentType: 'ds2-gallery-planner', schema: GALLERY_PLAN_SCHEMA }
)
log(`Gallery: ${galleryPlan.entries.length} component(s) planned for isolation rendering at ${galleryPlan.location}`)

// --- Phase 7: Author (parallel, one agent per document, writes to disk itself) ---
// Each document only needs the upstream object(s) it actually renders - not the whole run's
// state. A real audited run showed every one of the 7 authors (and every revise call) receiving
// all 7 upstream objects regardless of which single document it was writing, pushing every
// prompt to 322K-350K characters. implementation-contract is the one genuine exception: it is
// the meta-document that references every other document's obligations, so it keeps the full
// bundle - everything else gets only what its own document structure calls for.
const CONTEXT_FOR_DOC = {
  'ux-principles': () => `Design principles:\n${JSON.stringify(principles, null, 2)}`,
  'design-tokens': () =>
    `Tokens:\n${JSON.stringify(tokens, null, 2)}\n\n` +
    `Token gaps reported by the component authors:\n${JSON.stringify(tokenGaps, null, 2)}`,
  // Component contracts already carry their own tokensUsed/tracedTo - no need for the raw
  // tokens or framing objects again.
  components: () => `Component catalog:\n${JSON.stringify(catalog, null, 2)}`,
  'usage-rules': () => `Usage rules:\n${JSON.stringify(rules, null, 2)}`,
  // componentMap entries already carry component/visualSpecRef/tokensConsumed/tracedTo - no
  // need for the raw catalog again.
  'component-map': () => `Component map:\n${JSON.stringify(componentMap, null, 2)}`,
  'gallery-plan': () => `Gallery plan:\n${JSON.stringify(galleryPlan, null, 2)}`,
  'implementation-contract': () =>
    `Framing:\n${JSON.stringify(frame, null, 2)}\n\n` +
    `Principles:\n${JSON.stringify(principles, null, 2)}\n\n` +
    `Tokens:\n${JSON.stringify(tokens, null, 2)}\n\n` +
    `Component catalog:\n${JSON.stringify(catalog, null, 2)}\n\n` +
    `Usage rules:\n${JSON.stringify(rules, null, 2)}\n\n` +
    `Component map:\n${JSON.stringify(componentMap, null, 2)}\n\n` +
    `Gallery plan:\n${JSON.stringify(galleryPlan, null, 2)}\n\n` +
    `Token gaps reported by the component authors:\n${JSON.stringify(tokenGaps, null, 2)}`,
}
const systemContextFor = key =>
  `${(CONTEXT_FOR_DOC[key] || CONTEXT_FOR_DOC['implementation-contract'])()}\n\nDate to use for "Last updated": ${date}`

async function enforceSizeCeiling(status, label, ceiling) {
  if (!status || !ceiling || status.charCount <= ceiling) return status
  log(`${label} draft is ${status.charCount} chars, over the ${ceiling} ceiling - requesting one trim pass`)
  const trimmed = await agent(
    `Your draft at ${status.path} is ${status.charCount} characters, over this document's ${ceiling}-character ceiling. ` +
    `Tighten prose density and cut padding before ever dropping a row, state, or rule. Overwrite the same file path.`,
    { agentType: 'ds2-doc-author', label: `trim:${label}`, phase: 'Author', schema: DRAFT_STATUS_SCHEMA }
  )
  if (!trimmed) {
    log(`${label} trim pass failed - keeping the over-ceiling draft`)
    return status
  }
  if (trimmed.charCount > ceiling) {
    log(`${label} still ${trimmed.charCount} chars after trimming - keeping it rather than looping`)
  }
  return trimmed
}

const authorDoc = (doc, revisionIssues) => {
  const wantsPrdLink = doc.key === 'implementation-contract' && !!prdPath && !revisionIssues
  return agent(
    `Write the "${doc.key}" document ("${doc.title}") of this design system set to ${pathFor(doc.key)}, following your instructions for that specific document and the house style.\n\n` +
    `${systemContextFor(doc.key)}` +
    (wantsPrdLink
      ? `\n\nThis call also owns the PRD link: read the PRD at ${prdPath}, find its header Links row, and add or replace the "Design system" reference to point at ${docsDir}. Report the result as prdLinked.`
      : '') +
    (revisionIssues
      ? `\n\nThis is a revision. Read your previous version from ${pathFor(doc.key)} first. ` +
        `Fix every issue below. Keep everything that was not flagged - do not rewrite from scratch. Do not touch the PRD.\n\n` +
        `<issues_for_this_document>\n${JSON.stringify(revisionIssues, null, 2)}\n</issues_for_this_document>`
      : ''),
    {
      agentType: 'ds2-doc-author',
      label: revisionIssues ? `revise:${doc.key}` : `author:${doc.key}`,
      phase: revisionIssues ? 'Revise' : 'Author',
      schema: DRAFT_STATUS_SCHEMA,
    }
  )
}

phase('Author')
const authored = await parallel(DOC_TYPES.map(d => () => authorDoc(d)))
const statuses = {}
DOC_TYPES.forEach((d, i) => { if (authored[i]) statuses[d.key] = authored[i] })

const authoredKeys = Object.keys(statuses)
if (authoredKeys.length === 0) {
  throw new Error('Every document failed to author - nothing to review or return.')
}
if (authoredKeys.length < DOC_TYPES.length) {
  log(`Warning: ${DOC_TYPES.length - authoredKeys.length} document(s) failed to author and are missing from the set`)
}

let prdLinked = false
for (const d of DOC_TYPES) {
  if (statuses[d.key] && statuses[d.key].prdLinked) prdLinked = true
}

const ceilingChecks = await parallel(DOC_TYPES.filter(d => statuses[d.key]).map(d => () =>
  enforceSizeCeiling(statuses[d.key], d.key, d.ceiling)
))
DOC_TYPES.filter(d => statuses[d.key]).forEach((d, i) => { if (ceilingChecks[i]) statuses[d.key] = ceilingChecks[i] })

// --- Phase 8/9: Critique -> Revise loop (parallel lenses over the WHOLE set, capped rounds) ---
// Critics read every document by path themselves - the orchestrator never re-embeds
// document text into a prompt, which is what made every round of the old pipeline
// cost roughly one full copy of the entire document set per critique lens.
const CRITIQUE_LENSES = ['justification', 'accessibility', 'consistency', 'implementability', 'buildability']
const MAX_ROUNDS = 2
let round = 0
let allCritiques = []
const MAX_OPEN_ISSUES = 15

// Each lens's own checklist (see ds2-critic.md) only ever cites a subset of the seven
// documents - a real audited run found all 5 lenses re-reading all 7 full documents every
// round (10x total across 2 rounds) regardless of which ones its own checklist actually
// touches. Scope each lens to only the documents its checklist references.
const LENS_DOCS = {
  justification: ['ux-principles', 'design-tokens', 'components', 'usage-rules'],
  accessibility: ['design-tokens', 'components'],
  consistency: ['ux-principles', 'design-tokens', 'components', 'usage-rules', 'component-map'],
  implementability: ['ux-principles', 'design-tokens', 'components', 'usage-rules', 'implementation-contract'],
  buildability: ['components', 'component-map', 'gallery-plan'],
}

const pathsBlock = lens => DOC_TYPES
  .filter(d => statuses[d.key] && LENS_DOCS[lens].includes(d.key))
  .map(d => `- ${d.key}: ${pathFor(d.key)}`)
  .join('\n')

while (round < MAX_ROUNDS) {
  phase('Critique')
  const critiques = (await parallel(CRITIQUE_LENSES.map(lens => () =>
    agent(
      `The documents your ${lens} checklist covers live at these paths - read every one before reviewing (the other document(s) in the set are out of scope for this lens):\n${pathsBlock(lens)}\n\n` +
      `Review them through the ${lens} lens only, against that lens's checklist. Be adversarial. ` +
      `List every checklist item that fails, including the small ones, and route each issue to the one document that owns the fix. ` +
      `The verdict rule, not your sense of importance, decides what happens next.`,
      { agentType: 'ds2-critic', label: `critique:${lens}`, phase: 'Critique', schema: CRITIQUE_SCHEMA, model: 'opus' }
    )
  ))).filter(Boolean)
  allCritiques = critiques

  const needsWork = critiques.filter(c => c.verdict === 'needs_revision')
  if (needsWork.length === 0) {
    log('All five lenses signed off - the design system set is ready')
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
        if (!statuses[key]) continue
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
  const revised = await parallel(toRevise.map(d => () => authorDoc(d, issuesByDoc[d.key])))
  const revisedStatuses = await parallel(toRevise.map((d, i) => () =>
    revised[i] ? enforceSizeCeiling(revised[i], d.key, d.ceiling) : Promise.resolve(null)
  ))
  toRevise.forEach((d, i) => { if (revisedStatuses[i]) statuses[d.key] = revisedStatuses[i] })
}

const allOpenIssues = allCritiques
  .filter(c => c.verdict === 'needs_revision')
  .flatMap(c => (c.issues || []).map(i => ({ lens: c.lens, document: i.document, severity: i.severity || 'unstated', issue: i.issue })))
const openIssues = allOpenIssues.slice(0, MAX_OPEN_ISSUES)

return {
  productSummary: frame.productSummary,
  platform: frame.platform,
  componentGroupCount: groups.length,
  componentCount,
  rejectedCount,
  uiLibrary: componentMap.uiLibrary,
  componentsMapped: componentMap.entries.length,
  componentsUnmapped: (componentMap.componentsUnmapped || []).length,
  galleryLocation: galleryPlan.location,
  roundsRun: round,
  openIssues,
  openIssuesTotal: allOpenIssues.length,
  documentsPath: docsDir,
  documents: DOC_TYPES
    .filter(d => statuses[d.key])
    .map(d => ({ key: d.key, title: d.title, path: statuses[d.key].path, version: statuses[d.key].version, charCount: statuses[d.key].charCount })),
  prdPath,
  prdLinked,
}
