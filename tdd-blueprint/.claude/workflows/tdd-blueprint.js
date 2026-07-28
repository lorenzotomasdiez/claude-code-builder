export const meta = {
  name: 'tdd-blueprint',
  description: 'Turn a PRD plus architecture and design documents into the test blueprint a developer does TDD from: layered strategy, Given/When/Then specs with stable IDs, a red-green build order, and a traceability matrix. Writes no code.',
  phases: [
    { title: 'Frame', detail: 'turn the upstream documents into a testable-surface brief' },
    { title: 'Strategy', detail: 'layers, test-double policy, environments, CI gates, exit criteria (opus: architecture-level judgment)' },
    { title: 'Specify', detail: 'parallel fan-out: one spec author per behavior slice plus one per cross-cutting NFR concern' },
    { title: 'Critique', detail: 'parallel adversarial review of the whole spec set: coverage, testability/determinism, tdd-usability (opus: judgment-heavy)' },
    { title: 'Revise', detail: 'route issues back to the owning spec author, sweep unowned coverage gaps, re-review until clean or capped' },
    { title: 'Sequence', detail: 'red-green build order plus the traceability matrix (opus: ordering and coverage judgment)' },
    { title: 'Author', detail: 'write the six blueprint documents in parallel' },
  ],
}

const BRIEF_SCHEMA = {
  type: 'object',
  properties: {
    product: { type: 'string' },
    stack: {
      type: 'object',
      properties: {
        languages: { type: 'array', items: { type: 'string' } },
        testRunners: { type: 'array', items: { type: 'string' } },
        testCommand: { type: 'string' },
        existingConventions: { type: 'string' },
        greenfield: { type: 'boolean' },
      },
    },
    slices: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          name: { type: 'string' },
          summary: { type: 'string' },
          userFlows: { type: 'array', items: { type: 'string' } },
          components: { type: 'array', items: { type: 'string' } },
          tracesTo: { type: 'array', items: { type: 'string' } },
        },
        required: ['key', 'name'],
      },
    },
    components: { type: 'array', items: { type: 'string' } },
    externalDependencies: { type: 'array', items: { type: 'string' } },
    nfrs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          characteristic: { type: 'string' },
          target: { type: 'string' },
        },
        required: ['characteristic'],
      },
    },
    // Which cross-cutting concerns actually have a surface in THIS run's scope. The framer is the
    // only agent that read the task row, so it is the only one that can tell a scaffold task
    // (no user-facing surface, so no accessibility) from a UI task. Drives the NFR fan-out below.
    applicableNfrConcerns: {
      type: 'array',
      items: { type: 'string', enum: ['performance', 'security', 'accessibility', 'resilience-and-data'] },
    },
    ambiguities: { type: 'array', items: { type: 'string' } },
    outOfScope: { type: 'array', items: { type: 'string' } },
  },
  required: ['product', 'slices', 'applicableNfrConcerns'],
}

const STRATEGY_SCHEMA = {
  type: 'object',
  properties: {
    shape: { type: 'string' },
    shapeRationale: { type: 'string' },
    layers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          layer: { type: 'string' },
          whatBelongs: { type: 'string' },
          whatDoesNotBelong: { type: 'string' },
          tooling: { type: 'string' },
          speedExpectation: { type: 'string' },
        },
        required: ['layer', 'whatBelongs', 'whatDoesNotBelong'],
      },
    },
    droppedLayers: { type: 'array', items: { type: 'string' } },
    doublesPolicy: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          dependency: { type: 'string' },
          approach: { type: 'string', enum: ['real', 'fake', 'stub', 'contract', 'recorded'] },
          rationale: { type: 'string' },
          injectionPoint: { type: 'string' },
        },
        required: ['dependency', 'approach'],
      },
    },
    environments: { type: 'string' },
    testData: { type: 'string' },
    ciGates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          trigger: { type: 'string' },
          layersRun: { type: 'array', items: { type: 'string' } },
          blocks: { type: 'string' },
        },
        required: ['trigger'],
      },
    },
    exitCriteria: { type: 'array', items: { type: 'string' } },
    qualityMetrics: { type: 'array', items: { type: 'string' } },
    antiPatterns: { type: 'array', items: { type: 'string' } },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['shape', 'layers', 'doublesPolicy'],
}

const SPEC_SET_SCHEMA = {
  type: 'object',
  properties: {
    group: { type: 'string' },
    specs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          layer: { type: 'string' },
          priority: { type: 'string', enum: ['must', 'should', 'edge'] },
          given: { type: 'string' },
          when: { type: 'string' },
          then: { type: 'string' },
          data: { type: 'string' },
          errorPaths: { type: 'array', items: { type: 'string' } },
          tracesTo: { type: 'array', items: { type: 'string' } },
          notes: { type: 'string' },
          group: { type: 'string' },
        },
        required: ['id', 'title', 'layer', 'given', 'when', 'then'],
      },
    },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['group', 'specs'],
}

const DOC_STATUS_SCHEMA = {
  type: 'object',
  properties: {
    key: { type: 'string' },
    path: { type: 'string' },
    charCount: { type: 'number' },
    version: { type: 'string' },
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
          issue: { type: 'string' },
          group: { type: 'string' },
          specId: { type: 'string' },
        },
        required: ['issue'],
      },
    },
  },
  required: ['lens', 'verdict', 'issues'],
}

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    buildOrder: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          step: { type: 'number' },
          sliceKey: { type: 'string' },
          goal: { type: 'string' },
          firstFailingSpecId: { type: 'string' },
          specIds: { type: 'array', items: { type: 'string' } },
          doneWhen: { type: 'string' },
          dependsOn: { type: 'array', items: { type: 'string' } },
          risk: { type: 'string', enum: ['high', 'normal'] },
        },
        required: ['step', 'sliceKey', 'goal', 'firstFailingSpecId', 'specIds'],
      },
    },
    traceability: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          item: { type: 'string' },
          kind: { type: 'string', enum: ['requirement', 'flow', 'component', 'nfr'] },
          specIds: { type: 'array', items: { type: 'string' } },
          layers: { type: 'array', items: { type: 'string' } },
          status: { type: 'string', enum: ['covered', 'partial', 'uncovered'] },
        },
        required: ['item', 'status'],
      },
    },
    orphanSpecs: { type: 'array', items: { type: 'string' } },
    uncovered: { type: 'array', items: { type: 'string' } },
    notes: { type: 'array', items: { type: 'string' } },
  },
  required: ['buildOrder', 'traceability'],
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

const taskId = (input && typeof input === 'object' && input.taskId) || null
const tasksPath = (input && typeof input === 'object' && input.tasksPath) || null
const taskScoped = Boolean(taskId && tasksPath)

const sources = []
if (taskScoped) {
  sources.push({
    label: 'task',
    content:
      `Task-scoped run. Task index: ${tasksPath}. Task ID: ${taskId}. Follow the task-scoped-mode instructions ` +
      `in your own agent definition - read only this task's row and the documents its References column names, ` +
      `and derive exactly one slice from it.`,
  })
} else if (typeof input === 'string') {
  sources.push({ label: 'request', content: input })
} else if (input && typeof input === 'object') {
  for (const key of ['prd', 'architecture', 'design', 'target', 'notes']) {
    if (input[key]) sources.push({ label: key, content: input[key] })
  }
}
if (!sources.length) {
  throw new Error(
    'Missing input. Call this workflow with args set to either a plain string (what is being built, ' +
    'or a path to a PRD), an object shaped ' +
    '{ "prd": "...", "architecture": "...", "design": "...", "target": "...", "notes": "..." } ' +
    'where each value is a path to read (or, for "target"/"notes", raw text), or an object shaped ' +
    '{ "tasksPath": "path to a tasks.md", "taskId": "T3" } to scope the run to one task.'
  )
}

const NFR_CONCERNS = [
  { key: 'performance', label: 'performance' },
  { key: 'security', label: 'security' },
  { key: 'accessibility', label: 'accessibility' },
  { key: 'resilience', label: 'resilience-and-data' },
]

// --- Phase 1: Frame (single agent, sequential) ---
phase('Frame')
const brief = await agent(
  `Turn the upstream product documents below into a testable-surface brief. Each entry is either document text or a path you should read.\n\n` +
  sources.map(s => `<source label="${s.label}">\n${s.content}\n</source>`).join('\n\n') +
  `\n\nWhere the sources are thin, make explicit labeled assumptions and record what is genuinely ambiguous rather than blocking.` +
  `\n\nAlso decide "applicableNfrConcerns": which of performance, security, accessibility, and resilience-and-data have a real surface in THIS run's scope, judged from what is actually being built here rather than from what the product will eventually contain. Each concern you list spawns a spec author for it; each one you omit writes nothing. Omit a concern with no surface - a repo scaffold has no user-facing UI to make accessible and no dependency to be resilient to - and return an empty list if none apply. Under-listing is cheap to fix in review; over-listing pads the blueprint with specs for components this scope never builds.`,
  { agentType: 'tdd-framer', schema: BRIEF_SCHEMA }
)
if (!brief.slices || !brief.slices.length) {
  throw new Error('The framer found no behavior slices to specify - the input does not describe anything testable yet. Run /prd-generator or /design-blueprint first, or pass a fuller description.')
}
log(`Brief ready: ${brief.product} - ${brief.slices.length} slice(s), ${(brief.externalDependencies || []).length} external dependency(ies), ${(brief.ambiguities || []).length} ambiguity(ies)`)

// Only the concerns the framer found a real surface for fan out. An unconditional four-way NFR
// fan-out is what turns a task-scoped run into a whole-product one: a task's References column
// points at product-level architecture sections, so the brief legitimately carries every component
// the product will ever have, and an NFR author told to cover "every surface in the brief" will
// specify all of them against a single task.
const declaredConcerns = brief.applicableNfrConcerns || []
const activeNfrConcerns = NFR_CONCERNS.filter(c => declaredConcerns.includes(c.label))
const skippedConcerns = NFR_CONCERNS.filter(c => !declaredConcerns.includes(c.label))
if (skippedConcerns.length) {
  log(`NFR concerns in scope: ${activeNfrConcerns.map(c => c.label).join(', ') || 'none'} - skipping ${skippedConcerns.map(c => c.label).join(', ')} (no surface in this scope)`)
}

// A scope boundary travels with the brief to every downstream agent - spec authors, critics,
// revisers, the coverage sweep, the sequencer, and the document authors - because every one of
// them otherwise reads the brief's product-level lists as a coverage target.
const scopeBoundary = taskScoped
  ? `\n\n<scope_boundary>\nThis run is scoped to exactly one task: ${taskId} from ${tasksPath}. Its only deliverable is the single slice in the brief.\n\nThe brief's components, externalDependencies, and nfrs are drawn from product-level documents that the task's References column points at. They are context for understanding what this task fits into - they are NOT the scope. Other tasks build them.\n\nA spec belongs in this blueprint only if it tests something ${taskId} itself builds, and every spec must trace to ${taskId}. A spec about a component this task does not build is a defect even when the component is real and the spec is well written: it cannot go red-then-green in this task, so it makes the suite fail for reasons this task cannot fix.\n</scope_boundary>`
  : ''

// --- Phase 2: Strategy (single agent, sequential, opus) ---
phase('Strategy')
const strategy = await agent(
  `<testable_surface_brief>\n${JSON.stringify(brief, null, 2)}\n</testable_surface_brief>\n\n` +
  `Design the layered test strategy for this product. Decide the shape from this product's real risk and boundaries, go through every external dependency in the brief one by one for the test-double policy, and name an injection point for every source of non-determinism. Drop any layer this product does not need and say you dropped it.`,
  { agentType: 'tdd-strategist', schema: STRATEGY_SCHEMA, model: 'opus' }
)
log(`Strategy ready: ${strategy.shape} - ${strategy.layers.length} layer(s), ${strategy.doublesPolicy.length} dependency decision(s)`)

// --- Phase 3: Specify (parallel fan-out: one agent per slice, one per NFR concern) ---
phase('Specify')
const strategyContext = `<test_strategy>\n${JSON.stringify(strategy, null, 2)}\n</test_strategy>`
const briefContext = `<testable_surface_brief>\n${JSON.stringify(brief, null, 2)}\n</testable_surface_brief>${scopeBoundary}`

// Told to every NFR author, and repeated on their revision pass so a critique issue phrased as
// "this is not covered" cannot walk the set back out of scope.
const nfrScopeClause = taskScoped
  ? `Cover your concern across the surface ${taskId} actually builds, and nothing else. Components the brief describes but this task does not build are out of scope no matter how clearly the brief describes them. Every spec must trace to ${taskId}. If your concern has no real surface in this task, return an empty spec list - that is the correct, honest answer, not a gap to pad.`
  : `Cover your concern systematically across every entry point and surface in the brief, and stay out of the functional slices' territory.`

const GROUPS = [
  ...brief.slices.map(s => ({
    key: `slice:${s.key}`,
    kind: 'functional',
    agentType: 'tdd-spec-author',
    slice: s,
  })),
  ...activeNfrConcerns.map(c => ({
    key: `nfr:${c.key}`,
    kind: 'nfr',
    agentType: 'tdd-nfr-spec-author',
    concern: c.label,
  })),
]

const specSets = {} // group key -> { specs: [...], openQuestions: [...] }

const initialSets = await parallel(GROUPS.map(g => () =>
  agent(
    `${briefContext}\n\n${strategyContext}\n\n` +
    (g.kind === 'functional'
      ? `Write the behavior specs for exactly one slice: ${JSON.stringify(g.slice, null, 2)}\n\n` +
        `Use the ID namespace SPEC-${g.slice.key.toUpperCase()}-NN. Cover the happy path, the alternative paths, the error and unauthorized paths, and the boundaries this slice actually has - and stop there.`
      : `Write the specs for exactly one cross-cutting concern${taskScoped ? '' : ' across the whole product'}: ${g.concern}.\n\n` +
        `Use the ID namespace SPEC-${g.key.split(':')[1].toUpperCase()}-NN. ${nfrScopeClause}`) +
    `\n\nReturn "${g.key}" as your group. Follow the strategy's layer names and test-double policy exactly.`,
    { agentType: g.agentType, label: `specify:${g.key}`, phase: 'Specify', schema: SPEC_SET_SCHEMA }
  )
))
GROUPS.forEach((g, i) => {
  const r = initialSets[i]
  if (r) specSets[g.key] = { specs: r.specs || [], openQuestions: r.openQuestions || [] }
})

const allSpecs = () => GROUPS
  .filter(g => specSets[g.key])
  .flatMap(g => specSets[g.key].specs.map(s => ({ ...s, group: g.key })))
log(`Specified: ${allSpecs().length} spec(s) across ${Object.keys(specSets).length}/${GROUPS.length} group(s)`)

function slugify(text) {
  const slug = (text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
  return slug || 'untitled'
}
// Task-scoped runs take the product slug straight from the task index's own parent folder
// (docs/tasks/<slug>/tasks.md) instead of re-slugifying the framer's product summary, so
// docs/testing/<slug>/ always agrees with docs/tasks/<slug>/ and docs/qa-reports/<slug>/ -
// the same fix applied to design-system-foundation-v2.js and task-breakdown.js.
const taskProductSlugMatch = taskScoped && tasksPath.match(/([^/]+)\/tasks\.md$/i)
const slug = taskScoped ? ((taskProductSlugMatch && taskProductSlugMatch[1]) || slugify(tasksPath)) : slugify(brief.product)
const outDir = taskScoped ? `docs/testing/${slug}/${taskId}/` : `docs/testing/${slug}/`
const specsScratchPath = `${outDir}_work/specs.json`

// Persist the current spec inventory to one scratch file rather than pasting it into every one
// of the parallel critic prompts below - each critic reads it from disk instead. Rewritten after
// every round so it always reflects the latest revision before the next critique pass reads it.
async function writeSpecsScratch() {
  const written = await agent(
    `Write this exact JSON content to ${specsScratchPath}, verbatim.\n\n${JSON.stringify(allSpecs(), null, 2)}`,
    { agentType: 'tdd-scratch-writer', label: 'scratch:specs', phase: 'Specify' }
  )
  return written
}
await writeSpecsScratch()

// --- Phase 4/5: Critique -> Revise loop (parallel lenses over the whole set, capped rounds) ---
// The critique is a barrier on purpose: coverage, duplication, and layer-consistency defects
// are only visible across the full spec set, never within one group.
const CRITIQUE_LENSES = ['coverage-completeness', 'testability-determinism', 'tdd-usability']
const MAX_ROUNDS = 2
const MAX_OPEN_ISSUES = 15
let round = 0
let allCritiques = []

while (round < MAX_ROUNDS) {
  phase('Critique')
  const critiques = (await parallel(CRITIQUE_LENSES.map(lens => () =>
    agent(
      `${briefContext}\n\n${strategyContext}\n\nSpec set: read it from ${specsScratchPath} before reviewing.\n\n` +
      `<routing_groups>\n${GROUPS.map(g => g.key).join('\n')}\n</routing_groups>\n\n` +
      `Review the whole spec set through the ${lens} lens only. Be adversarial and list every checklist item that fails, including the small and uncertain ones. Route each issue to the owning group key from routing_groups; leave the group empty only when the fix is a missing spec that no existing group owns. The verdict rule, not your sense of importance, decides what happens next.`,
      { agentType: 'tdd-critic', label: `critique:${lens}`, phase: 'Critique', schema: CRITIQUE_SCHEMA, model: 'opus' }
    )
  ))).filter(Boolean)
  allCritiques = critiques

  const openIssues = critiques
    .filter(c => c.verdict === 'needs_revision')
    .flatMap(c => (c.issues || []).map(i => ({ ...i, lens: c.lens })))
  const flagging = critiques.filter(c => c.verdict === 'needs_revision')

  if (flagging.length === 0) {
    log('All three lenses signed off - the spec set is ready')
    break
  }

  round++
  if (round >= MAX_ROUNDS) {
    log(`Round cap (${MAX_ROUNDS}) reached with ${flagging.length}/${critiques.length} lenses still flagging ${openIssues.length} issue(s) - returning the best spec set and carrying the open issues into the documents`)
    break
  }

  phase('Revise')
  const byGroup = {}
  const unowned = []
  for (const issue of openIssues) {
    if (issue.group && specSets[issue.group]) {
      if (!byGroup[issue.group]) byGroup[issue.group] = []
      byGroup[issue.group].push(issue)
    } else {
      unowned.push(issue)
    }
  }
  log(`Revising round ${round}: ${openIssues.length} issue(s) - ${Object.keys(byGroup).length} group(s) to fix, ${unowned.length} unowned coverage gap(s)`)

  const groupsToFix = GROUPS.filter(g => byGroup[g.key])
  const revised = await parallel(groupsToFix.map(g => () =>
    agent(
      `${briefContext}\n\n${strategyContext}\n\n` +
      `<your_current_specs group="${g.key}">\n${JSON.stringify(specSets[g.key].specs, null, 2)}\n</your_current_specs>\n\n` +
      `<critique_issues>\n${JSON.stringify(byGroup[g.key], null, 2)}\n</critique_issues>\n\n` +
      `Revise your spec set to address every issue above. Keep the specs that were not flagged, keep surviving IDs stable, and continue the numbering rather than reusing retired numbers. An issue that says a spec is out of scope is addressed by deleting that spec, not by rewording it. Return "${g.key}" as your group and the complete revised set, not just the changes.` +
      (g.kind === 'nfr' ? `\n\n${nfrScopeClause}` : ''),
      { agentType: g.agentType, label: `revise:${g.key}`, phase: 'Revise', schema: SPEC_SET_SCHEMA }
    )
  ))
  groupsToFix.forEach((g, i) => {
    if (revised[i] && revised[i].specs) {
      specSets[g.key] = { specs: revised[i].specs, openQuestions: revised[i].openQuestions || specSets[g.key].openQuestions }
    }
  })

  if (unowned.length) {
    const inventory = allSpecs().map(s => ({ id: s.id, title: s.title, layer: s.layer, group: s.group, tracesTo: s.tracesTo }))
    const sweep = await agent(
      `${briefContext}\n\n${strategyContext}\n\n` +
      `<existing_spec_inventory>\n${JSON.stringify(inventory, null, 2)}\n</existing_spec_inventory>\n\n` +
      `<coverage_gaps>\n${JSON.stringify(unowned, null, 2)}\n</coverage_gaps>\n\n` +
      `<groups>\n${GROUPS.map(g => g.key).join('\n')}\n</groups>\n\n` +
      `Run a coverage-gap sweep: write ONLY the specs missing to close the gaps above, in the right slice's ID namespace and continuing that namespace's numbering. Set each spec's "group" field to the group key it belongs to. Do not duplicate or restate anything already in the inventory. Write nothing for a gap that falls outside this blueprint's scope - closing an out-of-scope gap is worse than leaving it open, since it belongs to a task that has its own blueprint. Return "sweep" as your group.`,
      { agentType: 'tdd-spec-author', label: `revise:coverage-sweep`, phase: 'Revise', schema: SPEC_SET_SCHEMA }
    )
    const added = (sweep && sweep.specs) || []
    for (const spec of added) {
      const target = (spec.group && specSets[spec.group])
        ? spec.group
        : GROUPS.find(g => g.kind === 'functional' && spec.id.toUpperCase().includes(g.slice.key.toUpperCase()))?.key
      if (target && specSets[target]) {
        specSets[target].specs.push(spec)
      } else {
        if (!specSets['additional']) {
          specSets['additional'] = { specs: [], openQuestions: [] }
          GROUPS.push({ key: 'additional', kind: 'functional', agentType: 'tdd-spec-author', slice: { key: 'additional', name: 'Additional coverage' } })
        }
        specSets['additional'].specs.push(spec)
      }
    }
    log(`Coverage sweep added ${added.length} spec(s)`)
  }

  // Rewrite the scratch file so the next round's critics (or the Author phase, if this was
  // the last round) read the revised set, not the one from before this round's fixes.
  await writeSpecsScratch()
}

const finalSpecs = allSpecs()
const openIssuesAtExit = allCritiques
  .filter(c => c.verdict === 'needs_revision')
  .flatMap(c => (c.issues || []).map(i => ({ lens: c.lens, ...i })))
// Capped view for the final return only - the Author phase below still gets the full list,
// since a doc-author genuinely needs every open issue to reflect it in the document.
const openIssuesCapped = openIssuesAtExit.slice(0, MAX_OPEN_ISSUES)

// --- Phase 6: Sequence (single agent, sequential, opus) ---
phase('Sequence')
const plan = await agent(
  `${briefContext}\n\n${strategyContext}\n\nSpec set: read the final reviewed version from ${specsScratchPath} before sequencing.\n\n` +
  `Produce the red-green build order and the traceability matrix. Place the cross-cutting non-functional specs deliberately rather than dumping them at the end, and report the coverage gaps honestly rather than smoothing them out.`,
  { agentType: 'tdd-sequencer', schema: PLAN_SCHEMA, model: 'opus' }
)
const uncoveredCount = (plan.traceability || []).filter(t => t.status !== 'covered').length
log(`Plan ready: ${plan.buildOrder.length} step(s), ${plan.traceability.length} traceability row(s), ${uncoveredCount} not fully covered, ${(plan.orphanSpecs || []).length} orphan spec(s)`)

// --- Phase 7: Author the document set (parallel, one agent per document) ---
phase('Author')
const DOC_TYPES = [
  { key: 'test-strategy', title: 'Test strategy' },
  { key: 'behavior-specs', title: 'Behavior specs' },
  { key: 'tdd-plan', title: 'TDD plan' },
  { key: 'test-data-and-fixtures', title: 'Test data & fixtures' },
  { key: 'nfr-test-plan', title: 'Non-functional test plan' },
  { key: 'traceability-matrix', title: 'Traceability matrix' },
]
const docContext =
  `${briefContext}\n\n${strategyContext}\n\n` +
  `Spec set: read the current version from ${specsScratchPath} before writing.\n\n` +
  `<build_order_and_traceability>\n${JSON.stringify(plan, null, 2)}\n</build_order_and_traceability>\n\n` +
  `<open_critique_issues>\n${JSON.stringify(openIssuesAtExit, null, 2)}\n</open_critique_issues>`

const authored = await parallel(DOC_TYPES.map(d => () =>
  agent(
    `Write the "${d.key}" document ("${d.title}") of this TDD blueprint to ${outDir}${d.key}.md, following your instructions for that specific document. Carry the specs, IDs, thresholds, and gaps exactly as given - this document is code-free by design.\n\n${docContext}`,
    { agentType: 'tdd-doc-author', label: `author:${d.key}`, phase: 'Author', schema: DOC_STATUS_SCHEMA }
  )
))
const documents = DOC_TYPES
  .map((d, i) => authored[i] ? { key: d.key, title: d.title, path: authored[i].path, charCount: authored[i].charCount, version: authored[i].version } : null)
  .filter(Boolean)
log(`Authored ${documents.length}/${DOC_TYPES.length} document(s) to ${outDir}`)

// Traceability rows that are fully covered add nothing a reader needs to act on - only the
// gaps are actionable, so only the gaps travel in the return.
const traceabilityGaps = (plan.traceability || []).filter(t => t.status !== 'covered')

return {
  product: brief.product,
  sliceCount: brief.slices.length,
  specCount: finalSpecs.length,
  strategyShape: strategy.shape,
  roundsRun: round,
  openIssues: openIssuesCapped,
  openIssuesTotal: openIssuesAtExit.length,
  buildStepCount: plan.buildOrder.length,
  firstFailingSpecId: (plan.buildOrder[0] || {}).firstFailingSpecId,
  coveredCount: (plan.traceability || []).length - traceabilityGaps.length,
  traceabilityGaps,
  orphanSpecs: plan.orphanSpecs || [],
  ambiguities: brief.ambiguities || [],
  documentsPath: outDir,
  documents,
  taskScoped,
  taskId,
  tasksPath,
}
