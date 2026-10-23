import { describe, it, expect } from 'vitest';
import { pluralCategory, translatePlural } from '../translate';
import { en } from '../en';
import { ro } from '../ro';
import type { PluralCategory } from '../types';

describe('pluralCategory', () => {
  const cases: [number, PluralCategory, PluralCategory][] = [
    [0, 'other', 'other'],
    [1, 'one', 'one'],
    [2, 'few', 'other'],
    [19, 'few', 'other'],
    [20, 'other', 'other'],
    [101, 'other', 'other'],
    [120, 'other', 'other'],
  ];

  it.each(cases)('count %i: ro=%s en=%s', (count, roCategory, enCategory) => {
    expect(pluralCategory('ro', count)).toBe(roCategory);
    expect(pluralCategory('en', count)).toBe(enCategory);
  });

  it('uses the absolute value for negative counts', () => {
    expect(pluralCategory('ro', -1)).toBe('one');
    expect(pluralCategory('en', -2)).toBe('other');
  });
});

describe('translatePlural', () => {
  it('selects Romanian one, few and other forms', () => {
    expect(translatePlural(ro, 'ro', 'cards.count', 1)).toBe('1 card');
    expect(translatePlural(ro, 'ro', 'cards.count', 5)).toBe('5 carduri');
    expect(translatePlural(ro, 'ro', 'cards.count', 20)).toBe('20 de carduri');
  });

  it('selects English one and other forms', () => {
    expect(translatePlural(en, 'en', 'cards.count', 1)).toBe('1 card');
    expect(translatePlural(en, 'en', 'cards.count', 2)).toBe('2 cards');
  });

  it('falls back to the raw key when the plural group is missing', () => {
    expect(translatePlural(en, 'en', 'cards.nope' as never, 2)).toBe('cards.nope_other');
  });
});
