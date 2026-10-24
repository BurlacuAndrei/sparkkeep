import { en } from './en';
import type {
  Catalog,
  Locale,
  PluralBaseKey,
  PluralCategory,
  TranslationKey,
  TranslationVars,
} from './types';

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

function resolve(catalog: unknown, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => {
    if (node && typeof node === 'object') {
      return (node as Record<string, unknown>)[part];
    }
    return undefined;
  }, catalog);
}

function resolveString(catalog: unknown, key: string): string | undefined {
  const value = resolve(catalog, key);
  return typeof value === 'string' ? value : undefined;
}

function interpolate(value: string, vars?: TranslationVars): string {
  if (!vars) return value;
  return value.replace(PLACEHOLDER, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  );
}

/**
 * Resolve a key against a locale catalog, falling back to the English catalog
 * for missing leaves, then to the raw key.
 */
export function translate(
  catalog: Catalog | undefined,
  key: TranslationKey,
  vars?: TranslationVars
): string {
  const value = resolveString(catalog, key) ?? resolveString(en, key);
  if (value === undefined) return key;
  return interpolate(value, vars);
}

/**
 * Plural category for a count. Romanian puts 0 and every count whose last two
 * digits are 1..19 in the "few" form ("0 carduri", "101 carduri"), everything
 * else uses "other" ("120 de carduri"); 1 keeps its own form. Spanish and
 * German split only 1, like English. Portuguese (Brazil) and French put 0 and
 * fractional counts with an integer part of 1 or less in "one" ("0 carte",
 * "1,5 carte"), matching `Intl.PluralRules`.
 *
 * shortcut: locales needing more categories (ar, ru, pl) require widening
 * `PluralCategory` before their rules land here.
 */
export function pluralCategory(locale: Locale, count: number): PluralCategory {
  const n = Math.abs(count);
  if (locale === 'ro') {
    if (n === 1) return 'one';
    const mod100 = n % 100;
    if (n === 0 || (mod100 >= 1 && mod100 <= 19)) return 'few';
    return 'other';
  }
  if (locale === 'pt-BR' || locale === 'fr') {
    // Truncate first: CLDR keys these locales on the integer part, so 0.5 and
    // 1.5 take the "one" form like `Intl.PluralRules` does.
    return Math.trunc(n) <= 1 ? 'one' : 'other';
  }
  return n === 1 ? 'one' : 'other';
}

/**
 * Resolve `${baseKey}_one` / `_few` / `_other`. A missing category leaf falls
 * back to `_other`, then to the English catalog, then to the raw key.
 */
export function translatePlural(
  catalog: Catalog | undefined,
  locale: Locale,
  baseKey: PluralBaseKey,
  count: number,
  vars?: TranslationVars
): string {
  const category = pluralCategory(locale, count);
  const primary = `${baseKey}_${category}` as TranslationKey;
  const other = `${baseKey}_other` as TranslationKey;
  const value =
    resolveString(catalog, primary) ??
    resolveString(catalog, other) ??
    resolveString(en, primary) ??
    resolveString(en, other);
  if (value === undefined) return primary;
  // `count` stays the numeric fallback, but callers may override it with a
  // formatted string or marker through `vars.count`.
  return interpolate(value, { count, ...vars });
}
