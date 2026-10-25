import type { TranslationKey } from '../../i18n';

export interface RoleDefinition {
  key: string;
  labelKey: TranslationKey;
  descriptionKey: TranslationKey;
  hintKey: TranslationKey;
  /** Marks roles that benefit from the strongest available model. */
  isStrong?: boolean;
}

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    key: 'triage',
    labelKey: 'settings.ai.roles.triage.label',
    descriptionKey: 'settings.ai.roles.triage.description',
    hintKey: 'settings.ai.roles.triage.hint',
  },
  {
    key: 'vision',
    labelKey: 'settings.ai.roles.vision.label',
    descriptionKey: 'settings.ai.roles.vision.description',
    hintKey: 'settings.ai.roles.vision.hint',
  },
  {
    key: 'research_plan',
    labelKey: 'settings.ai.roles.researchPlan.label',
    descriptionKey: 'settings.ai.roles.researchPlan.description',
    hintKey: 'settings.ai.roles.researchPlan.hint',
  },
  {
    key: 'research_synthesis',
    labelKey: 'settings.ai.roles.researchSynthesis.label',
    descriptionKey: 'settings.ai.roles.researchSynthesis.description',
    hintKey: 'settings.ai.roles.researchSynthesis.hint',
    isStrong: true,
  },
];

export const DEFAULT_TOKEN_CAPS: Record<string, number> = {
  triage: 4096,
  vision: 1024,
  research_plan: 4096,
  research_synthesis: 8192,
};

export interface PresetTemplate {
  label: string;
  name: string;
  base: string;
  model: string;
  requiresKey: boolean;
  desc: string;
}

export const PRESET_TEMPLATES: PresetTemplate[] = [
  {
    label: 'OpenAI',
    name: 'OpenAI GPT-4o',
    base: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    requiresKey: true,
    desc: 'Cloud OpenAI inference',
  },
  {
    label: 'Claude',
    name: 'Anthropic Claude 3.5 Sonnet',
    base: 'https://api.anthropic.com/v1',
    model: 'claude-3-5-sonnet-20241022',
    requiresKey: true,
    desc: 'Cloud Anthropic inference',
  },
  {
    label: 'Gemini',
    name: 'Google Gemini 1.5 Pro',
    base: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-1.5-pro-latest',
    requiresKey: true,
    desc: 'Cloud Gemini inference via OpenAI compat',
  },
  {
    label: 'Groq',
    name: 'Groq Llama 3.3',
    base: 'https://api.groq.com/openai/v1',
    model: 'llama-3.3-70b-versatile',
    requiresKey: true,
    desc: 'Ultra-fast LPU inference',
  },
  {
    label: 'OpenRouter',
    name: 'OpenRouter Auto',
    base: 'https://openrouter.ai/api/v1',
    model: 'anthropic/claude-3-haiku',
    requiresKey: true,
    desc: 'OpenRouter inference',
  },
  {
    label: 'Ollama',
    name: 'Ollama Local',
    base: 'http://localhost:11434/v1',
    model: 'llama3.2',
    requiresKey: false,
    desc: 'Self-hosted local models',
  },
  {
    label: 'LM Studio',
    name: 'LM Studio',
    base: 'http://localhost:1234/v1',
    model: 'local-model',
    requiresKey: false,
    desc: 'Local developer inference server',
  },
  {
    label: 'Custom',
    name: 'Custom Provider',
    base: '',
    model: '',
    requiresKey: false,
    desc: 'Custom OpenAI-compatible endpoint',
  },
];

export const LANGUAGE_OPTIONS: string[] = [
  'Same as source / English',
  'English',
  'Spanish',
  'German',
  'French',
  'Italian',
  'Portuguese',
  'Japanese',
  'Chinese',
  'Romanian',
];

export interface ProfileArchetype {
  id: string;
  labelKey: TranslationKey;
  badgeKey: TranslationKey;
  descriptionKey: TranslationKey;
  goalsKey?: TranslationKey;
  skillsKey?: TranslationKey;
  stackKey?: TranslationKey;
  interestsKey?: TranslationKey;
  constraintsKey?: TranslationKey;
  goals: string;
  skills: string;
  stack: string;
  interests: string;
  constraints: string;
}

export const PROFILE_ARCHETYPES: ProfileArchetype[] = [
  {
    id: 'founder',
    labelKey: 'settings.profile.archetypes.founder.label',
    badgeKey: 'settings.profile.archetypes.founder.badge',
    descriptionKey: 'settings.profile.archetypes.founder.description',
    goalsKey: 'settings.profile.archetypes.founder.goals',
    skillsKey: 'settings.profile.archetypes.founder.skills',
    stackKey: 'settings.profile.archetypes.founder.stack',
    interestsKey: 'settings.profile.archetypes.founder.interests',
    constraintsKey: 'settings.profile.archetypes.founder.constraints',
    goals: 'Early-stage founder scaling a high-growth company. Focused on product-market fit, enterprise go-to-market, customer acquisition, hiring leaders, and seed/Series A fundraising.',
    skills: 'B2B Sales, Product Strategy, Financial Modeling, Executive Hiring, Unit Economics, GTM',
    stack: 'HubSpot, Stripe, Notion, Linear, QuickBooks, Carta, Google Workspace',
    interests: 'Enterprise PLG, Pricing Models, Venture Capital, Customer Retention, Operational Leverage',
    constraints: 'High ROI initiatives only; lean team budget; prioritize rapid execution and tangible customer outcomes over perfection.',
  },
  {
    id: 'finance',
    labelKey: 'settings.profile.archetypes.finance.label',
    badgeKey: 'settings.profile.archetypes.finance.badge',
    descriptionKey: 'settings.profile.archetypes.finance.description',
    goalsKey: 'settings.profile.archetypes.finance.goals',
    skillsKey: 'settings.profile.archetypes.finance.skills',
    stackKey: 'settings.profile.archetypes.finance.stack',
    interestsKey: 'settings.profile.archetypes.finance.interests',
    constraintsKey: 'settings.profile.archetypes.finance.constraints',
    goals: 'Independent investor and financial analyst tracking global macroeconomic shifts, market liquidity, fintech disruptors, and asymmetrical investment opportunities.',
    skills: 'Fundamental Analysis, DCF Valuation, Macroeconomics, Portfolio Risk Management, Financial Statement Auditing',
    stack: 'Bloomberg Terminal, Koyfin, TradingView, SEC EDGAR, Excel / Google Sheets, Substack',
    interests: 'Macro Liquidity, Energy Transition, Crypto Infrastructure, Earnings Trends, High-Yield Debt, FinTech',
    constraints: 'Rely on primary filings (10-K, 10-Q) and verified data; ignore unvetted social media speculation; flag balance sheet vulnerabilities.',
  },
  {
    id: 'agriculture',
    labelKey: 'settings.profile.archetypes.agriculture.label',
    badgeKey: 'settings.profile.archetypes.agriculture.badge',
    descriptionKey: 'settings.profile.archetypes.agriculture.description',
    goalsKey: 'settings.profile.archetypes.agriculture.goals',
    skillsKey: 'settings.profile.archetypes.agriculture.skills',
    stackKey: 'settings.profile.archetypes.agriculture.stack',
    interestsKey: 'settings.profile.archetypes.agriculture.interests',
    constraintsKey: 'settings.profile.archetypes.agriculture.constraints',
    goals: 'AgTech innovator and agribusiness operator focused on sustainable food systems, farm robotics, soil regeneration, and resilient supply chains.',
    skills: 'Agronomy, Precision Agriculture, Soil Science, Supply Chain Logistics, Farm Management, GIS Analysis',
    stack: 'John Deere Operations Center, Climate FieldView, DroneDeploy, FarmOS, QGIS, Weather APIs',
    interests: 'Regenerative Agriculture, Crop Yield Optimization, Autonomous Farm Machinery, Soil Microbiome, Grain Commodities',
    constraints: 'Must support offline / low-connectivity field environments; ruggedized hardware; realistic CAPEX for commercial acreage.',
  },
  {
    id: 'systems',
    labelKey: 'settings.profile.archetypes.systems.label',
    badgeKey: 'settings.profile.archetypes.systems.badge',
    descriptionKey: 'settings.profile.archetypes.systems.description',
    goalsKey: 'settings.profile.archetypes.systems.goals',
    skillsKey: 'settings.profile.archetypes.systems.skills',
    stackKey: 'settings.profile.archetypes.systems.stack',
    interestsKey: 'settings.profile.archetypes.systems.interests',
    constraintsKey: 'settings.profile.archetypes.systems.constraints',
    goals: 'Software engineer and homelab enthusiast architecting local AI agent workflows, resilient microservices, and self-hosted privacy infrastructure.',
    skills: 'TypeScript, Python, Go, Distributed Systems, Containerization, Local LLM Inference, Security Hardening',
    stack: 'Linux, Docker, Kubernetes, PostgreSQL, Ollama, Obsidian, Neovim, WireGuard',
    interests: 'Local AI Agents, High-Performance Computing, Edge Inference, Microservices, PKM, Open-Source Tools',
    constraints: 'Open-source and self-hosted solutions prioritized; constrained hardware (32GB RAM homelab limit); zero telemetry or vendor lock-in.',
  },
];

