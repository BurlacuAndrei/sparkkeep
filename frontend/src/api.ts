import { Card, Tag, DigestData, ResearchItem, CardFilter } from './types';

// Where the dashboard keeps the token it was issued (SPARKKEEP_AUTH_TOKEN).
export const TOKEN_KEY = 'sparkkeep_token';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY) || '';
  const res = await fetch(path, {
    ...options,
    headers: {
      ...(options?.headers as Record<string, string> | undefined),
      Authorization: `Bearer ${token}`,
    },
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

export async function fetchCards(filter: CardFilter = {}): Promise<Card[]> {
  const params = new URLSearchParams();
  if (filter.horizon) params.set('horizon', filter.horizon);
  if (filter.status) params.set('status', filter.status);
  if (filter.tag) params.set('tag', filter.tag);
  if (filter.q) params.set('q', filter.q);
  if (filter.stale_days) params.set('stale_days', String(filter.stale_days));

  const res = await request<{ ok: boolean; cards: Card[] }>(`/api/v1/cards?${params.toString()}`);
  return res.cards || [];
}

export async function fetchCard(id: number): Promise<Card> {
  const res = await request<{ ok: boolean; data: Card }>(`/api/v1/cards/${id}`);
  return res.data;
}

export async function createCard(card: Partial<Card>): Promise<Card> {
  const res = await request<{ ok: boolean; data: Card }>('/api/v1/cards', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(card),
  });
  return res.data;
}

export async function updateCard(id: number, patch: Partial<Card>): Promise<Card> {
  const res = await request<{ ok: boolean; data: Card }>(`/api/v1/cards/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  return res.data;
}

export async function retryCard(id: number): Promise<Card> {
  const res = await request<{ ok: boolean; data: Card }>(`/api/v1/cards/${id}/retry`, {
    method: 'POST',
  });
  return res.data;
}

// batchShelveStale shelves every inbox/doing card untouched for more than
// `days` (server default 30) and returns how many were archived.
export async function batchShelveStale(days?: number): Promise<{ ok: boolean; shelved_count: number }> {
  return request<{ ok: boolean; shelved_count: number }>(
    `/api/v1/cards/batch-shelve-stale?days=${days || 30}`,
    { method: 'POST' }
  );
}

export async function fetchTags(): Promise<Tag[]> {
  const res = await request<{ ok: boolean; tags: Tag[] }>('/api/v1/tags');
  return res.tags || [];
}

export async function fetchDigest(): Promise<DigestData> {
  return request<DigestData>('/api/v1/digest');
}

export async function triggerResearch(cardId: number): Promise<{ ok: boolean; accepted: boolean }> {
  return request<{ ok: boolean; accepted: boolean }>('/api/v1/research', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ card_id: cardId }),
  });
}

export async function fetchResearchList(): Promise<ResearchItem[]> {
  const res = await request<{ ok: boolean; research: ResearchItem[] }>('/api/v1/research');
  return res.research || [];
}

export async function fetchResearchItem(id: number): Promise<ResearchItem> {
  const res = await request<{ ok: boolean; data: ResearchItem }>(`/api/v1/research/${id}?format=json`);
  return res.data;
}

// fetchCardResearch returns the newest research row for a card with its full
// findings, or null when the card has never been researched.
export async function fetchCardResearch(cardId: number): Promise<ResearchItem | null> {
  const list = await fetchResearchList();
  const latest = list.filter((r) => r.card_id === cardId).sort((a, b) => b.id - a.id)[0];
  return latest ? fetchResearchItem(latest.id) : null;
}
