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

export const STATUS_FILTER_OPTIONS: SelectOption<string>[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'inbox', label: '📥 Inbox' },
  { value: 'researching', label: '🔍 Researching' },
  { value: 'review', label: '👀 Review' },
  { value: 'to-do', label: '📝 To Do' },
  { value: 'in-progress', label: '⚡ In Progress' },
  { value: 'done', label: '✅ Done' },
  { value: 'shelved', label: '📦 Shelved' },
];

export const CARD_HORIZON_OPTIONS: SelectOption<'short-term' | 'medium-term' | 'long-term'>[] = [
  { value: 'short-term', label: '⚡ Short-term (Immediate action)' },
  { value: 'medium-term', label: '📅 Medium-term (Planned)' },
  { value: 'long-term', label: '🔭 Long-term (Vision)' },
];

export const CARD_STATUS_OPTIONS: SelectOption<'inbox' | 'researching' | 'review' | 'to-do' | 'in-progress' | 'done' | 'shelved' | 'dismissed'>[] = [
  { value: 'inbox', label: '📥 Inbox' },
  { value: 'researching', label: '🔍 Researching' },
  { value: 'review', label: '👀 Review' },
  { value: 'to-do', label: '📝 To Do' },
  { value: 'in-progress', label: '⚡ In Progress' },
  { value: 'done', label: '✅ Done' },
  { value: 'shelved', label: '📦 Shelved' },
  { value: 'dismissed', label: '🚫 Dismissed' },
];
