import React from 'react';
import type { TranslateFn } from '../i18n';

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

export const cardTypeOptions = (t: TranslateFn): SelectOption<import('../types').CardType>[] => [
  { value: 'tool', label: t('cards.select.typeTool') },
  { value: 'repo', label: t('cards.select.typeRepo') },
  { value: 'article', label: t('cards.select.typeArticle') },
  { value: 'idea', label: t('cards.select.typeIdea') },
  { value: 'claim', label: t('cards.select.typeClaim') },
  { value: 'tutorial', label: t('cards.select.typeTutorial') },
  { value: 'product', label: t('cards.select.typeProduct') },
  { value: 'collection', label: t('cards.select.typeCollection') },
  { value: 'other', label: t('cards.select.typeOther') },
];
