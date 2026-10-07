export type ReferenceKind =
  | 'url'
  | 'repo'
  | 'tool'
  | 'product'
  | 'person'
  | 'org'
  | 'paper'
  | 'other';

export interface Reference {
  kind: ReferenceKind;
  label: string;
  url?: string;
}

export type CardType =
  | 'tool'
  | 'repo'
  | 'article'
  | 'idea'
  | 'claim'
  | 'tutorial'
  | 'product'
  | 'other';

export interface CardSignals {
  extraction?: 'full' | 'partial' | 'thin' | string;
  promo?: boolean;
  source_quality?: 'primary' | 'secondary' | 'social' | 'unknown' | string;
  published_at?: string;
}

export interface CardWorthiness {
  level?: 'high' | 'medium' | 'low' | string;
  reason?: string;
}

export interface Card {
  id: number;
  capture_id?: number | null;
  title: string;
  summary: string;
  horizon: 'short-term' | 'medium-term' | 'long-term' | 'lifetime';
  status: 'inbox' | 'doing' | 'done' | 'shelved' | 'dismissed';
  source_url: string;
  source_note: string;
  tags: string[];
  references?: Reference[];
  type?: CardType | string;
  tldr?: string;
  why_care?: string;
  claims?: string[];
  open_questions?: string[];
  signals?: CardSignals;
  worthiness?: CardWorthiness;
  executive_summary?: string;
  value_proposition?: string;
  proposed_actions?: string[];
  actions_source?: 'triage' | 'research' | 'user' | string;
  research_verdict?: 'pursue' | 'watch' | 'skip' | string;
  research_confidence?: 'high' | 'medium' | 'low' | string;
  suggested_horizon?: string;
  suggested_tags?: string[];
  created_at: string;
  updated_at: string;
}

export interface ClaimVerdict {
  claim: string;
  status: 'supported' | 'disputed' | 'unverified';
  rationale: string;
  sources: string[];
}

export interface LandscapeItem {
  name: string;
  url?: string;
  one_liner: string;
  how_it_differs: string;
  sources: string[];
}

export interface ResearchVerdict {
  recommendation: 'pursue' | 'watch' | 'skip';
  for_whom: string;
  risks: string[];
  confidence: 'high' | 'medium' | 'low';
  next_actions: string[];
  suggested_horizon?: string;
  suggested_tags?: string[];
}

export interface ResearchResult {
  claims: ClaimVerdict[];
  landscape: LandscapeItem[];
  verdict?: ResearchVerdict;
}

export interface Tag {
  name: string;
  count: number;
}

export interface DayGroup {
  date: string;
  cards: Card[];
}

export interface DigestData {
  ok: boolean;
  week_total: number;
  by_status: Record<string, number>;
  days: DayGroup[];
}

export interface ResearchStep {
  id: string;
  status: 'running' | 'done' | 'failed' | 'skipped' | 'queued' | string;
  started_at?: string;
  finished_at?: string;
  note?: string;
}

export interface ResearchSource {
  id: string;
  url: string;
  title: string;
  fetched_at?: string;
  origin: string;
  clipped_text?: string;
  questions?: string[];
}

export interface ResearchQuestion {
  id: string;
  question: string;
  query: string;
  prefer_domains?: string[];
}

export interface ResearchPlan {
  questions: ResearchQuestion[];
}

export interface ResearchItem {
  id: number;
  card_id: number;
  status: 'queued' | 'running' | 'done' | 'failed';
  query: string;
  findings: string;
  error?: string;
  steps?: ResearchStep[];
  sources?: ResearchSource[];
  plan?: ResearchPlan;
  result?: ResearchResult;
  tokens?: number;
  feedback_rating?: 'thumbs_up' | 'thumbs_down';
  feedback_comment?: string;
  feedback_at?: string;
  created_at: string;
}

export interface StepMetric {
  step: string;
  runs: number;
  success: number;
  failed: number;
  success_rate: number;
}

export interface FeedbackMetrics {
  total: number;
  thumbs_up: number;
  thumbs_down: number;
  thumbs_up_ratio: number;
}

export interface PipelineMetrics {
  captures_count: number;
  cards_count: number;
  triage_by_status: Record<string, number>;
  median_inbox_time_seconds: number;
  research_conversion_rate: number;
  runs_by_playbook: Record<string, number>;
  step_metrics: StepMetric[];
  feedback: FeedbackMetrics;
  avg_tokens: number;
  avg_tokens_by_role?: Record<string, number>;
}


export interface CardFilter {
  horizon?: string;
  status?: string;
  tag?: string;
  q?: string;
  stale_days?: number;
  limit?: number;
  offset?: number;
}

export interface SetupStatus {
  ok: boolean;
  is_configured: boolean;
  has_auth: boolean;
  has_llm_key: boolean;
  llm_base?: string;
  llm_model?: string;
}

export interface SetupPayload {
  auth_token?: string;
  llm_base?: string;
  llm_key?: string;
  llm_model?: string;
}

export interface LicenseStatus {
  tier: 'community' | 'pro' | string;
  email?: string;
  features: string[];
  expires_at?: number;
  is_lifetime: boolean;
  is_valid: boolean;
}

export interface LLMProfile {
  id: string;
  name: string;
  base_url: string;
  model: string;
  has_key: boolean;
  is_default: boolean;
}

export interface LLMProfileInput {
  id?: string;
  name: string;
  base_url: string;
  model: string;
  api_key?: string;
  is_default?: boolean;
}

export type LLMRole = 'triage' | 'vision' | 'research_plan' | 'research_synthesis';
export type LLMRolesMapping = Record<string, string>;

export interface CustomStepConfig {
  instruction?: string;
  output_heading?: string;
  inputs?: string[];
  tool_policy?: 'none' | 'search';
  role?: 'research_plan' | 'research_synthesis';
  max_queries?: number;
  use_profile?: boolean;
}

export interface UserProfile {
  goals?: string;
  skills?: string[];
  stack?: string[];
  interests?: string[];
  constraints?: string;
  language?: string;
}

export interface PlaybookStep {
  id?: number;
  playbook_id?: number;
  position: number;
  kind: string;
  name: string;
  enabled: boolean;
  config: CustomStepConfig;
}

export interface Playbook {
  id: number;
  name: string;
  description: string;
  is_builtin: boolean;
  card_types: string[];
  version: number;
  created_at?: string;
  updated_at?: string;
  steps: PlaybookStep[];
}

export interface StepLibraryTemplate {
  id: string;
  icon: string;
  name: string;
  description: string;
  heading: string;
  instruction: string;
  tool_policy: 'none' | 'search';
  role: 'research_plan' | 'research_synthesis';
  inputs: string[];
  max_queries: number;
}

