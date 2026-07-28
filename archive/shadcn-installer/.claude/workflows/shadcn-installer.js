export const meta = {
  name: 'shadcn-installer',
  description: 'Install shadcn/ui into the current project, tech-stack agnostic, via detect -> init -> add components -> verify/fix (capped) -> report',
  phases: [
    { title: 'Detect', detail: 'classify framework, package manager, TypeScript, Tailwind version, and existing shadcn state' },
    { title: 'Init', detail: 'run (or perform manually) the framework-appropriate shadcn init, skipped if already initialized' },
    { title: 'Components', detail: 'install the requested (or default starter) set of components' },
    { title: 'Verify', detail: 'independently re-check components.json, CSS theme wiring, imports, and the build' },
    { title: 'Fix', detail: 'route open issues back to the engineer that owns them, capped at 2 rounds' },
    { title: 'Report', detail: 'write a short markdown install record' },
  ],
}

const DETECT_SCHEMA = {
  type: 'object',
  properties: {
    framework: { type: 'string', enum: ['next', 'vite', 'remix', 'astro', 'laravel', 'gatsby', 'react-router', 'tanstack-router', 'tanstack-start', 'manual', 'unknown'] },
    packageManager: { type: 'string', enum: ['npm', 'pnpm', 'yarn', 'bun'] },
    typescript: { type: 'boolean' },
    tailwindVersion: { type: 'string' },
    tailwindWired: { type: 'boolean' },
    alreadyInitialized: { type: 'boolean' },
    existingComponentsJsonPath: { type: 'string' },
    existingConfig: { type: 'string' },
    monorepo: { type: 'boolean' },
    projectRoot: { type: 'string' },
    srcDir: { type: 'string' },
    cssEntryPath: { type: 'string' },
    pathAlias: { type: 'string' },
    notes: { type: 'string' },
  },
  required: ['framework', 'packageManager', 'typescript', 'alreadyInitialized'],
}

const INIT_SCHEMA = {
  type: 'object',
  properties: {
    ran: { type: 'boolean' },
    commandsRun: { type: 'array', items: { type: 'string' } },
    filesCreated: { type: 'array', items: { type: 'string' } },
    filesModified: { type: 'array', items: { type: 'string' } },
    componentsJsonPath: { type: 'string' },
    darkModeConfigured: { type: 'boolean' },
    issues: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['ran', 'notes'],
}

const COMPONENTS_SCHEMA = {
  type: 'object',
  properties: {
    requested: { type: 'array', items: { type: 'string' } },
    installed: { type: 'array', items: { type: 'string' } },
    alreadyPresent: { type: 'array', items: { type: 'string' } },
    failed: {
      type: 'array',
      items: {
        type: 'object',
        properties: { component: { type: 'string' }, reason: { type: 'string' } },
        required: ['component', 'reason'],
      },
    },
    commandsRun: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['requested', 'installed', 'failed'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    checks: {
      type: 'array',
      items: {
        type: 'object',
        properties: { check: { type: 'string' }, status: { type: 'string', enum: ['pass', 'fail'] }, detail: { type: 'string' } },
        required: ['check', 'status'],
      },
    },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: { category: { type: 'string', enum: ['init', 'components', 'other'] }, detail: { type: 'string' } },
        required: ['category', 'detail'],
      },
    },
    buildRan: { type: 'boolean' },
    buildPassed: { type: ['boolean', 'null'] },
    notes: { type: 'string' },
  },
  required: ['verdict', 'checks', 'issues'],
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

const request = typeof input === 'string' ? input : (input && input.request) || ''
const components = (input && typeof input === 'object' && Array.isArray(input.components)) ? input.components : []
const style = (input && typeof input === 'object' && input.style) || ''
const baseColor = (input && typeof input === 'object' && input.baseColor) || ''
const darkMode = !!(input && typeof input === 'object' && input.darkMode)
const force = !!(input && typeof input === 'object' && input.force)

// --- Phase 1: Detect (single agent, sequential - everything downstream depends on it) ---
phase('Detect')
const detect = await agent(
  `Classify this project for a shadcn/ui install. Extra context from the caller (may be empty, may just be a plain description of what they want): "${request}"`,
  { agentType: 'shadcn-detector', schema: DETECT_SCHEMA }
)
log(`Detected: ${detect.framework} / ${detect.packageManager} / ts=${detect.typescript} / tailwind=${detect.tailwindVersion} / alreadyInitialized=${detect.alreadyInitialized}`)

// --- Phase 2: Init (single agent, sequential) ---
phase('Init')
const optionsNote = `Requested options - style: ${style || 'unspecified, use the framework default'}, base color: ${baseColor || 'unspecified, use the framework default'}, dark mode: ${darkMode ? 'yes, wire it' : 'not requested'}, force reinstall: ${force ? 'yes' : 'no'}.`
let init = await agent(
  `Initialize shadcn/ui for this project.\n\n${optionsNote}\n\nDetection result:\n${JSON.stringify(detect, null, 2)}`,
  { agentType: 'shadcn-init-engineer', schema: INIT_SCHEMA }
)
log(init.ran ? `Init ran: ${init.commandsRun.length} command(s), componentsJson at ${init.componentsJsonPath}` : 'Init skipped - already initialized')

// --- Phase 3: Components (single agent, sequential) ---
phase('Components')
const requestedComponents = components.length > 0
  ? components
  : []
const componentsNote = requestedComponents.length > 0
  ? `Install these components: ${requestedComponents.join(', ')}.`
  : `No specific components were requested. Caller context: "${request}". If that context names components, install those; otherwise install the default starter set.`
let comps = await agent(
  `${componentsNote}\n\nDetection result:\n${JSON.stringify(detect, null, 2)}\n\nInit result:\n${JSON.stringify(init, null, 2)}`,
  { agentType: 'shadcn-component-engineer', schema: COMPONENTS_SCHEMA }
)
log(`Components: ${comps.installed.length} installed, ${comps.alreadyPresent.length} already present, ${comps.failed.length} failed`)

// --- Phase 4/5: Verify -> Fix loop (capped rounds) ---
const MAX_ROUNDS = 2
let round = 0
let verify = null

while (round < MAX_ROUNDS) {
  phase('Verify')
  verify = await agent(
    `Verify this shadcn/ui install end to end - do not trust the engineers' self-reports, re-check the actual files.\n\nDetection:\n${JSON.stringify(detect, null, 2)}\n\nInit result:\n${JSON.stringify(init, null, 2)}\n\nComponents result:\n${JSON.stringify(comps, null, 2)}`,
    { agentType: 'shadcn-verifier', phase: 'Verify', schema: VERIFY_SCHEMA }
  )
  log(`Verify round ${round + 1}: ${verify.verdict} (${verify.issues.length} issue(s))`)
  if (verify.verdict === 'pass') break

  round++
  if (round >= MAX_ROUNDS) {
    log(`Round cap (${MAX_ROUNDS}) reached with ${verify.issues.length} issue(s) still open - reporting as-is`)
    break
  }

  phase('Fix')
  const initIssues = verify.issues.filter(i => i.category === 'init')
  const componentIssues = verify.issues.filter(i => i.category === 'components')

  if (initIssues.length > 0) {
    init = await agent(
      `Fix these issues found during verification of the shadcn/ui init. Keep everything that already works.\n\nIssues:\n${JSON.stringify(initIssues, null, 2)}\n\nCurrent init result:\n${JSON.stringify(init, null, 2)}\n\nDetection:\n${JSON.stringify(detect, null, 2)}`,
      { agentType: 'shadcn-init-engineer', phase: 'Fix', schema: INIT_SCHEMA }
    )
  }
  if (componentIssues.length > 0) {
    comps = await agent(
      `Fix these issues found during verification of the installed components. Keep everything that already works.\n\nIssues:\n${JSON.stringify(componentIssues, null, 2)}\n\nCurrent components result:\n${JSON.stringify(comps, null, 2)}\n\nDetection:\n${JSON.stringify(detect, null, 2)}`,
      { agentType: 'shadcn-component-engineer', phase: 'Fix', schema: COMPONENTS_SCHEMA }
    )
  }
  log(`Fix round ${round}: addressed ${initIssues.length} init issue(s), ${componentIssues.length} component issue(s)`)
}

// --- Phase 6: Report (single agent) ---
phase('Report')
const report = await agent(
  `Write the install report for this shadcn/ui run.\n\nDetection:\n${JSON.stringify(detect, null, 2)}\n\nInit:\n${JSON.stringify(init, null, 2)}\n\nComponents:\n${JSON.stringify(comps, null, 2)}\n\nFinal verification:\n${JSON.stringify(verify, null, 2)}`,
  { agentType: 'shadcn-reporter' }
)

return { detect, init, components: comps, verify, report }
