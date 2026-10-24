import { describe, it, expect } from 'vitest';
import { pluralCategory, translatePlural } from '../translate';
import { en } from '../en';
import { ro } from '../ro';
import type { Locale, PluralCategory } from '../types';

describe('pluralCategory', () => {
  // counts, ro, en, es, pt-BR, fr, de
  const cases: [number, PluralCategory, PluralCategory, PluralCategory, PluralCategory][] = [
    [0, 'few', 'other', 'one', 'one'],
    [1, 'one', 'one', 'one', 'one'],
    [2, 'few', 'other', 'other', 'other'],
    [19, 'few', 'other', 'other', 'other'],
    [20, 'other', 'other', 'other', 'other'],
    [101, 'few', 'other', 'other', 'other'],
    [120, 'other', 'other', 'other', 'other'],
  ];

  it.each(cases)('count %i', (count, roCategory, oneOtherCategory, zeroOneCategory) => {
    expect(pluralCategory('ro', count)).toBe(roCategory);
    expect(pluralCategory('en', count)).toBe(oneOtherCategory);
    expect(pluralCategory('es', count)).toBe(oneOtherCategory);
    expect(pluralCategory('de', count)).toBe(oneOtherCategory);
    expect(pluralCategory('pt-BR', count)).toBe(zeroOneCategory);
    expect(pluralCategory('fr', count)).toBe(zeroOneCategory);
  });

  it('matches Intl for fractional counts in fr and pt-BR', () => {
    for (const locale of ['fr', 'pt-BR'] as Locale[]) {
      expect(pluralCategory(locale, 0.5)).toBe('one');
      expect(pluralCategory(locale, 1.5)).toBe('one');
      expect(pluralCategory(locale, 2.5)).toBe('other');
    }
  });

  it('uses the absolute value for negative counts', () => {
    expect(pluralCategory('ro', -1)).toBe('one');
    expect(pluralCategory('en', -2)).toBe('other');
    expect(pluralCategory('es', -1)).toBe('one');
    expect(pluralCategory('de', -2)).toBe('other');
    expect(pluralCategory('pt-BR', -1)).toBe('one');
    expect(pluralCategory('pt-BR', -2)).toBe('other');
    expect(pluralCategory('fr', -1)).toBe('one');
    expect(pluralCategory('fr', -2)).toBe('other');
  });
});

describe('translatePlural', () => {
  it('selects Romanian one, few and other forms', () => {
    expect(translatePlural(ro, 'ro', 'cards.count', 1)).toBe('1 card');
    expect(translatePlural(ro, 'ro', 'cards.count', 5)).toBe('5 carduri');
    expect(translatePlural(ro, 'ro', 'cards.count', 20)).toBe('20 de carduri');
    expect(translatePlural(ro, 'ro', 'cards.count', 0)).toBe('0 carduri');
    expect(translatePlural(ro, 'ro', 'cards.count', 101)).toBe('101 carduri');
    expect(translatePlural(ro, 'ro', 'cards.count', 120)).toBe('120 de carduri');
  });

  it('keeps English at one and other for every count', () => {
    expect(translatePlural(en, 'en', 'cards.count', 0)).toBe('0 cards');
    expect(translatePlural(en, 'en', 'cards.count', 101)).toBe('101 cards');
  });

  it('selects English one and other forms', () => {
    expect(translatePlural(en, 'en', 'cards.count', 1)).toBe('1 card');
    expect(translatePlural(en, 'en', 'cards.count', 2)).toBe('2 cards');
  });

  // No es / pt-BR / fr / de catalog yet, so these fall back to the English
  // leaves; the category each locale selects is asserted above.
  it.each(['es', 'de', 'pt-BR', 'fr'] as Locale[])(
    'resolves the %s one and other forms',
    (locale) => {
      expect(translatePlural(undefined, locale, 'cards.count', 1)).toBe('1 card');
      expect(translatePlural(undefined, locale, 'cards.count', 2)).toBe('2 cards');
    }
  );

  it('falls back to the raw key when the plural group is missing', () => {
    expect(translatePlural(en, 'en', 'cards.nope' as never, 2)).toBe('cards.nope_other');
  });
});
