export interface Card {
  id: number;
  title: string;
  summary: string;
  horizon: 'short-term' | 'lifetime';
  status: 'inbox' | 'doing' | 'done' | 'shelved' | 'dismissed';
  source_url: string;
  source_note: string;
  tags: string[];
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
}
