/**
 * English catalog: the source of truth for every translatable UI string.
 * Keys are dotted namespaces; `TranslationKey` is derived from this object.
 */
export const en = {
  common: {
    appName: 'Sparkkeep',
    language: 'Language',
    loading: 'Loading…',
  },
  settings: {
    appearance: {
      language: 'Interface language',
      languageHint: 'Choose the language used across the interface.',
    },
  },
  cards: {
    empty: 'No sparks yet',
    count: '{{count}} cards',
  },
  research: {
    queued: 'Research queued for card #{{id}}',
  },
  triage: {
    title: 'Triage',
  },
  errors: {
    generic: 'Something went wrong.',
  },
  playbooks: {
    title: 'Playbooks',
  },
};
