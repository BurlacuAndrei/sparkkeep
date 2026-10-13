import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeSelector } from './ThemeSelector';
import { ThemeProvider } from '../context/ThemeContext';

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

  it('renders all three theme radio options', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <ThemeSelector />
      </ThemeProvider>
    );

    expect(screen.getByRole('radiogroup', { name: 'Interface theme selector' })).toBeDefined();
    expect(screen.getByRole('radio', { name: /Dark Mode/i })).toBeDefined();
    expect(screen.getByRole('radio', { name: /Light Mode/i })).toBeDefined();
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
