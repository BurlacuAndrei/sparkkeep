import { describe, it, expect } from 'vitest';
import { en } from '../en';
import { ro } from '../ro';

type Tree = Record<string, unknown>;

/** Every dotted leaf path of a catalog tree. */
function leafPaths(node: Tree, prefix = ''): string[] {
  return Object.entries(node).flatMap(([key, value]) => {
    const path = `${prefix}${key}`;
    return typeof value === 'string' ? [path] : leafPaths(value as Tree, `${path}.`);
  });
}

describe('catalog parity', () => {
  const enKeys = leafPaths(en).sort();
  const roKeys = leafPaths(ro).sort();

  it('has every English key in Romanian', () => {
    expect(roKeys.filter((key) => !enKeys.includes(key))).toEqual([]);
  });

  it('has no Romanian key missing from English', () => {
    expect(enKeys.filter((key) => !roKeys.includes(key))).toEqual([]);
  });

  it('has the same key count in both catalogs', () => {
    expect(roKeys.length).toBe(enKeys.length);
  });

  it('keeps every Romanian leaf a non-empty string', () => {
    for (const key of roKeys) {
      const value = key.split('.').reduce<unknown>(
        (node, part) => (node as Tree)[part],
        ro as unknown as Tree
      );
      expect(typeof value, key).toBe('string');
      expect((value as string).trim(), key).not.toBe('');
    }
  });
});
