import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CardItem } from './CardItem';
import { CardActionsProvider, CardActions } from '../context/CardActionsContext';
import { LocaleProvider } from '../i18n';
import { Card } from '../types';

describe('CardItem localization', () => {
  const card: Card = {
    id: 201,
    title: 'Localized card',
    summary: 'A card rendered in Romanian',
    status: 'inbox',
    horizon: 'short-term',
    type: 'idea',
    source_url: '',
    source_note: '',
    tags: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const mockActions: CardActions = {
    onSelectCard: vi.fn(),
    onStatusChange: vi.fn(),
    onResearch: vi.fn(),
    onRetry: vi.fn(),
    showToast: vi.fn(),
  };

  it('renders card labels in Romanian under the ro locale', () => {
    render(
      <LocaleProvider locale="ro">
        <CardActionsProvider value={mockActions}>
          <CardItem card={card} />
        </CardActionsProvider>
      </LocaleProvider>
    );

    expect(screen.getByText('Sugestie:')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Confirmă' })).toBeDefined();
    expect(screen.getByTitle('Sursă: Web')).toBeDefined();
    expect(screen.getByText('acum')).toBeDefined();
  });
});
