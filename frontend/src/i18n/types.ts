import { en } from './en';

export type Locale = 'en' | 'ro';

export interface LocaleOption {
  code: Locale;
  label: string;
}

export type TranslationVars = Record<string, string | number>;

/** Dotted paths to every string leaf of a catalog, e.g. `settings.appearance.language`. */
export type LeafPaths<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : LeafPaths<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type Catalog = typeof en;

export type TranslationKey = LeafPaths<Catalog>;

export interface TranslateFn {
  (key: TranslationKey, vars?: TranslationVars): string;
}

export interface LocaleContextValue {
  t: TranslateFn;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  locales: LocaleOption[];
  formatNumber: (value: number) => string;
  formatDate: (value: Date | string | number) => string;
}
