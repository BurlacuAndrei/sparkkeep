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
  created_at: string;
  updated_at: string;
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

export interface ResearchItem {
  id: number;
  card_id: number;
  status: 'queued' | 'running' | 'done' | 'failed';
  query: string;
  findings: string;
  error?: string;
  created_at: string;
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

