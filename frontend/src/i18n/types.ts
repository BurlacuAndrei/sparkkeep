import { en } from './en';

export type Locale = 'en' | 'ro' | 'es' | 'pt-BR' | 'fr' | 'de';

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

/**
 * Base key of a plural group, e.g. `cards.count` for `cards.count_one`.
 * Derived from the `_one` leaves so a typo cannot reach the resolver.
 */
type StripPluralSuffix<T> = T extends `${infer Base}_one` ? Base : never;
export type PluralBaseKey = StripPluralSuffix<TranslationKey>;

export type PluralCategory = 'one' | 'few' | 'other';
// shortcut: only one/few/other are modelled; locales with more categories
// (ar, ru, pl) need this type widened before their catalogs ship.

export interface TranslateFn {
  (key: TranslationKey, vars?: TranslationVars): string;
}

export interface TranslatePluralFn {
  (key: PluralBaseKey, count: number, vars?: TranslationVars): string;
}

export interface LocaleContextValue {
  t: TranslateFn;
  tp: TranslatePluralFn;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  locales: LocaleOption[];
  formatNumber: (value: number) => string;
  formatDate: (value: Date | string | number) => string;
}
