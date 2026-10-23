import { en } from './en';
import type { Catalog, TranslationKey, TranslationVars } from './types';

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
  if (!vars) return value;
  return value.replace(PLACEHOLDER, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match
  );
}
