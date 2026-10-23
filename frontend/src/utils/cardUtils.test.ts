import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatRelativeAge, getPlatformInfo, extractHostname } from './cardUtils';
import { translate } from '../i18n';
import type { TranslateFn } from '../i18n';
import { ro } from '../i18n/ro';

const enT: TranslateFn = (key, vars) => translate(undefined, key, vars);
const roT: TranslateFn = (key, vars) => translate(ro, key, vars);

describe('cardUtils', () => {
  describe('formatRelativeAge', () => {
    const fixedNow = new Date('2026-06-15T12:00:00.000Z').getTime();

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(fixedNow);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns empty string for undefined or empty input', () => {
      expect(formatRelativeAge(undefined, enT)).toBe('');
      expect(formatRelativeAge('', enT)).toBe('');
    });

    it('returns empty string for invalid date format', () => {
      expect(formatRelativeAge('invalid-date-string', enT)).toBe('');
    });

    it('returns "now" for duration under 60 seconds', () => {
      const thirtySecondsAgo = new Date(fixedNow - 30 * 1000).toISOString();
      expect(formatRelativeAge(thirtySecondsAgo, enT)).toBe('now');
    });

    it('returns minute string for durations under 60 minutes', () => {
      const fiveMinutesAgo = new Date(fixedNow - 5 * 60 * 1000).toISOString();
      expect(formatRelativeAge(fiveMinutesAgo, enT)).toBe('5m');
      const fiftyNineMinutesAgo = new Date(fixedNow - 59 * 60 * 1000).toISOString();
      expect(formatRelativeAge(fiftyNineMinutesAgo, enT)).toBe('59m');
    });

    it('returns hour string for durations under 24 hours', () => {
      const oneHourAgo = new Date(fixedNow - 60 * 60 * 1000).toISOString();
      expect(formatRelativeAge(oneHourAgo, enT)).toBe('1h');
      const twentyHoursAgo = new Date(fixedNow - 20 * 60 * 60 * 1000).toISOString();
      expect(formatRelativeAge(twentyHoursAgo, enT)).toBe('20h');
    });

    it('returns day string for durations under 30 days', () => {
      const oneDayAgo = new Date(fixedNow - 24 * 60 * 60 * 1000).toISOString();
      expect(formatRelativeAge(oneDayAgo, enT)).toBe('1d');
      const twentyNineDaysAgo = new Date(fixedNow - 29 * 24 * 60 * 60 * 1000).toISOString();
      expect(formatRelativeAge(twentyNineDaysAgo, enT)).toBe('29d');
    });

    it('returns month string for durations 30 days or greater', () => {
      const thirtyDaysAgo = new Date(fixedNow - 30 * 24 * 60 * 60 * 1000).toISOString();
      expect(formatRelativeAge(thirtyDaysAgo, enT)).toBe('1mo');
      const ninetyDaysAgo = new Date(fixedNow - 90 * 24 * 60 * 60 * 1000).toISOString();
      expect(formatRelativeAge(ninetyDaysAgo, enT)).toBe('3mo');
    });

    it('renders Romanian age templates', () => {
      const oneHourAgo = new Date(fixedNow - 60 * 60 * 1000).toISOString();
      expect(formatRelativeAge(oneHourAgo, roT)).toBe('1 h');
      const twoDaysAgo = new Date(fixedNow - 2 * 24 * 60 * 60 * 1000).toISOString();
      expect(formatRelativeAge(twoDaysAgo, roT)).toBe('2 z');
      expect(formatRelativeAge(undefined, roT)).toBe('');
    });
  });

  describe('getPlatformInfo', () => {
    it('returns Web defaults when url is undefined or empty', () => {
      const undefinedInfo = getPlatformInfo(undefined);
      expect(undefinedInfo.name).toBe('Web');
      expect(undefinedInfo.color).toBe('var(--text-dim, #64748b)');
      expect(undefinedInfo.icon).toBeDefined();

      const emptyInfo = getPlatformInfo('');
      expect(emptyInfo.name).toBe('Web');
      expect(emptyInfo.color).toBe('var(--text-dim, #64748b)');
    });

    it('identifies YouTube URLs correctly', () => {
      expect(getPlatformInfo('https://www.youtube.com/watch?v=123').name).toBe('YouTube');
      expect(getPlatformInfo('https://www.youtube.com/watch?v=123').color).toBe('#ef4444');
      expect(getPlatformInfo('https://youtu.be/123').name).toBe('YouTube');
    });

    it('identifies Instagram URLs correctly', () => {
      const info = getPlatformInfo('https://instagram.com/p/abcdef');
      expect(info.name).toBe('Instagram');
      expect(info.color).toBe('#ec4899');
    });

    it('identifies Facebook URLs correctly', () => {
      expect(getPlatformInfo('https://facebook.com/watch').name).toBe('Facebook');
      expect(getPlatformInfo('https://facebook.com/watch').color).toBe('#3b82f6');
      expect(getPlatformInfo('https://fb.watch/xyz').name).toBe('Facebook');
    });

    it('identifies GitHub URLs correctly', () => {
      const info = getPlatformInfo('https://github.com/torvalds/linux');
      expect(info.name).toBe('GitHub');
      expect(info.color).toBe('var(--text-main, #334155)');
    });

    it('identifies X / Twitter URLs correctly', () => {
      expect(getPlatformInfo('https://twitter.com/user/status/1').name).toBe('X');
      expect(getPlatformInfo('https://twitter.com/user/status/1').color).toBe('#38bdf8');
      expect(getPlatformInfo('https://x.com/user/status/1').name).toBe('X');
    });

    it('identifies Telegram URLs correctly', () => {
      expect(getPlatformInfo('https://t.me/somechannel').name).toBe('Telegram');
      expect(getPlatformInfo('https://t.me/somechannel').color).toBe('#0ea5e9');
      expect(getPlatformInfo('https://telegram.me/somechannel').name).toBe('Telegram');
    });

    it('falls back to Web for unknown domains', () => {
      const info = getPlatformInfo('https://example.org/articles/deep-dive');
      expect(info.name).toBe('Web');
      expect(info.color).toBe('var(--text-dim, #64748b)');
    });
  });

  describe('extractHostname', () => {
    it('returns empty string for falsy or empty inputs', () => {
      expect(extractHostname(undefined)).toBe('');
      expect(extractHostname('')).toBe('');
      expect(extractHostname('   ')).toBe('');
    });

    it('extracts clean hostname from standard HTTP/HTTPS URLs', () => {
      expect(extractHostname('https://neon.tech/docs/architecture')).toBe('neon.tech');
      expect(extractHostname('http://arxiv.org/abs/2501.12948')).toBe('arxiv.org');
    });

    it('strips www prefix from hostnames', () => {
      expect(extractHostname('https://www.stripe.com/blog/agentic')).toBe('stripe.com');
      expect(extractHostname('http://www.github.com/torvalds')).toBe('github.com');
    });

    it('handles bare domains without protocol scheme', () => {
      expect(extractHostname('neon.tech/docs')).toBe('neon.tech');
      expect(extractHostname('sub.domain.org')).toBe('sub.domain.org');
    });
  });
});
