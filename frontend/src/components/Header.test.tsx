import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Header } from './Header';
import { LocaleProvider } from '../i18n';

describe('Header Navigation & Playbook Studio Tab', () => {
  const defaultProps = {
    viewMode: 'boards' as const,
    onViewModeChange: vi.fn(),
    onOpenNewCard: vi.fn(),
    flashMessage: '',
    onOpenSettingsModal: vi.fn(),
    triageCount: 3,
    allCards: [],
    tags: [],
    onSelectCard: vi.fn(),
    onSelectTag: vi.fn(),
  };

  it('renders Triage, Boards, Digest, and Playbooks top-level navigation tabs', () => {
    render(
      <LocaleProvider locale="en">
        <Header {...defaultProps} />
      </LocaleProvider>
    );

    expect(screen.getByRole('button', { name: /Triage/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Boards/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Digest/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Playbooks/i })).toBeDefined();
  });

  it('calls onViewModeChange("playbooks") when clicking the Playbooks tab', () => {
    const onViewModeChange = vi.fn();
    render(
      <LocaleProvider locale="en">
        <Header {...defaultProps} onViewModeChange={onViewModeChange} />
      </LocaleProvider>
    );

    const playbooksBtn = screen.getByRole('button', { name: /Playbooks/i });
    fireEvent.click(playbooksBtn);

    expect(onViewModeChange).toHaveBeenCalledWith('playbooks');
  });

  it('marks the Playbooks tab as active when viewMode is "playbooks"', () => {
    render(
      <LocaleProvider locale="en">
        <Header {...defaultProps} viewMode="playbooks" />
      </LocaleProvider>
    );

    const playbooksBtn = screen.getByRole('button', { name: /Playbooks/i });
    expect(playbooksBtn.className).toContain('active');
  });
});

describe('Header Romanian locale', () => {
  const defaultProps = {
    viewMode: 'boards' as const,
    onViewModeChange: vi.fn(),
    onOpenNewCard: vi.fn(),
    flashMessage: '',
    onOpenSettingsModal: vi.fn(),
    triageCount: 2,
    allCards: [],
    tags: [],
    onSelectCard: vi.fn(),
    onSelectTag: vi.fn(),
  };

  it('renders translated navigation and capture action', () => {
    render(
      <LocaleProvider locale="ro">
        <Header {...defaultProps} />
      </LocaleProvider>
    );

    expect(screen.getByRole('button', { name: /Triaj/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Panouri/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Rezumat/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Manuale/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Scânteie nouă/i })).toBeDefined();
    expect(screen.getByLabelText('Navigare principală')).toBeDefined();
  });
});
