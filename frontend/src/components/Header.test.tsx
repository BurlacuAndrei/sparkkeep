import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Header } from './Header';

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
    render(<Header {...defaultProps} />);

    expect(screen.getByRole('button', { name: /Triage/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Boards/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Digest/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Playbooks/i })).toBeDefined();
  });

  it('calls onViewModeChange("playbooks") when clicking the Playbooks tab', () => {
    const onViewModeChange = vi.fn();
    render(<Header {...defaultProps} onViewModeChange={onViewModeChange} />);

    const playbooksBtn = screen.getByRole('button', { name: /Playbooks/i });
    fireEvent.click(playbooksBtn);

    expect(onViewModeChange).toHaveBeenCalledWith('playbooks');
  });

  it('marks the Playbooks tab as active when viewMode is "playbooks"', () => {
    render(<Header {...defaultProps} viewMode="playbooks" />);

    const playbooksBtn = screen.getByRole('button', { name: /Playbooks/i });
    expect(playbooksBtn.className).toContain('active');
  });
});
