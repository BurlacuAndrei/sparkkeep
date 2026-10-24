import { describe, it, expect } from 'vitest';
import { en } from '../en';
import { catalogs } from '..';
import type { Catalog } from '../types';

type Tree = Record<string, unknown>;

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

/** Every dotted leaf path of a catalog tree. */
function leafPaths(node: Tree, prefix = ''): string[] {
  return Object.entries(node).flatMap(([key, value]) => {
    const path = `${prefix}${key}`;
    return typeof value === 'string' ? [path] : leafPaths(value as Tree, `${path}.`);
  });
}

function valueAt(catalog: Catalog, key: string): string {
  return key
    .split('.')
    .reduce<unknown>((node, part) => (node as Tree)[part], catalog) as string;
}

function placeholders(value: string): string[] {
  return [...value.matchAll(PLACEHOLDER)].map((match) => match[1]).sort();
}

const registered = Object.entries(catalogs) as [string, Catalog][];

describe('placeholder parity', () => {
  for (const [code, catalog] of registered) {
    if (code === 'en') continue;

    describe(code, () => {
      const keys = leafPaths(catalog);

      // Walks every leaf, plural `_one` / `_few` / `_other` leaves included.
      it('keeps the English {{placeholders}} for every leaf', () => {
        for (const key of keys) {
          expect(placeholders(valueAt(catalog, key)), key).toEqual(
            placeholders(valueAt(en, key) ?? '')
          );
        }
      });
    });
  }
});
