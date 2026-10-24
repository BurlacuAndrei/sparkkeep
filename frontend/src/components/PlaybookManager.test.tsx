import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PlaybookManager, PLAYBOOK_TEMPLATES } from './PlaybookManager';
import { LocaleProvider } from '../i18n';
import * as api from '../api';

const renderLocalized = (ui: React.ReactElement) =>
  render(<LocaleProvider locale="en">{ui}</LocaleProvider>);

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
    getSettings: vi.fn().mockResolvedValue({
      settings: {
        default_playbook_id: 1,
        card_types: ['tool', 'product', 'company', 'article', 'idea', 'repo', 'paper'],
      },
    }),
    createPlaybook: vi.fn().mockResolvedValue({ id: 99, name: 'Saved Playbook' }),
    updatePlaybook: vi.fn().mockResolvedValue({ id: 1, name: 'Updated Playbook' }),
    patchSettings: vi.fn().mockResolvedValue({ ok: true }),
  };
});

describe('PlaybookManager Playbook Templates & Prompt Freedom', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('opens builder canvas directly with default lean starter when clicking New Playbook', async () => {
    renderLocalized(<PlaybookManager showToast={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Default Research Pipeline')).toBeDefined();
    });

    const newBtn = screen.getByRole('button', { name: /New Playbook/i });
    fireEvent.click(newBtn);

    // Modal should NOT open immediately
    expect(screen.queryByText('Playbook Template Gallery')).toBeNull();

    // Canvas input fields & default lean starter steps should be displayed
    expect(screen.getByLabelText(/Playbook Name/i)).toBeDefined();
    expect(screen.getByDisplayValue('New Custom Playbook')).toBeDefined();
    expect(screen.getByLabelText(/Description/i)).toBeDefined();

    // Lean starter steps: Grounding + Targeted Search + Custom Analysis + Briefing Report
    expect(screen.getAllByText('Grounding')[0]).toBeDefined();
    expect(screen.getByText('Targeted Search')).toBeDefined();
    expect(screen.getByText('Custom Analysis')).toBeDefined();
    expect(screen.getByText('Briefing Report')).toBeDefined();

    // Builder header controls
    expect(screen.getByRole('button', { name: /Load Template/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Export JSON/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Import JSON/i })).toBeDefined();
    expect(screen.getByLabelText(/Set as Platform Default/i)).toBeDefined();
  });

  it('selects a playbook template archetype and loads its steps into the editor via Load Template', async () => {
    renderLocalized(<PlaybookManager showToast={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Default Research Pipeline')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /New Playbook/i }));

    // Click 'Load Template' inside the builder canvas
    const loadTplBtn = screen.getByRole('button', { name: /Load Template/i });
    fireEvent.click(loadTplBtn);

    // Modal should now be open
    expect(screen.getByText('Playbook Template Gallery')).toBeDefined();

    // Choose Competitor Teardown
    const useBtns = screen.getAllByRole('button', { name: /Use this Template/i });
    expect(useBtns.length).toBe(PLAYBOOK_TEMPLATES.length);
    fireEvent.click(useBtns[0]); // Competitor Teardown

    // Should load the template's title and steps
    expect(screen.getByDisplayValue('Competitor & Moat Teardown')).toBeDefined();
    expect(screen.getByText(/Moat & Pricing Analysis/i)).toBeDefined();
  });

  it('inserts quick prompt starter into custom step prompt instruction', async () => {
    renderLocalized(<PlaybookManager showToast={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Default Research Pipeline')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /New Playbook/i }));

    // Step 3 in lean starter is already 'Custom Analysis'
    const expandBtn = screen.getByRole('button', { name: /Edit Custom Analysis config/i });
    fireEvent.click(expandBtn);

    // Click SWOT Analysis prompt starter
    const swotBtn = screen.getByRole('button', { name: /\+ SWOT Analysis/i });
    fireEvent.click(swotBtn);

    const textarea = screen.getByPlaceholderText(/Prompt instructions for this step…/i) as HTMLTextAreaElement;
    expect(textarea.value).toContain('SWOT (Strengths, Weaknesses, Opportunities, Threats)');
  });

  it('allows standard steps (Planning, Landscape, Verdict) to be expanded and edited with all transparent step primitives', async () => {
    renderLocalized(<PlaybookManager showToast={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Default Research Pipeline')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /New Playbook/i }));

    // Open template picker and choose Flagship 8-Step Deep Dive (template index 4)
    fireEvent.click(screen.getByRole('button', { name: /Load Template/i }));
    const deepDiveTpl = PLAYBOOK_TEMPLATES.find((r) => r.id === 'deep_dive')!;
    const tplIndex = PLAYBOOK_TEMPLATES.indexOf(deepDiveTpl);
    const useBtns = screen.getAllByRole('button', { name: /Use this Template/i });
    fireEvent.click(useBtns[tplIndex]);

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

    // Edit tool policy and max queries on standard step
    const toolPolicySelect = screen.getByLabelText(/Tool Policy/i) as HTMLSelectElement;
    fireEvent.change(toolPolicySelect, { target: { value: 'search' } });
    expect(toolPolicySelect.value).toBe('search');

    const maxQueriesInput = screen.getByLabelText(/Max Search Queries/i) as HTMLInputElement;
    fireEvent.change(maxQueriesInput, { target: { value: '3' } });
    expect(maxQueriesInput.value).toBe('3');

    // Toggle Input Binding checkbox
    const refsBindingCheckbox = screen.getByLabelText(/Input binding references/i) as HTMLInputElement;
    fireEvent.click(refsBindingCheckbox);

    // Edit LLM Role
    const roleSelect = screen.getByLabelText(/LLM Role/i) as HTMLSelectElement;
    fireEvent.change(roleSelect, { target: { value: 'research_plan' } });
    expect(roleSelect.value).toBe('research_plan');

    // Collapse plan
    fireEvent.click(screen.getByRole('button', { name: /Collapse Advanced Architecture Planning config/i }));

    // 2. Expand and edit Verdict standard step
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
    renderLocalized(<PlaybookManager showToast={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Default Research Pipeline')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /New Playbook/i }));

    // Load Competitor Teardown template
    fireEvent.click(screen.getByRole('button', { name: /Load Template/i }));
    const useBtns = screen.getAllByRole('button', { name: /Use this Template/i });
    fireEvent.click(useBtns[0]);

    // 1. Test Landscape standard step prompt starters
    const editLandscapeBtn = screen.getByRole('button', { name: /Edit Competitive Landscape config/i });
    fireEvent.click(editLandscapeBtn);

    const matrixChip = screen.getByRole('button', { name: /\+ 2x2 Feature Matrix/i });
    fireEvent.click(matrixChip);

    let textarea = screen.getByPlaceholderText(/Prompt instructions for this step…/i) as HTMLTextAreaElement;
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

    textarea = screen.getByPlaceholderText(/Prompt instructions for this step…/i) as HTMLTextAreaElement;
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

    textarea = screen.getByPlaceholderText(/Prompt instructions for this step…/i) as HTMLTextAreaElement;
    expect(textarea.value).toContain('Synthesize 3-5 high-priority strategic recommendations');
  });

  it('allows custom steps to be placed after verdict without validation errors', async () => {
    renderLocalized(<PlaybookManager showToast={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Default Research Pipeline')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /New Playbook/i }));

    // Load Competitor Teardown
    fireEvent.click(screen.getByRole('button', { name: /Load Template/i }));
    const useBtns = screen.getAllByRole('button', { name: /Use this Template/i });
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
    renderLocalized(<PlaybookManager showToast={mockToast} />);

    await waitFor(() => {
      expect(screen.getByText('Default Research Pipeline')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /New Playbook/i }));

    // Load Competitor Teardown
    fireEvent.click(screen.getByRole('button', { name: /Load Template/i }));
    const useBtns = screen.getAllByRole('button', { name: /Use this Template/i });
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
    renderLocalized(<PlaybookManager showToast={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Default Research Pipeline')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /New Playbook/i }));

    // Expand Custom Analysis
    const editBtn = screen.getByRole('button', { name: /Edit Custom Analysis config/i });
    fireEvent.click(editBtn);

    const textarea = screen.getByPlaceholderText(/Prompt instructions for this step…/i) as HTMLTextAreaElement;

    // Set instruction to 8,001 chars
    fireEvent.change(textarea, { target: { value: 'X'.repeat(8001) } });
    expect(screen.getByText(/Instruction exceeds 8,000 characters limit/i)).toBeDefined();

    // Set instruction to 8,000 chars
    fireEvent.change(textarea, { target: { value: 'X'.repeat(8000) } });
    expect(screen.queryByText(/Instruction exceeds 8,000 characters limit/i)).toBeNull();
  });

  it('populates card types chips dynamically from settings and persists selection on save', async () => {
    vi.mocked(api.getSettings).mockResolvedValueOnce({
      ok: true,
      settings: {
        has_llm_key: true,
        has_auth_token: true,
        default_playbook_id: 1,
        card_types: ['hardware', 'firmware', 'biotech'],
      },
    });

    renderLocalized(<PlaybookManager showToast={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Default Research Pipeline')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /New Playbook/i }));

    // Chips should reflect settings card_types
    expect(screen.getByRole('button', { name: 'hardware' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'firmware' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'biotech' })).toBeDefined();

    // Clicking chips toggles selection and persists when saved
    const hwChip = screen.getByRole('button', { name: 'hardware' });
    const bioChip = screen.getByRole('button', { name: 'biotech' });
    expect(hwChip.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(hwChip);
    fireEvent.click(bioChip);
    expect(hwChip.getAttribute('aria-pressed')).toBe('true');
    expect(bioChip.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: /Save Playbook/i }));

    await waitFor(() => {
      expect(api.createPlaybook).toHaveBeenCalledWith(
        expect.objectContaining({
          card_types: ['hardware', 'biotech'],
        })
      );
    });
  });

  it('falls back to canonical backend default card types when settings has no custom card_types', async () => {
    vi.mocked(api.getSettings).mockResolvedValueOnce({
      ok: true,
      settings: {
        has_llm_key: true,
        has_auth_token: true,
        default_playbook_id: 1,
        card_types: [],
      },
    });

    renderLocalized(<PlaybookManager showToast={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Default Research Pipeline')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /New Playbook/i }));

    const canonicalTypes = ['article', 'video', 'book', 'guide', 'product', 'place', 'idea', 'quote'];
    for (const type of canonicalTypes) {
      expect(screen.getByRole('button', { name: new RegExp(`^${type}$`, 'i') })).toBeDefined();
    }

    // Legacy non-canonical types must not appear
    expect(screen.queryByRole('button', { name: 'reading' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'architecture' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'research' })).toBeNull();
  });

  it('handles Set as Platform Default toggle when saving playbook', async () => {
    renderLocalized(<PlaybookManager showToast={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('Default Research Pipeline')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /New Playbook/i }));

    const defaultToggle = screen.getByLabelText(/Set as Platform Default/i) as HTMLInputElement;
    expect(defaultToggle.checked).toBe(false);

    // Toggle on
    fireEvent.click(defaultToggle);
    expect(defaultToggle.checked).toBe(true);
    expect(screen.getByText('★ Platform Default')).toBeDefined();

    // Save playbook
    const saveBtn = screen.getByRole('button', { name: /Save Playbook/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(api.createPlaybook).toHaveBeenCalled();
      expect(api.patchSettings).toHaveBeenCalledWith({ default_playbook_id: 99 });
    });
  });

  it('supports Export JSON and Import JSON workflow with validation', async () => {
    const mockToast = vi.fn();
    renderLocalized(<PlaybookManager showToast={mockToast} />);

    await waitFor(() => {
      expect(screen.getByText('Default Research Pipeline')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /New Playbook/i }));

    // Test Export JSON
    const exportBtn = screen.getByRole('button', { name: /Export JSON/i });
    fireEvent.click(exportBtn);
    expect(mockToast).toHaveBeenCalledWith('Playbook JSON exported');

    // Test Import JSON
    const importBtn = screen.getByRole('button', { name: /Import JSON/i });
    fireEvent.click(importBtn);

    expect(screen.getByText('Import Playbook JSON')).toBeDefined();

    const importTextarea = screen.getByLabelText(/Playbook JSON input/i) as HTMLTextAreaElement;
    const loadBtn = screen.getByRole('button', { name: /Import and Load/i });

    // 1. Empty JSON validation
    fireEvent.click(loadBtn);
    expect(screen.getByText('Please paste valid JSON.')).toBeDefined();

    // 2. Syntax error validation
    fireEvent.change(importTextarea, { target: { value: '{ invalid: json' } });
    fireEvent.click(loadBtn);
    expect(screen.getByText(/JSON parse error/i)).toBeDefined();

    // 3. Missing name validation
    fireEvent.change(importTextarea, { target: { value: JSON.stringify({ description: 'No name', steps: [{ name: 'Step 1' }] }) } });
    fireEvent.click(loadBtn);
    expect(screen.getByText('Playbook name is required in JSON.')).toBeDefined();

    // 4. Missing steps validation
    fireEvent.change(importTextarea, { target: { value: JSON.stringify({ name: 'Empty Steps', steps: [] }) } });
    fireEvent.click(loadBtn);
    expect(screen.getByText('Playbook must contain a non-empty "steps" array.')).toBeDefined();

    // 5. Valid import
    const validPlaybookJSON = {
      name: 'Imported Quantum Pipeline',
      description: 'Pipeline evaluating quantum computing architectures',
      card_types: ['tool', 'article'],
      steps: [
        {
          position: 1,
          kind: 'ground',
          name: 'Quantum Grounding',
          enabled: true,
          config: { output_heading: 'Quantum Context' },
        },
        {
          position: 2,
          kind: 'custom',
          name: 'QPU Benchmark Analysis',
          enabled: true,
          config: {
            output_heading: 'QPU Benchmarks',
            instruction: 'Evaluate circuit depth and gate fidelities.',
            tool_policy: 'search',
            max_queries: 3,
            role: 'research_synthesis',
          },
        },
      ],
    };

    fireEvent.change(importTextarea, { target: { value: JSON.stringify(validPlaybookJSON) } });
    fireEvent.click(loadBtn);

    // Modal should close and imported content should appear on canvas
    expect(screen.queryByText('Import Playbook JSON')).toBeNull();
    expect(mockToast).toHaveBeenCalledWith('Successfully imported "Imported Quantum Pipeline"');

    expect(screen.getByDisplayValue('Imported Quantum Pipeline')).toBeDefined();
    expect(screen.getByDisplayValue('Pipeline evaluating quantum computing architectures')).toBeDefined();
    expect(screen.getByText('Quantum Grounding')).toBeDefined();
    expect(screen.getByText('QPU Benchmark Analysis')).toBeDefined();
  });

  it('browses visual Template Gallery by research domains, displaying 5-pillar badges and budget estimates', async () => {
    const mockToast = vi.fn();
    renderLocalized(<PlaybookManager showToast={mockToast} />);

    await waitFor(() => {
      expect(screen.getByText('Default Research Pipeline')).toBeDefined();
    });

    fireEvent.click(screen.getByRole('button', { name: /New Playbook/i }));

    // Open Template Gallery
    fireEvent.click(screen.getByRole('button', { name: /Load Template/i }));

    // Verify modal header & title
    expect(screen.getByText('Playbook Template Gallery')).toBeDefined();
    expect(
      screen.getByText(/Select a domain-tailored research pipeline archetype or clone a built-in playbook into your builder canvas/i)
    ).toBeDefined();

    // Verify all domain tabs exist
    expect(screen.getByRole('tab', { name: /All/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Market Intelligence/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Due Diligence & Risk/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Academic & Science/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /Fast Fact-Check/i })).toBeDefined();
    expect(screen.getByRole('tab', { name: /General/i })).toBeDefined();

    // All templates should initially be visible
    expect(screen.getByText('Competitor & Moat Teardown')).toBeDefined();
    expect(screen.getByText('Investment & Risk Due Diligence')).toBeDefined();
    expect(screen.getByText('Academic & Literature Review')).toBeDefined();
    expect(screen.getByText('Fast Fact Check & Claim Verification')).toBeDefined();

    // Verify budget estimates & 5-pillar indicators
    expect(screen.getByText('🪙 ~$0.04')).toBeDefined();
    expect(screen.getByText('⏱️ ~12s')).toBeDefined();

    // Filter by Academic & Science
    fireEvent.click(screen.getByRole('tab', { name: /Academic & Science/i }));
    expect(screen.getByText('Academic & Literature Review')).toBeDefined();
    expect(screen.queryByText('Competitor & Moat Teardown')).toBeNull();
    expect(screen.queryByText('Investment & Risk Due Diligence')).toBeNull();

    // Filter by Fast Fact-Check
    fireEvent.click(screen.getByRole('tab', { name: /Fast Fact-Check/i }));
    expect(screen.getByText('Fast Fact Check & Claim Verification')).toBeDefined();
    expect(screen.queryByText('Academic & Literature Review')).toBeNull();

    // 1-click "Use this Template" loads it into canvas
    const useBtn = screen.getByRole('button', { name: /Use this Template: Fast Fact Check & Claim Verification/i });
    fireEvent.click(useBtn);

    // Modal closes and canvas updates
    expect(screen.queryByText('Playbook Template Gallery')).toBeNull();
    expect(screen.getByDisplayValue('Fast Fact Check & Claim Verification')).toBeDefined();
    expect(screen.getByText('Evidence Search')).toBeDefined();
    expect(mockToast).toHaveBeenCalledWith('Loaded "Fast Fact Check & Claim Verification" template');
  });

  describe('Client-Side Dry-Run Inspector & Real-Time Prompt Preview', () => {
    it('toggles Dry-Run Inspector, displays compiled prompts and planned queries for fallback card with zero cost', async () => {
      renderLocalized(<PlaybookManager showToast={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Default Research Pipeline')).toBeDefined();
      });

      fireEvent.click(screen.getByRole('button', { name: /New Playbook/i }));

      // Click Dry-Run Preview toggle in top toolbar
      const toggleBtn = screen.getByRole('button', { name: /Dry-Run Inspector/i });
      fireEvent.click(toggleBtn);

      // Verify Dry-Run Inspector panel is rendered
      expect(screen.getByLabelText('Dry-Run Inspector Panel')).toBeDefined();
      expect(screen.getByText(/\$0 Token Cost · 0ms Latency/i)).toBeDefined();

      // Card picker should default to Neon Serverless Postgres
      expect(screen.getByLabelText(/Select Card for Dry-Run/i)).toBeDefined();
      expect(screen.getByText('Neon Serverless Postgres')).toBeDefined();

      // Verify compiled steps in the deck
      expect(screen.getByTestId('dryrun-step-1')).toBeDefined();
      expect(screen.getByTestId('dryrun-step-2')).toBeDefined();

      // Step 1 Grounding prompt contains card context
      const step1Card = screen.getByTestId('dryrun-step-1');
      expect(step1Card.textContent).toContain('Neon Serverless Postgres');
      expect(step1Card.textContent).toContain('https://neon.tech');

      // Step 2 Targeted Search contains planned query
      const step2Card = screen.getByTestId('dryrun-step-2');
      expect(step2Card.textContent).toContain('Planned Web Queries');
      expect(step2Card.textContent).toContain('"Neon Serverless Postgres" tool architecture');

      // Toggle back to Health Inspector
      const healthTab = screen.getByRole('tab', { name: /Health Inspector/i });
      fireEvent.click(healthTab);
      expect(screen.getByLabelText('Research Health Inspector')).toBeDefined();
    });

    it('switches test cards and re-compiles prompt variables and search query plans dynamically in real time', async () => {
      renderLocalized(<PlaybookManager showToast={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Default Research Pipeline')).toBeDefined();
      });

      fireEvent.click(screen.getByRole('button', { name: /New Playbook/i }));

      // Switch to Dry-Run via dock tab
      const dryRunTab = screen.getByRole('tab', { name: /Dry-Run Inspector/i });
      fireEvent.click(dryRunTab);

      // Select DeepSeek-R1 test card
      const cardSelect = screen.getByLabelText(/Select Card for Dry-Run/i);
      fireEvent.change(cardSelect, { target: { value: '-2' } });

      // Verify prompt and queries dynamically update
      expect(screen.getByText('DeepSeek-R1 Technical Report')).toBeDefined();
      const step2Card = screen.getByTestId('dryrun-step-2');
      expect(step2Card.textContent).toContain('"DeepSeek-R1 Technical Report" paper architecture');
    });

    it('supports custom saved cards passed via props in Dry-Run Inspector', async () => {
      const customCards = [
        {
          id: 777,
          title: 'Antigravity Workspace Engine',
          source_url: 'https://antigravity.dev',
          type: 'tool',
          summary: 'Next-gen agentic pairing environment for deep modules.',
          horizon: 'short-term' as const,
          status: 'inbox' as const,
          source_note: 'Proprietary core engine',
          tags: ['agent', 'dev'],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      renderLocalized(<PlaybookManager showToast={vi.fn()} cards={customCards} />);

      await waitFor(() => {
        expect(screen.getByText('Default Research Pipeline')).toBeDefined();
      });

      fireEvent.click(screen.getByRole('button', { name: /New Playbook/i }));

      // Switch to Dry-Run
      fireEvent.click(screen.getByRole('tab', { name: /Dry-Run Inspector/i }));

      // Select custom card
      const cardSelect = screen.getByLabelText(/Select Card for Dry-Run/i);
      fireEvent.change(cardSelect, { target: { value: '777' } });

      // Verify custom card details rendered and compiled
      expect(screen.getByText('Antigravity Workspace Engine')).toBeDefined();
      const step1Card = screen.getByTestId('dryrun-step-1');
      expect(step1Card.textContent).toContain('Antigravity Workspace Engine');
      expect(step1Card.textContent).toContain('https://antigravity.dev');
    });
  });

  describe('Research Health Inspector & Soft Linter', () => {
    it('calculates 5-Pillar readiness score and updates dynamically when steps are toggled', async () => {
      renderLocalized(<PlaybookManager showToast={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Default Research Pipeline')).toBeDefined();
      });

      fireEvent.click(screen.getByRole('button', { name: /New Playbook/i }));

      // Persistent dock should be present
      expect(screen.getByLabelText('Research Health Inspector')).toBeDefined();

      // Default lean starter has Grounding, Targeted Search, Custom Analysis, Briefing Report
      // Grounding (ready), Retrieval (ready), Delivery (ready); Extraction (missing), Verification (missing)
      const badge = screen.getByTestId('health-score-badge');
      expect(badge.textContent).toBe('3 / 5 Incomplete');

      // Toggle Grounding off (step 1 toggle)
      const stepToggles = screen.getAllByTitle('Toggle step enabled');
      const firstStepCheckbox = stepToggles[0].querySelector('input')!;
      expect(firstStepCheckbox.checked).toBe(true);
      fireEvent.click(firstStepCheckbox);

      // Score should now be 2 / 5 Incomplete (Grounding is disabled)
      expect(badge.textContent).toBe('2 / 5 Incomplete');

      // Re-enable Grounding
      fireEvent.click(firstStepCheckbox);
      expect(badge.textContent).toBe('3 / 5 Incomplete');
    });

    it('displays non-blocking advisory warnings for missing pillars and keeps save enabled', async () => {
      renderLocalized(<PlaybookManager showToast={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Default Research Pipeline')).toBeDefined();
      });

      fireEvent.click(screen.getByRole('button', { name: /New Playbook/i }));

      // In lean starter, missing Extraction and Verification advisories should be displayed
      expect(screen.getByText('Unextracted Sources')).toBeDefined();
      expect(screen.getByText(/Discovered web links will not be scraped/i)).toBeDefined();
      expect(screen.getByText('Unverified Claims')).toBeDefined();
      expect(screen.getByText(/Findings will not be cross-verified against source citations/i)).toBeDefined();

      // Save button must NOT be disabled by soft linter warnings
      const saveBtn = screen.getByRole('button', { name: /Save Playbook/i }) as HTMLButtonElement;
      expect(saveBtn.disabled).toBe(false);

      // Load Flagship 8-Step Deep Dive (which satisfies all 5 pillars)
      fireEvent.click(screen.getByRole('button', { name: /Load Template/i }));
      const deepDiveTpl = PLAYBOOK_TEMPLATES.find((r) => r.id === 'deep_dive')!;
      const tplIndex = PLAYBOOK_TEMPLATES.indexOf(deepDiveTpl);
      const useBtns = screen.getAllByRole('button', { name: /Use this Template/i });
      fireEvent.click(useBtns[tplIndex]);

      // Badge should be 5 / 5 Pillars Ready
      const badge = screen.getByTestId('health-score-badge');
      expect(badge.textContent).toBe('5 / 5 Pillars Ready');

      // Advisory clean message is shown
      expect(screen.getByText(/All 5 research pillars ready\. Rigorous, hallucination-resistant methodology verified\./i)).toBeDefined();
    });

    it('inserts recommended steps at optimal positions using 1-click auto-fix buttons', async () => {
      const mockToast = vi.fn();
      renderLocalized(<PlaybookManager showToast={mockToast} />);

      await waitFor(() => {
        expect(screen.getByText('Default Research Pipeline')).toBeDefined();
      });

      fireEvent.click(screen.getByRole('button', { name: /New Playbook/i }));

      // Lean starter missing Extraction and Verification
      const badge = screen.getByTestId('health-score-badge');
      expect(badge.textContent).toBe('3 / 5 Incomplete');

      // 1. Auto-fix Extraction via '+ Insert Source Reader'
      const insertReaderBtn = screen.getByRole('button', { name: /\+ Insert Source Reader/i });
      fireEvent.click(insertReaderBtn);

      expect(mockToast).toHaveBeenCalledWith('Inserted Source Reader step');
      expect(screen.getByText('Source Reader')).toBeDefined();
      // Score should advance to 4 / 5 Incomplete
      expect(badge.textContent).toBe('4 / 5 Incomplete');

      // 2. Auto-fix Verification via '+ Insert Claims Verification'
      const insertClaimsBtn = screen.getByRole('button', { name: /\+ Insert Claims Verification/i });
      fireEvent.click(insertClaimsBtn);

      expect(mockToast).toHaveBeenCalledWith('Inserted Claims Verification step');
      expect(screen.getByText('Claims Verification')).toBeDefined();
      // All 5 pillars now satisfied!
      expect(badge.textContent).toBe('5 / 5 Pillars Ready');

      // 3. Delete Grounding to verify '+ Insert Grounding'
      const deleteGroundBtn = screen.getByRole('button', { name: /Delete Grounding/i });
      fireEvent.click(deleteGroundBtn);
      expect(badge.textContent).toBe('4 / 5 Incomplete');
      expect(screen.getByText('Context Not Anchored')).toBeDefined();

      const insertGroundBtn = screen.getByRole('button', { name: /\+ Insert Grounding/i });
      fireEvent.click(insertGroundBtn);
      expect(mockToast).toHaveBeenCalledWith('Inserted Grounding step');
      expect(badge.textContent).toBe('5 / 5 Pillars Ready');

      // 4. Delete Targeted Search to verify '+ Insert Web Search'
      const deleteSearchBtn = screen.getByRole('button', { name: /Delete Targeted Search/i });
      fireEvent.click(deleteSearchBtn);
      expect(badge.textContent).toBe('4 / 5 Incomplete');
      expect(screen.getByText('Hallucination Risk')).toBeDefined();

      const insertSearchBtn = screen.getByRole('button', { name: /\+ Insert Web Search/i });
      fireEvent.click(insertSearchBtn);
      expect(mockToast).toHaveBeenCalledWith('Inserted Web Search step');
      expect(badge.textContent).toBe('5 / 5 Pillars Ready');

      // 5. Delete Briefing Report to verify '+ Insert Briefing Report'
      const deleteReportBtn = screen.getByRole('button', { name: /Delete Briefing Report/i });
      fireEvent.click(deleteReportBtn);
      expect(badge.textContent).toBe('4 / 5 Incomplete');
      expect(screen.getByText('No Delivery Step')).toBeDefined();

      const insertReportBtn = screen.getByRole('button', { name: /\+ Insert Briefing Report/i });
      fireEvent.click(insertReportBtn);
      expect(mockToast).toHaveBeenCalledWith('Inserted Briefing Report step');
      expect(badge.textContent).toBe('5 / 5 Pillars Ready');
    });

    it('calculates dynamic token usage, web fetches, and latency estimates in real time', async () => {
      renderLocalized(<PlaybookManager showToast={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Default Research Pipeline')).toBeDefined();
      });

      fireEvent.click(screen.getByRole('button', { name: /New Playbook/i }));

      // Lean starter estimates
      expect(screen.getByTestId('est-llm-calls').textContent).toBe('≈ 2');
      expect(screen.getByTestId('est-fetches').textContent).toBe('≈ 6');
      expect(screen.getByTestId('est-tokens').textContent).toBe('~2.5k–6.0k tokens');
      expect(screen.getByTestId('est-latency').textContent).toBe('~10–22s');

      // Add Source Reader (5 fetches, ~1.0k-2.2k tokens, 4-8s latency)
      fireEvent.click(screen.getByRole('button', { name: /\+ Insert Source Reader/i }));

      expect(screen.getByTestId('est-llm-calls').textContent).toBe('≈ 2');
      expect(screen.getByTestId('est-fetches').textContent).toBe('≈ 11');
      expect(screen.getByTestId('est-tokens').textContent).toBe('~3.5k–8.2k tokens');
      expect(screen.getByTestId('est-latency').textContent).toBe('~14–30s');

      // Add Claims Verification (1 llm call, ~600-1500 tokens, 4-7s latency)
      fireEvent.click(screen.getByRole('button', { name: /\+ Insert Claims Verification/i }));

      expect(screen.getByTestId('est-llm-calls').textContent).toBe('≈ 3');
      expect(screen.getByTestId('est-fetches').textContent).toBe('≈ 11');
      expect(screen.getByTestId('est-tokens').textContent).toBe('~4.1k–9.7k tokens');
      expect(screen.getByTestId('est-latency').textContent).toBe('~18–37s');
    });
  });

  describe('Visual Pipeline Timeline & In-Place Focused Step Editor', () => {
    it('renders pipeline steps as connected timeline nodes with connector rails, stage badges, and tool policy chips', async () => {
      renderLocalized(<PlaybookManager showToast={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Default Research Pipeline')).toBeDefined();
      });

      fireEvent.click(screen.getByRole('button', { name: /New Playbook/i }));

      // Timeline container and connector rails should render
      const timeline = screen.getByTestId('pipeline-timeline');
      expect(timeline).toBeDefined();
      const rails = timeline.querySelectorAll('.pb-timeline-rail');
      expect(rails.length).toBe(3); // 3 connector rails between 4 steps

      // Stage badges for the 4 starter steps
      expect(screen.getByTestId('step-stage-badge-0').textContent).toMatch(/Grounding/i);
      expect(screen.getByTestId('step-stage-badge-1').textContent).toMatch(/Retrieval/i);
      expect(screen.getByTestId('step-stage-badge-2').textContent).toMatch(/Synthesis/i);
      expect(screen.getByTestId('step-stage-badge-3').textContent).toMatch(/Delivery/i);

      // Tool policy chips: step 1 (Targeted Search) has Web Search with query count, others have Source Reasoning
      expect(screen.getByTestId('step-tool-chip-0').textContent).toContain('🧠 Source Reasoning');
      expect(screen.getByTestId('step-tool-chip-1').textContent).toContain('🔍 Web Search (2 queries)');
      expect(screen.getByTestId('step-tool-chip-2').textContent).toContain('🧠 Source Reasoning');
      expect(screen.getByTestId('step-tool-chip-3').textContent).toContain('🧠 Source Reasoning');
    });

    it('expands in-place focused card editor when clicking a step card while preserving surrounding pipeline context and updates live indicators', async () => {
      renderLocalized(<PlaybookManager showToast={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Default Research Pipeline')).toBeDefined();
      });

      fireEvent.click(screen.getByRole('button', { name: /New Playbook/i }));

      // Click directly on the Custom Analysis step card header to expand in-place editor
      const customStepTitle = screen.getByText('Custom Analysis');
      fireEvent.click(customStepTitle);

      // In-place editor is expanded while surrounding steps remain visible in timeline
      expect(screen.getByLabelText(/Step Display Name/i)).toBeDefined();
      expect(screen.getByText('Targeted Search')).toBeDefined();
      expect(screen.getByText('Briefing Report')).toBeDefined();

      // Live character counter updates as prompt instruction is edited
      const charCounter = screen.getByTestId('step-char-counter');
      expect(charCounter.textContent).toBe('47 / 8,000');

      const promptTextarea = screen.getByLabelText(/Instruction \/ Prompt/i);
      fireEvent.change(promptTextarea, { target: { value: 'Evaluate unit economics and competitive moat.' } });
      expect(charCounter.textContent).toBe('45 / 8,000');

      // Changing tool policy to search and max queries to 4 updates the step card tool policy chip live
      const toolPolicySelect = screen.getByLabelText(/Tool Policy/i);
      fireEvent.change(toolPolicySelect, { target: { value: 'search' } });
      expect(screen.getByTestId('step-tool-chip-2').textContent).toContain('🔍 Web Search (2 queries)');

      const maxQueriesInput = screen.getByLabelText(/Max Search Queries/i);
      fireEvent.change(maxQueriesInput, { target: { value: '4' } });
      expect(screen.getByTestId('step-tool-chip-2').textContent).toContain('🔍 Web Search (4 queries)');

      // Input binding chips toggle active state cleanly
      const refsCheckbox = screen.getByLabelText(/Input binding references/i) as HTMLInputElement;
      const refsChip = refsCheckbox.closest('.pb-binding-chip');
      expect(refsChip?.classList.contains('active')).toBe(false);
      fireEvent.click(refsCheckbox);
      expect(refsChip?.classList.contains('active')).toBe(true);
    });

    it('renders contextual in-line step inserters and opens quick-add palette to insert custom steps at exact indices', async () => {
      renderLocalized(<PlaybookManager showToast={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Default Research Pipeline')).toBeDefined();
      });

      fireEvent.click(screen.getByRole('button', { name: /New Playbook/i }));

      // In-line inserter buttons are rendered between steps
      expect(screen.getByTestId('inline-step-inserter-0')).toBeDefined();
      expect(screen.getByTestId('inline-step-inserter-1')).toBeDefined();
      expect(screen.getByTestId('inline-step-inserter-2')).toBeDefined();

      // Click in-line inserter between Grounding (pos 1) and Targeted Search (pos 2)
      fireEvent.click(screen.getByTestId('inline-step-inserter-1'));

      // Quick-Add Palette popover should be visible
      const palette = screen.getByTestId('quick-add-palette');
      expect(palette).toBeDefined();
      expect(palette.textContent).toContain('Insert Step at Position 2 of 5');

      // Click "Create Blank Custom Step"
      const blankBtn = screen.getByTestId('add-blank-step-btn');
      fireEvent.click(blankBtn);

      // Step is inserted at index 1 (position 2)
      await waitFor(() => {
        expect(screen.queryByTestId('quick-add-palette')).toBeNull();
      });

      const timeline = screen.getByTestId('pipeline-timeline');
      const stepNames = Array.from(timeline.querySelectorAll('.pb-step-name')).map((el) => el.textContent);
      expect(stepNames[0]).toBe('Grounding');
      expect(stepNames[1]).toBe('Custom Analysis');
      expect(stepNames[2]).toBe('Targeted Search');

      // Newly inserted step is expanded in edit mode
      const stepNameInput = screen.getByLabelText(/Step Display Name/i) as HTMLInputElement;
      expect(stepNameInput.value).toBe('Custom Analysis');
    });

    it('renders rich workflow cards with flow strips, default badges, and card-type chips', async () => {
      renderLocalized(<PlaybookManager showToast={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText('Default Research Pipeline')).toBeDefined();
      });

      // Default badge should be visible on the default playbook card
      expect(screen.getByText('Default')).toBeDefined();

      // Flow strip badges should render step names
      expect(screen.getAllByText('Grounding').length).toBeGreaterThan(0);

      // Default selector dropdown should be present
      expect(screen.getByLabelText(/Default Playbook for Untyped Cards/i)).toBeDefined();
    });
  });

  it('renders the playbook manager chrome in Romanian', async () => {
    render(
      <LocaleProvider locale="ro">
        <PlaybookManager showToast={vi.fn()} />
      </LocaleProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Default Research Pipeline')).toBeDefined();
    });

    expect(screen.getByText('Manuale de cercetare')).toBeDefined();
    expect(screen.getByText('Manual implicit pentru cardurile fără tip')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: /Manual nou/i }));

    expect(screen.getByLabelText(/Nume manual/i)).toBeDefined();
    expect(screen.getAllByText('Fundamentare').length).toBeGreaterThan(0);
    expect(screen.getByText('Pași pipeline (4 / 12)')).toBeDefined();
  });
});

