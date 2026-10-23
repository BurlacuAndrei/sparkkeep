import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchCards, createCard, getErrorMessage, TOKEN_KEY } from './api';
import type { Card } from './types';
import { resetActiveLocale } from './i18n';
import { en } from './i18n/en';
import { translate } from './i18n/translate';

describe('api', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    resetActiveLocale();
  });

  describe('fetchCards', () => {
    it('fetches cards with default parameters and auth token', async () => {
      localStorage.setItem(TOKEN_KEY, 'test-token-123');
      const mockCards: Card[] = [
        {
          id: 1,
          title: 'Card 1',
          summary: 'Summary 1',
          source_url: 'https://example.com',
          source_note: '',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
          status: 'inbox',
          horizon: 'short-term',
          tags: [],
        },
      ];

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, cards: mockCards }),
      } as Response);

      const cards = await fetchCards();

      expect(fetchSpy).toHaveBeenCalledWith('/api/v1/cards?', {
        headers: {
          Authorization: 'Bearer test-token-123',
        },
      });
      expect(cards).toEqual(mockCards);
    });

    it('serializes all filter parameters into query string', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, cards: [] }),
      } as Response);

      await fetchCards({
        horizon: 'short-term',
        status: 'in-progress',
        tag: 'research',
        q: 'kubernetes',
        stale_days: 14,
        limit: 25,
        offset: 50,
      });

      expect(fetchSpy).toHaveBeenCalledTimes(1);
      const url = fetchSpy.mock.calls[0][0] as string;
      expect(url).toContain('/api/v1/cards?');
      expect(url).toContain('horizon=short-term');
      expect(url).toContain('status=in-progress');
      expect(url).toContain('tag=research');
      expect(url).toContain('q=kubernetes');
      expect(url).toContain('stale_days=14');
      expect(url).toContain('limit=25');
      expect(url).toContain('offset=50');
    });

    it('returns empty array if cards field is omitted in response', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true }),
      } as Response);

      const cards = await fetchCards();
      expect(cards).toEqual([]);
    });
  });

  describe('createCard', () => {
    it('sends POST request with JSON payload, headers, and authorization', async () => {
      localStorage.setItem(TOKEN_KEY, 'my-secret-key');
      const newCardInput: Partial<Card> = {
        title: 'New Idea',
        summary: 'Some summary',
        horizon: 'short-term',
      };
      const createdCard: Card = {
        id: 42,
        title: 'New Idea',
        summary: 'Some summary',
        source_url: '',
        source_note: '',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
        status: 'inbox',
        horizon: 'short-term',
        tags: [],
      };

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, data: createdCard }),
      } as Response);

      const result = await createCard(newCardInput);

      expect(fetchSpy).toHaveBeenCalledWith('/api/v1/cards', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer my-secret-key',
        },
        body: JSON.stringify(newCardInput),
      });
      expect(result).toEqual(createdCard);
    });
  });

  describe('error handling', () => {
    it('throws server error message when API returns error field', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ ok: false, error: 'Title is required' }),
      } as Response);

      await expect(createCard({})).rejects.toThrow('Title is required');
    });

    it('falls back to HTTP status when no error message provided', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({ ok: false }),
      } as Response);

      await expect(fetchCards()).rejects.toThrow('HTTP 502');
    });

    it('handles getErrorMessage for various error types', () => {
      const fallback = translate(en, 'errors.unexpected');
      expect(getErrorMessage(new Error('Network failure'))).toBe('Network failure');
      expect(getErrorMessage('Raw string error')).toBe('Raw string error');
      expect(getErrorMessage(null)).toBe(fallback);
      expect(getErrorMessage(undefined)).toBe(fallback);
      expect(getErrorMessage({ code: 500 })).toBe(fallback);
    });
  });
});
