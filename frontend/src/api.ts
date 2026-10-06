import { Card, Tag, DigestData, ResearchItem, CardFilter, LLMProfile, LLMProfileInput } from './types';

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

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'An unexpected error occurred';
}

export async function fetchCards(filter: CardFilter = {}): Promise<Card[]> {
  const params = new URLSearchParams();
  if (filter.horizon) params.set('horizon', filter.horizon);
  if (filter.status) params.set('status', filter.status);
  if (filter.tag) params.set('tag', filter.tag);
  if (filter.q) params.set('q', filter.q);
  if (filter.stale_days) params.set('stale_days', String(filter.stale_days));
  if (filter.limit !== undefined) params.set('limit', String(filter.limit));
  if (filter.offset !== undefined) params.set('offset', String(filter.offset));

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

export async function fetchCardResearch(cardId: number): Promise<ResearchItem | null> {
  const list = await fetchResearchList();
  const latest = list.filter((r) => r.card_id === cardId).sort((a, b) => b.id - a.id)[0];
  return latest ? fetchResearchItem(latest.id) : null;
}

export async function getSetupStatus(): Promise<{ ok: boolean; is_configured: boolean; has_auth: boolean; has_llm_key: boolean; llm_base?: string; llm_model?: string }> {
  const res = await fetch('/api/v1/setup/status');
  return res.json();
}

export async function submitSetup(payload: { auth_token?: string; llm_base?: string; llm_key?: string; llm_model?: string }): Promise<{ ok: boolean; token?: string }> {
  const res = await fetch('/api/v1/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.error || 'Failed to complete setup');
  }
  if (data.token) {
    localStorage.setItem(TOKEN_KEY, data.token);
  }
  return data;
}

export async function fetchLicenseStatus(): Promise<{ ok: boolean; status: import('./types').LicenseStatus }> {
  return request<{ ok: boolean; status: import('./types').LicenseStatus }>('/api/v1/license/status');
}

export async function activateLicense(key: string): Promise<{ ok: boolean; status: import('./types').LicenseStatus }> {
  return request<{ ok: boolean; status: import('./types').LicenseStatus }>('/api/v1/license/activate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  });
}

export async function syncObsidian(vaultPath?: string): Promise<{ ok: boolean; written: number; vault_path: string }> {
  return request<{ ok: boolean; written: number; vault_path: string }>('/api/v1/export/obsidian', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vault_path: vaultPath || '' }),
  });
}

export async function testWebhook(url: string, secret?: string): Promise<{ ok: boolean; status_code: number; error?: string }> {
  return request<{ ok: boolean; status_code: number; error?: string }>('/api/v1/webhooks/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, secret }),
  });
}

export async function getSettings(): Promise<{
  ok: boolean;
  settings: {
    llm_base?: string;
    llm_model?: string;
    has_llm_key: boolean;
    has_auth_token: boolean;
    llm_profiles?: LLMProfile[];
  };
}> {
  return request('/api/v1/settings');
}

export async function patchSettings(payload: {
  auth_token?: string;
  llm_base?: string;
  llm_key?: string;
  llm_model?: string;
  llm_profiles?: LLMProfileInput[];
  default_profile_id?: string;
}): Promise<{ ok: boolean }> {
  return request('/api/v1/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

