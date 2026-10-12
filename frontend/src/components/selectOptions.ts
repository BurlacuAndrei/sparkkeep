import React from 'react';

export interface SelectOption<T extends string = string> {
  value: T;
  label: React.ReactNode;
  icon?: React.ReactNode;
  description?: string;
  badge?: React.ReactNode;
  disabled?: boolean;
}

export const HORIZON_FILTER_OPTIONS: SelectOption<string>[] = [
  { value: 'all', label: 'All Horizons' },
  { value: 'short-term', label: '⚡ Short-term (Actionable)' },
  { value: 'medium-term', label: '📅 Medium-term (Planned)' },
  { value: 'long-term', label: '🔭 Long-term (Vision)' },
];


export const CARD_HORIZON_OPTIONS: SelectOption<'short-term' | 'medium-term' | 'long-term'>[] = [
  { value: 'short-term', label: '⚡ Short-term (Immediate action)' },
  { value: 'medium-term', label: '📅 Medium-term (Planned)' },
  { value: 'long-term', label: '🔭 Long-term (Vision)' },
];

export const CARD_STATUS_OPTIONS: SelectOption<'inbox' | 'review' | 'to-do' | 'in-progress' | 'done' | 'shelved' | 'dismissed'>[] = [
  { value: 'inbox', label: '📥 Inbox' },
  { value: 'review', label: '👀 Review' },
  { value: 'to-do', label: '📝 To Do' },
  { value: 'in-progress', label: '⚡ In Progress' },
  { value: 'done', label: '✅ Done' },
  { value: 'shelved', label: '📦 Shelved' },
  { value: 'dismissed', label: '🚫 Dismissed' },
];

export const CARD_TYPE_OPTIONS: SelectOption<import('../types').CardType>[] = [
  { value: 'tool', label: '🛠️ Tool' },
  { value: 'repo', label: '📦 Repository' },
  { value: 'article', label: '📄 Article' },
  { value: 'idea', label: '💡 Idea' },
  { value: 'claim', label: '🎯 Claim' },
  { value: 'tutorial', label: '📚 Tutorial' },
  { value: 'product', label: '🚀 Product' },
  { value: 'collection', label: '📚 Collection' },
  { value: 'other', label: '📌 Other' },
];
