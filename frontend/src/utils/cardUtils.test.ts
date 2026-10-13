import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatRelativeAge, getPlatformInfo } from './cardUtils';

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
      expect(formatRelativeAge(undefined)).toBe('');
      expect(formatRelativeAge('')).toBe('');
    });

    it('returns empty string for invalid date format', () => {
      expect(formatRelativeAge('invalid-date-string')).toBe('');
    });

    it('returns "now" for duration under 60 seconds', () => {
      const thirtySecondsAgo = new Date(fixedNow - 30 * 1000).toISOString();
      expect(formatRelativeAge(thirtySecondsAgo)).toBe('now');
    });

    it('returns minute string for durations under 60 minutes', () => {
      const fiveMinutesAgo = new Date(fixedNow - 5 * 60 * 1000).toISOString();
      expect(formatRelativeAge(fiveMinutesAgo)).toBe('5m');
      const fiftyNineMinutesAgo = new Date(fixedNow - 59 * 60 * 1000).toISOString();
      expect(formatRelativeAge(fiftyNineMinutesAgo)).toBe('59m');
    });

    it('returns hour string for durations under 24 hours', () => {
      const oneHourAgo = new Date(fixedNow - 60 * 60 * 1000).toISOString();
      expect(formatRelativeAge(oneHourAgo)).toBe('1h');
      const twentyHoursAgo = new Date(fixedNow - 20 * 60 * 60 * 1000).toISOString();
      expect(formatRelativeAge(twentyHoursAgo)).toBe('20h');
    });

    it('returns day string for durations under 30 days', () => {
      const oneDayAgo = new Date(fixedNow - 24 * 60 * 60 * 1000).toISOString();
      expect(formatRelativeAge(oneDayAgo)).toBe('1d');
      const twentyNineDaysAgo = new Date(fixedNow - 29 * 24 * 60 * 60 * 1000).toISOString();
      expect(formatRelativeAge(twentyNineDaysAgo)).toBe('29d');
    });

    it('returns month string for durations 30 days or greater', () => {
      const thirtyDaysAgo = new Date(fixedNow - 30 * 24 * 60 * 60 * 1000).toISOString();
      expect(formatRelativeAge(thirtyDaysAgo)).toBe('1mo');
      const ninetyDaysAgo = new Date(fixedNow - 90 * 24 * 60 * 60 * 1000).toISOString();
      expect(formatRelativeAge(ninetyDaysAgo)).toBe('3mo');
    });
  });

  describe('getPlatformInfo', () => {
    it('returns Web defaults when url is undefined or empty', () => {
      const undefinedInfo = getPlatformInfo(undefined);
      expect(undefinedInfo.name).toBe('Web');
      expect(undefinedInfo.color).toBe('#94a3b8');
      expect(undefinedInfo.icon).toBeDefined();

      const emptyInfo = getPlatformInfo('');
      expect(emptyInfo.name).toBe('Web');
      expect(emptyInfo.color).toBe('#94a3b8');
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
      expect(info.color).toBe('#cbd5e1');
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
      expect(info.color).toBe('#94a3b8');
    });
  });
});
