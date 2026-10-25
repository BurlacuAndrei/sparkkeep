import { Card, Capture, Tag, DigestData, DigestSynthesisResult, ResearchItem, CardFilter, LLMProfileInput, Playbook, StepLibraryTemplate, UserProfile, PipelineMetrics, ResearchRule, QuietWindowConfig, ChannelInfo, Settings } from './types';
import { translateCurrent } from './i18n';

// Where the dashboard keeps the token it was issued (SPARKKEEP_AUTH_TOKEN).
export const TOKEN_KEY = 'sparkkeep_token';

export const DefaultCardTypes: string[] = [
  'article',
  'video',
  'book',
  'guide',
  'product',
  'place',
  'idea',
  'quote',
];

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
  return translateCurrent('errors.unexpected');
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

export const patchCard = updateCard;

export async function deleteCard(id: number): Promise<void> {
  await request<{ ok: boolean }>(`/api/v1/cards/${id}`, {
    method: 'DELETE',
  });
}

export async function addCardComment(id: number, content: string): Promise<any> {
  const res = await request<{ ok: boolean; data: any }>(`/api/v1/cards/${id}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  return res.data;
}

export async function retryCard(id: number): Promise<Card> {
  const res = await request<{ ok: boolean; data: Card }>(`/api/v1/cards/${id}/retry`, {
    method: 'POST',
  });
  return res.data;
}

export async function reanalyzeCard(id: number): Promise<{ ok: boolean; card: Card }> {
  return request<{ ok: boolean; card: Card }>(`/api/v1/cards/${id}/reanalyze`, {
    method: 'POST',
  });
}

export async function fetchCapture(id: number): Promise<Capture> {
  const res = await request<{ ok: boolean; data: Capture }>(`/api/v1/captures/${id}`);
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

export async function fetchDigest(days?: number): Promise<DigestData> {
  const query = days ? `?days=${days}` : '';
  return request<DigestData>(`/api/v1/digest${query}`);
}

export async function synthesizeDigest(days?: number): Promise<DigestSynthesisResult> {
  const query = days ? `?days=${days}` : '';
  return request<DigestSynthesisResult>(`/api/v1/digest/synthesize${query}`, {
    method: 'POST',
  });
}

export async function pushDigestToTelegram(days?: number): Promise<{ ok: boolean; message?: string; error?: string }> {
  const query = days ? `?days=${days}` : '';
  return request<{ ok: boolean; message?: string; error?: string }>(`/api/v1/digest/telegram${query}`, {
    method: 'POST',
  });
}

export async function triggerResearch(cardId: number, playbookId?: number): Promise<{ ok: boolean; accepted: boolean; playbook?: Playbook }> {
  return request<{ ok: boolean; accepted: boolean; playbook?: Playbook }>('/api/v1/research', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ card_id: cardId, ...(playbookId ? { playbook_id: playbookId } : {}) }),
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

export async function fetchCardResearchRuns(cardId: number): Promise<{ latest: ResearchItem | null; history: ResearchItem[] }> {
  const res = await request<{ ok: boolean; data: { latest: ResearchItem | null; history: ResearchItem[] } }>(`/api/v1/cards/${cardId}/research`);
  return res.data || { latest: null, history: [] };
}

export async function fetchCardResearch(cardId: number): Promise<ResearchItem | null> {
  try {
    const runs = await fetchCardResearchRuns(cardId);
    return runs.latest;
  } catch {
    const list = await fetchResearchList();
    const latest = list.filter((r) => r.card_id === cardId).sort((a, b) => b.id - a.id)[0];
    return latest ? fetchResearchItem(latest.id) : null;
  }
}

export async function submitResearchFeedback(id: number, rating: 'thumbs_up' | 'thumbs_down', comment?: string): Promise<ResearchItem> {
  const res = await request<{ ok: boolean; research: ResearchItem }>(`/api/v1/research/${id}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rating, comment: comment || '' }),
  });
  return res.research;
}

export async function fetchPipelineMetrics(): Promise<PipelineMetrics> {
  const res = await request<{ ok: boolean; metrics: PipelineMetrics }>('/api/v1/metrics/pipeline');
  return res.metrics;
}


export async function getSetupStatus(): Promise<{ ok: boolean; is_configured: boolean; has_auth: boolean; has_llm_key: boolean; llm_base?: string; llm_model?: string; interface_locale?: string }> {
  const res = await fetch('/api/v1/setup/status');
  return res.json();
}

export async function submitSetup(payload: { auth_token?: string; llm_base?: string; llm_key?: string; llm_model?: string; tg_token?: string; interface_locale?: string }): Promise<{ ok: boolean; token?: string }> {
  const res = await fetch('/api/v1/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.error || translateCurrent('errors.setupFailed'));
  }
  if (data.token) {
    localStorage.setItem(TOKEN_KEY, data.token);
  }
  return data;
}

export async function submitDemoSetup(passphrase?: string, interface_locale?: string): Promise<{ ok: boolean; token?: string; demo?: boolean }> {
  const res = await fetch('/api/v1/setup/demo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ auth_token: passphrase || '', ...(interface_locale ? { interface_locale } : {}) }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.error || translateCurrent('errors.demoFailed'));
  }
  if (data.token) {
    localStorage.setItem(TOKEN_KEY, data.token);
  }
  return data;
}

export async function downloadLibraryExport(format: 'json' | 'zip'): Promise<void> {
  const token = localStorage.getItem(TOKEN_KEY) || '';
  const url = `/api/v1/export/${format === 'zip' ? 'archive.zip' : 'library'}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new Error(translateCurrent('errors.exportFailed', { status: res.status }));
  }
  const blob = await res.blob();
  const downloadUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = downloadUrl;
  a.download = `sparkkeep-${format === 'zip' ? 'archive.zip' : 'library.json'}`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(downloadUrl);
}

export async function syncObsidian(vaultPath?: string): Promise<{ ok: boolean; written: number; vault_path: string }> {
  return request<{ ok: boolean; written: number; vault_path: string }>('/api/v1/export/obsidian', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vault_path: vaultPath || '' }),
  });
}

export async function syncJoplin(): Promise<{ ok: boolean; written: number; sink: string }> {
  return request<{ ok: boolean; written: number; sink: string }>('/api/v1/export/joplin', {
    method: 'POST',
  });
}

export async function testJoplinConnection(): Promise<{ ok: boolean; success: boolean; message: string; details?: Record<string, any> }> {
  return request<{ ok: boolean; success: boolean; message: string; details?: Record<string, any> }>(
    '/api/v1/integrations/joplin/test',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }
  );
}

export async function syncNotion(): Promise<{ ok: boolean; written: number; sink: string }> {
  return request<{ ok: boolean; written: number; sink: string }>('/api/v1/export/notion', {
    method: 'POST',
  });
}

export async function testNotionConnection(): Promise<{ ok: boolean; success: boolean; message: string; details?: Record<string, any> }> {
  return request<{ ok: boolean; success: boolean; message: string; details?: Record<string, any> }>(
    '/api/v1/integrations/notion/test',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }
  );
}

export async function exportCardToSink(
  cardId: number,
  sink: string
): Promise<{ ok: boolean; card_id?: number; sink?: string; message?: string }> {
  return request<{ ok: boolean; card_id?: number; sink?: string; message?: string }>(
    `/api/v1/cards/${cardId}/export/${sink}`,
    {
      method: 'POST',
    }
  );
}

export async function testSinkConnection(
  sink: string,
  params?: Record<string, any>
): Promise<{ ok: boolean; success: boolean; message: string; details?: Record<string, any> }> {
  return request<{ ok: boolean; success: boolean; message: string; details?: Record<string, any> }>(
    `/api/v1/integrations/${sink}/test`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params || {}),
    }
  );
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
  settings: Settings;
}> {
  return request('/api/v1/settings');
}

export async function patchSettings(payload: {
  interface_locale?: string;
  card_types?: string[];
  auth_token?: string;
  llm_base?: string;
  llm_key?: string;
  llm_model?: string;
  llm_profiles?: LLMProfileInput[];
  default_profile_id?: string;
  llm_roles?: Record<string, string>;
  llm_token_caps?: Record<string, number>;
  default_playbook_id?: number;
  user_profile?: UserProfile;
  tg_token?: string;
  tg_chat_id?: string;
  openclaw_url?: string;
  openclaw_token?: string;
  openclaw_channel?: string;
  openclaw_target?: string;
  openclaw_enabled?: boolean;
  discord_token?: string;
  discord_channel_id?: string;
  slack_webhook_url?: string;
  obsidian_vault_path?: string;
  obsidian_auto_export?: boolean;
  notion_token?: string;
  notion_database_id?: string;
  notion_auto_export?: boolean;
  client_intents_enabled?: string;
  github_repo?: string;
  joplin_mode?: "server" | "clipper";
  joplin_base_url?: string;
  joplin_token?: string;
  joplin_email?: string;
  joplin_password?: string;
  joplin_auto_export?: boolean;
}): Promise<{ ok: boolean }> {
  return request('/api/v1/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function listChannels(): Promise<{ ok: boolean; channels: ChannelInfo[] }> {
  return request('/api/v1/channels');
}

export async function testChannel(id: string): Promise<{ ok: boolean; message: string }> {
  return request(`/api/v1/channels/${id}/test`, { method: 'POST' });
}

export async function pushDigestToChannel(channel: string = 'all', days: number = 7): Promise<{ ok: boolean; message: string }> {
  return request(`/api/v1/digest/push?channel=${encodeURIComponent(channel)}&days=${days}`, { method: 'POST' });
}

export async function fetchPlaybooks(): Promise<Playbook[]> {
  const data = await request<{ ok: boolean; playbooks: Playbook[] }>('/api/v1/playbooks');
  return data.playbooks || [];
}

export async function fetchPlaybook(id: number): Promise<Playbook> {
  const data = await request<{ ok: boolean; playbook: Playbook }>(`/api/v1/playbooks/${id}`);
  return data.playbook;
}

export async function createPlaybook(pb: Partial<Playbook>): Promise<Playbook> {
  const data = await request<{ ok: boolean; playbook: Playbook }>('/api/v1/playbooks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pb),
  });
  return data.playbook;
}

export async function updatePlaybook(id: number, pb: Partial<Playbook>): Promise<Playbook> {
  const data = await request<{ ok: boolean; playbook: Playbook }>(`/api/v1/playbooks/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pb),
  });
  return data.playbook;
}

export async function deletePlaybook(id: number): Promise<void> {
  await request<{ ok: boolean }>(`/api/v1/playbooks/${id}`, {
    method: 'DELETE',
  });
}

export async function duplicatePlaybook(id: number): Promise<Playbook> {
  const data = await request<{ ok: boolean; playbook: Playbook }>(`/api/v1/playbooks/${id}/duplicate`, {
    method: 'POST',
  });
  return data.playbook;
}

export async function fetchStepLibrary(): Promise<StepLibraryTemplate[]> {
  const data = await request<{ ok: boolean; templates: StepLibraryTemplate[] }>('/api/v1/playbook-steps/library');
  return data.templates || [];
}

export async function batchQueueResearch(
  cardIDs: number[],
  playbookID?: number,
  scheduledFor?: string
): Promise<{ ok: boolean; queued: ResearchItem[]; batch_id: string }> {
  return request('/api/v1/research/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      card_ids: cardIDs,
      playbook_id: playbookID,
      scheduled_for: scheduledFor,
    }),
  });
}

export async function fetchResearchRules(): Promise<ResearchRule[]> {
  const data = await request<{ ok: boolean; rules: ResearchRule[] }>('/api/v1/research/rules');
  return data.rules || [];
}

export async function createResearchRule(rule: Partial<ResearchRule>): Promise<ResearchRule> {
  const data = await request<{ ok: boolean; rule: ResearchRule }>('/api/v1/research/rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rule),
  });
  return data.rule;
}

export async function updateResearchRule(id: string, rule: Partial<ResearchRule>): Promise<ResearchRule> {
  const data = await request<{ ok: boolean; rule: ResearchRule }>(`/api/v1/research/rules/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rule),
  });
  return data.rule;
}

export async function deleteResearchRule(id: string): Promise<void> {
  await request<{ ok: boolean }>(`/api/v1/research/rules/${id}`, {
    method: 'DELETE',
  });
}

export async function runResearchRule(id: string): Promise<ResearchItem[]> {
  const data = await request<{ ok: boolean; queued: ResearchItem[] }>(`/api/v1/research/rules/${id}/run`, {
    method: 'POST',
  });
  return data.queued || [];
}

export async function fetchQuietWindow(): Promise<QuietWindowConfig> {
  return request<QuietWindowConfig>('/api/v1/research/quiet-window');
}

export async function updateQuietWindow(cfg: QuietWindowConfig): Promise<void> {
  await request<{ ok: boolean }>('/api/v1/research/quiet-window', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  });
}

export async function getOutboxFeedToken(): Promise<{ ok: boolean; token: string }> {
  return request<{ ok: boolean; token: string }>('/api/v1/integrations/outbox/token');
}

export async function regenerateOutboxFeedToken(): Promise<{ ok: boolean; token: string; feed_url?: string }> {
  return request<{ ok: boolean; token: string; feed_url?: string }>('/api/v1/integrations/outbox/token/regenerate', {
    method: 'POST',
  });
}

export interface CaptureParams {
  url?: string;
  text?: string;
  caption?: string;
  file?: File | null;
}

export interface CaptureResult {
  ok: boolean;
  card_ids?: number[];
  cards?: number[];
  error?: string;
  discarded?: boolean;
  reason?: string;
}

export type CaptureResponse = CaptureResult;

export async function captureSpark(params: CaptureParams): Promise<CaptureResult> {
  const token = localStorage.getItem(TOKEN_KEY) || '';
  const formData = new FormData();
  if (params.url) formData.append('url', params.url.trim());
  if (params.text) formData.append('text', params.text.trim());
  if (params.caption) formData.append('caption', params.caption.trim());
  if (params.file) formData.append('file', params.file);

  const res = await fetch('/api/v1/capture', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}


