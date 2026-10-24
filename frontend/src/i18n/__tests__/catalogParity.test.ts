import { describe, it, expect } from 'vitest';
import { en } from '../en';
import { catalogs } from '..';
import type { Catalog } from '../types';

type Tree = Record<string, unknown>;

/** Every dotted leaf path of a catalog tree. */
function leafPaths(node: Tree, prefix = ''): string[] {
  return Object.entries(node).flatMap(([key, value]) => {
    const path = `${prefix}${key}`;
    return typeof value === 'string' ? [path] : leafPaths(value as Tree, `${path}.`);
  });
}

function valueAt(catalog: Catalog, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node as Tree)[part], catalog);
}

const enKeys = leafPaths(en).sort();
const registered = Object.entries(catalogs) as [string, Catalog][];

describe('catalog parity', () => {
  it('registers the English source catalog', () => {
    expect(registered.map(([code]) => code)).toContain('en');
  });

  for (const [code, catalog] of registered) {
    if (code === 'en') continue;

    describe(code, () => {
      const keys = leafPaths(catalog).sort();

      it('has no key missing from English', () => {
        expect(keys.filter((key) => !enKeys.includes(key))).toEqual([]);
      });

      it('has every English key', () => {
        expect(enKeys.filter((key) => !keys.includes(key))).toEqual([]);
      });

      it('has the same key count as English', () => {
        expect(keys.length).toBe(enKeys.length);
      });

      it('keeps every leaf a non-empty string', () => {
        for (const key of keys) {
          const value = valueAt(catalog, key);
          expect(typeof value, key).toBe('string');
          expect((value as string).trim(), key).not.toBe('');
        }
      });
    });
  }
});
