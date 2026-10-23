import { describe, it, expect, vi } from 'vitest';
import { render as rtlRender, screen, fireEvent } from '@testing-library/react';
import type { ReactElement } from 'react';
import { AIProfileTab } from './AIProfileTab';
import { LLMProfile } from '../../types';
import { LocaleProvider } from '../../i18n';

const render = (ui: ReactElement) => rtlRender(<LocaleProvider locale="en">{ui}</LocaleProvider>);

describe('AIProfileTab Component', () => {
  const mockProfiles: LLMProfile[] = [
    {
      id: 'prof-1',
      name: 'Local Ollama',
      base_url: 'http://localhost:11434',
      model: 'llama3:8b',
      has_key: false,
      is_default: true,
    },
    {
      id: 'prof-2',
      name: 'OpenAI GPT-4o',
      base_url: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      has_key: true,
      is_default: false,
    },
  ];

  const mockRoles = {
    triage: 'prof-1',
    research: 'prof-2',
    synthesis: 'prof-2',
  };

  it('renders configured profiles and role assignments', () => {
    const setProfiles = vi.fn();
    const setLlmRoles = vi.fn();
    const showToast = vi.fn();

    render(
      <AIProfileTab
        profiles={mockProfiles}
        setProfiles={setProfiles}
        llmRoles={mockRoles}
        setLlmRoles={setLlmRoles}
        showToast={showToast}
      />
    );

    expect(screen.getAllByText('Local Ollama').length).toBeGreaterThan(0);
    expect(screen.getAllByText('OpenAI GPT-4o').length).toBeGreaterThan(0);
    expect(screen.getByText(/Use for \(Role Routing\)/i)).toBeDefined();
  });

  it('opens new profile creation form when clicking Add Model button', () => {
    const setProfiles = vi.fn();
    const setLlmRoles = vi.fn();
    const showToast = vi.fn();

    render(
      <AIProfileTab
        profiles={mockProfiles}
        setProfiles={setProfiles}
        llmRoles={mockRoles}
        setLlmRoles={setLlmRoles}
        showToast={showToast}
      />
    );

    const addBtn = screen.getByRole('button', { name: /Add Model/i });
    fireEvent.click(addBtn);

    expect(screen.getByPlaceholderText(/e\.g\. OpenAI GPT-4o, Ollama Local/i)).toBeDefined();
    expect(screen.getByPlaceholderText(/e\.g\. gpt-4o or llama-3\.3-70b-versatile/i)).toBeDefined();
  });
});
