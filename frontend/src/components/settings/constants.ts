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
