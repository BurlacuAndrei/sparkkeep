import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CardHeaderActions } from './CardHeaderActions';
import { Card, Settings } from '../../types';
import * as api from '../../api';

vi.mock('../../api', async () => {
  const actual = await vi.importActual<typeof import('../../api')>('../../api');
  return {
    ...actual,
    exportCardToSink: vi.fn().mockResolvedValue({ ok: true, card_id: 1, sink: 'obsidian' }),
  };
});

const mockCard: Card = {
  id: 101,
  title: 'Test Obsidian Note',
  summary: 'Summary of test note',
  horizon: 'short-term',
  status: 'to-do',
  type: 'article',
  source_url: 'https://example.com/obsidian-test',
  source_note: 'Note content',
  tags: ['pkm', 'obsidian'],
  references: [],
  claims: [],
  open_questions: [],
  signals: { extraction: 'clean', promo: false, source_quality: 'high' },
  worthiness: { level: 'high', reason: 'Relevant' },
  executive_summary: 'Executive summary text',
  value_proposition: 'Value prop text',
  proposed_actions: ['Action 1'],
  completed_actions: [],
  actions_source: 'ai',
  analysis_failed: false,
  created_at: '2026-10-18T12:00:00Z',
  updated_at: '2026-10-18T12:00:00Z',
};

describe('CardHeaderActions Obsidian Export', () => {
  it('does not display Send to Obsidian Vault when obsidian_vault_path is absent', () => {
    render(
      <CardHeaderActions
        card={mockCard}
        status="to-do"
        onStatusTransition={vi.fn()}
        onRetry={vi.fn()}
        onResearch={vi.fn()}
        onOpenCapture={vi.fn()}
        onOpenSplit={vi.fn()}
        onClose={vi.fn()}
        showToast={vi.fn()}
        settings={{ has_llm_key: false, has_auth_token: false }}
      />
    );

    // Open overflow menu
    const moreBtn = screen.getByTitle('More actions');
    fireEvent.click(moreBtn);

    expect(screen.queryByText(/Send to Obsidian Vault/i)).toBeNull();
  });

  it('displays Send to Obsidian Vault and triggers exportCardToSink when clicked', async () => {
    const showToast = vi.fn();
    const settings: Settings = {
      has_llm_key: false,
      has_auth_token: false,
      obsidian_vault_path: '/my/obsidian/vault',
    };

    render(
      <CardHeaderActions
        card={mockCard}
        status="to-do"
        onStatusTransition={vi.fn()}
        onRetry={vi.fn()}
        onResearch={vi.fn()}
        onOpenCapture={vi.fn()}
        onOpenSplit={vi.fn()}
        onClose={vi.fn()}
        showToast={showToast}
        settings={settings}
      />
    );

    // Open overflow menu
    const moreBtn = screen.getByTitle('More actions');
    fireEvent.click(moreBtn);

    const exportBtn = screen.getByText(/Send to Obsidian Vault/i);
    expect(exportBtn).toBeDefined();

    fireEvent.click(exportBtn);

    await waitFor(() => {
      expect(api.exportCardToSink).toHaveBeenCalledWith(101, 'obsidian');
      expect(showToast).toHaveBeenCalledWith('Sent to Obsidian Vault');
    });
  });
});
