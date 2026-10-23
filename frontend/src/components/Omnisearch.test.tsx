import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Omnisearch } from './Omnisearch';
import { Card, Tag } from '../types';
import { LocaleProvider } from '../i18n';

const renderOmnisearch = (ui: React.ReactElement) =>
  render(<LocaleProvider locale="en">{ui}</LocaleProvider>);

vi.mock('../api', () => ({
  fetchCards: vi.fn().mockResolvedValue([]),
}));

describe('Omnisearch Component & Search Layout', () => {
  const mockCards: Card[] = [
    {
      id: 1,
      title: 'Deep Research Agent Architecture',
      summary: 'Automating multi-step research synthesis',
      status: 'inbox',
      horizon: 'short-term',
      source_url: 'https://example.com/agent',
      source_note: 'Note',
      tags: ['architecture'],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 2,
      title: 'Local LLM Performance Benchmark',
      summary: 'Benchmarking Ollama and llama.cpp on local hardware',
      status: 'in-progress',
      horizon: 'medium-term',
      source_url: 'https://example.com/bench',
      source_note: 'Note',
      tags: ['benchmarks'],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  const mockTags: Tag[] = [
    { name: 'architecture', count: 5 },
    { name: 'benchmarks', count: 2 },
  ];

  const defaultProps = {
    allCards: mockCards,
    tags: mockTags,
    triageCount: 4,
    onSelectCard: vi.fn(),
    onSelectTag: vi.fn(),
    onViewModeChange: vi.fn(),
    onOpenNewCard: vi.fn(),
    onOpenSettingsModal: vi.fn(),
  };

  it('renders search input with magnifying glass icon and suggestion placeholder', () => {
    const { container } = renderOmnisearch(<Omnisearch {...defaultProps} />);

    const searchWrapper = container.querySelector('.search-wrapper');
    expect(searchWrapper).toBeTruthy();

    const searchIcon = container.querySelector('.search-icon');
    expect(searchIcon).toBeTruthy();

    const input = screen.getByPlaceholderText('Search briefings, tags, sparks, or commands…');
    expect(input).toBeTruthy();
    expect(input.getAttribute('type')).toBe('search');
    expect(input.classList.contains('search-input')).toBe(true);

    const kbdBadge = container.querySelector('.search-kbd-badge');
    expect(kbdBadge).toBeTruthy();
  });

  it('opens popover results on focus and displays command items', () => {
    renderOmnisearch(<Omnisearch {...defaultProps} />);

    const input = screen.getByPlaceholderText('Search briefings, tags, sparks, or commands…');
    fireEvent.focus(input);

    expect(screen.getByRole('dialog', { name: /Omnisearch results/i })).toBeTruthy();
    expect(screen.getByText('Triage Deck')).toBeTruthy();
    expect(screen.getByText('Execution Boards')).toBeTruthy();
  });

  it('shows clear button when query is entered and clears on click', async () => {
    const { container } = renderOmnisearch(<Omnisearch {...defaultProps} />);

    const input = screen.getByPlaceholderText('Search briefings, tags, sparks, or commands…') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Agent' } });

    expect(input.value).toBe('Agent');

    // Wait for debounced search API resolution to clear isLoading
    await waitFor(() => {
      const clearBtn = container.querySelector('.search-clear-btn');
      expect(clearBtn).toBeTruthy();
    });

    const clearBtn = container.querySelector('.search-clear-btn');
    fireEvent.click(clearBtn!);
    expect(input.value).toBe('');
  });

  it('invokes navigation callback when selecting a command from the popover', () => {
    const onViewModeChange = vi.fn();
    renderOmnisearch(<Omnisearch {...defaultProps} onViewModeChange={onViewModeChange} />);

    const input = screen.getByPlaceholderText('Search briefings, tags, sparks, or commands…');
    fireEvent.focus(input);

    const triageCmd = screen.getByText('Triage Deck');
    fireEvent.click(triageCmd);

    expect(onViewModeChange).toHaveBeenCalledWith('triage');
  });
});

