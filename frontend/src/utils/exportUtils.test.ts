import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isClipboardAvailable, downloadMarkdown } from './exportUtils';

describe('exportUtils', () => {
  describe('isClipboardAvailable', () => {
    afterEach(() => {
      delete (navigator as unknown as Record<string, unknown>).clipboard;
      setSecureContext(true);
    });

    function setClipboard(present: boolean) {
      Object.defineProperty(navigator, 'clipboard', {
        value: present ? { writeText: vi.fn() } : undefined,
        configurable: true,
      });
    }

    function setSecureContext(value: boolean | undefined) {
      Object.defineProperty(window, 'isSecureContext', { value, configurable: true });
    }

    it('returns true in a secure context when clipboard exists', () => {
      setClipboard(true);
      setSecureContext(true);
      expect(isClipboardAvailable()).toBe(true);
    });

    it('returns false in an insecure context even when clipboard exists', () => {
      setClipboard(true);
      setSecureContext(false);
      expect(isClipboardAvailable()).toBe(false);
    });

    it('returns false when clipboard is absent', () => {
      setClipboard(false);
      setSecureContext(true);
      expect(isClipboardAvailable()).toBe(false);
    });

    it('returns false when isSecureContext is undefined', () => {
      setClipboard(true);
      setSecureContext(undefined);
      expect(isClipboardAvailable()).toBe(false);
    });
  });

  describe('downloadMarkdown', () => {
    let createObjectURL: ReturnType<typeof vi.spyOn>;
    let revokeObjectURL: ReturnType<typeof vi.spyOn>;
    let clickedAnchor: HTMLAnchorElement | null;

    beforeEach(() => {
      vi.useFakeTimers();
      createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
      revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL');
      clickedAnchor = null;
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
        clickedAnchor = document.querySelector('a[download]') as HTMLAnchorElement | null;
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    it('clicks a temporary anchor with the supplied filename and revokes the URL', async () => {
      downloadMarkdown('# Title', 'card.md');

      expect(createObjectURL).toHaveBeenCalledTimes(1);
      const blob = createObjectURL.mock.calls[0][0] as Blob;
      expect(blob).toBeInstanceOf(Blob);
      expect(await blob.text()).toBe('# Title');
      expect(blob.type).toBe('text/markdown;charset=utf-8');

      expect(clickedAnchor).not.toBeNull();
      expect(clickedAnchor?.download).toBe('card.md');
      expect(clickedAnchor?.href).toBe('blob:mock-url');
      expect(document.body.contains(clickedAnchor)).toBe(false);

      expect(revokeObjectURL).not.toHaveBeenCalled();
      vi.runAllTimers();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });

    it('revokes the URL and detaches the anchor when click throws', () => {
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
        throw new Error('click failed');
      });
      const appended = vi.spyOn(document.body, 'appendChild');

      expect(() => downloadMarkdown('# Title', 'card.md')).toThrow('click failed');

      const anchor = appended.mock.calls[0][0] as HTMLAnchorElement;
      expect(anchor.isConnected).toBe(false);
      vi.runAllTimers();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });
  });
});
