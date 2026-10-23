import { describe, it, expect, vi } from 'vitest';
import { render as rtlRender, screen, fireEvent } from '@testing-library/react';
import type { ReactElement } from 'react';
import { UserProfileTab } from './UserProfileTab';
import { PROFILE_ARCHETYPES } from './constants';
import { LocaleProvider } from '../../i18n';

const render = (ui: ReactElement) => rtlRender(<LocaleProvider locale="en">{ui}</LocaleProvider>);

describe('UserProfileTab Persona Archetypes & Customization', () => {
  const defaultProps = {
    goals: '',
    setGoals: vi.fn(),
    skills: '',
    setSkills: vi.fn(),
    stack: '',
    setStack: vi.fn(),
    interests: '',
    setInterests: vi.fn(),
    constraints: '',
    setConstraints: vi.fn(),
    language: 'English',
    setLanguage: vi.fn(),
    showToast: vi.fn(),
    onDirtyChange: vi.fn(),
  };

  it('renders all 4 persona archetype chips with descriptive labels', () => {
    render(<UserProfileTab {...defaultProps} />);

    expect(screen.getByText(/Starter Archetypes \/ Domain Presets/i)).toBeDefined();
    for (const badge of [
      '🚀 Founder / Operator',
      '📈 Finance & Markets',
      '🌾 AgTech & Bioeconomy',
      '⚡ Systems & AI',
    ]) {
      expect(screen.getByText(badge)).toBeDefined();
    }
  });

  it('populates fields and triggers toast when an archetype is selected', () => {
    const setGoals = vi.fn();
    const setSkills = vi.fn();
    const setStack = vi.fn();
    const setInterests = vi.fn();
    const setConstraints = vi.fn();
    const showToast = vi.fn();
    const onDirtyChange = vi.fn();

    render(
      <UserProfileTab
        {...defaultProps}
        setGoals={setGoals}
        setSkills={setSkills}
        setStack={setStack}
        setInterests={setInterests}
        setConstraints={setConstraints}
        showToast={showToast}
        onDirtyChange={onDirtyChange}
      />
    );

    const founderChip = screen.getByText(/Founder \/ Operator/i);
    fireEvent.click(founderChip);

    const founderArch = PROFILE_ARCHETYPES.find((a) => a.id === 'founder')!;
    expect(setGoals).toHaveBeenCalledWith(founderArch.goals);
    expect(setSkills).toHaveBeenCalledWith(founderArch.skills);
    expect(setStack).toHaveBeenCalledWith(founderArch.stack);
    expect(setInterests).toHaveBeenCalledWith(founderArch.interests);
    expect(setConstraints).toHaveBeenCalledWith(founderArch.constraints);
    expect(onDirtyChange).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Founder & Operator'));
  });

  it('renders broadened field labels including Tools, Platforms & Systems', () => {
    render(<UserProfileTab {...defaultProps} />);

    expect(screen.getByLabelText(/Tools, Platforms & Systems/i)).toBeDefined();
    expect(screen.getByLabelText(/Domains & Focus Interests/i)).toBeDefined();
    expect(screen.getByLabelText(/Constraints & Operating Guidelines/i)).toBeDefined();
  });
});
