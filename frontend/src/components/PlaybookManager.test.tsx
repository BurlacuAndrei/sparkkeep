import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PlaybookManager, PLAYBOOK_RECIPES } from './PlaybookManager';

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api');
  return {
    ...actual,
    fetchPlaybooks: vi.fn().mockResolvedValue([
      {
        id: 1,
        name: 'Default Research Pipeline',
        description: 'Standard 8-step pipeline',
        is_builtin: true,
        card_types: [],
        version: 1,
        steps: [
          { position: 1, kind: 'ground', name: 'Grounding', enabled: true, config: {} },
          { position: 2, kind: 'report', name: 'Report Generation', enabled: true, config: {} },
        ],
      },
    ]),
    fetchStepLibrary: vi.fn().mockResolvedValue([]),
    getSettings: vi.fn().mockResolvedValue({ settings: { default_playbook_id: 1 } }),
    createPlaybook: vi.fn().mockResolvedValue({ id: 99, name: 'Saved Playbook' }),
  };
});

describe('PlaybookManager Recipe Archetypes & Prompt Freedom', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens recipe archetype picker modal when clicking New Playbook', async () => {
    render(<PlaybookManager showToast={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Default Research Pipeline')).toBeDefined();
    });

    const newBtn = screen.getByRole('button', { name: /New Playbook/i });
    fireEvent.click(newBtn);

    expect(screen.getByText('Choose Research Recipe Archetype')).toBeDefined();
    for (const recipe of PLAYBOOK_RECIPES) {
      expect(screen.getByText(recipe.name)).toBeDefined();
    }
  });

  it('selects a recipe archetype and loads its steps into the editor', async () => {
    render(<PlaybookManager showToast={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Default Research Pipeline')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /New Playbook/i }));

    // Choose Competitor Teardown
    const useBtns = screen.getAllByRole('button', { name: /Use this Recipe/i });
    expect(useBtns.length).toBe(PLAYBOOK_RECIPES.length);
    fireEvent.click(useBtns[0]); // Competitor Teardown

    // Should switch to edit mode with the recipe's title
    expect(screen.getByDisplayValue('Competitor & Moat Teardown')).toBeDefined();
    expect(screen.getByText(/Moat & Pricing Analysis/i)).toBeDefined();
  });

  it('inserts quick prompt starter into custom step prompt instruction', async () => {
    render(<PlaybookManager showToast={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Default Research Pipeline')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /New Playbook/i }));

    // Choose Blank Canvas (the last recipe)
    const useBtns = screen.getAllByRole('button', { name: /Use this Recipe/i });
    fireEvent.click(useBtns[useBtns.length - 1]);

    // Open Add Step modal
    const addStepBtn = screen.getByRole('button', { name: /Add Step/i });
    fireEvent.click(addStepBtn);

    // Switch to blank step tab
    fireEvent.click(screen.getByRole('button', { name: /Blank Custom Step/i }));
    fireEvent.click(screen.getByRole('button', { name: /Create Blank Custom Step/i }));

    // Expand custom step drawer
    const expandBtn = screen.getByTitle('Edit config');
    fireEvent.click(expandBtn);

    // Click SWOT Analysis prompt starter
    const swotBtn = screen.getByRole('button', { name: /\+ SWOT Analysis/i });
    fireEvent.click(swotBtn);

    const textarea = screen.getByPlaceholderText(/Prompt instructions for this analysis step…/i) as HTMLTextAreaElement;
    expect(textarea.value).toContain('SWOT (Strengths, Weaknesses, Opportunities, Threats)');
  });
});
