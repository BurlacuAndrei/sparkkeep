import React from 'react';
import type { TranslateFn, TranslationKey } from '../i18n';
import { cardTypeLabel } from '../utils/cardEnumLabels';

export interface SelectOption<T extends string = string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  description?: string;
  badge?: React.ReactNode;
  disabled?: boolean;
}

export const horizonFilterOptions = (t: TranslateFn): SelectOption<string>[] => [
  { value: 'all', label: t('cards.select.allHorizons') },
  { value: 'short-term', label: t('cards.select.horizonShort') },
  { value: 'medium-term', label: t('cards.select.horizonMedium') },
  { value: 'long-term', label: t('cards.select.horizonLong') },
];

export const cardHorizonOptions = (
  t: TranslateFn
): SelectOption<'short-term' | 'medium-term' | 'long-term'>[] => [
  { value: 'short-term', label: t('cards.select.cardHorizonShort') },
  { value: 'medium-term', label: t('cards.select.cardHorizonMedium') },
  { value: 'long-term', label: t('cards.select.cardHorizonLong') },
];

export const cardStatusOptions = (
  t: TranslateFn
): SelectOption<'inbox' | 'review' | 'to-do' | 'in-progress' | 'done' | 'shelved' | 'dismissed'>[] => [
  { value: 'inbox', label: t('cards.select.statusInbox') },
  { value: 'review', label: t('cards.select.statusReview') },
  { value: 'to-do', label: t('cards.select.statusToDo') },
  { value: 'in-progress', label: t('cards.select.statusInProgress') },
  { value: 'done', label: t('cards.select.statusDone') },
  { value: 'shelved', label: t('cards.select.statusShelved') },
  { value: 'dismissed', label: t('cards.select.statusDismissed') },
];

export const cardTypeOptions = (
  t: TranslateFn,
  extraTypes: string[] = []
): SelectOption<import('../types').CardType>[] => {
  const canonicalValues: Array<{ value: import('../types').CanonicalCardType; key: TranslationKey }> = [
    { value: 'tool', key: 'cards.select.typeTool' },
    { value: 'repo', key: 'cards.select.typeRepo' },
    { value: 'article', key: 'cards.select.typeArticle' },
    { value: 'video', key: 'cards.select.typeVideo' },
    { value: 'book', key: 'cards.select.typeBook' },
    { value: 'guide', key: 'cards.select.typeGuide' },
    { value: 'product', key: 'cards.select.typeProduct' },
    { value: 'place', key: 'cards.select.typePlace' },
    { value: 'idea', key: 'cards.select.typeIdea' },
    { value: 'quote', key: 'cards.select.typeQuote' },
    { value: 'paper', key: 'cards.select.typePaper' },
    { value: 'company', key: 'cards.select.typeCompany' },
    { value: 'claim', key: 'cards.select.typeClaim' },
    { value: 'tutorial', key: 'cards.select.typeTutorial' },
    { value: 'collection', key: 'cards.select.typeCollection' },
    { value: 'other', key: 'cards.select.typeOther' },
  ];

  const options: SelectOption<import('../types').CardType>[] = canonicalValues.map(({ value, key }) => ({
    value,
    label: t(key),
  }));

  const existing = new Set<string>(canonicalValues.map((v) => v.value));
  for (const extra of extraTypes) {
    if (extra && !existing.has(extra)) {
      existing.add(extra);
      options.push({
        value: extra,
        label: cardTypeLabel(t, extra),
      });
    }
  }

  return options;
};
