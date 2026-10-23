import type { Catalog } from './types';

/**
 * Romanian catalog. `satisfies Catalog` pins the shape to the English catalog,
 * so a missing or extra key is a compile-time error.
 */
export const ro = {
  common: {
    appName: 'Sparkkeep',
    language: 'Limbă',
    loading: 'Se încarcă…',
  },
  settings: {
    appearance: {
      language: 'Limba interfeței',
      languageHint: 'Alege limba folosită în întreaga interfață.',
    },
  },
  cards: {
    empty: 'Încă nicio scânteie',
    // shortcut: one plural form for all counts; swap for a plural helper when a
    // locale with richer plural rules than Romanian/English is added.
    count: '{{count}} carduri',
  },
  research: {
    queued: 'Cercetare programată pentru cardul #{{id}}',
  },
  triage: {
    title: 'Triaj',
  },
  errors: {
    generic: 'Ceva nu a funcționat.',
  },
  playbooks: {
    title: 'Manuale',
  },
} satisfies Catalog;
