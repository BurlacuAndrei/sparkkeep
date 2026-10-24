import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as rtlRender, screen, fireEvent } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ThemeSelector } from './ThemeSelector';
import { ThemeProvider } from '../context/ThemeContext';
import { LocaleProvider } from '../i18n';

const render = (ui: ReactElement) => rtlRender(<LocaleProvider locale="en">{ui}</LocaleProvider>);

describe('ThemeSelector', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });
  });

  it('renders all four theme radio options', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <ThemeSelector />
      </ThemeProvider>
    );

    expect(screen.getByRole('radiogroup', { name: 'Interface theme selector' })).toBeDefined();
    expect(screen.getByRole('radio', { name: /Dark Mode/i })).toBeDefined();
    expect(screen.getByRole('radio', { name: /Light Mode/i })).toBeDefined();
    expect(screen.getByRole('radio', { name: /OLED Mode/i })).toBeDefined();
    expect(screen.getByRole('radio', { name: /System Default/i })).toBeDefined();
  });

  it('highlights the active theme initially', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <ThemeSelector />
      </ThemeProvider>
    );

    const lightButton = screen.getByRole('radio', { name: /Light Mode/i });
    const darkButton = screen.getByRole('radio', { name: /Dark Mode/i });

    expect(lightButton.getAttribute('aria-checked')).toBe('true');
    expect(lightButton.classList.contains('active')).toBe(true);
    expect(darkButton.getAttribute('aria-checked')).toBe('false');
    expect(darkButton.classList.contains('active')).toBe(false);
  });

  it('changes theme when another option is clicked', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <ThemeSelector />
      </ThemeProvider>
    );

    const darkButton = screen.getByRole('radio', { name: /Dark Mode/i });
    fireEvent.click(darkButton);

    expect(darkButton.getAttribute('aria-checked')).toBe('true');
    expect(darkButton.classList.contains('active')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('sparkkeep_theme')).toBe('dark');

    const oledButton = screen.getByRole('radio', { name: /OLED Mode/i });
    fireEvent.click(oledButton);

    expect(oledButton.getAttribute('aria-checked')).toBe('true');
    expect(oledButton.classList.contains('active')).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('oled');
    expect(localStorage.getItem('sparkkeep_theme')).toBe('oled');

    const systemButton = screen.getByRole('radio', { name: /System Default/i });
    fireEvent.click(systemButton);

    expect(systemButton.getAttribute('aria-checked')).toBe('true');
    expect(systemButton.classList.contains('active')).toBe(true);
    expect(localStorage.getItem('sparkkeep_theme')).toBe('system');
  });

  it('applies custom className to the wrapper radiogroup', () => {
    render(
      <ThemeProvider>
        <ThemeSelector className="custom-test-class" />
      </ThemeProvider>
    );

    const radiogroup = screen.getByRole('radiogroup');
    expect(radiogroup.classList.contains('custom-test-class')).toBe(true);
  });
});
