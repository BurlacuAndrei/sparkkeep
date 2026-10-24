import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '../../context/ThemeContext';
import { ThemeSelector } from '../../components/ThemeSelector';
import { LocaleProvider } from '..';

const cases = [
  { locale: 'es', dark: 'Modo oscuro', light: 'Modo claro' },
  { locale: 'pt-BR', dark: 'Modo escuro', light: 'Modo claro' },
  { locale: 'fr', dark: 'Mode sombre', light: 'Mode clair' },
  { locale: 'de', dark: 'Dunkler Modus', light: 'Heller Modus' },
] as const;

describe('component rendering per locale', () => {
  it.each(cases)('$locale renders translated theme options', ({ locale, dark, light }) => {
    render(
      <LocaleProvider locale={locale}>
        <ThemeProvider defaultTheme="dark">
          <ThemeSelector />
        </ThemeProvider>
      </LocaleProvider>
    );

    expect(screen.getByText(dark)).toBeDefined();
    expect(screen.getByText(light)).toBeDefined();
    expect(screen.queryByText('Dark Mode')).toBeNull();
  });
});
