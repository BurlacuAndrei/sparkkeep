import { Playbook, PlaybookStep, CustomStepConfig } from '../../types';
import type { TranslationKey } from '../../i18n';

export interface PillarHealth {
  id: 'grounding' | 'retrieval' | 'extraction' | 'verification' | 'delivery';
  name: string;
  ready: boolean;
  hint: string;
}

export interface SoftLinterAdvisory {
  id: string;
  pillarId: 'grounding' | 'retrieval' | 'extraction' | 'verification' | 'delivery';
  title: string;
  description: string;
  actionLabel: string;
  onFix: () => void;
}

export const DEFAULT_CARD_TYPES = [
  'article',
  'video',
  'book',
  'guide',
  'product',
  'place',
  'idea',
  'quote',
];

export const INPUT_BINDING_OPTIONS = [
  { key: 'capture', label: 'Capture Context' },
  { key: 'references', label: 'References' },
  { key: 'sources', label: 'Sources' },
  { key: 'previous_steps', label: 'Previous Steps' },
];

export const DEFAULT_LEAN_STARTER_STEPS: PlaybookStep[] = [
  {
    position: 1,
    kind: 'ground',
    name: 'Grounding',
    enabled: true,
    config: {
      output_heading: 'Grounding & Context',
      instruction: 'Anchor card context, source URL, note, and metadata into run memory.',
      tool_policy: 'none',
      role: 'research_synthesis',
      inputs: ['capture'],
    },
  },
  {
    position: 2,
    kind: 'search',
    name: 'Targeted Search',
    enabled: true,
    config: {
      output_heading: 'Search Discoveries',
      instruction: 'Execute targeted web queries to locate primary sources and authoritative data.',
      tool_policy: 'search',
      max_queries: 2,
      role: 'research_plan',
      inputs: ['capture'],
    },
  },
  {
    position: 3,
    kind: 'custom',
    name: 'Custom Analysis',
    enabled: true,
    config: {
      output_heading: 'Custom Analysis',
      instruction: 'Analyze the card context and extracted sources.',
      tool_policy: 'none',
      role: 'research_synthesis',
      inputs: ['sources', 'previous_steps'],
      max_queries: 2,
    },
  },
  {
    position: 4,
    kind: 'report',
    name: 'Briefing Report',
    enabled: true,
    config: {
      output_heading: 'Executive Briefing',
      instruction: 'Compile finalized Markdown briefing report synthesizing all insights with citations.',
      tool_policy: 'none',
      role: 'research_synthesis',
      inputs: ['capture', 'sources', 'previous_steps'],
    },
  },
];

export function getDefaultInputsForStep(step: PlaybookStep): string[] {
  if (step.config?.inputs && Array.isArray(step.config.inputs)) {
    return step.config.inputs;
  }
  switch (step.kind) {
    case 'ground':
      return ['capture'];
    case 'resolve_refs':
      return ['capture', 'references'];
    case 'plan':
    case 'search':
    case 'read':
    case 'verify_claims':
    case 'landscape':
    case 'verdict':
    case 'report':
    case 'custom':
    default:
      return ['capture', 'sources', 'previous_steps'];
  }
}

export const CORE_STEP_DESCRIPTIONS: Record<string, string> = {
  ground: 'Anchor card context, source URL, note, and metadata into run memory',
  resolve_refs: 'Fetch linked internal and external references',
  plan: 'Decompose core questions and craft search queries',
  search: 'Execute queries across search providers and register URLs',
  read: 'Scrape and extract content in round-robin fashion',
  verify_claims: 'Cross-check core claims against extracted sources with citations',
  landscape: 'Analyze competitive landscape and alternatives',
  verdict: 'Synthesize decision recommendation, confidence, and action items',
  report: 'Compile finalized Markdown briefing with [S#] citations',
  custom: 'User-configured custom research analysis step',
};

/** Catalog keys for the UI fallback description of a step kind. */
export const STEP_DESCRIPTION_KEYS: Record<string, TranslationKey> = {
  ground: 'playbooks.stepDescriptions.ground',
  resolve_refs: 'playbooks.stepDescriptions.resolve_refs',
  plan: 'playbooks.stepDescriptions.plan',
  search: 'playbooks.stepDescriptions.search',
  read: 'playbooks.stepDescriptions.read',
  verify_claims: 'playbooks.stepDescriptions.verify_claims',
  landscape: 'playbooks.stepDescriptions.landscape',
  verdict: 'playbooks.stepDescriptions.verdict',
  report: 'playbooks.stepDescriptions.report',
  custom: 'playbooks.stepDescriptions.custom',
};

export const STEP_STAGE_LABELS: Record<string, string> = {
  ground: 'Grounding',
  resolve_refs: 'Retrieval',
  plan: 'Planning',
  search: 'Retrieval',
  read: 'Extraction',
  verify_claims: 'Verification',
  landscape: 'Synthesis',
  verdict: 'Delivery',
  report: 'Delivery',
  custom: 'Synthesis',
};

export type TemplateDomain =
  | 'All'
  | 'Market Intelligence'
  | 'Due Diligence & Risk'
  | 'Academic & Science'
  | 'Fast Fact-Check'
  | 'General';

export interface PlaybookTemplate {
  id: string;
  name: string;
  badge: string;
  icon: string;
  description: string;
  domain: 'Market Intelligence' | 'Due Diligence & Risk' | 'Academic & Science' | 'Fast Fact-Check' | 'General';
  estCost: string;
  estLatency: string;
  pillarsReady: Array<'grounding' | 'retrieval' | 'extraction' | 'verification' | 'delivery'>;
  card_types: string[];
  steps: Array<{
    position: number;
    kind: string;
    name: string;
    enabled: boolean;
    config?: CustomStepConfig;
  }>;
}

export type PlaybookRecipe = PlaybookTemplate;

export const TEMPLATE_DOMAINS: TemplateDomain[] = [
  'All',
  'Market Intelligence',
  'Due Diligence & Risk',
  'Academic & Science',
  'Fast Fact-Check',
  'General',
];

export const PLAYBOOK_TEMPLATES: PlaybookTemplate[] = [
  {
    id: 'competitor',
    name: 'Competitor & Moat Teardown',
    badge: '🎯 Market Intelligence',
    icon: '🎯',
    domain: 'Market Intelligence',
    description: 'Dissects direct competitors, pricing models, feature parity, and defensibility moats.',
    estCost: '~$0.04',
    estLatency: '~12s',
    pillarsReady: ['grounding', 'retrieval', 'extraction', 'delivery'],
    card_types: ['tool', 'product', 'company'],
    steps: [
      { position: 1, kind: 'ground', name: 'Grounding', enabled: true, config: {} },
      { position: 2, kind: 'search', name: 'Competitor Search', enabled: true, config: {} },
      { position: 3, kind: 'read', name: 'Round-robin Reading', enabled: true, config: {} },
      { position: 4, kind: 'landscape', name: 'Competitive Landscape', enabled: true, config: {} },
      {
        position: 5,
        kind: 'custom',
        name: 'Moat & Pricing Analysis',
        enabled: true,
        config: {
          output_heading: 'Pricing & Defensibility Moat',
          instruction: 'Evaluate competitor pricing models, switching costs, gross margins, and structural moats versus incumbents.',
          tool_policy: 'search',
          max_queries: 2,
          role: 'research_synthesis',
        },
      },
      { position: 6, kind: 'verdict', name: 'Synthesis & Verdict', enabled: true, config: {} },
      { position: 7, kind: 'report', name: 'Report Generation', enabled: true, config: {} },
    ],
  },
  {
    id: 'due_diligence',
    name: 'Investment & Risk Due Diligence',
    badge: '📈 Due Diligence & Risk',
    icon: '📈',
    domain: 'Due Diligence & Risk',
    description: 'Deep-dive into unit economics, downside risks, regulatory exposure, and bear case failure modes.',
    estCost: '~$0.05',
    estLatency: '~16s',
    pillarsReady: ['grounding', 'retrieval', 'extraction', 'verification', 'delivery'],
    card_types: ['company', 'product', 'idea'],
    steps: [
      { position: 1, kind: 'ground', name: 'Grounding', enabled: true, config: {} },
      { position: 2, kind: 'resolve_refs', name: 'Resolve References', enabled: true, config: {} },
      { position: 3, kind: 'search', name: 'Financial & Market Search', enabled: true, config: {} },
      { position: 4, kind: 'read', name: 'Source Extraction', enabled: true, config: {} },
      { position: 5, kind: 'verify_claims', name: 'Claim Verification', enabled: true, config: {} },
      {
        position: 6,
        kind: 'custom',
        name: 'Bear Case & Downside Risks',
        enabled: true,
        config: {
          output_heading: 'Bear Case & Structural Risks',
          instruction: 'Analyze major failure modes, regulatory headwinds, customer concentration, and downside liquidation scenarios.',
          tool_policy: 'search',
          max_queries: 2,
          role: 'research_synthesis',
        },
      },
      { position: 7, kind: 'verdict', name: 'Investment Verdict', enabled: true, config: {} },
      { position: 8, kind: 'report', name: 'Briefing Report', enabled: true, config: {} },
    ],
  },
  {
    id: 'academic',
    name: 'Academic & Literature Review',
    badge: '🔬 Academic & Science',
    icon: '🔬',
    domain: 'Academic & Science',
    description: 'Examines paper citations, empirical methodology, statistical validity, and reproducible results.',
    estCost: '~$0.06',
    estLatency: '~18s',
    pillarsReady: ['grounding', 'retrieval', 'extraction', 'verification', 'delivery'],
    card_types: ['article', 'paper'],
    steps: [
      { position: 1, kind: 'ground', name: 'Grounding', enabled: true, config: {} },
      { position: 2, kind: 'resolve_refs', name: 'Resolve Citations', enabled: true, config: {} },
      { position: 3, kind: 'plan', name: 'Hypothesis Planning', enabled: true, config: {} },
      { position: 4, kind: 'search', name: 'Literature Search', enabled: true, config: {} },
      { position: 5, kind: 'read', name: 'Paper Reading', enabled: true, config: {} },
      { position: 6, kind: 'verify_claims', name: 'Empirical Verification', enabled: true, config: {} },
      {
        position: 7,
        kind: 'custom',
        name: 'Methodology & Rigor',
        enabled: true,
        config: {
          output_heading: 'Methodological Rigor & Reproducibility',
          instruction: 'Scrutinize research methodology, dataset sample sizes, potential p-hacking, and reproducibility risks.',
          tool_policy: 'none',
          role: 'research_synthesis',
        },
      },
      { position: 8, kind: 'report', name: 'Academic Synthesis', enabled: true, config: {} },
    ],
  },
  {
    id: 'fact_check',
    name: 'Fast Fact Check & Claim Verification',
    badge: '⚡ Fast Fact-Check',
    icon: '⚡',
    domain: 'Fast Fact-Check',
    description: 'Rapid verification of specific claims and statistical assertions without heavy planning.',
    estCost: '~$0.02',
    estLatency: '~6s',
    pillarsReady: ['grounding', 'retrieval', 'extraction', 'verification', 'delivery'],
    card_types: ['article', 'idea', 'paper'],
    steps: [
      { position: 1, kind: 'ground', name: 'Grounding', enabled: true, config: {} },
      { position: 2, kind: 'search', name: 'Evidence Search', enabled: true, config: {} },
      { position: 3, kind: 'read', name: 'Evidence Reading', enabled: true, config: {} },
      { position: 4, kind: 'verify_claims', name: 'Claim Verification', enabled: true, config: {} },
      { position: 5, kind: 'report', name: 'Fact-Check Report', enabled: true, config: {} },
    ],
  },
  {
    id: 'deep_dive',
    name: 'Flagship 8-Step Deep Dive',
    badge: '🏛️ General Deep Dive',
    icon: '🏛️',
    domain: 'General',
    description: 'The complete 8-step investigation covering references, planning, search, reading, claims, and verdict.',
    estCost: '~$0.07',
    estLatency: '~20s',
    pillarsReady: ['grounding', 'retrieval', 'extraction', 'verification', 'delivery'],
    card_types: [],
    steps: [
      { position: 1, kind: 'ground', name: 'Grounding', enabled: true, config: {} },
      { position: 2, kind: 'resolve_refs', name: 'Resolve References', enabled: true, config: {} },
      { position: 3, kind: 'plan', name: 'Question Planning', enabled: true, config: {} },
      { position: 4, kind: 'search', name: 'Multi-query Search', enabled: true, config: {} },
      { position: 5, kind: 'read', name: 'Round-robin Reading', enabled: true, config: {} },
      { position: 6, kind: 'verify_claims', name: 'Claim Verification', enabled: true, config: {} },
      { position: 7, kind: 'verdict', name: 'Synthesis & Verdict', enabled: true, config: {} },
      { position: 8, kind: 'report', name: 'Report Generation', enabled: true, config: {} },
    ],
  },
  {
    id: 'blank',
    name: 'Modular Blank Canvas',
    badge: '🎨 General',
    icon: '🎨',
    domain: 'General',
    description: 'Start lean with just Grounding and Report, adding custom analysis steps as needed.',
    estCost: '~$0.01',
    estLatency: '~4s',
    pillarsReady: ['grounding', 'retrieval', 'delivery'],
    card_types: [],
    steps: [
      { position: 1, kind: 'ground', name: 'Grounding', enabled: true, config: {} },
      { position: 2, kind: 'search', name: 'Targeted Search', enabled: true, config: {} },
      { position: 3, kind: 'report', name: 'Final Report', enabled: true, config: {} },
    ],
  },
];

export const PLAYBOOK_RECIPES = PLAYBOOK_TEMPLATES;

/** Catalog keys for gallery display names/descriptions; inserted template payloads stay English. */
export const TEMPLATE_I18N_KEYS: Record<
  string,
  { name: TranslationKey; description: TranslationKey }
> = {
  competitor: {
    name: 'playbooks.gallery.templates.competitor.name',
    description: 'playbooks.gallery.templates.competitor.description',
  },
  due_diligence: {
    name: 'playbooks.gallery.templates.due_diligence.name',
    description: 'playbooks.gallery.templates.due_diligence.description',
  },
  academic: {
    name: 'playbooks.gallery.templates.academic.name',
    description: 'playbooks.gallery.templates.academic.description',
  },
  fact_check: {
    name: 'playbooks.gallery.templates.fact_check.name',
    description: 'playbooks.gallery.templates.fact_check.description',
  },
  deep_dive: {
    name: 'playbooks.gallery.templates.deep_dive.name',
    description: 'playbooks.gallery.templates.deep_dive.description',
  },
  blank: {
    name: 'playbooks.gallery.templates.blank.name',
    description: 'playbooks.gallery.templates.blank.description',
  },
};

export interface UserSavedStepTemplate {
  id: string;
  name: string;
  description: string;
  heading: string;
  instruction: string;
  tool_policy: 'none' | 'search';
  role: 'research_plan' | 'research_synthesis';
  max_queries: number;
}

export interface PromptStarter {
  label: string;
  text: string;
}

export const STEP_PROMPT_STARTERS: Record<string, PromptStarter[]> = {
  plan: [
    {
      label: 'Architecture Vectors',
      text: 'Analyze core architectural components, scalability vectors, data flow, and infrastructure trade-offs.',
    },
    {
      label: 'Moat & Economics',
      text: 'Investigate unit economics, pricing dynamics, defensibility moats, and supplier/customer power.',
    },
    {
      label: 'Risk & Compliance',
      text: 'Map out regulatory hurdles, security boundaries, compliance requirements, and potential failure points.',
    },
  ],
  search: [
    {
      label: 'Competitor Pricing',
      text: 'Identify published pricing tiers, volume discounts, hidden costs, and billing model structures.',
    },
    {
      label: 'Benchmarks & Whitepapers',
      text: 'Find technical whitepapers, empirical benchmark datasets, and reproducible evaluation methodologies.',
    },
  ],
  landscape: [
    {
      label: '2x2 Feature Matrix',
      text: 'Construct a 2x2 competitive positioning matrix comparing feature depth against implementation complexity.',
    },
    {
      label: 'Open-Source vs SaaS',
      text: 'Compare open-source self-hosted alternatives versus commercial managed SaaS solutions.',
    },
  ],
  verdict: [
    {
      label: 'Buy / Build / Partner',
      text: 'Deliver a definitive Buy, Build, or Partner strategic recommendation with cost and speed rationale.',
    },
    {
      label: '10-Point Scorecard',
      text: 'Evaluate across a 10-point scorecard covering technical feasibility, defensibility, and ROI.',
    },
    {
      label: 'Bear Case Stress-Test',
      text: 'Stress-test the bear case scenario, key vulnerabilities, adoption inertia, and execution risks.',
    },
  ],
  custom: [
    {
      label: 'SWOT Analysis',
      text: 'Conduct a structured SWOT (Strengths, Weaknesses, Opportunities, Threats) analysis based on extracted sources.',
    },
    {
      label: 'Pricing & Moat',
      text: 'Analyze pricing models, margins, customer acquisition unit economics, and competitive defensibility against incumbents.',
    },
    {
      label: 'Regulatory & Risk',
      text: 'Examine compliance requirements, regulatory headwinds, security vectors, and potential legal vulnerabilities.',
    },
    {
      label: 'Executive Brief',
      text: 'Synthesize 3-5 high-priority strategic recommendations with clear next steps and timeline.',
    },
  ],
  ground: [
    {
      label: 'Context Extraction',
      text: 'Anchor primary entities, core problem statements, and key hypotheses from capture input.',
    },
    {
      label: 'Key Entities',
      text: 'Extract key stakeholders, technology stacks, target domains, and operational constraints.',
    },
  ],
  resolve_refs: [
    {
      label: 'Primary Sources',
      text: 'Prioritize official documentation, GitHub repositories, and direct primary sources.',
    },
    {
      label: 'Benchmark Citations',
      text: 'Trace academic references, peer reviews, and foundational citations.',
    },
  ],
  read: [
    {
      label: 'Deep Extraction',
      text: 'Extract high-signal technical specifications, benchmarks, and critical architecture details.',
    },
    {
      label: 'Evidence Quotes',
      text: 'Extract concrete quantitative data points, quotes, and verifiable metrics.',
    },
  ],
  verify_claims: [
    {
      label: 'Source Fact-Check',
      text: 'Cross-verify factual assertions across sources and flag unsupported or contradictory claims.',
    },
    {
      label: 'Discrepancy Audit',
      text: 'Scrutinize numerical disparities, date discrepancies, and promotional bias.',
    },
  ],
  report: [
    {
      label: 'Executive Briefing',
      text: 'Synthesize high-level executive findings with structured headings and citation links.',
    },
    {
      label: 'Action Roadmap',
      text: 'Provide concrete sequential action items, prioritized milestones, and decision gates.',
    },
  ],
};

export const DEFAULT_PROMPT_STARTERS: PromptStarter[] = [
  {
    label: 'Deep Dive Analysis',
    text: 'Conduct an in-depth critical analysis focusing on primary evidence and domain trade-offs.',
  },
  {
    label: 'Key Findings',
    text: 'Synthesize key takeaways, implications, and actionable recommendations.',
  },
];

/** Catalog keys for starter pill labels; inserted prompt text stays English. */
export const STARTER_LABEL_KEYS: Record<string, TranslationKey> = {
  'Architecture Vectors': 'playbooks.starters.architectureVectors',
  'Moat & Economics': 'playbooks.starters.moatEconomics',
  'Risk & Compliance': 'playbooks.starters.riskCompliance',
  'Competitor Pricing': 'playbooks.starters.competitorPricing',
  'Benchmarks & Whitepapers': 'playbooks.starters.benchmarksWhitepapers',
  '2x2 Feature Matrix': 'playbooks.starters.featureMatrix',
  'Open-Source vs SaaS': 'playbooks.starters.openSourceSaas',
  'Buy / Build / Partner': 'playbooks.starters.buyBuildPartner',
  '10-Point Scorecard': 'playbooks.starters.scorecard',
  'Bear Case Stress-Test': 'playbooks.starters.bearCase',
  'SWOT Analysis': 'playbooks.starters.swot',
  'Pricing & Moat': 'playbooks.starters.pricingMoat',
  'Regulatory & Risk': 'playbooks.starters.regulatoryRisk',
  'Executive Brief': 'playbooks.starters.executiveBrief',
  'Context Extraction': 'playbooks.starters.contextExtraction',
  'Key Entities': 'playbooks.starters.keyEntities',
  'Primary Sources': 'playbooks.starters.primarySources',
  'Benchmark Citations': 'playbooks.starters.benchmarkCitations',
  'Deep Extraction': 'playbooks.starters.deepExtraction',
  'Evidence Quotes': 'playbooks.starters.evidenceQuotes',
  'Source Fact-Check': 'playbooks.starters.sourceFactCheck',
  'Discrepancy Audit': 'playbooks.starters.discrepancyAudit',
  'Executive Briefing': 'playbooks.starters.executiveBriefing',
  'Action Roadmap': 'playbooks.starters.actionRoadmap',
  'Deep Dive Analysis': 'playbooks.starters.deepDiveAnalysis',
  'Key Findings': 'playbooks.starters.keyFindings',
};

export function generateStepTemplateId(): string {
  return `user_step_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

export interface PlaybookValidationError {
  key: TranslationKey;
  vars?: Record<string, string | number>;
}

export function validatePlaybook(playbook: Playbook | null): PlaybookValidationError[] {
  if (!playbook) return [];
  const errors: PlaybookValidationError[] = [];

  if (!playbook.name.trim()) {
    errors.push({ key: 'playbooks.validation.nameRequired' });
  }
  if (playbook.steps.length === 0) {
    errors.push({ key: 'playbooks.validation.stepsRequired' });
  }
  if (playbook.steps.length > 12) {
    errors.push({
      key: 'playbooks.validation.maxSteps',
      vars: { count: playbook.steps.length },
    });
  }

  let hasSearchOrRefs = false;
  playbook.steps.forEach((step, idx) => {
    if (step.enabled) {
      if (step.kind === 'read' && !hasSearchOrRefs) {
        errors.push({
          key: 'playbooks.validation.readRequiresSearch',
          vars: { step: idx + 1, name: step.name },
        });
      }
      if (step.kind === 'search' || step.kind === 'resolve_refs') {
        hasSearchOrRefs = true;
      }
    }

    if ((step.config?.instruction || '').length > 8000) {
      errors.push({
        key: 'playbooks.validation.instructionTooLong',
        vars: { step: idx + 1, name: step.name },
      });
    }

    if (step.kind === 'custom' && !step.config?.output_heading?.trim()) {
      errors.push({
        key: 'playbooks.validation.outputHeadingRequired',
        vars: { step: idx + 1, name: step.name },
      });
    }
  });

  return errors;
}

export function exportPlaybookToFile(playbook: Playbook): void {
  const exportData = {
    name: playbook.name,
    description: playbook.description,
    card_types: playbook.card_types || [],
    version: playbook.version || 1,
    steps: (playbook.steps || []).map((s, idx) => ({
      position: idx + 1,
      kind: s.kind,
      name: s.name,
      enabled: s.enabled,
      config: s.config || {},
    })),
  };
  const jsonStr = JSON.stringify(exportData, null, 2);

  try {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(jsonStr);
    }
  } catch {
    // ignore
  }

  try {
    if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL) {
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const sanitized = (playbook.name || 'playbook')
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_');
      a.download = `${sanitized}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  } catch {
    // ignore
  }
}

export interface PlaybookImportResult {
  playbook?: Playbook;
  errorKey?: TranslationKey;
  errorVars?: Record<string, string>;
}

export function parseImportedPlaybook(
  jsonText: string,
  prev?: Playbook | null
): PlaybookImportResult {
  if (!jsonText.trim()) {
    return { errorKey: 'playbooks.importErrors.pasteJson' };
  }
  try {
    const parsed = JSON.parse(jsonText);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { errorKey: 'playbooks.importErrors.invalidStructure' };
    }
    if (!parsed.name || typeof parsed.name !== 'string' || !parsed.name.trim()) {
      return { errorKey: 'playbooks.importErrors.nameRequired' };
    }
    if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
      return { errorKey: 'playbooks.importErrors.stepsRequired' };
    }

    const normalizedSteps: PlaybookStep[] = parsed.steps.map(
      (st: Record<string, unknown>, idx: number) => ({
        id: typeof st.id === 'number' ? st.id : undefined,
        position: idx + 1,
        kind: typeof st.kind === 'string' && st.kind.trim() ? st.kind : 'custom',
        name: typeof st.name === 'string' && st.name.trim() ? st.name : `Step ${idx + 1}`,
        enabled: st.enabled !== false,
        config:
          typeof st.config === 'object' && st.config !== null
            ? (st.config as CustomStepConfig)
            : {},
      })
    );

    return {
      playbook: {
        id: prev?.id || 0,
        name: parsed.name.trim(),
        description: typeof parsed.description === 'string' ? parsed.description : '',
        is_builtin: false,
        card_types: Array.isArray(parsed.card_types) ? parsed.card_types : [],
        version: typeof parsed.version === 'number' ? parsed.version : 1,
        steps: normalizedSteps,
      },
    };
  } catch (err: unknown) {
    return {
      errorKey: 'playbooks.importErrors.parseError',
      errorVars: { detail: err instanceof Error ? err.message : String(err) },
    };
  }
}

export function buildUserStepTemplate(step: PlaybookStep): UserSavedStepTemplate {
  // shortcut: saved-step library templates persist in English (DB/export/LLM prompts).
  return {
    id: generateStepTemplateId(),
    name: step.name || 'Custom Step',
    description: step.config?.instruction
      ? step.config.instruction.length > 90
        ? `${step.config.instruction.slice(0, 90)}…`
        : step.config.instruction
      : CORE_STEP_DESCRIPTIONS[step.kind] || 'Custom saved step',
    heading: step.config?.output_heading || step.name || 'Analysis',
    instruction: step.config?.instruction || '',
    tool_policy: (step.config?.tool_policy as 'none' | 'search') || 'none',
    role:
      (step.config?.role as 'research_plan' | 'research_synthesis') ||
      (step.kind === 'plan' ? 'research_plan' : 'research_synthesis'),
    max_queries: step.config?.max_queries ?? 2,
  };
}

export const STEP_TITLE_KEYS: Record<string, TranslationKey> = {
  'Grounding': 'playbooks.steps.grounding',
  'Resolve References': 'playbooks.steps.resolveReferences',
  'Question Planning': 'playbooks.steps.questionPlanning',
  'Multi-query Search': 'playbooks.steps.multiQuerySearch',
  'Round-robin Reading': 'playbooks.steps.roundRobinReading',
  'Claim Verification': 'playbooks.steps.claimVerification',
  'Competitive Landscape': 'playbooks.steps.competitiveLandscape',
  'Synthesis & Verdict': 'playbooks.steps.synthesisVerdict',
  'Report Generation': 'playbooks.steps.reportGeneration',
  'Architecture & Repo Health Planning': 'playbooks.steps.archPlanning',
  'Technical & Ecosystem Search': 'playbooks.steps.techSearch',
  'Documentation & Source Reading': 'playbooks.steps.docReading',
  'Ecosystem & Alternatives Matrix': 'playbooks.steps.ecosystemMatrix',
  'Architecture Assessment & Verdict': 'playbooks.steps.archVerdict',
  'Market & Feature Planning': 'playbooks.steps.marketPlanning',
  'Competitor Intelligence Search': 'playbooks.steps.competitorSearch',
  'Product & Review Deep Dive': 'playbooks.steps.productReview',
  'Competitive Feature & Pricing Matrix': 'playbooks.steps.competitiveMatrix',
  'Competitive Advantage Verdict': 'playbooks.steps.competitiveVerdict',
  'Claim Extraction & Verification Plan': 'playbooks.steps.claimPlan',
  'Authoritative Source Search': 'playbooks.steps.authSearch',
  'Primary Evidence Reading': 'playbooks.steps.primaryEvidence',
  'Claim Verification & Evidence Rating': 'playbooks.steps.claimRating',
  'Factual Accuracy Verdict': 'playbooks.steps.accuracyVerdict',
  'Executive Focus Plan': 'playbooks.steps.execPlan',
  'Rapid Context Search': 'playbooks.steps.rapidSearch',
  'High-Signal Synthesis Reading': 'playbooks.steps.highSignalReading',
  'Executive Synthesis & Action Points': 'playbooks.steps.execVerdict',
};

export function getPlaybookDisplayName(
  pb: Playbook,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
): string {
  if (pb.is_builtin) {
    const key = `playbooks.builtins.${pb.id}.name` as TranslationKey;
    const localized = t(key);
    if (localized && localized !== key) return localized;
  }
  return pb.name;
}

export function getPlaybookDisplayDesc(
  pb: Playbook,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
): string {
  if (pb.is_builtin) {
    const key = `playbooks.builtins.${pb.id}.desc` as TranslationKey;
    const localized = t(key);
    if (localized && localized !== key) return localized;
  }
  return pb.description;
}

export function getPlaybookStepDisplayName(
  step: PlaybookStep,
  _playbookId: number | undefined,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
): string {
  if (step.name && STEP_TITLE_KEYS[step.name]) {
    const localized = t(STEP_TITLE_KEYS[step.name]);
    if (localized && localized !== STEP_TITLE_KEYS[step.name]) return localized;
  }
  return step.name;
}
