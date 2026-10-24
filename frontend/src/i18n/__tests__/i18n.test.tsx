import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  LocaleProvider,
  useLocale,
  formatNumber,
  formatDate,
  locales,
  type Catalog,
  type TranslationKey,
} from '..';
import { translate } from '../translate';

function wrapper({ children }: { children: ReactNode }) {
  return <LocaleProvider>{children}</LocaleProvider>;
}

describe('t()', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('looks up a dotted key', () => {
    const { result } = renderHook(() => useLocale(), { wrapper });
    expect(result.current.t('common.appName')).toBe('Sparkkeep');
  });

  it('looks up nested namespace keys', () => {
    const { result } = renderHook(() => useLocale(), { wrapper });
    expect(result.current.t('settings.appearance.language')).toBe('Interface language');
    expect(result.current.t('triage.title')).toBe('Triage');
  });

  it('interpolates {{var}} placeholders', () => {
    const { result } = renderHook(() => useLocale(), { wrapper });
    expect(result.current.t('research.queued', { id: 42 })).toBe('Research queued for card #42');
    expect(result.current.tp('cards.count', 3)).toBe('3 cards');
  });

  it('leaves placeholders without a supplied value untouched', () => {
    const { result } = renderHook(() => useLocale(), { wrapper });
    expect(result.current.t('common.appName', {})).toBe('Sparkkeep');
    expect(result.current.t('research.queued', {})).toBe('Research queued for card #{{id}}');
  });

  it('inserts values literally, without replacement-pattern expansion', () => {
    const { result } = renderHook(() => useLocale(), { wrapper });
    const literal = "$& $' $1 {{x}}";
    expect(result.current.t('research.queued', { id: literal })).toBe(
      `Research queued for card #${literal}`
    );
  });

  it('returns the key itself when the key is missing', () => {
    const { result } = renderHook(() => useLocale(), { wrapper });
    expect(result.current.t('common.missing' as TranslationKey)).toBe('common.missing');
    expect(result.current.t('not.a.real.key' as TranslationKey)).toBe('not.a.real.key');
  });
});

describe('LocaleProvider', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('lang');
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'language', { value: 'en-US', configurable: true });
    document.documentElement.removeAttribute('lang');
    vi.restoreAllMocks();
  });

  it('exposes the supported locales', () => {
    const { result } = renderHook(() => useLocale(), { wrapper });
    expect(result.current.locales).toBe(locales);
    expect(locales.map((option) => option.code)).toEqual(['en', 'ro', 'es', 'pt-BR', 'fr', 'de']);
    expect(locales.map((option) => option.label)).toEqual([
      'English',
      'Română',
      'Español',
      'Português (Brasil)',
      'Français',
      'Deutsch',
    ]);
  });

  it('restores a stored locale', () => {
    localStorage.setItem('sparkkeep_locale', 'ro');
    const { result } = renderHook(() => useLocale(), { wrapper });
    expect(result.current.locale).toBe('ro');
  });

  it('restores a stored regional locale', () => {
    localStorage.setItem('sparkkeep_locale', 'pt-BR');
    const { result } = renderHook(() => useLocale(), { wrapper });
    expect(result.current.locale).toBe('pt-BR');
  });

  it('normalizes a stored locale to lowercase', () => {
    localStorage.setItem('sparkkeep_locale', 'RO');
    const { result } = renderHook(() => useLocale(), { wrapper });
    expect(result.current.locale).toBe('ro');
  });

  it('normalizes a stored regional locale to lowercase', () => {
    localStorage.setItem('sparkkeep_locale', 'PT-br');
    const { result } = renderHook(() => useLocale(), { wrapper });
    expect(result.current.locale).toBe('pt-BR');
  });

  it('prefers a stored locale over the browser language', () => {
    localStorage.setItem('sparkkeep_locale', 'en');
    Object.defineProperty(navigator, 'language', { value: 'ro-RO', configurable: true });
    const { result } = renderHook(() => useLocale(), { wrapper });
    expect(result.current.locale).toBe('en');
  });

  it('ignores an invalid stored locale and falls through to the browser', () => {
    localStorage.setItem('sparkkeep_locale', 'zh-CN');
    Object.defineProperty(navigator, 'language', { value: 'ro-RO', configurable: true });
    const { result } = renderHook(() => useLocale(), { wrapper });
    expect(result.current.locale).toBe('ro');
  });

  it('applies documentElement.lang on mount', () => {
    const { result } = renderHook(() => useLocale(), { wrapper });
    expect(document.documentElement.lang).toBe(result.current.locale);
  });

  it('detects the browser language prefix case-insensitively', () => {
    Object.defineProperty(navigator, 'language', { value: 'RO-md', configurable: true });
    const { result } = renderHook(() => useLocale(), { wrapper });
    expect(result.current.locale).toBe('ro');
  });

  it('uses the Romanian catalog when the locale is stored', () => {
    localStorage.setItem('sparkkeep_locale', 'ro');
    const { result } = renderHook(() => useLocale(), { wrapper });
    expect(result.current.locale).toBe('ro');
    expect(result.current.t('common.language')).toBe('Limbă');
    expect(result.current.t('settings.appearance.language')).toBe('Limba interfeței');
  });

  it('detects the browser language prefix', () => {
    Object.defineProperty(navigator, 'language', { value: 'ro-MD', configurable: true });
    const { result } = renderHook(() => useLocale(), { wrapper });
    expect(result.current.locale).toBe('ro');
  });

  it('falls back to English for an unknown browser language', () => {
    Object.defineProperty(navigator, 'language', { value: 'zh-CN', configurable: true });
    const { result } = renderHook(() => useLocale(), { wrapper });
    expect(result.current.locale).toBe('en');
  });

  it('detects a regional browser locale by its base language', () => {
    Object.defineProperty(navigator, 'language', { value: 'es-419', configurable: true });
    const { result } = renderHook(() => useLocale(), { wrapper });
    expect(result.current.locale).toBe('es');
  });

  it('maps the Portuguese base language to pt-BR', () => {
    Object.defineProperty(navigator, 'language', { value: 'pt', configurable: true });
    const { result } = renderHook(() => useLocale(), { wrapper });
    expect(result.current.locale).toBe('pt-BR');
  });

  it('matches a full regional browser locale case-insensitively', () => {
    Object.defineProperty(navigator, 'language', { value: 'pt-br', configurable: true });
    const { result } = renderHook(() => useLocale(), { wrapper });
    expect(result.current.locale).toBe('pt-BR');
  });

  it('maps de-AT and fr-CA to their base locales', () => {
    Object.defineProperty(navigator, 'language', { value: 'de-AT', configurable: true });
    const { result: austrian } = renderHook(() => useLocale(), { wrapper });
    expect(austrian.current.locale).toBe('de');

    Object.defineProperty(navigator, 'language', { value: 'fr-CA', configurable: true });
    const { result: canadian } = renderHook(() => useLocale(), { wrapper });
    expect(canadian.current.locale).toBe('fr');
  });

  it('persists setLocale and applies documentElement.lang', () => {
    const { result } = renderHook(() => useLocale(), { wrapper });
    act(() => result.current.setLocale('ro'));
    expect(result.current.locale).toBe('ro');
    expect(localStorage.getItem('sparkkeep_locale')).toBe('ro');
    expect(document.documentElement.lang).toBe('ro');
  });

  it('binds formatters to the active locale', () => {
    const { result } = renderHook(() => useLocale(), { wrapper });
    expect(result.current.formatNumber(1234.5)).toBe('1,234.5');
    expect(result.current.formatDate(new Date(2024, 0, 15))).toBe('1/15/2024');

    act(() => result.current.setLocale('ro'));
    expect(result.current.formatNumber(1234.5)).toBe('1.234,5');
    expect(result.current.formatDate(new Date(2024, 0, 15))).toBe('15.01.2024');
  });

  it('survives blocked localStorage when reading and writing', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    const { result } = renderHook(() => useLocale(), { wrapper });
    expect(result.current.locale).toBe('en');

    act(() => result.current.setLocale('ro'));
    expect(result.current.locale).toBe('ro');
    expect(setItem).toHaveBeenCalledWith('sparkkeep_locale', 'ro');
  });

  it('throws when useLocale is called outside the provider', () => {
    expect(() => renderHook(() => useLocale())).toThrow(
      'useLocale must be used within a LocaleProvider'
    );
  });
});

describe('formatters', () => {
  it('formats numbers with an explicit locale', () => {
    expect(formatNumber(1234.5, 'en')).toBe('1,234.5');
    expect(formatNumber(1234.5, 'ro')).toBe('1.234,5');
  });

  it('formats dates with an explicit locale', () => {
    const date = new Date(2024, 0, 15);
    expect(formatDate(date, 'en')).toBe('1/15/2024');
    expect(formatDate(date, 'ro')).toBe('15.01.2024');
  });

  it('keeps date-only strings on their local calendar day', () => {
    expect(formatDate('2024-01-15', 'en')).toBe('1/15/2024');
    expect(formatDate('2024-01-15', 'ro')).toBe('15.01.2024');
  });

  it('returns an empty string for an invalid date', () => {
    expect(formatDate('not-a-date', 'en')).toBe('');
    expect(formatDate(new Date(Number.NaN), 'en')).toBe('');
  });
});

describe('translate()', () => {
  it('retries the English catalog for leaves missing from a partial locale catalog', () => {
    const partial = { common: { appName: 'Sparkkeep RO' } } as unknown as Catalog;

    expect(translate(partial, 'common.appName')).toBe('Sparkkeep RO');
    expect(translate(partial, 'cards.empty')).toBe('No sparks yet');
    expect(translate(partial, 'research.queued', { id: 7 })).toBe('Research queued for card #7');
  });

  it('returns the key when neither catalog has it', () => {
    const partial = { common: { appName: 'Sparkkeep RO' } } as unknown as Catalog;
    expect(translate(partial, 'common.missing' as TranslationKey)).toBe('common.missing');
  });
});
