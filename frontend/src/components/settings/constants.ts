export interface RoleDefinition {
  key: string;
  label: string;
  description: string;
  hint: string;
}

export const ROLE_DEFINITIONS: RoleDefinition[] = [
  {
    key: 'triage',
    label: 'Triage & Extraction',
    description: 'Processes incoming links and notes into structured idea cards.',
    hint: 'fast & cheap recommended',
  },
  {
    key: 'vision',
    label: 'Vision & Image Analysis',
    description: 'Transcribes text and digests screenshot / photo uploads.',
    hint: 'fast & cheap recommended',
  },
  {
    key: 'research_plan',
    label: 'Research Planning',
    description: 'Generates targeted web search queries and reading plans.',
    hint: 'fast & cheap recommended',
  },
  {
    key: 'research_synthesis',
    label: 'Research Synthesis',
    description: 'Synthesizes deep-dive findings into a comprehensive markdown report.',
    hint: 'strongest model recommended',
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
  label: string;
  badge: string;
  description: string;
  goals: string;
  skills: string;
  stack: string;
  interests: string;
  constraints: string;
}

export const PROFILE_ARCHETYPES: ProfileArchetype[] = [
  {
    id: 'founder',
    label: 'Founder & Operator',
    badge: '🚀 Founder / Operator',
    description: 'Scaling products, go-to-market traction, hiring, and capital allocation',
    goals: 'Early-stage founder scaling a high-growth company. Focused on product-market fit, enterprise go-to-market, customer acquisition, hiring leaders, and seed/Series A fundraising.',
    skills: 'B2B Sales, Product Strategy, Financial Modeling, Executive Hiring, Unit Economics, GTM',
    stack: 'HubSpot, Stripe, Notion, Linear, QuickBooks, Carta, Google Workspace',
    interests: 'Enterprise PLG, Pricing Models, Venture Capital, Customer Retention, Operational Leverage',
    constraints: 'High ROI initiatives only; lean team budget; prioritize rapid execution and tangible customer outcomes over perfection.',
  },
  {
    id: 'finance',
    label: 'Finance & Investing',
    badge: '📈 Finance & Markets',
    description: 'Macro analysis, valuation, risk hedging, fintech, and asset allocation',
    goals: 'Independent investor and financial analyst tracking global macroeconomic shifts, market liquidity, fintech disruptors, and asymmetrical investment opportunities.',
    skills: 'Fundamental Analysis, DCF Valuation, Macroeconomics, Portfolio Risk Management, Financial Statement Auditing',
    stack: 'Bloomberg Terminal, Koyfin, TradingView, SEC EDGAR, Excel / Google Sheets, Substack',
    interests: 'Macro Liquidity, Energy Transition, Crypto Infrastructure, Earnings Trends, High-Yield Debt, FinTech',
    constraints: 'Rely on primary filings (10-K, 10-Q) and verified data; ignore unvetted social media speculation; flag balance sheet vulnerabilities.',
  },
  {
    id: 'agriculture',
    label: 'Agriculture & AgTech',
    badge: '🌾 AgTech & Bioeconomy',
    description: 'Precision agriculture, soil microbiome, sustainable yields, and commodity logistics',
    goals: 'AgTech innovator and agribusiness operator focused on sustainable food systems, farm robotics, soil regeneration, and resilient supply chains.',
    skills: 'Agronomy, Precision Agriculture, Soil Science, Supply Chain Logistics, Farm Management, GIS Analysis',
    stack: 'John Deere Operations Center, Climate FieldView, DroneDeploy, FarmOS, QGIS, Weather APIs',
    interests: 'Regenerative Agriculture, Crop Yield Optimization, Autonomous Farm Machinery, Soil Microbiome, Grain Commodities',
    constraints: 'Must support offline / low-connectivity field environments; ruggedized hardware; realistic CAPEX for commercial acreage.',
  },
  {
    id: 'systems',
    label: 'Systems & AI Engineer',
    badge: '⚡ Systems & AI',
    description: 'Local AI pipelines, distributed backend services, homelabs, and privacy-first tooling',
    goals: 'Software engineer and homelab enthusiast architecting local AI agent workflows, resilient microservices, and self-hosted privacy infrastructure.',
    skills: 'TypeScript, Python, Go, Distributed Systems, Containerization, Local LLM Inference, Security Hardening',
    stack: 'Linux, Docker, Kubernetes, PostgreSQL, Ollama, Obsidian, Neovim, WireGuard',
    interests: 'Local AI Agents, High-Performance Computing, Edge Inference, Microservices, PKM, Open-Source Tools',
    constraints: 'Open-source and self-hosted solutions prioritized; constrained hardware (32GB RAM homelab limit); zero telemetry or vendor lock-in.',
  },
];

