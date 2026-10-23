// This module intentionally exports the provider, the hook, and formatting helpers
// as one public API, so fast refresh cannot split it.
// oxlint-disable react/only-export-components
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { en } from './en';
import { translate } from './translate';
import type {
  Catalog,
  Locale,
  LocaleContextValue,
  LocaleOption,
  TranslateFn,
} from './types';

export type {
  Catalog,
  Locale,
  LocaleContextValue,
  LocaleOption,
  TranslateFn,
  TranslationKey,
  TranslationVars,
} from './types';

const LOCALE_STORAGE_KEY = 'sparkkeep_locale';

export const locales: LocaleOption[] = [
  { code: 'en', label: 'English' },
  { code: 'ro', label: 'Română' },
];

/**
 * Registered catalogs. A missing entry falls back to English, so a locale can
 * be offered before its catalog lands.
 */
const catalogs: Partial<Record<Locale, Catalog>> = { en };

function isLocale(value: string | null): value is Locale {
  return locales.some((option) => option.code === value);
}

function detectLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // Fallback if localStorage is inaccessible
  }
  const browser = typeof navigator !== 'undefined' ? navigator.language : '';
  const prefix = browser.split('-')[0];
  return isLocale(prefix) ? prefix : 'en';
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function toDate(value: Date | string | number): Date {
  if (typeof value === 'string') {
    // A date-only string must stay on its calendar day in local time;
    // `new Date('2024-01-15')` parses as UTC and shifts the day westwards.
    const match = DATE_ONLY.exec(value);
    if (match) {
      return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    }
  }
  return new Date(value);
}

export function formatNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(locale).format(value);
}

export function formatDate(value: Date | string | number, locale: Locale): string {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(locale).format(date);
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export interface LocaleProviderProps {
  children: ReactNode;
  /** Initial locale, overriding detection. */
  locale?: Locale;
}

export function LocaleProvider({ children, locale: initialLocale }: LocaleProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(() => initialLocale ?? detectLocale());

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {
      // In case localStorage is blocked
    }
  }, []);

  const t = useCallback<TranslateFn>(
    (key, vars) => translate(catalogs[locale], key, vars),
    [locale]
  );

  const formatNumberForLocale = useCallback((value: number) => formatNumber(value, locale), [locale]);
  const formatDateForLocale = useCallback(
    (value: Date | string | number) => formatDate(value, locale),
    [locale]
  );

  const contextValue = useMemo<LocaleContextValue>(
    () => ({
      t,
      locale,
      setLocale,
      locales,
      formatNumber: formatNumberForLocale,
      formatDate: formatDateForLocale,
    }),
    [t, locale, setLocale, formatNumberForLocale, formatDateForLocale]
  );

  return <LocaleContext.Provider value={contextValue}>{children}</LocaleContext.Provider>;
}

// oxlint-disable-next-line react/only-export-components
export function useLocale(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used within a LocaleProvider');
  }
  return context;
}
