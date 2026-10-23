import type { TranslateFn, TranslationKey } from '../i18n';

export type CardEnumGroup =
  | 'extraction'
  | 'worthiness'
  | 'verdict'
  | 'confidence'
  | 'claimStatus'
  | 'researchStatus'
  | 'stepStatus'
  | 'stepKind'
  | 'stage'
  | 'origin';

/**
 * Translate a known backend enum value (e.g. `high`, `pursue`) and keep the raw
 * value when the catalog has no label for it, so new backend values still show.
 */
export function enumLabel(t: TranslateFn, group: CardEnumGroup, value?: string): string {
  const raw = value ?? '';
  const normalized = raw.toLowerCase();
  if (!normalized) return raw;
  const key = `cards.enums.${group}.${normalized}` as TranslationKey;
  const label = t(key);
  return label === key ? raw : label;
}

const STATUS_KEYS: Record<string, TranslationKey> = {
  inbox: 'cards.status.inbox',
  review: 'cards.status.review',
  'to-do': 'cards.status.toDo',
  'in-progress': 'cards.status.inProgress',
  done: 'cards.status.done',
  shelved: 'cards.status.shelved',
  dismissed: 'cards.status.dismissed',
};

/** Translate a known card status; unknown statuses stay raw instead of guessing. */
export function statusLabel(t: TranslateFn, status: string): string {
  const key = STATUS_KEYS[status];
  return key ? t(key) : status;
}
