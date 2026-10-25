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

export const CANONICAL_CARD_TYPES = [
  'article',
  'video',
  'book',
  'guide',
  'product',
  'place',
  'idea',
  'quote',
  'tool',
  'repo',
  'paper',
  'company',
  'claim',
  'tutorial',
  'collection',
] as const;

export type CanonicalCardType = (typeof CANONICAL_CARD_TYPES)[number];

const CARD_TYPE_ALIASES: Record<string, string> = {
  // article
  article: 'article', articol: 'article', articulo: 'article', artigo: 'article', artikel: 'article',
  // video
  video: 'video',
  // book
  book: 'book', carte: 'book', libro: 'book', livro: 'book', livre: 'book', buch: 'book',
  // guide
  guide: 'guide', ghid: 'guide', guia: 'guide', leitfaden: 'guide',
  // product
  product: 'product', produs: 'product', producto: 'product', produto: 'product', produit: 'product', produkt: 'product',
  // place
  place: 'place', loc: 'place', lugar: 'place', lieu: 'place', ort: 'place',
  // idea
  idea: 'idea', idee: 'idea', ideia: 'idea',
  // quote
  quote: 'quote', citat: 'quote', cita: 'quote', citacao: 'quote', citation: 'quote', zitat: 'quote',
  // tool
  tool: 'tool', tools: 'tool', instrument: 'tool', herramienta: 'tool', ferramenta: 'tool', outil: 'tool', werkzeug: 'tool',
  // repo
  repo: 'repo', repository: 'repo', depozit: 'repo', repositorio: 'repo', depot: 'repo',
  // paper
  paper: 'paper', lucrare: 'paper', 'articulo cientifico': 'paper', 'artigo cientifico': 'paper', publication: 'paper', facharbeit: 'paper',
  // company
  company: 'company', companie: 'company', empresa: 'company', entreprise: 'company', unternehmen: 'company',
  // claim
  claim: 'claim', afirmatie: 'claim', afirmacion: 'claim', afirmacao: 'claim', behauptung: 'claim',
  // tutorial
  tutorial: 'tutorial', tutoriel: 'tutorial',
  // collection
  collection: 'collection', colectie: 'collection', coleccion: 'collection', colecao: 'collection', sammlung: 'collection',
  // other
  other: 'other', altul: 'other', otro: 'other', outro: 'other', autre: 'other', sonstiges: 'other',
};

export function resolveCardTypeAlias(input: string): string {
  const norm = input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  return CARD_TYPE_ALIASES[norm] || input.trim().toLowerCase();
}

export function cardTypeLabel(t: TranslateFn, type?: string): string {
  if (!type) return '';
  const slug = type.toLowerCase().trim();
  const key = `cards.types.${slug}` as TranslationKey;
  const label = t(key);
  if (label && label !== key) {
    return label;
  }
  return type;
}

export { horizonLabel } from './triage';
