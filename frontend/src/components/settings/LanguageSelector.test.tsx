import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LanguageSelector } from './LanguageSelector';
import { LocaleProvider } from '../../i18n';

describe('LanguageSelector', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('lang');
  });

  afterEach(() => {
    document.documentElement.removeAttribute('lang');
  });

  it('renders a select with English and Română options', () => {
    render(
      <LocaleProvider locale="en">
        <LanguageSelector />
      </LocaleProvider>
    );

    const select = screen.getByLabelText('Interface language') as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect(select.value).toBe('en');
    expect(screen.getByRole('option', { name: 'English' })).toBeDefined();
    expect(screen.getByRole('option', { name: 'Română' })).toBeDefined();
  });

  it('persists the choice and applies documentElement.lang on change', () => {
    render(
      <LocaleProvider locale="en">
        <LanguageSelector />
      </LocaleProvider>
    );

    fireEvent.change(screen.getByLabelText('Interface language'), { target: { value: 'ro' } });

    expect(localStorage.getItem('sparkkeep_locale')).toBe('ro');
    expect(document.documentElement.lang).toBe('ro');
    expect((screen.getByLabelText('Limba interfeței') as HTMLSelectElement).value).toBe('ro');
    expect(screen.getByText('Alege limba folosită în întreaga interfață.')).toBeDefined();
  });
});
