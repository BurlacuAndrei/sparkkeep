import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CardItem } from './CardItem';
import { CardActionsProvider, CardActions } from '../context/CardActionsContext';
import { LocaleProvider, Locale } from '../i18n';
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
    onUpdateCard: vi.fn(),
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

describe('CardItem Stage-Aware Cards & Inline Action Checklist (Ticket 02)', () => {
  let mockActions: CardActions;

  const createBaseCard = (overrides: Partial<Card>): Card => ({
    id: 100,
    title: 'Test Card',
    summary: 'Test summary',
    source_note: '',
    source_url: '',
    status: 'to-do',
    horizon: 'short-term',
    type: 'idea',
    tags: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  });

  beforeEach(() => {
    mockActions = {
      onSelectCard: vi.fn(),
      onStatusChange: vi.fn(),
      onResearch: vi.fn(),
      onRetry: vi.fn(),
      onUpdateCard: vi.fn(),
      showToast: vi.fn(),
    };
  });

  const renderWithProvider = (card: Card, density: 'comfortable' | 'compact' = 'comfortable', locale: Locale = 'en') => {
    return render(
      <LocaleProvider locale={locale}>
        <CardActionsProvider value={mockActions}>
          <CardItem card={card} density={density} />
        </CardActionsProvider>
      </LocaleProvider>
    );
  };

  it('renders Next Step preview on to-do card and promotes to in-progress with Undo on check', async () => {
    const card = createBaseCard({
      id: 202,
      title: 'Setup Distributed Logging',
      summary: 'Centralize structured logs for all cluster nodes',
      status: 'to-do',
      proposed_actions: ['Provision Vector agent', 'Configure Loki target', 'Deploy Grafana dashboard'],
      completed_actions: [],
      tags: ['ops'],
    });

    renderWithProvider(card);

    // Next step preview row should be visible
    const checkbox = screen.getByRole('checkbox', { name: /next: provision vector agent/i });
    expect(checkbox).toBeDefined();
    expect((checkbox as HTMLInputElement).checked).toBe(false);

    // Clicking checkbox checks it, mutates card, and triggers toast with Undo
    fireEvent.click(checkbox);

    expect(mockActions.onUpdateCard).toHaveBeenCalledWith(202, {
      status: 'in-progress',
      completed_actions: ['Provision Vector agent'],
    });
    expect(mockActions.showToast).toHaveBeenCalledWith(
      'Started #202 → In Progress',
      expect.any(Function)
    );
    expect(mockActions.onSelectCard).not.toHaveBeenCalled();

    // Verify 1-click Undo callback restores previous status and completed actions
    const undoCallback = (mockActions.showToast as any).mock.calls[0][1];
    expect(typeof undoCallback).toBe('function');
    await undoCallback();

    expect(mockActions.onUpdateCard).toHaveBeenCalledWith(202, {
      status: 'to-do',
      completed_actions: [],
    });
  });

  it('renders Next Step preview picking the first unchecked item when some are completed', () => {
    const card = createBaseCard({
      id: 202,
      title: 'Setup Distributed Logging',
      status: 'to-do',
      proposed_actions: ['Step 1 (done)', 'Step 2 (pending)', 'Step 3 (pending)'],
      completed_actions: ['Step 1 (done)'],
    });

    renderWithProvider(card);

    expect(screen.getByRole('checkbox', { name: /next: step 2 \(pending\)/i })).toBeDefined();
    expect(screen.queryByRole('checkbox', { name: /next: step 1/i })).toBeNull();
  });

  it('suppresses Next Step preview on to-do cards in compact density', () => {
    const card = createBaseCard({
      id: 202,
      title: 'Compact To Do Card',
      status: 'to-do',
      proposed_actions: ['Run migrations'],
      completed_actions: [],
    });

    renderWithProvider(card, 'compact');

    expect(screen.queryByRole('checkbox', { name: /next:/i })).toBeNull();
    // Compact count badge remains
    expect(screen.getByText('0/1 actions')).toBeDefined();
  });

  it('renders up to 2 unchecked steps and expands/collapses inline on in-progress cards', () => {
    const card = createBaseCard({
      id: 203,
      title: 'Deploy Production Cluster',
      status: 'in-progress',
      proposed_actions: ['Init Terraform', 'Apply VPC', 'Bootstrap K8s', 'Install Ingress', 'Verify DNS'],
      completed_actions: ['Init Terraform'],
    });

    renderWithProvider(card);

    // Initial collapsed state: shows 2 unchecked steps ('Apply VPC', 'Bootstrap K8s') and a +2 more steps button
    expect(screen.getByLabelText('Apply VPC')).toBeDefined();
    expect(screen.getByLabelText('Bootstrap K8s')).toBeDefined();
    expect(screen.queryByLabelText('Install Ingress')).toBeNull();
    expect(screen.queryByLabelText('Init Terraform')).toBeNull();

    // 4 unchecked steps - 2 visible = 2 more steps
    const expandBtn = screen.getByRole('button', { name: '+2 more steps' });
    expect(expandBtn).toBeDefined();

    // Click expand
    fireEvent.click(expandBtn);

    // All steps now rendered
    expect(screen.getByLabelText('Init Terraform')).toBeDefined();
    expect(screen.getByLabelText('Apply VPC')).toBeDefined();
    expect(screen.getByLabelText('Bootstrap K8s')).toBeDefined();
    expect(screen.getByLabelText('Install Ingress')).toBeDefined();
    expect(screen.getByLabelText('Verify DNS')).toBeDefined();

    // Button label switched to 'Show less'
    const collapseBtn = screen.getByRole('button', { name: 'Show less' });
    expect(collapseBtn).toBeDefined();

    // Click collapse
    fireEvent.click(collapseBtn);

    // Back to collapsed state
    expect(screen.queryByLabelText('Install Ingress')).toBeNull();
    expect(screen.getByRole('button', { name: '+2 more steps' })).toBeDefined();
  });

  it('updates completed_actions with Undo when toggling an intermediate step on an in-progress card', async () => {
    const card = createBaseCard({
      id: 203,
      title: 'Payment Integration',
      status: 'in-progress',
      proposed_actions: ['Create Stripe webhook', 'Add idempotent handler', 'Test refund flow'],
      completed_actions: ['Create Stripe webhook'],
    });

    renderWithProvider(card);

    const stepCheckbox = screen.getByLabelText('Add idempotent handler');
    expect((stepCheckbox as HTMLInputElement).checked).toBe(false);

    fireEvent.click(stepCheckbox);

    // Not final step -> updates completed_actions without moving status to done
    expect(mockActions.onUpdateCard).toHaveBeenCalledWith(203, {
      completed_actions: ['Create Stripe webhook', 'Add idempotent handler'],
    });
    expect(mockActions.showToast).toHaveBeenCalledWith(
      'Saved changes to card #203',
      expect.any(Function)
    );

    // Card should not receive completion celebration
    const cardArticle = screen.getByRole('article');
    expect(cardArticle.className).not.toContain('is-completing-celebration');

    // Test Undo restores prior completed_actions
    const undoCallback = (mockActions.showToast as any).mock.calls[0][1];
    await undoCallback();

    expect(mockActions.onUpdateCard).toHaveBeenCalledWith(203, {
      completed_actions: ['Create Stripe webhook'],
    });
  });

  it('triggers celebration payoff, moves to done, and provides Undo when checking final step', async () => {
    const card = createBaseCard({
      id: 204,
      title: 'Database Failover Drill',
      status: 'in-progress',
      proposed_actions: ['Promote standby replica', 'Update connection strings'],
      completed_actions: ['Promote standby replica'],
    });

    renderWithProvider(card);

    const finalCheckbox = screen.getByLabelText('Update connection strings');
    fireEvent.click(finalCheckbox);

    // Final step triggers celebratory class
    const cardArticle = screen.getByRole('article');
    expect(cardArticle.className).toContain('is-completing-celebration');

    // Updates status to 'done' and completed_actions in one mutation
    expect(mockActions.onUpdateCard).toHaveBeenCalledWith(204, {
      status: 'done',
      completed_actions: ['Promote standby replica', 'Update connection strings'],
    });

    // Toast with Undo
    expect(mockActions.showToast).toHaveBeenCalledWith(
      'All steps completed! Moved #204 → Done',
      expect.any(Function)
    );

    // Undo restores status: 'in-progress' and prior completed_actions
    const undoCallback = (mockActions.showToast as any).mock.calls[0][1];
    await undoCallback();

    expect(mockActions.onUpdateCard).toHaveBeenCalledWith(204, {
      status: 'in-progress',
      completed_actions: ['Promote standby replica'],
    });
  });

  it('omits multi-row checklist on done cards in favor of compact indicator', () => {
    const card = createBaseCard({
      id: 205,
      title: 'Completed Card',
      status: 'done',
      proposed_actions: ['Step 1', 'Step 2'],
      completed_actions: ['Step 1', 'Step 2'],
    });

    renderWithProvider(card);

    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /more steps/i })).toBeNull();
    expect(screen.getByText('Completed')).toBeDefined();
    expect(screen.getByText('2/2')).toBeDefined();
  });

  it('omits multi-row checklist on in-progress cards in compact density mode', () => {
    const card = createBaseCard({
      id: 206,
      title: 'Compact In-Progress Card',
      status: 'in-progress',
      proposed_actions: ['Step A', 'Step B', 'Step C'],
      completed_actions: ['Step A'],
    });

    renderWithProvider(card, 'compact');

    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /more steps/i })).toBeNull();
    expect(screen.getByText('1/3 done')).toBeDefined();
  });
});

