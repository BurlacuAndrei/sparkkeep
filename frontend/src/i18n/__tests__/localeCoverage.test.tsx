import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { en } from '../en';
import type { TranslationKey } from '../types';
import { LocaleProvider, useLocale } from '..';

function leafPaths(node: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(node).flatMap(([key, value]) => {
    const path = `${prefix}${key}`;
    return typeof value === 'string' ? [path] : leafPaths(value as Record<string, unknown>, `${path}.`);
  });
}

const keys = leafPaths(en);

function AllTranslations() {
  const { t } = useLocale();
  return (
    <ul>
      {keys.map((key) => (
        <li key={key} data-key={key}>
          {t(key as TranslationKey)}
        </li>
      ))}
    </ul>
  );
}

describe('Romanian catalog coverage', () => {
  it('returns a non-empty translation for every English key', () => {
    render(
      <LocaleProvider locale="ro">
        <AllTranslations />
      </LocaleProvider>
    );

    for (const item of screen.getAllByRole('listitem')) {
      const key = item.getAttribute('data-key') as TranslationKey;
      const text = item.textContent ?? '';
      expect(text.trim(), key).not.toBe('');
      expect(text, key).not.toBe(key);
    }
  });
});
