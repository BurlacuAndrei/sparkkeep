import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  BookOpen,
  Lock,
  Copy,
  Pencil,
  Trash2,
  Plus,
  ArrowUp,
  ArrowDown,
  Download,
  Upload,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Globe,
  X,
  Layers,
  Activity,
} from 'lucide-react';
import * as api from '../api';
import { Playbook, PlaybookStep, StepLibraryTemplate, CustomStepConfig } from '../types';

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

interface PlaybookManagerProps {
  showToast: (msg: string) => void;
}

const DEFAULT_CARD_TYPES = [
  'tool',
  'product',
  'company',
  'article',
  'idea',
  'repo',
  'paper',
];

const INPUT_BINDING_OPTIONS = [
  { key: 'capture', label: 'Capture Context' },
  { key: 'references', label: 'References' },
  { key: 'sources', label: 'Sources' },
  { key: 'previous_steps', label: 'Previous Steps' },
];

const DEFAULT_LEAN_STARTER_STEPS: PlaybookStep[] = [
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

function getDefaultInputsForStep(step: PlaybookStep): string[] {
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

const CORE_STEP_DESCRIPTIONS: Record<string, string> = {
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

export interface PlaybookRecipe {
  id: string;
  name: string;
  badge: string;
  icon: string;
  description: string;
  card_types: string[];
  steps: Array<{
    position: number;
    kind: string;
    name: string;
    enabled: boolean;
    config?: CustomStepConfig;
  }>;
}

// oxlint-disable-next-line react/only-export-components
export const PLAYBOOK_RECIPES: PlaybookRecipe[] = [
  {
    id: 'competitor',
    name: 'Competitor & Moat Teardown',
    badge: '🎯 Competitor Teardown',
    icon: '🎯',
    description: 'Dissects direct competitors, pricing models, feature parity, and defensibility moats.',
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
    badge: '📈 Investment Due Diligence',
    icon: '📈',
    description: 'Deep-dive into unit economics, downside risks, regulatory exposure, and bear case failure modes.',
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
    badge: '🔬 Academic Review',
    icon: '🔬',
    description: 'Examines paper citations, empirical methodology, statistical validity, and reproducible results.',
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
    badge: '⚡ Fast Fact Check',
    icon: '⚡',
    description: 'Rapid verification of specific claims and statistical assertions without heavy planning.',
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
    badge: '🏛️ Comprehensive Pipeline',
    icon: '🏛️',
    description: 'The complete 8-step investigation covering references, planning, search, reading, claims, and verdict.',
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
    badge: '🎨 Blank Canvas',
    icon: '🎨',
    description: 'Start lean with just Grounding and Report, adding custom analysis steps as needed.',
    card_types: [],
    steps: [
      { position: 1, kind: 'ground', name: 'Grounding', enabled: true, config: {} },
      { position: 2, kind: 'search', name: 'Targeted Search', enabled: true, config: {} },
      { position: 3, kind: 'report', name: 'Final Report', enabled: true, config: {} },
    ],
  },
];

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

interface PromptStarter {
  label: string;
  text: string;
}

const STEP_PROMPT_STARTERS: Record<string, PromptStarter[]> = {
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

const DEFAULT_PROMPT_STARTERS: PromptStarter[] = [
  {
    label: 'Deep Dive Analysis',
    text: 'Conduct an in-depth critical analysis focusing on primary evidence and domain trade-offs.',
  },
  {
    label: 'Key Findings',
    text: 'Synthesize key takeaways, implications, and actionable recommendations.',
  },
];

function generateStepTemplateId(): string {
  return `user_step_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

export const PlaybookManager: React.FC<PlaybookManagerProps> = ({ showToast }) => {
  const [playbooks, setPlaybooks] = useState<Playbook[]>([]);
  const [libraryTemplates, setLibraryTemplates] = useState<StepLibraryTemplate[]>([]);
  const [userStepTemplates, setUserStepTemplates] = useState<UserSavedStepTemplate[]>(() => {
    try {
      const raw = localStorage.getItem('sparkkeep_user_step_library');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(true);
  const [editingPlaybook, setEditingPlaybook] = useState<Playbook | null>(null);
  const [expandedSteps, setExpandedSteps] = useState<Record<number, boolean>>({});
  const [isRecipePickerOpen, setIsRecipePickerOpen] = useState(false);
  const [isAddStepOpen, setIsAddStepOpen] = useState(false);
  const [addStepTab, setAddStepTab] = useState<'library' | 'blank'>('library');
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [defaultPlaybookId, setDefaultPlaybookId] = useState<number | null>(null);
  const [activeCardTypes, setActiveCardTypes] = useState<string[]>(DEFAULT_CARD_TYPES);
  const [isPlatformDefault, setIsPlatformDefault] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importJsonText, setImportJsonText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);

  // Load playbooks & library
  const loadData = useCallback(async () => {
    try {
      const [pbs, lib, st] = await Promise.all([
        api.fetchPlaybooks(),
        api.fetchStepLibrary(),
        api.getSettings(),
      ]);
      setPlaybooks(pbs);
      setLibraryTemplates(lib);
      if (st?.settings?.card_types && Array.isArray(st.settings.card_types) && st.settings.card_types.length > 0) {
        setActiveCardTypes(st.settings.card_types);
      } else {
        setActiveCardTypes(DEFAULT_CARD_TYPES);
      }
      if (st?.settings?.default_playbook_id) {
        setDefaultPlaybookId(st.settings.default_playbook_id);
      }
    } catch (err: unknown) {
      showToast(api.getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const handleDefaultPlaybookChange = async (newId: number) => {
    try {
      await api.patchSettings({ default_playbook_id: newId });
      setDefaultPlaybookId(newId);
      showToast('Default research playbook updated');
    } catch (err: unknown) {
      showToast(api.getErrorMessage(err));
    }
  };

  useEffect(() => {
    let alive = true;
    Promise.all([
      api.fetchPlaybooks(),
      api.fetchStepLibrary(),
      api.getSettings(),
    ])
      .then(([pbs, lib, st]) => {
        if (!alive) return;
        setPlaybooks(pbs);
        setLibraryTemplates(lib);
        if (st?.settings?.card_types && Array.isArray(st.settings.card_types) && st.settings.card_types.length > 0) {
          setActiveCardTypes(st.settings.card_types);
        } else {
          setActiveCardTypes(DEFAULT_CARD_TYPES);
        }
        if (st?.settings?.default_playbook_id) {
          setDefaultPlaybookId(st.settings.default_playbook_id);
        }
      })
      .catch((err: unknown) => {
        if (!alive) return;
        showToast(api.getErrorMessage(err));
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [showToast]);

  // Duplicate a playbook
  const handleDuplicate = async (id: number) => {
    try {
      const dup = await api.duplicatePlaybook(id);
      showToast(`Duplicated playbook: "${dup.name}"`);
      await loadData();
      setEditingPlaybook(dup);
      setIsPlatformDefault(false);
    } catch (err: unknown) {
      showToast(api.getErrorMessage(err));
    }
  };

  // Delete a playbook
  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`Are you sure you want to delete playbook "${name}"?`)) {
      return;
    }
    try {
      await api.deletePlaybook(id);
      showToast(`Deleted playbook "${name}"`);
      await loadData();
    } catch (err: unknown) {
      showToast(api.getErrorMessage(err));
    }
  };

  // Start editing a playbook
  const startEdit = (pb: Playbook) => {
    setEditingPlaybook(JSON.parse(JSON.stringify(pb)));
    setIsPlatformDefault(pb.id > 0 && pb.id === defaultPlaybookId);
    setServerError(null);
    setExpandedSteps({});
  };

  // Open builder canvas directly with default lean starter
  const startCreateNew = () => {
    const newPb: Playbook = {
      id: 0,
      name: 'New Custom Playbook',
      description: '',
      is_builtin: false,
      card_types: [],
      version: 1,
      steps: DEFAULT_LEAN_STARTER_STEPS.map((s, idx) => ({
        ...s,
        position: idx + 1,
        config: { ...s.config },
      })),
    };
    setEditingPlaybook(newPb);
    setIsPlatformDefault(false);
    setServerError(null);
    setExpandedSteps({});
  };

  // Instantiate or load steps into canvas from a selected recipe archetype
  const handleSelectRecipe = (recipe: PlaybookRecipe) => {
    setEditingPlaybook((prev) => ({
      id: prev?.id || 0,
      name: recipe.name,
      description: recipe.description,
      is_builtin: false,
      card_types: [...recipe.card_types],
      version: prev?.version || 1,
      steps: JSON.parse(JSON.stringify(recipe.steps)),
    }));
    setIsRecipePickerOpen(false);
    setServerError(null);
    setExpandedSteps({});
    showToast(`Loaded "${recipe.name}" template`);
  };

  // Validation mirroring server rules
  const validationErrors = useMemo(() => {
    if (!editingPlaybook) return [];
    const errors: string[] = [];

    if (!editingPlaybook.name.trim()) {
      errors.push('Playbook name is required.');
    }
    if (editingPlaybook.steps.length === 0) {
      errors.push('Playbook must contain at least one step.');
    }
    if (editingPlaybook.steps.length > 12) {
      errors.push(`Maximum 12 steps allowed (currently ${editingPlaybook.steps.length}).`);
    }

    let hasSearchOrRefs = false;

    editingPlaybook.steps.forEach((step, idx) => {
      if (step.enabled) {
        if (step.kind === 'read' && !hasSearchOrRefs) {
          errors.push(`Step ${idx + 1} (${step.name}): "Read" requires "Search" or "Resolve References" before it.`);
        }
        if (step.kind === 'search' || step.kind === 'resolve_refs') {
          hasSearchOrRefs = true;
        }
      }

      if ((step.config?.instruction || '').length > 8000) {
        errors.push(`Step ${idx + 1} (${step.name}): Instruction exceeds 8,000 characters limit.`);
      }

      if (step.kind === 'custom') {
        if (!step.config?.output_heading?.trim()) {
          errors.push(`Step ${idx + 1} (${step.name}): Output Heading is required.`);
        }
      }
    });

    return errors;
  }, [editingPlaybook]);

  // 1-Click Auto-Fix Step Inserters for Missing Pillars
  const insertGroundingStep = useCallback(() => {
    if (!editingPlaybook) return;
    const newStep: PlaybookStep = {
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
    };
    const steps = [newStep, ...editingPlaybook.steps];
    steps.forEach((s, i) => (s.position = i + 1));
    setEditingPlaybook({ ...editingPlaybook, steps });
    showToast('Inserted Grounding step');
  }, [editingPlaybook, showToast]);

  const insertSearchStep = useCallback(() => {
    if (!editingPlaybook) return;
    const newStep: PlaybookStep = {
      position: 1,
      kind: 'search',
      name: 'Web Search',
      enabled: true,
      config: {
        output_heading: 'Search Discoveries',
        instruction: 'Execute targeted web queries to locate primary sources and authoritative data.',
        tool_policy: 'search',
        max_queries: 2,
        role: 'research_plan',
        inputs: ['capture'],
      },
    };
    const steps = [...editingPlaybook.steps];
    const groundIdx = steps.findIndex((s) => s.kind === 'ground');
    const insertIdx = groundIdx >= 0 ? groundIdx + 1 : 0;
    steps.splice(insertIdx, 0, newStep);
    steps.forEach((s, i) => (s.position = i + 1));
    setEditingPlaybook({ ...editingPlaybook, steps });
    showToast('Inserted Web Search step');
  }, [editingPlaybook, showToast]);

  const insertReaderStep = useCallback(() => {
    if (!editingPlaybook) return;
    const newStep: PlaybookStep = {
      position: 1,
      kind: 'read',
      name: 'Source Reader',
      enabled: true,
      config: {
        output_heading: 'Extracted Sources',
        instruction: 'Scrape and extract content in round-robin fashion from discovered sources.',
        tool_policy: 'none',
        role: 'research_synthesis',
        inputs: ['capture', 'sources'],
      },
    };
    const steps = [...editingPlaybook.steps];
    let searchIdx = -1;
    for (let i = steps.length - 1; i >= 0; i--) {
      if (
        steps[i].kind === 'search' ||
        steps[i].kind === 'resolve_refs' ||
        (steps[i].kind === 'custom' && steps[i].config?.tool_policy === 'search')
      ) {
        searchIdx = i;
        break;
      }
    }
    const groundIdx = steps.findIndex((s) => s.kind === 'ground');
    const insertIdx =
      searchIdx >= 0 ? searchIdx + 1 : groundIdx >= 0 ? groundIdx + 1 : steps.length;
    steps.splice(insertIdx, 0, newStep);
    steps.forEach((s, i) => (s.position = i + 1));
    setEditingPlaybook({ ...editingPlaybook, steps });
    showToast('Inserted Source Reader step');
  }, [editingPlaybook, showToast]);

  const insertVerificationStep = useCallback(() => {
    if (!editingPlaybook) return;
    const newStep: PlaybookStep = {
      position: 1,
      kind: 'verify_claims',
      name: 'Claims Verification',
      enabled: true,
      config: {
        output_heading: 'Claim Verification',
        instruction: 'Cross-check core claims against extracted sources with citations.',
        tool_policy: 'none',
        role: 'research_synthesis',
        inputs: ['capture', 'sources', 'previous_steps'],
      },
    };
    const steps = [...editingPlaybook.steps];
    const endIdx = steps.findIndex((s) => s.kind === 'verdict' || s.kind === 'report');
    const insertIdx = endIdx >= 0 ? endIdx : steps.length;
    steps.splice(insertIdx, 0, newStep);
    steps.forEach((s, i) => (s.position = i + 1));
    setEditingPlaybook({ ...editingPlaybook, steps });
    showToast('Inserted Claims Verification step');
  }, [editingPlaybook, showToast]);

  const insertReportStep = useCallback(() => {
    if (!editingPlaybook) return;
    const newStep: PlaybookStep = {
      position: editingPlaybook.steps.length + 1,
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
    };
    const steps = [...editingPlaybook.steps, newStep];
    steps.forEach((s, i) => (s.position = i + 1));
    setEditingPlaybook({ ...editingPlaybook, steps });
    showToast('Inserted Briefing Report step');
  }, [editingPlaybook, showToast]);

  // Active (enabled) steps for analysis and inspector
  const activeSteps = useMemo(() => {
    return (editingPlaybook?.steps || []).filter((s) => s.enabled);
  }, [editingPlaybook?.steps]);

  const hasGrounding = useMemo(() => {
    return activeSteps.some((s) => {
      if (s.kind === 'ground') return true;
      if (s.kind === 'custom') {
        const inputs = s.config?.inputs;
        return Array.isArray(inputs) && inputs.includes('capture') && !inputs.includes('previous_steps');
      }
      return false;
    });
  }, [activeSteps]);

  const hasRetrieval = useMemo(() => {
    return activeSteps.some((s) => {
      if (s.kind === 'search' || s.kind === 'resolve_refs') return true;
      if (s.kind === 'custom' && s.config?.tool_policy === 'search') return true;
      return false;
    });
  }, [activeSteps]);

  const hasExtraction = useMemo(() => {
    return activeSteps.some((s) => s.kind === 'read');
  }, [activeSteps]);

  const hasVerification = useMemo(() => {
    return activeSteps.some((s) => s.kind === 'verify_claims');
  }, [activeSteps]);

  const hasDelivery = useMemo(() => {
    return activeSteps.some((s) => s.kind === 'report' || s.kind === 'verdict');
  }, [activeSteps]);

  const pillars: PillarHealth[] = useMemo(
    () => [
      {
        id: 'grounding',
        name: 'Grounding',
        ready: hasGrounding,
        hint: hasGrounding ? 'Card context & note memory anchored' : 'Context not anchored',
      },
      {
        id: 'retrieval',
        name: 'Retrieval',
        ready: hasRetrieval,
        hint: hasRetrieval ? 'Active external search / refs' : 'Hallucination risk: no search',
      },
      {
        id: 'extraction',
        name: 'Extraction',
        ready: hasExtraction,
        hint: hasExtraction ? 'Deep source reader enabled' : 'Unextracted sources',
      },
      {
        id: 'verification',
        name: 'Verification',
        ready: hasVerification,
        hint: hasVerification ? 'Cross-checked citations' : 'Unverified claims',
      },
      {
        id: 'delivery',
        name: 'Delivery',
        ready: hasDelivery,
        hint: hasDelivery ? 'Synthesized briefing / verdict' : 'Fallback synthesizer active',
      },
    ],
    [hasGrounding, hasRetrieval, hasExtraction, hasVerification, hasDelivery]
  );

  const readyPillarsCount = useMemo(() => {
    return pillars.filter((p) => p.ready).length;
  }, [pillars]);

  // Soft Linter Advisory Notices with 1-Click Auto-Fix
  const advisories: SoftLinterAdvisory[] = useMemo(() => {
    if (!editingPlaybook) return [];
    const list: SoftLinterAdvisory[] = [];

    if (!hasGrounding) {
      list.push({
        id: 'grounding_missing',
        pillarId: 'grounding',
        title: 'Context Not Anchored',
        description: 'Context not anchored: Research run will lack card context, note body, and source URL metadata.',
        actionLabel: '+ Insert Grounding',
        onFix: insertGroundingStep,
      });
    }

    if (!hasRetrieval) {
      list.push({
        id: 'retrieval_missing',
        pillarId: 'retrieval',
        title: 'Hallucination Risk',
        description: 'Hallucination risk: No search or live retrieval configured to fetch external facts.',
        actionLabel: '+ Insert Web Search',
        onFix: insertSearchStep,
      });
    }

    if (!hasExtraction) {
      list.push({
        id: 'extraction_missing',
        pillarId: 'extraction',
        title: 'Unextracted Sources',
        description: 'Unextracted sources: Discovered web links will not be scraped or read into source context.',
        actionLabel: '+ Insert Source Reader',
        onFix: insertReaderStep,
      });
    }

    if (!hasVerification) {
      list.push({
        id: 'verification_missing',
        pillarId: 'verification',
        title: 'Unverified Claims',
        description: 'Unverified claims: Findings will not be cross-verified against source citations for factual rigor.',
        actionLabel: '+ Insert Claims Verification',
        onFix: insertVerificationStep,
      });
    }

    if (!hasDelivery) {
      list.push({
        id: 'delivery_missing',
        pillarId: 'delivery',
        title: 'No Delivery Step',
        description: 'Notice: Fallback Report Synthesizer will compile final outputs if omitted.',
        actionLabel: '+ Insert Briefing Report',
        onFix: insertReportStep,
      });
    }

    return list;
  }, [
    editingPlaybook,
    hasGrounding,
    hasRetrieval,
    hasExtraction,
    hasVerification,
    hasDelivery,
    insertGroundingStep,
    insertSearchStep,
    insertReaderStep,
    insertVerificationStep,
    insertReportStep,
  ]);

  // Dynamic Resource & Cost Estimator
  const estimates = useMemo(() => {
    if (!editingPlaybook) {
      return {
        llmCalls: 0,
        fetches: 0,
        tokenRange: '0 tokens',
        latency: '0s',
      };
    }
    if (activeSteps.length === 0) {
      return {
        llmCalls: 0,
        fetches: 0,
        tokenRange: '0 tokens',
        latency: '0s',
      };
    }

    let llm = 0;
    let fetches = 0;
    let minTokens = 600;
    let maxTokens = 1200;
    let minSec = 0;
    let maxSec = 0;

    activeSteps.forEach((st) => {
      switch (st.kind) {
        case 'ground':
          minTokens += 200;
          maxTokens += 500;
          break;
        case 'resolve_refs':
          fetches += 2;
          minTokens += 300;
          maxTokens += 800;
          minSec += 2;
          maxSec += 4;
          break;
        case 'plan':
          llm += 1;
          minTokens += 500;
          maxTokens += 1200;
          minSec += 3;
          maxSec += 6;
          break;
        case 'search': {
          const q = st.config?.max_queries ?? 2;
          fetches += q * 3;
          minTokens += 400;
          maxTokens += 900;
          minSec += 3;
          maxSec += 6;
          break;
        }
        case 'read':
          fetches += 5;
          minTokens += 1000;
          maxTokens += 2200;
          minSec += 4;
          maxSec += 8;
          break;
        case 'verify_claims':
          llm += 1;
          minTokens += 600;
          maxTokens += 1500;
          minSec += 4;
          maxSec += 7;
          break;
        case 'landscape':
          llm += 1;
          minTokens += 600;
          maxTokens += 1400;
          minSec += 3;
          maxSec += 6;
          break;
        case 'verdict':
          llm += 1;
          minTokens += 500;
          maxTokens += 1200;
          minSec += 3;
          maxSec += 6;
          break;
        case 'report':
          llm += 1;
          minTokens += 800;
          maxTokens += 2000;
          minSec += 4;
          maxSec += 8;
          break;
        case 'custom': {
          llm += 1;
          const isSearch = st.config?.tool_policy === 'search';
          if (isSearch) {
            const q = st.config?.max_queries ?? 2;
            fetches += q;
            minTokens += 800;
            maxTokens += 2000;
            minSec += 5;
            maxSec += 9;
          } else {
            minTokens += 500;
            maxTokens += 1400;
            minSec += 3;
            maxSec += 6;
          }
          break;
        }
      }
    });

    maxSec += 2;

    const formatK = (n: number) => {
      return `${(n / 1000).toFixed(1)}k`;
    };

    return {
      llmCalls: llm,
      fetches,
      tokenRange: `~${formatK(minTokens)}–${formatK(maxTokens)} tokens`,
      latency: `~${minSec}–${maxSec}s`,
    };
  }, [editingPlaybook, activeSteps]);

  // Reorder step
  const moveStep = (fromIdx: number, toIdx: number) => {
    if (!editingPlaybook) return;
    if (toIdx < 0 || toIdx >= editingPlaybook.steps.length) return;
    const steps = [...editingPlaybook.steps];
    const [moved] = steps.splice(fromIdx, 1);
    steps.splice(toIdx, 0, moved);
    steps.forEach((s, i) => (s.position = i + 1));
    setEditingPlaybook({ ...editingPlaybook, steps });
  };

  // Toggle step enabled
  const toggleStep = (idx: number) => {
    if (!editingPlaybook) return;
    const steps = [...editingPlaybook.steps];
    steps[idx] = { ...steps[idx], enabled: !steps[idx].enabled };
    setEditingPlaybook({ ...editingPlaybook, steps });
  };

  // Remove step
  const removeStep = (idx: number) => {
    if (!editingPlaybook) return;
    const steps = editingPlaybook.steps.filter((_, i) => i !== idx);
    steps.forEach((s, i) => (s.position = i + 1));
    setEditingPlaybook({ ...editingPlaybook, steps });
  };

  // Update step config
  const updateStepConfig = (idx: number, patch: Partial<CustomStepConfig>, newName?: string) => {
    if (!editingPlaybook) return;
    const steps = [...editingPlaybook.steps];
    const step = { ...steps[idx] };
    if (newName !== undefined) step.name = newName;
    step.config = { ...(step.config || {}), ...patch };
    steps[idx] = step;
    setEditingPlaybook({ ...editingPlaybook, steps });
  };

  // Add library template step
  const addLibraryStep = (tpl: StepLibraryTemplate | UserSavedStepTemplate) => {
    if (!editingPlaybook) return;
    const newStep: PlaybookStep = {
      position: editingPlaybook.steps.length + 1,
      kind: 'custom',
      name: tpl.name,
      enabled: true,
      config: {
        output_heading: tpl.heading,
        instruction: tpl.instruction,
        tool_policy: tpl.tool_policy,
        role: tpl.role,
        inputs: ('inputs' in tpl && tpl.inputs) ? tpl.inputs : ['capture', 'sources', 'previous_steps'],
        max_queries: tpl.max_queries || 2,
      },
    };
    // Insert before verdict/report if present, else append
    const steps = [...editingPlaybook.steps];
    const insertIdx = steps.findIndex((s) => s.kind === 'verdict' || s.kind === 'report');
    if (insertIdx >= 0) {
      steps.splice(insertIdx, 0, newStep);
    } else {
      steps.push(newStep);
    }
    steps.forEach((s, i) => (s.position = i + 1));
    setEditingPlaybook({ ...editingPlaybook, steps });
    setIsAddStepOpen(false);
    showToast(`Added step "${tpl.name}" from library`);
  };

  // Save step to local library
  const handleSaveStepToLibrary = (step: PlaybookStep) => {
    try {
      const raw = localStorage.getItem('sparkkeep_user_step_library');
      const currentList: UserSavedStepTemplate[] = raw ? JSON.parse(raw) : [];
      const newTemplate: UserSavedStepTemplate = {
        id: generateStepTemplateId(),
        name: step.name || 'Custom Step',
        description: step.config?.instruction
          ? (step.config.instruction.length > 90 ? `${step.config.instruction.slice(0, 90)}…` : step.config.instruction)
          : (CORE_STEP_DESCRIPTIONS[step.kind] || 'Custom saved step'),
        heading: step.config?.output_heading || step.name || 'Analysis',
        instruction: step.config?.instruction || '',
        tool_policy: (step.config?.tool_policy as 'none' | 'search') || 'none',
        role: (step.config?.role as 'research_plan' | 'research_synthesis') || (step.kind === 'plan' ? 'research_plan' : 'research_synthesis'),
        max_queries: step.config?.max_queries ?? 2,
      };
      const updated = [...currentList, newTemplate];
      localStorage.setItem('sparkkeep_user_step_library', JSON.stringify(updated));
      setUserStepTemplates(updated);
      showToast(`Saved "${newTemplate.name}" to step library`);
    } catch (err: unknown) {
      showToast(api.getErrorMessage(err));
    }
  };

  const handleOpenAddStepModal = () => {
    try {
      const raw = localStorage.getItem('sparkkeep_user_step_library');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setUserStepTemplates(parsed);
        }
      } else {
        setUserStepTemplates([]);
      }
    } catch {
      setUserStepTemplates([]);
    }
    setIsAddStepOpen(true);
  };

  // Add blank custom step
  const addBlankCustomStep = () => {
    if (!editingPlaybook) return;
    const newStep: PlaybookStep = {
      position: editingPlaybook.steps.length + 1,
      kind: 'custom',
      name: 'Custom Analysis',
      enabled: true,
      config: {
        output_heading: 'Custom Analysis',
        instruction: 'Analyze the card context and extracted sources.',
        tool_policy: 'none',
        role: 'research_synthesis',
        inputs: ['capture', 'sources', 'previous_steps'],
        max_queries: 2,
      },
    };
    const steps = [...editingPlaybook.steps];
    const insertIdx = steps.findIndex((s) => s.kind === 'verdict' || s.kind === 'report');
    if (insertIdx >= 0) {
      steps.splice(insertIdx, 0, newStep);
    } else {
      steps.push(newStep);
    }
    steps.forEach((s, i) => (s.position = i + 1));
    setEditingPlaybook({ ...editingPlaybook, steps });
    setIsAddStepOpen(false);
  };

  // Export playbook JSON
  const handleExportJSON = () => {
    if (!editingPlaybook) return;
    const exportData = {
      name: editingPlaybook.name,
      description: editingPlaybook.description,
      card_types: editingPlaybook.card_types || [],
      version: editingPlaybook.version || 1,
      steps: (editingPlaybook.steps || []).map((s, idx) => ({
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
        const sanitized = (editingPlaybook.name || 'playbook')
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

    showToast('Playbook JSON exported');
  };

  // Import playbook JSON
  const handleApplyImport = () => {
    setImportError(null);
    if (!importJsonText.trim()) {
      setImportError('Please paste valid JSON.');
      return;
    }
    try {
      const parsed = JSON.parse(importJsonText);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setImportError('Invalid JSON structure: expected an object.');
        return;
      }
      if (!parsed.name || typeof parsed.name !== 'string' || !parsed.name.trim()) {
        setImportError('Playbook name is required in JSON.');
        return;
      }
      if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
        setImportError('Playbook must contain a non-empty "steps" array.');
        return;
      }

      const normalizedSteps: PlaybookStep[] = parsed.steps.map((st: any, idx: number) => ({
        id: st.id,
        position: idx + 1,
        kind: typeof st.kind === 'string' && st.kind.trim() ? st.kind : 'custom',
        name: typeof st.name === 'string' && st.name.trim() ? st.name : `Step ${idx + 1}`,
        enabled: st.enabled !== false,
        config: typeof st.config === 'object' && st.config !== null ? st.config : {},
      }));

      setEditingPlaybook((prev) => ({
        id: prev?.id || 0,
        name: parsed.name.trim(),
        description: typeof parsed.description === 'string' ? parsed.description : '',
        is_builtin: false,
        card_types: Array.isArray(parsed.card_types) ? parsed.card_types : [],
        version: typeof parsed.version === 'number' ? parsed.version : 1,
        steps: normalizedSteps,
      }));

      setIsImportModalOpen(false);
      setImportJsonText('');
      showToast(`Successfully imported "${parsed.name.trim()}"`);
    } catch (err: unknown) {
      setImportError(`JSON parse error: ${api.getErrorMessage(err)}`);
    }
  };

  // Save playbook
  const handleSave = async () => {
    if (!editingPlaybook) return;
    if (validationErrors.length > 0) {
      setServerError(validationErrors[0]);
      return;
    }
    setSaving(true);
    setServerError(null);
    try {
      let savedPlaybook: Playbook;
      if (editingPlaybook.id > 0) {
        savedPlaybook = await api.updatePlaybook(editingPlaybook.id, editingPlaybook);
        showToast(`Saved playbook "${savedPlaybook.name}"`);
      } else {
        savedPlaybook = await api.createPlaybook(editingPlaybook);
        showToast(`Created playbook "${savedPlaybook.name}"`);
      }

      const targetId = editingPlaybook.id > 0 ? editingPlaybook.id : savedPlaybook.id;
      if (isPlatformDefault) {
        await api.patchSettings({ default_playbook_id: targetId });
        setDefaultPlaybookId(targetId);
      }

      setEditingPlaybook(null);
      await loadData();
    } catch (err: unknown) {
      const msg = api.getErrorMessage(err);
      setServerError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="playbook-manager">
      {/* HEADER / NAVIGATION */}
      {!editingPlaybook ? (
        <div className="pb-header-row">
          <div>
            <h3 className="pb-title">
              <BookOpen size={18} className="pb-title-icon" />
              Research Playbooks
            </h3>
            <p className="pb-subtitle">
              Customize step sequences, tune research angles, and plug in curated library analyses.
            </p>
          </div>
          <button type="button" className="btn-primary" onClick={startCreateNew}>
            <Plus size={14} />
            <span>New Playbook</span>
          </button>
        </div>
      ) : (
        <div className="pb-header-row">
          <div>
            <h3 className="pb-title">
              <Pencil size={18} className="pb-title-icon" />
              {editingPlaybook.id > 0 ? `Edit: ${editingPlaybook.name}` : 'New Playbook'}
            </h3>
            <p className="pb-subtitle">
              Configure metadata, reorder pipeline steps, or add custom prompt modules.
            </p>
          </div>
          <div className="pb-actions-group">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setIsRecipePickerOpen(true)}
              title="Load steps from an archetype recipe or built-in playbook"
            >
              <Layers size={14} />
              <span>Load Template</span>
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleExportJSON}
              title="Export playbook as JSON file or copy to clipboard"
            >
              <Download size={14} />
              <span>Export JSON</span>
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setImportError(null);
                setImportJsonText('');
                setIsImportModalOpen(true);
              }}
              title="Import playbook from JSON"
            >
              <Upload size={14} />
              <span>Import JSON</span>
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setEditingPlaybook(null);
                setServerError(null);
              }}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSave}
              disabled={saving || validationErrors.length > 0}
            >
              <CheckCircle2 size={14} />
              <span>{saving ? 'Saving…' : 'Save Playbook'}</span>
            </button>
          </div>
        </div>
      )}

      {/* ERROR NOTICE */}
      {serverError && (
        <div className="pb-error-banner">
          <AlertCircle size={16} />
          <span>{serverError}</span>
        </div>
      )}

      {/* LIST VIEW */}
      {!editingPlaybook && (
        <div className="pb-list-container">
          {loading ? (
            <div className="pb-empty-state">Loading playbooks…</div>
          ) : playbooks.length === 0 ? (
            <div className="pb-empty-state">No playbooks found.</div>
          ) : (
            <>
              {/* Default Playbook Selector Setting */}
              <div className="pb-default-selector-card">
                <div className="pb-default-info">
                  <span className="pb-default-label">Default Playbook for Untyped Cards</span>
                  <span className="pb-default-sub">
                    Runs automatically when researching cards without a type-specific playbook.
                  </span>
                </div>
                <select
                  className="input-select pb-default-dropdown"
                  value={defaultPlaybookId || 1}
                  onChange={(e) => handleDefaultPlaybookChange(parseInt(e.target.value, 10))}
                >
                  {playbooks.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.is_builtin ? '(Built-in)' : '(Custom)'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Built-ins */}
              <div className="pb-section-header">Built-in Playbooks (Read-Only)</div>
              <div className="pb-cards-grid">
                {playbooks
                  .filter((p) => p.is_builtin)
                  .map((p) => (
                    <div key={p.id} className="pb-card builtin">
                      <div className="pb-card-top">
                        <div className="pb-card-badge">
                          <Lock size={12} />
                          <span>Built-in</span>
                        </div>
                        <span className="pb-card-steps">{p.steps?.length || 0} steps</span>
                      </div>
                      <h4 className="pb-card-name">{p.name}</h4>
                      <p className="pb-card-desc">{p.description || 'Standard deep research pipeline.'}</p>
                      <div className="pb-card-footer">
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => handleDuplicate(p.id)}
                          title="Duplicate to edit"
                        >
                          <Copy size={12} />
                          <span>Duplicate</span>
                        </button>
                      </div>
                    </div>
                  ))}
              </div>

              {/* Custom / User Playbooks */}
              <div className="pb-section-header" style={{ marginTop: 24 }}>
                Custom Playbooks
              </div>
              <div className="pb-cards-grid">
                {playbooks.filter((p) => !p.is_builtin).length === 0 ? (
                  <div className="pb-empty-placeholder">
                    No custom playbooks yet. Duplicate a built-in or click "New Playbook" to start customizing!
                  </div>
                ) : (
                  playbooks
                    .filter((p) => !p.is_builtin)
                    .map((p) => (
                      <div key={p.id} className="pb-card custom">
                        <div className="pb-card-top">
                          <div className="pb-card-badge custom">
                            <Sparkles size={12} />
                            <span>Custom</span>
                          </div>
                          <span className="pb-card-steps">{p.steps?.length || 0} steps</span>
                        </div>
                        <h4 className="pb-card-name">{p.name}</h4>
                        <p className="pb-card-desc">{p.description || 'Custom research workflow'}</p>
                        <div className="pb-card-footer">
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => startEdit(p)}
                          >
                            <Pencil size={12} />
                            <span>Edit</span>
                          </button>
                          <button
                            type="button"
                            className="btn-secondary btn-sm"
                            onClick={() => handleDuplicate(p.id)}
                            title="Duplicate"
                          >
                            <Copy size={12} />
                          </button>
                          <button
                            type="button"
                            className="btn-secondary btn-sm btn-danger"
                            onClick={() => handleDelete(p.id, p.name)}
                            title="Delete"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* EDITOR VIEW */}
      {editingPlaybook && (
        <div className="pb-editor-container">
          {/* Top Form Fields */}
          <div className="pb-meta-grid">
            <div className="pb-form-field">
              <label htmlFor="pb-name-input">Playbook Name</label>
              <input
                id="pb-name-input"
                type="text"
                className="input-text"
                aria-label="Playbook Name"
                placeholder="e.g. Monetization & Feasibility Deep Dive"
                value={editingPlaybook.name}
                onChange={(e) => setEditingPlaybook({ ...editingPlaybook, name: e.target.value })}
              />
            </div>
            <div className="pb-form-field">
              <label htmlFor="pb-desc-input">Description</label>
              <input
                id="pb-desc-input"
                type="text"
                className="input-text"
                aria-label="Description"
                placeholder="Brief summary of what this research pipeline focuses on"
                value={editingPlaybook.description}
                onChange={(e) => setEditingPlaybook({ ...editingPlaybook, description: e.target.value })}
              />
            </div>
          </div>

          {/* Applicable Card Types */}
          <div className="pb-form-field" style={{ marginTop: 12 }}>
            <label>Applicable Card Types (Auto-select hints)</label>
            <div className="pb-card-types-chips">
              {activeCardTypes.map((type) => {
                const active = (editingPlaybook.card_types || []).includes(type);
                return (
                  <button
                    key={type}
                    type="button"
                    className={`pb-type-chip ${active ? 'active' : ''}`}
                    aria-pressed={active}
                    onClick={() => {
                      const cur = editingPlaybook.card_types || [];
                      const next = active ? cur.filter((t) => t !== type) : [...cur, type];
                      setEditingPlaybook({ ...editingPlaybook, card_types: next });
                    }}
                  >
                    <span>{type}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Platform Default Toggle & Badge */}
          <div className="pb-platform-default-row" style={{ marginTop: 12 }}>
            <label className="pb-platform-default-label">
              <input
                type="checkbox"
                aria-label="Set as Platform Default"
                checked={isPlatformDefault}
                onChange={(e) => setIsPlatformDefault(e.target.checked)}
              />
              <span>Set as Platform Default</span>
            </label>
            {isPlatformDefault && (
              <span className="pb-platform-default-badge">
                ★ Platform Default
              </span>
            )}
          </div>

          {/* DUAL-PANE BUILDER CANVAS */}
          <div className="pb-builder-dual-pane">
            {/* LEFT PANE: Pipeline Sequencer */}
            <div className="pb-sequencer-pane">
              {/* Validation Warnings */}
              {validationErrors.length > 0 && (
                <div className="pb-validation-box">
                  <div className="pb-validation-title">
                    <AlertCircle size={15} />
                    <span>Validation Checklist ({validationErrors.length})</span>
                  </div>
                  <ul className="pb-validation-list">
                    {validationErrors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Steps List */}
              <div className="pb-steps-header">
                <div className="pb-steps-title">
                  <Layers size={16} />
                  <span>Pipeline Steps ({editingPlaybook.steps.length} / 12)</span>
            </div>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={handleOpenAddStepModal}
              disabled={editingPlaybook.steps.length >= 12}
            >
              <Plus size={13} />
              <span>Add Step</span>
            </button>
          </div>

          <div className="pb-steps-list">
            {editingPlaybook.steps.map((step, idx) => {
              const isCustom = step.kind === 'custom';
              const isExpanded = !!expandedSteps[idx];

              return (
                <div key={idx} className={`pb-step-row ${!step.enabled ? 'disabled' : ''}`}>
                  <div className="pb-step-main">
                    {/* Position & Reorder */}
                    <div className="pb-step-reorder">
                      <button
                        type="button"
                        className="btn-icon"
                        disabled={idx === 0}
                        onClick={() => moveStep(idx, idx - 1)}
                        title="Move Up"
                        aria-label={`Move ${step.name} up`}
                      >
                        <ArrowUp size={12} />
                      </button>
                      <span className="pb-step-pos">{idx + 1}</span>
                      <button
                        type="button"
                        className="btn-icon"
                        disabled={idx === editingPlaybook.steps.length - 1}
                        onClick={() => moveStep(idx, idx + 1)}
                        title="Move Down"
                        aria-label={`Move ${step.name} down`}
                      >
                        <ArrowDown size={12} />
                      </button>
                    </div>

                    {/* Enable toggle */}
                    <label className="pb-toggle" title="Toggle step enabled">
                      <input
                        type="checkbox"
                        checked={step.enabled}
                        onChange={() => toggleStep(idx)}
                      />
                      <span className="pb-slider" />
                    </label>

                    {/* Step Title & Kind */}
                    <div className="pb-step-info">
                      <div className="pb-step-line">
                        <strong className="pb-step-name">{step.name}</strong>
                        <span className={`pb-kind-badge ${step.kind}`}>{step.kind}</span>
                        {isCustom && step.config?.tool_policy === 'search' && (
                          <span className="pb-tool-badge" title="Web search enabled">
                            <Globe size={11} />
                            Search
                          </span>
                        )}
                      </div>
                      <p className="pb-step-desc">
                        {step.config?.instruction
                          ? step.config.instruction.slice(0, 90) + (step.config.instruction.length > 90 ? '…' : '')
                          : CORE_STEP_DESCRIPTIONS[step.kind] || ''}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="pb-step-actions">
                      <button
                        type="button"
                        className="btn-icon"
                        onClick={() =>
                          setExpandedSteps({
                            ...expandedSteps,
                            [idx]: !isExpanded,
                          })
                        }
                        title={isExpanded ? 'Collapse config' : 'Edit config'}
                        aria-label={isExpanded ? `Collapse ${step.name} config` : `Edit ${step.name} config`}
                      >
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                      <button
                        type="button"
                        className="btn-icon btn-danger"
                        onClick={() => removeStep(idx)}
                        title="Delete step"
                        aria-label={`Delete ${step.name}`}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Expanded Step Configuration Drawer */}
                  {isExpanded && (
                    <div className="pb-custom-config-drawer">
                      <div className="pb-cfg-row">
                        <div className="pb-form-field">
                          <label>Step Display Name</label>
                          <input
                            type="text"
                            className="input-text"
                            aria-label="Step Display Name"
                            value={step.name}
                            onChange={(e) => updateStepConfig(idx, {}, e.target.value)}
                          />
                        </div>
                        <div className="pb-form-field">
                          <label>Report Section Heading</label>
                          <input
                            type="text"
                            className="input-text"
                            aria-label="Report Section Heading"
                            placeholder={step.kind === 'custom' ? 'e.g. Monetization Angle' : (step.name || 'Section Heading')}
                            value={step.config?.output_heading || ''}
                            onChange={(e) =>
                              updateStepConfig(idx, { output_heading: e.target.value })
                            }
                          />
                        </div>
                      </div>

                      <div className="pb-form-field" style={{ marginTop: 10 }}>
                        <div className="pb-label-with-count">
                          <label>Instruction / Prompt</label>
                          <span
                            className={`pb-char-counter ${
                              (step.config?.instruction || '').length > 8000 ? 'overflow' : ''
                            }`}
                          >
                            {(step.config?.instruction || '').length} / 8,000
                          </span>
                        </div>

                        {/* Quick Prompt Starters */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>Prompt Starters:</span>
                          {(STEP_PROMPT_STARTERS[step.kind] || DEFAULT_PROMPT_STARTERS).map((snip) => (
                            <button
                              key={snip.label}
                              type="button"
                              className="btn-secondary"
                              style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: 12 }}
                              onClick={() => {
                                const current = step.config?.instruction || '';
                                const next = current ? `${current}\n\n${snip.text}` : snip.text;
                                updateStepConfig(idx, { instruction: next.slice(0, 8000) });
                              }}
                            >
                              + {snip.label}
                            </button>
                          ))}
                        </div>

                        <textarea
                          className="input-textarea"
                          rows={3}
                          aria-label="Instruction / Prompt"
                          placeholder="Prompt instructions for this step…"
                          value={step.config?.instruction || ''}
                          onChange={(e) =>
                            updateStepConfig(idx, { instruction: e.target.value })
                          }
                        />
                      </div>

                      {/* Tool Policy, Max Queries, LLM Role */}
                      <div className="pb-cfg-row" style={{ marginTop: 10 }}>
                        <div className="pb-form-field">
                          <label>Tool Policy</label>
                          <select
                            className="input-select"
                            aria-label="Tool Policy"
                            value={step.config?.tool_policy || (step.kind === 'search' ? 'search' : 'none')}
                            onChange={(e) =>
                              updateStepConfig(idx, {
                                tool_policy: e.target.value as 'none' | 'search',
                              })
                            }
                          >
                            <option value="none">None (Reason over existing sources only)</option>
                            <option value="search">Search (Execute live web queries)</option>
                          </select>
                        </div>

                        {(step.config?.tool_policy === 'search' || (!step.config?.tool_policy && step.kind === 'search')) && (
                          <div className="pb-form-field">
                            <label>Max Search Queries (1–5)</label>
                            <input
                              type="number"
                              className="input-text"
                              aria-label="Max Search Queries"
                              min={1}
                              max={5}
                              value={step.config?.max_queries ?? 2}
                              onChange={(e) =>
                                updateStepConfig(idx, {
                                  max_queries: Math.min(5, Math.max(1, parseInt(e.target.value, 10) || 1)),
                                })
                              }
                            />
                          </div>
                        )}

                        <div className="pb-form-field">
                          <label>LLM Role</label>
                          <select
                            className="input-select"
                            aria-label="LLM Role"
                            value={step.config?.role || (step.kind === 'plan' ? 'research_plan' : 'research_synthesis')}
                            onChange={(e) =>
                              updateStepConfig(idx, {
                                role: e.target.value as 'research_plan' | 'research_synthesis',
                              })
                            }
                          >
                            <option value="research_synthesis">Synthesis & Reasoning (Strong model)</option>
                            <option value="research_plan">Planning & Fast (Cheaper model)</option>
                          </select>
                        </div>
                      </div>

                      {/* Input Bindings Checkboxes */}
                      <div className="pb-form-field" style={{ marginTop: 10 }}>
                        <label>Input Bindings</label>
                        <div className="pb-input-bindings">
                          {INPUT_BINDING_OPTIONS.map(({ key, label }) => {
                            const activeInputs = getDefaultInputsForStep(step);
                            const checked = activeInputs.includes(key);
                            return (
                              <label key={key} className="pb-binding-checkbox">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  aria-label={`Input binding ${key}`}
                                  onChange={() => {
                                    const next = checked
                                      ? activeInputs.filter((k) => k !== key)
                                      : [...activeInputs, key];
                                    updateStepConfig(idx, { inputs: next });
                                  }}
                                />
                                <span>{label}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>

                      {/* Drawer Footer: Save Step to Library */}
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-subtle)' }}>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => handleSaveStepToLibrary(step)}
                          title="Save this step configuration to your custom template library"
                        >
                          <Sparkles size={13} />
                          <span>Save to Library</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT PANE: Persistent Research Health Inspector Dock */}
        <aside className="pb-inspector-dock" aria-label="Research Health Inspector">
          <div className="pb-inspector-header">
            <div className="pb-inspector-title">
              <Activity size={16} className="pb-inspector-icon" />
              <span>Research Health Inspector</span>
            </div>
            <span
              className={`pb-health-score-badge ${readyPillarsCount === 5 ? 'ready' : 'incomplete'}`}
              data-testid="health-score-badge"
            >
              {readyPillarsCount === 5 ? '5 / 5 Pillars Ready' : `${readyPillarsCount} / 5 Incomplete`}
            </span>
          </div>

          {/* 5-Pillar Research Model Checklist */}
          <div className="pb-pillars-list" aria-label="5-Pillar Research Model">
            {pillars.map((p) => (
              <div key={p.id} className={`pb-pillar-item ${p.ready ? 'ready' : 'missing'}`}>
                <div className="pb-pillar-status">
                  {p.ready ? (
                    <CheckCircle2 size={14} className="pb-pillar-icon ready" />
                  ) : (
                    <AlertCircle size={14} className="pb-pillar-icon missing" />
                  )}
                  <span className="pb-pillar-name">{p.name}</span>
                </div>
                <span className="pb-pillar-tag">{p.ready ? 'Ready' : 'Missing'}</span>
              </div>
            ))}
          </div>

          {/* Health Linter Advisories */}
          <div className="pb-inspector-section">
            <div className="pb-inspector-section-title">
              <AlertCircle size={13} className="pb-section-icon" />
              <span>Health Linter Advisories</span>
            </div>

            {advisories.length === 0 ? (
              <div className="pb-linter-clean">
                <CheckCircle2 size={15} className="pb-clean-icon" />
                <span>All 5 research pillars ready. Rigorous, hallucination-resistant methodology verified.</span>
              </div>
            ) : (
              <div className="pb-advisories-list">
                {advisories.map((adv) => (
                  <div key={adv.id} className="pb-advisory-card">
                    <div className="pb-adv-header">
                      <span className="pb-adv-title">{adv.title}</span>
                    </div>
                    <p className="pb-adv-desc">{adv.description}</p>
                    <button
                      type="button"
                      className="btn-secondary btn-sm pb-adv-action"
                      onClick={adv.onFix}
                    >
                      <Plus size={12} />
                      <span>{adv.actionLabel}</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Dynamic Resource & Cost Estimator */}
          <div className="pb-inspector-section">
            <div className="pb-inspector-section-title">
              <Sparkles size={13} className="pb-section-icon" />
              <span>Dynamic Cost & Resource Estimator</span>
            </div>
            <div className="pb-cost-grid">
              <div className="pb-cost-card">
                <span className="pb-cost-label">
                  <Sparkles size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                  LLM Calls
                </span>
                <span className="pb-cost-val" data-testid="est-llm-calls">≈ {estimates.llmCalls}</span>
              </div>
              <div className="pb-cost-card">
                <span className="pb-cost-label">
                  <Globe size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                  Web Fetches
                </span>
                <span className="pb-cost-val" data-testid="est-fetches">≈ {estimates.fetches}</span>
              </div>
              <div className="pb-cost-card">
                <span className="pb-cost-label">
                  <Layers size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                  Estimated Tokens
                </span>
                <span className="pb-cost-val" data-testid="est-tokens">{estimates.tokenRange}</span>
              </div>
              <div className="pb-cost-card">
                <span className="pb-cost-label">
                  <Clock size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                  Est. Latency
                </span>
                <span className="pb-cost-val" data-testid="est-latency">{estimates.latency}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )}

      {/* RECIPE ARCHETYPE & STARTER PICKER MODAL */}
      {isRecipePickerOpen && (
        <div className="pb-modal-backdrop" onClick={() => setIsRecipePickerOpen(false)}>
          <div className="pb-modal-content" style={{ maxWidth: 740 }} onClick={(e) => e.stopPropagation()}>
            <div className="pb-modal-header">
              <div>
                <h4 className="pb-modal-title">Load Starter Template or Recipe</h4>
                <p className="pb-modal-subtitle">
                  Select a workflow recipe tailored to your domain or clone a built-in playbook into your builder canvas.
                </p>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setIsRecipePickerOpen(false)}
                aria-label="Close template picker"
              >
                <X size={16} />
              </button>
            </div>

            <div className="pb-modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              <div style={{ marginBottom: 10, fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Curated Recipe Archetypes
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                  gap: 12,
                  marginBottom: 20,
                }}
              >
                {PLAYBOOK_RECIPES.map((recipe) => (
                  <div
                    key={recipe.id}
                    className="pb-lib-item"
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'space-between',
                      padding: 14,
                    }}
                  >
                    <div>
                      <div className="pb-lib-top">
                        <span className="pb-lib-icon">{recipe.icon}</span>
                        <div className="pb-lib-title-box">
                          <h5 className="pb-lib-name">{recipe.name}</h5>
                          <span className="pb-lib-policy">{recipe.steps.length} Steps</span>
                        </div>
                      </div>
                      <p className="pb-lib-desc" style={{ marginTop: 8 }}>
                        {recipe.description}
                      </p>
                      <div className="pb-lib-preview" style={{ marginTop: 8, fontSize: 11.5 }}>
                        <strong>Pipeline:</strong>{' '}
                        {recipe.steps.map((s) => s.name).join(' → ')}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="btn-primary btn-sm pb-lib-btn"
                      style={{ marginTop: 12 }}
                      onClick={() => handleSelectRecipe(recipe)}
                    >
                      <Plus size={12} />
                      <span>Use this Recipe</span>
                    </button>
                  </div>
                ))}
              </div>

              {playbooks.filter((p) => p.is_builtin).length > 0 && (
                <>
                  <div style={{ marginBottom: 10, fontSize: 11.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Built-in Playbooks
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                      gap: 12,
                    }}
                  >
                    {playbooks
                      .filter((p) => p.is_builtin)
                      .map((pb) => (
                        <div
                          key={pb.id}
                          className="pb-lib-item"
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            padding: 14,
                          }}
                        >
                          <div>
                            <div className="pb-lib-top">
                              <span className="pb-lib-icon">🏛️</span>
                              <div className="pb-lib-title-box">
                                <h5 className="pb-lib-name">{pb.name}</h5>
                                <span className="pb-lib-policy">{pb.steps?.length || 0} Steps</span>
                              </div>
                            </div>
                            <p className="pb-lib-desc" style={{ marginTop: 8 }}>
                              {pb.description || 'System built-in research pipeline.'}
                            </p>
                            <div className="pb-lib-preview" style={{ marginTop: 8, fontSize: 11.5 }}>
                              <strong>Pipeline:</strong>{' '}
                              {pb.steps?.map((s) => s.name).join(' → ') || 'No steps'}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn-secondary btn-sm pb-lib-btn"
                            style={{ marginTop: 12 }}
                            onClick={() => {
                              setEditingPlaybook((prev) => ({
                                id: prev?.id || 0,
                                name: `${pb.name} (Clone)`,
                                description: pb.description,
                                is_builtin: false,
                                card_types: [...(pb.card_types || [])],
                                version: prev?.version || 1,
                                steps: JSON.parse(JSON.stringify(pb.steps || [])),
                              }));
                              setIsRecipePickerOpen(false);
                              setServerError(null);
                              setExpandedSteps({});
                              showToast(`Loaded "${pb.name}" built-in steps`);
                            }}
                          >
                            <Copy size={12} />
                            <span>Clone Built-in Steps</span>
                          </button>
                        </div>
                      ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* IMPORT JSON MODAL */}
      {isImportModalOpen && (
        <div className="pb-modal-backdrop" onClick={() => setIsImportModalOpen(false)}>
          <div className="pb-modal-content" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="pb-modal-header">
              <div>
                <h4 className="pb-modal-title">Import Playbook JSON</h4>
                <p className="pb-modal-subtitle">
                  Paste a valid playbook JSON definition to load it into the builder.
                </p>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setIsImportModalOpen(false)}
                aria-label="Close import modal"
              >
                <X size={16} />
              </button>
            </div>

            <div className="pb-modal-body">
              {importError && (
                <div className="pb-error-banner" style={{ marginBottom: 12 }}>
                  <AlertCircle size={16} />
                  <span>{importError}</span>
                </div>
              )}
              <div className="pb-form-field">
                <label htmlFor="import-json-textarea">Playbook JSON</label>
                <textarea
                  id="import-json-textarea"
                  className="input-textarea"
                  rows={10}
                  style={{ fontFamily: 'monospace', fontSize: 12 }}
                  placeholder={`{\n  "name": "Exported Pipeline",\n  "description": "...",\n  "card_types": ["tool"],\n  "steps": [\n    {\n      "kind": "custom",\n      "name": "Analysis",\n      "config": { "output_heading": "Analysis" }\n    }\n  ]\n}`}
                  value={importJsonText}
                  onChange={(e) => setImportJsonText(e.target.value)}
                  aria-label="Playbook JSON input"
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setIsImportModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={handleApplyImport}
                >
                  Import and Load
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADD STEP MODAL */}
      {isAddStepOpen && (
        <div className="pb-modal-backdrop" onClick={() => setIsAddStepOpen(false)}>
          <div className="pb-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="pb-modal-header">
              <div>
                <h4 className="pb-modal-title">Add Step to Playbook</h4>
                <p className="pb-modal-subtitle">
                  Pick a ready-made step from our tuned library or craft a custom blank step.
                </p>
              </div>
              <button
                type="button"
                className="btn-icon"
                onClick={() => setIsAddStepOpen(false)}
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="pb-modal-tabs">
              <button
                type="button"
                className={`pb-modal-tab ${addStepTab === 'library' ? 'active' : ''}`}
                onClick={() => setAddStepTab('library')}
              >
                <Sparkles size={13} />
                <span>Step Library ({libraryTemplates.length + userStepTemplates.length})</span>
              </button>
              <button
                type="button"
                className={`pb-modal-tab ${addStepTab === 'blank' ? 'active' : ''}`}
                onClick={() => setAddStepTab('blank')}
              >
                <Plus size={13} />
                <span>Blank Custom Step</span>
              </button>
            </div>

            <div className="pb-modal-body">
              {addStepTab === 'library' ? (
                <div>
                  {/* User Saved Custom Templates */}
                  {userStepTemplates.length > 0 && (
                    <div className="pb-user-templates-section" style={{ marginBottom: 20 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="pb-card-badge custom" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Sparkles size={11} />
                            <span>Custom Templates</span>
                          </span>
                          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                            ({userStepTemplates.length})
                          </span>
                        </div>
                      </div>

                      <div className="pb-library-grid">
                        {userStepTemplates.map((tpl) => (
                          <div
                            key={tpl.id}
                            className="pb-lib-item custom-template"
                          >
                            <div className="pb-lib-top">
                              <span className="pb-lib-icon">✨</span>
                              <div className="pb-lib-title-box">
                                <h5 className="pb-lib-name">{tpl.name}</h5>
                                <span className="pb-lib-policy">
                                  {tpl.tool_policy === 'search' ? '🔍 Live Web Search' : '🧠 Source Reasoning'}
                                </span>
                              </div>
                              <button
                                type="button"
                                className="btn-icon btn-danger"
                                style={{ marginLeft: 'auto', padding: 2 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const updated = userStepTemplates.filter((t) => t.id !== tpl.id);
                                  localStorage.setItem('sparkkeep_user_step_library', JSON.stringify(updated));
                                  setUserStepTemplates(updated);
                                  showToast(`Removed "${tpl.name}" from library`);
                                }}
                                title="Remove template"
                                aria-label={`Delete ${tpl.name} template`}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                            <p className="pb-lib-desc">{tpl.description}</p>
                            <div className="pb-lib-preview">
                              <strong>Heading:</strong> {tpl.heading}
                            </div>
                            <button
                              type="button"
                              className="btn-primary btn-sm pb-lib-btn"
                              onClick={() => addLibraryStep(tpl)}
                            >
                              <Plus size={12} />
                              <span>Add to Playbook</span>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Standard Step Library */}
                  {userStepTemplates.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Standard Step Library ({libraryTemplates.length})
                      </span>
                    </div>
                  )}
                  <div className="pb-library-grid">
                    {libraryTemplates.map((tpl) => (
                      <div key={tpl.id} className="pb-lib-item">
                        <div className="pb-lib-top">
                          <span className="pb-lib-icon">{tpl.icon}</span>
                          <div className="pb-lib-title-box">
                            <h5 className="pb-lib-name">{tpl.name}</h5>
                            <span className="pb-lib-policy">
                              {tpl.tool_policy === 'search' ? '🔍 Live Web Search' : '🧠 Source Reasoning'}
                            </span>
                          </div>
                        </div>
                        <p className="pb-lib-desc">{tpl.description}</p>
                        <div className="pb-lib-preview">
                          <strong>Heading:</strong> {tpl.heading}
                        </div>
                        <button
                          type="button"
                          className="btn-primary btn-sm pb-lib-btn"
                          onClick={() => addLibraryStep(tpl)}
                        >
                          <Plus size={12} />
                          <span>Add to Playbook</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="pb-blank-box">
                  <p>
                    Create a blank custom step that analyzes existing sources or searches the web
                    using a custom LLM prompt instruction.
                  </p>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ marginTop: 16 }}
                    onClick={addBlankCustomStep}
                  >
                    <Plus size={14} />
                    <span>Create Blank Custom Step</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
