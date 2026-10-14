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
    localStorage.clear();
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
    const expandBtn = screen.getByRole('button', { name: /Edit Custom Analysis config/i });
    fireEvent.click(expandBtn);

    // Click SWOT Analysis prompt starter
    const swotBtn = screen.getByRole('button', { name: /\+ SWOT Analysis/i });
    fireEvent.click(swotBtn);

    const textarea = screen.getByPlaceholderText(/Prompt instructions for this analysis step…/i) as HTMLTextAreaElement;
    expect(textarea.value).toContain('SWOT (Strengths, Weaknesses, Opportunities, Threats)');
  });

  it('allows standard steps (Planning, Landscape, Verdict) to be expanded and edited', async () => {
    render(<PlaybookManager showToast={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Default Research Pipeline')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /New Playbook/i }));

    // Choose Flagship 8-Step Deep Dive (recipe index 4)
    const deepDiveRecipe = PLAYBOOK_RECIPES.find((r) => r.id === 'deep_dive')!;
    const recipeIndex = PLAYBOOK_RECIPES.indexOf(deepDiveRecipe);
    const useBtns = screen.getAllByRole('button', { name: /Use this Recipe/i });
    fireEvent.click(useBtns[recipeIndex]);

    // 1. Expand and edit Planning standard step
    const editPlanBtn = screen.getByRole('button', { name: /Edit Question Planning config/i });
    fireEvent.click(editPlanBtn);

    const planNameInput = screen.getByLabelText(/Step Display Name/i) as HTMLInputElement;
    fireEvent.change(planNameInput, { target: { value: 'Advanced Architecture Planning' } });
    expect(screen.getByDisplayValue('Advanced Architecture Planning')).toBeDefined();

    const planHeadingInput = screen.getByLabelText(/Report Section Heading/i) as HTMLInputElement;
    fireEvent.change(planHeadingInput, { target: { value: 'Technical Architecture Strategy' } });
    expect(screen.getByDisplayValue('Technical Architecture Strategy')).toBeDefined();

    const planTextarea = screen.getByLabelText(/Instruction \/ Prompt/i) as HTMLTextAreaElement;
    fireEvent.change(planTextarea, { target: { value: 'Focus on distributed consensus protocols.' } });
    expect(planTextarea.value).toBe('Focus on distributed consensus protocols.');

    // 2. Expand and edit Landscape standard step (from Competitor recipe or add landscape)
    // Collapse plan
    fireEvent.click(screen.getByRole('button', { name: /Collapse Advanced Architecture Planning config/i }));

    // 3. Expand and edit Verdict standard step
    const editVerdictBtn = screen.getByRole('button', { name: /Edit Synthesis & Verdict config/i });
    fireEvent.click(editVerdictBtn);

    const verdictNameInput = screen.getByLabelText(/Step Display Name/i) as HTMLInputElement;
    fireEvent.change(verdictNameInput, { target: { value: 'Executive Decision Verdict' } });
    expect(screen.getByDisplayValue('Executive Decision Verdict')).toBeDefined();

    const verdictHeadingInput = screen.getByLabelText(/Report Section Heading/i) as HTMLInputElement;
    fireEvent.change(verdictHeadingInput, { target: { value: 'Investment & Feasibility Verdict' } });
    expect(screen.getByDisplayValue('Investment & Feasibility Verdict')).toBeDefined();

    const verdictTextarea = screen.getByLabelText(/Instruction \/ Prompt/i) as HTMLTextAreaElement;
    fireEvent.change(verdictTextarea, { target: { value: 'Provide explicit buy vs build recommendations.' } });
    expect(verdictTextarea.value).toBe('Provide explicit buy vs build recommendations.');
  });

  it('updates prompt instruction when quick prompt starter button is clicked on standard and custom steps', async () => {
    render(<PlaybookManager showToast={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Default Research Pipeline')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /New Playbook/i }));

    // Choose Competitor & Moat Teardown (index 0) which has Landscape, Custom, and Verdict
    const useBtns = screen.getAllByRole('button', { name: /Use this Recipe/i });
    fireEvent.click(useBtns[0]);

    // 1. Test Landscape standard step prompt starters
    const editLandscapeBtn = screen.getByRole('button', { name: /Edit Competitive Landscape config/i });
    fireEvent.click(editLandscapeBtn);

    const matrixChip = screen.getByRole('button', { name: /\+ 2x2 Feature Matrix/i });
    fireEvent.click(matrixChip);

    let textarea = screen.getByPlaceholderText(/Prompt instructions for this analysis step…/i) as HTMLTextAreaElement;
    expect(textarea.value).toContain('Construct a 2x2 competitive positioning matrix');

    const saasChip = screen.getByRole('button', { name: /\+ Open-Source vs SaaS/i });
    fireEvent.click(saasChip);
    expect(textarea.value).toContain('Compare open-source self-hosted alternatives');

    fireEvent.click(screen.getByRole('button', { name: /Collapse Competitive Landscape config/i }));

    // 2. Test Verdict standard step prompt starters
    const editVerdictBtn = screen.getByRole('button', { name: /Edit Synthesis & Verdict config/i });
    fireEvent.click(editVerdictBtn);

    const scorecardChip = screen.getByRole('button', { name: /\+ 10-Point Scorecard/i });
    fireEvent.click(scorecardChip);

    textarea = screen.getByPlaceholderText(/Prompt instructions for this analysis step…/i) as HTMLTextAreaElement;
    expect(textarea.value).toContain('Evaluate across a 10-point scorecard');

    const bearChip = screen.getByRole('button', { name: /\+ Bear Case Stress-Test/i });
    fireEvent.click(bearChip);
    expect(textarea.value).toContain('Stress-test the bear case scenario');

    fireEvent.click(screen.getByRole('button', { name: /Collapse Synthesis & Verdict config/i }));

    // 3. Test Custom step prompt starters
    const editCustomBtn = screen.getByRole('button', { name: /Edit Moat & Pricing Analysis config/i });
    fireEvent.click(editCustomBtn);

    const execBriefChip = screen.getByRole('button', { name: /\+ Executive Brief/i });
    fireEvent.click(execBriefChip);

    textarea = screen.getByPlaceholderText(/Prompt instructions for this analysis step…/i) as HTMLTextAreaElement;
    expect(textarea.value).toContain('Synthesize 3-5 high-priority strategic recommendations');
  });

  it('allows custom steps to be placed after verdict without validation errors', async () => {
    render(<PlaybookManager showToast={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Default Research Pipeline')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /New Playbook/i }));

    // Choose Competitor Teardown
    const useBtns = screen.getAllByRole('button', { name: /Use this Recipe/i });
    fireEvent.click(useBtns[0]);

    // In Competitor Teardown, Moat & Pricing Analysis is step 5, Synthesis & Verdict is step 6, Report is step 7
    // Move Moat & Pricing Analysis down past Verdict and Report
    const moveDownBtn = screen.getByRole('button', { name: /Move Moat & Pricing Analysis down/i });
    fireEvent.click(moveDownBtn); // Now after Verdict (position 6)
    fireEvent.click(moveDownBtn); // Now after Report (position 7)

    // Ensure no validation error for steps placed after verdict/report
    expect(screen.queryByText(/Verdict and Report steps must be placed at the end/i)).toBeNull();
    expect(screen.queryByText(/Validation Checklist/i)).toBeNull();

    // Save Playbook button should remain active
    const saveBtn = screen.getByRole('button', { name: /Save Playbook/i });
    expect((saveBtn as HTMLButtonElement).disabled).toBe(false);
  });

  it('saves step to library in localStorage and allows 1-click addition from Add Step modal', async () => {
    const mockToast = vi.fn();
    render(<PlaybookManager showToast={mockToast} />);

    await waitFor(() => {
      expect(screen.getByText('Default Research Pipeline')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /New Playbook/i }));

    // Choose Competitor Teardown
    const useBtns = screen.getAllByRole('button', { name: /Use this Recipe/i });
    fireEvent.click(useBtns[0]);

    // Expand Moat & Pricing Analysis step drawer
    const editBtn = screen.getByRole('button', { name: /Edit Moat & Pricing Analysis config/i });
    fireEvent.click(editBtn);

    // Click 'Save to Library'
    const saveLibBtn = screen.getByRole('button', { name: /Save to Library/i });
    fireEvent.click(saveLibBtn);

    // Verify toast notification
    expect(mockToast).toHaveBeenCalledWith('Saved "Moat & Pricing Analysis" to step library');

    // Verify localStorage content
    const rawSaved = localStorage.getItem('sparkkeep_user_step_library');
    expect(rawSaved).not.toBeNull();
    const parsed = JSON.parse(rawSaved!);
    expect(parsed.length).toBe(1);
    expect(parsed[0].name).toBe('Moat & Pricing Analysis');
    expect(parsed[0].heading).toBe('Pricing & Defensibility Moat');
    expect(parsed[0].tool_policy).toBe('search');
    expect(parsed[0].max_queries).toBe(2);
    expect(parsed[0].role).toBe('research_synthesis');

    // Open Add Step modal
    const addStepBtn = screen.getByRole('button', { name: /Add Step/i });
    fireEvent.click(addStepBtn);

    // Verify Custom Templates badge and item are rendered
    expect(screen.getByText('Custom Templates')).toBeDefined();
    const addTemplateBtn = screen.getAllByRole('button', { name: /Add to Playbook/i })[0];
    fireEvent.click(addTemplateBtn);

    // Verify toast and added step
    expect(mockToast).toHaveBeenCalledWith('Added step "Moat & Pricing Analysis" from library');
  });

  it('enforces 8,000 characters limit on step instruction in validation', async () => {
    render(<PlaybookManager showToast={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Default Research Pipeline')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /New Playbook/i }));

    const useBtns = screen.getAllByRole('button', { name: /Use this Recipe/i });
    fireEvent.click(useBtns[0]);

    // Expand Moat & Pricing Analysis
    const editBtn = screen.getByRole('button', { name: /Edit Moat & Pricing Analysis config/i });
    fireEvent.click(editBtn);

    const textarea = screen.getByPlaceholderText(/Prompt instructions for this analysis step…/i) as HTMLTextAreaElement;

    // Set instruction to 8,001 chars
    fireEvent.change(textarea, { target: { value: 'X'.repeat(8001) } });
    expect(screen.getByText(/Instruction exceeds 8,000 characters limit/i)).toBeDefined();

    // Set instruction to 8,000 chars
    fireEvent.change(textarea, { target: { value: 'X'.repeat(8000) } });
    expect(screen.queryByText(/Instruction exceeds 8,000 characters limit/i)).toBeNull();
  });
});
