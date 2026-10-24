// This module intentionally exports the provider, the hook, and formatting helpers
// as one public API, so fast refresh cannot split it.
// oxlint-disable react/only-export-components
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { de } from './de';
import { en } from './en';
import { es } from './es';
import { fr } from './fr';
import { ptBR } from './pt-BR';
import { ro } from './ro';
import { translate, translatePlural } from './translate';
import type {
  Catalog,
  Locale,
  LocaleContextValue,
  LocaleOption,
  PluralBaseKey,
  TranslateFn,
  TranslatePluralFn,
  TranslationKey,
  TranslationVars,
} from './types';

export { translate } from './translate';
export { pluralCategory } from './translate';

export type {
  Catalog,
  Locale,
  LocaleContextValue,
  LocaleOption,
  PluralBaseKey,
  PluralCategory,
  TranslateFn,
  TranslatePluralFn,
  TranslationKey,
  TranslationVars,
} from './types';

const LOCALE_STORAGE_KEY = 'sparkkeep_locale';

export const locales: LocaleOption[] = [
  { code: 'en', label: 'English' },
  { code: 'ro', label: 'Română' },
  { code: 'es', label: 'Español' },
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
];

/**
 * Registered catalogs. A missing entry falls back to English, so a locale can
 * be offered before its catalog lands.
 */
export const catalogs: Readonly<Partial<Record<Locale, Catalog>>> = {
  en,
  ro,
  es,
  'pt-BR': ptBR,
  fr,
  de,
};

/**
 * Browser base language to locale, derived from `locales`. The first registered
 * code for a base wins, so `pt` resolves to `pt-BR`.
 */
const BASE_LANGUAGE: Record<string, Locale> = {};
for (const { code } of locales) {
  BASE_LANGUAGE[code.split('-')[0].toLowerCase()] ??= code;
}

function matchLocale(value: string | null | undefined): Locale | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  return locales.find((option) => option.code.toLowerCase() === normalized)?.code;
}

function detectLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  try {
    const stored = matchLocale(localStorage.getItem(LOCALE_STORAGE_KEY));
    if (stored) return stored;
  } catch {
    // Fallback if localStorage is inaccessible
  }
  const browser = typeof navigator !== 'undefined' ? navigator.language : '';
  const exact = matchLocale(browser);
  if (exact) return exact;
  return BASE_LANGUAGE[browser.split('-')[0].toLowerCase()] ?? 'en';
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

/**
 * Locale for code that runs outside React (api.ts error fallbacks).
 * Seeded from detection and kept in sync by `LocaleProvider`.
 */
let activeLocale: Locale = detectLocale();

/** Test helper: drop the locale a rendered provider may have left behind. */
export function resetActiveLocale(): void {
  activeLocale = detectLocale();
}

export function translateCurrent(key: TranslationKey, vars?: TranslationVars): string {
  return translate(catalogs[activeLocale], key, vars);
}

export interface LocaleProviderProps {
  children: ReactNode;
  /** Initial locale, overriding detection. */
  locale?: Locale;
  /** Whether to sync with backend workspace settings (default: true). */
  syncBackend?: boolean;
}

export function LocaleProvider({ children, locale: initialLocale, syncBackend = true }: LocaleProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const initial = initialLocale ?? detectLocale();
    activeLocale = initial;
    return initial;
  });

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
    }
    activeLocale = locale;
    // Reset on unmount so module state cannot leak into the next test or mount.
    return () => {
      resetActiveLocale();
    };
  }, [locale]);

  useEffect(() => {
    let mounted = true;
    if (typeof window !== 'undefined' && syncBackend && !initialLocale) {
      import('../api')
        .then((api) => api.getSettings())
        .then((res) => {
          if (mounted && res?.ok && res.settings?.interface_locale) {
            const serverLocale = matchLocale(res.settings.interface_locale);
            if (serverLocale && serverLocale !== activeLocale) {
              activeLocale = serverLocale;
              setLocaleState(serverLocale);
              try {
                localStorage.setItem(LOCALE_STORAGE_KEY, serverLocale);
              } catch {}
            }
          }
        })
        .catch(() => {});
    }
    return () => {
      mounted = false;
    };
  }, [syncBackend, initialLocale]);

  const setLocale = useCallback(
    (next: Locale) => {
      activeLocale = next;
      setLocaleState(next);
      try {
        localStorage.setItem(LOCALE_STORAGE_KEY, next);
      } catch {
        // In case localStorage is blocked
      }
      if (syncBackend) {
        import('../api')
          .then((api) => api.patchSettings({ interface_locale: next }))
          .catch(() => {});
      }
    },
    [syncBackend]
  );

  const t = useCallback<TranslateFn>(
    (key, vars) => translate(catalogs[locale], key, vars),
    [locale]
  );

  const tp = useCallback<TranslatePluralFn>(
    (key: PluralBaseKey, count: number, vars?: TranslationVars) =>
      translatePlural(catalogs[locale], locale, key, count, vars),
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
      tp,
      locale,
      setLocale,
      locales,
      formatNumber: formatNumberForLocale,
      formatDate: formatDateForLocale,
    }),
    [t, tp, locale, setLocale, formatNumberForLocale, formatDateForLocale]
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
