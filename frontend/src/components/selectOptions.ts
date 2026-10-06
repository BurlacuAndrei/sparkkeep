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
  { value: 'lifetime', label: '🌟 Lifetime (Bucket list)' },
];

export const STATUS_FILTER_OPTIONS: SelectOption<string>[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'inbox', label: '📥 Inbox' },
  { value: 'doing', label: '⚡ Doing' },
  { value: 'done', label: '✅ Done' },
  { value: 'shelved', label: '📦 Shelved' },
  { value: 'dismissed', label: '🚫 Dismissed' },
];

export const CARD_HORIZON_OPTIONS: SelectOption<'short-term' | 'medium-term' | 'long-term' | 'lifetime'>[] = [
  { value: 'short-term', label: '⚡ Short-term (Immediate action)' },
  { value: 'medium-term', label: '📅 Medium-term (Planned)' },
  { value: 'long-term', label: '🔭 Long-term (Vision)' },
  { value: 'lifetime', label: '🌟 Lifetime (Bucket list / vision)' },
];

export const CARD_STATUS_OPTIONS: SelectOption<'inbox' | 'doing' | 'done' | 'shelved' | 'dismissed'>[] = [
  { value: 'inbox', label: '📥 Inbox' },
  { value: 'doing', label: '⚡ Doing' },
  { value: 'done', label: '✅ Done' },
  { value: 'shelved', label: '📦 Shelved' },
  { value: 'dismissed', label: '🚫 Dismissed' },
];
